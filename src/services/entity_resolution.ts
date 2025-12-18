/**
 * Entity Resolution Service (FU-101)
 *
 * Deterministic entity ID generation and canonical name normalization.
 */

import { createHash } from "node:crypto";
import { supabase } from "../db.js";
import { DEFAULT_USER_ID } from "../constants.js";

export interface Entity {
  id: string;
  entity_type: string;
  canonical_name: string;
  aliases: string[];
  metadata: Record<string, unknown>;
  first_seen_at: string;
  last_seen_at: string;
  merged_to_entity_id: string | null;
  merged_at: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
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
 */
export async function resolveEntity(
  entityType: string,
  rawValue: string,
  userId: string = DEFAULT_USER_ID,
): Promise<Entity> {
  const canonicalName = normalizeEntityValue(entityType, rawValue);
  const entityId = generateEntityId(entityType, canonicalName);

  // Check if entity exists
  const { data: existing } = await supabase
    .from("entities")
    .select("*")
    .eq("id", entityId)
    .eq("user_id", userId)
    .single();

  if (existing) {
    const now = new Date().toISOString();
    await supabase
      .from("entities")
      .update({ last_seen_at: now })
      .eq("id", entityId)
      .eq("user_id", userId);
    return {
      ...(existing as Entity),
      last_seen_at: now,
    };
  }

  // Create new entity
  const now = new Date().toISOString();
  const { data: newEntity, error } = await supabase
    .from("entities")
    .insert({
      id: entityId,
      entity_type: entityType,
      canonical_name: canonicalName,
      aliases: [],
      metadata: {},
      first_seen_at: now,
      last_seen_at: now,
      created_at: now,
      updated_at: now,
      user_id: userId,
    })
    .select()
    .single();

  if (error) {
    console.error(`Failed to insert entity ${entityId}:`, error);
    // Return entity structure even if insert fails (for backwards compatibility)
    return {
      id: entityId,
      entity_type: entityType,
      canonical_name: canonicalName,
      created_at: now,
    };
  }

  return newEntity as Entity;
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
export async function getEntityById(
  entityId: string,
  userId: string = DEFAULT_USER_ID,
): Promise<Entity | null> {
  const { data, error } = await supabase
    .from("entities")
    .select("*")
    .eq("id", entityId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as Entity;
}

/**
 * List entities with optional filters
 */
export async function listEntities(
  userId: string = DEFAULT_USER_ID,
  filters?: {
    entity_type?: string;
    limit?: number;
    offset?: number;
  },
): Promise<Entity[]> {
  let query = supabase
    .from("entities")
    .select("*")
    .eq("user_id", userId)
    .is("merged_to_entity_id", null);

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
