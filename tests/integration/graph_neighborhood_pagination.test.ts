/**
 * Integration test: retrieve_graph_neighborhood pagination.
 *
 * Verifies that limit/offset parameters correctly page through relationships
 * and that total_count/has_more are accurate.
 */

import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
const API_PORT = 18120;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

/** Build a stable fake Neotoma entity id from a short tag. */
function makeEntityId(tag: string): string {
  const hex = createHash("sha256").update(tag).digest("hex").slice(0, 24);
  return `ent_${hex}`;
}

describe("retrieve_graph_neighborhood pagination", () => {
  let httpServer: ReturnType<typeof createServer>;

  // Central node that will accumulate many relationships
  const centerEntityId = makeEntityId(`pgn-center-${Date.now()}`);
  // Spoke entities: we create 5 relationships (center -> spoke_i)
  const SPOKE_COUNT = 5;
  const spokeEntityIds: string[] = [];
  const createdRelationshipKeys: string[] = [];

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });

    // Insert center entity
    await db.from("entities").insert({
      id: centerEntityId,
      user_id: TEST_USER_ID,
      entity_type: "note",
      canonical_name: `pgn-center`,
    });

    // Insert spoke entities and relationships
    for (let i = 0; i < SPOKE_COUNT; i++) {
      const spokeId = makeEntityId(`pgn-spoke-${i}-${Date.now()}`);
      spokeEntityIds.push(spokeId);

      await db.from("entities").insert({
        id: spokeId,
        user_id: TEST_USER_ID,
        entity_type: "note",
        canonical_name: `pgn-spoke-${i}`,
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
        observed_at: new Date().toISOString(),
        provenance: {},
      });

      await db.from("relationship_snapshots").upsert({
        relationship_key: relationshipKey,
        relationship_type: relationshipType,
        source_entity_id: centerEntityId,
        target_entity_id: spokeId,
        schema_version: "1.0",
        snapshot: {},
        computed_at: new Date().toISOString(),
        observation_count: 1,
        last_observation_at: new Date().toISOString(),
        provenance: {},
        user_id: TEST_USER_ID,
      });
    }
  });

  afterAll(async () => {
    // Clean up relationship data
    await db
      .from("relationship_snapshots")
      .delete()
      .in("relationship_key", createdRelationshipKeys);
    await db
      .from("relationship_observations")
      .delete()
      .in("relationship_key", createdRelationshipKeys);

    // Clean up entities
    const allEntityIds = [centerEntityId, ...spokeEntityIds];
    await db.from("entities").delete().in("id", allEntityIds);

    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  async function callNeighborhood(params: Record<string, unknown>) {
    const resp = await fetch(`${API_BASE}/retrieve_graph_neighborhood`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // user_id override is honored on loopback (LOCAL_DEV_USER_ID admission).
      // Required since the handler now scopes by authenticated user_id for #365.
      body: JSON.stringify({ node_id: centerEntityId, user_id: TEST_USER_ID, ...params }),
    });
    return resp.json() as Promise<Record<string, unknown>>;
  }

  it("returns total_count equal to all relationships for the node", async () => {
    const body = await callNeighborhood({ limit: 100, offset: 0 });
    expect(body.total_count).toBe(SPOKE_COUNT);
  });

  it("returns has_more: false when all relationships fit in one page", async () => {
    const body = await callNeighborhood({ limit: 100, offset: 0 });
    expect(body.has_more).toBe(false);
  });

  it("returns has_more: true when limit is smaller than total", async () => {
    const body = await callNeighborhood({ limit: 2, offset: 0 });
    expect(body.has_more).toBe(true);
    expect((body.relationships as unknown[]).length).toBe(2);
  });

  it("respects offset: subsequent page returns remaining relationships", async () => {
    const page1 = await callNeighborhood({ limit: 2, offset: 0 });
    const page2 = await callNeighborhood({ limit: 2, offset: 2 });
    const page3 = await callNeighborhood({ limit: 2, offset: 4 });

    const rels1 = (page1.relationships as Array<{ relationship_key: string }>).map(
      (r) => r.relationship_key
    );
    const rels2 = (page2.relationships as Array<{ relationship_key: string }>).map(
      (r) => r.relationship_key
    );
    const rels3 = (page3.relationships as Array<{ relationship_key: string }>).map(
      (r) => r.relationship_key
    );

    // Pages must be disjoint
    const allKeys = [...rels1, ...rels2, ...rels3];
    const uniqueKeys = new Set(allKeys);
    expect(uniqueKeys.size).toBe(allKeys.length);

    // Together they must cover all SPOKE_COUNT relationships
    expect(uniqueKeys.size).toBe(SPOKE_COUNT);

    // Last page has_more should be false (offset 4 + limit 2 = 6 >= 5)
    expect(page3.has_more).toBe(false);
  });

  it("offset beyond total returns empty relationships and has_more: false", async () => {
    const body = await callNeighborhood({ limit: 10, offset: SPOKE_COUNT + 10 });
    expect((body.relationships as unknown[]).length).toBe(0);
    expect(body.has_more).toBe(false);
    expect(body.total_count).toBe(SPOKE_COUNT);
  });

  it("total_count is consistent across pages", async () => {
    const p1 = await callNeighborhood({ limit: 2, offset: 0 });
    const p2 = await callNeighborhood({ limit: 2, offset: 2 });
    expect(p1.total_count).toBe(p2.total_count);
  });
});
