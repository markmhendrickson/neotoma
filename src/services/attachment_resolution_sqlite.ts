/**
 * Attachment resolution over a raw SQLite handle — #2343.
 *
 * The service-layer seam (`attachment_resolution.ts`) resolves through the
 * `db` client. Two snapshot-computing sites cannot reach it, for structural
 * reasons rather than convenience:
 *
 *   1. `repositories/sqlite/local_db_adapter.ts` recomputes a snapshot from
 *      INSIDE the adapter's own observation-insert path. `db` *is* that
 *      adapter (see `src/db.ts`), so a service-layer call would re-enter the
 *      adapter mid-insert. Delegating upward there is not a refactor, it is a
 *      recursion.
 *   2. `cli/index.ts:recomputeMergedDbSnapshots` rebuilds snapshots in an
 *      ARBITRARY target database file opened by path during a merge-import.
 *      That file is not the process's configured database, so the service
 *      seam would resolve against the wrong store entirely.
 *
 * So this module is not a second implementation of the *rules* — it is the
 * same rules expressed against the only handle those two callers have. The
 * resolution semantics are kept deliberately identical to
 * `resolveAttachmentTarget`: follow `entities.merged_to_entity_id` to a fixed
 * point, bounded by a visited-set cycle guard and the SAME depth constant, and
 * treat a missing `entities` row as "resolves to itself" rather than an error.
 *
 * The shared depth constant is imported rather than redeclared precisely so
 * the two cannot drift apart silently: a change to the bound moves both.
 */

import { MAX_ATTACHMENT_RESOLUTION_DEPTH } from "./attachment_resolution.js";

/** The minimal SQLite surface both callers already have. */
export interface SqliteLike {
  prepare(sql: string): { get(...params: unknown[]): Promise<unknown> | unknown };
}

export interface SqliteAttachmentTarget {
  resolvedEntityId: string;
  truncated: boolean;
  truncationReason?: "cycle" | "depth";
}

/**
 * Follow the merge alias to a fixed point over a raw SQLite handle.
 *
 * Mirrors `resolveAttachmentTarget`. A missing `entities` table (some CLI
 * targets carry observations without it) resolves to the id as given, which is
 * exactly what the flat fetch did before this seam existed.
 */
export async function resolveAttachmentTargetSqlite(
  db: SqliteLike,
  entityId: string
): Promise<SqliteAttachmentTarget> {
  const visited = new Set<string>([entityId]);
  let current = entityId;

  for (let depth = 0; depth < MAX_ATTACHMENT_RESOLUTION_DEPTH; depth++) {
    let row: { merged_to_entity_id?: string | null } | undefined;
    try {
      row = (await db
        .prepare("SELECT merged_to_entity_id FROM entities WHERE id = ?")
        .get(current)) as { merged_to_entity_id?: string | null } | undefined;
    } catch {
      // No `entities` table, or it lacks the column: nothing declares a
      // redirect, so the id resolves to itself. Behaviour-preserving.
      return { resolvedEntityId: current, truncated: false };
    }

    const next = row?.merged_to_entity_id;
    if (!next) return { resolvedEntityId: current, truncated: false };
    if (visited.has(next)) {
      return { resolvedEntityId: current, truncated: true, truncationReason: "cycle" };
    }

    visited.add(next);
    current = next;
  }

  return { resolvedEntityId: current, truncated: true, truncationReason: "depth" };
}

/**
 * Whether `entityId` owns a snapshot of its own, over a raw SQLite handle.
 *
 * The SQLite counterpart of `resolveOwnedObservations`'s ownership half.
 * Resolution and ownership are different questions: a merge tombstone resolves
 * to its survivor but owns no snapshot row, so a persisting caller that only
 * resolved would write the survivor's snapshot under the tombstone's id — a
 * duplicate the flat fetch never produced.
 */
export async function ownsSnapshotSqlite(db: SqliteLike, entityId: string): Promise<boolean> {
  const target = await resolveAttachmentTargetSqlite(db, entityId);
  return target.resolvedEntityId === entityId;
}
