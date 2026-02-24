/**
 * Entity Resolution Service (FU-101)
 *
 * Deterministic entity ID generation and canonical name normalization.
 */

import { createHash } from "node:crypto";
import { db } from "../db.js";
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

export function deriveCanonicalNameFromFields(
  entityType: string,
  fields: Record<string, unknown>,
): string {
  const preferredNameKeys = [
    "canonical_name",
    "name",
    "full_name",
    "title",
    "email",
    "url",
  ] as const;

  // 1) Prefer explicit name-like fields
  let nameField: unknown = fields.canonical_name ?? fields.name;
  if (nameField == null || String(nameField).trim() === "") {
    for (const key of preferredNameKeys) {
      const v = fields[key as string];
      if (v != null && typeof v === "string" && v.trim() !== "") {
        nameField = v;
        break;
      }
    }
  }

  // 2) Prefer stable IDs over arbitrary string fields
  if (nameField == null || String(nameField).trim() === "") {
    const idFields = [
      "message_id",
      "thread_id",
      "external_id",
      "id",
      "uuid",
      "company_id",
      "person_id",
      "contact_id",
    ] as const;

    for (const idKey of idFields) {
      const idValue = fields[idKey as string];
      if (idValue != null && String(idValue).trim() !== "") {
        nameField = `id:${idKey}:${String(idValue)}`;
        break;
      }
    }
  }

  // 3) For row-like finance entities, build a composite canonical name from stable row fields.
  if (nameField == null || String(nameField).trim() === "") {
    const compositeCandidates: Record<string, string[]> = {
      transaction: ["posting_date", "category", "amount_original", "bank_provider"],
      balance: ["snapshot_date", "account_id", "balance_usd"],
      dataset_row: ["source_file", "row_index"],
    };

    const keys = compositeCandidates[entityType];
    if (keys) {
      const parts = keys
        .map((key) => fields[key])
        .filter((value) => value != null && String(value).trim() !== "")
        .map((value) => String(value).trim());
      if (parts.length > 0) {
        nameField = `${entityType}:${parts.join("|")}`;
      }
    }
  }

  // 4) Last resort: pick a deterministic "first" string field that is not clearly metadata.
  if (nameField == null || String(nameField).trim() === "") {
    const rejectPatterns = [
      /^\d{4}-\d{2}-\d{2}/, // ISO date
      /^\d+\.\d+$/, // schema_version e.g. "1.0"
      /^\d+$/, // pure numeric
    ];
    const rejectKeys = new Set([
      "contact_type",
      "entity_type",
      "type",
      "status",
      "created_at",
      "updated_at",
      "created_date",
      "updated_date",
      "schema_version",
      "import_date",
      "import_source_file",
      "source",
    ]);

    const sortedKeys = Object.keys(fields).sort();
    for (const key of sortedKeys) {
      if (rejectKeys.has(key)) continue;
      const v = fields[key];
      if (typeof v !== "string") continue;
      const s = v.trim();
      if (s === "") continue;
      if (rejectPatterns.some((re) => re.test(s))) continue;
      nameField = s;
      break;
    }
  }

  return normalizeEntityValue(entityType, String(nameField ?? "unknown"));
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

    canonicalName = deriveCanonicalNameFromFields(entityType, options.fields);
  }

  const entityId = generateEntityId(entityType, canonicalName);

  // Check if entity exists
  const { data: existing } = await db
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
      const { error: updateError } = await db
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
  const { error } = await db
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
  const { data, error } = await db
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
  let query = db.from("entities").select("*");

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
