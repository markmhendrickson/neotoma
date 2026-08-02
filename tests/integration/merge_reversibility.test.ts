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
 * unmergeEntities (keyed on merge_id, not entity ids) replays it, with
 * particular attention to the cases that were previously unrecoverable
 * rather than merely the happy path. Also covers every unmerge error state,
 * the chained-merge (MERGE_SUPERSEDED) guard, tenant isolation, and
 * MCP/REST surface parity.
 */

import { createServer } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import crypto from "crypto";
import { app } from "../../src/actions.js";
import { NeotomaServer } from "../../src/server.js";
import { db } from "../../src/db.js";
import { getSqliteDb } from "../../src/repositories/sqlite/sqlite_client.js";
import { createRelationshipObservations } from "../../src/services/interpretation.js";
import {
  mergeEntities,
  unmergeEntities,
  MergeNotReversibleError,
  MergeNotFoundError,
  MergeSupersededError,
  IdempotencyMismatchError,
} from "../../src/services/entity_merge.js";

const TEST_USER = "test-merge-reversibility-2004";
const OTHER_USER = "test-merge-reversibility-2004-other-tenant";

const A = "ent_2004_survivor";
const B = "ent_2004_absorbed";
const C = "ent_2004_third";

async function cleanupUser(userId: string) {
  await db.from("relationship_observations").delete().eq("user_id", userId);
  await db.from("relationship_snapshots").delete().eq("user_id", userId);
  await db.from("entity_snapshots").delete().eq("user_id", userId);
  await db.from("observations").delete().eq("user_id", userId);
  await db.from("entities").delete().eq("user_id", userId);
  await db.from("entity_merges").delete().eq("user_id", userId);
}

async function cleanup() {
  await cleanupUser(TEST_USER);
  await cleanupUser(OTHER_USER);
}

async function seedEntity(id: string, userId: string = TEST_USER) {
  await db.from("entities").insert({
    id,
    user_id: userId,
    entity_type: "contact",
    canonical_name: id,
    created_at: new Date().toISOString(),
  });
}

/** Insert an observation owned by `entityId`, returning its id. */
async function seedObservation(
  entityId: string,
  field: string,
  value: string,
  userId: string = TEST_USER
): Promise<string> {
  const id = `obs_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  // NOTE: observations stores field data as a `fields` JSON blob; entity_type,
  // schema_version and observed_at are NOT NULL. Writing field_name/field_value
  // silently inserts nothing, which makes the merge look like it moved zero rows.
  await db.from("observations").insert({
    id,
    user_id: userId,
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

function liveEdgesFor(entityId: string, userId: string = TEST_USER): number {
  const rows = getSqliteDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM relationship_observations
       WHERE user_id = ? AND (source_entity_id = ? OR target_entity_id = ?)`
    )
    .get(userId, entityId, entityId) as { n: number };
  return rows.n;
}

