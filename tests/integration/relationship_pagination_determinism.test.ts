/**
 * Integration test: deterministic pagination order for relationship endpoints.
 *
 * Regression coverage for issue #368 — non-deterministic pagination order on
 * /list_relationships and /retrieve_graph_neighborhood.
 *
 * The key fixture property here is that EVERY relationship row shares the SAME
 * `last_observation_at` value. This is the tie case: the primary sort key
 * (`last_observation_at DESC`) cannot disambiguate any two rows, so ordering is
 * fully determined by the stable secondary sort key (`relationship_key ASC`).
 *
 * Without a stable tiebreaker, the underlying store is free to return tied rows
 * in any order across calls, which breaks pagination stability (items drift
 * between pages). These tests assert:
 *   1. Identical ordering across repeated calls (stability).
 *   2. Disjoint, gap-free page boundaries that cover the full result set
 *      (correct pagination under a tie).
 *   3. The order matches the deterministic convention (relationship_key ASC),
 *      per docs/architecture/determinism.md (stable secondary sort key).
 */

import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000371";
const API_PORT = 18121;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

// Every relationship row gets THIS exact timestamp — the tie that forces the
// secondary sort key to decide ordering.
const SHARED_OBSERVED_AT = "2026-01-01T00:00:00.000Z";

/** Build a stable fake Neotoma entity id from a short tag. */
function makeEntityId(tag: string): string {
  const hex = createHash("sha256").update(tag).digest("hex").slice(0, 24);
  return `ent_${hex}`;
}

