/**
 * Entity Resolution Service (FU-101)
 *
 * Deterministic entity ID generation and canonical name normalization.
 */

import { createHash } from "node:crypto";
import { supabase } from "../db.js";

export interface Entity {
  id: string;
  entity_type: string;
  canonical_name: string;
  user_id?: string;
  merged_to_entity_id?: string | null;
  merged_at?: string | null;
  created_at: string;
  updated_at?: string;
}

/**
 * Generate deterministic entity ID from entity type and name
 */
export function generateEntityId(
  entityType: string,
  canonicalName: string,
): string {
  const normalized = normalizeEntityValue(entityType, canonicalName);
  const hash = createHash("sha256")
    .update(`${entityType}:${normalized}`)
    .digest("hex");

  return `ent_${hash.substring(0, 24)}`;
}

/**
 * Normalize entity value for consistent resolution
 */
export function normalizeEntityValue(entityType: string, raw: string): string {
  let normalized = raw.trim().toLowerCase();

  // Remove common suffixes for companies
  if (entityType === "company" || entityType === "organization") {
    normalized = normalized
      .replace(/\s+(inc|llc|ltd|corp|corporation|co|company|limited)\.?$/i, "")
      .trim();
  }

  // Remove extra whitespace
  normalized = normalized.replace(/\s+/g, " ").trim();

  return normalized;
}

/**
 * Resolve entity (get or create)
 * @param entityType - The type of entity (e.g., 'company', 'person')
 * @param rawValue - The raw entity value to normalize and resolve
 * @param userId - Optional user ID for multi-user isolation (FU-113)
 */
export async function resolveEntity(
  entityType: string,
  rawValue: string,
  userId?: string,
): Promise<Entity> {
  const canonicalName = normalizeEntityValue(entityType, rawValue);
  const entityId = generateEntityId(entityType, canonicalName);

  // Check if entity exists
  let query = supabase.from("entities").select("*").eq("id", entityId);

  // If userId is provided, filter by user_id for multi-user isolation
  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data: existing } = await query.single();

  if (existing) {
    // If entity exists but was merged, follow the merge chain
    if (existing.merged_to_entity_id) {
      const { data: mergedTo } = await supabase
        .from("entities")
        .select("*")
        .eq("id", existing.merged_to_entity_id)
        .single();

      if (mergedTo) {
        return mergedTo as Entity;
      }
    }
    return existing as Entity;
  }

  // Create new entity
  const now = new Date().toISOString();
  const entityData: Record<string, unknown> = {
    id: entityId,
    entity_type: entityType,
    canonical_name: canonicalName,
    aliases: [],
    created_at: now,
    updated_at: now,
  };

  // Include user_id if provided (FU-113: multi-user isolation)
  if (userId) {
    entityData.user_id = userId;
  }

  const { data: newEntity, error } = await supabase
    .from("entities")
    .insert(entityData)
    .select()
    .single();

  if (error) {
    console.error(`Failed to insert entity ${entityId}:`, error);
    // Return entity structure even if insert fails (for backwards compatibility)
    return {
      id: entityId,
      entity_type: entityType,
      canonical_name: canonicalName,
      user_id: userId,
      created_at: now,
    };
  }

  return newEntity as Entity;
}

/**
 * Merge two entities (FU-113)
 * Marks the source entity as merged into the target entity.
 * Both entities must belong to the same user.
 *
 * @param fromEntityId - The entity ID to merge from (will be marked as merged)
 * @param toEntityId - The entity ID to merge into (target)
 * @param userId - User ID for ownership validation
 * @returns The updated source entity with merge tracking
 */
