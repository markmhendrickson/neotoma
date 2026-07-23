/**
 * Entity Merge Service (Domain Layer)
 *
 * Handles entity merge operations: validation, observation rewriting,
 * merge tracking, and snapshot cleanup. Extracted from actions.ts and
 * server.ts to enforce layer boundaries.
 *
 * Transaction strategy
 * --------------------
 * The full mutation sequence — observation rewrite, relationship repoint +
 * dedup/self-loop deletes, entity merged-mark, entity_merges audit insert,
 * entity_snapshots delete, and relationship_snapshots delete — is executed
 * inside a single synchronous better-sqlite3 `db.transaction()` call via
 * `getSqliteDb()`. This guarantees atomicity: a partial failure leaves the
 * source entity still alive and queryable rather than orphaning edges.
 *
 * The pre-mutation validation reads (entity existence + merged status) run
 * *outside* the transaction so we can throw typed errors before entering
 * the write path. Because SQLite serialises all writers, there is no TOCTOU
 * gap on a single-process server; on multi-process deployments the
 * transaction still ensures the write side is atomic.
 *
 * Reversibility (#2004)
 * ----------------------
 * Every row a merge would otherwise hard-delete is captured (full column
 * content, not a count) into `entity_merges` before it is removed, and the
 * moved observation ids are recorded before the rewrite. `unmergeEntities`
 * replays this captured state to undo a merge: it is keyed on `merge_id`
 * (the `entity_merges` row id), not on entity ids, because a source entity
 * may have been merged more than once and the merge id is the only handle
 * on the specific inverse payload.
 */

import crypto from "crypto";
import { getSqliteDb } from "../repositories/sqlite/sqlite_client.js";
import { db } from "../db.js";
import { emitEntityLifecycle, emitEntitySnapshotChange } from "../events/substrate_store_emit.js";

export interface MergeEntitiesParams {
  fromEntityId: string;
  toEntityId: string;
  userId: string;
  mergeReason?: string;
  mergedBy: string;
  /** Required for replay safety; reuse with a different from/to pair is an error. */
  idempotencyKey?: string;
}

export interface MergeResult {
  merge_id: string;
  observations_moved: number;
  relationships_repointed: number;
  merged_at: string;
  replayed: boolean;
}

/** Deterministic canonicalization of the merge's semantically-meaningful input. */
function canonicalizeMergeInput(fromEntityId: string, toEntityId: string): string {
  return JSON.stringify({ from_entity_id: fromEntityId, to_entity_id: toEntityId });
}

