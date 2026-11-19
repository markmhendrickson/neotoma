/**
 * A guest access token grants access only to the entities it names, while it is
 * unexpired and unrevoked, under every type-level access policy mode.
 *
 * Drives the real request path over a live server: unauthenticated GETs on the
 * guest-readable entity routes.
 */
import { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { app, resolveGuestUserId } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { createCorrection } from "../../src/services/correction.js";
import { softDeleteEntity, restoreEntity } from "../../src/services/deletion.js";
import { mergeEntities } from "../../src/services/entity_merge.js";
import { splitEntity } from "../../src/services/entity_split.js";
import {
  GUEST_TOKEN_INVALID_CODE,
  GUEST_TOKEN_INVALID_MESSAGE,
  GUEST_TOKEN_SCOPE_CODE,
  GUEST_TOKEN_SCOPE_MESSAGE,
  GuestTokenInvalidError,
  generateGuestAccessToken,
  hashGuestAccessToken,
  validateGuestAccessToken,
} from "../../src/services/guest_access_token.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { recomputeSnapshot } from "../../src/services/snapshot_computation.js";

const POLICIES = ["closed", "read_only", "submit_only", "submitter_scoped", "open"] as const;
type Policy = (typeof POLICIES)[number];

/** Policies under which a guest may read an entity's observations / relationships. */
const ENTITY_READ_POLICIES: ReadonlySet<Policy> = new Set([
  "read_only",
  "submitter_scoped",
  "open",
]);

const OWNER = LOCAL_DEV_USER_ID;
const POLICY_ENV = "NEOTOMA_ACCESS_POLICY_RENDERED_PAGE";
const DAY_MS = 24 * 60 * 60 * 1000;

let baseUrl: string;
let server: ReturnType<typeof app.listen>;
const entityIds: string[] = [];
const tokenEntityIds: string[] = [];

async function createPage(title: string, marker: string): Promise<string> {
  const id = `ent_rp_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const now = new Date().toISOString();
  await db.from("entities").insert({
    id,
    entity_type: "rendered_page",
    canonical_name: `${title}-${id}`,
    user_id: OWNER,
    created_at: now,
    updated_at: now,
  });
  await db.from("observations").insert({
    entity_id: id,
    entity_type: "rendered_page",
    user_id: OWNER,
    fields: { title, html_body: `<p>${marker}</p>` },
    observed_at: now,
    source_priority: 0,
  });
  await recomputeSnapshot(id, OWNER);
  entityIds.push(id);
  return id;
}

async function mint(entityId: string): Promise<string> {
  const token = await generateGuestAccessToken({ entityIds: [entityId], userId: OWNER });
  tokenEntityIds.push(`guest_token_${hashGuestAccessToken(token).slice(0, 16)}`);
  return token;
}

/** Persist a token in the stored shape, with a chosen creation time and TTL. */
async function mintAged(
  entityId: string,
  ageMs: number,
  ttlSeconds: number,
  revokedAt: string | null = null
): Promise<string> {
  const token = randomUUID();
  const hash = hashGuestAccessToken(token);
  const id = `guest_token_${hash.slice(0, 16)}`;
  const createdAt = new Date(Date.now() - ageMs).toISOString();
  await db.from("entities").insert({
    id,
    entity_type: "guest_access_token",
    canonical_name: `guest_access_token:${hash.slice(0, 12)}`,
    user_id: OWNER,
    created_at: createdAt,
    updated_at: createdAt,
  });
  await db.from("observations").insert({
    id: randomUUID(),
    entity_id: id,
    entity_type: "guest_access_token",
    user_id: OWNER,
    fields: {
      token_hash: hash,
      entity_ids: [entityId],
      thumbprint: null,
      created_at: createdAt,
      ttl_seconds: ttlSeconds,
      revoked_at: revokedAt,
    },
    observed_at: createdAt,
    source_priority: 100,
  });
  tokenEntityIds.push(id);
  return token;
}

const tokenEntityOf = (token: string) => `guest_token_${hashGuestAccessToken(token).slice(0, 16)}`;

/** Write a token field through the real correction path. */
async function correctToken(token: string, field: string, value: unknown): Promise<void> {
  await createCorrection({
    entity_id: tokenEntityOf(token),
    entity_type: "guest_access_token",
    field,
    value,
    schema_version: "1.0",
    user_id: OWNER,
    idempotency_key: `test-${randomUUID()}`,
  });
}

/** Append a raw record to a token's entity (used for malformed and full-shape records). */
async function appendRawRecord(token: string, fields: unknown, offsetMs = 1000): Promise<void> {
  await db.from("observations").insert({
    id: randomUUID(),
    entity_id: tokenEntityOf(token),
    entity_type: "guest_access_token",
    user_id: OWNER,
    fields,
    observed_at: new Date(Date.now() + offsetMs).toISOString(),
    source_priority: 100,
  });
}

/** Routes a guest token can read, as path builders. */
const READ_ROUTES: Array<(id: string) => string> = [
  (id) => `/entities/${id}/html`,
  (id) => `/entities/${id}`,
  (id) => `/entities/${id}/observations`,
  (id) => `/entities/${id}/relationships`,
];

function expectInvalidTokenBody(body: string): void {
  const parsed = JSON.parse(body) as { error_code?: string; message?: string };
  expect(parsed.error_code).toBe(GUEST_TOKEN_INVALID_CODE);
  expect(parsed.message).toBe(GUEST_TOKEN_INVALID_MESSAGE);
}

function expectScopeBody(body: string): void {
  const parsed = JSON.parse(body) as { error_code?: string; message?: string };
  expect(parsed.error_code).toBe(GUEST_TOKEN_SCOPE_CODE);
  expect(parsed.message).toBe(GUEST_TOKEN_SCOPE_MESSAGE);
}

/**
 * An accepted issue request got past the access check into the route's own
 * logic: status returns the issue; add_message reaches the thread step (this
 * fixture has no thread, so it reports that rather than an access refusal).
 */
function expectIssueRouteReached(
  route: string,
  res: { status: number; body: string },
  marker: string
): void {
  expect([401, 403]).not.toContain(res.status);
  if (route === "status") {
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ title: marker });
  } else {
    expect(res.body).toContain("Issue conversation relationship is missing");
    expect(res.body).not.toContain(GUEST_TOKEN_SCOPE_CODE);
    expect(res.body).not.toContain(GUEST_TOKEN_INVALID_CODE);
  }
}

async function post(path: string, payload: unknown): Promise<{ status: number; body: string }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: await response.text() };
}

async function get(path: string, token?: string): Promise<{ status: number; body: string }> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${baseUrl}${path}${token ? `${sep}access_token=${token}` : ""}`;
  // x-forwarded-for makes the loopback request non-local, so a request without
  // a token is not treated as the local owner.
  const response = await fetch(url, { headers: { "x-forwarded-for": "203.0.113.9" } });
  return { status: response.status, body: await response.text() };
}

beforeAll(async () => {
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  delete process.env[POLICY_ENV];
  for (const id of tokenEntityIds) {
    await db.from("observations").delete().eq("entity_id", id);
    await db.from("entities").delete().eq("id", id);
  }
  for (const id of entityIds) {
    await db.from("observations").delete().eq("entity_id", id);
    await db.from("entity_snapshots").delete().eq("entity_id", id);
    await db.from("entities").delete().eq("id", id);
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe.each(POLICIES)("guest token entity binding under policy %s", (policy) => {
  const setPolicy = () => {
    process.env[POLICY_ENV] = policy;
  };

  it("guest token is accepted only for its own entity", async () => {
    setPolicy();
    const a = await createPage("Page A", `A-CONTENT-${policy}`);
    const b = await createPage("Page B", `B-CONTENT-${policy}`);
    const token = await mint(a);

    // Share-link routes: the token opens its own page under every mode.
    const ownHtml = await get(`/entities/${a}/html`, token);
    expect(ownHtml.status).toBe(200);
    expect(ownHtml.body).toContain(`A-CONTENT-${policy}`);
    expect((await get(`/entities/${a}`, token)).status).toBe(200);

    // Other page: refused on every guest-readable route, with no page content.
    for (const route of ["html", "", "observations", "relationships"]) {
      const path = route ? `/entities/${b}/${route}` : `/entities/${b}`;
      const res = await get(path, token);
      expect(res.status, `${policy} ${path}`).toBe(403);
      expect(res.body).not.toContain(`B-CONTENT-${policy}`);
      expectScopeBody(res.body);
    }
    // The markdown route does not accept guest tokens at all.
    const md = await get(`/entities/${b}/markdown`, token);
    expect(md.status).toBe(401);
    expect(md.body).not.toContain(`B-CONTENT-${policy}`);
    expectInvalidTokenBody(md.body);
    // An unknown item gets the same answer as an item the token does not name.
    const unknown = await get(`/entities/ent_missing_${randomUUID().slice(0, 8)}/html`, token);
    expect(unknown.status).toBe(403);
    expectScopeBody(unknown.body);
  });

  it("guest token reads on its own entity follow the type policy for non-share routes", async () => {
    setPolicy();
    const a = await createPage("Page A2", "A2");
    const token = await mint(a);
    for (const route of ["observations", "relationships"]) {
      const res = await get(`/entities/${a}/${route}`, token);
      expect(res.status, `${policy} ${route}`).toBe(ENTITY_READ_POLICIES.has(policy) ? 200 : 403);
    }
  });

  it("expired guest token is refused", async () => {
    setPolicy();
    const a = await createPage("Page E", `E-CONTENT-${policy}`);
    const b = await createPage("Page E2", `E2-CONTENT-${policy}`);
    const expired = await mintAged(a, 365 * DAY_MS, 3600);
    for (const path of [
      ...READ_ROUTES.map((route) => route(a)),
      `/entities/${a}/markdown`,
      `/entities/${b}/html`,
    ]) {
      const res = await get(path, expired);
      expect(res.status, `${policy} ${path}`).toBe(401);
      expect(res.body).not.toContain("CONTENT");
      expectInvalidTokenBody(res.body);
    }
  });

  it("guest token older than the configured lifetime is refused whatever lifetime it carries", async () => {
    setPolicy();
    const a = await createPage("Page L", `L-CONTENT-${policy}`);
    const stale = await mintAged(a, 80 * DAY_MS, 365 * 24 * 3600);
    for (const route of READ_ROUTES) {
      const res = await get(route(a), stale);
      expect(res.status, `${policy} ${route(a)}`).toBe(401);
      expectInvalidTokenBody(res.body);
    }
  });

  it("revoked guest token is refused", async () => {
    setPolicy();
    const a = await createPage("Page R", `R-CONTENT-${policy}`);
    const revoked = await mintAged(a, DAY_MS, 30 * 24 * 3600, new Date().toISOString());
    for (const route of READ_ROUTES) {
      const res = await get(route(a), revoked);
      expect(res.status, `${policy} ${route(a)}`).toBe(401);
      expect(res.body).not.toContain("CONTENT");
      expectInvalidTokenBody(res.body);
    }
  });

  it("request without a token is refused as before", async () => {
    setPolicy();
    const a = await createPage("Page N", "N");
    for (const path of [`/entities/${a}/html`, `/entities/${a}`]) {
      expect((await get(path)).status, `${policy} ${path}`).toBe(401);
    }
  });

  it("owner access without a guest token is unchanged", async () => {
    setPolicy();
    const a = await createPage("Page O", `O-CONTENT-${policy}`);
    // Loopback request with no credentials resolves to the local owner.
    const response = await fetch(`${baseUrl}/entities/${a}/html`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(`O-CONTENT-${policy}`);
    const json = await fetch(`${baseUrl}/entities/${a}`);
    expect(json.status).toBe(200);
  });
});

describe.each(POLICIES)("guest token records written later under policy %s", (policy) => {
  const setPolicy = () => {
    process.env[POLICY_ENV] = policy;
  };

  it("a corrected revocation is refused on every guest-readable route", async () => {
    setPolicy();
    const a = await createPage("Page CR", `CR-CONTENT-${policy}`);
    const token = await mint(a);
    expect((await get(`/entities/${a}/html`, token)).status).toBe(200);
    await correctToken(token, "revoked_at", new Date().toISOString());
    for (const route of READ_ROUTES) {
      const res = await get(route(a), token);
      expect(res.status, `${policy} ${route(a)}`).toBe(401);
      expectInvalidTokenBody(res.body);
    }
  });

  it("a corrected shorter lifetime is refused on every guest-readable route", async () => {
    setPolicy();
    const a = await createPage("Page CT", `CT-CONTENT-${policy}`);
    const token = await mintAged(a, 10_000, 30 * 24 * 3600);
    expect((await get(`/entities/${a}/html`, token)).status).toBe(200);
    await correctToken(token, "ttl_seconds", 5);
    for (const route of READ_ROUTES) {
      const res = await get(route(a), token);
      expect(res.status, `${policy} ${route(a)}`).toBe(401);
      expectInvalidTokenBody(res.body);
    }
  });

  it("a corrected narrower entity list is refused for the removed entity on every route", async () => {
    setPolicy();
    const a = await createPage("Page CN", `CN-CONTENT-${policy}`);
    const token = await mint(a);
    expect((await get(`/entities/${a}/html`, token)).status).toBe(200);
    await correctToken(token, "entity_ids", []);
    for (const route of READ_ROUTES) {
      const res = await get(route(a), token);
      expect(res.status, `${policy} ${route(a)}`).toBe(403);
      expect(res.body).not.toContain("CONTENT");
    }
  });

  it("a later record that adds an entity id does not extend the token", async () => {
    setPolicy();
    const a = await createPage("Page X1", `X1-CONTENT-${policy}`);
    const b = await createPage("Page X2", `X2-CONTENT-${policy}`);
    const token = await mint(a);
    await correctToken(token, "entity_ids", [a, b]);
    expect((await get(`/entities/${a}/html`, token)).status).toBe(200);
    for (const route of [`/entities/${b}/html`, `/entities/${b}`]) {
      const res = await get(route, token);
      expect(res.status, `${policy} ${route}`).toBe(403);
      expect(res.body).not.toContain("X2-CONTENT");
    }
  });

  it("a later record with a fresh creation time and long lifetime does not extend the token", async () => {
    setPolicy();
    const a = await createPage("Page F", `F-CONTENT-${policy}`);
    const token = await mintAged(a, 40 * DAY_MS, 3600);
    await appendRawRecord(token, {
      token_hash: hashGuestAccessToken(token),
      entity_ids: [a],
      created_at: new Date().toISOString(),
      ttl_seconds: 365 * 24 * 3600,
      revoked_at: null,
    });
    for (const path of [`/entities/${a}/html`, `/entities/${a}`]) {
      expect((await get(path, token)).status, `${policy} ${path}`).toBe(401);
    }
  });

  it("a later record without a revocation does not lift an earlier revocation", async () => {
    setPolicy();
    const a = await createPage("Page U", `U-CONTENT-${policy}`);
    const token = await mintAged(a, DAY_MS, 30 * 24 * 3600, new Date().toISOString());
    await correctToken(token, "revoked_at", null);
    await appendRawRecord(token, {
      token_hash: hashGuestAccessToken(token),
      entity_ids: [a],
      created_at: new Date().toISOString(),
      ttl_seconds: 30 * 24 * 3600,
      revoked_at: null,
    });
    for (const path of [`/entities/${a}/html`, `/entities/${a}`]) {
      expect((await get(path, token)).status, `${policy} ${path}`).toBe(401);
    }
  });

  it("a record that cannot be read refuses the token", async () => {
    setPolicy();
    const a = await createPage("Page M", `M-CONTENT-${policy}`);
    const token = await mint(a);
    expect((await get(`/entities/${a}/html`, token)).status).toBe(200);
    await appendRawRecord(token, "{ not a readable record");
    for (const route of READ_ROUTES) {
      const res = await get(route(a), token);
      expect(res.status, `${policy} ${route(a)}`).toBe(401);
      expect(res.body).not.toContain("CONTENT");
    }
  });
});

describe.each(POLICIES)(
  "issue routes accept a guest token only for their own thread, policy %s",
  (policy) => {
    const POLICY_ENV_ISSUE = "NEOTOMA_ACCESS_POLICY_ISSUE";
    const readsAllowed =
      policy === "read_only" || policy === "submitter_scoped" || policy === "open";

    async function createIssue(marker: string): Promise<string> {
      const id = `ent_issue_t_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
      const now = new Date().toISOString();
      await db.from("entities").insert({
        id,
        entity_type: "issue",
        canonical_name: `${marker}-${id}`,
        user_id: OWNER,
        created_at: now,
        updated_at: now,
      });
      await db.from("observations").insert({
        entity_id: id,
        entity_type: "issue",
        user_id: OWNER,
        fields: { title: marker, body: marker },
        observed_at: now,
        source_priority: 0,
      });
      await recomputeSnapshot(id, OWNER);
      entityIds.push(id);
      return id;
    }

    async function linkIssueToConversation(issueId: string, conversationId: string): Promise<void> {
      const now = new Date().toISOString();
      await db.from("relationship_snapshots").upsert({
        relationship_key: `REFERS_TO:${issueId}:${conversationId}`,
        relationship_type: "REFERS_TO",
        source_entity_id: issueId,
        target_entity_id: conversationId,
        schema_version: "1.0",
        snapshot: {},
        computed_at: now,
        observation_count: 1,
        last_observation_at: now,
        provenance: { reducer_field: "obs" },
        user_id: OWNER,
      });
    }

    const routes = [
      { name: "status", path: "/issues/status", body: {} as Record<string, unknown> },
      { name: "add_message", path: "/issues/add_message", body: { body: "hello" } },
    ];

    for (const route of routes) {
      it(`${route.name}: own-entity and conversation tokens follow the type policy`, async () => {
        process.env[POLICY_ENV_ISSUE] = policy;
        try {
          const marker = `ISSUE-CONTENT-${policy}-${route.name}`;
          const issue = await createIssue(marker);
          const ownToken = await mint(issue);
          const own = await post(route.path, {
            ...route.body,
            entity_id: issue,
            guest_access_token: ownToken,
          });
          if (readsAllowed) {
            expectIssueRouteReached(route.name, own, marker);
          } else {
            expect(own.status, `own ${policy}`).toBe(403);
            expect(own.body).not.toContain(marker);
          }

          const conversationId = `ent_conv_t_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
          const issue2 = await createIssue(`${marker}-conv`);
          await linkIssueToConversation(issue2, conversationId);
          const convToken = await mint(conversationId);
          const viaConversation = await post(route.path, {
            ...route.body,
            entity_id: issue2,
            guest_access_token: convToken,
          });
          if (readsAllowed) {
            expectIssueRouteReached(route.name, viaConversation, `${marker}-conv`);
          } else {
            expect(viaConversation.status).toBe(403);
          }
        } finally {
          delete process.env[POLICY_ENV_ISSUE];
        }
      });

      it(`${route.name}: a token for a different entity is refused with no issue content`, async () => {
        process.env[POLICY_ENV_ISSUE] = policy;
        try {
          const marker = `ISSUE-OTHER-${policy}-${route.name}`;
          const issue = await createIssue(marker);
          const other = await createIssue("unrelated");
          const token = await mint(other);
          const res = await post(route.path, {
            ...route.body,
            entity_id: issue,
            guest_access_token: token,
          });
          expect(res.status).toBe(403);
          expect(res.body).not.toContain(marker);
        } finally {
          delete process.env[POLICY_ENV_ISSUE];
        }
      });

      it(`${route.name}: over-age, revoked and missing tokens are refused with 401`, async () => {
        process.env[POLICY_ENV_ISSUE] = policy;
        try {
          const issue = await createIssue(`ISSUE-401-${policy}-${route.name}`);
          const overAge = await mintAged(issue, 80 * DAY_MS, 365 * 24 * 3600);
          const revoked = await mintAged(issue, DAY_MS, 30 * 24 * 3600, new Date().toISOString());
          for (const token of [overAge, revoked]) {
            const res = await post(route.path, {
              ...route.body,
              entity_id: issue,
              guest_access_token: token,
            });
            expect(res.status).toBe(401);
            expectInvalidTokenBody(res.body);
            expect(res.body).not.toContain("ISSUE-401");
          }
          const none = await post(route.path, { ...route.body, entity_id: issue });
          expect(none.status).toBe(401);
        } finally {
          delete process.env[POLICY_ENV_ISSUE];
        }
      });
    }
  }
);

describe("guest token owner resolution", () => {
  const principalFor = (accessToken: string) => ({
    kind: "guest" as const,
    guestId: { accessToken },
    agentIdentity: null,
    accessToken,
  });
  const remoteReq = { headers: {}, socket: { remoteAddress: "203.0.113.42" } } as any;

  it("a valid token resolves to its owner; expired, revoked and unknown tokens are refused", async () => {
    const page = await createPage("Page G", "G");
    const valid = await mint(page);
    expect(await resolveGuestUserId(remoteReq, principalFor(valid))).toBe(OWNER);

    const expired = await mintAged(page, 80 * DAY_MS, 365 * 24 * 3600);
    const revoked = await mintAged(page, DAY_MS, 30 * 24 * 3600, new Date().toISOString());
    for (const token of [expired, revoked, randomUUID()]) {
      await expect(resolveGuestUserId(remoteReq, principalFor(token))).rejects.toBeInstanceOf(
        GuestTokenInvalidError
      );
    }
  });

  it("issue submission refuses an expired or revoked token", async () => {
    const page = await createPage("Page G2", "G2");
    const expired = await mintAged(page, 80 * DAY_MS, 365 * 24 * 3600);
    const revoked = await mintAged(page, DAY_MS, 30 * 24 * 3600, new Date().toISOString());
    for (const path of ["/issues/submit", "/api/issues/submit"]) {
      for (const token of [expired, revoked]) {
        const res = await post(`${path}?access_token=${token}`, { title: "t", body: "b" });
        expect(res.status, `${path} ${res.body}`).toBe(401);
        expectInvalidTokenBody(res.body);
      }
    }
  });
});

describe.each(POLICIES)("deleted guest token records under policy %s", (policy) => {
  const setPolicy = () => {
    process.env[POLICY_ENV] = policy;
  };

  it("a deleted token entity refuses the token, and a restore does not lift it", async () => {
    setPolicy();
    const a = await createPage("Page D", `D-CONTENT-${policy}`);
    const token = await mint(a);
    expect((await get(`/entities/${a}/html`, token)).status).toBe(200);

    const deleted = await softDeleteEntity(tokenEntityOf(token), "guest_access_token", OWNER);
    expect(deleted.success, JSON.stringify(deleted)).toBe(true);
    for (const route of READ_ROUTES) {
      const res = await get(route(a), token);
      expect(res.status, `${policy} deleted ${route(a)}`).toBe(401);
      expect(res.body).not.toContain("CONTENT");
      expectInvalidTokenBody(res.body);
    }

    const restored = await restoreEntity(tokenEntityOf(token), "guest_access_token", OWNER);
    expect(restored.success, JSON.stringify(restored)).toBe(true);
    for (const route of READ_ROUTES) {
      const res = await get(route(a), token);
      expect(res.status, `${policy} restored ${route(a)}`).toBe(401);
      expectInvalidTokenBody(res.body);
    }
  });
});

describe("guest token records moved between entities", () => {
  async function plainEntity(label: string): Promise<string> {
    const id = `ent_plain_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const now = new Date().toISOString();
    await db.from("entities").insert({
      id,
      entity_type: "note",
      canonical_name: `${label}-${id}`,
      user_id: OWNER,
      created_at: now,
      updated_at: now,
    });
    await db.from("observations").insert({
      id: randomUUID(),
      entity_id: id,
      entity_type: "note",
      user_id: OWNER,
      fields: { title: label },
      observed_at: now,
      source_priority: 0,
    });
    entityIds.push(id);
    return id;
  }

  it("a token entity merged into another entity refuses the token", async () => {
    const a = await createPage("Page MG1", "MG1");
    const token = await mint(a);
    const other = await plainEntity("merge target");
    expect((await get(`/entities/${a}/html`, token)).status).toBe(200);
    await mergeEntities({
      fromEntityId: tokenEntityOf(token),
      toEntityId: other,
      userId: OWNER,
      mergedBy: "test",
    });
    for (const route of READ_ROUTES) {
      expect((await get(route(a), token)).status, route(a)).toBe(401);
    }
    expect(await validateGuestAccessToken(token)).toBeNull();
  });

  it("an entity merged into a token entity refuses the token", async () => {
    const a = await createPage("Page MG2", "MG2");
    const token = await mint(a);
    const other = await plainEntity("merge source");
    await mergeEntities({
      fromEntityId: other,
      toEntityId: tokenEntityOf(token),
      userId: OWNER,
      mergedBy: "test",
    });
    for (const route of READ_ROUTES) {
      expect((await get(route(a), token)).status, route(a)).toBe(401);
    }
  });

  it("a split of a token entity refuses the token", async () => {
    const a = await createPage("Page SP", "SP");
    const token = await mint(a);
    const revokedAt = new Date().toISOString();
    await correctToken(token, "revoked_at", revokedAt);
    expect(await validateGuestAccessToken(token)).toBeNull();
    await splitEntity({
      sourceEntityId: tokenEntityOf(token),
      userId: OWNER,
      predicate: { observation_field_equals: { field: "revoked_at", value: revokedAt } },
      newEntity: {
        entity_type: "guest_access_token",
        canonical_name: `split-${randomUUID()}`,
      },
      idempotencyKey: `split-${randomUUID()}`,
      splitBy: "test",
    });
    tokenEntityIds.push(tokenEntityOf(token));
    for (const route of READ_ROUTES) {
      expect((await get(route(a), token)).status, route(a)).toBe(401);
    }
    expect(await validateGuestAccessToken(token)).toBeNull();
  });
});

describe("guest token record handling", () => {
  it("a record with an unparseable creation time refuses the token", async () => {
    const a = await createPage("Page UC", "UC");
    const token = await mint(a);
    expect(await validateGuestAccessToken(token)).not.toBeNull();
    await correctToken(token, "created_at", "not-a-date");
    expect(await validateGuestAccessToken(token)).toBeNull();
    expect((await get(`/entities/${a}/html`, token)).status).toBe(401);
  });

  it("a storage error while reading token records is a server error, never a grant", async () => {
    const a = await createPage("Page SE", "SE-CONTENT");
    const token = await mint(a);
    const realFrom = db.from.bind(db);
    const spy = vi.spyOn(db, "from").mockImplementation(((table: string) => {
      const real = realFrom(table);
      if (table !== "observations") return real;
      return new Proxy(real, {
        get(target, prop, receiver) {
          if (prop !== "select") return Reflect.get(target, prop, receiver);
          return (...args: unknown[]) => {
            const query = (target as any).select(...args);
            return new Proxy(query, {
              get(queryTarget, queryProp, queryReceiver) {
                if (queryProp !== "eq") return Reflect.get(queryTarget, queryProp, queryReceiver);
                return (column: string, value: unknown) =>
                  column === "entity_id" && String(value).startsWith("guest_token_")
                    ? { order: async () => ({ data: null, error: { message: "read failure" } }) }
                    : (queryTarget as any).eq(column, value);
              },
            });
          };
        },
      });
    }) as typeof db.from);
    try {
      await expect(validateGuestAccessToken(token)).rejects.toThrow(/could not be read/);
      for (const route of READ_ROUTES) {
        const res = await get(route(a), token);
        expect(res.status, route(a)).toBeGreaterThanOrEqual(500);
        expect(res.body).not.toContain("SE-CONTENT");
      }
    } finally {
      spy.mockRestore();
    }
  });

  it("a guest token sent as a bearer credential gets the same answers", async () => {
    const a = await createPage("Page BR", "BR-CONTENT");
    const b = await createPage("Page BR2", "BR2-CONTENT");
    const valid = await mint(a);
    const expired = await mintAged(a, 365 * DAY_MS, 3600);
    const bearer = async (path: string, token: string) => {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${token}`, "x-forwarded-for": "203.0.113.9" },
      });
      return { status: response.status, body: await response.text() };
    };
    const ok = await bearer(`/entities/${a}/html`, valid);
    expect(ok.status).toBe(200);
    for (const route of READ_ROUTES) {
      const refused = await bearer(route(a), expired);
      expect(refused.status, route(a)).toBe(401);
      expectInvalidTokenBody(refused.body);
    }
    const other = await bearer(`/entities/${b}/html`, valid);
    expect(other.status).toBe(403);
    expectScopeBody(other.body);
  });
});

