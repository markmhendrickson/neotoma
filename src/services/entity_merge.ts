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
}

export interface MergeResult {
  observations_moved: number;
  relationships_repointed: number;
  merged_at: string;
}

export async function mergeEntities(params: MergeEntitiesParams): Promise<MergeResult> {
  const { fromEntityId, toEntityId, userId, mergeReason, mergedBy } = params;

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

  const sqliteDb = getSqliteDb();
  const merged_at = new Date().toISOString();

  const result = sqliteDb.transaction(
    (): { observations_moved: number; relationships_repointed: number } => {
      // 1. Rewrite observation entity_id (observations table)
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
      }

      // 4. Delete self-loops and duplicates
      if (idsToDelete.length > 0) {
        const placeholders = idsToDelete.map(() => "?").join(",");
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

      // 6. Clean up stale relationship_snapshots for fromEntityId
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

      // 8. Audit record
      sqliteDb
        .prepare(
          `INSERT INTO entity_merges
             (id, user_id, from_entity_id, to_entity_id, reason, merged_by, observations_rewritten, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          crypto.randomUUID(),
          userId,
          fromEntityId,
          toEntityId,
          mergeReason ?? null,
          mergedBy,
          observations_moved,
          merged_at
        );

      // 9. Delete entity_snapshots for the merged-away entity
      sqliteDb
        .prepare(
          `DELETE FROM entity_snapshots
           WHERE entity_id = ? AND user_id = ?`
        )
        .run(fromEntityId, userId);

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

  return { ...result, merged_at };
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
