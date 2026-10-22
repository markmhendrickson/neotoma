/**
 * Verifies the relationship_snapshots traversal indexes (#1467) exist and are
 * actually used by the per-hop traversal queries.
 *
 * Graph traversal (retrieve_related_entities / retrieve_graph_neighborhood)
 * queries relationship_snapshots by (source_entity_id, user_id) and
 * (target_entity_id, user_id) at every hop. Without composite indexes these are
 * full table scans, so deep traversal cost grows with total table size. These
 * indexes make each hop an indexed lookup.
 */

import { describe, it, expect } from "vitest";
import { getDb } from "../../src/repositories/db/connection.js";

describe("relationship_snapshots traversal indexes (#1467)", () => {
  it("creates the source and target composite indexes", async () => {
    const db = await getDb();
    const rows = (await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'relationship_snapshots'"
      )
      .all()) as Array<{ name: string }>;
    const names = rows.map((r) => r.name);
    expect(names).toContain("idx_rel_snapshots_source_user");
    expect(names).toContain("idx_rel_snapshots_target_user");
  });

  it("uses the source index for an outbound-hop query (not a full scan)", async () => {
    const db = await getDb();
    const plan = (await db
      .prepare(
        "EXPLAIN QUERY PLAN SELECT * FROM relationship_snapshots WHERE source_entity_id = ? AND user_id = ?"
      )
      .all("ent_x", "user_y")) as Array<{ detail: string }>;
    const detail = plan.map((p) => p.detail).join(" ");
    expect(detail).toMatch(/USING INDEX idx_rel_snapshots_source_user/);
    expect(detail).not.toMatch(/SCAN relationship_snapshots\b(?!.*USING INDEX)/);
  });

  it("uses the target index for an inbound-hop query (not a full scan)", async () => {
    const db = await getDb();
    const plan = (await db
      .prepare(
        "EXPLAIN QUERY PLAN SELECT * FROM relationship_snapshots WHERE target_entity_id = ? AND user_id = ?"
      )
      .all("ent_x", "user_y")) as Array<{ detail: string }>;
    const detail = plan.map((p) => p.detail).join(" ");
    expect(detail).toMatch(/USING INDEX idx_rel_snapshots_target_user/);
  });
});
