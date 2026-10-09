import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/db.js";
import { softDeleteEntity, restoreEntity, isEntityDeleted } from "../../src/services/deletion.js";
import { createCorrection } from "../../src/services/correction.js";
import { computeEntitySnapshotAtTime } from "../../src/services/entity_snapshot_at_time.js";

// These exercise the natural SQLite services. The three regressions are
// intentionally red on the pre-authority implementation; the temporal control
// binds the existing independent event/ingestion axes that must survive.
describe("authenticated entity lifecycle", () => {
  const owner = randomUUID();
  const type = "synthetic_lifecycle_authority";
  let id: string;
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
        await db
          .from("observations")
          .insert({
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
        await db
          .from("observations")
          .insert({
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
