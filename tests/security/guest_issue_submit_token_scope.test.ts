/**
 * A guest issue submit only creates a new issue thread, and the guest token it
 * returns names only the issue and conversation that submit created.
 *
 * The caller chooses `github_number` or `local_issue_id`, and those decide the
 * issue's identity and its thread's conversation id. A submit whose identifier
 * already identifies a stored issue or issue thread is refused with
 * `400 ERR_ISSUE_IDENTITY_IN_USE` before anything is written: the existing
 * issue and thread are left unchanged, no entity is created and no token is
 * returned.
 *
 * Drives the real request path over a live server: POST /issues/submit, with
 * no credential, with a guest token as `access_token`, and as a Bearer header.
 * The last block drives the forwarding client (`submitIssueToRemote`, used by
 * MCP / CLI `submit_issue` when `issues.target_url` is set) against the same
 * server, in its own call shape.
 */
import { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../src/actions.js";
import { createOperations, type StoreResult } from "../../src/core/operations.js";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import {
  generateGuestAccessToken,
  validateGuestAccessToken,
} from "../../src/services/guest_access_token.js";
import { loadIssuesConfig } from "../../src/services/issues/config.js";
import {
  githubIssueThreadConversationId,
  localIssueThreadConversationId,
} from "../../src/services/issues/github_issue_thread.js";
import {
  ERR_ISSUE_IDENTITY_IN_USE,
  ISSUE_IDENTITY_IN_USE_HINT,
  submitIssue,
} from "../../src/services/issues/issue_operations.js";
import { submitIssueToRemote } from "../../src/services/issues/neotoma_client.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { structuredEntities } from "../../src/services/submitted_thread/submitted_thread.js";

const OWNER = LOCAL_DEV_USER_ID;
const ISSUE_THREAD_TYPES = ["issue", "conversation", "conversation_message"];

let baseUrl: string;
let server: ReturnType<typeof app.listen>;
let repo: string;

type GuestSubmitResponse = {
  issue_entity_id: string;
  conversation_id: string;
  guest_access_token: string;
};

type SubmitResponse = {
  status: number;
  body: Partial<GuestSubmitResponse> & Record<string, unknown>;
};

type Credential = "none" | "access_token" | "bearer";

beforeAll(async () => {
  repo = (await loadIssuesConfig()).repo;
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** A number no other test run is likely to have used. */
function freshGithubNumber(): number {
  return 900_000_000 + Math.floor(Math.random() * 90_000_000);
}

function freshLocalIssueId(label: string): string {
  return `local:${repo}:${label}-${randomUUID()}`;
}

/**
 * Store an issue thread as the instance owner, the way the owner path shapes
 * it. With `github_number` and a `github_url` this is the shape an issue
 * synced from GitHub takes.
 */
async function storeOwnerIssue(
  identity: { github_number: number } | { local_issue_id: string },
  options: { issue?: boolean } = {}
): Promise<{ issueId: string; conversationId: string }> {
  const ops = createOperations({ server: new NeotomaServer(), userId: OWNER });
  try {
    const ghNum = "github_number" in identity ? identity.github_number : 0;
    const localId = "local_issue_id" in identity ? identity.local_issue_id : undefined;
    const threadConversationId =
      ghNum > 0
        ? githubIssueThreadConversationId(repo, ghNum)
        : localIssueThreadConversationId(repo, localId ?? "");
    const conversation = {
      entity_type: "conversation",
      title: "Owner issue thread",
      thread_kind: "multi_party",
      conversation_id: threadConversationId,
    };
    if (options.issue === false) {
      const result = (await ops.store({
        entities: [conversation],
        idempotency_key: `owner-thread-${randomUUID()}`,
      })) as StoreResult;
      const ids = structuredEntities(result).map((e) => e.entity_id ?? "");
      expect(ids[0]).toBeTruthy();
      return { issueId: "", conversationId: ids[0]! };
    }
    const result = (await ops.store({
      entities: [
        {
          entity_type: "issue",
          title: "Owner issue",
          body: "Owner-only issue body",
          status: "open",
          labels: [],
          visibility: "private",
          github_url: ghNum > 0 ? `https://github.com/${repo}/issues/${ghNum}` : "",
          github_number: ghNum > 0 ? ghNum : null,
          repo,
          ...(localId ? { local_issue_id: localId } : {}),
          author: "owner",
          created_at: new Date().toISOString(),
        },
        conversation,
      ],
      relationships: [{ relationship_type: "REFERS_TO", source_index: 0, target_index: 1 }],
      idempotency_key: `owner-issue-${randomUUID()}`,
    })) as StoreResult;
    const ids = structuredEntities(result).map((e) => e.entity_id ?? "");
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBeTruthy();
    return { issueId: ids[0]!, conversationId: ids[1]! };
  } finally {
    await ops.dispose();
  }
}

async function issueTitle(issueId: string): Promise<unknown> {
  const ops = createOperations({ server: new NeotomaServer(), userId: OWNER });
  try {
    const raw = (await ops.retrieveEntitySnapshot({ entity_id: issueId, format: "json" })) as {
      snapshot?: Record<string, unknown>;
    } | null;
    return raw?.snapshot?.title;
  } finally {
    await ops.dispose();
  }
}

/** A guest token owned by the storage owner, for the credentialed variants. */
async function ownerGuestToken(): Promise<string> {
  return generateGuestAccessToken({
    entityIds: [`ent_probe_${randomUUID().replace(/-/g, "").slice(0, 16)}`],
    userId: OWNER,
  });
}

async function guestSubmit(
  extra: Record<string, unknown>,
  credential: Credential = "none"
): Promise<SubmitResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let query = "";
  if (credential !== "none") {
    const token = await ownerGuestToken();
    if (credential === "bearer") headers.Authorization = `Bearer ${token}`;
    else query = `?access_token=${encodeURIComponent(token)}`;
  }
  const res = await fetch(`${baseUrl}/issues/submit${query}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: `Guest issue ${randomUUID()}`,
      body: "Guest issue body",
      visibility: "private",
      reporter_app_version: "0.0.0-test",
      ...extra,
    }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function tokenEntityIds(token: string): Promise<string[]> {
  const grant = await validateGuestAccessToken(token);
  expect(grant).not.toBeNull();
  return [...(grant?.entity_ids ?? [])];
}

async function rowCount(
  table: "entities" | "observations",
  column: string,
  value: string
): Promise<number> {
  const query = db.from(table).select("id").eq(column, value);
  const { data, error } =
    table === "entities" ? await query.in("entity_type", ISSUE_THREAD_TYPES) : await query;
  expect(error).toBeFalsy();
  return ((data as unknown[] | null) ?? []).length;
}

/** What a refused submit must leave exactly as it was. */
async function writeState(existing: { issueId: string; conversationId: string }): Promise<{
  ownerIssueThreadEntities: number;
  issueObservations: number;
  conversationObservations: number;
}> {
  return {
    ownerIssueThreadEntities: await rowCount("entities", "user_id", OWNER),
    issueObservations: existing.issueId
      ? await rowCount("observations", "entity_id", existing.issueId)
      : 0,
    conversationObservations: await rowCount("observations", "entity_id", existing.conversationId),
  };
}

/**
 * The exact refusal: 400 with ERR_ISSUE_IDENTITY_IN_USE and the client note,
 * no token and no entity ids in the body, and nothing written.
 */
async function expectRefusedWithoutWrite(
  submit: () => Promise<SubmitResponse>,
  existing: { issueId: string; conversationId: string; title?: string },
  expected: { identityField: "github_number" | "local_issue_id"; entityType: string }
): Promise<void> {
  const before = await writeState(existing);
  const response = await submit();
  expect(response.status).toBe(400);
  expect(response.body.error_code).toBe(ERR_ISSUE_IDENTITY_IN_USE);
  const details = response.body.details as Record<string, unknown> | undefined;
  expect(details?.hint).toBe(ISSUE_IDENTITY_IN_USE_HINT);
  expect(details?.extra).toEqual({
    identity_field: expected.identityField,
    entity_type: expected.entityType,
  });
  expect(response.body.guest_access_token).toBeUndefined();
  expect(response.body.issue_entity_id).toBeUndefined();
  expect(response.body.conversation_id).toBeUndefined();
  expect(await writeState(existing)).toEqual(before);
  if (existing.issueId && existing.title !== undefined) {
    expect(await issueTitle(existing.issueId)).toBe(existing.title);
  }
}

function created(response: SubmitResponse): { issueId: string; conversationId: string } {
  expect(response.status).toBe(200);
  return {
    issueId: response.body.issue_entity_id as string,
    conversationId: response.body.conversation_id as string,
  };
}

describe("guest issue submit: a new identifier creates a new issue thread", () => {
  it("a plain guest submit gets a token for its own new issue and thread", async () => {
    const res = await guestSubmit({});
    expect(res.status).toBe(200);
    const named = await tokenEntityIds(res.body.guest_access_token as string);
    expect(named).toEqual(
      expect.arrayContaining([res.body.issue_entity_id, res.body.conversation_id])
    );
  });
});

describe("guest issue submit: the storage owner's identifiers are refused", () => {
  const credentials: Credential[] = ["none", "access_token", "bearer"];

  for (const credential of credentials) {
    it(`an owner issue's github_number is refused (credential: ${credential})`, async () => {
      const githubNumber = freshGithubNumber();
      const owner = await storeOwnerIssue({ github_number: githubNumber });
      await expectRefusedWithoutWrite(
        () => guestSubmit({ github_number: githubNumber }, credential),
        { ...owner, title: "Owner issue" },
        { identityField: "github_number", entityType: "issue" }
      );
    });

    it(`an owner issue's local_issue_id is refused (credential: ${credential})`, async () => {
      const localIssueId = freshLocalIssueId("owner");
      const owner = await storeOwnerIssue({ local_issue_id: localIssueId });
      await expectRefusedWithoutWrite(
        () => guestSubmit({ local_issue_id: localIssueId }, credential),
        { ...owner, title: "Owner issue" },
        { identityField: "local_issue_id", entityType: "issue" }
      );
    });
  }

  it("a synced issue's github_number is refused even with a fresh local_issue_id", async () => {
    // github_number takes precedence over local_issue_id, so a new
    // local_issue_id does not change the identity of a synced issue.
    const githubNumber = freshGithubNumber();
    const synced = await storeOwnerIssue({ github_number: githubNumber });
    await expectRefusedWithoutWrite(
      () =>
        guestSubmit({
          github_number: githubNumber,
          github_url: `https://github.com/${repo}/issues/${githubNumber}`,
          local_issue_id: freshLocalIssueId("fresh"),
        }),
      { ...synced, title: "Owner issue" },
      { identityField: "github_number", entityType: "issue" }
    );
  });

  it("an identifier whose thread exists without its issue is refused", async () => {
    const localIssueId = freshLocalIssueId("thread-only");
    const thread = await storeOwnerIssue({ local_issue_id: localIssueId }, { issue: false });
    await expectRefusedWithoutWrite(() => guestSubmit({ local_issue_id: localIssueId }), thread, {
      identityField: "local_issue_id",
      entityType: "conversation",
    });
  });
});

