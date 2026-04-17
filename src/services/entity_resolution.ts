/**
 * Entity Resolution Service (FU-101)
 *
 * Deterministic entity ID generation and canonical name normalization.
 */

import { createHash } from "node:crypto";
import { db } from "../db.js";
import { logger } from "../utils/logger.js";
import { schemaRegistry, type SchemaDefinition } from "./schema_registry.js";

/**
 * Values that must not be used as an entity's canonical_name. These are
 * generic enum/status/category tokens that would silently collapse unrelated
 * entities (e.g. every receipt priced in EUR becoming the same entity).
 *
 * Keep this list small and schema-agnostic: it catches common mistakes but
 * does not encode per-type knowledge. The full fix is schema-declared
 * canonical_name_fields.
 */
const REJECTED_CANONICAL_VALUES = new Set([
  // ISO 4217 currency codes (small high-risk subset)
  "usd", "eur", "gbp", "jpy", "cny", "inr", "cad", "aud", "chf", "mxn",
  "brl", "zar", "nzd", "sek", "nok", "dkk", "krw", "sgd", "hkd", "twd",
  // Common status/category tokens
  "unknown", "null", "none", "n/a", "na", "tbd", "undefined", "other", "misc",
  "active", "inactive", "pending", "complete", "completed", "cancelled",
  "draft", "approved", "rejected", "open", "closed", "true", "false", "yes", "no",
]);

function isRejectedCanonicalValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  if (REJECTED_CANONICAL_VALUES.has(normalized)) return true;
  return false;
}

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
 * Normalize entity value for consistent resolution (entity ID hashing).
 *
 * More aggressive normalization reduces duplicate entities caused by slight
 * name variations across sessions (e.g. "Acme Corp" vs "acme corp." vs
 * "ACME Corp, Inc.").
 */
