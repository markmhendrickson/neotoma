/**
 * Observation Storage Service (Domain Layer)
 *
 * Handles observation CRUD operations, providing a clean domain interface
 * so that Presentation (actions.ts) and Application (server.ts) layers
 * do not access the database directly for observation operations.
 */

import { db } from "../db.js";
import { generateObservationId } from "./observation_identity.js";
import {
  getCurrentAAuthAdmission,
  getCurrentAgentIdentity,
  getCurrentAttribution,
} from "./request_context.js";
import { enforceAttributionPolicy } from "./attribution_policy.js";
import { assertCanWriteProtected } from "./protected_entity_types.js";
import { enforceOverridePolicy } from "./override_validation.js";
import type { ObservationSource } from "../shared/action_schemas.js";

/**
 * Default `observation_source` applied by the write path when a caller
 * omits the field. MCP / CLI callers are LLM-driven by construction, so
 * unclassified writes land in the LLM-summary bucket. Sensors, workflow
 * state machines, humans, and ETL pipelines MUST set the field
 * explicitly — the default is deliberately non-sensor so the reducer
 * does not over-weight unclassified writes.
 */
export const DEFAULT_OBSERVATION_SOURCE: ObservationSource = "llm_summary";

export interface CreateObservationParams {
  entity_id: string;
  entity_type: string;
  schema_version: string;
  source_id: string | null;
  interpretation_id: string | null;
  observed_at: string;
  specificity_score: number;
  source_priority: number;
  /**
   * Kind of write (sensor | llm_summary | workflow_state | human | import).
   * Orthogonal to `source_priority` (numeric ranking) and to
   * `provenance`/AAuth (which agent wrote it). Omit to fall back to
   * {@link DEFAULT_OBSERVATION_SOURCE}. See openapi.yaml
   * `Observation.observation_source` for the semantic contract.
   */
  observation_source?: ObservationSource | null;
  /** Cross-instance sync: Neotoma peer id that originated this replayed write. */
  source_peer_id?: string | null;
  fields: Record<string, unknown>;
  user_id: string;
  idempotency_key?: string | null;
  /**
   * Structured identity classification from the resolver. Persisted per-row
   * so `/stats?by=identity_basis` can aggregate without re-running derivation.
   * See {@link ../services/entity_resolution.ts#IdentityBasis}.
   */
  identity_basis?: string | null;
  /**
   * Human-readable rule label that matched (e.g. `email`,
   * `composite:full_name+employer`, `first_string_field:name`).
   */
  identity_rule?: string | null;
}

export interface ObservationRecord {
  id: string;
  entity_id: string;
  entity_type: string;
  schema_version: string;
  source_id: string | null;
  interpretation_id: string | null;
  observed_at: string;
  specificity_score: number;
  source_priority: number;
  observation_source: ObservationSource | null;
  fields: Record<string, unknown>;
  user_id: string;
  created_at: string;
}

export async function createObservation(
  params: CreateObservationParams
): Promise<ObservationRecord> {
  enforceAttributionPolicy("observations", getCurrentAgentIdentity());
  assertCanWriteProtected({
    entity_type: params.entity_type,
    op: "store",
    identity: getCurrentAgentIdentity(),
    admission: getCurrentAAuthAdmission(),
  });
  await enforceOverridePolicy({
    entityType: params.entity_type,
    entityId: params.entity_id,
    fields: params.fields,
    identity: getCurrentAgentIdentity(),
    admission: getCurrentAAuthAdmission(),
    db,
  });
  const observationId = generateObservationId(
    params.source_id,
    params.interpretation_id,
    params.entity_id,
    params.fields,
    params.idempotency_key
  );

  const row = {
    id: observationId,
    entity_id: params.entity_id,
    entity_type: params.entity_type,
    schema_version: params.schema_version,
    source_id: params.source_id,
    interpretation_id: params.interpretation_id,
    observed_at: params.observed_at,
    specificity_score: params.specificity_score,
    source_priority: params.source_priority,
    observation_source: params.observation_source ?? DEFAULT_OBSERVATION_SOURCE,
    fields: params.fields,
    user_id: params.user_id,
    created_at: new Date().toISOString(),
  };

  if (params.idempotency_key) {
    (row as Record<string, unknown>).idempotency_key = params.idempotency_key;
  }
  if (params.identity_basis) {
    (row as Record<string, unknown>).identity_basis = params.identity_basis;
  }
  if (params.identity_rule) {
    (row as Record<string, unknown>).identity_rule = params.identity_rule;
  }
  if (params.source_peer_id) {
    (row as Record<string, unknown>).source_peer_id = params.source_peer_id;
  }

  // Agent attribution (Phase 1). The provenance blob is empty when no
  // request context is active (stdio + no env identity), which keeps
  // existing behaviour intact. See src/crypto/agent_identity.ts for the
  // AttributionProvenance shape.
  const attribution = getCurrentAttribution();
  if (Object.keys(attribution).length > 0) {
    (row as Record<string, unknown>).provenance = attribution;
  }

  const { data, error } = await db.from("observations").insert(row).select().single();

  if (error) {
    throw new Error(`Failed to create observation: ${error.message}`);
  }

  return data as ObservationRecord;
}

