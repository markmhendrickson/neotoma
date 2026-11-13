/**
 * A guest access token grants access only to the entities it names, while it is
 * unexpired and unrevoked, under every type-level access policy mode.
 *
 * Drives the real request path over a live server: unauthenticated GETs on the
 * guest-readable entity routes.
 */
import { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app, resolveGuestUserId } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { createCorrection } from "../../src/services/correction.js";
import {
  GUEST_TOKEN_INVALID_CODE,
  GUEST_TOKEN_INVALID_MESSAGE,
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
    }
    // The markdown route does not accept guest tokens at all.
    const md = await get(`/entities/${b}/markdown`, token);
    expect(md.status).toBe(401);
    expect(md.body).not.toContain(`B-CONTENT-${policy}`);
    expectInvalidTokenBody(md.body);
    // An unknown item gets the same answer as an item the token does not name.
    const unknown = await get(`/entities/ent_missing_${randomUUID().slice(0, 8)}/html`, token);
    expect(unknown.status).toBe(403);
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
    for (const path of [`/entities/${a}/html`, `/entities/${a}`]) {
      expect((await get(path, stale)).status, `${policy} ${path}`).toBe(401);
    }
  });

  it("revoked guest token is refused", async () => {
    setPolicy();
    const a = await createPage("Page R", `R-CONTENT-${policy}`);
    const revoked = await mintAged(a, DAY_MS, 30 * 24 * 3600, new Date().toISOString());
    for (const path of [`/entities/${a}/html`, `/entities/${a}`]) {
      const res = await get(path, revoked);
      expect(res.status, `${policy} ${path}`).toBe(401);
      expect(res.body).not.toContain("CONTENT");
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
            expect([401, 403], `own ${policy}`).not.toContain(own.status);
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
            expect([401, 403], `conversation ${policy}`).not.toContain(viaConversation.status);
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
