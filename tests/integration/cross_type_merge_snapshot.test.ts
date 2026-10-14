/**
 * Regression test: a cross-type merge must not break snapshot recompute.
 *
 * mergeEntities (used by plural-type repair) repoints observations onto the
 * survivor without rewriting their entity_type. Before the lifecycle
 * cutover, the entity-lifecycle selector refused any observation set whose
 * entity_type was not uniform, so the survivor's snapshot recompute threw,
 * later writes to it errored after persisting, and point-in-time reads
 * failed. Pre-cutover installs must keep the legacy reducer's behavior.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../../src/db.js";
import { mergeEntities } from "../../src/services/entity_merge.js";
import { createObservation } from "../../src/services/observation_storage.js";
import { recomputeSnapshot } from "../../src/services/snapshot_computation.js";

const USER = "test-cross-type-merge-snapshot";
const SURVIVOR = "ent_xtype_merge_survivor";
const MERGED = "ent_xtype_merge_plural";

async function seedEntity(id: string, entityType: string): Promise<void> {
  const now = new Date().toISOString();
  await db.from("entities").insert({
    id,
    user_id: USER,
    entity_type: entityType,
    canonical_name: id,
    created_at: now,
    updated_at: now,
  });
}

async function observe(
  entityId: string,
  entityType: string,
  fields: Record<string, unknown>,
  observedAt: string
) {
  await createObservation({
    entity_id: entityId,
    entity_type: entityType,
    schema_version: "1.0",
    source_id: null,
    interpretation_id: null,
    observed_at: observedAt,
    specificity_score: 1,
    source_priority: 10,
    observation_source: "human",
    fields,
    user_id: USER,
  });
}

async function cleanup(): Promise<void> {
  await db.from("entity_merges").delete().eq("user_id", USER);
  await db.from("entity_snapshots").delete().eq("user_id", USER);
  await db.from("observations").delete().eq("user_id", USER);
  await db.from("entities").delete().eq("user_id", USER);
}

describe("cross-type merge keeps snapshot recompute working (pre-cutover)", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("survivor recomputes, accepts new writes, and reflects them", async () => {
    await seedEntity(SURVIVOR, "xtype_widget");
    await seedEntity(MERGED, "xtype_widgets");
    await observe(SURVIVOR, "xtype_widget", { title: "singular" }, "2026-01-01T00:00:00.000Z");
    await observe(MERGED, "xtype_widgets", { color: "blue" }, "2026-01-02T00:00:00.000Z");

    await mergeEntities({
      fromEntityId: MERGED,
      toEntityId: SURVIVOR,
      userId: USER,
      mergeReason: "plural type repair",
      mergedBy: "test",
    });

    const merged = await recomputeSnapshot(SURVIVOR, USER);
    expect(merged).not.toBeNull();
    expect(merged!.snapshot).toMatchObject({ title: "singular", color: "blue" });

    // A later write to the survivor must succeed and land in the snapshot.
    await observe(SURVIVOR, "xtype_widget", { title: "updated" }, "2026-01-03T00:00:00.000Z");
    const after = await recomputeSnapshot(SURVIVOR, USER);
    expect(after!.snapshot).toMatchObject({ title: "updated", color: "blue" });

    const { data: stored } = await db
      .from("entity_snapshots")
      .select("snapshot")
      .eq("entity_id", SURVIVOR)
      .eq("user_id", USER)
      .single();
    const snapshot =
      typeof stored!.snapshot === "string" ? JSON.parse(stored!.snapshot) : stored!.snapshot;
    expect(snapshot).toMatchObject({ title: "updated", color: "blue" });
  });
});