export async function mergeEntities(
  fromEntityId: string,
  toEntityId: string,
  userId: string,
): Promise<{ success: boolean; error?: string; entity?: Entity }> {
  // Validate both entities exist and belong to the same user
  const { data: fromEntity, error: fromError } = await supabase
    .from("entities")
    .select("*")
    .eq("id", fromEntityId)
    .eq("user_id", userId)
    .single();

  if (fromError || !fromEntity) {
    return {
      success: false,
      error: `Source entity ${fromEntityId} not found or not owned by user`,
    };
  }

  const { data: toEntity, error: toError } = await supabase
    .from("entities")
    .select("*")
    .eq("id", toEntityId)
    .eq("user_id", userId)
    .single();

  if (toError || !toEntity) {
    return {
      success: false,
      error: `Target entity ${toEntityId} not found or not owned by user`,
    };
  }

  // Check if source entity is already merged
  if (fromEntity.merged_to_entity_id) {
    return {
      success: false,
      error: `Entity ${fromEntityId} is already merged to ${fromEntity.merged_to_entity_id}`,
    };
  }

  // Check for circular merge (target already merged to source)
  if (toEntity.merged_to_entity_id === fromEntityId) {
    return {
      success: false,
      error: `Circular merge detected: ${toEntityId} is already merged to ${fromEntityId}`,
    };
  }

  // Perform the merge
  const now = new Date().toISOString();
  const { data: updatedEntity, error: updateError } = await supabase
    .from("entities")
    .update({
      merged_to_entity_id: toEntityId,
      merged_at: now,
      updated_at: now,
    })
    .eq("id", fromEntityId)
    .eq("user_id", userId)
    .select()
    .single();

  if (updateError) {
    return {
      success: false,
      error: `Failed to merge entity: ${updateError.message}`,
    };
  }

  return { success: true, entity: updatedEntity as Entity };
}

/**
 * Extract entities from record properties
 */
export function extractEntities(
  properties: Record<string, unknown>,
  schemaType: string,
): Array<{ entity_type: string; raw_value: string }> {
  const entities: Array<{ entity_type: string; raw_value: string }> = [];

  // Extract based on schema type
  if (schemaType === "invoice" || schemaType === "receipt") {
    if (properties.vendor_name && typeof properties.vendor_name === "string") {
      entities.push({
        entity_type: "company",
        raw_value: properties.vendor_name,
      });
    }
    if (
      properties.customer_name &&
      typeof properties.customer_name === "string"
    ) {
      entities.push({
        entity_type: "company",
        raw_value: properties.customer_name,
      });
    }
  }

  if (schemaType === "identity_document" || schemaType === "contact") {
    if (properties.full_name && typeof properties.full_name === "string") {
      entities.push({
        entity_type: "person",
        raw_value: properties.full_name,
      });
    }
  }

  if (schemaType === "transaction" || schemaType === "bank_statement") {
    if (
      properties.merchant_name &&
      typeof properties.merchant_name === "string"
    ) {
      entities.push({
        entity_type: "company",
        raw_value: properties.merchant_name,
      });
    }
    if (
      properties.counterparty &&
      typeof properties.counterparty === "string"
    ) {
      entities.push({
        entity_type: "company",
        raw_value: properties.counterparty,
      });
    }
  }

  return entities;
}

/**
 * Get entity by ID
 */
export async function getEntityById(entityId: string): Promise<Entity | null> {
  const { data, error } = await supabase
    .from("entities")
    .select("*")
    .eq("id", entityId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as Entity;
}

/**
 * List entities with optional filters
 * @param filters - Optional filters for entity type, pagination, user isolation, and merge status
 */
export async function listEntities(filters?: {
  entity_type?: string;
  limit?: number;
  offset?: number;
  user_id?: string;
  include_merged?: boolean;
}): Promise<Entity[]> {
  let query = supabase.from("entities").select("*");

  // Filter by user_id if provided (FU-113: multi-user isolation)
  if (filters?.user_id) {
    query = query.eq("user_id", filters.user_id);
  }

  // Exclude merged entities by default (FU-113)
  if (!filters?.include_merged) {
    query = query.is("merged_to_entity_id", null);
  }

  if (filters?.entity_type) {
    query = query.eq("entity_type", filters.entity_type);
  }

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  if (filters?.offset) {
    query = query.range(
      filters.offset,
      filters.offset + (filters.limit || 10) - 1,
    );
  }

  // Order by created_at descending
  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  return data as Entity[];
}

/**
 * Get entities that were merged into a target entity (FU-113)
 * @param targetEntityId - The entity ID that others were merged into
 * @param userId - Optional user ID for multi-user isolation
 */
export async function getMergedEntities(
  targetEntityId: string,
  userId?: string,
): Promise<Entity[]> {
  let query = supabase
    .from("entities")
    .select("*")
    .eq("merged_to_entity_id", targetEntityId);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  return data as Entity[];
}