describe("relationship pagination determinism (#368)", () => {
  let httpServer: ReturnType<typeof createServer>;

  const runTag = `pgd-${Date.now()}`;
  const centerEntityId = makeEntityId(`${runTag}-center`);
  const REL_COUNT = 5;
  const spokeEntityIds: string[] = [];
  const createdRelationshipKeys: string[] = [];

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });

    await db.from("entities").insert({
      id: centerEntityId,
      user_id: TEST_USER_ID,
      entity_type: "note",
      canonical_name: "pgd-center",
    });

    // Insert spokes and relationships. All snapshots share SHARED_OBSERVED_AT so
    // last_observation_at cannot break ties; relationship_key must.
    for (let i = 0; i < REL_COUNT; i++) {
      const spokeId = makeEntityId(`${runTag}-spoke-${i}`);
      spokeEntityIds.push(spokeId);

      await db.from("entities").insert({
        id: spokeId,
        user_id: TEST_USER_ID,
        entity_type: "note",
        canonical_name: `pgd-spoke-${i}`,
      });

      const relationshipType = "REFERS_TO";
      const relationshipKey = `${relationshipType}:${centerEntityId}:${spokeId}`;
      createdRelationshipKeys.push(relationshipKey);

      await db.from("relationship_observations").insert({
        id: createHash("sha256").update(`${relationshipKey}:obs`).digest("hex"),
        relationship_key: relationshipKey,
        source_entity_id: centerEntityId,
        target_entity_id: spokeId,
        relationship_type: relationshipType,
        source_priority: 1,
        metadata: {},
        canonical_hash: createHash("sha256").update(relationshipKey).digest("hex"),
        user_id: TEST_USER_ID,
        observed_at: SHARED_OBSERVED_AT,
        provenance: {},
      });

      await db.from("relationship_snapshots").upsert({
        relationship_key: relationshipKey,
        relationship_type: relationshipType,
        source_entity_id: centerEntityId,
        target_entity_id: spokeId,
        schema_version: "1.0",
        snapshot: {},
        computed_at: SHARED_OBSERVED_AT,
        observation_count: 1,
        last_observation_at: SHARED_OBSERVED_AT,
        provenance: {},
        user_id: TEST_USER_ID,
      });
    }
  });

  afterAll(async () => {
    await db.from("relationship_snapshots").delete().in("relationship_key", createdRelationshipKeys);
    await db
      .from("relationship_observations")
      .delete()
      .in("relationship_key", createdRelationshipKeys);
    await db.from("entities").delete().in("id", [centerEntityId, ...spokeEntityIds]);
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  async function listRelationships(params: Record<string, unknown>) {
    const resp = await fetch(`${API_BASE}/list_relationships`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: TEST_USER_ID, ...params }),
    });
    return resp.json() as Promise<Record<string, unknown>>;
  }

  async function neighborhood(params: Record<string, unknown>) {
    const resp = await fetch(`${API_BASE}/retrieve_graph_neighborhood`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        node_id: centerEntityId,
        user_id: TEST_USER_ID,
        ...params,
      }),
    });
    return resp.json() as Promise<Record<string, unknown>>;
  }

  function keysOf(body: Record<string, unknown>): string[] {
    return (body.relationships as Array<{ relationship_key: string }>).map(
      (r) => r.relationship_key
    );
  }

  // The deterministic order under the tie: relationship_key ascending.
  // Computed lazily inside each test because `createdRelationshipKeys` is
  // populated in `beforeAll`, which runs after the describe body is evaluated.
  const expectedOrder = (): string[] =>
    [...createdRelationshipKeys].sort((a, b) => a.localeCompare(b));

  describe("/list_relationships", () => {
    it("returns an identical full-page order across repeated calls (tie on last_observation_at)", async () => {
      const a = keysOf(await listRelationships({ entity_id: centerEntityId, limit: REL_COUNT }));
      const b = keysOf(await listRelationships({ entity_id: centerEntityId, limit: REL_COUNT }));
      const c = keysOf(await listRelationships({ entity_id: centerEntityId, limit: REL_COUNT }));

      expect(a).toHaveLength(REL_COUNT);
      expect(b).toEqual(a);
      expect(c).toEqual(a);
    });

    it("orders tied rows by the stable secondary key (relationship_key ASC)", async () => {
      const keys = keysOf(await listRelationships({ entity_id: centerEntityId, limit: REL_COUNT }));
      expect(keys).toEqual(expectedOrder());
    });

    it("pages with a tie are disjoint, gap-free, and cover the full set", async () => {
      // Page across the tied rows two at a time.
      const page1 = keysOf(
        await listRelationships({ entity_id: centerEntityId, limit: 2, offset: 0 })
      );
      const page2 = keysOf(
        await listRelationships({ entity_id: centerEntityId, limit: 2, offset: 2 })
      );
      const page3 = keysOf(
        await listRelationships({ entity_id: centerEntityId, limit: 2, offset: 4 })
      );

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      expect(page3).toHaveLength(1);

      const concatenated = [...page1, ...page2, ...page3];
      // No row appears on two pages.
      expect(new Set(concatenated).size).toBe(REL_COUNT);
      // Concatenating pages reproduces the single-page deterministic order.
      expect(concatenated).toEqual(expectedOrder());
    });

    it("page boundaries are stable across repeated paginated calls", async () => {
      const first = keysOf(
        await listRelationships({ entity_id: centerEntityId, limit: 2, offset: 2 })
      );
      const second = keysOf(
        await listRelationships({ entity_id: centerEntityId, limit: 2, offset: 2 })
      );
      expect(second).toEqual(first);
    });
  });

  describe("/retrieve_graph_neighborhood", () => {
    it("returns an identical relationship order across repeated calls (tie on last_observation_at)", async () => {
      const a = keysOf(await neighborhood({ limit: REL_COUNT }));
      const b = keysOf(await neighborhood({ limit: REL_COUNT }));
      const c = keysOf(await neighborhood({ limit: REL_COUNT }));

      expect(a).toHaveLength(REL_COUNT);
      expect(b).toEqual(a);
      expect(c).toEqual(a);
    });

    it("orders tied rows by the stable secondary key (relationship_key ASC)", async () => {
      const keys = keysOf(await neighborhood({ limit: REL_COUNT }));
      expect(keys).toEqual(expectedOrder());
    });

    it("pages with a tie are disjoint, gap-free, and cover the full set", async () => {
      const page1 = keysOf(await neighborhood({ limit: 2, offset: 0 }));
      const page2 = keysOf(await neighborhood({ limit: 2, offset: 2 }));
      const page3 = keysOf(await neighborhood({ limit: 2, offset: 4 }));

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      expect(page3).toHaveLength(1);

      const concatenated = [...page1, ...page2, ...page3];
      expect(new Set(concatenated).size).toBe(REL_COUNT);
      expect(concatenated).toEqual(expectedOrder());
    });

    it("page boundaries are stable across repeated paginated calls", async () => {
      const first = keysOf(await neighborhood({ limit: 2, offset: 2 }));
      const second = keysOf(await neighborhood({ limit: 2, offset: 2 }));
      expect(second).toEqual(first);
    });
  });
});
