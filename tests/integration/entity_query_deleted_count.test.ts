/**
 * Deleted entities stay excluded from the entity query page AND its `total`
 * after the ateles#576 performance fix.
 *
 * The count and the delete-filter no longer re-derive liveness from the
 * observation log — they read the materialized `entity_snapshots.is_live` flag.
 * That is a behaviour-preserving optimisation only if the flag is maintained at
 * every write point, so these tests drive the real service functions
 * (softDeleteEntity / restoreEntity) and assert on the real read path rather
 * than on the flag directly.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../../src/db.js";
import { softDeleteEntity, restoreEntity } from "../../src/services/deletion.js";
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
});
