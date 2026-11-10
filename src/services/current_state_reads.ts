/**
 * Current-state reads that do not depend on observation-history length (#2792).
 *
 * Lists, counts, count certification and snapshot reads answer a question about
 * the CURRENT state of an entity: is it visible, and which unknown-field
 * fragments does it carry now. Each of those answers is decided by a bounded
 * number of rows, but the paths that asked them read the entity's whole
 * observation history to find those rows. A client that re-stores every record
 * on each sync pass leaves hundreds of identical observations per entity, so
 * every list paid for every pass.
 *
 * This module answers the same questions from the rows that decide them:
 *
 *  - After a recorded lifecycle cutover, visibility is decided by the latest
 *    lifecycle-authority row targeted at, and attached to, the entity (the
 *    selector's "current" mode reads nothing else). Those rows are read through
 *    the partial unique index idx_entity_lifecycle_sequence, so the cost is the
 *    entity's lifecycle actions, not its facts.
 *  - Before a cutover, the legacy selector orders by source_priority first, so
 *    the row it selects is among the rows at the entity's highest priority.
 *    Deletion and restore write above every ordinary store priority, so for a
 *    hidden entity that is the small set of deletion records.
 *  - A fragment is current when it is the latest (by last_seen) fragment for
 *    its key on that entity whose source still has an observation of that
 *    entity. That is found per (entity, key) through
 *    idx_raw_fragments_entity_key_seen with one existence probe per candidate,
 *    instead of collecting every source the entity was ever stored from.
 *
 * What these readers do NOT do, compared with the exhaustive acquisition in
 * `isEntityDeleted` / `acquireEntityLifecycleContext`: they do not re-verify,
 * on every list, total or single snapshot read, the integrity of observations
 * that cannot decide the answer (factual rows below the deciding priority,
 * legacy-membership digests, authority rows written under another owner).
 * Authority rows attached to the entity are still checked, through
 * idx_entity_lifecycle_attached. They return the same answer the exhaustive
 * path returns whenever that path answers; corruption it would refuse is still
 * refused by field provenance, timeline and as-of reads, the cutover replay
 * and `verifyEntityLifecycleStorage`, which keep the exhaustive acquisition.
 */
import { getDb } from "../repositories/db/connection.js";
import { fromDbRow } from "../repositories/sqlite/local_db_adapter.js";
import {
  EntityLifecycleAcquisitionError,
  hasEntityLifecycleAuthority,
  selectLegacyEntityVisibility,
  type LifecycleObservation,
  type LifecycleTarget,
} from "./entity_lifecycle_authority.js";

/** Bound on bound parameters per statement (SQLite's default limit is 32766). */
const CHUNK = 400;
const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000000";

function refuse(): never {
  throw new EntityLifecycleAcquisitionError();
}

function chunks<T>(items: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function lifecycleRow(raw: Record<string, unknown>): LifecycleObservation {
  const fields = fromDbRow("observations", raw).fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) refuse();
  return { ...raw, fields } as LifecycleObservation;
}

/**
 * Recorded-cutover visibility for many targets at once: the ids whose latest
 * attached lifecycle authority hides them. Equivalent to running
 * `selectEntityLifecycleVisibility` in "current" mode per target, which reads
 * only these rows (no authority row means visible).
 */
export async function selectHiddenAfterCutover(
  targets: readonly LifecycleTarget[]
): Promise<Set<string>> {
  const hidden = new Set<string>();
  if (targets.length === 0) return hidden;
  const connection = await getDb();
  const byOwner = new Map<string, LifecycleTarget[]>();
  for (const target of targets) {
    if (!target.id || !target.user_id || !target.entity_type) refuse();
    const list = byOwner.get(target.user_id) ?? [];
    list.push(target);
    byOwner.set(target.user_id, list);
  }
  for (const [owner, ownerTargets] of byOwner) {
    for (const part of chunks(ownerTargets)) {
      const byId = new Map(part.map((t) => [t.id, t]));
      // `entity_lifecycle_kind IS NOT NULL` selects the partial unique index
      // (user_id, entity_lifecycle_target_id, entity_lifecycle_sequence).
      const rows = (await connection
        .prepare(
          `SELECT * FROM observations WHERE user_id = ? AND entity_lifecycle_target_id IN (${part
            .map(() => "?")
            .join(",")}) AND entity_lifecycle_kind IS NOT NULL`
        )
        .all(owner, ...part.map((t) => t.id))) as Record<string, unknown>[];
      const latest = new Map<string, LifecycleObservation>();
      const sequences = new Set<string>();
      for (const raw of rows) {
        const row = lifecycleRow(raw);
        if (!hasEntityLifecycleAuthority(row)) refuse();
        const target = byId.get(row.entity_lifecycle_target_id!);
        if (!target) refuse();
        const key = `${target.id}\u0000${row.entity_lifecycle_sequence}`;
        if (sequences.has(key)) refuse();
        sequences.add(key);
        if (row.user_id !== target.user_id || row.entity_type !== target.entity_type) refuse();
        // Authority attached elsewhere (moved by a merge) does not decide this
        // target, exactly as in the selector.
        if (row.entity_id !== target.id) continue;
        const current = latest.get(target.id);
        if (!current || row.entity_lifecycle_sequence! > current.entity_lifecycle_sequence!)
          latest.set(target.id, row);
      }
      await verifyAttachedAuthority(connection, owner, part);
      for (const [id, row] of latest) {
        if (row.entity_lifecycle_kind === "delete" || row.entity_lifecycle_kind === "legacy_hidden")
          hidden.add(id);
      }
    }
  }
  return hidden;
}

