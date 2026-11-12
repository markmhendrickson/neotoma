/**
 * Snapshot Computation Service (Domain Layer)
 *
 * Handles entity snapshot queries and recomputation. Extracted from
 * actions.ts and server.ts to enforce layer boundaries.
 */

import { db } from "../db.js";
import { logger } from "../utils/logger.js";
import { observationReducer, type Observation } from "../reducers/observation_reducer.js";
import {
  CanonicalNameUnresolvedError,
  deriveCanonicalNameFromFieldsWithTrace,
  entityIdTenantSalt,
  generateEntityId,
} from "./entity_resolution.js";
import { resolveOwnedObservations } from "./attachment_resolution.js";
import { schemaRegistry, type SchemaDefinition } from "./schema_registry.js";
import { upsertTimelineEventsForEntitySnapshot } from "./timeline_events.js";

export interface SnapshotRecord {
  entity_id: string;
  entity_type: string;
  schema_version: string;
  snapshot: Record<string, unknown>;
  computed_at: string;
  observation_count: number;
  last_observation_at: string;
  provenance: Record<string, string>;
  user_id: string;
}

export async function getSnapshot(
  entityId: string,
  userId: string
): Promise<SnapshotRecord | null> {
  const { data, error } = await db
    .from("entity_snapshots")
    .select("*")
    .eq("entity_id", entityId)
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to get snapshot: ${error.message}`);
  }

  const { filterCurrentLifecycleRecords } = await import("./entity_queries.js");
  return data && (await filterCurrentLifecycleRecords([data], userId)).length
    ? (data as SnapshotRecord)
    : null;
}

export async function deleteSnapshot(entityId: string, userId: string): Promise<void> {
  const { error } = await db
    .from("entity_snapshots")
    .delete()
    .eq("entity_id", entityId)
    .eq("user_id", userId);
  if (error) throw new Error("Failed to delete entity snapshot");
}

export async function recomputeSnapshot(
  entityId: string,
  userId: string,
  strictDerivedEffects: boolean = false
): Promise<SnapshotRecord | null> {
  // #2340: a snapshot is a function of the observations ATTACHED to the
  // entity, resolved through the declared resolution layer, not of the rows
  // whose `entity_id` column equals the entity. See attachment_resolution.ts.
  // A redirected id owns no snapshot of its own: `resolveOwnedObservations`
  // returns null for one, so the survivor's rows are never written back under
  // a tombstone's id. See attachment_resolution.ts for why resolution and
  // ownership are separate questions.
  const observations = await resolveOwnedObservations(entityId, userId);
  if (observations === null) return null;
  if (observations.length === 0) {
    // A missing physical set must not erase a recorded compatibility proof.
    // The shared visibility acquisition distinguishes valid empty entities
    // from incomplete captured membership; pre-cutover behavior is unchanged.
    const { isEntityDeleted } = await import("./deletion.js");
    await isEntityDeleted(entityId, userId);
    return null;
  }

  const computed = await observationReducer.computeSnapshot(entityId, observations);
  if (!computed) {
    await deleteSnapshot(entityId, userId);
    return null;
  }

  const sourceId =
    typeof (observations[0] as { source_id?: string | null }).source_id === "string"
      ? (observations[0] as { source_id: string }).source_id || ""
      : "";

  return persistComputedSnapshot(computed, entityId, userId, sourceId, strictDerivedEffects);
}

/**
 * Persist an already-reduced snapshot and run its derived effects (timeline
 * events, canonical-name evolution). Split out of {@link recomputeSnapshot}
 * unchanged so the optimistic correction path persists exactly what the full
 * recompute would.
 */
async function persistComputedSnapshot(
  computed: NonNullable<Awaited<ReturnType<typeof observationReducer.computeSnapshot>>>,
  entityId: string,
  userId: string,
  sourceId: string,
  strictDerivedEffects: boolean
): Promise<SnapshotRecord | null> {
  const { error: upsertError } = await db
    .from("entity_snapshots")
    .upsert({ ...computed } as Record<string, unknown>);

  if (upsertError) throw new Error(`Failed to upsert snapshot: ${upsertError.message}`);

  let schema: SchemaDefinition | null = null;
  try {
    const entry = await schemaRegistry.loadActiveSchema(
      computed.entity_type,
      computed.user_id || userId
    );
    schema = entry?.schema_definition ?? null;
  } catch {
    if (strictDerivedEffects) throw new Error("Lifecycle schema acquisition failed");
    schema = null;
  }

  await upsertTimelineEventsForEntitySnapshot({
    strictPersistence: strictDerivedEffects,
    entityType: computed.entity_type,
    entityId: computed.entity_id,
    sourceId,
    userId: computed.user_id || userId,
    snapshot: (computed.snapshot as Record<string, unknown>) || {},
    // Skip raw_fragments: recomputation is per-entity; shared source+type fragments could mis-attach.
    sameTypeInSourceBatch: 2,
    schema,
  });

  // Opportunistic canonical_name evolution: when the merged snapshot now has
  // more identity-bearing fields than the row that created this entity, try
  // to re-derive a stronger canonical_name and (when it does not collide with
  // another row) update entities.canonical_name and push the prior name into
  // aliases. entity_id stays stable since it was hashed from the original
  // name; the new name is retrievable via canonical_name/aliases search.
  try {
    await maybeRederiveCanonicalName({
      strictPersistence: strictDerivedEffects,
      entityId,
      entityType: computed.entity_type,
      userId: computed.user_id || userId,
      snapshot: (computed.snapshot as Record<string, unknown>) || {},
      schema,
    });
  } catch (err) {
    if (strictDerivedEffects) throw err;
    logger.warn(
      `[SNAPSHOT] Failed to re-derive canonical_name for ${entityId}: ` +
        (err instanceof Error ? err.message : String(err))
    );
  }

  return computed as SnapshotRecord;
}

/**
 * Cheap identity of an entity's physical observation set: row count plus the
 * sum and max of the rowids, read from idx_observations_entity_id alone (rowid
 * is carried by every index, so no table rows are touched). Observations are
 * append-only except merge (moves rows) and GDPR delete (removes them), and
 * both change the count or the rowid sum, so an unchanged fingerprint means the
 * set a snapshot was reduced from is the set that is stored now.
 */
export async function fingerprintEntityObservations(entityId: string): Promise<string> {
  const { getDb } = await import("../repositories/db/connection.js");
  const database = await getDb();
  const row = (await database
    .prepare(
      "SELECT COUNT(*) AS n, COALESCE(MAX(rowid), 0) AS m, COALESCE(SUM(rowid), 0) AS s " +
        "FROM observations WHERE entity_id = ?"
    )
    .get(entityId)) as { n: number; m: number; s: number } | undefined;
  return `${row?.n ?? 0}:${row?.m ?? 0}:${row?.s ?? 0}`;
}

export interface SpeculativeSnapshot {
  computed: NonNullable<Awaited<ReturnType<typeof observationReducer.computeSnapshot>>>;
  /** {@link fingerprintEntityObservations} taken BEFORE the observations were read. */
  fingerprint: string;
}

/**
 * Reduce the snapshot an entity WOULD have once `appended` is inserted, using
 * only reads, so it can run before the write transaction opens (on a reader,
 * off the gate). Returns null whenever the result could differ from what
 * {@link recomputeSnapshot} would compute after the insert; the caller then
 * uses the in-transaction recompute. Cases that return null: a redirected or
 * empty entity, an `appended` observation that is not strictly newer than every
 * stored one (the reducer's tie order and the persisted `source_id` would then
 * depend on storage order), a hidden entity, and any reducer failure.
 *
 * Inside the transaction the caller must re-check the fingerprint; the result
 * is only valid for the observation set it was computed from.
 */
export async function speculateSnapshotWithAppendedObservation(
  entityId: string,
  userId: string,
  appended: Observation
): Promise<SpeculativeSnapshot | null> {
  try {
    const fingerprint = await fingerprintEntityObservations(entityId);
    const existing = await resolveOwnedObservations(entityId, userId);
    if (!existing || existing.length === 0) return null;
    const appendedAt = Date.parse(appended.observed_at);
    if (!Number.isFinite(appendedAt)) return null;
    for (const obs of existing) {
      const at = Date.parse(obs.observed_at);
      if (!Number.isFinite(at) || at >= appendedAt) return null;
    }
    // The lifecycle context validates that the supplied rows equal the stored
    // set, so it is acquired from the stored set; a plain factual observation
    // does not change it (visibility is a pure function of rows + context).
    const { getDb } = await import("../repositories/db/connection.js");
    const { acquireEntityLifecycleContext } = await import("./entity_lifecycle_storage.js");
    const context = await acquireEntityLifecycleContext(
      await getDb(),
      { id: entityId, user_id: existing[0].user_id, entity_type: existing[0].entity_type },
      existing
    );
    const computed = await observationReducer.computeSnapshot(
      entityId,
      [appended, ...existing],
      undefined,
      context
    );
    if (!computed) return null;
    return { computed, fingerprint };
  } catch (err) {
    logger.warn(
      `[SNAPSHOT] Speculative snapshot for ${entityId} unavailable, using in-transaction ` +
        `recompute: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

/**
 * Persist a {@link SpeculativeSnapshot} inside the write transaction, after the
 * caller has re-checked the fingerprint and inserted the appended observation.
 * Everything after the reduction is identical to {@link recomputeSnapshot}. The
 * appended observation is strictly newest, so the persisted `source_id` is the
 * appended row's (a correction has none).
 */
export async function persistSpeculativeSnapshot(
  speculative: SpeculativeSnapshot,
  entityId: string,
  userId: string,
  appended: Observation
): Promise<SnapshotRecord | null> {
  const sourceId = typeof appended.source_id === "string" ? appended.source_id || "" : "";
  return persistComputedSnapshot(speculative.computed, entityId, userId, sourceId, false);
}

/**
 * Re-derive `entities.canonical_name` from a freshly merged snapshot.
 *
 * Exported because the MCP `store` path computes and upserts snapshots inline
 * rather than going through {@link recomputeSnapshot}, and would otherwise
 * leave the entity-level canonical_name frozen at its creation-time value
 * while the snapshot moved on (issue: stale canonical_name after a corrective
 * observation). Ordinary store callers retain non-fatal refresh behavior.
 * Atomic lifecycle callers select strictPersistence so acquisition or
 * persistence failure aborts the entire native transaction.
 */
export async function maybeRederiveCanonicalName(params: {
  /** Atomic lifecycle callers abort on persistence/acquisition failure. */
  strictPersistence?: boolean;
  entityId: string;
  entityType: string;
  userId: string;
  snapshot: Record<string, unknown>;
  schema: SchemaDefinition | null;
}): Promise<void> {
  const { entityId, entityType, userId, snapshot, schema } = params;
  if (!snapshot || Object.keys(snapshot).length === 0) return;

  let derived;
  try {
    derived = deriveCanonicalNameFromFieldsWithTrace(entityType, snapshot, schema);
  } catch (err) {
    if (err instanceof CanonicalNameUnresolvedError) {
      // Not enough signal in the snapshot yet; leave the current name in place.
      return;
    }
    throw err;
  }

  const newCanonicalName = derived.canonicalName;
  if (!newCanonicalName) return;

  const { data: entityRow, error: fetchError } = await db
    .from("entities")
    .select("id, canonical_name, aliases, user_id")
    .eq("id", entityId)
    .maybeSingle();
  if (fetchError || !entityRow) {
    if (params.strictPersistence) throw new Error("Canonical name acquisition failed");
    return;
  }

  // Tenancy guard: refuse to rename a row owned by a different user.
  //
  // This is checked here rather than as a `.eq("user_id", userId)` filter on
  // the UPDATE below, because that form fails *silently* — a mismatch (or a
  // legacy row with NULL user_id) matches zero rows and no-ops with no error,
  // which is indistinguishable from "nothing to do". An explicit check makes
  // the refusal deliberate and keeps the UPDATE's outcome meaningful.
  const rowUserId = entityRow.user_id ?? null;
  if (rowUserId !== null && rowUserId !== userId) return;

  const currentCanonicalName = String(entityRow.canonical_name ?? "").trim();
  if (!currentCanonicalName || currentCanonicalName === newCanonicalName) return;

  // Collision guard: refuse to rename if another entity already occupies the
  // (entity_type, canonical_name) slot — either by hashed id or by the text
  // column — because that would silently converge two distinct records.
  const collisionId = generateEntityId(entityType, newCanonicalName, entityIdTenantSalt(userId));
  if (collisionId !== entityId) {
    const { data: collisionById, error: collisionIdError } = await db
      .from("entities")
      .select("id")
      .eq("id", collisionId)
      .maybeSingle();
    if (collisionIdError && params.strictPersistence)
      throw new Error("Canonical name collision acquisition failed");
    if (collisionById) {
      logger.info(
        `[SNAPSHOT] Skipping canonical_name rename for ${entityId}: ` +
          `${newCanonicalName} already hashes to ${collisionId}.`
      );
      return;
    }
  }
  const { data: collisionByName, error: collisionNameError } = await db
    .from("entities")
    .select("id")
    .eq("entity_type", entityType)
    .eq("canonical_name", newCanonicalName)
    .not("id", "eq", entityId)
    .limit(1);
  if (collisionNameError && params.strictPersistence)
    throw new Error("Canonical name collision acquisition failed");
  if (Array.isArray(collisionByName) && collisionByName.length > 0) {
    logger.info(
      `[SNAPSHOT] Skipping canonical_name rename for ${entityId}: ` +
        `another ${entityType} entity already uses "${newCanonicalName}".`
    );
    return;
  }

  // Preserve the prior name so search by the old identifier still works.
  const existingAliases = Array.isArray(entityRow.aliases) ? (entityRow.aliases as string[]) : [];
  const nextAliases = existingAliases.includes(currentCanonicalName)
    ? existingAliases
    : [...existingAliases, currentCanonicalName];

  // Scope the update by id alone. The row was already fetched and validated
  // above, and adding `.eq("user_id", userId)` here silently matches zero rows
  // whenever entities.user_id is NULL (rows written by paths that don't stamp
  // it) — the update then no-ops with no error, which is precisely how the
  // stale-canonical_name bug hid.
  const { error: updateError } = await db
    .from("entities")
    .update({
      canonical_name: newCanonicalName,
      aliases: nextAliases,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entityId);

  if (updateError) {
    if (params.strictPersistence) throw new Error("Canonical name persistence failed");
    logger.warn(`[SNAPSHOT] canonical_name rename failed for ${entityId}: ${updateError.message}`);
    return;
  }

  logger.info(
    `[SNAPSHOT] canonical_name evolved for ${entityId}: ` +
      `"${currentCanonicalName}" -> "${newCanonicalName}" (prior kept as alias)`
  );
}

export async function findStaleSnapshots(
  userId: string
): Promise<Array<{ entity_id: string; entity_type: string }>> {
  const { data, error } = await db
    .from("entity_snapshots")
    .select("entity_id, entity_type")
    .eq("user_id", userId)
    .eq("observation_count", 0);

  if (error) throw new Error(`Failed to find stale snapshots: ${error.message}`);
  return (data || []) as Array<{ entity_id: string; entity_type: string }>;
}
