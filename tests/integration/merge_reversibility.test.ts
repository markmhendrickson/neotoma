/**
 * Regression tests for #2004: mergeEntities destroyed state without recording
 * an inverse, so no unmerge could exist.
 *
 * The merge performs three hard DELETEs whose rows nothing else records:
 *   - relationship_observations that are self-loops or duplicate an edge the
 *     survivor already had (nothing records that the absorbed entity
 *     independently asserted them)
 *   - relationship_snapshots touching the absorbed entity
 *   - entity_snapshots for the absorbed entity
 * and one in-place `UPDATE observations SET entity_id`, audited only as a
 * COUNT (`observations_rewritten`), not as the set of moved ids.
 *
 * These tests assert the merge now captures a complete inverse and that
 * unmergeEntities replays it, with particular attention to the cases that
 * were previously unrecoverable rather than merely the happy path.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../../src/db.js";
import { getSqliteDb } from "../../src/repositories/sqlite/sqlite_client.js";
import { createRelationshipObservations } from "../../src/services/interpretation.js";
import {
  mergeEntities,
  unmergeEntities,
  MergeNotReversibleError,
  MergeNotFoundError,
} from "../../src/services/entity_merge.js";
import crypto from "crypto";

const TEST_USER = "test-merge-reversibility-2004";

const A = "ent_2004_survivor";
const B = "ent_2004_absorbed";
const C = "ent_2004_third";

async function cleanup() {
  await db.from("relationship_observations").delete().eq("user_id", TEST_USER);
  await db.from("relationship_snapshots").delete().eq("user_id", TEST_USER);
  await db.from("entity_snapshots").delete().eq("user_id", TEST_USER);
  await db.from("observations").delete().eq("user_id", TEST_USER);
  await db.from("entities").delete().eq("user_id", TEST_USER);
  await db.from("entity_merges").delete().eq("user_id", TEST_USER);
}

async function seedEntity(id: string) {
  await db.from("entities").insert({
    id,
    user_id: TEST_USER,
    entity_type: "contact",
    canonical_name: id,
    created_at: new Date().toISOString(),
  });
}

/** Insert an observation owned by `entityId`, returning its id. */
async function seedObservation(entityId: string, field: string, value: string): Promise<string> {
  const id = `obs_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  // NOTE: observations stores field data as a `fields` JSON blob; entity_type,
  // schema_version and observed_at are NOT NULL. Writing field_name/field_value
  // silently inserts nothing, which makes the merge look like it moved zero rows.
  await db.from("observations").insert({
    id,
    user_id: TEST_USER,
    entity_id: entityId,
    entity_type: "contact",
    schema_version: "1.0",
    observed_at: now,
    source_id: `src_2004_${field}`,
    fields: JSON.stringify({ [field]: value }),
    created_at: now,
  });
  return id;
}

function liveEdgesFor(entityId: string): number {
  const rows = getSqliteDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM relationship_observations
       WHERE user_id = ? AND (source_entity_id = ? OR target_entity_id = ?)`
    )
    .get(TEST_USER, entityId, entityId) as { n: number };
  return rows.n;
}

