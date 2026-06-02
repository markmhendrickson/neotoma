/**
 * Integration test: HTTP POST /retrieve_related_entities honours max_hops.
 *
 * Regression coverage for bringing the Express handler to parity with the MCP
 * handler (server.ts retrieveRelatedEntities), which already did breadth-first
 * multi-hop traversal. Before this, the HTTP endpoint ignored max_hops and
 * returned only 1-hop neighbours.
 *
 * Seeds a directed chain A -> B -> C -> D plus a back-edge D -> A to exercise
 * cycle protection, then asserts that traversal depth tracks max_hops.
 */

import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";
const API_PORT = 18137;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

describe("HTTP /retrieve_related_entities multi-hop traversal", () => {
  let httpServer: ReturnType<typeof createServer>;
  const suffix = String(process.hrtime.bigint());
  const a = `ent_mh_a_${suffix}`;
  const b = `ent_mh_b_${suffix}`;
  const c = `ent_mh_c_${suffix}`;
  const d = `ent_mh_d_${suffix}`;
  const entityIds = [a, b, c, d];

  // Directed chain a->b->c->d, plus a back-edge d->a to form a cycle.
  const edges: Array<{ source: string; target: string }> = [
    { source: a, target: b },
    { source: b, target: c },
    { source: c, target: d },
    { source: d, target: a },
  ];
  const relationshipKeys = edges.map((e) => `related_to:${e.source}:${e.target}`);

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });

    await db.from("entities").insert(
      entityIds.map((id) => ({
        id,
        entity_type: "thing",
        canonical_name: id,
        user_id: TEST_USER_ID,
      }))
    );

    await db.from("relationship_snapshots").insert(
      edges.map((e) => ({
        relationship_key: `related_to:${e.source}:${e.target}`,
        relationship_type: "related_to",
        source_entity_id: e.source,
        target_entity_id: e.target,
        schema_version: "1.0",
        snapshot: {},
        user_id: TEST_USER_ID,
      }))
    );
  });

  afterAll(async () => {
    for (const key of relationshipKeys) {
      await db.from("relationship_snapshots").delete().eq("relationship_key", key);
    }
    for (const id of entityIds) {
      await db.from("entities").delete().eq("id", id);
    }
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  async function relatedOutbound(maxHops: number): Promise<Set<string>> {
    const res = await fetch(`${API_BASE}/retrieve_related_entities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity_id: a,
        direction: "outbound",
        max_hops: maxHops,
        include_entities: true,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entities: Array<{ id: string }> };
    return new Set(body.entities.map((e) => e.id));
  }

  it("1-hop outbound returns only the direct neighbour", async () => {
    const ids = await relatedOutbound(1);
    expect(ids.has(b)).toBe(true);
    expect(ids.has(c)).toBe(false);
    expect(ids.has(d)).toBe(false);
  });

  it("2-hop outbound reaches the second-level neighbour", async () => {
    const ids = await relatedOutbound(2);
    expect(ids.has(b)).toBe(true);
    expect(ids.has(c)).toBe(true);
    expect(ids.has(d)).toBe(false);
  });

  it("3-hop outbound reaches the third-level neighbour", async () => {
    const ids = await relatedOutbound(3);
    expect(ids.has(b)).toBe(true);
    expect(ids.has(c)).toBe(true);
    expect(ids.has(d)).toBe(true);
  });

  it("does not loop forever on a cycle (d->a back-edge) and excludes the origin", async () => {
    // 4 hops would revisit `a` via d->a; visited-set must prevent re-expansion
    // and the origin entity must never appear in its own related set.
    const ids = await relatedOutbound(4);
    expect(ids.has(b)).toBe(true);
    expect(ids.has(c)).toBe(true);
    expect(ids.has(d)).toBe(true);
    expect(ids.has(a)).toBe(false);
  });
});
