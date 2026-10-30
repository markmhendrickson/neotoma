/** Membership proof for the existing snapshot-based collection total (#2597).
 * Missing materializations are not evidence of deletion. Only the same complete
 * attachment acquisition and visibility selector used by the reducer can excuse
 * a missing snapshot. No observations or lifecycle state are changed here.
 */
import { getDb } from "../repositories/db/connection.js";
import { resolveAttachedObservations } from "./attachment_resolution.js";
import { acquireEntityLifecycleContext } from "./entity_lifecycle_storage.js";
import {
  selectEntityLifecycleVisibility,
  selectLegacyEntityVisibility,
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
    let legacyContext: EntityLifecycleContext | undefined;
    for (const target of missing) {
      if (candidates && !candidates.has(target.id)) continue;
      const attached = await resolveAttachedObservations(target.id, userId);
      if (
        attached.truncated ||
        attached.resolvedEntityId !== target.id ||
        !attached.observations.length
      )
        return false;
      const rows = attached.observations;
      // Certification needs exact type membership even where pre-migration
      // replay deliberately permits mixed-type merge history.
      if (
        rows.some(
          (row) =>
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
      if (context.mode === "pre_migration") {
        // Certification is stricter than permissive legacy replay: malformed
        // comparator inputs cannot establish an exact population.
        selectLegacyEntityVisibility(rows);
        legacyContext = context;
      }
      if (!selectEntityLifecycleVisibility(rows, context).hidden) return false;
    }
    return true;
  } catch {
    // Corrupt authority, failed acquisition, or malformed history stays unknown.
    return false;
  }
}
