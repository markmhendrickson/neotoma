import { beforeAll, afterAll, expect, it, vi } from "vitest";
// Cutover is an explicit owned fixture action, never a mutation of the suite's
// shared pre-migration database or of the global HTTP fixture.
const isolated = await vi.hoisted(async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const original = process.env.NEOTOMA_DATA_DIR;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-synthetic-lifecycle-native-"));
  process.env.NEOTOMA_DATA_DIR = path.join(root, ".vitest");
  fs.mkdirSync(process.env.NEOTOMA_DATA_DIR, { recursive: true });
  vi.resetModules();
  return { original, root };
});

import { randomUUID } from "node:crypto";
import { db } from "../../src/db.js";
import { getDb } from "../../src/repositories/db/connection.js";
import { migrateEntityLifecycleAuthority } from "../../src/services/entity_lifecycle_storage.js";
import { recomputeSnapshot } from "../../src/services/snapshot_computation.js";
import { isEntityDeleted, restoreEntity } from "../../src/services/deletion.js";
import { computeEntitySnapshotAtTime } from "../../src/services/entity_snapshot_at_time.js";
import { applyCorrectionTransaction } from "../../src/services/correction_transaction.js";
import { getEntityWithProvenance } from "../../src/services/entity_queries.js";
const owner = "synthetic-legacy-owner",
  type = "synthetic_legacy_cutover";
const id = "ent_synthetic_legacy_" + randomUUID();
const fact = randomUUID(),
  marker = randomUUID();