/**
 * The authority rows ATTACHED to these entities must be well formed and name
 * an owned entity of the same type, as the exhaustive acquisition requires
 * before it answers. They are read through idx_entity_lifecycle_attached, so
 * the cost is the entities' lifecycle actions, not their histories.
 */
async function verifyAttachedAuthority(
  connection: Awaited<ReturnType<typeof getDb>>,
  owner: string,
  targets: readonly LifecycleTarget[]
): Promise<void> {
  const byId = new Map(targets.map((t) => [t.id, t]));
  const rows = (await connection
    .prepare(
      `SELECT * FROM observations WHERE entity_id IN (${targets
        .map(() => "?")
        .join(",")}) AND user_id = ? AND entity_lifecycle_kind IS NOT NULL`
    )
    .all(...targets.map((t) => t.id), owner)) as Record<string, unknown>[];
  const named = new Map<string, string>(); // named target id -> required entity type
  for (const raw of rows) {
    const row = lifecycleRow(raw);
    if (!hasEntityLifecycleAuthority(row)) refuse();
    const attachedTo = byId.get(row.entity_id as string);
    if (!attachedTo || row.entity_type !== attachedTo.entity_type) refuse();
    const targetId = row.entity_lifecycle_target_id!;
    const known = byId.get(targetId);
    if (known) {
      if (known.entity_type !== attachedTo.entity_type) refuse();
    } else {
      const required = named.get(targetId);
      if (required !== undefined && required !== attachedTo.entity_type) refuse();
      named.set(targetId, attachedTo.entity_type);
    }
  }
  const namedIds = [...named.keys()];
  for (const part of chunks(namedIds)) {
    const found = (await connection
      .prepare(
        `SELECT id, entity_type FROM entities WHERE user_id = ? AND id IN (${part
          .map(() => "?")
          .join(",")})`
      )
      .all(owner, ...part)) as Array<{ id: string; entity_type: unknown }>;
    const types = new Map(found.map((row) => [row.id, row.entity_type]));
    for (const id of part) if (types.get(id) !== named.get(id)) refuse();
  }
}

/** Rows read at the deciding priority before falling back to the full history. */
export const DECIDING_ROW_LIMIT = 64;

/**
 * The observations at an entity's highest source_priority: the only rows the
 * legacy selector can select. Returns `null` when more than
 * DECIDING_ROW_LIMIT rows share that priority (the caller then keeps its
 * exhaustive path), so the bound never changes an answer.
 */
export async function readDecidingObservations(
  entityId: string,
  userId: string
): Promise<LifecycleObservation[] | null> {
  const connection = await getDb();
  const top = (await connection
    .prepare(
      "SELECT MAX(source_priority) AS p FROM observations WHERE entity_id = ? AND user_id = ?"
    )
    .get(entityId, userId)) as { p: number | null } | undefined;
  if (!top || top.p === null || top.p === undefined) return [];
  // Size the top-priority run from idx_observations_entity_id alone before
  // reading any row, so a long run of ordinary stores costs no payload reads.
  const run = (await connection
    .prepare(
      "SELECT COUNT(*) AS n FROM (SELECT 1 FROM observations WHERE entity_id = ? AND source_priority = ? LIMIT ?)"
    )
    .get(entityId, top.p, DECIDING_ROW_LIMIT + 1)) as { n: number };
  if (run.n > DECIDING_ROW_LIMIT) return null;
  const rows = (await connection
    .prepare(
      "SELECT * FROM observations WHERE entity_id = ? AND user_id = ? AND source_priority = ? ORDER BY observed_at DESC LIMIT ?"
    )
    .all(entityId, userId, top.p, DECIDING_ROW_LIMIT + 1)) as Record<string, unknown>[];
  if (rows.length > DECIDING_ROW_LIMIT) return null;
  return rows.map((raw) => {
    const fields = fromDbRow("observations", raw).fields;
    return { ...raw, fields } as LifecycleObservation;
  });
}

