/**
 * GDPR Deletion Service (Phase 2: Hard Deletion)
 *
 * Implements cryptographic erasure and physical deletion for GDPR Article 17 compliance.
 * Uses encryption + key deletion to make data irretrievable while maintaining immutability.
 */

import { supabase } from "../db.js";
import { softDeleteEntity, softDeleteRelationship } from "./deletion.js";
import { createCipheriv, randomBytes } from "node:crypto";

export interface DeletionRequest {
  id: string;
  user_id: string;
  entity_id?: string;
  relationship_id?: string;
  deletion_type: "entity" | "relationship" | "user_data_complete";
  status: "pending" | "in_progress" | "completed" | "rejected" | "extended";
  requested_at: string;
  soft_deleted_at?: string;
  hard_deleted_at?: string;
  completed_at?: string;
  deadline: string;
  backup_deletion_deadline?: string;
  reason?: string;
  legal_basis?:
    | "user_request"
    | "consent_withdrawal"
    | "unlawful_processing"
    | "legal_obligation"
    | "user_objection";
  deletion_method?: "soft_only" | "cryptographic_erasure" | "physical_deletion";
  retention_period_days?: number;
  retention_reason?: string;
}

export interface DeletionRequestResult {
  success: boolean;
  deletion_request_id?: string;
  error?: string;
}

/**
 * Type guard to check if an object is a valid DeletionRequest
 */
function isDeletionRequest(obj: unknown): obj is DeletionRequest {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    "user_id" in obj &&
    "deletion_type" in obj &&
    "status" in obj
  );
}

/**
 * Create a GDPR deletion request
 *
 * @param userId - User ID requesting deletion
 * @param deletionType - Type of deletion (entity, relationship, or user_data_complete)
 * @param entityId - Entity ID (if deletion_type is "entity")
 * @param relationshipId - Relationship ID (if deletion_type is "relationship")
 * @param legalBasis - Legal basis for deletion
 * @param retentionPeriodDays - Days to retain before hard deletion (for legal obligations)
 * @param retentionReason - Reason for retention period
 * @returns Deletion request result
 */
