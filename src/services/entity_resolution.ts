/**
 * Entity Resolution Service (FU-101)
 *
 * Deterministic entity ID generation and canonical name normalization.
 */

import { createHash } from "node:crypto";
import { db } from "../db.js";
import { logger } from "../utils/logger.js";
import {
  schemaRegistry,
  type CanonicalNameRule,
  type SchemaDefinition,
} from "./schema_registry.js";

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

/**
 * Thrown when {@link deriveCanonicalNameFromFields} cannot land on a safe
 * canonical_name for the provided entity. Surfaced per-observation by the
 * structured-store pipeline so callers can fix their payload instead of
 * silently merging into another entity.
 */
export class CanonicalNameUnresolvedError extends Error {
  public readonly code = "ERR_CANONICAL_NAME_UNRESOLVED" as const;
  public readonly entityType: string;
  public readonly seenFields: string[];
  public readonly attemptedValue: string | null;

  constructor(params: {
    entityType: string;
    seenFields: string[];
    attemptedValue: string | null;
  }) {
    const preview = params.attemptedValue
      ? ` (derivation landed on "${params.attemptedValue}", a rejected token)`
      : "";
    const seen = params.seenFields.length
      ? ` Seen fields: ${params.seenFields.join(", ")}.`
      : " No usable name/identifier fields were provided.";
    super(
      `Cannot derive canonical_name for "${params.entityType}"${preview}. ` +
        `Declare \`canonical_name_fields\` on the ${params.entityType} schema ` +
        `to make this deterministic, or supply one of: canonical_name, name, ` +
        `full_name, title, email, url. See ` +
        `docs/foundation/schema_agnostic_design_rules.md.${seen}`,
    );
    this.name = "CanonicalNameUnresolvedError";
    this.entityType = params.entityType;
    this.seenFields = params.seenFields;
    this.attemptedValue = params.attemptedValue;
  }
}

/**
 * Step in the resolver trace. Exposed per-observation in the structured-store
 * response so callers can see exactly which rule produced the canonical_name
 * and whether the entity was created or matched.
 *
 * Format: `<rule>:<detail>` — keeps the trace human-readable and stable for
 * tooling without committing us to a structured per-branch schema.
 */
export type ResolverPathStep = string;

/**
 * Structured classification of how an entity's identity was resolved. Written
 * alongside the freeform {@link ResolverPathStep}[] so dashboards can count
 * identity quality without parsing strings.
 *
 * - `schema_rule` — a schema-declared `canonical_name_fields` rule matched
 *   (legacy composite or new ordered single/composite rule).
 * - `heuristic_name` — fell back to an explicit name-like field
 *   (canonical_name, name, full_name, title, email, url) or a stable id field
 *   (message_id, turn_key, thread_id, etc.).
 * - `heuristic_fallback` — derivation picked the first non-metadata string
 *   field. This is the signal that identity quality is low and the schema
 *   needs a `canonical_name_fields` declaration.
 * - `target_id` — caller supplied an explicit target entity_id (extend mode).
 * - `schema_lookup` — reserved for the deferred R3 pre-hash identifier
 *   lookup; not emitted today.
 */
export type IdentityBasis =
  | "schema_rule"
  | "schema_lookup"
  | "heuristic_name"
  | "heuristic_fallback"
  | "target_id";

/**
 * Full trace for a single entity resolution. Populated by
 * {@link resolveEntityWithTrace} and surfaced per-observation.
 */
export interface ResolverTrace {
  entityType: string;
  canonicalName: string;
  /** Rule path (schema / name_key / id_key / heuristic / target_id). */
  path: ResolverPathStep[];
  /**
   * Structured identity classification. See {@link IdentityBasis}.
   */
  identityBasis: IdentityBasis;
  /**
   * Human-readable label for the rule that won — e.g. `email`,
   * `composite:full_name+employer`, `message_id`, or `first_string_field`.
   * Empty when `identityBasis === "target_id"`.
   */
  identityRule: string;
  /** Whether the resolution landed on an existing row or created a new one. */
  action: "created" | "matched_existing" | "would_create" | "would_match_existing" | "extended";
}

/**
 * Result of the internal derivation step — canonical name plus a trace of the
 * rule path that produced it. Exposed for callers that need the path
 * (structured-store response, plan mode). Callers that just want the string
 * can use {@link deriveCanonicalNameFromFields}.
 */