describe("guest issue submit: another guest's identifiers are refused", () => {
  it("another guest's local_issue_id is refused", async () => {
    const localIssueId = freshLocalIssueId("guest");
    const first = created(await guestSubmit({ local_issue_id: localIssueId }));
    await expectRefusedWithoutWrite(() => guestSubmit({ local_issue_id: localIssueId }), first, {
      identityField: "local_issue_id",
      entityType: "issue",
    });
  });

  it("another guest's github_number is refused", async () => {
    const githubNumber = freshGithubNumber();
    const first = created(await guestSubmit({ github_number: githubNumber }));
    await expectRefusedWithoutWrite(() => guestSubmit({ github_number: githubNumber }), first, {
      identityField: "github_number",
      entityType: "issue",
    });
  });

  it("an exact repeat of a successful submit is refused (a retry after a lost response)", async () => {
    // Same identity, title, body and timestamp: the same store idempotency key
    // and the same content, so a store replay would answer the first result.
    // A submitter retrying after a lost response sends exactly this.
    const title = `Guest issue ${randomUUID()}`;
    const payload = {
      title,
      local_issue_id: freshLocalIssueId("repeat"),
      submission_timestamp: "2026-01-01T00:00:00.000Z",
    };
    const first = { ...created(await guestSubmit(payload)), title };
    await expectRefusedWithoutWrite(() => guestSubmit(payload), first, {
      identityField: "local_issue_id",
      entityType: "issue",
    });
  });
});