/**
 * Pre-cutover `isEntityDeleted` answer from the deciding rows only. That
 * facade orders by priority then observed_at (no source rank), so its
 * selected row is at the highest priority. Returns `undefined` when the
 * bounded read cannot decide (caller falls back).
 */
export async function legacyHiddenFromDecidingRows(
  entityId: string,
  userId: string
): Promise<boolean | undefined> {
  const rows = await readDecidingObservations(entityId, userId);
  if (rows === null) {
    // Many rows share the top priority (a long run of ordinary stores). The
    // newest by time is the newest by text when every observed_at at that
    // priority has toISOString's fixed-width form; confirm that from the index
    // alone (no row reads), else let the caller take the exhaustive path.
    const connection = await getDb();
    const top = (await connection
      .prepare(
        "SELECT MAX(source_priority) AS p FROM observations WHERE entity_id = ? AND user_id = ?"
      )
      .get(entityId, userId)) as { p: number };
    const irregular = await connection
      .prepare(
        `SELECT 1 FROM observations WHERE entity_id = ? AND source_priority = ? AND observed_at NOT GLOB '${ISO_GLOB}' LIMIT 1`
      )
      .get(entityId, top.p);
    if (irregular) return undefined;
    const newest = (await connection
      .prepare(
        "SELECT fields FROM observations WHERE entity_id = ? AND user_id = ? AND source_priority = ? ORDER BY observed_at DESC LIMIT 1"
      )
      .get(entityId, userId, top.p)) as Record<string, unknown> | undefined;
    if (!newest) return undefined;
    const fields = fromDbRow("observations", newest).fields as Record<string, unknown> | null;
    return fields?._deleted === true;
  }
  if (rows.length === 0) return false;
  const sorted = [...rows].sort(
    (a, b) => new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime()
  );
  return (sorted[0].fields as Record<string, unknown> | null)?._deleted === true;
}

/** `Date.prototype.toISOString()` shape: fixed width, so text order is time order. */
const ISO_GLOB =
  "[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z";

/** Same deciding rows, through the validated legacy selector (certification). */
export async function legacySelectorHiddenFromDecidingRows(
  entityId: string,
  userId: string
): Promise<{ hidden: boolean; rows: LifecycleObservation[] } | undefined> {
  const rows = await readDecidingObservations(entityId, userId);
  if (rows === null) return undefined;
  return { hidden: selectLegacyEntityVisibility(rows).hidden, rows };
}

/**
 * The current unknown-field fragments of the given entities (all of one type),
 * keyed by entity id then fragment key: per key, the latest fragment by
 * last_seen whose source still has an observation of that entity from a
 * matching owner. Only fragments that name their entity are considered;
 * legacy fragments (entity_id NULL) are attributed by the caller.
 */
