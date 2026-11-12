import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/db.js";
import { getDb } from "../../src/repositories/db/connection.js";
import { correctionSpeculationStats, createCorrection } from "../../src/services/correction.js";
import { migrateEntityLifecycleAuthority } from "../../src/services/entity_lifecycle_storage.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { recomputeSnapshot } from "../../src/services/snapshot_computation.js";
import { stableSerialize } from "../../src/services/stable_serialize.js";
import { cleanupTestSchema } from "../helpers/cleanup_helpers.js";

// A correction that takes the off-gate snapshot path must persist exactly what a
// full recompute does once the entity lifecycle cutover is installed, because
// visibility then comes from the lifecycle context rather than the legacy
// selector. Runs on the owned synthetic database, like entity_lifecycle_authority.
const TYPE = "synthetic_speculative_lifecycle_cutover";
const owner = LOCAL_DEV_USER_ID;

describe("speculative correction snapshot after the lifecycle cutover", () => {
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

  it("persists the same snapshot a full recompute produces", async () => {
    const id = `ent_spec_cutover_${randomUUID()}`;
    ids.push(id);
    await db
      .from("entities")
      .insert({ id, user_id: owner, entity_type: TYPE, canonical_name: "Cutover speculative" });
    for (let i = 0; i < 12; i++) {
      const { error } = await db.from("observations").insert({
        id: randomUUID(),
        entity_id: id,
        user_id: owner,
        entity_type: TYPE,
        schema_version: "1.0",
        fields: { title: "Cutover speculative", tags: [`t${i % 3}`] },
        observed_at: new Date(Date.now() - 60_000 + i * 10).toISOString(),
        source_priority: 10,
      });
      expect(error).toBeNull();
    }
    await recomputeSnapshot(id, owner, true);

    const fastBefore = correctionSpeculationStats.fastPathPersists;
    await createCorrection({
      entity_id: id,
      entity_type: TYPE,
      field: "notes",
      value: "corrected after cutover",
      schema_version: "1.0",
      user_id: owner,
      idempotency_key: `cutover-${id}`,
    });
    expect(correctionSpeculationStats.fastPathPersists).toBe(fastBefore + 1);

    const read = async () =>
      stableSerialize(
        (await db.from("entity_snapshots").select("*").eq("entity_id", id).single()).data
      );
    const persisted = await read();
    expect(JSON.parse(persisted).snapshot.notes).toBe("corrected after cutover");
    await recomputeSnapshot(id, owner, true);
    expect(await read()).toBe(persisted);
  });
});