export interface CanonicalNameDerivation {
  canonicalName: string;
  path: ResolverPathStep[];
  identityBasis: IdentityBasis;
  identityRule: string;
}

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
 * Is this a legacy single-composite `canonical_name_fields` declaration?
 *
 * An array purely of strings is treated as the original "all-or-nothing"
 * composite (every field must be present) for backward compatibility. An
 * array containing any `{ composite: [...] }` entry opts into the ordered
 * rules shape.
 */
function isLegacyCompositeDeclaration(
  rules: CanonicalNameRule[],
): rules is string[] {
  return rules.every((r) => typeof r === "string");
}

function compositeFieldsForLabel(fields: string[]): string {
  return `composite:${fields.join("+")}`;
}

/**
 * Try to derive a canonical_name from a single composite rule. Returns null
 * when any field is missing or empty.
 */
function tryComposite(
  entityType: string,
  fields: Record<string, unknown>,
  compositeFields: string[],
): string | null {
  const parts: string[] = [];
  for (const key of compositeFields) {
    const value = fields[key];
    if (value == null || String(value).trim() === "") return null;
    parts.push(String(value).trim());
  }
  if (parts.length === 0) return null;
  return formatCanonicalNameForStorage(
    entityType,
    `${entityType}:${parts.join("|")}`,
  );
}

/**
 * Derive a canonical_name for an entity from its fields.
 *
 * Precedence:
 * 1. Schema-declared `canonical_name_fields` — either legacy single-composite
 *    (flat `string[]`, every field required) or ordered rules
 *    (`Array<string | { composite: string[] }>`, first rule whose fields are
 *    all present wins).
 * 2. Explicit name-like fields (canonical_name, name, full_name, title, email, url).
 * 3. Stable IDs (message_id, turn_key, thread_id, external_id, etc.).
 * 4. First non-metadata string field (warns when falling back to this, and
 *    rejects common enum/status/currency tokens that would collapse unrelated
 *    entities).
 *
 * Pass the active schema via `schema` when available to use (1). Callers that
 * don't have schema context still get safe fallbacks.
 */
export function deriveCanonicalNameFromFieldsWithTrace(
  entityType: string,
  fields: Record<string, unknown>,
  schema?: Pick<SchemaDefinition, "canonical_name_fields"> | null,
): CanonicalNameDerivation {
  const rules = schema?.canonical_name_fields;
  if (rules && rules.length > 0) {
    if (isLegacyCompositeDeclaration(rules)) {
      // Legacy single-composite semantics: all fields required.
      const canonical = tryComposite(entityType, fields, rules);
      if (canonical !== null) {
        const ruleLabel = compositeFieldsForLabel(rules);
        return {
          canonicalName: canonical,
          path: [`schema:canonical_name_fields:${rules.join(",")}`],
          identityBasis: "schema_rule",
          identityRule: ruleLabel,
        };
      }
    } else {
      // Ordered precedence: first rule whose fields are all present wins.
      for (const rule of rules) {
        if (typeof rule === "string") {
          const v = fields[rule];
          if (v == null || String(v).trim() === "") continue;
          const canonical = formatCanonicalNameForStorage(
            entityType,
            `${entityType}:${String(v).trim()}`,
          );
          return {
            canonicalName: canonical,
            path: [`schema:canonical_name_fields:${rule}`],
            identityBasis: "schema_rule",
            identityRule: rule,
          };
        }
        const canonical = tryComposite(entityType, fields, rule.composite);
        if (canonical !== null) {
          const ruleLabel = compositeFieldsForLabel(rule.composite);
          return {
            canonicalName: canonical,
            path: [`schema:canonical_name_fields:${ruleLabel}`],
            identityBasis: "schema_rule",
            identityRule: ruleLabel,
          };
        }
      }
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
  let nameField: unknown = null;
  let matchedPath: ResolverPathStep | null = null;
  let matchedBasis: IdentityBasis | null = null;
  let matchedRule = "";
  for (const key of preferredNameKeys) {
    const v = fields[key as string];
    if (v != null && typeof v === "string" && v.trim() !== "") {
      nameField = v;
      matchedPath = `name_key:${key}`;
      matchedBasis = "heuristic_name";
      matchedRule = `name_key:${key}`;
      break;
    }
  }

  // 3) Prefer stable IDs over arbitrary string fields
  if (nameField == null) {
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
        matchedPath = `id_key:${idKey}`;
        matchedBasis = "heuristic_name";
        matchedRule = `id_key:${idKey}`;
        break;
      }
    }
  }

  // 4) Last resort: pick a deterministic "first" string field that is not clearly metadata.
  if (nameField == null) {
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
      matchedPath = `heuristic:${key}`;
      matchedBasis = "heuristic_fallback";
      matchedRule = `first_string_field:${key}`;
      logger.warn(
        `[ENTITY_RESOLUTION] Falling back to heuristic canonical_name for ${entityType} ` +
          `using field "${key}"; declare canonical_name_fields on the schema to make this deterministic. ` +
          `See docs/foundation/schema_agnostic_design_rules.md.`,
      );
      break;
    }
  }

  // Refuse to hash when derivation failed outright, or when the matched value
  // itself is a rejected token (e.g. caller passed `name: "unknown"` or
  // `email: "none"`). A schema-matched composite (rule 1) already returned
  // above, so reaching here means no schema key was declared for this type.
  if (nameField == null || String(nameField).trim() === "") {
    throw new CanonicalNameUnresolvedError({
      entityType,
      seenFields: Object.keys(fields),
      attemptedValue: null,
    });
  }

  const resolvedRaw = String(nameField);
  if (isRejectedCanonicalValue(resolvedRaw)) {
    throw new CanonicalNameUnresolvedError({
      entityType,
      seenFields: Object.keys(fields),
      attemptedValue: resolvedRaw,
    });
  }

  return {
    canonicalName: formatCanonicalNameForStorage(entityType, resolvedRaw),
    path: matchedPath ? [matchedPath] : ["unknown"],
    identityBasis: matchedBasis ?? "heuristic_fallback",
    identityRule: matchedRule || "unknown",
  };
}

