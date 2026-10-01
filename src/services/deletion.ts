/**
 * Deletion Service for GDPR Compliance (Phase 1: Soft Deletion)
 *
 * Implements immutable soft deletion via deletion observations.
 * Deletion observations mark entities/relationships as deleted while maintaining
 * full audit trail and immutability guarantees.
 */

import { db } from "../db.js";
import { createHash } from "node:crypto";

import { emitEntityLifecycle, emitRelationshipLifecycle } from "../events/substrate_store_emit.js";

export interface DeletionObservation extends Record<string, unknown> {
  id: string;
  entity_id: string;
  entity_type: string;
  schema_version: string;
  source_id: string | null;
  observed_at: string;
  source_priority: number;
  fields: {
    _deleted: true;
    deleted_at: string;
    deleted_by: string;
    deletion_reason?: string;
  };
  user_id: string;
}

export interface RestorationObservation extends Record<string, unknown> {
  id: string;
  entity_id: string;
  entity_type: string;
  schema_version: string;
  source_id: string | null;
  observed_at: string;
  source_priority: number;
  fields: {
    _deleted: false;
    restored_at: string;
    restored_by: string;
    restoration_reason?: string;
  };
  user_id: string;
}

export interface DeletionResult {
  success: boolean;
  observation_id?: string;
  entity_id: string;
  error?: string;
  /**
   * True when the target does not resolve to something the caller owns.
   * Set identically for a missing target and for one owned by another user,
   * so handlers can map it to one not-found response for both.
   */
  not_found?: boolean;
}

/** Error text for a restore target the caller does not own (or that does not exist). */
export const ENTITY_NOT_FOUND_MESSAGE = "Entity not found";
export const RELATIONSHIP_NOT_FOUND_MESSAGE = "Relationship not found";

/**
 * Soft delete an entity by creating a deletion observation
 *
 * @param entityId - Entity ID to delete
 * @param entityType - Entity type (e.g., "company", "person")
 * @param userId - User ID performing the deletion
 * @param reason - Optional reason for deletion
 * @param timestamp - Timestamp for deletion (defaults to now)
 * @returns Deletion result with observation ID
 */
