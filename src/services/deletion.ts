/**
 * Deletion Service for GDPR Compliance (Phase 1: Soft Deletion)
 *
 * Implements immutable soft deletion via deletion observations.
 * Deletion observations mark entities/relationships as deleted while maintaining
 * full audit trail and immutability guarantees.
 */

import { db } from "../db.js";
import { createHash } from "node:crypto";

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
}

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
  const canonicalHash = createHash("sha256")
    .update(metadataString)
    .digest("hex");

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
 * Restore a deleted relationship by creating a restoration observation
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
  const canonicalHash = createHash("sha256")
    .update(metadataString)
    .digest("hex");

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
export async function isEntityDeleted(
  entityId: string,
  userId: string
): Promise<boolean> {
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
    const result = await softDeleteEntity(
      entityId,
      entityType,
      userId,
      reason,
      timestamp
    );
    results.push(result);
  }

  return results;
}
