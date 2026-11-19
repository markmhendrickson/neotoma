/**
 * Regression test for #1948: page-scoped guest_access_token was overridden by
 * the type-level access policy, so `publish_rendered_page` minted a token and
 * reported `created: true` on a `share_url` that 403'd for its entire TTL
 * whenever the `rendered_page` type policy was `closed`.
 *
 * `resolveGuestScopedEntityAccess` (src/actions.ts) checked the type-level
 * policy and threw before ever reaching the entity-scoped `tokenGrantsAccessTo`
 * check, which was reachable only when `decision.scopeFilter === "submitter_only"`.
 * Fix: an entity-scoped, valid, unexpired token that names the requested
 * entityId now short-circuits the type-level policy for that entity only,
 * before the policy is evaluated at all.
 *
 * This test drives the actual request path a guest browser hits — a real,
 * unauthenticated HTTP GET against `/entities/:id/html?access_token=...` over
 * a live server — not just a unit-level assertion that the resolver function
 * doesn't throw. Asserting only the latter is exactly how the original bug
 * shipped with passing adjacent unit coverage.
 */

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import {
  generateGuestAccessToken,
  hashGuestAccessToken,
} from "../../src/services/guest_access_token.js";
import { resetAccessPolicy, setAccessPolicy } from "../../src/services/access_policy.js";
import { recomputeSnapshot } from "../../src/services/snapshot_computation.js";

/**
 * generateGuestAccessToken always uses the server-configured TTL, so an
 * already-expired token is produced directly (mirroring its own persistence
 * shape) with a backdated `created_at` rather than through the public API.
 */
async function createExpiredGuestAccessToken(params: {
  entityIds: string[];
  userId: string;
}): Promise<string> {
  const token = randomUUID();
  const tokenHash = hashGuestAccessToken(token);
  const tokenEntityId = `guest_token_${tokenHash.slice(0, 16)}`;
  const longAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  await db.from("entities").insert({
    id: tokenEntityId,
    entity_type: "guest_access_token",
    canonical_name: `guest_access_token:${tokenHash.slice(0, 12)}`,
    user_id: params.userId,
    created_at: longAgo,
    updated_at: longAgo,
  });
  await db.from("observations").insert({
    id: randomUUID(),
    entity_id: tokenEntityId,
    entity_type: "guest_access_token",
    user_id: params.userId,
    fields: {
      token_hash: tokenHash,
      entity_ids: params.entityIds,
      thumbprint: null,
      created_at: longAgo,
      ttl_seconds: 60,
      revoked_at: null,
    },
    observed_at: longAgo,
    source_priority: 100,
  });
  return token;
}

const TEST_USER_ID = "00000000-0000-0000-0000-000000000042";
const API_PORT = 18127;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

async function createRenderedPage(params: {
  title: string;
  htmlBody: string;
  userId: string;
}): Promise<string> {
  const entityId = `ent_rp_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const now = new Date().toISOString();
  await db.from("entities").insert({
    id: entityId,
    entity_type: "rendered_page",
    canonical_name: `${params.title}-${entityId}`,
    user_id: params.userId,
    created_at: now,
    updated_at: now,
  });
  await db.from("observations").insert({
    entity_id: entityId,
    entity_type: "rendered_page",
    user_id: params.userId,
    fields: { title: params.title, html_body: params.htmlBody },
    observed_at: now,
    source_priority: 0,
  });
  await recomputeSnapshot(entityId, params.userId);
  return entityId;
}

async function createPlainEntity(userId: string, text: string): Promise<string> {
  const entityId = `ent_note_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const now = new Date().toISOString();
  await db.from("entities").insert({
    id: entityId,
    entity_type: "note",
    canonical_name: `${text}-${entityId}`,
    user_id: userId,
    created_at: now,
    updated_at: now,
  });
  await db.from("observations").insert({
    entity_id: entityId,
    entity_type: "note",
    user_id: userId,
    fields: { title: text },
    observed_at: now,
    source_priority: 0,
  });
  await recomputeSnapshot(entityId, userId);
  return entityId;
}

async function linkEntities(source: string, target: string, userId: string): Promise<string> {
  const key = `REFERS_TO:${source}:${target}`;
  await db.from("relationship_snapshots").upsert({
    relationship_key: key,
    relationship_type: "REFERS_TO",
    source_entity_id: source,
    target_entity_id: target,
    schema_version: "1.0",
    snapshot: {},
    computed_at: new Date().toISOString(),
    observation_count: 1,
    last_observation_at: new Date().toISOString(),
    provenance: { reducer_field: "obs" },
    user_id: userId,
  });
  return key;
}