export async function softDeleteEntity(
  entityId: string,
  entityType: string,
  userId: string,
  reason?: string,
  timestamp?: string
): Promise<DeletionResult> {
  // Verify entity exists and belongs to user before creating deletion observation
  const { data: existing, error: fetchError } = await db
    .from("entities")
    .select("id")
    .eq("id", entityId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    return {
      success: false,
      entity_id: entityId,
      error: `Failed to verify entity: ${fetchError.message}`,
    };
  }
  if (!existing) {
    return {
      success: false,
      entity_id: entityId,
      error: "Entity not found",
    };
  }

  const deletedAt = timestamp || new Date().toISOString();

  // Create deterministic observation ID
  const observationId = createHash("sha256")
    .update(`${entityId}:deletion:${deletedAt}`)
    .digest("hex");

  const deletionObservation: DeletionObservation = {
    id: observationId,
    entity_id: entityId,
    entity_type: entityType,
    schema_version: "1.0",
    source_id: null, // No source for deletion observations
    observed_at: deletedAt,
    source_priority: 1000, // Highest priority to override other observations
    fields: {
      _deleted: true,
      deleted_at: deletedAt,
      deleted_by: userId,
      ...(reason && { deletion_reason: reason }),
    },
    user_id: userId,
  };

  try {
    const { data, error } = await db
      .from("observations")
      .insert([deletionObservation])
      .select()
      .single();

    if (error) {
      return {
        success: false,
        entity_id: entityId,
        error: `Failed to create deletion observation: ${error.message}`,
      };
    }

    emitEntityLifecycle({
      user_id: userId,
      entity_id: entityId,
      entity_type: entityType,
      event_type: "entity.deleted",
      timestamp: deletedAt,
      observation_id: data.id as string,
    });
    return {
      success: true,
      observation_id: data.id,
      entity_id: entityId,
    };
  } catch (err) {
    return {
      success: false,
      entity_id: entityId,
      error: `Exception creating deletion observation: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Soft delete a relationship by creating a deletion observation
 *
 * @param relationshipKey - Relationship key (format: type:source:target)
 * @param relationshipType - Relationship type
 * @param sourceEntityId - Source entity ID
 * @param targetEntityId - Target entity ID
 * @param userId - User ID performing the deletion
 * @param reason - Optional reason for deletion
 * @param timestamp - Timestamp for deletion (defaults to now)
 * @returns Deletion result with observation ID
 */
export async function softDeleteRelationship(
  relationshipKey: string,
  relationshipType: string,
  sourceEntityId: string,
  targetEntityId: string,
  userId: string,
  reason?: string,
  timestamp?: string
): Promise<DeletionResult> {
  const deletedAt = timestamp || new Date().toISOString();

  // Create deterministic observation ID
  const observationId = createHash("sha256")
    .update(`${relationshipKey}:deletion:${deletedAt}`)
    .digest("hex");

  // Create canonical hash for deletion metadata
  const metadataString = JSON.stringify({
    _deleted: true,
    deleted_at: deletedAt,
    deleted_by: userId,
    ...(reason && { deletion_reason: reason }),
  });
  const canonicalHash = createHash("sha256").update(metadataString).digest("hex");

  const deletionObservation = {
    id: observationId,
    relationship_key: relationshipKey,
    source_entity_id: sourceEntityId,
    target_entity_id: targetEntityId,
    relationship_type: relationshipType,
    observed_at: deletedAt,
    source_priority: 1000, // Highest priority
    metadata: {
      _deleted: true,
      deleted_at: deletedAt,
      deleted_by: userId,
      ...(reason && { deletion_reason: reason }),
    },
    canonical_hash: canonicalHash,
    user_id: userId,
  };

  try {
    const { data, error } = await db
      .from("relationship_observations")
      .insert(deletionObservation)
      .select()
      .single();

    if (error) {
      return {
        success: false,
        entity_id: relationshipKey,
        error: `Failed to create relationship deletion observation: ${error.message}`,
      };
    }

    // Materialize liveness on the snapshot (#1570). The deletion observation we
    // just wrote is at source_priority 1000 — by definition now the
    // highest-priority observation for this key — so the edge is dead. Flip the
    // snapshot's `is_live` to 0 so the default list_relationships read (which
    // filters `is_live = 1` at the DB) stops surfacing it without re-deriving
    // liveness from the observation log on every read. The observation log
    // remains the source of truth; this is a derived cache that
    // computeRelationshipSnapshot also re-stamps on any later recompute.
    await db
      .from("relationship_snapshots")
      .update({ is_live: 0 })
      .eq("relationship_key", relationshipKey)
      .eq("user_id", userId);

    emitRelationshipLifecycle({
      user_id: userId,
      relationship_key: relationshipKey,
      relationship_type: relationshipType,
      source_entity_id: sourceEntityId,
      target_entity_id: targetEntityId,
      event_type: "relationship.deleted",
      timestamp: deletedAt,
      observation_id: data.id as string,
    });
    return {
      success: true,
      observation_id: data.id,
      entity_id: relationshipKey,
    };
  } catch (err) {
    return {
      success: false,
      entity_id: relationshipKey,
      error: `Exception creating relationship deletion observation: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Restore a deleted entity by creating a restoration observation
 *
 * @param entityId - Entity ID to restore
 * @param entityType - Entity type
 * @param userId - User ID performing the restoration
 * @param reason - Optional reason for restoration
 * @param timestamp - Timestamp for restoration (defaults to now)
 * @returns Deletion result with observation ID
 */
export async function restoreEntity(
  entityId: string,
  entityType: string,
  userId: string,
  reason?: string,
  timestamp?: string
): Promise<DeletionResult> {
  // Same ownership check as softDeleteEntity: only an entity the caller owns
  // can be restored. A missing entity and another user's entity get the same
  // not-found result.
  const { data: existing, error: fetchError } = await db
    .from("entities")
    .select("id, entity_type")
    .eq("id", entityId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    return {
      success: false,
      entity_id: entityId,
      error: `Failed to verify entity: ${fetchError.message}`,
    };
  }
  if (!existing) {
    return {
      success: false,
      entity_id: entityId,
      error: ENTITY_NOT_FOUND_MESSAGE,
      not_found: true,
    };
  }

  // A key thumbprint may be pinned by agent_grants under one owner only.
  // Restoring a grant brings its pin back, so refuse when a grant under
  // another owner pins the same key. Keyed on the stored entity_type, not
  // the caller-supplied one. Throws before anything is written.
  if ((existing as { entity_type?: string }).entity_type === "agent_grant") {
    const { assertGrantEntityPinsUnique } = await import("./agent_grants.js");
    await assertGrantEntityPinsUnique(userId, entityId);
  }

  const restoredAt = timestamp || new Date().toISOString();

  // Create deterministic observation ID
  const observationId = createHash("sha256")
    .update(`${entityId}:restoration:${restoredAt}`)
    .digest("hex");

  const restorationObservation: RestorationObservation = {
    id: observationId,
    entity_id: entityId,
    entity_type: entityType,
    schema_version: "1.0",
    source_id: null,
    observed_at: restoredAt,
    source_priority: 1001, // Higher than deletion (1000) to override it
    fields: {
      _deleted: false,
      restored_at: restoredAt,
      restored_by: userId,
      ...(reason && { restoration_reason: reason }),
    },
    user_id: userId,
  };

  try {
    const { data, error } = await db
      .from("observations")
      .insert([restorationObservation])
      .select()
      .single();

    if (error) {
      return {
        success: false,
        entity_id: entityId,
        error: `Failed to create restoration observation: ${error.message}`,
      };
    }

    emitEntityLifecycle({
      user_id: userId,
      entity_id: entityId,
      entity_type: entityType,
      event_type: "entity.restored",
      timestamp: restoredAt,
      observation_id: data.id as string,
    });
    return {
      success: true,
      observation_id: data.id,
      entity_id: entityId,
    };
  } catch (err) {
    return {
      success: false,
      entity_id: entityId,
      error: `Exception creating restoration observation: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Decide whether `userId` may restore the relationship `relationshipKey`.
 *
 * Restore revives a relationship the caller already holds; it never creates
 * one. So the caller must:
 *   - name a key that matches the (type, source, target) triple,
 *   - already have at least one observation of that relationship,
 *   - not be addressing a relationship snapshot owned by another user, and
 *   - own both endpoints (the same rule `createRelationship` applies).
 *
 * Every refusal returns the same result, so a caller cannot tell a missing
 * relationship from one belonging to someone else.
 */
async function callerMayRestoreRelationship(
  relationshipKey: string,
  relationshipType: string,
  sourceEntityId: string,
  targetEntityId: string,
  userId: string
): Promise<{ ok: true } | { ok: false; error?: string }> {
  if (relationshipKey !== `${relationshipType}:${sourceEntityId}:${targetEntityId}`) {
    return { ok: false };
  }

  const { data: priorObservations, error: priorError } = await db
    .from("relationship_observations")
    .select("id")
    .eq("relationship_key", relationshipKey)
    .eq("user_id", userId)
    .limit(1);
  if (priorError) {
    return { ok: false, error: `Failed to verify relationship: ${priorError.message}` };
  }
  if (!priorObservations || priorObservations.length === 0) {
    return { ok: false };
  }

  const { data: snapshots, error: snapshotError } = await db
    .from("relationship_snapshots")
    .select("user_id")
    .eq("relationship_key", relationshipKey);
  if (snapshotError) {
    return { ok: false, error: `Failed to verify relationship: ${snapshotError.message}` };
  }
  if ((snapshots ?? []).some((row: { user_id?: string | null }) => row.user_id !== userId)) {
    return { ok: false };
  }

  const { filterOwnedEntityIds } = await import("./scoped_reads.js");
  const owned = await filterOwnedEntityIds([sourceEntityId, targetEntityId], userId);
  if (!owned.has(sourceEntityId) || !owned.has(targetEntityId)) {
    return { ok: false };
  }

  return { ok: true };
}

/**
 * Restore a deleted relationship by creating a restoration observation.
 *
 * Only a relationship the caller already holds can be restored (see
 * {@link callerMayRestoreRelationship}); anything else returns
 * `not_found: true` with the same message whether the relationship is
 * missing or owned by another user. The relationship type must be
 * registered, as for creation: an unregistered type throws
 * `UnregisteredRelationshipTypeError`.
 *
 * @param relationshipKey - Relationship key (format: type:source:target)
 * @param relationshipType - Relationship type
 * @param sourceEntityId - Source entity ID
 * @param targetEntityId - Target entity ID
 * @param userId - User ID performing the restoration
 * @param reason - Optional reason for restoration
 * @param timestamp - Timestamp for restoration (defaults to now)
 * @returns Deletion result with observation ID
 */
export async function restoreRelationship(
  relationshipKey: string,
  relationshipType: string,
  sourceEntityId: string,
  targetEntityId: string,
  userId: string,
  reason?: string,
  timestamp?: string
): Promise<DeletionResult> {
  const { relationshipsService } = await import("./relationships.js");
  await relationshipsService.assertRegisteredType(relationshipType, userId);

  const permitted = await callerMayRestoreRelationship(
    relationshipKey,
    relationshipType,
    sourceEntityId,
    targetEntityId,
    userId
  );
  if (!permitted.ok) {
    if (permitted.error) {
      return { success: false, entity_id: relationshipKey, error: permitted.error };
    }
    return {
      success: false,
      entity_id: relationshipKey,
      error: RELATIONSHIP_NOT_FOUND_MESSAGE,
      not_found: true,
    };
  }

  const restoredAt = timestamp || new Date().toISOString();

  // Create deterministic observation ID
  const observationId = createHash("sha256")
    .update(`${relationshipKey}:restoration:${restoredAt}`)
    .digest("hex");

  // Create canonical hash for restoration metadata
  const metadataString = JSON.stringify({
    _deleted: false,
    restored_at: restoredAt,
    restored_by: userId,
    ...(reason && { restoration_reason: reason }),
  });
  const canonicalHash = createHash("sha256").update(metadataString).digest("hex");

  const restorationObservation = {
    id: observationId,
    relationship_key: relationshipKey,
    source_entity_id: sourceEntityId,
    target_entity_id: targetEntityId,
    relationship_type: relationshipType,
    observed_at: restoredAt,
    source_priority: 1001, // Higher than deletion (1000)
    metadata: {
      _deleted: false,
      restored_at: restoredAt,
      restored_by: userId,
      ...(reason && { restoration_reason: reason }),
    },
    canonical_hash: canonicalHash,
    user_id: userId,
  };

  try {
    const { data, error } = await db
      .from("relationship_observations")
      .insert(restorationObservation)
      .select()
      .single();

    if (error) {
      return {
        success: false,
        entity_id: relationshipKey,
        error: `Failed to create relationship restoration observation: ${error.message}`,
      };
    }

    emitRelationshipLifecycle({
      user_id: userId,
      relationship_key: relationshipKey,
      relationship_type: relationshipType,
      source_entity_id: sourceEntityId,
      target_entity_id: targetEntityId,
      event_type: "relationship.restored",
      timestamp: restoredAt,
      observation_id: data.id as string,
    });
    return {
      success: true,
      observation_id: data.id,
      entity_id: relationshipKey,
    };
  } catch (err) {
    return {
      success: false,
      entity_id: relationshipKey,
      error: `Exception creating relationship restoration observation: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Check if an entity has a deletion observation
 *
 * @param entityId - Entity ID to check
 * @param userId - User ID (for RLS)
 * @returns True if entity is deleted
 */
export async function isEntityDeleted(entityId: string, userId: string): Promise<boolean> {
  const { data, error } = await db
    .from("observations")
    .select("fields, source_priority, observed_at")
    .eq("entity_id", entityId)
    .eq("user_id", userId);

  if (error || !data || data.length === 0) {
    return false;
  }

  // Sort by priority and observed_at to find highest priority observation
  const sorted = [...data].sort((a, b) => {
    // Primary: source_priority DESC
    if (b.source_priority !== a.source_priority) {
      return b.source_priority - a.source_priority;
    }
    // Secondary: observed_at DESC
    return new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime();
  });

  const highestPriorityObs = sorted[0];
  return highestPriorityObs.fields?._deleted === true;
}

/**
 * Check if a relationship has a deletion observation
 *
 * @param relationshipKey - Relationship key to check
 * @param userId - User ID (for RLS)
 * @returns True if relationship is deleted
 */
export async function isRelationshipDeleted(
  relationshipKey: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await db
    .from("relationship_observations")
    .select("metadata")
    .eq("relationship_key", relationshipKey)
    .eq("user_id", userId)
    .order("source_priority", { ascending: false })
    .order("observed_at", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return false;
  }

  const latestObservation = data[0];
  return latestObservation.metadata?._deleted === true;
}

/**
 * Batch soft delete multiple entities
 *
 * @param entityIds - Array of entity IDs to delete
 * @param entityType - Entity type
 * @param userId - User ID performing the deletion
 * @param reason - Optional reason for deletion
 * @param timestamp - Timestamp for deletion (defaults to now)
 * @returns Array of deletion results
 */
export async function batchSoftDeleteEntities(
  entityIds: string[],
  entityType: string,
  userId: string,
  reason?: string,
  timestamp?: string
): Promise<DeletionResult[]> {
  const results: DeletionResult[] = [];

  for (const entityId of entityIds) {
    const result = await softDeleteEntity(entityId, entityType, userId, reason, timestamp);
    results.push(result);
  }

  return results;
}
