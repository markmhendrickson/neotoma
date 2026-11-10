/** Membership proof for the existing snapshot-based collection total (#2597).
 * Missing materializations are not evidence of deletion. Only the same complete
 * attachment acquisition and visibility selector used by the reducer can excuse
 * a missing snapshot. No observations or lifecycle state are changed here.
 */
import { getDb } from "../repositories/db/connection.js";
import { resolveAttachedObservations, resolveAttachmentTarget } from "./attachment_resolution.js";
import {
  acquireEntityLifecycleContext,
  hasRecordedEntityLifecycleCutover,
} from "./entity_lifecycle_storage.js";
import { readDecidingObservations, selectHiddenAfterCutover } from "./current_state_reads.js";
import {
  selectEntityLifecycleVisibility,
  selectLegacyEntityVisibility,
  type LifecycleObservation,
  type LifecycleTarget,
  type EntityLifecycleContext,
} from "./entity_lifecycle_authority.js";

export async function certifySnapshotPopulation(
  userId: string,
  entityTypes: string[],
  candidateIds?: string[]
): Promise<boolean> {
  const connection = await getDb();
  const types = (alias: string) =>
    entityTypes.length
      ? ` AND ${alias}.entity_type IN (${entityTypes.map(() => "?").join(",")})`
      : "";
  // Candidate subsets are already owner/type scoped by the filtered count.
  const candidates = candidateIds ? new Set(candidateIds) : undefined;
  try {
    const orphan = await connection
      .prepare(
        `SELECT 1 FROM entity_snapshots s LEFT JOIN entities e ON e.id=s.entity_id AND e.user_id=s.user_id AND e.entity_type=s.entity_type AND e.merged_to_entity_id IS NULL WHERE s.user_id=?${types("s")} AND e.id IS NULL LIMIT 1`
      )
      .get(userId, ...entityTypes);
    if (orphan) return false;
    const missing = (await connection
      .prepare(
        `SELECT e.id,e.user_id,e.entity_type FROM entities e LEFT JOIN entity_snapshots s ON s.entity_id=e.id AND s.user_id=e.user_id AND s.entity_type=e.entity_type WHERE e.user_id=? AND e.merged_to_entity_id IS NULL${types("e")} AND s.entity_id IS NULL`
      )
      .all(userId, ...entityTypes)) as LifecycleTarget[];
    const pending = missing.filter((target) => !candidates || candidates.has(target.id));
    if (pending.length === 0) return true;
    // Hidden-entity proof from the rows that decide visibility, not the whole
    // history (#2792). A missing snapshot is excused only when that proof holds.
    for (const target of pending) {
      const attachment = await resolveAttachmentTarget(target.id, userId);
      if (attachment.truncated || attachment.resolvedEntityId !== target.id) return false;
    }
    if (await hasRecordedEntityLifecycleCutover(connection)) {
      const hidden = await selectHiddenAfterCutover(pending);
      return pending.every((target) => hidden.has(target.id));
    }
    let legacyContext: EntityLifecycleContext | undefined;
    for (const target of pending) {
      const deciding = await readDecidingObservations(target.id, userId);
      const rows =
        deciding ?? ((await resolveAttachedObservations(target.id, userId)).observations as never);
      if (!rows.length) return false;
      // Certification needs exact type membership even where pre-migration
      // replay deliberately permits mixed-type merge history.
      if (
        rows.some(
          (row: LifecycleObservation) =>
            row.user_id !== target.user_id ||
            row.entity_type !== target.entity_type ||
            !row.fields ||
            typeof row.fields !== "object" ||
            Array.isArray(row.fields)
        )
      )
        return false;
      const context = legacyContext
        ? { ...legacyContext, target }
        : await acquireEntityLifecycleContext(connection, target, rows);
      if (context.mode !== "pre_migration") return false;
      // Certification is stricter than permissive legacy replay: malformed
      // comparator inputs cannot establish an exact population.
      selectLegacyEntityVisibility(rows);
      legacyContext = context;
      if (!selectEntityLifecycleVisibility(rows, context).hidden) return false;
    }
    return true;
  } catch {
    // Corrupt authority, failed acquisition, or malformed history stays unknown.
    return false;
  }
}