export async function listObservationsForEntity(
  entityId: string,
  userId: string,
  options?: { limit?: number; offset?: number }
): Promise<{ data: ObservationRecord[]; count: number }> {
  let query = db
    .from("observations")
    .select("*", { count: "exact" })
    .eq("entity_id", entityId)
    .eq("user_id", userId)
    .order("observed_at", { ascending: false });

  if (options?.limit) query = query.limit(options.limit);
  if (options?.offset)
    query = query.range(options.offset, (options.offset ?? 0) + (options.limit ?? 50) - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to list observations: ${error.message}`);
  return { data: (data || []) as ObservationRecord[], count: count ?? 0 };
}

export async function listObservationsForSource(
  sourceId: string,
  userId: string
): Promise<ObservationRecord[]> {
  const { data, error } = await db
    .from("observations")
    .select("*")
    .eq("source_id", sourceId)
    .eq("user_id", userId)
    .order("observed_at", { ascending: false });

  if (error) throw new Error(`Failed to list observations for source: ${error.message}`);
  return (data || []) as ObservationRecord[];
}

export async function getObservationsByIds(
  ids: string[],
  userId: string
): Promise<ObservationRecord[]> {
  const { data, error } = await db
    .from("observations")
    .select("*")
    .in("id", ids)
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to get observations by IDs: ${error.message}`);
  return (data || []) as ObservationRecord[];
}

export async function rewriteObservationEntityId(
  fromEntityId: string,
  toEntityId: string,
  userId: string
): Promise<number> {
  const { data, error } = await db
    .from("observations")
    .update({ entity_id: toEntityId })
    .eq("entity_id", fromEntityId)
    .eq("user_id", userId)
    .select("id");

  if (error) throw new Error(`Failed to rewrite observations: ${error.message}`);
  return data?.length || 0;
}

