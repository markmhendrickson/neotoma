/**
 * Deleted entities stay excluded from the entity query page AND its `total`
 * after the ateles#576 performance fix.
 *
 * The count and the delete-filter no longer re-derive liveness from the
 * observation log — they resolve it from the PRESENCE of an `entity_snapshots`
 * row. (There is no `is_live` column on `entity_snapshots`; a materialized flag
 * was implemented and then backed out in favour of row presence, which the write
 * path already maintains.)
 *
 * Row presence alone is not sufficient, and #2267 review caught two states that
 * also lack a snapshot row while being perfectly live. Both are pinned below:
 *
 *   - MERGED-AWAY: `mergeEntities` moves the observations onto the survivor and
 *     deletes the snapshot row, so `include_merged: true` must not be answered
 *     from the snapshot table alone.
 *   - NEVER-OBSERVED: an `entities` row written with no observation never gets a
 *     snapshot, and must not be mistaken for deleted.
 *
 * These tests drive the real service functions (softDeleteEntity / restoreEntity
 * / mergeEntities) and assert on the real read path rather than on any flag.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../../src/db.js";
import { softDeleteEntity, restoreEntity } from "../../src/services/deletion.js";
import { mergeEntities } from "../../src/services/entity_merge.js";
import { queryEntitiesWithCount } from "../../src/shared/action_handlers/entity_handlers.js";

const userId = "test-576-liveness-user";
const entityType = "test_576_widget";

async function seedEntity(id: string): Promise<void> {
  await db.from("entities").insert({
    id,
    entity_type: entityType,
    canonical_name: `Widget ${id}`,
    user_id: userId,
    merged_to_entity_id: null,
    created_at: new Date().toISOString(),
  });
  await db.from("entity_snapshots").insert({
    entity_id: id,
    entity_type: entityType,
    schema_version: "1.0",
    snapshot: { name: `Widget ${id}` },
    observation_count: 1,
    user_id: userId,
  });
  await db.from("observations").insert({
    id: `${id}_obs`,
    entity_id: id,
    entity_type: entityType,
    observed_at: new Date().toISOString(),
    source_priority: 100,
    fields: { name: `Widget ${id}` },
    user_id: userId,
  });
}

async function cleanup(): Promise<void> {
  await db.from("observations").delete().eq("user_id", userId);
  await db.from("entity_snapshots").delete().eq("user_id", userId);
  await db.from("entities").delete().eq("user_id", userId);
}

describe("entity query excludes deleted entities from page and total (ateles#576)", () => {
  beforeEach(async () => {
    await cleanup();
    for (const id of ["w1", "w2", "w3"]) await seedEntity(id);
  });

  afterEach(cleanup);

  it("counts all entities when none are deleted", async () => {
    const result = await queryEntitiesWithCount({ userId, entityType, limit: 100 });
    expect(result.total).toBe(3);
    expect(result.entities).toHaveLength(3);
  });

  it("drops a soft-deleted entity from both the page and the total", async () => {
    await softDeleteEntity("w2", entityType, userId, "test");

    const result = await queryEntitiesWithCount({ userId, entityType, limit: 100 });
    expect(result.total).toBe(2);
    expect(result.entities.map((e) => e.entity_id).sort()).toEqual(["w1", "w3"]);
  });

  it("restores an entity to both the page and the total", async () => {
    await softDeleteEntity("w2", entityType, userId, "test");
    await restoreEntity("w2", entityType, userId, "test");

    const result = await queryEntitiesWithCount({ userId, entityType, limit: 100 });
    expect(result.total).toBe(3);
    expect(result.entities.map((e) => e.entity_id).sort()).toEqual(["w1", "w2", "w3"]);
  });

  it("keeps the total correct when the requested limit is smaller than the result set", async () => {
    // The reported symptom was a limit:1 query. The page shrinks to the limit;
    // the total must still describe the whole matching set.
    await softDeleteEntity("w3", entityType, userId, "test");

    const result = await queryEntitiesWithCount({ userId, entityType, limit: 1 });
    expect(result.entities).toHaveLength(1);
    expect(result.total).toBe(2);
  });

  it("excludes every entity when all are deleted", async () => {
    for (const id of ["w1", "w2", "w3"]) {
      await softDeleteEntity(id, entityType, userId, "test");
    }
    const result = await queryEntitiesWithCount({ userId, entityType, limit: 100 });
    expect(result.total).toBe(0);
    expect(result.entities).toHaveLength(0);
  });

  it("keeps a merged-away entity out of the default page and total", async () => {
    await mergeEntities({
      fromEntityId: "w2",
      toEntityId: "w1",
      userId,
      mergeReason: "test",
      mergedBy: "test",
    });

    const result = await queryEntitiesWithCount({ userId, entityType, limit: 100 });
    expect(result.total).toBe(2);
    expect(result.entities.map((e) => e.entity_id).sort()).toEqual(["w1", "w3"]);
  });

  it("returns merged entities in the page AND the total under include_merged", async () => {
    // #2267 review, BLOCKING: mergeEntities deletes the merged-away entity's
    // snapshot row, so resolving liveness from snapshot presence alone silently
    // made `include_merged: true` inert on both the page and the total.
    await mergeEntities({
      fromEntityId: "w2",
      toEntityId: "w1",
      userId,
      mergeReason: "test",
      mergedBy: "test",
    });

    const result = await queryEntitiesWithCount({
      userId,
      entityType,
      includeMerged: true,
      limit: 100,
    });
    expect(result.entities.map((e) => e.entity_id).sort()).toEqual(["w1", "w2", "w3"]);
    expect(result.total).toBe(3);
  });

  it("agrees on merged membership whether or not include_deleted is also set", async () => {
    // The two flags are independent: queryEntities skips the deleted-resolution
    // step entirely when includeDeleted is true, so before the fix the same
    // include_merged request answered differently depending on an unrelated flag.
    await mergeEntities({
      fromEntityId: "w2",
      toEntityId: "w1",
      userId,
      mergeReason: "test",
      mergedBy: "test",
    });

    const mergedOnly = await queryEntitiesWithCount({
      userId,
      entityType,
      includeMerged: true,
      limit: 100,
    });
    const mergedAndDeleted = await queryEntitiesWithCount({
      userId,
      entityType,
      includeMerged: true,
      includeDeleted: true,
      limit: 100,
    });

    expect(mergedOnly.entities.map((e) => e.entity_id).sort()).toContain("w2");
    expect(mergedAndDeleted.entities.map((e) => e.entity_id).sort()).toContain("w2");
  });

  it("keeps a never-observed entity visible on the page (no snapshot row is not deletion)", async () => {
    // An `entities` row written without any observation never gets a snapshot,
    // because nothing ran the reducer. Treating snapshot-absence as deletion made
    // such rows vanish from default queries — the IT-008 regression in
    // tests/integration/v0.2.0_ingestion.test.ts, which this asserts directly.
    //
    // Scope note: this pins the PAGE only. `total` deliberately still comes from
    // a single indexed COUNT(*) over entity_snapshots, which cannot see a
    // snapshot-less row. Making the count agree would mean re-materializing every
    // entity id per request — precisely the corpus-proportional work this fix
    // removed (measured: it pushed the 40k count overhead back to ~32ms, growing
    // linearly, versus ~1ms flat). In production the divergence is unreachable:
    // both writers that insert an `entities` row without an observation
    // (`ensureEntityRowForObservation` / `ensureEntityRowForSnapshot` in
    // src/repositories/sqlite/local_db_adapter.ts, and
    // src/services/guest_access_token.ts) do so as a precursor to writing the
    // observation in the same flow, so the state is transient, not durable.
    // Hand-seeded rows like this one and IT-008's are the only way to observe it.
    await db.from("entities").insert({
      id: "w_bare",
      entity_type: entityType,
      canonical_name: "Bare Widget",
      user_id: userId,
      merged_to_entity_id: null,
      created_at: new Date().toISOString(),
    });

    const result = await queryEntitiesWithCount({ userId, entityType, limit: 100 });
    expect(result.entities.map((e) => e.entity_id).sort()).toEqual(["w1", "w2", "w3", "w_bare"]);
  });
});