function auditRow(): Record<string, unknown> | undefined {
  return getSqliteDb()
    .prepare(`SELECT * FROM entity_merges WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(TEST_USER) as Record<string, unknown> | undefined;
}

describe("mergeEntities — records a complete inverse (#2004)", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("captures moved observation ids, not just a count", async () => {
    await seedEntity(A);
    await seedEntity(B);
    const obs1 = await seedObservation(B, "email", "b@example.com");
    const obs2 = await seedObservation(B, "phone", "555-0100");
    // An observation already on the survivor must NOT be recorded as moved.
    const survivorObs = await seedObservation(A, "email", "a@example.com");

    await mergeEntities({
      fromEntityId: B,
      toEntityId: A,
      userId: TEST_USER,
      mergedBy: "test",
    });

    const row = auditRow();
    expect(row).toBeDefined();
    const moved = JSON.parse(String(row!.moved_observation_ids_json)) as string[];

    expect(moved.sort()).toEqual([obs1, obs2].sort());
    expect(moved).not.toContain(survivorObs);
    // The count and the id list must agree.
    expect(moved.length).toBe(row!.observations_rewritten);
  });

  it("captures the full text of deleted duplicate/self-loop edges", async () => {
    await seedEntity(A);
    await seedEntity(B);
    await seedEntity(C);

    // Both A and B assert the same edge to C. The merge collapses them by
    // relationship_key and DELETEs B's copy — previously unrecoverable.
    for (const src of [A, B]) {
      await createRelationshipObservations(
        [
          {
            relationship_type: "WORKS_AT",
            source_entity_id: src,
            target_entity_id: C,
            metadata: { asserted_by: src },
          },
        ],
        `src_2004_dup_${src}`,
        null,
        TEST_USER,
        50
      );
    }

    // A ← B edge becomes a self-loop once B is repointed to A, and is deleted.
    await createRelationshipObservations(
      [
        {
          relationship_type: "KNOWS",
          source_entity_id: B,
          target_entity_id: A,
          metadata: { note: "becomes self-loop" },
        },
      ],
      "src_2004_selfloop",
      null,
      TEST_USER,
      50
    );

    await mergeEntities({
      fromEntityId: B,
      toEntityId: A,
      userId: TEST_USER,
      mergedBy: "test",
    });

    const deleted = JSON.parse(String(auditRow()!.deleted_relationship_rows_json)) as Array<
      Record<string, unknown>
    >;

    // Both the duplicate and the self-loop were captured, with full row text
    // (not just ids) so they can be re-inserted verbatim.
    expect(deleted.length).toBe(2);
    for (const r of deleted) {
      expect(r.id).toBeTruthy();
      expect(r.relationship_type).toBeTruthy();
      expect(r.source_entity_id).toBeTruthy();
      expect(r.target_entity_id).toBeTruthy();
    }
    expect(deleted.map((r) => r.relationship_type).sort()).toEqual(["KNOWS", "WORKS_AT"]);
  });
});

describe("unmergeEntities — restores pre-merge state (#2004)", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("moves observations back to the absorbed entity and clears the tombstone", async () => {
    await seedEntity(A);
    await seedEntity(B);
    const obsB = await seedObservation(B, "email", "b@example.com");
    const obsA = await seedObservation(A, "email", "a@example.com");

    const merge = await mergeEntities({
      fromEntityId: B,
      toEntityId: A,
      userId: TEST_USER,
      mergedBy: "test",
    });

    // Precondition: B's observation now belongs to A, and B is tombstoned.
    const { data: afterMerge } = await db
      .from("observations")
      .select("entity_id")
      .eq("id", obsB)
      .single();
    expect((afterMerge as { entity_id: string }).entity_id).toBe(A);

    const res = await unmergeEntities({ mergeId: merge.merge_id, userId: TEST_USER });
    expect(res.to_entity_id).toBe(A);
    expect(res.observations_restored).toBe(1);

    // B's observation is back on B; A's own observation never moved.
    const { data: restored } = await db
      .from("observations")
      .select("entity_id")
      .eq("id", obsB)
      .single();
    expect((restored as { entity_id: string }).entity_id).toBe(B);

    const { data: untouched } = await db
      .from("observations")
      .select("entity_id")
      .eq("id", obsA)
      .single();
    expect((untouched as { entity_id: string }).entity_id).toBe(A);

    // Tombstone cleared — B is queryable again.
    const { data: entB } = await db
      .from("entities")
      .select("merged_to_entity_id, merged_at")
      .eq("id", B)
      .single();
    expect((entB as { merged_to_entity_id: string | null }).merged_to_entity_id).toBeNull();
    expect((entB as { merged_at: string | null }).merged_at).toBeNull();
  });

  it("restores edges the merge deleted — the previously unrecoverable case", async () => {
    await seedEntity(A);
    await seedEntity(B);
    await seedEntity(C);

    for (const src of [A, B]) {
      await createRelationshipObservations(
        [
          {
            relationship_type: "WORKS_AT",
            source_entity_id: src,
            target_entity_id: C,
            metadata: { asserted_by: src },
          },
        ],
        `src_2004_r_${src}`,
        null,
        TEST_USER,
        50
      );
    }

    const edgesBefore = liveEdgesFor(B);
    expect(edgesBefore).toBe(1);

    const merge = await mergeEntities({
      fromEntityId: B,
      toEntityId: A,
      userId: TEST_USER,
      mergedBy: "test",
    });
    // B's duplicate edge was deleted outright by the merge.
    expect(liveEdgesFor(B)).toBe(0);

    await unmergeEntities({ mergeId: merge.merge_id, userId: TEST_USER });

    // The deleted edge is back on B, and A keeps its own.
    expect(liveEdgesFor(B)).toBe(edgesBefore);
    expect(liveEdgesFor(A)).toBeGreaterThanOrEqual(1);
  });

  it("refuses to reverse a pre-#2004 merge rather than half-restoring it", async () => {
    await seedEntity(A);
    await seedEntity(B);
    await seedObservation(B, "email", "b@example.com");

    const merge = await mergeEntities({
      fromEntityId: B,
      toEntityId: A,
      userId: TEST_USER,
      mergedBy: "test",
    });

    // Simulate a merge recorded before inverse capture existed.
    getSqliteDb()
      .prepare(
        `UPDATE entity_merges
         SET moved_observation_ids_json = NULL,
             deleted_relationship_rows_json = NULL
         WHERE user_id = ?`
      )
      .run(TEST_USER);

    await expect(unmergeEntities({ mergeId: merge.merge_id, userId: TEST_USER })).rejects.toThrow(
      MergeNotReversibleError
    );

    // The tombstone must survive the refusal — no partial restore.
    const { data: entB } = await db
      .from("entities")
      .select("merged_to_entity_id")
      .eq("id", B)
      .single();
    expect((entB as { merged_to_entity_id: string | null }).merged_to_entity_id).toBe(A);
  });

  it("is idempotent — a repeated unmerge is a no-op, not a double-restore", async () => {
    await seedEntity(A);
    await seedEntity(B);
    await seedObservation(B, "email", "b@example.com");

    const merge = await mergeEntities({
      fromEntityId: B,
      toEntityId: A,
      userId: TEST_USER,
      mergedBy: "test",
    });
    const first = await unmergeEntities({ mergeId: merge.merge_id, userId: TEST_USER });
    expect(first.already_reversed).toBe(false);
    expect(first.observations_restored).toBe(1);

    // A retried unmerge must NOT restore a second time (which would double-count
    // observations). It reports the original timestamp and does nothing.
    const second = await unmergeEntities({ mergeId: merge.merge_id, userId: TEST_USER });
    expect(second.already_reversed).toBe(true);
    expect(second.observations_restored).toBe(0);
    expect(second.unmerged_at).toBe(first.unmerged_at);

    // An unknown merge id is still an error — idempotency must not mask a typo.
    await expect(
      unmergeEntities({ mergeId: "merge_does_not_exist", userId: TEST_USER })
    ).rejects.toThrow(MergeNotFoundError);
  });
});
