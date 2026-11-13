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

import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import {
  generateGuestAccessToken,
  hashGuestAccessToken,
  validateGuestAccessToken,
} from "../../src/services/guest_access_token.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { recomputeSnapshot } from "../../src/services/snapshot_computation.js";

const POLICIES = ["closed", "read_only", "submit_only", "submitter_scoped", "open"] as const;
type Policy = (typeof POLICIES)[number];

/** Policies under which a guest may read an entity's observations / relationships. */
const ENTITY_READ_POLICIES: ReadonlySet<Policy> = new Set(["read_only", "submitter_scoped", "open"]);

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
      expect([403, 404], `${policy} ${path}`).toContain(res.status);
      expect(res.body).not.toContain(`B-CONTENT-${policy}`);
    }
    // The markdown route does not accept guest tokens at all.
    const md = await get(`/entities/${b}/markdown`, token);
    expect(md.status).toBe(401);
    expect(md.body).not.toContain(`B-CONTENT-${policy}`);
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
    for (const path of [`/entities/${a}/html`, `/entities/${a}`, `/entities/${b}/html`]) {
      const res = await get(path, expired);
      expect(res.status, `${policy} ${path}`).toBe(401);
      expect(res.body).not.toContain("CONTENT");
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

describe("guest token validation", () => {
  it("a later record cannot lift a revocation or extend the lifetime", async () => {
    const a = await createPage("Page V", "V");
    const token = await mintAged(a, 40 * DAY_MS, 90 * DAY_MS / 1000);
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
});
