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
import { observationReducer } from "../reducers/observation_reducer.js";
import type { Observation } from "../reducers/observation_reducer.js";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface EntitySnapshotAtTimeResult {
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
  atIngested?: string
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

  // Redirect through merge chains (one level; recursive merges are unusual
  // but follow the server.ts pattern of delegating to getEntityWithProvenance).
  const resolvedEntityId = entityRow.merged_to_entity_id ?? entityId;
  const entityType: string = entityRow.entity_type as string;

  // ------------------------------------------------------------------
  // 3. Build and execute the observations query with optional cutoffs.
  // ------------------------------------------------------------------
  let obsQuery = db
    .from("observations")
    .select("*")
    .eq("entity_id", resolvedEntityId)
    .eq("user_id", userId);

  if (at) {
    obsQuery = obsQuery.lte("observed_at", at);
  }
  if (atIngested) {
    obsQuery = obsQuery.lte("created_at", atIngested);
  }

  const { data: observations, error: obsError } = await obsQuery.order("observed_at", {
    ascending: false,
  });

  if (obsError) {
    throw new Error(`Failed to get observations: ${obsError.message}`);
  }

  // ------------------------------------------------------------------
  // 4. Handle zero-observation case (entity exists but nothing visible
  //    at the requested cutoff).
  // ------------------------------------------------------------------
  if (!observations || observations.length === 0) {
    return {
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
  }));

  const historicalSnapshot = await observationReducer.computeSnapshot(
    resolvedEntityId,
    mappedObservations
  );

  if (!historicalSnapshot) {
    // Reducer returned null → entity is deleted at this point in time.
    return {
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
