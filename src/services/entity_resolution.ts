/**
 * Entity Resolution Service (FU-101)
 *
 * Deterministic entity ID generation and canonical name normalization.
 */

import { createHash } from "node:crypto";
import { supabase } from "../db.js";
import { logger } from "../utils/logger.js";

export interface Entity {
  id: string;
  entity_type: string;
  canonical_name: string;
  created_at: string;
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
 * 
 * @param options - Entity resolution options
 * @param options.entityType - Type of entity (e.g., "person", "company")
 * @param options.fields - Entity fields containing identifying information
 * @param options.userId - User ID for user-scoped resolution (optional for backwards compatibility)
 */
export async function resolveEntity(
  options: { entityType: string; fields: Record<string, unknown>; userId?: string } | string,
  rawValue?: string,
): Promise<string> {
  // Support both old and new signatures for backwards compatibility
  let entityType: string;
  let canonicalName: string;
  let userId: string | undefined;

  if (typeof options === "string") {
    // Old signature: resolveEntity(entityType, rawValue)
    entityType = options;
    canonicalName = normalizeEntityValue(entityType, rawValue || "");
  } else {
    // New signature: resolveEntity({ entityType, fields, userId })
    entityType = options.entityType;
    userId = options.userId;
    
    // Extract canonical name from fields: prefer name-like fields so we don't use dates, schema_version, or descriptions
    const preferredNameKeys = [
      "name",
      "canonical_name",
      "full_name",
      "title",
      "email",
      "url",
    ] as const;
    let nameField: unknown = options.fields.name ?? options.fields.canonical_name;
    if (nameField == null || String(nameField).trim() === "") {
      for (const key of preferredNameKeys) {
        const v = options.fields[key as string];
        if (v != null && typeof v === "string" && String(v).trim() !== "") {
          nameField = v;
          break;
        }
      }
    }
    if (nameField == null || String(nameField).trim() === "") {
      // Reject patterns for values that shouldn't be used as entity names
      const rejectPatterns = [
        /^\d{4}-\d{2}-\d{2}/,           // ISO date
        /^\d+\.\d+$/,                    // schema_version e.g. "1.0"
        /^\d+$/,                         // pure numeric
      ];
      // Reject keys that are metadata/types, not identifying names
      const rejectKeys = new Set([
        "contact_type", "entity_type", "type", "status",
        "created_at", "updated_at", "created_date", "updated_date",
        "schema_version", "import_date", "import_source_file"
      ]);
      const firstString = Object.entries(options.fields).find(
        ([key, v]) =>
          !rejectKeys.has(key) &&
          typeof v === "string" &&
          String(v).trim() !== "" &&
          !rejectPatterns.some((re) => re.test(String(v)))
      )?.[1] as string | undefined;
      nameField = firstString;
    }

    // If still no valid name field, look for unique identifier fields (e.g., company_id, person_id, id)
    if (nameField == null || String(nameField).trim() === "") {
      const idFields = ["company_id", "person_id", "contact_id", "id", "uuid", "external_id"];
      for (const idKey of idFields) {
        const idValue = options.fields[idKey];
        if (idValue != null && String(idValue).trim() !== "") {
          // Use ID field to ensure uniqueness, prefix with "unknown:" to distinguish from named entities
          nameField = `unknown:${String(idValue)}`;
          logger.info(`[entity_resolution] Using ID field ${idKey}=${idValue} for entity name`);
          break;
        }
      }
    }

    canonicalName = normalizeEntityValue(entityType, String(nameField || "unknown"));
    logger.warn(`[entity_resolution] Final canonical name: ${canonicalName} for entityType: ${entityType}`);
  }

  const entityId = generateEntityId(entityType, canonicalName);

  // Check if entity exists
  const { data: existing } = await supabase
    .from("entities")
    .select("*")
    .eq("id", entityId)
    .maybeSingle();

  if (existing) {
    // Default test user ID that should be updated to actual user_id
    const defaultTestUserId = "00000000-0000-0000-0000-000000000000";
    const shouldUpdateUserId = 
      userId && 
      (existing.user_id === null || existing.user_id === defaultTestUserId);
    
    // If entity exists but has null or default test user_id and we have a userId, update it
    // This ensures entities created with the old default user pattern get the correct user_id
    if (shouldUpdateUserId) {
      const { error: updateError } = await supabase
        .from("entities")
        .update({ user_id: userId, updated_at: new Date().toISOString() })
        .eq("id", entityId);
      
      if (updateError) {
        logger.warn(
          `Failed to update user_id for existing entity ${entityId}:`,
          updateError.message
        );
      } else {
        logger.info(
          `Updated user_id for entity ${entityId} from ${existing.user_id} to ${userId}`
        );
      }
    } else if (existing.user_id && userId && existing.user_id !== userId) {
      // Entity already has a different user_id - log warning but don't change it
      // This preserves data integrity (entity belongs to another user)
      logger.warn(
        `Entity ${entityId} already has user_id ${existing.user_id}, ` +
          `but resolution requested with user_id ${userId}. Keeping existing user_id.`
      );
    }
    return entityId;
  }

  // Create new entity
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("entities")
    .insert({
      id: entityId,
      entity_type: entityType,
      canonical_name: canonicalName,
      aliases: [],
      user_id: userId || null,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) {
    logger.error(`Failed to insert entity ${entityId}:`, error);
  }

  return entityId;
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
 */
export async function listEntities(filters?: {
  entity_type?: string;
  limit?: number;
  offset?: number;
}): Promise<Entity[]> {
  let query = supabase.from("entities").select("*");

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
