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

  it("undifferentiated guest access unaffected: no token at all is still denied under closed policy", async () => {
    // The test server treats an unauthenticated request from 127.0.0.1 (no
    // Bearer token) as the local dev user (see isLocalRequest fallback in
    // actions.ts), not as a guest — so this exercises the equivalent
    // "no-grant" boundary: a caller with no token and no ownership of the
    // entity must still be denied, proving the reorder did not open a
    // blanket read on `rendered_page` under a closed policy.
    const entityId = await createRenderedPage({
      title: "No Token Page",
      htmlBody: "<p>content</p>",
      userId: TEST_USER_ID,
    });
    createdEntityIds.push(entityId);

    const response = await fetch(`${API_BASE}/entities/${entityId}/html`);
    expect(response.status).toBe(404);
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
    await setAccessPolicy("issue", "closed");
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

      const response = await fetch(
        `${API_BASE}/entities/${entityId}/html?access_token=${token}`
      );
      expect(response.status).toBe(403);
    } finally {
      await resetAccessPolicy("issue");
    }
  });
});