export function normalizeEntityValue(entityType: string, raw: string): string {
  let normalized = raw.trim().toLowerCase();

  // Email addresses: keep local-part and domain intact for hashing and identifier
  // search (hyphens and dots in the local part must not become spaces).
  if (/\S+@\S+/.test(normalized)) {
    return normalized;
  }

  // ID-derived canonical names (e.g. "id:turn_key:cursor:chat:turn-7") use
  // colons and underscores structurally — skip punctuation stripping for these.
  const isIdDerived = normalized.startsWith("id:") || /^\w+:/.test(normalized);

  if (entityType === "company" || entityType === "organization") {
    normalized = normalized
      .replace(/\s+(inc|llc|ltd|corp|corporation|co|company|limited|plc|gmbh|sa|ag|pty|pvt)\.?$/i, "")
      .trim();
  }

  if (entityType === "person" || entityType === "contact") {
    normalized = normalized
      .replace(/\b(mr|mrs|ms|dr|prof|sir|jr|sr|ii|iii|iv)\.?\b/gi, "")
      .trim();
  }

  if (!isIdDerived) {
    normalized = normalized.replace(/[-.,;:!?'"()[\]{}_/\\]+/g, " ");
  }

  normalized = normalized.replace(/\s+/g, " ").trim();

  return normalized;
}

/**
 * Human-readable canonical name for persistence. Applies the same structural
 * rules as {@link normalizeEntityValue} (suffixes, honorifics, punctuation,
 * whitespace) but preserves letter casing. {@link generateEntityId} still
 * hashes {@link normalizeEntityValue} of this string, so IDs stay stable and
 * case-insensitive.
 */
export function formatCanonicalNameForStorage(
  entityType: string,
  raw: string,
): string {
  let s = raw.trim();
  const probe = s.toLowerCase();
  const isIdDerived =
    probe.startsWith("id:") || /^\w+:/.test(probe);

  if (/\S+@\S+/.test(probe)) {
    return raw.trim().toLowerCase();
  }

  if (entityType === "company" || entityType === "organization") {
    s = s
      .replace(
        /\s+(inc|llc|ltd|corp|corporation|co|company|limited|plc|gmbh|sa|ag|pty|pvt)\.?$/i,
        "",
      )
      .trim();
  }

  if (entityType === "person" || entityType === "contact") {
    s = s
      .replace(/\b(mr|mrs|ms|dr|prof|sir|jr|sr|ii|iii|iv)\.?\b/gi, "")
      .trim();
  }

  if (!isIdDerived) {
    s = s.replace(/[-.,;:!?'"()[\]{}_/\\]+/g, " ");
  }

  s = s.replace(/\s+/g, " ").trim();

  return s;
}

/**
 * Derive a canonical_name for an entity from its fields.
 *
 * Precedence:
 * 1. Schema-declared `canonical_name_fields` (composite key from stable fields).
 * 2. Explicit name-like fields (canonical_name, name, full_name, title, email, url).
 * 3. Stable IDs (message_id, turn_key, thread_id, external_id, etc.).
 * 4. First non-metadata string field (warns when falling back to this, and
 *    rejects common enum/status/currency tokens that would collapse unrelated
 *    entities).
 *
 * Pass the active schema via `schema` when available to use (1). Callers that
 * don't have schema context still get safe fallbacks.
 */
export function deriveCanonicalNameFromFields(
  entityType: string,
  fields: Record<string, unknown>,
  schema?: Pick<SchemaDefinition, "canonical_name_fields"> | null,
): string {
  // 1) Schema-declared composite canonical name. All declared fields must be
  //    present and non-empty; otherwise fall through to the next rule so the
  //    lookup stays deterministic but doesn't silently degrade.
  if (schema?.canonical_name_fields && schema.canonical_name_fields.length > 0) {
    const declared = schema.canonical_name_fields;
    const parts: string[] = [];
    let allPresent = true;
    for (const key of declared) {
      const value = fields[key];
      if (value == null || String(value).trim() === "") {
        allPresent = false;
        break;
      }
      parts.push(String(value).trim());
    }
    if (allPresent && parts.length > 0) {
      return formatCanonicalNameForStorage(
        entityType,
        `${entityType}:${parts.join("|")}`,
      );
    }
  }

  const preferredNameKeys = [
    "canonical_name",
    "name",
    "full_name",
    "title",
    "email",
    "url",
  ] as const;

  // 2) Prefer explicit name-like fields
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

  // 3) Prefer stable IDs over arbitrary string fields
  if (nameField == null || String(nameField).trim() === "") {
    const idFields = [
      "message_id",
      "turn_key",
      "thread_id",
      "external_id",
      "source_id",
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
      "currency",
      "currency_code",
      "category",
    ]);

    const sortedKeys = Object.keys(fields).sort();
    for (const key of sortedKeys) {
      if (rejectKeys.has(key)) continue;
      const v = fields[key];
      if (typeof v !== "string") continue;
      const s = v.trim();
      if (s === "") continue;
      if (rejectPatterns.some((re) => re.test(s))) continue;
      // Guard: reject generic enum/currency/status tokens that would collapse
      // unrelated entities (e.g. many receipts all priced in "EUR").
      if (isRejectedCanonicalValue(s)) continue;
      nameField = s;
      logger.warn(
        `[ENTITY_RESOLUTION] Falling back to heuristic canonical_name for ${entityType} ` +
          `using field "${key}"; declare canonical_name_fields on the schema to make this deterministic. ` +
          `See docs/foundation/schema_agnostic_design_rules.md.`,
      );
      break;
    }
  }

  const resolved = String(nameField ?? "unknown");
  if (resolved === "unknown") {
    logger.warn(
      `[ENTITY_RESOLUTION] No canonical_name found for ${entityType}; using "unknown". ` +
        `Declare canonical_name_fields on the schema or provide a name/title/email field.`,
    );
  }

  return formatCanonicalNameForStorage(entityType, resolved);
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
  options:
    | {
        entityType: string;
        fields: Record<string, unknown>;
        userId?: string;
        schema?: Pick<SchemaDefinition, "canonical_name_fields"> | null;
      }
    | string,
  rawValue?: string,
): Promise<string> {
  // Support both old and new signatures for backwards compatibility
  let entityType: string;
  let canonicalName: string;
  let userId: string | undefined;

  if (typeof options === "string") {
    // Old signature: resolveEntity(entityType, rawValue)
    entityType = options;
    canonicalName = formatCanonicalNameForStorage(
      entityType,
      rawValue || "",
    );
  } else {
    // New signature: resolveEntity({ entityType, fields, userId, schema? })
    entityType = options.entityType;
    userId = options.userId;

    let schema = options.schema;
    if (schema === undefined) {
      // Load the active schema so canonical_name derivation is schema-driven.
      // Failures here are non-fatal: we fall back to heuristics in
      // deriveCanonicalNameFromFields so a missing registry row doesn't block
      // ingestion.
      try {
        const entry = await schemaRegistry.loadActiveSchema(entityType, userId);
        schema = entry?.schema_definition ?? null;
      } catch (err) {
        logger.warn(
          `[ENTITY_RESOLUTION] Failed to load schema for ${entityType}; ` +
            `falling back to heuristic canonical_name. Error: ${(err as Error).message}`,
        );
        schema = null;
      }
    }

    canonicalName = deriveCanonicalNameFromFields(
      entityType,
      options.fields,
      schema,
    );
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
