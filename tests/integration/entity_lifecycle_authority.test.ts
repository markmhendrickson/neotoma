import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/db.js";
import { softDeleteEntity, restoreEntity, isEntityDeleted } from "../../src/services/deletion.js";
import { createCorrection } from "../../src/services/correction.js";
import { computeEntitySnapshotAtTime } from "../../src/services/entity_snapshot_at_time.js";

import { recomputeSnapshot } from "../../src/services/snapshot_computation.js";
import { getDb } from "../../src/repositories/db/connection.js";
import { queryEntities } from "../../src/services/entity_queries.js";
import { queryEntitiesWithCount } from "../../src/shared/action_handlers/entity_handlers.js";
import { substrateEventBus } from "../../src/events/substrate_event_bus.js";
import { migrateEntityLifecycleAuthority } from "../../src/services/entity_lifecycle_storage.js";

// These exercise the natural SQLite services. The three regressions are
// exercised after owned synthetic cutover; the temporal control
// binds the existing independent event/ingestion axes that must survive.
describe("authenticated entity lifecycle", () => {
  const owner = randomUUID();
  const type = "synthetic_lifecycle_authority";
  let id: string;
  beforeAll(async () => {
    if (!process.env.NEOTOMA_DATA_DIR?.endsWith("/.vitest"))
      throw new Error("Owned synthetic database required");
    await migrateEntityLifecycleAuthority(await getDb(), async (_tx, targets) => {
      for (const target of targets) await recomputeSnapshot(target.id, target.user_id, true);
    });
  });
  beforeEach(async () => {
    if (!process.env.NEOTOMA_DATA_DIR?.endsWith("/.vitest")) {
      throw new Error("Owned synthetic database required");
    }
    id = "ent_lifecycle_authority_" + randomUUID();
    expect(
      (
        await db
          .from("entities")
          .insert({ id, user_id: owner, entity_type: type, canonical_name: "Synthetic lifecycle" })
      ).error
    ).toBeNull();
    expect(
      (
        await db.from("observations").insert({
          id: randomUUID(),
          entity_id: id,
          user_id: owner,
          entity_type: type,
          schema_version: "1.0",
          fields: { title: "Synthetic factual value" },
          observed_at: "2025-01-01T00:00:00Z",
          source_priority: 10,
        })
      ).error
    ).toBeNull();
  });
  afterEach(async () => {
    await db.from("entity_snapshots").delete().eq("entity_id", id);
    await db.from("observations").delete().eq("entity_id", id);
    await db.from("entities").delete().eq("id", id);
  });
  it("separate equal-time actions serialize and preserve factual read/count semantics", async () => {
    const outcomes = await Promise.all([
      softDeleteEntity(id, type, owner, undefined, "2026-01-01T00:00:00Z"),
      restoreEntity(id, type, owner, undefined, "2026-01-01T00:00:00Z"),
      softDeleteEntity(id, type, owner, undefined, "2026-01-01T00:00:00Z"),
    ]);
    expect(outcomes.every((o) => o.success)).toBe(true);
    expect(new Set(outcomes.map((o) => o.observation_id)).size).toBe(3);
    const rows = await db
      .from("observations")
      .select("*")
      .eq("entity_id", id)
      .order("entity_lifecycle_sequence", { ascending: true });
    expect(
      rows.data?.filter((r) => r.entity_lifecycle_kind).map((r) => r.entity_lifecycle_sequence)
    ).toEqual([1, 2, 3]);
    expect(await isEntityDeleted(id, owner)).toBe(true);
    const hidden = await queryEntitiesWithCount({ userId: owner, entityType: type, limit: 100 });
    expect(hidden.total).toBe(0);
    expect(hidden.entities).toEqual([]);
    const audit = await queryEntities({
      userId: owner,
      entityType: type,
      limit: 100,
      includeDeleted: true,
    });
    expect(audit).toHaveLength(1);
    expect((await restoreEntity(id, type, owner)).success).toBe(true);
    const visible = await queryEntitiesWithCount({ userId: owner, entityType: type, limit: 100 });
    expect(visible.total).toBe(1);
    expect(visible.entities[0].snapshot.title).toBe("Synthetic factual value");
  });
  it("materialization failure rolls back append, snapshot and lifecycle notification", async () => {
    const database = await getDb();
    const before = await database.prepare("SELECT * FROM observations WHERE entity_id=?").all(id);
    const snapshot = await database
      .prepare("SELECT * FROM entity_snapshots WHERE entity_id=?")
      .get(id);
    const events: string[] = [];
    const listener = (ev: any) => {
      if (ev.entity_id === id && ["entity.deleted", "entity.restored"].includes(ev.event_type))
        events.push(ev.event_id);
    };
    substrateEventBus.onSubstrateEvent(listener);
    await database.exec(
      `CREATE TRIGGER synthetic_lifecycle_materialize_failure BEFORE DELETE ON entity_snapshots WHEN OLD.entity_id='${id}' BEGIN SELECT RAISE(ABORT,'Synthetic materialization failure'); END;`
    );
    try {
      expect((await softDeleteEntity(id, type, owner)).success).toBe(false);
      expect(
        await database.prepare("SELECT * FROM observations WHERE entity_id=?").all(id)
      ).toEqual(before);
      expect(
        await database.prepare("SELECT * FROM entity_snapshots WHERE entity_id=?").get(id)
      ).toEqual(snapshot);
      expect(events).toEqual([]);
    } finally {
      await database.exec("DROP TRIGGER synthetic_lifecycle_materialize_failure");
      substrateEventBus.off("substrate_event", listener);
    }
  });
  it("stored type, ownership and sequence exhaustion refuse without append", async () => {
    const database = await getDb();
    const before = (await db.from("observations").select("id").eq("entity_id", id)).data;
    expect((await softDeleteEntity(id, "foreign_type", owner)).success).toBe(false);
    expect((await restoreEntity(id, type, "foreign_owner")).not_found).toBe(true);
    expect((await db.from("observations").select("id").eq("entity_id", id)).data).toEqual(before);
    await database
      .prepare(
        "INSERT INTO observations(id,entity_id,entity_type,schema_version,user_id,observed_at,created_at,fields,source_priority,entity_lifecycle_kind,entity_lifecycle_sequence,entity_lifecycle_target_id) VALUES (?,?,?,'1.0',?,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','{\"_deleted\":false}',0,'restore',9007199254740991,?)"
      )
      .run(randomUUID(), id, type, owner, id);
    const full = await database.prepare("SELECT * FROM observations WHERE entity_id=?").all(id);
    expect((await softDeleteEntity(id, type, owner)).success).toBe(false);
    expect(await database.prepare("SELECT * FROM observations WHERE entity_id=?").all(id)).toEqual(
      full
    );
  });
  it("the second delete hides again after a restore", async () => {
    expect(
      (await softDeleteEntity(id, type, owner, undefined, "2026-01-01T00:00:00Z")).success
    ).toBe(true);
    expect(await isEntityDeleted(id, owner)).toBe(true);
    expect((await restoreEntity(id, type, owner, undefined, "2026-01-02T00:00:00Z")).success).toBe(
      true
    );
    expect(await isEntityDeleted(id, owner)).toBe(false);
    expect(
      (await softDeleteEntity(id, type, owner, undefined, "2026-01-03T00:00:00Z")).success
    ).toBe(true);
    expect(await isEntityDeleted(id, owner)).toBe(true);
  });
  it("a higher-priority ordinary fact cannot restore a deleted entity", async () => {
    expect(
      (await softDeleteEntity(id, type, owner, undefined, "2026-01-01T00:00:00Z")).success
    ).toBe(true);
    expect(await isEntityDeleted(id, owner)).toBe(true);
    expect(
      (
        await db.from("observations").insert({
          id: randomUUID(),
          entity_id: id,
          user_id: owner,
          entity_type: type,
          schema_version: "1.0",
          fields: { title: "Synthetic later fact" },
          observed_at: "2026-01-02T00:00:00Z",
          source_priority: 2000,
        })
      ).error
    ).toBeNull();
    expect(await isEntityDeleted(id, owner)).toBe(true);
  });
  it("an ordinary correction retains marker data without gaining lifecycle authority", async () => {
    await createCorrection({
      entity_id: id,
      entity_type: type,
      user_id: owner,
      schema_version: "1.0",
      field: "_deleted",
      value: true,
      idempotency_key: "synthetic-lifecycle-" + randomUUID(),
    });
    const rows = await db
      .from("observations")
      .select("fields")
      .eq("entity_id", id)
      .eq("source_priority", 1000);
    expect(rows.error).toBeNull();
    expect(rows.data).toHaveLength(1);
    expect(rows.data?.[0].fields).toEqual({ _deleted: true });
    expect(await isEntityDeleted(id, owner)).toBe(false);
  });
  it("event-only and ingestion-only filters remain independent and mixed filters use AND", async () => {
    expect(
      (
        await db
          .from("observations")
          .update({ created_at: "2024-01-01T00:00:00Z" })
          .eq("entity_id", id)
      ).error
    ).toBeNull();
    expect(
      (await softDeleteEntity(id, type, owner, undefined, "2024-02-01T00:00:00Z")).success
    ).toBe(true);
    const eventOnly = await computeEntitySnapshotAtTime(id, owner, "2025-12-31T00:00:00Z");
    const ingestionOnly = await computeEntitySnapshotAtTime(
      id,
      owner,
      undefined,
      "2025-12-31T00:00:00Z"
    );
    const both = await computeEntitySnapshotAtTime(
      id,
      owner,
      "2025-12-31T00:00:00Z",
      "2025-12-31T00:00:00Z"
    );
    expect(eventOnly?.snapshot).toEqual({});
    expect(eventOnly?.observation_count).toBe(0);
    expect(ingestionOnly?.snapshot.title).toBe("Synthetic factual value");
    expect(ingestionOnly?.observation_count).toBe(1);
    expect(both?.snapshot.title).toBe("Synthetic factual value");
    expect(both?.observation_count).toBe(1);
  });
});