/**
 * Backward-compatible wrapper returning just the canonical_name string.
 *
 * Throws {@link CanonicalNameUnresolvedError} when derivation fails or lands
 * on a rejected token without a schema rule-1 match.
 */
export function deriveCanonicalNameFromFields(
  entityType: string,
  fields: Record<string, unknown>,
  schema?: Pick<SchemaDefinition, "canonical_name_fields"> | null,
): string {
  return deriveCanonicalNameFromFieldsWithTrace(entityType, fields, schema).canonicalName;
}

export interface ResolveEntityOptions {
  entityType: string;
  fields: Record<string, unknown>;
  userId?: string;
  schema?: Pick<SchemaDefinition, "canonical_name_fields"> | null;
  /**
   * When false, resolve and check existence without writing to the entities
   * table. Used by `store --plan` / `--dry-run`. Defaults to true.
   */
  commit?: boolean;
  /**
   * Explicit target entity id. When provided, derivation and existence check
   * are skipped and the trace reports `action: "extended"`. Used by
   * `store --extend`.
   */
  targetId?: string;
  /**
   * When true, resolution that lands on an existing entity without an
   * explicit `targetId` or a schema `canonical_name_fields` match is refused
   * with a {@link MergeRefusedError}. Used by `store --strict` and
   * `intent: "create_new"`.
   */
  strict?: boolean;
}

export interface ResolveEntityResult {
  entityId: string;
  trace: ResolverTrace;
}

/**
 * Thrown when strict mode resolves to an existing entity without an explicit
 * target_id or a schema canonical_name_fields match.
 */
export class MergeRefusedError extends Error {
  public readonly code = "ERR_MERGE_REFUSED" as const;
  public readonly entityType: string;
  public readonly entityId: string;
  public readonly canonicalName: string;
  public readonly resolverPath: ResolverPathStep[];

  constructor(params: {
    entityType: string;
    entityId: string;
    canonicalName: string;
    resolverPath: ResolverPathStep[];
  }) {
    super(
      `Strict mode: resolution for "${params.entityType}" landed on existing ` +
        `entity ${params.entityId} (canonical_name "${params.canonicalName}") ` +
        `without an explicit target_id or a schema canonical_name_fields ` +
        `match. Pass target_id to extend the existing entity, declare ` +
        `canonical_name_fields on the schema, or drop --strict / ` +
        `intent: "create_new" to allow the merge.`,
    );
    this.name = "MergeRefusedError";
    this.entityType = params.entityType;
    this.entityId = params.entityId;
    this.canonicalName = params.canonicalName;
    this.resolverPath = params.resolverPath;
  }
}

/**
 * Resolve entity (get or create) and return a rich trace describing which
 * rule produced the canonical_name and whether the entity was created or
 * matched.
 *
 * Throws {@link CanonicalNameUnresolvedError} when derivation cannot settle
 * on a safe canonical_name. Throws {@link MergeRefusedError} when
 * `strict: true` lands on an existing entity without a deterministic
 * identity rule.
 */
