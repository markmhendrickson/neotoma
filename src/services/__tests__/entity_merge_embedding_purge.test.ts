/**
 * Regression test: mergeEntities must purge the merged-away entity's local
 * (sqlite-vec) embedding row, not just mark `entities.merged_to_entity_id`
 * and delete its `entity_snapshots` row.
 *
 * Why "consumes a KNN slot" and not "absent from results": `merged` on
 * `entity_embedding_rows` is written `false` at insert time
 * (entity_snapshot_embedding.ts) and nothing else ever flips it, so a
 * merged-away entity's embedding row survives forever with `merged=0`.
 * `searchLocalEntityEmbeddings` (local_entity_embedding.ts) already re-filters
 * merged entities out of hydrated results at the handler layer
 * (entity_handlers.ts:1043-ish), so "merged entity absent from results" is
 * already true today and asserting only that would prove nothing about this
 * defect. The actual defect is structural: the vec0 `k`-nearest-neighbor
 * search runs FIRST (`WHERE v.embedding MATCH ? AND k = ?`), and the
 * `AND (?=1 OR r.merged=0)` filter is applied to the joined rows only AFTER
 * the k nearest neighbors are already fixed. So a merged-away row that is a
 * true nearest neighbor occupies one of the k slots and can push a live
 * entity out of the KNN result set entirely, before any merged-aware filter
 * ever runs. This test proves that directly: it runs the same raw vec0 KNN
 * query shape used in production with a small k, and asserts the merged-away
 * entity's rowid is gone from the RAW KNN row set after the fix — i.e. the
 * slot it used to occupy is now free for a live entity, not merely that the
 * caller-facing result list happens to exclude it.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../../db.js";
import { getDb } from "../../repositories/db/connection.js";
import { storeLocalEntityEmbedding, ensureSqliteVecLoaded } from "../local_entity_embedding.js";
import { AsyncSqliteDatabase } from "../../repositories/sqlite/sqlite_driver.js";
import { mergeEntities } from "../entity_merge.js";
import { generateEntityId } from "../entity_resolution.js";

const EMBEDDING_DIM = 1536;
const userId = "test-user-merge-embedding-purge";
const entityType = "contact";

/** Deterministic 1536-dim embedding: identical vector for every seed so every
 * candidate is an exact-distance (tied) nearest neighbor of the query — this
 * makes which rows occupy the k slots purely a function of insertion/rowid
 * order, not embedding geometry, so the test is not measuring cosine/L2
 * behavior, only slot occupancy. */
function makeEmbedding(): number[] {
  const arr = new Array(EMBEDDING_DIM).fill(0) as number[];
  arr[0] = 1;
  return arr;
}

/** Raw KNN row set for entity_id, using the exact query shape production uses
 * (local_entity_embedding.ts searchLocalEntityEmbeddings), with an explicit
 * small k so slot starvation is observable without needing hundreds of rows. */
async function rawKnnEntityIds(k: number): Promise<string[]> {
  const rawDb = await getDb();
  if (!(rawDb instanceof AsyncSqliteDatabase)) {
    throw new Error("test requires AsyncSqliteDatabase backend");
  }
  const loaded = ensureSqliteVecLoaded(rawDb.rawDb());
  if (!loaded) {
    throw new Error("sqlite-vec did not load in this test environment");
  }
  const float32 = new Float32Array(makeEmbedding());
  const embeddingBlob = Buffer.from(float32.buffer, float32.byteOffset, float32.byteLength);
  const rows = (await rawDb
    .prepare(
      `
    SELECT r.entity_id, v.distance
    FROM entity_embeddings_vec v
    INNER JOIN entity_embedding_rows r ON r.rowid = v.rowid
    WHERE v.embedding MATCH ? AND k = ?
      AND r.user_id = ?
    ORDER BY v.distance
  `
    )
    .all(embeddingBlob, k, userId)) as Array<{ entity_id: string; distance: number }>;
  return rows.map((r) => r.entity_id);
}

async function cleanup(): Promise<void> {
  const rawDb = await getDb();
  await db.from("entity_embedding_rows").delete().eq("user_id", userId);
  if (rawDb instanceof AsyncSqliteDatabase) {
    // entity_embeddings_vec has no user_id column; sweep orphaned vec rows by
    // rejoining against entity_embedding_rows (already cleared above), so any
    // vec0 row with no matching entity_embedding_rows entry is test debris.
    try {
      await rawDb.exec(
        `DELETE FROM entity_embeddings_vec WHERE rowid NOT IN (SELECT rowid FROM entity_embedding_rows)`
      );
    } catch {
      // vec0 table may not exist yet on first run
    }
  }
  await db.from("entities").delete().eq("user_id", userId);
  await db.from("entity_snapshots").delete().eq("user_id", userId);
}

describe("mergeEntities purges the merged-away entity's local embedding row", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("frees the KNN slot the merged-away entity occupied, rather than leaving it a permanent candidate", async () => {
    const survivorName = "Live Survivor";
    const mergedAwayName = "Stale Duplicate";
    const survivorId = generateEntityId(entityType, survivorName);
    const mergedAwayId = generateEntityId(entityType, mergedAwayName);

    await db.from("entities").insert({
      id: survivorId,
      entity_type: entityType,
      canonical_name: survivorName,
      user_id: userId,
    });
    await db.from("entities").insert({
      id: mergedAwayId,
      entity_type: entityType,
      canonical_name: mergedAwayName,
      user_id: userId,
    });

    await storeLocalEntityEmbedding({
      entity_id: survivorId,
      embedding: makeEmbedding(),
      user_id: userId,
      entity_type: entityType,
      merged: false,
    });
    await storeLocalEntityEmbedding({
      entity_id: mergedAwayId,
      embedding: makeEmbedding(),
      user_id: userId,
      entity_type: entityType,
      merged: false,
    });

    // Sanity: both rows currently occupy KNN slots (k=2, exactly the two rows
    // seeded) before any merge happens.
    const beforeMerge = await rawKnnEntityIds(2);
    expect(beforeMerge).toEqual(expect.arrayContaining([survivorId, mergedAwayId]));

    await mergeEntities({
      fromEntityId: mergedAwayId,
      toEntityId: survivorId,
      userId,
      mergedBy: "test",
    });

    // The defect: with k=1 (a single available slot) and the merged-away row
    // still a live vec0 candidate, it could win that one slot over the
    // survivor purely on insertion order — starving the survivor out of a
    // 1-slot KNN window. After the fix, the merged-away row is gone from the
    // raw KNN candidate set entirely, so the survivor is guaranteed the slot.
    const afterMergeSingleSlot = await rawKnnEntityIds(1);
    expect(afterMergeSingleSlot).not.toContain(mergedAwayId);
    expect(afterMergeSingleSlot).toEqual([survivorId]);

    // Directly confirm the row is gone from entity_embedding_rows, not merely
    // filtered out of this particular query — the storage-level assertion the
    // task calls for, distinct from "absent from a caller-facing result".
    const { data: remaining } = await db
      .from("entity_embedding_rows")
      .select("entity_id")
      .eq("entity_id", mergedAwayId);
    expect(remaining ?? []).toHaveLength(0);
  });
});