const visibleId = "ent_synthetic_legacy_visible_" + randomUUID();
let before: Record<string, unknown>[];
beforeAll(async () => {
  await db
    .from("entities")
    .insert({ id, user_id: owner, entity_type: type, canonical_name: "Synthetic legacy" });
  for (const [observationId, fields, priority] of [
    [fact, { title: "Synthetic retained legacy fact" }, 10],
    [marker, { _deleted: true }, 2000],
  ] as const) {
    expect(
      (
        await db.from("observations").insert({
          id: observationId,
          entity_id: id,
          entity_type: type,
          user_id: owner,
          schema_version: "1.0",
          fields,
          source_priority: priority,
          observed_at: "2025-01-01T00:00:00Z",
          created_at: "2025-01-01T00:00:00Z",
        })
      ).error
    ).toBeNull();
  }
  expect(await isEntityDeleted(id, owner)).toBe(true);
  expect(
    (
      await db.from("entities").insert({
        id: visibleId,
        user_id: owner,
        entity_type: type,
        canonical_name: "Synthetic visible legacy",
      })
    ).error
  ).toBeNull();
  expect(
    (
      await db.from("observations").insert({
        id: randomUUID(),
        entity_id: visibleId,
        entity_type: type,
        user_id: owner,
        schema_version: "1.0",
        fields: { title: "Synthetic visible fact" },
        source_priority: 10,
        observed_at: "2025-01-01T00:00:00Z",
        created_at: "2025-01-01T00:00:00Z",
      })
    ).error
  ).toBeNull();
  await recomputeSnapshot(visibleId, owner);
  expect((await getEntityWithProvenance(visibleId, false, owner))?.observation_count).toBe(1);
  const database = await getDb();
  before = (await database
    .prepare("SELECT * FROM observations WHERE entity_id=? ORDER BY id")
    .all(id)) as Record<string, unknown>[];
  await migrateEntityLifecycleAuthority(database, async (_tx, targets) => {
    for (const target of targets) await recomputeSnapshot(target.id, target.user_id, true);
  });
});
afterAll(async () => {
  await (await getDb()).close();
  if (isolated.original === undefined) delete process.env.NEOTOMA_DATA_DIR;
  else process.env.NEOTOMA_DATA_DIR = isolated.original;
  const { rmSync } = await import("node:fs");
  rmSync(isolated.root, { recursive: true, force: true });
});
it("native cutover preserves original bytes, real audit growth and independent temporal fallback", async () => {
  const database = await getDb();
  for (const row of before) {
    const after = (await database
      .prepare("SELECT * FROM observations WHERE id=?")
      .get(row.id)) as Record<string, unknown>;
    for (const [name, value] of Object.entries(row)) expect(after[name]).toEqual(value);
  }
  const baseline = (
    await db
      .from("observations")
      .select("*")
      .eq("entity_id", id)
      .eq("entity_lifecycle_sequence", 0)
      .single()
  ).data;
  expect(baseline?.entity_lifecycle_kind).toBe("legacy_hidden");
  expect(baseline?.fields).toMatchObject({
    legacy_deleted: true,
    legacy_membership_count: 2,
    selected_legacy_observation_id: marker,
  });
  expect(await isEntityDeleted(id, owner)).toBe(true);
  expect(
    (await computeEntitySnapshotAtTime(id, owner, "2025-12-31T00:00:00Z", "2025-12-31T00:00:00Z"))
      ?.snapshot
  ).toEqual({});
  const restoration = await restoreEntity(id, type, owner, undefined, "2024-01-01T00:00:00Z");
  expect(restoration.success).toBe(true);
  expect(await isEntityDeleted(id, owner)).toBe(false);
  expect(
    (await computeEntitySnapshotAtTime(id, owner, "2025-12-31T00:00:00Z"))?.snapshot.title
  ).toBe("Synthetic retained legacy fact");
  expect(
    (await computeEntitySnapshotAtTime(id, owner, undefined, "2025-12-31T00:00:00Z"))?.snapshot
  ).toEqual({});
  expect(
    (await computeEntitySnapshotAtTime(id, owner, "2025-12-31T00:00:00Z", "2025-12-31T00:00:00Z"))
      ?.snapshot
  ).toEqual({});
  const audit = await db.from("observations").select("*").eq("entity_id", id);
  expect(audit.data).toHaveLength(4);
  const sourceBytes = audit.data?.filter((r) => [fact, marker].includes(r.id));
  expect(sourceBytes).toHaveLength(2);
});
it("the compatibility baseline invalidates an old observation-count CAS without modifying its receipt", async () => {
  const database = await getDb();
  const beforeRows = await database
    .prepare("SELECT * FROM observations WHERE entity_id=? ORDER BY id")
    .all(visibleId);
  const beforeReceipts = await database
    .prepare("SELECT id FROM observations WHERE idempotency_key LIKE 'correction-transaction:%'")
    .all();
  expect((await getEntityWithProvenance(visibleId, false, owner))?.observation_count).toBe(2);
  await expect(
    applyCorrectionTransaction({
      user_id: owner,
      idempotency_key: "synthetic-stale-cutover-" + randomUUID(),
      entities: [
        {
          entity_id: visibleId,
          entity_type: type,
          expected_observation_count: 1,
          expected_snapshot: { title: "Synthetic visible fact" },
          changes: [{ field: "title", value: "Must not apply" }],
        },
      ],
    })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(
    await database
      .prepare("SELECT * FROM observations WHERE entity_id=? ORDER BY id")
      .all(visibleId)
  ).toEqual(beforeRows);
  expect(
    await database
      .prepare("SELECT id FROM observations WHERE idempotency_key LIKE 'correction-transaction:%'")
      .all()
  ).toEqual(beforeReceipts);
  expect((await getEntityWithProvenance(visibleId, false, owner))?.snapshot.title).toBe(
    "Synthetic visible fact"
  );
});
it("an erased captured identity makes historical proof unavailable, never re-infers membership", async () => {
  await db.from("observations").delete().eq("id", fact);
  await expect(computeEntitySnapshotAtTime(id, owner, "2025-12-31T00:00:00Z")).rejects.toThrow(
    /acquisition/
  );
  await expect(migrateEntityLifecycleAuthority(await getDb(), async () => {})).rejects.toThrow(
    /acquisition/
  );
  await db.from("observations").delete().eq("entity_id", id);
  await expect(computeEntitySnapshotAtTime(id, owner, "2025-12-31T00:00:00Z")).rejects.toThrow(
    /acquisition/
  );
  await expect(isEntityDeleted(id, owner)).rejects.toThrow(/acquisition/);
  const refused = await recomputeSnapshot(id, owner).then(
    () => false,
    (error) => error.code === "ERR_ENTITY_LIFECYCLE_ACQUISITION"
  );
  expect(refused).toBe(true);
});