async function cleanupEntities(entityIds: string[]): Promise<void> {
  for (const id of entityIds) {
    await db.from("observations").delete().eq("entity_id", id);
    await db.from("entity_snapshots").delete().eq("entity_id", id);
    await db.from("relationship_snapshots").delete().eq("source_entity_id", id);
    await db.from("entities").delete().eq("id", id);
  }
}

async function cleanupTokens(tokens: string[]): Promise<void> {
  for (const token of tokens) {
    const tokenEntityId = `guest_token_${hashGuestAccessToken(token).slice(0, 16)}`;
    await db.from("observations").delete().eq("entity_id", tokenEntityId);
    await db.from("entities").delete().eq("id", tokenEntityId);
  }
}

describe("guest_access_token precedence over closed type-level policy (#1948)", () => {
  let httpServer: ReturnType<typeof createServer>;
  const createdEntityIds: string[] = [];
  const createdTokens: string[] = [];

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
    await setAccessPolicy("rendered_page", "closed");
  });

  afterAll(async () => {
    await resetAccessPolicy("rendered_page");
    await cleanupTokens(createdTokens);
    await cleanupEntities(createdEntityIds);
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  afterEach(async () => {
    createdEntityIds.length = 0;
    createdTokens.length = 0;
  });

  it("effect: unauthenticated GET on a minted share_url returns 200 with rendered HTML when type policy is closed", async () => {
    const entityId = await createRenderedPage({
      title: "Precedence Regression Page",
      htmlBody: "<p>hello guest</p>",
      userId: TEST_USER_ID,
    });
    createdEntityIds.push(entityId);

    // Mint step — mirrors publishRenderedPage's token generation for an
    // existing entity (the same generateGuestAccessToken call it makes).
    const token = await generateGuestAccessToken({ entityIds: [entityId], userId: TEST_USER_ID });
    createdTokens.push(token);
    const shareUrl = `${API_BASE}/entities/${entityId}/html?access_token=${token}`;

    // Effect step — a real unauthenticated GET, no Authorization header.
    const response = await fetch(shareUrl);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/text\/html/);
    expect(body).toContain("hello guest");
  });

  it("wrong-entity token: a token minted for entity A denies access to entity B under closed policy", async () => {
    const entityA = await createRenderedPage({
      title: "Entity A",
      htmlBody: "<p>entity a content</p>",
      userId: TEST_USER_ID,
    });
    const entityB = await createRenderedPage({
      title: "Entity B",
      htmlBody: "<p>entity b content</p>",
      userId: TEST_USER_ID,
    });
    createdEntityIds.push(entityA, entityB);

    const tokenForA = await generateGuestAccessToken({
      entityIds: [entityA],
      userId: TEST_USER_ID,
    });
    createdTokens.push(tokenForA);

    const response = await fetch(`${API_BASE}/entities/${entityB}/html?access_token=${tokenForA}`);
    expect(response.status).toBe(403);
  });

  it("expired token: a token past its TTL is denied even against its own entity under closed policy", async () => {
    const entityId = await createRenderedPage({
      title: "Expiring Page",
      htmlBody: "<p>expiring content</p>",
      userId: TEST_USER_ID,
    });
    createdEntityIds.push(entityId);

    const token = await createExpiredGuestAccessToken({
      entityIds: [entityId],
      userId: TEST_USER_ID,
    });
    createdTokens.push(token);

    // assertValidGuestAccessToken revalidates expiry via validateGuestAccessToken
    // before any entity/policy resolution runs, so an expired token is rejected
    // as unauthenticated (401), same as any other invalid token — it never
    // reaches (and therefore never falls through to) the type-level policy
    // check at all.
    const response = await fetch(`${API_BASE}/entities/${entityId}/html?access_token=${token}`);
    expect(response.status).toBe(401);
  });

  it("malformed token: a structurally invalid access_token is denied, not an unhandled exception", async () => {
    const entityId = await createRenderedPage({
      title: "Malformed Token Page",
      htmlBody: "<p>content</p>",
      userId: TEST_USER_ID,
    });
    createdEntityIds.push(entityId);

    const response = await fetch(
      `${API_BASE}/entities/${entityId}/html?access_token=not-a-real-token`
    );
    expect(response.status).toBe(401);
  });

  it("no credentials: a non-local request with no token is rejected as unauthenticated (401)", async () => {
    const entityId = await createRenderedPage({
      title: "No Token Page",
      htmlBody: "<p>content</p>",
      userId: TEST_USER_ID,
    });
    createdEntityIds.push(entityId);

    // x-forwarded-for makes the loopback request non-local, so it is not
    // treated as the local dev user.
    for (const path of [`/entities/${entityId}/html`, `/entities/${entityId}`]) {
      const response = await fetch(`${API_BASE}${path}`, {
        headers: { "x-forwarded-for": "203.0.113.9" },
      });
      expect(response.status).toBe(401);
    }
  });

  it("re-mint: an older token for the same entity still works independently after a new mint", async () => {
    const entityId = await createRenderedPage({
      title: "Re-mint Page",
      htmlBody: "<p>remint content</p>",
      userId: TEST_USER_ID,
    });
    createdEntityIds.push(entityId);

    const firstToken = await generateGuestAccessToken({
      entityIds: [entityId],
      userId: TEST_USER_ID,
    });
    const secondToken = await generateGuestAccessToken({
      entityIds: [entityId],
      userId: TEST_USER_ID,
    });
    createdTokens.push(firstToken, secondToken);

    const [firstResponse, secondResponse] = await Promise.all([
      fetch(`${API_BASE}/entities/${entityId}/html?access_token=${firstToken}`),
      fetch(`${API_BASE}/entities/${entityId}/html?access_token=${secondToken}`),
    ]);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
  });

  it("other entity types unaffected: a valid token scoped to a different entity is still denied under a different closed type policy", async () => {
    process.env.NEOTOMA_ACCESS_POLICY_ISSUE = "closed";
    try {
      const entityId = `ent_issue_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
      const otherEntityId = `ent_issue_other_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
      const now = new Date().toISOString();
      await db.from("entities").insert([
        {
          id: entityId,
          entity_type: "issue",
          canonical_name: `closed-issue-${entityId}`,
          user_id: TEST_USER_ID,
          created_at: now,
          updated_at: now,
        },
        {
          id: otherEntityId,
          entity_type: "issue",
          canonical_name: `closed-issue-other-${otherEntityId}`,
          user_id: TEST_USER_ID,
          created_at: now,
          updated_at: now,
        },
      ]);
      createdEntityIds.push(entityId, otherEntityId);

      // A validly-minted token that does NOT name this entityId forces the
      // guest branch past assertValidGuestAccessToken and into
      // resolveGuestReadAccess's type-level denial for a type other than
      // rendered_page — proving the reorder is scoped to entity-matched
      // tokens and did not open blanket guest reads on `issue`.
      const token = await generateGuestAccessToken({
        entityIds: [otherEntityId],
        userId: TEST_USER_ID,
      });
      createdTokens.push(token);

      const response = await fetch(`${API_BASE}/entities/${entityId}/html?access_token=${token}`);
      expect(response.status).toBe(403);
    } finally {
      delete process.env.NEOTOMA_ACCESS_POLICY_ISSUE;
      await resetAccessPolicy("issue");
    }
  });

  it("JSON entity route: token for page A opens A and not B under closed policy", async () => {
    const entityA = await createRenderedPage({
      title: "JSON A",
      htmlBody: "<p>a</p>",
      userId: TEST_USER_ID,
    });
    const entityB = await createRenderedPage({
      title: "JSON B",
      htmlBody: "<p>b</p>",
      userId: TEST_USER_ID,
    });
    createdEntityIds.push(entityA, entityB);
    const token = await generateGuestAccessToken({ entityIds: [entityA], userId: TEST_USER_ID });
    createdTokens.push(token);

    const okA = await fetch(`${API_BASE}/entities/${entityA}?access_token=${token}`);
    expect(okA.status).toBe(200);
    const noB = await fetch(`${API_BASE}/entities/${entityB}?access_token=${token}`);
    expect(noB.status).toBe(403);
  });

  it("revoked token: opens nothing, even its own entity", async () => {
    const entityId = await createRenderedPage({
      title: "Revoked Page",
      htmlBody: "<p>revoked</p>",
      userId: TEST_USER_ID,
    });
    createdEntityIds.push(entityId);
    const token = await generateGuestAccessToken({ entityIds: [entityId], userId: TEST_USER_ID });
    createdTokens.push(token);
    const tokenHash = hashGuestAccessToken(token);
    const tokenEntityId = `guest_token_${tokenHash.slice(0, 16)}`;
    const later = new Date(Date.now() + 1000).toISOString();
    await db.from("observations").insert({
      id: randomUUID(),
      entity_id: tokenEntityId,
      entity_type: "guest_access_token",
      user_id: TEST_USER_ID,
      fields: {
        token_hash: tokenHash,
        entity_ids: [entityId],
        thumbprint: null,
        created_at: new Date().toISOString(),
        ttl_seconds: 3600,
        revoked_at: new Date().toISOString(),
      },
      observed_at: later,
      source_priority: 100,
    });

    for (const path of [`/entities/${entityId}/html`, `/entities/${entityId}`]) {
      const response = await fetch(`${API_BASE}${path}?access_token=${token}`);
      expect(response.status).toBe(401);
    }
  });

  it("guard (not dependent on the fix): a page-scoped token cannot batch_correct the page it can read", async () => {
    const entityId = await createRenderedPage({
      title: "Write Target",
      htmlBody: "<p>original</p>",
      userId: TEST_USER_ID,
    });
    createdEntityIds.push(entityId);
    const token = await generateGuestAccessToken({ entityIds: [entityId], userId: TEST_USER_ID });
    createdTokens.push(token);

    const response = await fetch(
      `${API_BASE}/entities/${entityId}/batch_correct?access_token=${token}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          guest_access_token: token,
          corrections: [{ field: "title", value: "pwned" }],
        }),
      }
    );
    expect(response.status).toBeGreaterThanOrEqual(400);

    const page = await fetch(`${API_BASE}/entities/${entityId}/html?access_token=${token}`);
    expect(page.status).toBe(200);
    expect(await page.text()).not.toContain("pwned");
  });

  it("write: a token naming a closed-policy issue still cannot add a thread message (unchanged)", async () => {
    process.env.NEOTOMA_ACCESS_POLICY_ISSUE = "closed";
    try {
      const issueId = `ent_issue_w_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
      const now = new Date().toISOString();
      await db.from("entities").insert({
        id: issueId,
        entity_type: "issue",
        canonical_name: `closed-issue-write-${issueId}`,
        user_id: TEST_USER_ID,
        created_at: now,
        updated_at: now,
      });
      createdEntityIds.push(issueId);
      const token = await generateGuestAccessToken({ entityIds: [issueId], userId: TEST_USER_ID });
      createdTokens.push(token);

      const response = await fetch(`${API_BASE}/issues/add_message`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entity_id: issueId,
          body: "should not be written",
          guest_access_token: token,
        }),
      });
      expect(response.status).toBe(403);
    } finally {
      delete process.env.NEOTOMA_ACCESS_POLICY_ISSUE;
      await resetAccessPolicy("issue");
    }
  });

  it("confined: a page token does not open relationships (with or without expansion) or observations", async () => {
    const page = await createRenderedPage({
      title: "Linked Page",
      htmlBody: "<p>linked</p>",
      userId: TEST_USER_ID,
    });
    const other = await createPlainEntity(TEST_USER_ID, "unrelated-secret-note");
    createdEntityIds.push(page, other);
    const relKey = await linkEntities(page, other, TEST_USER_ID);
    try {
      const token = await generateGuestAccessToken({ entityIds: [page], userId: TEST_USER_ID });
      createdTokens.push(token);

      for (const path of [
        `/entities/${page}/relationships`,
        `/entities/${page}/relationships?expand_entities=true`,
        `/entities/${page}/observations`,
      ]) {
        const sep = path.includes("?") ? "&" : "?";
        const response = await fetch(`${API_BASE}${path}${sep}access_token=${token}`);
        const body = await response.text();
        expect(response.status, path).toBe(403);
        expect(body).not.toContain("unrelated-secret-note");
      }
    } finally {
      await db.from("relationship_snapshots").delete().eq("relationship_key", relKey);
    }
  });

  it("merged: a token for a merged-away page never serves the merge target's content", async () => {
    const target = await createRenderedPage({
      title: "Merge Target",
      htmlBody: "<p>TARGET-ONLY-CONTENT</p>",
      userId: TEST_USER_ID,
    });
    const merged = await createRenderedPage({
      title: "Merged Away",
      htmlBody: "<p>merged away</p>",
      userId: TEST_USER_ID,
    });
    createdEntityIds.push(target, merged);
    await db.from("entities").update({ merged_to_entity_id: target }).eq("id", merged);
    const token = await generateGuestAccessToken({ entityIds: [merged], userId: TEST_USER_ID });
    createdTokens.push(token);

    for (const path of [`/entities/${merged}/html`, `/entities/${merged}`]) {
      const response = await fetch(`${API_BASE}${path}?access_token=${token}`);
      expect(response.status, path).toBe(404);
      expect(await response.text()).not.toContain("TARGET-ONLY-CONTENT");
    }
  });

  it("deleted: a token for a deleted page answers 404 on the link, observations and relationships routes", async () => {
    const page = await createRenderedPage({
      title: "Deleted Page",
      htmlBody: "<p>DELETED-PAGE-CONTENT</p>",
      userId: TEST_USER_ID,
    });
    createdEntityIds.push(page);
    const token = await generateGuestAccessToken({ entityIds: [page], userId: TEST_USER_ID });
    createdTokens.push(token);
    const before = await fetch(`${API_BASE}/entities/${page}/html?access_token=${token}`);
    expect(before.status).toBe(200);

    await db.from("observations").insert({
      id: randomUUID(),
      entity_id: page,
      entity_type: "rendered_page",
      user_id: TEST_USER_ID,
      fields: { _deleted: true },
      observed_at: new Date(Date.now() + 1000).toISOString(),
      source_priority: 1000,
    });

    for (const path of [
      `/entities/${page}/html`,
      `/entities/${page}`,
      `/entities/${page}/observations`,
      `/entities/${page}/relationships`,
    ]) {
      const response = await fetch(`${API_BASE}${path}?access_token=${token}`);
      expect(response.status, path).toBe(404);
      expect(await response.text()).not.toContain("DELETED-PAGE-CONTENT");
    }
  });

  it("issues: a submitter_scoped issue named by the token keeps its policy-governed read and write paths", async () => {
    await setAccessPolicy("issue", "submitter_scoped");
    try {
      const issueId = `ent_issue_s_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
      const now = new Date().toISOString();
      await db.from("entities").insert({
        id: issueId,
        entity_type: "issue",
        canonical_name: `scoped-issue-${issueId}`,
        user_id: TEST_USER_ID,
        created_at: now,
        updated_at: now,
      });
      createdEntityIds.push(issueId);
      const token = await generateGuestAccessToken({ entityIds: [issueId], userId: TEST_USER_ID });
      createdTokens.push(token);

      // Access decision passes via the token named in the submitter-scoped
      // branch: whatever happens next, it is not an access-policy denial.
      const write = await fetch(`${API_BASE}/issues/add_message`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity_id: issueId, body: "hello", guest_access_token: token }),
      });
      expect(write.status).not.toBe(403);
      expect(write.status).not.toBe(401);

      const read = await fetch(`${API_BASE}/issues/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity_id: issueId, guest_access_token: token }),
      });
      expect(read.status).not.toBe(403);
      expect(read.status).not.toBe(401);
    } finally {
      delete process.env.NEOTOMA_ACCESS_POLICY_ISSUE;
      await resetAccessPolicy("issue");
    }
  });

  it("issues: /issues/status read stays policy-governed (no token precedence) under a closed type policy", async () => {
    process.env.NEOTOMA_ACCESS_POLICY_ISSUE = "closed";
    try {
      const issueId = `ent_issue_c_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
      const now = new Date().toISOString();
      await db.from("entities").insert({
        id: issueId,
        entity_type: "issue",
        canonical_name: `closed-issue-read-${issueId}`,
        user_id: TEST_USER_ID,
        created_at: now,
        updated_at: now,
      });
      createdEntityIds.push(issueId);
      const token = await generateGuestAccessToken({ entityIds: [issueId], userId: TEST_USER_ID });
      createdTokens.push(token);
      const read = await fetch(`${API_BASE}/issues/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity_id: issueId, guest_access_token: token }),
      });
      expect(read.status).toBe(403);
    } finally {
      delete process.env.NEOTOMA_ACCESS_POLICY_ISSUE;
      await resetAccessPolicy("issue");
    }
  });
});