export async function mergeEntities(params: MergeEntitiesParams): Promise<MergeResult> {
  const { fromEntityId, toEntityId, userId, mergeReason, mergedBy, idempotencyKey } = params;
  const sqliteDb = getSqliteDb();

  // --- Idempotency: replay same (user_id, idempotency_key) with the same
  //     from/to pair ⇒ return the original result. Different pair ⇒ reject.
  //     Callers that omit idempotencyKey (pre-existing behavior) skip this
  //     entirely — additive, not a breaking change to the merge contract.
  if (idempotencyKey) {
    const existing = sqliteDb
      .prepare(`SELECT * FROM entity_merges WHERE user_id = ? AND idempotency_key = ?`)
      .get(userId, idempotencyKey) as Record<string, unknown> | undefined;

    if (existing) {
      const canonicalInput = canonicalizeMergeInput(fromEntityId, toEntityId);
      const storedInput = canonicalizeMergeInput(
        String(existing.from_entity_id),
        String(existing.to_entity_id)
      );
      if (storedInput !== canonicalInput) {
        throw new IdempotencyMismatchError(
          `idempotency_key "${idempotencyKey}" reused with a different from_entity_id/to_entity_id pair. ` +
            "Provide a new idempotency_key for a new merge, or re-send the original pair."
        );
      }
      return {
        merge_id: String(existing.id),
        observations_moved: Number(existing.observations_rewritten ?? 0),
        relationships_repointed: JSON.parse(
          String(existing.repointed_relationship_rows_json ?? "[]")
        ).length,
        merged_at: String(existing.created_at),
        replayed: true,
      };
    }
  }

  // --- Pre-mutation validation (outside transaction — throws typed errors) ---

  const { data: fromEntity } = await db
    .from("entities")
    .select("id, merged_to_entity_id, entity_type")
    .eq("id", fromEntityId)
    .eq("user_id", userId)
    .single();

  const { data: toEntity } = await db
    .from("entities")
    .select("id, merged_to_entity_id, entity_type")
    .eq("id", toEntityId)
    .eq("user_id", userId)
    .single();

  if (!fromEntity || !toEntity) {
    throw new EntityNotFoundError("Entity not found");
  }

  if (fromEntity.merged_to_entity_id) {
    throw new EntityAlreadyMergedError("Source entity already merged");
  }

  if (toEntity.merged_to_entity_id) {
    throw new EntityAlreadyMergedError("Target entity already merged");
  }

  // --- Atomic mutation sequence ---

  const mergeId = crypto.randomUUID();
  const merged_at = new Date().toISOString();

  // Inverse-capture buffers (#2004). Populated inside the transaction and
  // serialised into entity_merges so unmergeEntities can replay the merge
  // backwards. Declared out here so they survive the transaction closure.
  let movedObservationIds: string[] = [];
  let deletedRelationshipRows: Array<Record<string, unknown>> = [];
  let deletedRelationshipSnapshotRows: Array<Record<string, unknown>> = [];
  let deletedEntitySnapshotRows: Array<Record<string, unknown>> = [];
  const repointedRelationshipRows: Array<Record<string, unknown>> = [];

  const result = sqliteDb.transaction(
    (): { observations_moved: number; relationships_repointed: number } => {
      // 1. Rewrite observation entity_id (observations table).
      //    Record WHICH rows move before moving them — `observations_rewritten`
      //    is only a count, and re-deriving the set afterwards (by joining on
      //    source_id) is unsound once any later write touches the survivor.
      movedObservationIds = (
        sqliteDb
          .prepare(`SELECT id FROM observations WHERE entity_id = ? AND user_id = ?`)
          .all(fromEntityId, userId) as Array<{ id: string }>
      ).map((r) => r.id);

      const obsResult = sqliteDb
        .prepare(
          `UPDATE observations
           SET entity_id = ?
           WHERE entity_id = ? AND user_id = ?`
        )
        .run(toEntityId, fromEntityId, userId);
      const observations_moved = (obsResult.changes as number) ?? 0;

      // 2. Fetch relationship_observations rows that reference fromEntityId
      type RelRow = {
        id: string;
        relationship_key: string;
        relationship_type: string;
        source_entity_id: string;
        target_entity_id: string;
        canonical_hash: string | null;
      };
      const fromRows = sqliteDb
        .prepare(
          `SELECT id, relationship_key, relationship_type,
                  source_entity_id, target_entity_id, canonical_hash
           FROM relationship_observations
           WHERE user_id = ?
             AND (source_entity_id = ? OR target_entity_id = ?)`
        )
        .all(userId, fromEntityId, fromEntityId) as RelRow[];

      // 3. Build dedup set from rows already owned by the survivor.
      // Collapse by relationship_key (type:source:target) — the unique edge
      // identity. The metadata-derived canonical_hash is intentionally excluded
      // so that duplicate edges differing only in observation metadata still
      // collapse to a single edge on the survivor after a merge.
      type SurvivorRow = { relationship_key: string };
      const survivorRows = sqliteDb
        .prepare(
          `SELECT relationship_key
           FROM relationship_observations
           WHERE user_id = ?
             AND (source_entity_id = ? OR target_entity_id = ?)`
        )
        .all(userId, toEntityId, toEntityId) as SurvivorRow[];

      const survivorKeys = new Set<string>(survivorRows.map((r) => r.relationship_key));

      const idsToDelete: string[] = [];
      const repointed: Array<{
        id: string;
        newRelationshipKey: string;
        newSourceEntityId: string;
        newTargetEntityId: string;
      }> = [];

      for (const row of fromRows) {
        const newSourceEntityId =
          row.source_entity_id === fromEntityId ? toEntityId : row.source_entity_id;
        const newTargetEntityId =
          row.target_entity_id === fromEntityId ? toEntityId : row.target_entity_id;

        // Drop self-loops produced by the repoint
        if (newSourceEntityId === newTargetEntityId) {
          idsToDelete.push(row.id);
          continue;
        }

        const newRelationshipKey = `${row.relationship_type}:${newSourceEntityId}:${newTargetEntityId}`;
        const dedupKey = newRelationshipKey;

        // Drop duplicates already present on the survivor
        if (survivorKeys.has(dedupKey)) {
          idsToDelete.push(row.id);
          continue;
        }

        survivorKeys.add(dedupKey);
        repointed.push({ id: row.id, newRelationshipKey, newSourceEntityId, newTargetEntityId });
        // Retain the PRE-repoint values so the update can be reversed exactly.
        repointedRelationshipRows.push({
          id: row.id,
          relationship_key: row.relationship_key,
          source_entity_id: row.source_entity_id,
          target_entity_id: row.target_entity_id,
        });
      }

      // 4. Delete self-loops and duplicates.
      //    Capture the FULL rows first: this delete is otherwise unrecoverable,
      //    because nothing else records that the absorbed entity independently
      //    asserted these edges. Captured rows are replayed by unmergeEntities.
      if (idsToDelete.length > 0) {
        const placeholders = idsToDelete.map(() => "?").join(",");
        deletedRelationshipRows = sqliteDb
          .prepare(
            `SELECT * FROM relationship_observations
             WHERE id IN (${placeholders}) AND user_id = ?`
          )
          .all(...idsToDelete, userId) as Array<Record<string, unknown>>;
        sqliteDb
          .prepare(
            `DELETE FROM relationship_observations
             WHERE id IN (${placeholders}) AND user_id = ?`
          )
          .run(...idsToDelete, userId);
      }

      // 5. Repoint surviving relationship_observations rows
      const updateRelStmt = sqliteDb.prepare(
        `UPDATE relationship_observations
         SET source_entity_id = ?,
             target_entity_id = ?,
             relationship_key  = ?
         WHERE id = ? AND user_id = ?`
      );
      for (const { id, newRelationshipKey, newSourceEntityId, newTargetEntityId } of repointed) {
        updateRelStmt.run(newSourceEntityId, newTargetEntityId, newRelationshipKey, id, userId);
      }

      // 6. Clean up stale relationship_snapshots for fromEntityId (capture first)
      deletedRelationshipSnapshotRows = sqliteDb
        .prepare(
          `SELECT * FROM relationship_snapshots
           WHERE user_id = ?
             AND (source_entity_id = ? OR target_entity_id = ?)`
        )
        .all(userId, fromEntityId, fromEntityId) as Array<Record<string, unknown>>;
      sqliteDb
        .prepare(
          `DELETE FROM relationship_snapshots
           WHERE user_id = ?
             AND (source_entity_id = ? OR target_entity_id = ?)`
        )
        .run(userId, fromEntityId, fromEntityId);

      // 7. Mark source entity as merged (LAST mutation — ensures entity stays
      //    alive/queryable on any earlier failure so edges are never orphaned)
      sqliteDb
        .prepare(
          `UPDATE entities
           SET merged_to_entity_id = ?,
               merged_at           = ?
           WHERE id = ? AND user_id = ?`
        )
        .run(toEntityId, merged_at, fromEntityId, userId);

      // 8a. Delete entity_snapshots for the merged-away entity (capture first).
      //     Ordered BEFORE the audit insert so the captured rows are actually
      //     serialised into it.
      deletedEntitySnapshotRows = sqliteDb
        .prepare(
          `SELECT * FROM entity_snapshots
           WHERE entity_id = ? AND user_id = ?`
        )
        .all(fromEntityId, userId) as Array<Record<string, unknown>>;
      sqliteDb
        .prepare(
          `DELETE FROM entity_snapshots
           WHERE entity_id = ? AND user_id = ?`
        )
        .run(fromEntityId, userId);

      // 8b. Audit record — carries the complete inverse of every mutation above,
      //    not just a count. This is what makes the merge reversible (#2004).
      sqliteDb
        .prepare(
          `INSERT INTO entity_merges
             (id, user_id, from_entity_id, to_entity_id, reason, merged_by, observations_rewritten,
              moved_observation_ids_json, deleted_relationship_rows_json,
              deleted_relationship_snapshot_rows_json, deleted_entity_snapshot_rows_json,
              repointed_relationship_rows_json, idempotency_key, unmerged_at, unmerged_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          mergeId,
          userId,
          fromEntityId,
          toEntityId,
          mergeReason ?? null,
          mergedBy,
          observations_moved,
          JSON.stringify(movedObservationIds),
          JSON.stringify(deletedRelationshipRows),
          JSON.stringify(deletedRelationshipSnapshotRows),
          JSON.stringify(deletedEntitySnapshotRows),
          JSON.stringify(repointedRelationshipRows),
          idempotencyKey ?? null,
          null,
          null,
          merged_at
        );

      return { observations_moved, relationships_repointed: repointed.length };
    }
  )();

  // --- Post-mutation side effects (events — outside transaction intentionally) ---

  const fromType = (fromEntity as { entity_type: string }).entity_type;
  const toType = (toEntity as { entity_type: string }).entity_type;
  emitEntityLifecycle({
    user_id: userId,
    entity_id: fromEntityId,
    entity_type: fromType,
    event_type: "entity.merged",
    timestamp: merged_at,
  });
  emitEntitySnapshotChange({
    user_id: userId,
    entity_id: toEntityId,
    entity_type: toType,
    event_type: "entity.updated",
    timestamp: merged_at,
  });

  return { merge_id: mergeId, ...result, merged_at, replayed: false };
}

export interface UnmergeEntitiesParams {
  /** The `entity_merges` row id returned by the original `merge_entities` call. */
  mergeId: string;
  userId: string;
  unmergedBy?: string;
}

export interface UnmergeResult {
  restored_entity_id: string;
  to_entity_id: string;
  observations_restored: number;
  relationships_restored: number;
  unmerged_at: string;
  /** True when this call replayed an already-reversed merge (idempotent no-op read). */
  already_reversed: boolean;
}

/**
 * Reverse a merge (#2004), keyed on `merge_id` — not entity ids, since a
 * source entity may have been merged more than once and the merge id is the
 * only correct handle on the specific inverse payload that was captured.
 *
 * Replays the recorded inverse from `entity_merges`: observations are moved
 * back by id, repointed edges are restored to their pre-merge source/target,
 * and rows the merge deleted are re-inserted verbatim.
 *
 * A merge recorded before #2004 landed has NULL capture columns. Those are
 * genuinely irreversible — the information needed to reconstruct them was
 * never written — so this refuses rather than guessing at a partial inverse.
 */
export async function unmergeEntities(params: UnmergeEntitiesParams): Promise<UnmergeResult> {
  const { mergeId, userId, unmergedBy } = params;
  const sqliteDb = getSqliteDb();

  // Tenant-scoped by id AND user_id together, so MERGE_NOT_FOUND fires
  // identically whether the id doesn't exist or belongs to another user —
  // never leaking cross-tenant existence via a different error/message.
  const auditRow = sqliteDb
    .prepare(`SELECT * FROM entity_merges WHERE id = ? AND user_id = ?`)
    .get(mergeId, userId) as Record<string, unknown> | undefined;

  if (!auditRow) {
    throw new MergeNotFoundError(
      `No merge found with id ${mergeId}. Check the merge_id returned by the original ` +
        `merge_entities call — this is not an entity id.`
    );
  }

  const fromEntityId = String(auditRow.from_entity_id);
  const toEntityId = String(auditRow.to_entity_id);

  // Idempotent no-op read: already unmerged. Not an error the caller must
  // handle specially, but still surfaced with the original unmerge timestamp.
  if (auditRow.unmerged_at != null) {
    return {
      restored_entity_id: fromEntityId,
      to_entity_id: toEntityId,
      observations_restored: 0,
      relationships_restored: 0,
      unmerged_at: String(auditRow.unmerged_at),
      already_reversed: true,
    };
  }

  // Pre-#2004 merges (or corrupted rows) carry no captured inverse. Refuse
  // rather than half-restore.
  if (
    auditRow.moved_observation_ids_json == null ||
    auditRow.deleted_relationship_rows_json == null ||
    auditRow.deleted_relationship_snapshot_rows_json == null
  ) {
    throw new MergeNotReversibleError(
      `Merge ${mergeId} predates reversible-merge support (or its inverse record is corrupt) ` +
        `and cannot be automatically undone. No safe partial action was taken.`
    );
  }

  // Chained-merge check: was the survivor of THIS merge later absorbed into a
  // third entity? If so, naive unmerge would leave data inconsistent (A→B,
  // then B→C: unmerging A→B without first unmerging B→C strands A's data in
  // a state neither merge nor unmerge accounts for). Detected at unmerge-time
  // only — merge-time detection would require guessing about merges that
  // have not happened yet.
  const supersedingMerge = sqliteDb
    .prepare(
      `SELECT id FROM entity_merges
       WHERE from_entity_id = ? AND user_id = ? AND unmerged_at IS NULL AND id != ?`
    )
    .get(toEntityId, userId, mergeId) as { id: string } | undefined;

  if (supersedingMerge) {
    throw new MergeSupersededError(
      `Entity ${fromEntityId} was merged again into a third entity after this merge ` +
        `(see merge ${supersedingMerge.id}). Unmerge that later merge first, or this ` +
        `would leave data in an inconsistent state.`
    );
  }

  const unmerged_at = new Date().toISOString();

  const parseRows = (v: unknown): Array<Record<string, unknown>> =>
    v == null ? [] : (JSON.parse(String(v)) as Array<Record<string, unknown>>);

  const movedObservationIds = JSON.parse(String(auditRow.moved_observation_ids_json)) as string[];
  const deletedRelationshipRows = parseRows(auditRow.deleted_relationship_rows_json);
  const deletedRelationshipSnapshotRows = parseRows(
    auditRow.deleted_relationship_snapshot_rows_json
  );
  const deletedEntitySnapshotRows = parseRows(auditRow.deleted_entity_snapshot_rows_json);
  const repointedRelationshipRows = parseRows(auditRow.repointed_relationship_rows_json);

  /** Re-insert a captured row verbatim, deriving columns from its own keys. */
  const reinsert = (table: string, rows: Array<Record<string, unknown>>): number => {
    let n = 0;
    for (const row of rows) {
      const cols = Object.keys(row);
      if (cols.length === 0) continue;
      const placeholders = cols.map(() => "?").join(",");
      sqliteDb
        .prepare(`INSERT OR IGNORE INTO ${table} (${cols.join(",")}) VALUES (${placeholders})`)
        .run(...cols.map((c) => row[c] as never));
      n++;
    }
    return n;
  };

  const result = sqliteDb.transaction(
    (): { observations_restored: number; relationships_restored: number } => {
      // 1. Move observations back — by explicit id, so observations that
      //    legitimately belonged to the survivor beforehand (or landed there
      //    from unrelated writes after the merge) are untouched. Concurrent
      //    writes after the merge are simply left where they are — v1 does
      //    not attempt to detect or warn about them.
      let observations_restored = 0;
      if (movedObservationIds.length > 0) {
        const stmt = sqliteDb.prepare(
          `UPDATE observations SET entity_id = ? WHERE id = ? AND user_id = ?`
        );
        for (const id of movedObservationIds) {
          observations_restored += (stmt.run(fromEntityId, id, userId).changes as number) ?? 0;
        }
      }

      // 2. Restore repointed edges to their pre-merge source/target/key,
      //    from the captured pre-image — not a blind reversal of whatever
      //    the row currently holds.
      let relationships_restored = 0;
      if (repointedRelationshipRows.length > 0) {
        const stmt = sqliteDb.prepare(
          `UPDATE relationship_observations
           SET source_entity_id = ?, target_entity_id = ?, relationship_key = ?
           WHERE id = ? AND user_id = ?`
        );
        for (const row of repointedRelationshipRows) {
          relationships_restored +=
            (stmt.run(
              row.source_entity_id as string,
              row.target_entity_id as string,
              row.relationship_key as string,
              row.id as string,
              userId
            ).changes as number) ?? 0;
        }
      }

      // 3. Re-insert rows the merge deleted (self-loops, duplicate edges,
      //    relationship snapshots, entity snapshots).
      relationships_restored += reinsert("relationship_observations", deletedRelationshipRows);
      reinsert("relationship_snapshots", deletedRelationshipSnapshotRows);
      reinsert("entity_snapshots", deletedEntitySnapshotRows);

      // 4. Clear the tombstone — the entity becomes queryable again.
      sqliteDb
        .prepare(
          `UPDATE entities
           SET merged_to_entity_id = NULL, merged_at = NULL
           WHERE id = ? AND user_id = ?`
        )
        .run(fromEntityId, userId);

      // 5. Mark the audit row spent so the same merge cannot be reversed twice.
      sqliteDb
        .prepare(
          `UPDATE entity_merges SET unmerged_at = ?, unmerged_by = ? WHERE id = ? AND user_id = ?`
        )
        .run(unmerged_at, unmergedBy ?? null, mergeId, userId);

      return { observations_restored, relationships_restored };
    }
  )();

  const { data: fromEntity } = await db
    .from("entities")
    .select("entity_type")
    .eq("id", fromEntityId)
    .eq("user_id", userId)
    .single();

  emitEntityLifecycle({
    user_id: userId,
    entity_id: fromEntityId,
    entity_type: (fromEntity as { entity_type: string } | null)?.entity_type ?? "unknown",
    event_type: "entity.unmerged",
    timestamp: unmerged_at,
  });

  return {
    ...result,
    restored_entity_id: fromEntityId,
    to_entity_id: toEntityId,
    unmerged_at,
    already_reversed: false,
  };
}

export class MergeNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MergeNotFoundError";
  }
}

export class MergeAlreadyReversedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MergeAlreadyReversedError";
  }
}

export class MergeSupersededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MergeSupersededError";
  }
}

export class MergeNotReversibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MergeNotReversibleError";
  }
}

export class IdempotencyMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdempotencyMismatchError";
  }
}

export class EntityNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntityNotFoundError";
  }
}

export class EntityAlreadyMergedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntityAlreadyMergedError";
  }
}