export async function hasObservationsForEntity(entityId: string, userId: string): Promise<boolean> {
  const { data, error } = await db
    .from("observations")
    .select("id")
    .eq("entity_id", entityId)
    .eq("user_id", userId)
    .limit(1);

  if (error) throw new Error(`Failed to check observations: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/**
 * Repoint all relationship_observations rows that reference `fromEntityId`
 * (as either source or target) to reference `toEntityId` instead.
 *
 * Handles three edge cases:
 *   1. Self-loop: if repointing makes source_entity_id == target_entity_id,
 *      that row is deleted rather than kept.
 *   2. Dedup: if repointing produces a relationship_key that already exists
 *      for the survivor (same relationship_key + canonical_hash + user_id),
 *      the now-redundant row is deleted instead of creating a duplicate.
 *   3. Snapshot cleanup: all relationship_snapshots that still reference
 *      fromEntityId are also deleted so stale snapshots do not survive.
 *
 * Returns the count of rows successfully repointed (excludes deleted
 * self-loops and deduplicated rows).
 */
export async function repointRelationshipObservations(
  fromEntityId: string,
  toEntityId: string,
  userId: string
): Promise<number> {
  // Fetch all relationship_observations rows that reference fromEntityId
  const { data: rows, error: fetchError } = await db
    .from("relationship_observations")
    .select(
      "id, relationship_key, relationship_type, source_entity_id, target_entity_id, canonical_hash"
    )
    .eq("user_id", userId)
    .or(`source_entity_id.eq.${fromEntityId},target_entity_id.eq.${fromEntityId}`);

  if (fetchError) {
    throw new Error(`Failed to fetch relationship observations for repoint: ${fetchError.message}`);
  }

  if (!rows || rows.length === 0) {
    return 0;
  }

  // Fetch all relationship_keys already owned by toEntityId so we can detect
  // duplicates before attempting an upsert.
  const { data: survivorRows, error: survivorFetchError } = await db
    .from("relationship_observations")
    .select("relationship_key, canonical_hash")
    .eq("user_id", userId)
    .or(`source_entity_id.eq.${toEntityId},target_entity_id.eq.${toEntityId}`);

  if (survivorFetchError) {
    throw new Error(
      `Failed to fetch survivor relationship observations: ${survivorFetchError.message}`
    );
  }

  // Collapse by relationship_key (type:source:target) — the unique edge identity.
  // The metadata-derived canonical_hash is intentionally excluded so that
  // duplicate edges differing only in observation metadata still collapse to a
  // single edge on the survivor after a merge.
  const survivorKeys = new Set<string>(
    (survivorRows ?? []).map((r: { relationship_key: string }) => r.relationship_key)
  );

  const idsToDelete: string[] = [];
  const repointed: Array<{
    id: string;
    newRelationshipKey: string;
    newSourceEntityId: string;
    newTargetEntityId: string;
  }> = [];

  for (const row of rows) {
    const newSourceEntityId =
      row.source_entity_id === fromEntityId ? toEntityId : row.source_entity_id;
    const newTargetEntityId =
      row.target_entity_id === fromEntityId ? toEntityId : row.target_entity_id;

    // Rule: drop self-loops produced by the repoint
    if (newSourceEntityId === newTargetEntityId) {
      idsToDelete.push(row.id);
      continue;
    }

    const newRelationshipKey = `${row.relationship_type}:${newSourceEntityId}:${newTargetEntityId}`;
    const dedupKey = newRelationshipKey;

    // Rule: drop duplicates where the survivor already has this edge
    if (survivorKeys.has(dedupKey)) {
      idsToDelete.push(row.id);
      continue;
    }

    // Mark this key as now present on the survivor so later iterations in the
    // same batch don't create a second copy.
    survivorKeys.add(dedupKey);

    repointed.push({ id: row.id, newRelationshipKey, newSourceEntityId, newTargetEntityId });
  }

  // Delete self-loops and duplicates
  if (idsToDelete.length > 0) {
    const { error: deleteError } = await db
      .from("relationship_observations")
      .delete()
      .in("id", idsToDelete)
      .eq("user_id", userId);

    if (deleteError) {
      throw new Error(
        `Failed to delete self-loop/duplicate relationship observations: ${deleteError.message}`
      );
    }
  }

  // Update each surviving row one at a time (Supabase JS client does not
  // support per-row conditional updates in a single batch call).
  for (const { id, newRelationshipKey, newSourceEntityId, newTargetEntityId } of repointed) {
    const { error: updateError } = await db
      .from("relationship_observations")
      .update({
        source_entity_id: newSourceEntityId,
        target_entity_id: newTargetEntityId,
        relationship_key: newRelationshipKey,
      })
      .eq("id", id)
      .eq("user_id", userId);

    if (updateError) {
      throw new Error(`Failed to repoint relationship observation ${id}: ${updateError.message}`);
    }
  }

  // Clean up any stale relationship_snapshots that still reference fromEntityId.
  // Snapshot recomputation for the survivor is left to the caller / next read
  // (the snapshot reducer will rebuild from the now-repointed observations).
  const { error: snapshotDeleteError } = await db
    .from("relationship_snapshots")
    .delete()
    .eq("user_id", userId)
    .or(`source_entity_id.eq.${fromEntityId},target_entity_id.eq.${fromEntityId}`);

  if (snapshotDeleteError) {
    throw new Error(
      `Failed to clean up stale relationship snapshots: ${snapshotDeleteError.message}`
    );
  }

  return repointed.length;
}