export async function resolveEntityWithTrace(
  options: ResolveEntityOptions,
): Promise<ResolveEntityResult> {
  const { entityType, userId, fields, commit = true, targetId, strict } = options;

  // Extend path: caller asserts the target entity_id. Skip derivation and the
  // existence check so repeated observations land on the same row regardless
  // of canonical_name evolution.
  if (targetId) {
    return {
      entityId: targetId,
      trace: {
        entityType,
        canonicalName: "",
        path: [`target_id:${targetId}`],
        identityBasis: "target_id",
        identityRule: "",
        action: commit ? "extended" : "extended",
      },
    };
  }

  let schema = options.schema;
  if (schema === undefined) {
    // Load the active schema so canonical_name derivation is schema-driven.
    // Failures here are non-fatal for derivation itself — we still throw
    // CanonicalNameUnresolvedError downstream if no rule matches.
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

  const derivation = deriveCanonicalNameFromFieldsWithTrace(
    entityType,
    fields,
    schema,
  );
  const canonicalName = derivation.canonicalName;
  const path: ResolverPathStep[] = [...derivation.path];
  const identityBasis = derivation.identityBasis;
  const identityRule = derivation.identityRule;

  const entityId = generateEntityId(entityType, canonicalName);

  const { data: existing } = await db
    .from("entities")
    .select("*")
    .eq("id", entityId)
    .maybeSingle();

  if (existing) {
    // Strict mode refuses to merge into an existing entity unless the
    // resolution came from a schema-declared composite identity rule.
    const schemaDeterministic = path.some((step) =>
      step.startsWith("schema:canonical_name_fields"),
    );
    if (strict && !schemaDeterministic) {
      throw new MergeRefusedError({
        entityType,
        entityId,
        canonicalName,
        resolverPath: path,
      });
    }

    if (commit) {
      // Default test user ID that should be updated to actual user_id
      const defaultTestUserId = "00000000-0000-0000-0000-000000000000";
      const shouldUpdateUserId =
        userId &&
        (existing.user_id === null || existing.user_id === defaultTestUserId);

      if (shouldUpdateUserId) {
        const { error: updateError } = await db
          .from("entities")
          .update({ user_id: userId, updated_at: new Date().toISOString() })
          .eq("id", entityId);

        if (updateError) {
          logger.warn(
            `Failed to update user_id for existing entity ${entityId}:`,
            updateError.message,
          );
        } else {
          logger.info(
            `Updated user_id for entity ${entityId} from ${existing.user_id} to ${userId}`,
          );
        }
      } else if (existing.user_id && userId && existing.user_id !== userId) {
        // Entity already has a different user_id - log warning but don't change it
        // This preserves data integrity (entity belongs to another user)
        logger.warn(
          `Entity ${entityId} already has user_id ${existing.user_id}, ` +
            `but resolution requested with user_id ${userId}. Keeping existing user_id.`,
        );
      }
    }

    return {
      entityId,
      trace: {
        entityType,
        canonicalName,
        path: [...path, "existing_row:matched"],
        identityBasis,
        identityRule,
        action: commit ? "matched_existing" : "would_match_existing",
      },
    };
  }

  if (commit) {
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
  }

  return {
    entityId,
    trace: {
      entityType,
      canonicalName,
      path: [...path, "existing_row:none"],
      identityBasis,
      identityRule,
      action: commit ? "created" : "would_create",
    },
  };
}

/**
 * Resolve entity (get or create). Backward-compatible wrapper returning just
 * the entity_id. New callers should prefer {@link resolveEntityWithTrace}.
 *
 * @param options - Entity resolution options
 * @param options.entityType - Type of entity (e.g., "person", "company")
 * @param options.fields - Entity fields containing identifying information
 * @param options.userId - User ID for user-scoped resolution (optional for backwards compatibility)
 */
export async function resolveEntity(
  options:
    | ResolveEntityOptions
    | string,
  rawValue?: string,
): Promise<string> {
  // Support old positional signature for backwards compatibility. This path
  // bypasses derivation (caller provides the raw canonical value directly)
  // so we cannot throw CanonicalNameUnresolvedError here.
  if (typeof options === "string") {
    const entityType = options;
    const canonicalName = formatCanonicalNameForStorage(entityType, rawValue || "");
    const entityId = generateEntityId(entityType, canonicalName);

    const { data: existing } = await db
      .from("entities")
      .select("*")
      .eq("id", entityId)
      .maybeSingle();

    if (existing) {
      return entityId;
    }

    const now = new Date().toISOString();
    const { error } = await db
      .from("entities")
      .insert({
        id: entityId,
        entity_type: entityType,
        canonical_name: canonicalName,
        aliases: [],
        user_id: null,
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

  return (await resolveEntityWithTrace(options)).entityId;
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
