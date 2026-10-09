/**
 * Shared helper: compute a point-in-time entity snapshot by replaying observations.
 *
 * Both the MCP path (server.ts › retrieveEntitySnapshot) and the offline/HTTP
 * path (actions.ts › POST /get_entity_snapshot) must honour the `at` /
 * `at_ingested` cutoff parameters with identical semantics. Extracting the
 * logic here ensures the two paths cannot drift.
 *
 * Semantics
 * ---------
 * - `at`          — upper bound on `observed_at` (event time).  "What had happened by T?"
 * - `at_ingested` — upper bound on `created_at` (ingestion time). "What did we KNOW by T?"
 * - When both are supplied, both bounds are applied (AND), giving the most
 *   conservative "knowledge-as-of" view and preventing look-ahead leaks from
 *   backfilled / late-arriving observations.
 *
 * Returns `null` when the entity_id does not exist (or is out of scope for the
 * given userId).  Returns an `EntitySnapshotAtTimeResult` with `observation_count
 * === 0` and an empty `snapshot` when the entity exists but has no observations
 * visible at the requested cutoff.
 */

import { db } from "../db.js";
import {
  acquireEntityLifecycleContext,
  hasRecordedEntityLifecycleCutover,
} from "./entity_lifecycle_storage.js";
import { getDb } from "../repositories/db/connection.js";
import { resolveAttachmentTarget } from "./attachment_resolution.js";
import { observationReducer } from "../reducers/observation_reducer.js";
import { schemaRegistry } from "./schema_registry.js";
import type { SnapshotProjectionOptions, Observation } from "../reducers/observation_reducer.js";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface EntitySnapshotAtTimeResult {
  cleared_fields_included?: true;
  entity_id: string;
  entity_type: string;
  schema_version: string;
  snapshot: Record<string, unknown>;
  provenance: Record<string, string>;
  computed_at: string;
  observation_count: number;
  last_observation_at: string | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a point-in-time snapshot for `entityId`.
 *
 * @param entityId   - The entity to retrieve.
 * @param userId     - Scope reads to this user (required; prevents cross-user reads).
 * @param at         - Optional event-time upper bound (ISO 8601).
 * @param atIngested - Optional ingestion-time upper bound (ISO 8601).
 *
 * @returns
 *   - `null`  when the entity does not exist / is not owned by `userId`.
 *   - An `EntitySnapshotAtTimeResult` otherwise (observation_count may be 0).
 *
 * @throws `Error` with a descriptive message when a timestamp is not valid
 *   ISO 8601 or when the DB query fails.
 */
export async function computeEntitySnapshotAtTime(
  entityId: string,
  userId: string,
  at?: string,
  atIngested?: string,
  projection: SnapshotProjectionOptions = {}
): Promise<EntitySnapshotAtTimeResult | null> {
  // ------------------------------------------------------------------
  // 1. Validate timestamps before touching the DB.
  // ------------------------------------------------------------------
  if (at) {
    const ts = new Date(at);
    if (isNaN(ts.getTime())) {
      throw new Error(`Invalid timestamp format for 'at': ${at}. Expected ISO 8601 format.`);
    }
  }
  if (atIngested) {
    const ts = new Date(atIngested);
    if (isNaN(ts.getTime())) {
      throw new Error(
        `Invalid timestamp format for 'at_ingested': ${atIngested}. Expected ISO 8601 format.`
      );
    }
  }

  // ------------------------------------------------------------------
  // 2. Resolve entity_type from the entities table (also serves as an
  //    existence + ownership check).
  // ------------------------------------------------------------------
  const { data: entityRow, error: entityError } = await db
    .from("entities")
    .select("id, entity_type, merged_to_entity_id")
    .eq("id", entityId)
    .eq("user_id", userId)
    .single();

  if (entityError || !entityRow) {
    // Entity does not exist or is not owned by this user.
    return null;
  }

  // #2343: redirect through merge chains using the declared resolution layer
  // rather than the single hop this used to do. The old comment conceded the
  // defect ("one level"); a chain A→B→C left an as-of read on A pointed at B,
  // which holds no observations after the second merge. `resolveAttachmentTarget`
  // follows to a fixed point under a visited-set cycle guard and a depth bound.
  //
  // Deliberately `resolveAttachmentTarget`, NOT `resolveOwnedObservations`:
  // this function READS, it never upserts, so the ownership question that
  // stops a persisting caller from writing under a tombstone does not apply.
  // An as-of read of a merged-away id should answer with the surviving
  // entity's history, not refuse. And it takes only the resolved TARGET, not
  // the resolved observation set, because the seam's set is unfiltered by
  // time — this function's whole job is the `at` / `at_ingested` cutoffs, so
  // it keeps its own time-bounded query over the resolved id.
  const attachmentTarget = await resolveAttachmentTarget(entityId, userId);
  const resolvedEntityId = attachmentTarget.resolvedEntityId;
  if (attachmentTarget.truncated) {
    throw new Error("Entity lifecycle authority acquisition is incomplete or inconsistent");
  }
  const entityType: string = entityRow.entity_type as string;

  // ------------------------------------------------------------------
  // 3. Build and execute the observations query with optional cutoffs.
  // ------------------------------------------------------------------
  const obsQuery = db
    .from("observations")
    .select("*")
    .eq("entity_id", resolvedEntityId)
    .eq("user_id", userId);

  // Opt-in acquisition reads the complete physical owner-scoped set, rather
  // than inferring explicit clears from the cached/default snapshot or a cap.
  let observations: any[] | null;
  if (projection.includeClearedFields) {
    const rows = await (await getDb())
      .prepare("SELECT * FROM observations WHERE entity_id = ? AND user_id = ?")
      .all(resolvedEntityId, userId);
    const count = (await (await getDb())
      .prepare("SELECT COUNT(*) AS count FROM observations WHERE entity_id = ? AND user_id = ?")
      .get(resolvedEntityId, userId)) as { count: number } | undefined;
    if (
      !count ||
      !Number.isSafeInteger(count.count) ||
      count.count !== rows.length ||
      new Set(rows.map((r) => (r as Record<string, unknown>).id)).size !== rows.length
    ) {
      throw new Error("Nullable winning projection acquisition is incomplete");
    }
    observations = rows.map((raw) => {
      const row = raw as Record<string, any>;
      const fields = typeof row.fields === "string" ? JSON.parse(row.fields) : row.fields;
      if (
        row.entity_id !== resolvedEntityId ||
        row.user_id !== userId ||
        row.entity_type !== entityType ||
        !fields ||
        typeof fields !== "object" ||
        Array.isArray(fields) ||
        typeof row.id !== "string" ||
        !Number.isFinite(Date.parse(row.observed_at)) ||
        !Number.isFinite(Date.parse(row.created_at))
      ) {
        throw new Error("Nullable winning projection acquisition is inconsistent");
      }
      return { ...row, fields };
    });
  } else {
    const acquired = await obsQuery.order("observed_at", { ascending: false });
    if (acquired.error) throw new Error(`Failed to get observations: ${acquired.error.message}`);
    observations = acquired.data;
  }
  const pinnedSchema = projection.includeClearedFields
    ? await schemaRegistry.loadActiveSchema(entityType, userId)
    : undefined;
  if (projection.includeClearedFields && !pinnedSchema) {
    throw new Error("Nullable winning projection requires an active schema");
  }

  // ------------------------------------------------------------------
  // 4. Handle zero-observation case (entity exists but nothing visible
  //    at the requested cutoff).
  // ------------------------------------------------------------------
  if (!observations || observations.length === 0) {
    if (await hasRecordedEntityLifecycleCutover(await getDb())) {
      // No rows is not proof of an empty historical population when recorded
      // capture metadata still references unavailable evidence.
      await acquireEntityLifecycleContext(
        await getDb(),
        {
          id: resolvedEntityId,
          user_id: userId,
          entity_type: entityType,
        },
        [],
        { at, at_ingested: atIngested }
      );
    }
    return {
      ...(projection.includeClearedFields ? { cleared_fields_included: true as const } : {}),
      entity_id: resolvedEntityId,
      entity_type: entityType,
      schema_version: entityType, // fallback when no observations
      snapshot: {},
      provenance: {},
      computed_at: new Date().toISOString(),
      observation_count: 0,
      last_observation_at: null,
    };
  }

  // ------------------------------------------------------------------
  // 5. Map raw rows to the Observation interface and replay through
  //    the reducer to obtain a consistent point-in-time snapshot.
  // ------------------------------------------------------------------
  const mappedObservations: Observation[] = (observations as any[]).map((obs) => ({
    id: obs.id,
    entity_id: obs.entity_id,
    entity_type: obs.entity_type,
    schema_version: obs.schema_version,
    source_id: obs.source_id || "",
    observed_at: obs.observed_at,
    specificity_score: obs.specificity_score,
    source_priority: obs.source_priority,
    observation_source: obs.observation_source ?? null,
    fields: obs.fields,
    created_at: obs.created_at,
    user_id: obs.user_id,
    entity_lifecycle_kind: obs.entity_lifecycle_kind,
    entity_lifecycle_sequence: obs.entity_lifecycle_sequence,
    entity_lifecycle_target_id: obs.entity_lifecycle_target_id,
  }));

  const lifecycleContext = await acquireEntityLifecycleContext(
    await getDb(),
    { id: resolvedEntityId, user_id: userId, entity_type: entityType },
    mappedObservations,
    { at, at_ingested: atIngested }
  );
  const replayRows =
    lifecycleContext.mode === "pre_migration"
      ? mappedObservations.filter(
          (o) =>
            (!at || Date.parse(o.observed_at) <= Date.parse(at)) &&
            (!atIngested || Date.parse(o.created_at) <= Date.parse(atIngested))
        )
      : mappedObservations;
  const historicalSnapshot = replayRows.length
    ? await observationReducer.computeSnapshot(
        resolvedEntityId,
        replayRows,
        pinnedSchema ?? undefined,
        lifecycleContext,
        projection
      )
    : null;

  if (!historicalSnapshot) {
    // Reducer returned null → entity is deleted at this point in time.
    return {
      ...(projection.includeClearedFields ? { cleared_fields_included: true as const } : {}),
      entity_id: resolvedEntityId,
      entity_type: entityType,
      schema_version: entityType,
      snapshot: {},
      provenance: {},
      computed_at: new Date().toISOString(),
      observation_count: 0,
      last_observation_at: null,
    };
  }

  return {
    ...(projection.includeClearedFields ? { cleared_fields_included: true as const } : {}),
    entity_id: historicalSnapshot.entity_id,
    entity_type: historicalSnapshot.entity_type,
    schema_version: historicalSnapshot.schema_version,
    snapshot: historicalSnapshot.snapshot,
    provenance: historicalSnapshot.provenance,
    computed_at: historicalSnapshot.computed_at,
    observation_count: historicalSnapshot.observation_count,
    last_observation_at: historicalSnapshot.last_observation_at,
  };
}