export async function readCurrentEntityFragments(
  entityIds: readonly string[],
  entityType: string,
  userId?: string
): Promise<Map<string, Map<string, { value: unknown; last_seen: string }>>> {
  const result = new Map<string, Map<string, { value: unknown; last_seen: string }>>();
  if (entityIds.length === 0) return result;
  const connection = await getDb();
  const ownerClause = userId
    ? userId === DEFAULT_USER_ID
      ? "(f.user_id = ? OR f.user_id IS NULL) AND EXISTS (SELECT 1 FROM observations o WHERE o.source_id = f.source_id AND o.entity_type = f.entity_type AND o.entity_id = f.entity_id AND o.user_id = ?)"
      : "f.user_id = ? AND EXISTS (SELECT 1 FROM observations o WHERE o.source_id = f.source_id AND o.entity_type = f.entity_type AND o.entity_id = f.entity_id AND o.user_id = ?)"
    : `EXISTS (SELECT 1 FROM observations o WHERE o.source_id = f.source_id AND o.entity_type = f.entity_type AND o.entity_id = f.entity_id AND (o.user_id = f.user_id OR (f.user_id IS NULL AND o.user_id = '${DEFAULT_USER_ID}')))`;
  const ownerParams = userId ? [userId, userId] : [];
  for (const part of chunks(entityIds)) {
    // Loose index scan: step through each entity's distinct fragment keys on
    // (entity_id, fragment_key, last_seen) instead of reading every fragment
    // every sync pass left behind, then take the newest eligible one per key.
    const picked = (await connection
      .prepare(
        `WITH RECURSIVE page(entity_id) AS (VALUES ${part.map(() => "(?)").join(",")}),
        keys(entity_id, fragment_key) AS (
          SELECT p.entity_id, (SELECT MIN(fragment_key) FROM raw_fragments WHERE entity_id = p.entity_id) FROM page p
          UNION ALL
          SELECT k.entity_id, (SELECT MIN(fragment_key) FROM raw_fragments WHERE entity_id = k.entity_id AND fragment_key > k.fragment_key)
          FROM keys k WHERE k.fragment_key IS NOT NULL
        )
        SELECT (SELECT f.id FROM raw_fragments f
                 WHERE f.entity_id = k.entity_id AND f.fragment_key = k.fragment_key AND f.entity_type = ?
                   AND ${ownerClause}
                 ORDER BY f.last_seen DESC, f.id DESC LIMIT 1) AS id
        FROM keys k WHERE k.fragment_key IS NOT NULL`
      )
      .all(...part, entityType, ...ownerParams)) as Array<{ id: string | null }>;
    const ids = picked.map((r) => r.id).filter((id): id is string => typeof id === "string");
    for (const idPart of chunks(ids)) {
      const rows = (await connection
        .prepare(
          `SELECT id, entity_id, fragment_key, fragment_value, last_seen, first_seen FROM raw_fragments WHERE id IN (${idPart
            .map(() => "?")
            .join(",")})`
        )
        .all(...idPart)) as Record<string, unknown>[];
      for (const raw of rows) {
        const row = fromDbRow("raw_fragments", raw);
        const entityId = row.entity_id as string;
        const byKey = result.get(entityId) ?? new Map();
        byKey.set(row.fragment_key as string, {
          value: row.fragment_value,
          last_seen: String(row.last_seen ?? row.first_seen ?? ""),
        });
        result.set(entityId, byKey);
      }
    }
  }
  return result;
}

/** Whether any legacy (entity_id NULL) fragment exists for the type. */
export async function hasLegacyFragments(entityType: string): Promise<boolean> {
  const connection = await getDb();
  return Boolean(
    await connection
      .prepare("SELECT 1 FROM raw_fragments WHERE entity_id IS NULL AND entity_type = ? LIMIT 1")
      .get(entityType)
  );
}

/**
 * Current visibility of one unmerged entity from its deciding rows, or
 * `undefined` when the bounded read cannot decide and the caller must use the
 * exhaustive `isEntityDeleted`.
 */
/**
 * Recorded-cutover visibility of one entity read by id for its owner, as the
 * current-snapshot endpoint asks it. An owned, unmerged entity is answered from
 * its lifecycle authority rows; a merge tombstone or an id the owner does not
 * hold keeps the exhaustive acquisition, exactly as before.
 */
export async function isOwnedEntityHiddenAfterCutover(
  entityId: string,
  userId: string
): Promise<boolean> {
  const row = (await (await getDb())
    .prepare(
      "SELECT id, user_id, entity_type, merged_to_entity_id FROM entities WHERE id = ? AND user_id = ?"
    )
    .get(entityId, userId)) as
    | { id: string; user_id: string; entity_type: unknown; merged_to_entity_id: unknown }
    | undefined;
  if (row && !row.merged_to_entity_id && typeof row.entity_type === "string")
    return (
      await selectHiddenAfterCutover([
        { id: row.id, user_id: row.user_id, entity_type: row.entity_type },
      ])
    ).has(entityId);
  const { isEntityDeleted } = await import("./deletion.js");
  return isEntityDeleted(entityId, userId);
}

export async function isEntityHiddenNow(target: LifecycleTarget): Promise<boolean | undefined> {
  const { hasRecordedEntityLifecycleCutover } = await import("./entity_lifecycle_storage.js");
  if (await hasRecordedEntityLifecycleCutover(await getDb()))
    return (await selectHiddenAfterCutover([target])).has(target.id);
  return legacyHiddenFromDecidingRows(target.id, target.user_id);
}