export async function createDeletionRequest(
  userId: string,
  deletionType: "entity" | "relationship" | "user_data_complete",
  entityId?: string,
  relationshipId?: string,
  legalBasis: DeletionRequest["legal_basis"] = "user_request",
  retentionPeriodDays?: number,
  retentionReason?: string
): Promise<DeletionRequestResult> {
  // Calculate deadline (30 days for standard, up to 90 days for complex)
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 30);

  // Calculate backup deletion deadline (within backup retention period)
  const backupDeadline = new Date();
  backupDeadline.setDate(backupDeadline.getDate() + 30);

  const deletionRequest = {
    user_id: userId,
    entity_id: entityId,
    relationship_id: relationshipId,
    deletion_type: deletionType,
    status: "pending" as const,
    legal_basis: legalBasis,
    deadline: deadline.toISOString(),
    backup_deletion_deadline: backupDeadline.toISOString(),
    deletion_method: retentionPeriodDays
      ? ("soft_only" as const)
      : ("cryptographic_erasure" as const),
    retention_period_days: retentionPeriodDays,
    retention_reason: retentionReason,
  };

  try {
    const { data, error } = await supabase
      .from("deletion_requests")
      .insert(deletionRequest)
      .select()
      .single();

    if (error) {
      return {
        success: false,
        error: `Failed to create deletion request: ${error.message}`,
      };
    }

    return {
      success: true,
      deletion_request_id: data.id,
    };
  } catch (err) {
    return {
      success: false,
      error: `Exception creating deletion request: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Process deletion request (orchestrates soft + hard deletion)
 *
 * @param deletionRequestId - Deletion request ID
 * @returns Processing result
 */
export async function processDeletionRequest(
  deletionRequestId: string
): Promise<DeletionRequestResult> {
  // Get deletion request
  const { data: requestData, error: fetchError } = await supabase
    .from("deletion_requests")
    .select("*")
    .eq("id", deletionRequestId)
    .single();

  if (fetchError || !requestData || !isDeletionRequest(requestData)) {
    return {
      success: false,
      error: `Failed to fetch deletion request: ${fetchError?.message || "Not found"}`,
    };
  }

  const request = requestData as DeletionRequest;

  // Update status to in_progress
  await supabase
    .from("deletion_requests")
    .update({ status: "in_progress" })
    .eq("id", deletionRequestId);

  try {
    // Step 1: Soft deletion
    if (!request.soft_deleted_at) {
      if (request.deletion_type === "entity" && request.entity_id) {
        await softDeleteEntity(
          request.entity_id,
          "unknown", // Type will be fetched from entity
          request.user_id,
          request.reason
        );
      } else if (
        request.deletion_type === "relationship" &&
        request.relationship_id
      ) {
        // Parse relationship key to get components
        const parts = request.relationship_id.split(":");
        if (parts.length === 3) {
          const [relationshipType, sourceEntityId, targetEntityId] = parts;
          await softDeleteRelationship(
            request.relationship_id,
            relationshipType,
            sourceEntityId,
            targetEntityId,
            request.user_id,
            request.reason
          );
        }
      } else if (request.deletion_type === "user_data_complete") {
        // Soft delete all user data
        await softDeleteAllUserData(request.user_id);
      }

      await supabase
        .from("deletion_requests")
        .update({ soft_deleted_at: new Date().toISOString() })
        .eq("id", deletionRequestId);
    }

    // Step 2: Hard deletion (if no retention period)
    if (!request.retention_period_days) {
      if (request.deletion_method === "cryptographic_erasure") {
        await cryptographicErasure(request.user_id, request.entity_id);

        await supabase
          .from("deletion_requests")
          .update({
            hard_deleted_at: new Date().toISOString(),
            encryption_key_deleted_at: new Date().toISOString(),
          })
          .eq("id", deletionRequestId);
      } else if (request.deletion_method === "physical_deletion") {
        await physicalDeletion(request.user_id, request.entity_id);

        await supabase
          .from("deletion_requests")
          .update({ hard_deleted_at: new Date().toISOString() })
          .eq("id", deletionRequestId);
      }
    }

    // Step 3: Mark completed
    await supabase
      .from("deletion_requests")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", deletionRequestId);

    return {
      success: true,
      deletion_request_id: deletionRequestId,
    };
  } catch (err) {
    // Update status to rejected
    await supabase
      .from("deletion_requests")
      .update({ status: "rejected" })
      .eq("id", deletionRequestId);

    return {
      success: false,
      error: `Failed to process deletion request: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Cryptographic erasure: Encrypt observations with user-specific key, then delete key
 *
 * Makes data irretrievable while maintaining database structure and immutability.
 * GDPR-compliant method recognized by regulators.
 *
 * @param userId - User ID
 * @param entityId - Optional entity ID (if deleting specific entity)
 */
export async function cryptographicErasure(
  userId: string,
  entityId?: string
): Promise<void> {
  // Generate encryption key for this user's data
  const encryptionKey = randomBytes(32); // 256-bit key
  const iv = randomBytes(16); // Initialization vector

  // Get observations to encrypt
  let query = supabase
    .from("observations")
    .select("id, fields")
    .eq("user_id", userId);

  if (entityId) {
    query = query.eq("entity_id", entityId);
  }

  const { data: observations, error: fetchError } = await query;

  if (fetchError) {
    throw new Error(`Failed to fetch observations: ${fetchError.message}`);
  }

  // Encrypt each observation's fields
  for (const obs of observations || []) {
    const cipher = createCipheriv("aes-256-cbc", encryptionKey, iv);
    const fieldsString = JSON.stringify(obs.fields);
    const encrypted =
      cipher.update(fieldsString, "utf8", "base64") + cipher.final("base64");

    // Update observation with encrypted fields
    await supabase
      .from("observations")
      .update({ fields: { _encrypted: encrypted, _iv: iv.toString("base64") } })
      .eq("id", obs.id);
  }

  // Delete encryption key (makes data irretrievable)
  // In production, this would be stored in a secure key management system
  // For now, we just mark it as deleted
  console.log("Encryption key deleted (data now irretrievable)");
}

/**
 * Physical deletion: Delete observations and snapshots
 *
 * Only used after legal retention periods expire.
 * Breaks immutability - last resort.
 *
 * @param userId - User ID
 * @param entityId - Optional entity ID (if deleting specific entity)
 */
export async function physicalDeletion(
  userId: string,
  entityId?: string
): Promise<void> {
  // Delete observations
  let obsQuery = supabase.from("observations").delete().eq("user_id", userId);

  if (entityId) {
    obsQuery = obsQuery.eq("entity_id", entityId);
  }

  const { error: obsError } = await obsQuery;

  if (obsError) {
    throw new Error(`Failed to delete observations: ${obsError.message}`);
  }

  // Delete snapshots
  if (entityId) {
    const { error: snapError } = await supabase
      .from("entity_snapshots")
      .delete()
      .eq("entity_id", entityId);

    if (snapError) {
      throw new Error(`Failed to delete snapshots: ${snapError.message}`);
    }
  } else {
    const { error: snapError } = await supabase
      .from("entity_snapshots")
      .delete()
      .eq("user_id", userId);

    if (snapError) {
      throw new Error(`Failed to delete snapshots: ${snapError.message}`);
    }
  }

  // Delete relationship observations
  const { error: relError } = await supabase
    .from("relationship_observations")
    .delete()
    .eq("user_id", userId);

  if (relError) {
    throw new Error(
      `Failed to delete relationship observations: ${relError.message}`
    );
  }
}

/**
 * Soft delete all user data
 *
 * @param userId - User ID
 */
async function softDeleteAllUserData(userId: string): Promise<void> {
  // Get all entities for user
  const { data: entities } = await supabase
    .from("entities")
    .select("id, entity_type")
    .eq("user_id", userId);

  // Soft delete each entity
  for (const entity of entities || []) {
    await softDeleteEntity(entity.id, entity.entity_type, userId);
  }

  // Get all relationships for user
  const { data: relationships } = await supabase
    .from("relationship_observations")
    .select("relationship_key, source_entity_id, target_entity_id, relationship_type")
    .eq("user_id", userId)
    .limit(1000);

  // Soft delete each relationship
  for (const rel of relationships || []) {
    await softDeleteRelationship(
      rel.relationship_key,
      rel.relationship_type,
      rel.source_entity_id,
      rel.target_entity_id,
      userId
    );
  }
}

/**
 * Get deletion requests for user
 *
 * @param userId - User ID
 * @param status - Optional status filter
 * @returns Deletion requests
 */
export async function getDeletionRequests(
  userId: string,
  status?: "pending" | "in_progress" | "completed" | "rejected" | "extended"
): Promise<DeletionRequest[]> {
  let query = supabase
    .from("deletion_requests")
    .select("*")
    .eq("user_id", userId)
    .order("requested_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to get deletion requests: ${error.message}`);
  }

  return (data || []) as DeletionRequest[];
}

/**
 * Extend deletion request deadline (max 90 days total)
 *
 * @param deletionRequestId - Deletion request ID
 * @param extensionReason - Reason for extension
 * @param additionalDays - Additional days to extend (default 30)
 * @returns Extension result
 */
export async function extendDeletionDeadline(
  deletionRequestId: string,
  extensionReason: string,
  additionalDays: number = 30
): Promise<DeletionRequestResult> {
  const { data: request } = await supabase
    .from("deletion_requests")
    .select("*")
    .eq("id", deletionRequestId)
    .single();

  if (!request) {
    return {
      success: false,
      error: "Deletion request not found",
    };
  }

  // Calculate new deadline
  const currentDeadline = new Date(request.deadline);
  const newDeadline = new Date(currentDeadline);
  newDeadline.setDate(newDeadline.getDate() + additionalDays);

  // Verify total extension doesn't exceed 90 days
  const originalDeadline = request.original_deadline
    ? new Date(request.original_deadline)
    : new Date(request.requested_at);
  originalDeadline.setDate(originalDeadline.getDate() + 30);

  const totalDays = Math.floor(
    (newDeadline.getTime() - originalDeadline.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (totalDays > 90) {
    return {
      success: false,
      error: "Extension would exceed 90-day maximum (GDPR complex request limit)",
    };
  }

  // Update request
  const { error } = await supabase
    .from("deletion_requests")
    .update({
      deadline: newDeadline.toISOString(),
      extension_granted: true,
      extension_reason: extensionReason,
      extension_granted_at: new Date().toISOString(),
      original_deadline: request.original_deadline || currentDeadline.toISOString(),
      status: "extended",
    })
    .eq("id", deletionRequestId);

  if (error) {
    return {
      success: false,
      error: `Failed to extend deadline: ${error.message}`,
    };
  }

  return {
    success: true,
    deletion_request_id: deletionRequestId,
  };
}