function auditRow(userId: string = TEST_USER): Record<string, unknown> | undefined {
  return getSqliteDb()
    .prepare(`SELECT * FROM entity_merges WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(userId) as Record<string, unknown> | undefined;
}

function entitySnapshotFor(
  entityId: string,
  userId: string = TEST_USER
): Record<string, unknown> | undefined {
  return getSqliteDb()
    .prepare(`SELECT * FROM entity_snapshots WHERE entity_id = ? AND user_id = ?`)
    .get(entityId, userId) as Record<string, unknown> | undefined;
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

  it("captures the pre-image of repointed (not deleted) relationship rows", async () => {
    await seedEntity(A);
    await seedEntity(B);
    await seedEntity(C);

    // B → C edge has no collision on A, so it survives, repointed.
    await createRelationshipObservations(
      [
        {
          relationship_type: "MANAGES",
          source_entity_id: B,
          target_entity_id: C,
          metadata: {},
        },
      ],
      "src_2004_repoint",
      null,
      TEST_USER,
      50
    );

    await mergeEntities({ fromEntityId: B, toEntityId: A, userId: TEST_USER, mergedBy: "test" });

    const repointed = JSON.parse(String(auditRow()!.repointed_relationship_rows_json)) as Array<
      Record<string, unknown>
    >;

    expect(repointed.length).toBe(1);
    // Pre-image must reflect the ORIGINAL (pre-merge) source/target, not A.
    expect(repointed[0].source_entity_id).toBe(B);
    expect(repointed[0].target_entity_id).toBe(C);
  });

  it("captures relationship_snapshots pre-mutation content before deleting", async () => {
    await seedEntity(A);
    await seedEntity(B);
    const now = new Date().toISOString();
    await db.from("relationship_snapshots").insert({
      relationship_key: `KNOWS:${B}:${A}`,
      relationship_type: "KNOWS",
      source_entity_id: B,
      target_entity_id: A,
      schema_version: "1.0",
      snapshot: JSON.stringify({ note: "pre-merge snapshot" }),
      computed_at: now,
      observation_count: 1,
      last_observation_at: now,
      user_id: TEST_USER,
    });

    await mergeEntities({ fromEntityId: B, toEntityId: A, userId: TEST_USER, mergedBy: "test" });

    const deletedSnapshots = JSON.parse(
      String(auditRow()!.deleted_relationship_snapshot_rows_json)
    ) as Array<Record<string, unknown>>;
    expect(deletedSnapshots.length).toBe(1);
    expect(deletedSnapshots[0].relationship_key).toBe(`KNOWS:${B}:${A}`);
    // The `db` adapter's insert path JSON-encodes string columns once more
    // than a raw sqlite write would — parse until we reach the actual object,
    // rather than asserting on the adapter's specific encoding depth.
    let parsedSnapshot: unknown = deletedSnapshots[0].snapshot;
    while (typeof parsedSnapshot === "string") {
      parsedSnapshot = JSON.parse(parsedSnapshot);
    }
    expect(parsedSnapshot).toEqual({ note: "pre-merge snapshot" });
  });

  it("echoes merge_id as a top-level response field matching the entity_merges row", async () => {
    await seedEntity(A);
    await seedEntity(B);

    const result = await mergeEntities({
      fromEntityId: B,
      toEntityId: A,
      userId: TEST_USER,
      mergedBy: "test",
    });

    expect(result.merge_id).toBeTruthy();
    expect(auditRow()!.id).toBe(result.merge_id);
  });

  it("no behavior change to existing merge callers when idempotency_key is omitted", async () => {
    await seedEntity(A);
    await seedEntity(B);
    await seedObservation(B, "email", "b@example.com");

    const result = await mergeEntities({
      fromEntityId: B,
      toEntityId: A,
      userId: TEST_USER,
      mergedBy: "test",
    });

    expect(result.observations_moved).toBe(1);
    expect(result.replayed).toBe(false);
  });

  it("idempotency_key replay returns the original merge_id without re-merging", async () => {
    await seedEntity(A);
    await seedEntity(B);
    const key = `merge-idem-${crypto.randomUUID()}`;

    const first = await mergeEntities({
      fromEntityId: B,
      toEntityId: A,
      userId: TEST_USER,
      mergedBy: "test",
      idempotencyKey: key,
    });
    const second = await mergeEntities({
      fromEntityId: B,
      toEntityId: A,
      userId: TEST_USER,
      mergedBy: "test",
      idempotencyKey: key,
    });

    expect(second.merge_id).toBe(first.merge_id);
    expect(second.replayed).toBe(true);
  });

  it("idempotency_key reused with a different pair throws IdempotencyMismatchError", async () => {
    await seedEntity(A);
    await seedEntity(B);
    await seedEntity(C);
    const key = `merge-idem-mismatch-${crypto.randomUUID()}`;

    await mergeEntities({
      fromEntityId: B,
      toEntityId: A,
      userId: TEST_USER,
      mergedBy: "test",
      idempotencyKey: key,
    });

    await expect(
      mergeEntities({
        fromEntityId: C,
        toEntityId: A,
        userId: TEST_USER,
        mergedBy: "test",
        idempotencyKey: key,
      })
    ).rejects.toThrow(IdempotencyMismatchError);
  });

  it("idempotency_key reused after the original merge was unmerged performs a real merge, not a stale replay", async () => {
    await seedEntity(A);
    await seedEntity(B);
    const key = `merge-idem-reused-after-unmerge-${crypto.randomUUID()}`;

    const first = await mergeEntities({
      fromEntityId: B,
      toEntityId: A,
      userId: TEST_USER,
      mergedBy: "test",
      idempotencyKey: key,
    });
    await unmergeEntities({ mergeId: first.merge_id, userId: TEST_USER });

    const second = await mergeEntities({
      fromEntityId: B,
      toEntityId: A,
      userId: TEST_USER,
      mergedBy: "test",
      idempotencyKey: key,
    });

    // A fresh merge actually ran (new merge_id, not a replay of the reversed one).
    expect(second.merge_id).not.toBe(first.merge_id);
    expect(second.replayed).toBe(false);

    const { data: entB } = await db
      .from("entities")
      .select("merged_to_entity_id")
      .eq("id", B)
      .single();
    expect((entB as { merged_to_entity_id: string | null }).merged_to_entity_id).toBe(A);
  });
});

describe("unmergeEntities — restores pre-merge state (#2004)", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("moves observations back to the absorbed entity and clears the tombstone (round-trip basic)", async () => {
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
    expect(res.restored_entity_id).toBe(B);
    expect(res.observations_restored).toBe(1);
    expect(res.already_reversed).toBe(false);

    // B's observation is back on B; A's own observation never moved (guards
    // against "repoint everything currently on A" rather than the captured set).
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

  it("restores edges the merge deleted — self-loop/duplicate dedup case", async () => {
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

  it("restores a repointed edge to its captured pre-image, not current state", async () => {
    await seedEntity(A);
    await seedEntity(B);
    await seedEntity(C);

    await createRelationshipObservations(
      [
        {
          relationship_type: "MANAGES",
          source_entity_id: B,
          target_entity_id: C,
          metadata: {},
        },
      ],
      "src_2004_repoint_restore",
      null,
      TEST_USER,
      50
    );

    const merge = await mergeEntities({
      fromEntityId: B,
      toEntityId: A,
      userId: TEST_USER,
      mergedBy: "test",
    });

    // After merge, the edge is repointed to A → C.
    const repointedRow = getSqliteDb()
      .prepare(
        `SELECT * FROM relationship_observations WHERE user_id = ? AND relationship_type = 'MANAGES'`
      )
      .get(TEST_USER) as { source_entity_id: string; target_entity_id: string };
    expect(repointedRow.source_entity_id).toBe(A);
    expect(repointedRow.target_entity_id).toBe(C);

    await unmergeEntities({ mergeId: merge.merge_id, userId: TEST_USER });

    const restoredRow = getSqliteDb()
      .prepare(
        `SELECT * FROM relationship_observations WHERE user_id = ? AND relationship_type = 'MANAGES'`
      )
      .get(TEST_USER) as { source_entity_id: string; target_entity_id: string };
    expect(restoredRow.source_entity_id).toBe(B);
    expect(restoredRow.target_entity_id).toBe(C);
  });

  it("relationship snapshot equivalence: byte-identical to pre-merge after round-trip", async () => {
    await seedEntity(A);
    await seedEntity(B);
    const now = new Date().toISOString();
    const snapshotContent = JSON.stringify({ note: "pre-merge snapshot", value: 42 });
    await db.from("relationship_snapshots").insert({
      relationship_key: `KNOWS:${B}:${A}`,
      relationship_type: "KNOWS",
      source_entity_id: B,
      target_entity_id: A,
      schema_version: "1.0",
      snapshot: snapshotContent,
      computed_at: now,
      observation_count: 1,
      last_observation_at: now,
      user_id: TEST_USER,
    });

    const merge = await mergeEntities({
      fromEntityId: B,
      toEntityId: A,
      userId: TEST_USER,
      mergedBy: "test",
    });

    // Merge deleted it.
    const { data: afterMerge } = await db
      .from("relationship_snapshots")
      .select("*")
      .eq("relationship_key", `KNOWS:${B}:${A}`);
    expect((afterMerge ?? []).length).toBe(0);

    await unmergeEntities({ mergeId: merge.merge_id, userId: TEST_USER });

    const { data: afterUnmerge } = await db
      .from("relationship_snapshots")
      .select("*")
      .eq("relationship_key", `KNOWS:${B}:${A}`)
      .single();
    expect((afterUnmerge as { snapshot: string }).snapshot).toBe(snapshotContent);
  });

  it("response payload contains restored_entity_id, observations_restored, relationships_restored", async () => {
    await seedEntity(A);
    await seedEntity(B);
    await seedObservation(B, "email", "b@example.com");

    const merge = await mergeEntities({
      fromEntityId: B,
      toEntityId: A,
      userId: TEST_USER,
      mergedBy: "test",
    });
    const result = await unmergeEntities({ mergeId: merge.merge_id, userId: TEST_USER });

    expect(result.restored_entity_id).toBe(B);
    expect(result.observations_restored).toBe(1);
    expect(typeof result.relationships_restored).toBe("number");
  });

  it("relationships_restored does not overcount a row the INSERT OR IGNORE skipped as already present", async () => {
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
        `src_2004_reinsert_conflict_${src}`,
        null,
        TEST_USER,
        50
      );
    }

    const merge = await mergeEntities({
      fromEntityId: B,
      toEntityId: A,
      userId: TEST_USER,
      mergedBy: "test",
    });
    const deletedRow = JSON.parse(String(auditRow()!.deleted_relationship_rows_json))[0] as Record<
      string,
      unknown
    >;

    // Independently re-create a row occupying the captured row's original
    // id, simulating unrelated activity landing on that id between merge and
    // unmerge. INSERT OR IGNORE will no-op on it rather than restoring it.
    getSqliteDb()
      .prepare(
        `INSERT INTO relationship_observations
           (id, relationship_type, source_entity_id, target_entity_id, relationship_key,
            metadata, source_id, user_id, observed_at, source_priority)
         VALUES (?, 'KNOWS', ?, ?, ?, '{}', 'src_2004_reinsert_conflict_other', ?, datetime('now'), 50)`
      )
      .run(deletedRow.id, B, C, `KNOWS:${B}:${C}:conflict`, TEST_USER);

    const result = await unmergeEntities({ mergeId: merge.merge_id, userId: TEST_USER });

    // The conflicting id was skipped by INSERT OR IGNORE, not restored —
    // relationships_restored must not count it.
    expect(result.relationships_restored).toBe(0);
  });

  it("MERGE_NOT_FOUND: non-existent merge_id, no mutation, message names the passed id", async () => {
    const badId = "nonexistent-merge-id";
    await expect(unmergeEntities({ mergeId: badId, userId: TEST_USER })).rejects.toThrow(
      MergeNotFoundError
    );
    await expect(unmergeEntities({ mergeId: badId, userId: TEST_USER })).rejects.toThrow(
      new RegExp(badId)
    );
  });

  it("MERGE_ALREADY_REVERSED: idempotent no-op read on second unmerge, includes unmerged_at", async () => {
    await seedEntity(A);
    await seedEntity(B);

    const merge = await mergeEntities({
      fromEntityId: B,
      toEntityId: A,
      userId: TEST_USER,
      mergedBy: "test",
    });
    const first = await unmergeEntities({ mergeId: merge.merge_id, userId: TEST_USER });
    expect(first.already_reversed).toBe(false);

    const second = await unmergeEntities({ mergeId: merge.merge_id, userId: TEST_USER });
    expect(second.already_reversed).toBe(true);
    expect(second.unmerged_at).toBe(first.unmerged_at);
  });

  it("MERGE_SUPERSEDED: chained merge (A→B, then B→C) blocks naive unmerge of the first, names the later merge id, zero mutation", async () => {
    await seedEntity(A);
    await seedEntity(B);
    await seedEntity(C);

    const firstMerge = await mergeEntities({
      fromEntityId: A,
      toEntityId: B,
      userId: TEST_USER,
      mergedBy: "test",
    });
    const secondMerge = await mergeEntities({
      fromEntityId: B,
      toEntityId: C,
      userId: TEST_USER,
      mergedBy: "test",
    });

    await expect(
      unmergeEntities({ mergeId: firstMerge.merge_id, userId: TEST_USER })
    ).rejects.toThrow(MergeSupersededError);
    await expect(
      unmergeEntities({ mergeId: firstMerge.merge_id, userId: TEST_USER })
    ).rejects.toThrow(new RegExp(secondMerge.merge_id));
    // Names the survivor of THIS merge (B), not the source (A) — B is what
    // actually got merged again into C, and the message must say so unambiguously.
    await expect(
      unmergeEntities({ mergeId: firstMerge.merge_id, userId: TEST_USER })
    ).rejects.toThrow(new RegExp(`${B}, the survivor of this merge, was merged again`));

    // Fails closed: A is still tombstoned to B (no partial repointing).
    const { data: entA } = await db
      .from("entities")
      .select("merged_to_entity_id")
      .eq("id", A)
      .single();
    expect((entA as { merged_to_entity_id: string | null }).merged_to_entity_id).toBe(B);
  });

  it("MERGE_NOT_REVERSIBLE: legacy pre-fix merge (null capture columns) fails closed, no partial mutation", async () => {
    await seedEntity(A);
    await seedEntity(B);
    await seedObservation(B, "email", "b@example.com");

    const merge = await mergeEntities({
      fromEntityId: B,
      toEntityId: A,
      userId: TEST_USER,
      mergedBy: "test",
    });

    // Simulate a merge recorded before inverse capture existed (direct DB seed).
    getSqliteDb()
      .prepare(
        `UPDATE entity_merges
         SET moved_observation_ids_json = NULL,
             deleted_relationship_rows_json = NULL
         WHERE id = ?`
      )
      .run(merge.merge_id);

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

  it("concurrent-write-untouched: an observation written to the survivor after the merge stays put on unmerge (v1 documented behavior, no MERGE_STALE detection)", async () => {
    await seedEntity(A);
    await seedEntity(B);

    const merge = await mergeEntities({
      fromEntityId: B,
      toEntityId: A,
      userId: TEST_USER,
      mergedBy: "test",
    });

    // Unrelated write lands on A (the survivor) after the merge completed.
    const laterObs = await seedObservation(A, "note", "written after merge", TEST_USER);

    await unmergeEntities({ mergeId: merge.merge_id, userId: TEST_USER });

    const { data: stillOnA } = await db
      .from("observations")
      .select("entity_id")
      .eq("id", laterObs)
      .single();
    expect((stillOnA as { entity_id: string }).entity_id).toBe(A);
  });

  it("cannot mutate or discover another tenant's merge via a guessed merge_id (tenant isolation)", async () => {
    await seedEntity(A, TEST_USER);
    await seedEntity(B, TEST_USER);
    await seedObservation(B, "email", "owner@example.com", TEST_USER);

    const merge = await mergeEntities({
      fromEntityId: B,
      toEntityId: A,
      userId: TEST_USER,
      mergedBy: "test",
    });

    // A different tenant tries to unmerge using the correct merge_id but
    // their own (non-owning) user_id.
    await expect(unmergeEntities({ mergeId: merge.merge_id, userId: OTHER_USER })).rejects.toThrow(
      MergeNotFoundError
    );

    // No mutation to the real owner's data.
    const { data: entB } = await db
      .from("entities")
      .select("merged_to_entity_id")
      .eq("id", B)
      .single();
    expect((entB as { merged_to_entity_id: string | null }).merged_to_entity_id).toBe(A);
  });

  it("entity snapshot round-trip: restored entity's snapshot content matches pre-merge capture", async () => {
    await seedEntity(A);
    await seedEntity(B);
    const now = new Date().toISOString();
    const snapshotContent = JSON.stringify({
      canonical_name: B,
      note: "pre-merge entity snapshot",
    });
    await db.from("entity_snapshots").insert({
      entity_id: B,
      entity_type: "contact",
      schema_version: "1.0",
      canonical_name: B,
      snapshot: snapshotContent,
      computed_at: now,
      observation_count: 1,
      last_observation_at: now,
      user_id: TEST_USER,
    });

    const merge = await mergeEntities({
      fromEntityId: B,
      toEntityId: A,
      userId: TEST_USER,
      mergedBy: "test",
    });
    expect(entitySnapshotFor(B)).toBeUndefined();

    await unmergeEntities({ mergeId: merge.merge_id, userId: TEST_USER });

    const restoredSnapshot = entitySnapshotFor(B);
    expect(restoredSnapshot).toBeDefined();
    const restoredContent =
      typeof restoredSnapshot!.snapshot === "string" &&
      (restoredSnapshot!.snapshot as string).startsWith('"')
        ? JSON.parse(restoredSnapshot!.snapshot as string)
        : restoredSnapshot!.snapshot;
    expect(
      typeof restoredContent === "string" ? JSON.parse(restoredContent) : restoredContent
    ).toEqual(JSON.parse(snapshotContent));
  });
});

describe("mergeEntities — no regression to existing behavior (#2004 acceptance criterion)", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("merge with no subsequent unmerge: externally visible response shape unchanged (plus new merge_id field)", async () => {
    await seedEntity(A);
    await seedEntity(B);
    await seedObservation(B, "email", "b@example.com");

    const result = await mergeEntities({
      fromEntityId: B,
      toEntityId: A,
      userId: TEST_USER,
      mergedBy: "test",
    });

    expect(result).toMatchObject({
      observations_moved: 1,
      relationships_repointed: 0,
      replayed: false,
    });
    expect(typeof result.merged_at).toBe("string");
    expect(typeof result.merge_id).toBe("string");
  });
});

describe("unmerge_entities — MCP tool and REST endpoint surface parity (#2004)", () => {
  let server: NeotomaServer;
  let httpServer: ReturnType<typeof createServer>;
  const API_PORT = 18317;
  const API_BASE = `http://127.0.0.1:${API_PORT}`;

  function callMcpMerge(params: Record<string, unknown>) {
    return (server as any).mergeEntities(params) as Promise<{
      content: Array<{ text: string }>;
    }>;
  }

  function callMcpUnmerge(params: Record<string, unknown>) {
    return (server as any).unmergeEntities(params) as Promise<{
      content: Array<{ text: string }>;
    }>;
  }

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = TEST_USER;

    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  beforeEach(cleanup);
  afterEach(cleanup);

  it("round-trip basic: MCP merge + MCP unmerge restores the source entity", async () => {
    await seedEntity(A);
    await seedEntity(B);
    await seedObservation(B, "email", "mcp@example.com");

    const mergeResp = await callMcpMerge({
      from_entity_id: B,
      to_entity_id: A,
      user_id: TEST_USER,
    });
    const mergeBody = JSON.parse(mergeResp.content[0].text) as { merge_id: string };
    expect(mergeBody.merge_id).toBeTruthy();

    const unmergeResp = await callMcpUnmerge({ merge_id: mergeBody.merge_id, user_id: TEST_USER });
    const unmergeBody = JSON.parse(unmergeResp.content[0].text) as {
      restored_entity_id: string;
      already_reversed: boolean;
    };
    expect(unmergeBody.restored_entity_id).toBe(B);
    expect(unmergeBody.already_reversed).toBe(false);
  });

  it("round-trip basic: REST /entities/merge + REST /entities/unmerge restores the source entity", async () => {
    await seedEntity(A);
    await seedEntity(B);
    await seedObservation(B, "email", "rest@example.com");

    const mergeRes = await fetch(`${API_BASE}/entities/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_entity_id: B, to_entity_id: A, user_id: TEST_USER }),
    });
    expect(mergeRes.status).toBe(200);
    const mergeBody = (await mergeRes.json()) as { merge_id: string };
    expect(mergeBody.merge_id).toBeTruthy();

    const unmergeRes = await fetch(`${API_BASE}/entities/unmerge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merge_id: mergeBody.merge_id, user_id: TEST_USER }),
    });
    expect(unmergeRes.status).toBe(200);
    const unmergeBody = (await unmergeRes.json()) as {
      restored_entity_id: string;
      already_reversed: boolean;
    };
    expect(unmergeBody.restored_entity_id).toBe(B);
    expect(unmergeBody.already_reversed).toBe(false);
  });

  it("MERGE_NOT_FOUND: identical error code on MCP and REST surfaces", async () => {
    const badId = "surface-parity-bad-id";

    await expect(callMcpUnmerge({ merge_id: badId, user_id: TEST_USER })).rejects.toThrow(
      new RegExp(badId)
    );

    const httpRes = await fetch(`${API_BASE}/entities/unmerge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merge_id: badId, user_id: TEST_USER }),
    });
    expect(httpRes.status).toBe(404);
    const httpBody = (await httpRes.json()) as { error_code: string };
    expect(httpBody.error_code).toBe("ERR_MERGE_NOT_FOUND");
  });

  it("MERGE_ALREADY_REVERSED: identical already_reversed semantics on MCP and REST surfaces", async () => {
    await seedEntity(A);
    await seedEntity(B);

    const mergeRes = await fetch(`${API_BASE}/entities/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_entity_id: B, to_entity_id: A, user_id: TEST_USER }),
    });
    const mergeBody = (await mergeRes.json()) as { merge_id: string };

    // First unmerge via REST.
    await fetch(`${API_BASE}/entities/unmerge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merge_id: mergeBody.merge_id, user_id: TEST_USER }),
    });

    // Second unmerge via MCP — must report already_reversed, not error.
    const secondResp = await callMcpUnmerge({ merge_id: mergeBody.merge_id, user_id: TEST_USER });
    const secondBody = JSON.parse(secondResp.content[0].text) as { already_reversed: boolean };
    expect(secondBody.already_reversed).toBe(true);
  });

  it("MERGE_SUPERSEDED: identical error code on MCP and REST surfaces", async () => {
    await seedEntity(A);
    await seedEntity(B);
    await seedEntity(C);

    const firstMergeRes = await fetch(`${API_BASE}/entities/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_entity_id: A, to_entity_id: B, user_id: TEST_USER }),
    });
    const firstMerge = (await firstMergeRes.json()) as { merge_id: string };

    await fetch(`${API_BASE}/entities/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_entity_id: B, to_entity_id: C, user_id: TEST_USER }),
    });

    const httpRes = await fetch(`${API_BASE}/entities/unmerge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merge_id: firstMerge.merge_id, user_id: TEST_USER }),
    });
    expect(httpRes.status).toBe(400);
    const httpBody = (await httpRes.json()) as { error_code: string; message: string };
    expect(httpBody.error_code).toBe("ERR_MERGE_SUPERSEDED");
    // Names the survivor of the first merge (B) unambiguously, not the source (A).
    expect(httpBody.message).toMatch(`${B}, the survivor of this merge, was merged again`);

    await expect(
      callMcpUnmerge({ merge_id: firstMerge.merge_id, user_id: TEST_USER })
    ).rejects.toThrow(new RegExp(`${B}, the survivor of this merge, was merged again`));
  });

  it("cross-tenant: REST /entities/unmerge cannot reverse another tenant's merge, and does not leak its existence", async () => {
    await seedEntity(A);
    await seedEntity(B);
    await seedObservation(B, "email", "cross-tenant@example.com");

    const merge = await mergeEntities({
      fromEntityId: B,
      toEntityId: A,
      userId: TEST_USER,
      mergedBy: "test",
    });

    // Under local-dev auth, a provided user_id resolves as the caller's scope
    // (see getAuthenticatedUserId), so this exercises the tenant-scoped
    // merge_id lookup rather than the 403 payload-mismatch branch: the merge
    // must be indistinguishable from one that does not exist.
    const httpRes = await fetch(`${API_BASE}/entities/unmerge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merge_id: merge.merge_id, user_id: OTHER_USER }),
    });

    expect(httpRes.status).toBe(404);
    const httpBody = (await httpRes.json()) as { error_code: string };
    expect(httpBody.error_code).toBe("ERR_MERGE_NOT_FOUND");

    // The refusal must not have touched the merge: B stays tombstoned for its owner.
    const { data: entB } = await db
      .from("entities")
      .select("merged_to_entity_id")
      .eq("id", B)
      .single();
    expect((entB as { merged_to_entity_id: string | null }).merged_to_entity_id).toBe(A);
  });

  it("MERGE_NOT_REVERSIBLE: legacy merge (null capture columns) returns 400 over REST, no partial restore", async () => {
    await seedEntity(A);
    await seedEntity(B);
    await seedObservation(B, "email", "legacy-rest@example.com");

    const merge = await mergeEntities({
      fromEntityId: B,
      toEntityId: A,
      userId: TEST_USER,
      mergedBy: "test",
    });

    // Simulate a merge recorded before inverse capture existed (direct DB seed),
    // mirroring the service-level MERGE_NOT_REVERSIBLE case above.
    getSqliteDb()
      .prepare(
        `UPDATE entity_merges
         SET moved_observation_ids_json = NULL,
             deleted_relationship_rows_json = NULL
         WHERE id = ?`
      )
      .run(merge.merge_id);

    const httpRes = await fetch(`${API_BASE}/entities/unmerge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merge_id: merge.merge_id, user_id: TEST_USER }),
    });

    expect(httpRes.status).toBe(400);
    const httpBody = (await httpRes.json()) as { error_code: string };
    expect(httpBody.error_code).toBe("ERR_MERGE_NOT_REVERSIBLE");

    // Fails closed: the tombstone survives, no half-restore.
    const { data: entB } = await db
      .from("entities")
      .select("merged_to_entity_id")
      .eq("id", B)
      .single();
    expect((entB as { merged_to_entity_id: string | null }).merged_to_entity_id).toBe(A);
  });

  it("validation: REST /entities/unmerge rejects a body with no merge_id", async () => {
    const httpRes = await fetch(`${API_BASE}/entities/unmerge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: TEST_USER }),
    });

    expect(httpRes.status).toBe(400);
    const httpBody = (await httpRes.json()) as { error_code: string };
    expect(httpBody.error_code).toBeTruthy();
  });

  it("merge_entities tool description cross-references unmerge_entities, and vice versa (static doc check)", async () => {
    const { buildToolDefinitions } = await import("../../src/tool_definitions.js");
    const tools = buildToolDefinitions();
    const mergeTool = tools.find((t) => t.name === "merge_entities");
    const unmergeTool = tools.find((t) => t.name === "unmerge_entities");

    expect(mergeTool?.description).toContain("unmerge_entities");
    expect(unmergeTool?.description).toContain("merge_entities");
  });
});
