/**
 * Integration test: /list_relationships pagination (issues #367, #369).
 *
 * #367: pagination must be pushed to the DB (.range() + count: "exact") rather
 *       than loading the full result set into memory and slicing.
 * #369: the response declares `total_count` (canonical, matching
 *       /retrieve_graph_neighborhood) alongside the deprecated `total` alias.
 */
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000077";
const API_PORT = 18127;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

function makeEntityId(tag: string): string {
  const hex = createHash("sha256").update(tag).digest("hex").slice(0, 24);
  return `ent_${hex}`;
}

describe("/list_relationships pagination (#367, #369)", () => {
  let httpServer: ReturnType<typeof createServer>;
  const sourceId = makeEntityId(`lrp-source-${Date.now()}`);
  const REL_COUNT = 6;
  const targetIds: string[] = [];
  const relationshipKeys: string[] = [];

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });

    await db.from("entities").insert({
      id: sourceId,
      user_id: TEST_USER_ID,
      entity_type: "note",
      canonical_name: "lrp-source",
    });

    for (let i = 0; i < REL_COUNT; i++) {
      const targetId = makeEntityId(`lrp-target-${i}-${Date.now()}`);
      targetIds.push(targetId);
      await db.from("entities").insert({
        id: targetId,
        user_id: TEST_USER_ID,
        entity_type: "note",
        canonical_name: `lrp-target-${i}`,
      });

      const relationshipType = "REFERS_TO";
      const relationshipKey = `${relationshipType}:${sourceId}:${targetId}`;
      relationshipKeys.push(relationshipKey);
      // Stagger last_observation_at so ordering is deterministic and pages are
      // stable.
      const ts = new Date(Date.now() + i * 1000).toISOString();
      await db.from("relationship_snapshots").upsert({
        relationship_key: relationshipKey,
        relationship_type: relationshipType,
        source_entity_id: sourceId,
        target_entity_id: targetId,
        schema_version: "1.0",
        snapshot: {},
        computed_at: ts,
        observation_count: 1,
        last_observation_at: ts,
        provenance: {},
        user_id: TEST_USER_ID,
      });
    }
  });

  afterAll(async () => {
    await db.from("relationship_snapshots").delete().in("relationship_key", relationshipKeys);
    await db
      .from("entities")
      .delete()
      .in("id", [sourceId, ...targetIds]);
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  async function listRelationships(body: Record<string, unknown>) {
    const resp = await fetch(`${API_BASE}/list_relationships`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: TEST_USER_ID, ...body }),
    });
    return resp.json() as Promise<Record<string, unknown>>;
  }

  it("reports total_count equal to all relationships before pagination", async () => {
    const body = await listRelationships({ source_entity_id: sourceId, limit: 100, offset: 0 });
    expect(body.total_count).toBe(REL_COUNT);
    // Deprecated alias retained for back-compat.
    expect(body.total).toBe(REL_COUNT);
  });

  it("returns only `limit` rows per page (DB-side .range())", async () => {
    const body = await listRelationships({ source_entity_id: sourceId, limit: 2, offset: 0 });
    expect((body.relationships as unknown[]).length).toBe(2);
    expect(body.total_count).toBe(REL_COUNT);
    expect(body.limit).toBe(2);
    expect(body.offset).toBe(0);
  });

  it("pages disjointly across the full result set", async () => {
    const keysOf = (b: Record<string, unknown>) =>
      (b.relationships as Array<{ relationship_key: string }>).map((r) => r.relationship_key);

    const page1 = await listRelationships({ source_entity_id: sourceId, limit: 2, offset: 0 });
    const page2 = await listRelationships({ source_entity_id: sourceId, limit: 2, offset: 2 });
    const page3 = await listRelationships({ source_entity_id: sourceId, limit: 2, offset: 4 });

    const all = [...keysOf(page1), ...keysOf(page2), ...keysOf(page3)];
    const unique = new Set(all);
    expect(unique.size).toBe(all.length);
    expect(unique.size).toBe(REL_COUNT);
  });

  it("offset beyond total returns empty page but accurate total_count", async () => {
    const body = await listRelationships({
      source_entity_id: sourceId,
      limit: 10,
      offset: REL_COUNT + 5,
    });
    expect((body.relationships as unknown[]).length).toBe(0);
    expect(body.total_count).toBe(REL_COUNT);
  });

  it("total_count is consistent across pages", async () => {
    const p1 = await listRelationships({ source_entity_id: sourceId, limit: 2, offset: 0 });
    const p2 = await listRelationships({ source_entity_id: sourceId, limit: 2, offset: 2 });
    expect(p1.total_count).toBe(p2.total_count);
  });
});