describe("issue submitter rule", () => {
  const ISSUE_ENV = "NEOTOMA_ACCESS_POLICY_ISSUE";

  async function issueWithRecordedHash(token: string, recordedUserId: string): Promise<string> {
    const id = `ent_issue_h_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const now = new Date().toISOString();
    await db.from("entities").insert({
      id,
      entity_type: "issue",
      canonical_name: `hash-issue-${id}`,
      user_id: OWNER,
      created_at: now,
      updated_at: now,
    });
    await db.from("observations").insert({
      id: randomUUID(),
      entity_id: id,
      entity_type: "issue",
      user_id: OWNER,
      fields: { title: "HASH-ISSUE-CONTENT" },
      observed_at: now,
      source_priority: 0,
    });
    await db.from("observations").insert({
      id: randomUUID(),
      entity_id: id,
      entity_type: "issue",
      user_id: recordedUserId,
      fields: { guest_access_token_hash: hashGuestAccessToken(token) },
      observed_at: now,
      source_priority: 0,
    });
    await recomputeSnapshot(id, OWNER);
    entityIds.push(id);
    return id;
  }

  it("a token whose hash is recorded on the issue owner's records is accepted under submitter_scoped", async () => {
    process.env[ISSUE_ENV] = "submitter_scoped";
    try {
      const unrelated = await createPage("Page IH", "IH");
      const token = await mint(unrelated);
      const issue = await issueWithRecordedHash(token, OWNER);
      const res = await post("/issues/status", { entity_id: issue, guest_access_token: token });
      expect(res.status, res.body).toBe(200);
      expect(JSON.parse(res.body)).toMatchObject({ title: "HASH-ISSUE-CONTENT" });
    } finally {
      delete process.env[ISSUE_ENV];
    }
  });

  it("a hash recorded under a different user does not count", async () => {
    process.env[ISSUE_ENV] = "submitter_scoped";
    try {
      const unrelated = await createPage("Page IH2", "IH2");
      const token = await mint(unrelated);
      const issue = await issueWithRecordedHash(token, "00000000-0000-0000-0000-000000000099");
      const res = await post("/issues/status", { entity_id: issue, guest_access_token: token });
      expect(res.status).toBe(403);
      expect(res.body).not.toContain("HASH-ISSUE-CONTENT");
    } finally {
      delete process.env[ISSUE_ENV];
    }
  });
});

describe("guest subscription and event routes", () => {
  async function jsonPost(path: string, token: string, body: Record<string, unknown>) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-forwarded-for": "203.0.113.9",
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.text() };
  }

  const subscriptionRoutes = (subscriptionId: string, entityId: string) => [
    { path: "/subscribe", body: { entity_ids: [entityId], delivery_method: "sse" } },
    { path: "/unsubscribe", body: { subscription_id: subscriptionId } },
    { path: "/list_subscriptions", body: {} },
    { path: "/get_subscription_status", body: { subscription_id: subscriptionId } },
  ];

  it("expired and revoked tokens get the stable 401 on every subscription and event route", async () => {
    const a = await createPage("Page SB", "SB");
    const expired = await mintAged(a, 365 * DAY_MS, 3600);
    const revoked = await mintAged(a, DAY_MS, 30 * 24 * 3600, new Date().toISOString());
    for (const token of [expired, revoked]) {
      for (const route of subscriptionRoutes("sub-x", a)) {
        const res = await jsonPost(route.path, token, route.body);
        expect(res.status, route.path).toBe(401);
        expectInvalidTokenBody(res.body);
      }
      const stream = await fetch(`${baseUrl}/events/stream?subscription_id=sub-x`, {
        headers: { Authorization: `Bearer ${token}`, "x-forwarded-for": "203.0.113.9" },
      });
      expect(stream.status).toBe(401);
      expectInvalidTokenBody(await stream.text());
    }
  });

  it("a token used outside its grant gets 403 with the scope code on every route", async () => {
    const a = await createPage("Page SB1", "SB1");
    const b = await createPage("Page SB2", "SB2");
    const tokenA = await mint(a);
    const tokenB = await mint(b);
    const created = await jsonPost("/subscribe", tokenA, {
      entity_ids: [a],
      delivery_method: "sse",
    });
    expect(created.status, created.body).toBe(200);
    const subscriptionId = (JSON.parse(created.body) as { subscription_id: string })
      .subscription_id;

    const outOfGrant = [
      { path: "/subscribe", body: { entity_ids: [a], delivery_method: "sse" } },
      { path: "/unsubscribe", body: { subscription_id: subscriptionId } },
      { path: "/get_subscription_status", body: { subscription_id: subscriptionId } },
    ];
    for (const route of outOfGrant) {
      const res = await jsonPost(route.path, tokenB, route.body);
      expect(res.status, route.path).toBe(403);
      expectScopeBody(res.body);
    }
    const stream = await fetch(`${baseUrl}/events/stream?subscription_id=${subscriptionId}`, {
      headers: { Authorization: `Bearer ${tokenB}`, "x-forwarded-for": "203.0.113.9" },
    });
    expect(stream.status).toBe(403);
    expectScopeBody(await stream.text());

    await jsonPost("/unsubscribe", tokenA, { subscription_id: subscriptionId });
  });
});

describe("guest token validation", () => {
  it("a later record cannot lift a revocation or extend the lifetime", async () => {
    const a = await createPage("Page V", "V");
    const token = await mintAged(a, 40 * DAY_MS, (90 * DAY_MS) / 1000);
    // Created 40 days ago under a 90-day lifetime: the configured 30-day
    // lifetime still applies.
    expect(await validateGuestAccessToken(token)).toBeNull();

    const fresh = await mint(a);
    expect((await validateGuestAccessToken(fresh))?.entity_ids).toEqual([a]);
    const entityId = `guest_token_${hashGuestAccessToken(fresh).slice(0, 16)}`;
    const now = new Date();
    await db.from("observations").insert({
      id: randomUUID(),
      entity_id: entityId,
      entity_type: "guest_access_token",
      user_id: OWNER,
      fields: {
        token_hash: hashGuestAccessToken(fresh),
        entity_ids: [a],
        created_at: now.toISOString(),
        ttl_seconds: 3600,
        revoked_at: now.toISOString(),
      },
      observed_at: new Date(now.getTime() + 1000).toISOString(),
      source_priority: 100,
    });
    await db.from("observations").insert({
      id: randomUUID(),
      entity_id: entityId,
      entity_type: "guest_access_token",
      user_id: OWNER,
      fields: {
        token_hash: hashGuestAccessToken(fresh),
        entity_ids: [a],
        created_at: now.toISOString(),
        ttl_seconds: 3600,
        revoked_at: null,
      },
      observed_at: new Date(now.getTime() + 2000).toISOString(),
      source_priority: 100,
    });
    expect(await validateGuestAccessToken(fresh)).toBeNull();
  });

  it("a later record with a fresh creation time does not extend a token", async () => {
    const a = await createPage("Page W", "W");
    const token = await mintAged(a, 40 * DAY_MS, 3600);
    expect(await validateGuestAccessToken(token)).toBeNull();
    await correctToken(token, "created_at", new Date().toISOString());
    await correctToken(token, "ttl_seconds", 365 * 24 * 3600);
    expect(await validateGuestAccessToken(token)).toBeNull();
  });

  it("corrections can only narrow the covered entities", async () => {
    const a = await createPage("Page N1", "N1");
    const b = await createPage("Page N2", "N2");
    const token = await mint(a);
    await correctToken(token, "entity_ids", [a, b]);
    expect((await validateGuestAccessToken(token))?.entity_ids).toEqual([a]);
    await correctToken(token, "entity_ids", [b]);
    expect((await validateGuestAccessToken(token))?.entity_ids).toEqual([]);
  });

  it("a record that cannot be read refuses the token", async () => {
    const a = await createPage("Page P", "P");
    const token = await mint(a);
    expect(await validateGuestAccessToken(token)).not.toBeNull();
    await appendRawRecord(token, "{ not a readable record");
    expect(await validateGuestAccessToken(token)).toBeNull();
  });

  it("differing thumbprints refuse the token", async () => {
    const a = await createPage("Page T", "T");
    const token = await mint(a);
    await correctToken(token, "thumbprint", "thumb-one");
    expect((await validateGuestAccessToken(token))?.thumbprint).toBe("thumb-one");
    await correctToken(token, "thumbprint", "thumb-two");
    expect(await validateGuestAccessToken(token)).toBeNull();
  });
});