describe("guest issue submit: the forwarding client's call shape", () => {
  async function withForwardingTarget<T>(run: () => Promise<T>): Promise<T> {
    const saved = {
      target: process.env.NEOTOMA_ISSUES_TARGET_URL,
      aauth: process.env.NEOTOMA_CLI_AAUTH_DISABLE,
    };
    process.env.NEOTOMA_ISSUES_TARGET_URL = baseUrl;
    process.env.NEOTOMA_CLI_AAUTH_DISABLE = "1";
    try {
      return await run();
    } finally {
      for (const [key, value] of [
        ["NEOTOMA_ISSUES_TARGET_URL", saved.target],
        ["NEOTOMA_CLI_AAUTH_DISABLE", saved.aauth],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  it("a forwarded submit that repeats a fixed local_issue_id is refused on the second call", async () => {
    await withForwardingTarget(async () => {
      const params = {
        title: `Forwarded issue ${randomUUID()}`,
        body: "Forwarded issue body",
        visibility: "private" as const,
        author: "local",
        local_issue_id: freshLocalIssueId("forwarded"),
        submission_timestamp: "2026-01-01T00:00:00.000Z",
        reporterAppVersion: "0.0.0-test",
      };
      const first = await submitIssueToRemote(params);
      expect(first.issue_entity_id).toBeTruthy();
      expect(first.access_token).toBeTruthy();
      const before = await writeState({
        issueId: first.issue_entity_id,
        conversationId: first.conversation_id,
      });
      await expect(submitIssueToRemote(params)).rejects.toThrow(ERR_ISSUE_IDENTITY_IN_USE);
      expect(
        await writeState({ issueId: first.issue_entity_id, conversationId: first.conversation_id })
      ).toEqual(before);
    });
  });

  it("submit_issue's own flow derives a new local_issue_id per call and is not refused", async () => {
    await withForwardingTarget(async () => {
      const ops = createOperations({ server: new NeotomaServer(), userId: OWNER });
      try {
        const title = `Reporter flow issue ${randomUUID()}`;
        const results = [];
        for (let i = 0; i < 2; i++) {
          results.push(
            await submitIssue(ops, {
              title,
              body: "Reporter flow body",
              visibility: "private",
              reporter_app_version: "0.0.0-test",
            })
          );
          // localIssueId hashes the timestamp; keep the two calls apart.
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        for (const result of results) {
          expect(result.remote_submission_error).toBeNull();
          expect(result.submitted_to_neotoma).toBe(true);
        }
        expect(results[0]!.remote_entity_id).toBeTruthy();
        expect(results[1]!.remote_entity_id).not.toBe(results[0]!.remote_entity_id);
      } finally {
        await ops.dispose();
      }
    });
  });
});
