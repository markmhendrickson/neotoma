import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/db.js";
import { getDb } from "../../src/repositories/db/connection.js";
import { observationReducer } from "../../src/reducers/observation_reducer.js";
import { resolveOwnedObservations } from "../../src/services/attachment_resolution.js";
import { createCorrection } from "../../src/services/correction.js";
import { migrateEntityLifecycleAuthority } from "../../src/services/entity_lifecycle_storage.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { recomputeSnapshot } from "../../src/services/snapshot_computation.js";
import {
  resetSnapshotIncrementalStats,
  snapshotIncrementalStats,
  snapshotRowDigest,
} from "../../src/services/snapshot_incremental.js";
import { cleanupTestSchema } from "../helpers/cleanup_helpers.js";

// After the entity lifecycle cutover, visibility comes from the lifecycle
// context rather than the legacy selector, and the snapshot's observation
// count includes the entity's lifecycle baseline row. A correction that takes
// the incremental snapshot path must still persist exactly what a full rebuild
// does. Runs on the owned synthetic database, like entity_lifecycle_authority.
const TYPE = "synthetic_incremental_snapshot_lifecycle_cutover";
const owner = LOCAL_DEV_USER_ID;

async function expectEqualsFullRebuild(id: string): Promise<Record<string, unknown>> {
  const { data } = await db
    .from("entity_snapshots")
    .select("*")
    .eq("entity_id", id)
    .eq("user_id", owner)
    .single();
  const stored = data as Record<string, unknown>;
  const observations = await resolveOwnedObservations(id, owner);
  const full = await observationReducer.computeSnapshot(id, observations ?? []);
  expect(full).not.toBeNull();
  expect(snapshotRowDigest(stored)).toBe(snapshotRowDigest(full as Record<string, unknown>));
  return stored;
}

describe("incremental correction snapshot after the lifecycle cutover", () => {
  const ids: string[] = [];

  beforeAll(async () => {
    if (!process.env.NEOTOMA_DATA_DIR?.endsWith("/.vitest")) {
      throw new Error("Owned synthetic database required");
    }
    await schemaRegistry.register({
      entity_type: TYPE,
      schema_version: "1.0",
      schema_definition: {
        fields: {
          title: { type: "string", required: false },
          notes: { type: "string", required: false },
          tags: { type: "array", required: false },
        },
        canonical_name_fields: ["title"],
      },
      reducer_config: {
        merge_policies: {
          title: { strategy: "last_write" },
          notes: { strategy: "last_write" },
          tags: { strategy: "merge_array" },
        },
      },
      activate: true,
    });
    await migrateEntityLifecycleAuthority(await getDb(), async (_tx, targets) => {
      for (const target of targets) await recomputeSnapshot(target.id, target.user_id, true);
    });
  });

  afterAll(async () => {
    for (const id of ids) {
      await db.from("entity_snapshots").delete().eq("entity_id", id);
      await db.from("observations").delete().eq("entity_id", id);
      await db.from("entities").delete().eq("id", id);
    }
    await cleanupTestSchema(TYPE, null);
  });

  it("persists the same snapshot a full rebuild produces", async () => {
    const id = `ent_incr_cutover_${randomUUID()}`;
    ids.push(id);
    await db
      .from("entities")
      .insert({ id, user_id: owner, entity_type: TYPE, canonical_name: "Cutover incremental" });
    for (let i = 0; i < 12; i++) {
      const { error } = await db.from("observations").insert({
        id: randomUUID(),
        entity_id: id,
        user_id: owner,
        entity_type: TYPE,
        schema_version: "1.0",
        fields: { title: "Cutover incremental", tags: [`t${i % 3}`] },
        observed_at: new Date(Date.now() - 60_000 + i * 10).toISOString(),
        source_priority: 10,
      });
      expect(error).toBeNull();
    }
    await recomputeSnapshot(id, owner, true);

    resetSnapshotIncrementalStats();
    const writes: Array<[string, unknown]> = [
      ["notes", "corrected after cutover"],
      ["tags", ["only"]],
      ["notes", null],
      ["title", "Cutover incremental, renamed"],
    ];
    for (const [field, value] of writes) {
      await new Promise((resolve) => setTimeout(resolve, 2));
      await createCorrection({
        entity_id: id,
        entity_type: TYPE,
        field,
        value,
        schema_version: "1.0",
        user_id: owner,
        idempotency_key: `cutover-${id}-${field}-${String(value)}`,
      });
      await expectEqualsFullRebuild(id);
    }
    expect(snapshotIncrementalStats.applied).toBe(writes.length);
    const stored = await expectEqualsFullRebuild(id);
    expect((stored.snapshot as Record<string, unknown>).tags).toEqual(["only"]);
    expect(stored.snapshot as Record<string, unknown>).not.toHaveProperty("notes");
  });
});
