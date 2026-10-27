/** Membership proof for the existing snapshot-based collection total (#2597).
 * Missing materializations are not evidence of deletion. Only the same complete
 * attachment acquisition and visibility selector used by the reducer can excuse
 * a missing snapshot. No observations or lifecycle state are changed here.
 */
import { getDb } from "../repositories/db/connection.js";
import type { DbConnection } from "../repositories/db/driver.js";
import { resolveAttachedObservations } from "./attachment_resolution.js";
import { acquireEntityLifecycleContext } from "./entity_lifecycle_storage.js";
import {
  selectEntityLifecycleVisibility,
  selectLegacyEntityVisibility,
  type LifecycleTarget,
  type LifecycleObservation,
  type EntityLifecycleContext,
} from "./entity_lifecycle_authority.js";

/** Targets read per index-only statement; bounds the IN list, not the work. */
const WINNER_CHUNK = 400;

/** Pre-cutover only: no lifecycle authority exists anywhere in the store, so a
 * target's visibility is decided by the legacy comparator alone.
 */
async function legacyOnlyStore(connection: DbConnection): Promise<boolean> {
  const columns = (await connection.prepare("PRAGMA table_info(observations)").all()) as {
    name: string;
  }[];
  const hasKind = columns.some((c) => c.name === "entity_lifecycle_kind");
  const table = await connection
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='entity_lifecycle_cutovers'"
    )
    .get();
  if (table) {
    const recorded = await connection
      .prepare("SELECT 1 AS n FROM entity_lifecycle_cutovers LIMIT 1")
      .get();
    if (recorded) return false;
  }
  // The insert trigger makes the three authority columns all-or-none, so one
  // column answers it; the partial unique index serves this probe.
  if (hasKind) {
    const populated = await connection
      .prepare("SELECT 1 AS n FROM observations WHERE entity_lifecycle_kind IS NOT NULL LIMIT 1")
      .get();
    if (populated) return false;
  }
  return true;
}

/**
 * Certify that every target is hidden under the legacy comparator WITHOUT
 * reading the payloads of observations that cannot decide it.
 *
 * The legacy selector orders by `source_priority` first (see
 * selectLegacyEntityVisibility), so the visible/hidden verdict is decided by the
 * observations that share the entity's highest priority. Every other row only
 * needs its comparator inputs (`source_priority`, `observed_at`) validated, and
 * both live in `idx_observations_entity_id`, which answers the whole enumeration
 * from the index without touching a row. Only the top-priority rows (for a
 * deleted entity: the small deletion record) are then read in full. The old path
 * loaded every observation of every hidden entity, payloads included, on every
 * list request: cost proportional to the number of deleted entities times their
 * stored bytes, paid inside a synchronous read on the single connection.
 *
 * Returns false (unknown) wherever the exhaustive path would, except that the
 * `fields` shape of a non-deciding observation is no longer inspected.
 */
async function certifyHiddenTargetsFromWinners(
  connection: DbConnection,
  targets: LifecycleTarget[]
): Promise<boolean> {
  for (let start = 0; start < targets.length; start += WINNER_CHUNK) {
    const chunk = targets.slice(start, start + WINNER_CHUNK);
    const index = (await connection
      .prepare(
        `SELECT entity_id, source_priority, observed_at FROM observations WHERE entity_id IN (${chunk.map(() => "?").join(",")})`
      )
      .all(...chunk.map((t) => t.id))) as {
      entity_id: string;
      source_priority: unknown;
      observed_at: unknown;
    }[];
    const top = new Map<string, number>();
    for (const row of index) {
      if (typeof row.source_priority !== "number" || !Number.isFinite(row.source_priority))
        return false;
      if (typeof row.observed_at !== "string" || !Number.isFinite(Date.parse(row.observed_at)))
        return false;
      const seen = top.get(row.entity_id);
      if (seen === undefined || row.source_priority > seen)
        top.set(row.entity_id, row.source_priority);
    }
    // One statement per chunk: each entity's rows at its highest priority.
    const rows = (await connection
      .prepare(
        `SELECT o.* FROM observations o WHERE o.entity_id IN (${chunk.map(() => "?").join(",")}) AND o.source_priority = (SELECT MAX(i.source_priority) FROM observations i WHERE i.entity_id = o.entity_id)`
      )
      .all(...chunk.map((t) => t.id))) as Array<Record<string, unknown>>;
    const winnersByEntity = new Map<string, LifecycleObservation[]>();
    for (const raw of rows) {
      let fields: unknown;
      try {
        fields = typeof raw.fields === "string" ? JSON.parse(raw.fields) : raw.fields;
      } catch {
        return false;
      }
      if (!fields || typeof fields !== "object" || Array.isArray(fields)) return false;
      const list = winnersByEntity.get(raw.entity_id as string) ?? [];
      list.push({ ...raw, fields } as unknown as LifecycleObservation);
      winnersByEntity.set(raw.entity_id as string, list);
    }
    for (const target of chunk) {
      if (!top.has(target.id)) return false; // no observations: not evidence of deletion
      // Newest first, as the exhaustive path's ordered fetch supplies them.
      const winners = (winnersByEntity.get(target.id) ?? []).sort(
        (a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at)
      );
      if (!winners.length) return false;
      // Same selectors the exhaustive path ends in, over the rows that can win.
      selectLegacyEntityVisibility(winners);
      const context = { acquisition: "complete", target, mode: "pre_migration" } as const;
      if (!selectEntityLifecycleVisibility(winners, context).hidden) return false;
    }
  }
  return true;
}

export async function certifySnapshotPopulation(
  userId: string,
  entityTypes: string[],
  candidateIds?: string[],
  options: { winnerOnly?: boolean } = {}
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
    const toCheck = candidates ? missing.filter((t) => candidates.has(t.id)) : missing;
    if (toCheck.length && options.winnerOnly !== false && (await legacyOnlyStore(connection)))
      return await certifyHiddenTargetsFromWinners(connection, toCheck);
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
      if (
        rows.some(
          (row) => !row.fields || typeof row.fields !== "object" || Array.isArray(row.fields)
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
