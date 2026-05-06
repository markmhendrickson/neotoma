/**
 * Schema Registry Service for Schema Registry Service (FU-057)
 *
 * Manages config-driven entity schemas, versions, and merge policies.
 */

import { db } from "../db.js";
import { enforceEntityTypeGuards } from "./entity_type_guard.js";
import {
  prepareEntitySnapshotWithEmbedding,
  upsertEntitySnapshotWithEmbedding,
} from "./entity_snapshot_embedding.js";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function logSchemaRegistryInfo(message: string): void {
  process.stderr.write(`${message}\n`);
}

async function applyBuiltInSchemaIdentityDefaults(
  entry: SchemaRegistryEntry | null,
): Promise<SchemaRegistryEntry | null> {
  if (!entry) return entry;
  const { ENTITY_SCHEMAS } = await import("./schema_definitions.js");
  const builtIn = ENTITY_SCHEMAS[entry.entity_type];
  const builtInDefinition = builtIn?.schema_definition;
  if (!builtInDefinition) return entry;

  const schemaDefinition = { ...entry.schema_definition };
  let changed = false;
  if (
    !schemaDefinition.canonical_name_fields &&
    builtInDefinition.canonical_name_fields
  ) {
    schemaDefinition.canonical_name_fields = builtInDefinition.canonical_name_fields;
    changed = true;
  }
  if (
    !schemaDefinition.name_collision_policy &&
    builtInDefinition.name_collision_policy
  ) {
    schemaDefinition.name_collision_policy = builtInDefinition.name_collision_policy;
    changed = true;
  }
  if (!schemaDefinition.identity_opt_out && builtInDefinition.identity_opt_out) {
    schemaDefinition.identity_opt_out = builtInDefinition.identity_opt_out;
    changed = true;
  }

  return changed ? { ...entry, schema_definition: schemaDefinition } : entry;
}

export interface ConverterDefinition {
  from: "number" | "string" | "boolean" | "array" | "object";
  to: "string" | "number" | "date" | "boolean" | "array" | "object";
  function: string; // Converter function name
  deterministic: boolean; // Must be true for MVP
}

export interface FieldDefinition {
  type: "string" | "number" | "date" | "boolean" | "array" | "object";
  required?: boolean;
  validator?: string;
  preserveCase?: boolean; // Preserve case for this field during canonicalization
  description?: string; // Field description
  converters?: ConverterDefinition[]; // Field type converters
}

/**
 * A single identity rule used to derive an entity's canonical_name.
 *
 * - `string` — single-field rule. Matches when that field is present and
 *   non-empty on the payload. Only valid inside an ordered rule list that
 *   includes at least one `{ composite: [...] }` entry (otherwise the whole
 *   array is treated as a legacy single-composite declaration for
 *   backward-compat; see `SchemaDefinition.canonical_name_fields`).
 * - `{ composite: string[] }` — composite rule. Matches only when every
 *   declared field is present and non-empty. Used for both legacy semantics
 *   (a flat `string[]` array) and the explicit object form in ordered lists.
 */
export type CanonicalNameRule = string | { composite: string[] };

/**
 * Declarative rules that drive per-type behavior from the schema instead of
 * hardcoded branches. See `docs/foundation/schema_agnostic_design_rules.md`.
 */
export interface SchemaDefinition {
  fields: Record<string, FieldDefinition>;

  /**
   * Identity rules used to compose this entity's canonical_name. Two accepted
   * shapes:
   *
   * 1. Legacy single composite — `string[]`. Every field must be present and
   *    non-empty; otherwise falls through to the heuristic. Joined with "|"
   *    and prefixed by entity_type, e.g. `receipt:2025-08-06|Ecoveritas|7.45`.
   *    All existing declarations keep this meaning.
   *
   * 2. Ordered precedence rules — `Array<string | { composite: string[] }>`.
   *    An array that contains at least one `{ composite: [...] }` entry is
   *    interpreted as ordered rules: each string is a single-field rule, each
   *    `composite` is an all-required rule. The resolver walks the list and
   *    uses the first rule whose fields are all present. A schema that needs
   *    ordered single-field semantics for every rule should use the
   *    `{ composite: [...] }` form for at least one rule to opt in
   *    unambiguously (e.g. `[{composite:["tax_id"]}, "domain", "legal_name"]`).
   *
   * When omitted, canonical_name falls back to generic heuristics.
   */
  canonical_name_fields?: CanonicalNameRule[];

  /**
   * Fields that carry real event timestamps and should emit timeline events.
   * When present, only these fields drive timeline emission for this type
   * (plus the small global set of always-temporal fields like `start_date`,
   * `end_date`, `due_date`). When omitted, falls back to the permissive
   * heuristic detector but logs a warning for unseeded types.
   */
  temporal_fields?: Array<{
    field: string;
    event_type?: string;
  }>;

  /**
   * Fields whose string values are references to other entities. Used to
   * auto-create REFERS_TO edges at store time.
   */
  reference_fields?: Array<{
    field: string;
    target_entity_type: string;
    relationship_type?: string;
  }>;

  /**
   * Alternate entity_type names that should resolve to this schema. Used by
   * the duplicate-type detector to bias toward the canonical singular type.
   */
  aliases?: string[];

  /**
   * Explicit opt-out from `canonical_name_fields` (R2). When set, the schema
   * declares that it has no strong identifiers and intentionally resolves
   * via the heuristic canonical-name derivation. This is loud by design:
   * opt-outs appear in startup logs and may be counted in R4 basis stats so
   * that regressions are visible.
   *
   * Accepted value: `"heuristic_canonical_name"`. Reserved for bookkeeping
   * types (e.g. `agent_message`, `conversation`, `relationship`) and
   * schemas whose identity legitimately cannot be declared.
   *
   * At schema registration, a schema MUST declare either
   * `canonical_name_fields` or `identity_opt_out`.
   */
  identity_opt_out?: "heuristic_canonical_name";

  /**
   * Declarative policy for what the resolver should do when
   * {@link resolveEntityWithTrace} lands on an existing row via a path
   * that is NOT a schema-declared `canonical_name_fields` match (i.e.
   * `identityBasis !== "schema_rule"` and `!targetId`).
   *
   * - `"merge"` (default) — existing behavior: return the existing entity.
   *   Preserves backward compatibility for legacy bookkeeping types and any
   *   payload that intentionally wants heuristic de-duplication.
   * - `"warn"` — return the existing entity and append a non-fatal warning
   *   to the resolver trace (`heuristic_merge:*`). Intended for observability
   *   while migrating a schema toward `reject`.
   * - `"reject"` — throw {@link MergeRefusedError} so the structured-store
   *   pipeline surfaces `ERR_STORE_RESOLUTION_FAILED` per-observation. Use on
   *   schemas where heuristic title/name collisions would silently merge
   *   unrelated sessions (e.g. `conversation`, `conversation_message`).
   *
   * The policy composes with `strict: true` on the per-call options: `strict`
   * refuses ANY non-schema heuristic merge regardless of schema policy;
   * `reject` makes that refusal the default for that schema. `warn` is ignored
   * under `strict: true` (the strict refusal wins).
   *
   * When omitted, defaults to `"merge"` so every existing schema keeps its
   * current runtime behavior. Declaring this field is a conscious upgrade:
   * document the rationale in the schema snapshot README.
   */
  name_collision_policy?: "merge" | "warn" | "reject";

  /**
   * Fields compared by the post-hoc duplicate detector (R5). When omitted,
   * the detector falls back to comparing canonical_name only, which is the
   * weakest possible signal. Declaring additional fields (e.g. ["email"],
   * ["name", "employer"]) produces richer candidate pairs without widening
   * the identity hash. The detector is read-only and never auto-merges; it
   * surfaces candidate pairs so an operator or agent can invoke
   * `merge_entities`.
   */
  duplicate_detection_fields?: string[];

  /**
   * Similarity threshold (0..1) at which the duplicate detector flags a
   * candidate pair for this schema. Defaults to 0.85 when omitted. Higher
   * values mean fewer, more conservative candidates. See R5 in
   * docs/subsystems/entity_merge.md.
   */
  duplicate_detection_threshold?: number;
}

/** Known opt-out tokens for {@link SchemaDefinition.identity_opt_out}. */
const VALID_IDENTITY_OPT_OUT_TOKENS = new Set<string>([
  "heuristic_canonical_name",
]);

/**
 * Valid values for the `observation_source` field on observations (kept in
 * sync with the Zod enum in `src/shared/action_schemas.ts` and the OpenAPI
 * `Observation.observation_source` enum). Declared here so the schema
 * registry can validate `observation_source_priority` without importing
 * the Zod module and creating a cycle.
 */
export const OBSERVATION_SOURCE_RANK_VALUES = [
  "sensor",
  "llm_summary",
  "workflow_state",
  "human",
  "import",
] as const;

export type ObservationSourceRankValue =
  (typeof OBSERVATION_SOURCE_RANK_VALUES)[number];

/**
 * Default ranking applied by the reducer when a `source_priority` tie
 * remains and the schema does not declare its own
 * `observation_source_priority`. Sensors (ground-truth emissions)
 * outrank deterministic workflow transitions, which outrank LLM
 * summaries, which outrank direct human writes (lower ranked because
 * humans should use {@link ../services/correction.ts} for authoritative
 * overrides), which outrank batch imports.
 */
export const DEFAULT_OBSERVATION_SOURCE_PRIORITY: readonly ObservationSourceRankValue[] =
  ["sensor", "workflow_state", "llm_summary", "human", "import"] as const;

export interface ReducerConfig {
  merge_policies: Record<
    string,
    {
      strategy:
        | "last_write"
        | "highest_priority"
        | "most_specific"
        | "merge_array";
      tie_breaker?: "observed_at" | "source_priority";
    }
  >;
  /**
   * Ordered ranking of `observation_source` values, highest-priority
   * first. Applied by {@link ../reducers/observation_reducer.ts} as a
   * tie-breaker *after* numeric `source_priority` (and, for the
   * `most_specific` strategy, `specificity_score`), before the final
   * `observed_at` / id tie-break. Schema-agnostic: any schema may
   * override the default order by declaring this field; unknown enum
   * values sort last. When omitted, the reducer uses
   * {@link DEFAULT_OBSERVATION_SOURCE_PRIORITY}.
   */
  observation_source_priority?: readonly ObservationSourceRankValue[];
}

export interface IconMetadata {
  icon_type: "lucide" | "svg";
  icon_name: string; // Lucide icon name or 'custom'
  icon_svg?: string; // SVG code for custom icons
  confidence?: number; // Match confidence (0-1)
  generated_at: string; // ISO timestamp
}

export type GuestAccessPolicyMode =
  | "closed"
  | "read_only"
  | "submit_only"
  | "submitter_scoped"
  | "open";

export interface SchemaMetadata {
  label?: string;
  description?: string;
  category?: "finance" | "productivity" | "knowledge" | "health" | "media" | "agent_runtime";
  icon?: IconMetadata;
  test?: boolean; // Mark schemas created for testing
  test_marked_at?: string; // ISO timestamp when test schema was marked
  guest_access_policy?: GuestAccessPolicyMode;
}

export interface SchemaRegistryEntry {
  id: string;
  entity_type: string;
  schema_version: string;
  schema_definition: SchemaDefinition;
  reducer_config: ReducerConfig;
  active: boolean;
  created_at: string;
  user_id?: string | null;
  scope?: "global" | "user";
  metadata?: SchemaMetadata;
}

export async function loadCodeDefinedSchemaEntry(
  entityType: string,
): Promise<SchemaRegistryEntry | null> {
  const { ENTITY_SCHEMAS } = await import("./schema_definitions.js");
  const normalized = normalizeEntityTypeForSchema(entityType);
  const schema = ENTITY_SCHEMAS[entityType] ?? ENTITY_SCHEMAS[normalized];
  if (!schema) return null;

  return {
    id: "",
    entity_type: schema.entity_type,
    schema_version: schema.schema_version,
    schema_definition: schema.schema_definition,
    reducer_config: schema.reducer_config,
    active: true,
    created_at: new Date(0).toISOString(),
    user_id: null,
    scope: "global",
    metadata: schema.metadata ?? {},
  };
}

/**
 * R4: Shape returned by {@link deriveRequiredIdentityFields}. Captures the
 * minimum payload keys a caller must supply on `store_structured` for the
 * resolver to match via `schema_rule` (identity_basis) instead of the
 * heuristic path. Derived purely from the schema registry — no per-type
 * branching anywhere in the consuming code paths.
 */
export interface RequiredIdentityFields {
  /** Schema entity_type this applies to. */
  entityType: string;
  /**
   * `true` when the schema declares `name_collision_policy: "reject"` — at
   * least one of `anyOfFields` (or every field in one `compositeFields` rule)
   * MUST be present on the payload or the write will throw
   * `ERR_STORE_RESOLUTION_FAILED` / `ERR_MERGE_REFUSED`.
   */
  required: boolean;
  /**
   * Schema-declared single-field canonical rules (e.g. `conversation_id`,
   * `turn_key`). Supplying any one of these satisfies identity on its own.
   */
  anyOfFields: string[];
  /**
   * Schema-declared composite canonical rules. Every field in one composite
   * group must be present to satisfy that rule.
   */
  compositeFields: string[][];
}

/**
 * R4: derive the minimum set of identity-bearing payload keys a caller must
 * supply for a given entity_type, straight out of the schema registry. Used
 * by `store_structured` to populate structured `issues[].hint` on
 * `ERR_STORE_RESOLUTION_FAILED` responses and by `tool_definitions.ts` to
 * surface the list in the MCP tool description. Returns null when the entity
 * type has no registered schema (unseeded — heuristic fallback applies).
 *
 * Schema-agnostic by construction: all behavior is driven by
 * `canonical_name_fields` + `name_collision_policy` on the schema. Adding a
 * new reject-policy schema automatically extends the contract.
 */
export async function deriveRequiredIdentityFields(
  entityType: string,
  userId?: string | null,
): Promise<RequiredIdentityFields | null> {
  const normalized = normalizeEntityTypeForSchema(entityType);
  const entry = await schemaRegistry.loadActiveSchema(normalized, userId ?? undefined);
  // R1/R2 safety net: same reasoning as the resolver's schema-load fallback
  // in `src/services/entity_resolution.ts` — when the registry has no row for
  // this entity_type (fresh DB, test fixture, or never-registered type) the
  // code-defined default in `ENTITY_SCHEMAS` still carries the identity
  // contract, so the caller-facing hint must come from there instead of
  // silently returning null.
  let def = entry?.schema_definition;
  if (!def) {
    try {
      const { ENTITY_SCHEMAS } = await import("./schema_definitions.js");
      const codeSchema = ENTITY_SCHEMAS[normalized] ?? ENTITY_SCHEMAS[entityType];
      if (codeSchema) {
        def = codeSchema.schema_definition;
      }
    } catch {
      // defensive
    }
  }
  if (!def) return null;
  const rules = def.canonical_name_fields ?? [];
  const anyOfFields: string[] = [];
  const compositeFields: string[][] = [];
  for (const rule of rules) {
    if (typeof rule === "string") {
      anyOfFields.push(rule);
    } else if (rule && typeof rule === "object" && Array.isArray(rule.composite)) {
      compositeFields.push([...rule.composite]);
    }
  }
  return {
    entityType: normalized,
    required: def.name_collision_policy === "reject",
    anyOfFields,
    compositeFields,
  };
}

/** Normalize entity type for schema registry: snake_case, safe characters, max length */
export function normalizeEntityTypeForSchema(raw: string): string {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "") || "generic";
  return normalized.slice(0, 64);
}

/** Infer schema field type from a value (for schema-from-extraction). */
function inferFieldType(value: unknown): "string" | "number" | "date" | "boolean" | "array" | "object" {
  if (value === null || value === undefined) return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "string") {
    const s = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s) || !Number.isNaN(Date.parse(s))) return "date";
    return "string";
  }
  return "string";
}

/**
 * Build schema definition and reducer config from extracted entity data.
 * Used when the entity type has no known schema so a user-scoped schema can be created.
 */
export function buildSchemaFromExtractedFields(
  entityData: Record<string, unknown>
): { schema_definition: SchemaDefinition; reducer_config: ReducerConfig } {
  const fields: Record<string, FieldDefinition> = {
    schema_version: { type: "string", required: true },
  };
  const merge_policies: ReducerConfig["merge_policies"] = {};

  const skipKeys = new Set(["entity_type", "type", "schema_version"]);
  for (const [key, value] of Object.entries(entityData)) {
    if (skipKeys.has(key)) continue;
    const safeKey = key
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
    if (!safeKey) continue;
    const fieldType = inferFieldType(value);
    fields[safeKey] = { type: fieldType, required: false };
    merge_policies[safeKey] = { strategy: "last_write" };
  }

  return {
    schema_definition: { fields },
    reducer_config: { merge_policies },
  };
}

export class SchemaRegistryService {
  /**
   * Register a new schema version
   */
  async register(config: {
    entity_type: string;
    schema_version: string;
    schema_definition: SchemaDefinition;
    reducer_config: ReducerConfig;
    user_id?: string;
    user_specific?: boolean;
    activate?: boolean;
    metadata?: SchemaMetadata;
    force?: boolean;
  }): Promise<SchemaRegistryEntry> {
    // Entity-type naming guards (forbidden-pattern + plural). Warns in dev,
    // throws in production unless force: true.
    enforceEntityTypeGuards(config.entity_type, {
      force: config.force,
      context: "register_schema",
    });

    // Validate schema definition
    this.validateSchemaDefinition(config.schema_definition);

    // Validate reducer config
    this.validateReducerConfig(config.reducer_config, config.schema_definition);

    const scope = config.user_specific ? "user" : "global";

    const { data, error } = await db
      .from("schema_registry")
      .insert({
        entity_type: config.entity_type,
        schema_version: config.schema_version,
        schema_definition: config.schema_definition,
        reducer_config: config.reducer_config,
        active: config.activate || false, // New schemas start inactive unless specified
        user_id: config.user_specific ? (config.user_id || null) : null,
        scope: scope,
        metadata: config.metadata || {},
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to register schema: ${error.message}`);
    }

    const registeredSchema = data as SchemaRegistryEntry;

    // Auto-generate icon if not provided (non-blocking)
    this.generateIconAsync(registeredSchema.entity_type, config.metadata);

    // Automatically export schema snapshots (non-blocking)
    this.exportSnapshotsAsync();

    return registeredSchema;
  }

  /**
   * Load active entity schema for entity type
   * Supports user-specific schemas: tries user-specific first, then falls back to global
   */
  async loadActiveSchema(
    entityType: string,
    userId?: string,
  ): Promise<SchemaRegistryEntry | null> {
    // 1. Try user-specific schema first if userId provided
    if (userId) {
      const userSchema = await this.loadUserSpecificSchema(entityType, userId);
      if (userSchema) {
        return await applyBuiltInSchemaIdentityDefaults(userSchema);
      }
    }

    // 2. Fall back to global schema
    return await applyBuiltInSchemaIdentityDefaults(
      await this.loadGlobalSchema(entityType),
    );
  }

  /**
   * List all active schemas available for refinement/candidates: global schemas
   * plus user-scoped schemas when userId is provided. Use when scoring against
   * a dynamic set of types (e.g. field-based type refinement).
   */
  async listActiveSchemas(userId?: string): Promise<SchemaRegistryEntry[]> {
    const base = db
      .from("schema_registry")
      .select("id, entity_type, schema_version, schema_definition, reducer_config, active, created_at, user_id, scope, metadata")
      .eq("active", true);
    const query = userId
      ? base.or(`scope.eq.global,and(scope.eq.user,user_id.eq.${userId})`)
      : base.eq("scope", "global");
    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to list active schemas: ${error.message}`);
    }
    return (data ?? []) as SchemaRegistryEntry[];
  }

  /**
   * Emit a one-time startup log of every active schema that has opted out
   * of strong identity via {@link SchemaDefinition.identity_opt_out} (R2).
   *
   * Opt-outs are loud by design: if a schema that should have an identifier
   * accidentally landed on the heuristic path, the regression is visible in
   * server/CLI boot logs before any writes happen.
   *
   * Returns the list of opt-out entity_types so callers (tests, CLIs) can
   * assert or display them. Set `silent: true` to compute the list without
   * writing to stderr (used by the CLI when rendering stats tables).
   */
  async logIdentityOptOutsAtStartup(options?: {
    userId?: string;
    silent?: boolean;
  }): Promise<{
    opt_outs: Array<{ entity_type: string; reason: string }>;
  }> {
    const schemas = await this.listActiveSchemas(options?.userId);
    const optOuts: Array<{ entity_type: string; reason: string }> = [];
    for (const s of schemas) {
      const def = s.schema_definition;
      if (def?.identity_opt_out) {
        optOuts.push({
          entity_type: s.entity_type,
          reason: def.identity_opt_out,
        });
      }
    }
    optOuts.sort((a, b) => a.entity_type.localeCompare(b.entity_type));
    if (!options?.silent && optOuts.length > 0) {
      const label = optOuts.length === 1 ? "1 schema" : `${optOuts.length} schemas`;
      logSchemaRegistryInfo(
        `ℹ️  [SCHEMA_REGISTRY] R2: ${label} opted out of canonical_name_fields ` +
          `(identity_opt_out): ${optOuts.map((o) => o.entity_type).join(", ")}. ` +
          "These resolve via the heuristic canonical_name path. See " +
          "docs/foundation/schema_agnostic_design_rules.md.",
      );
    }
    return { opt_outs: optOuts };
  }

  /**
   * Load user-specific schema for entity type
   */
  async loadUserSpecificSchema(
    entityType: string,
    userId: string,
  ): Promise<SchemaRegistryEntry | null> {
    const { data, error } = await db
      .from("schema_registry")
      .select("*")
      .eq("entity_type", entityType)
      .eq("user_id", userId)
      .eq("scope", "user")
      .eq("active", true)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // Not found
        return null;
      }
      throw new Error(
        `Failed to load user-specific schema: ${error.message}`,
      );
    }

    return data as SchemaRegistryEntry;
  }

  /**
   * Load global schema for entity type
   */
  async loadGlobalSchema(
    entityType: string,
  ): Promise<SchemaRegistryEntry | null> {
    const { data, error } = await db
      .from("schema_registry")
      .select("*")
      .eq("entity_type", entityType)
      .eq("scope", "global")
      .eq("active", true)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // Not found
        return null;
      }
      throw new Error(`Failed to load global schema: ${error.message}`);
    }

    return data as SchemaRegistryEntry;
  }

  /**
   * Ensure a schema exists for an extracted entity type; if not, create one from extracted fields.
   * Registers a user-scoped schema so observations can be created for unknown entity types.
   * Returns the schema to use (existing or newly created), or null if creation is disabled or fails.
   */
  async ensureSchemaForExtractedEntity(
    entityType: string,
    entityData: Record<string, unknown>,
    userId: string,
    options?: { create_if_missing?: boolean }
  ): Promise<SchemaRegistryEntry | null> {
    const createIfMissing = options?.create_if_missing !== false;
    const normalizedType = normalizeEntityTypeForSchema(entityType);
    if (!normalizedType) return null;

    const schema = await this.loadActiveSchema(normalizedType, userId);
    if (schema) return schema;

    if (!createIfMissing) return null;

    const { schema_definition, reducer_config } = buildSchemaFromExtractedFields(entityData);
    if (Object.keys(schema_definition.fields).length <= 1) {
      return null;
    }

    try {
      const registered = await this.register({
        entity_type: normalizedType,
        schema_version: "1.0",
        schema_definition,
        reducer_config,
        user_id: userId,
        user_specific: true,
        activate: true,
        metadata: {
          label: normalizedType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          description: `User-created schema from extraction (entity type: ${entityType})`,
        },
      });
      return registered;
    } catch {
      return null;
    }
  }

  /**
   * Incrementally update schema by adding fields
   *
   * IMPORTANT: After activation, the new schema immediately applies to all new data.
   * The interpretation process automatically uses loadActiveSchema(), so new observations
   * will use the updated schema fields immediately. migrate_existing is only for
   * backfilling historical data stored before the schema update.
   */
  async updateSchemaIncremental(options: {
    entity_type: string;
    fields_to_add?: Array<{
      field_name: string;
      field_type: "string" | "number" | "date" | "boolean" | "array" | "object";
      required?: boolean;
      reducer_strategy?:
        | "last_write"
        | "highest_priority"
        | "most_specific"
        | "merge_array";
    }>;
    fields_to_remove?: string[];
    converters_to_add?: Array<{
      field_name: string;
      converter: {
        from: "number" | "string" | "boolean" | "array" | "object";
        to: "string" | "number" | "date" | "boolean" | "array" | "object";
        function: string;
        deterministic: boolean;
      };
    }>;
    schema_version?: string;
    user_specific?: boolean;
    user_id?: string;
    migrate_existing?: boolean; // Only for backfilling historical data
    activate?: boolean; // Default: true - activate immediately so new data uses updated schema
    force?: boolean;
  }): Promise<SchemaRegistryEntry> {
    // Entity-type naming guards (forbidden-pattern + plural).
    enforceEntityTypeGuards(options.entity_type, {
      force: options.force,
      context: "update_schema_incremental",
    });

    const activateSchema = options.activate !== false; // Default to true

    // 1. Load current active schema (user-specific or global), then fall back to
    // code-defined ENTITY_SCHEMAS so incremental updates can materialize the
    // first registry row for built-in types (e.g. conversation_message).
    let currentSchema = await this.loadActiveSchema(
      options.entity_type,
      options.user_id,
    );
    if (!currentSchema) {
      const normalized = normalizeEntityTypeForSchema(options.entity_type);
      const codeDefined =
        (await loadCodeDefinedSchemaEntry(options.entity_type)) ??
        (await loadCodeDefinedSchemaEntry(normalized));
      if (!codeDefined) {
        throw new Error(
          `No active schema found for entity type: ${options.entity_type}`,
        );
      }
      currentSchema = codeDefined;
      logSchemaRegistryInfo(
        `[SCHEMA_REGISTRY] Incremental update: no active registry row for ${options.entity_type}; ` +
          `using code-defined baseline v${codeDefined.schema_version}`,
      );
    }

    // 2. Determine change type and increment version
    const changeType = this.determineChangeType({
      fields_to_add: options.fields_to_add,
      fields_to_remove: options.fields_to_remove,
      converters_to_add: options.converters_to_add,
    });
    const newVersion =
      options.schema_version ||
      this.incrementVersion(currentSchema.schema_version, changeType);

    // 3. Merge fields (add new fields to existing schema)
    const mergedFields = {
      ...currentSchema.schema_definition.fields,
    };

    // Add new fields
    for (const field of options.fields_to_add || []) {
      // Skip if field already exists
      if (mergedFields[field.field_name]) {
        logSchemaRegistryInfo(
          `[SCHEMA_REGISTRY] Field ${field.field_name} already exists in schema, skipping`,
        );
        continue;
      }

      mergedFields[field.field_name] = {
        type: field.field_type,
        required: field.required || false,
      };
    }

    // Remove fields (schema-projection: data preserved in observations, just
    // excluded from future snapshots via reducer projection filtering)
    for (const fieldName of options.fields_to_remove || []) {
      if (!mergedFields[fieldName]) {
        logSchemaRegistryInfo(
          `[SCHEMA_REGISTRY] Field ${fieldName} not found in schema, skipping removal`,
        );
        continue;
      }
      delete mergedFields[fieldName];
    }

    // Validate that at least one field remains after removal
    if (Object.keys(mergedFields).length === 0) {
      throw new Error(
        `Cannot remove all fields from schema for entity type: ${options.entity_type}. At least one field must remain.`,
      );
    }

    // 4. Merge reducer configs
    const mergedReducerPolicies = {
      ...currentSchema.reducer_config.merge_policies,
    };

    // Add reducer policies for new fields
    for (const field of options.fields_to_add || []) {
      if (!mergedReducerPolicies[field.field_name]) {
        mergedReducerPolicies[field.field_name] = {
          strategy: field.reducer_strategy || "last_write",
          tie_breaker: "observed_at",
        };
      }
    }

    // Remove reducer policies for removed fields
    for (const fieldName of options.fields_to_remove || []) {
      delete mergedReducerPolicies[fieldName];
    }

    // Handle default user ID: convert to undefined for optional parameter
    const defaultUserId = "00000000-0000-0000-0000-000000000000";
    const userId = options.user_id && options.user_id !== defaultUserId 
      ? options.user_id 
      : undefined;

    // Preserve schema-level declarations that aren't field-maps (canonical_name_fields,
    // temporal_fields, reference_fields, aliases) across incremental updates.
    // Prune any removed field names from these lists so they don't reference
    // deleted fields after a major version bump.
    const preserved = { ...currentSchema.schema_definition };
    delete (preserved as { fields?: unknown }).fields;

    const removalSet = new Set(options.fields_to_remove || []);
    if (preserved.canonical_name_fields) {
      const prunedRules = preserved.canonical_name_fields
        .map((rule) => {
          if (typeof rule === "string") {
            return removalSet.has(rule) ? null : rule;
          }
          const remaining = rule.composite.filter((f) => !removalSet.has(f));
          if (remaining.length === 0) return null;
          if (remaining.length === rule.composite.length) return rule;
          return { composite: remaining };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      if (prunedRules.length === 0) {
        delete preserved.canonical_name_fields;
      } else {
        preserved.canonical_name_fields = prunedRules;
      }
    }
    if (preserved.temporal_fields) {
      preserved.temporal_fields = preserved.temporal_fields.filter(
        (t) => !removalSet.has(t.field),
      );
      if (preserved.temporal_fields.length === 0) {
        delete preserved.temporal_fields;
      }
    }
    if (preserved.reference_fields) {
      preserved.reference_fields = preserved.reference_fields.filter(
        (r) => !removalSet.has(r.field),
      );
      if (preserved.reference_fields.length === 0) {
        delete preserved.reference_fields;
      }
    }

    // 5. Register new version (start inactive, we'll activate separately if needed)
    const newSchema = await this.register({
      entity_type: options.entity_type,
      schema_version: newVersion,
      schema_definition: { ...preserved, fields: mergedFields },
      reducer_config: { merge_policies: mergedReducerPolicies },
      user_id: userId,
      user_specific: options.user_specific,
      activate: false, // Register as inactive first
    });

    // 6. Activate new version if requested (this deactivates other versions)
    if (activateSchema) {
      await this.activate(options.entity_type, newVersion);
    }

    logSchemaRegistryInfo(
      `[SCHEMA_REGISTRY] Incrementally updated schema for ${options.entity_type} to version ${newVersion}`,
    );

    // 7. Migrate raw_fragments if requested (historical data backfill only)
    if (options.migrate_existing) {
      logSchemaRegistryInfo(
        `[SCHEMA_REGISTRY] Migrating existing raw_fragments for ${options.entity_type}`,
      );
      const fieldNamesToMigrate = [
        ...(options.fields_to_add?.map((f) => f.field_name) || []),
        ...(options.converters_to_add?.map((c) => c.field_name) || []),
      ];
      
      if (fieldNamesToMigrate.length > 0) {
        await this.migrateRawFragmentsToObservations({
          entity_type: options.entity_type,
          field_names: fieldNamesToMigrate,
          user_id: options.user_id,
        });
      }
    }

    return newSchema;
  }

  /**
   * Migrate raw_fragments to observations for updated schema
   * This is for backfilling historical data only - new data automatically uses the updated schema
   */
  async migrateRawFragmentsToObservations(options: {
    entity_type: string;
    field_names: string[];
    user_id?: string;
  }): Promise<{ migrated_count: number }> {
    const BATCH_SIZE = 100; // Smaller batch size for safety
    let totalMigrated = 0;

    logSchemaRegistryInfo(
      `[SCHEMA_REGISTRY] Starting migration for fields: ${options.field_names.join(", ")}`,
    );

    // For each field, get raw_fragments and create observations
    for (const fieldName of options.field_names) {
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        // Get batch of raw_fragments
        let query = db
          .from("raw_fragments")
          .select("*")
          .eq("entity_type", options.entity_type)
          .eq("fragment_key", fieldName);

        // Handle user_id properly: check both default UUID and null
        // NOTE: .or() must be called before .range()
        const defaultUserId = "00000000-0000-0000-0000-000000000000";
        if (options.user_id) {
          if (options.user_id === defaultUserId) {
            query = query.or(`user_id.eq.${defaultUserId},user_id.is.null`);
          } else {
            query = query.eq("user_id", options.user_id);
          }
        } else {
          query = query.or(`user_id.is.null,user_id.eq.${defaultUserId}`);
        }

        // Apply range after or() filter
        query = query.range(offset, offset + BATCH_SIZE - 1);

        const { data: fragments, error: fetchError } = await query;

        if (fetchError || !fragments || fragments.length === 0) {
          hasMore = false;
          continue; // No more fragments to migrate
        }

        logSchemaRegistryInfo(
          `[SCHEMA_REGISTRY] Processing batch of ${fragments.length} fragments for field ${fieldName}`,
        );

        // Group fragments by (source_id, interpretation_id) to find entities
        // Fragments from the same source+interpretation belong to the same entity
        const fragmentGroups = new Map<string, typeof fragments>();
        for (const fragment of fragments) {
          const groupKey = `${fragment.source_id || "null"}:${fragment.interpretation_id || "null"}`;
          if (!fragmentGroups.has(groupKey)) {
            fragmentGroups.set(groupKey, []);
          }
          fragmentGroups.get(groupKey)!.push(fragment);
        }

        // Process each group (represents one entity)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const [_groupKey, groupFragments] of fragmentGroups.entries()) {
          if (groupFragments.length === 0) continue;

          const firstFragment = groupFragments[0];
          const sourceId = firstFragment.source_id;
          const interpretationId = firstFragment.interpretation_id;

          // Prefer explicit fragment ownership. Legacy fragments only carry
          // source_id + entity_type, which is ambiguous when one source creates
          // multiple entities of the same type.
          let entityId: string | null =
            typeof firstFragment.entity_id === "string" ? firstFragment.entity_id : null;
          if (!entityId && sourceId) {
            let obsQuery = db
              .from("observations")
              .select("entity_id")
              .eq("source_id", sourceId)
              .eq("entity_type", options.entity_type);

            // If interpretation_id exists, also match on it; otherwise match any interpretation_id
            if (interpretationId) {
              obsQuery = obsQuery.eq("interpretation_id", interpretationId);
            } else {
              // For null interpretation_id, match observations with null interpretation_id
              obsQuery = obsQuery.is("interpretation_id", null);
            }

            const { data: existingObs } = await obsQuery;
            const entityIds = new Set<string>(
              (existingObs || [])
                .map((obs: { entity_id?: unknown }) => obs.entity_id)
                .filter((id: unknown): id is string => typeof id === "string"),
            );
            if (entityIds.size === 1) {
              entityId = Array.from(entityIds)[0];
            }
          }

          if (!entityId) {
            // No existing observation found - skip this group
            // This can happen if fragments were created but observations weren't
            console.warn(
              `[SCHEMA_REGISTRY] No entity found for source ${sourceId}, interpretation ${interpretationId}, skipping migration`,
            );
            continue;
          }

          // Load current schema to get version
          const currentSchema = await this.loadActiveSchema(
            options.entity_type,
            options.user_id,
          );
          if (!currentSchema) {
            console.error(
              `[SCHEMA_REGISTRY] No active schema found for ${options.entity_type}`,
            );
            continue;
          }

          // Collect all promoted fields for this entity from this group
          const promotedFields: Record<string, unknown> = {};
          for (const fragment of groupFragments) {
            if (options.field_names.includes(fragment.fragment_key)) {
              promotedFields[fragment.fragment_key] = fragment.fragment_value;
            }
          }

          if (Object.keys(promotedFields).length === 0) {
            continue; // No fields to migrate for this entity
          }

          try {
            // Create new observation with promoted fields
            // Use the same source_id and interpretation_id for provenance
            const observedAt = new Date().toISOString();
            const { error: obsError } = await db
              .from("observations")
              .insert({
                entity_id: entityId,
                entity_type: options.entity_type,
                schema_version: currentSchema.schema_version,
                source_id: sourceId,
                interpretation_id: interpretationId,
                observed_at: observedAt,
                specificity_score: 0.8, // Medium specificity for migrated fields
                source_priority: 0, // Same priority as original interpretation
                fields: promotedFields,
                user_id: firstFragment.user_id,
              });

            if (obsError) {
              // Check if it's a duplicate (idempotence) - that's okay
              if (obsError.code !== "23505") {
                console.error(
                  `[SCHEMA_REGISTRY] Failed to create observation for entity ${entityId}:`,
                  obsError.message,
                );
                continue;
              }
            } else {
              totalMigrated += Object.keys(promotedFields).length;
              logSchemaRegistryInfo(
                `[SCHEMA_REGISTRY] Migrated ${Object.keys(promotedFields).length} fields for entity ${entityId}`,
              );

              // Recompute snapshot to include migrated fields
              try {
                const { observationReducer } = await import("../reducers/observation_reducer.js");
                const { data: allObservations } = await db
                  .from("observations")
                  .select("*")
                  .eq("entity_id", entityId)
                  .order("observed_at", { ascending: false });

                if (allObservations && allObservations.length > 0) {
                  const snapshot = await observationReducer.computeSnapshot(
                    entityId,
                    allObservations as any,
                  );

                  if (!snapshot) {
                    console.warn(
                      `[SCHEMA_REGISTRY] computeSnapshot returned null for entity ${entityId}`,
                    );
                    continue;
                  }

                  const rowWithEmbedding = await prepareEntitySnapshotWithEmbedding({
                    entity_id: snapshot.entity_id,
                    entity_type: snapshot.entity_type,
                    schema_version: snapshot.schema_version,
                    snapshot: snapshot.snapshot,
                    computed_at: snapshot.computed_at,
                    observation_count: snapshot.observation_count,
                    last_observation_at: snapshot.last_observation_at,
                    provenance: snapshot.provenance,
                    user_id: snapshot.user_id,
                  });
                  await upsertEntitySnapshotWithEmbedding(rowWithEmbedding);
                }
              } catch (snapshotError: any) {
                console.warn(
                  `[SCHEMA_REGISTRY] Failed to recompute snapshot for entity ${entityId}:`,
                  snapshotError.message,
                );
                // Continue - snapshot will be recomputed on next observation creation
              }
            }
          } catch (error: any) {
            console.error(
              `[SCHEMA_REGISTRY] Failed to migrate fields for entity ${entityId}:`,
              error.message,
            );
            // Continue with next group - don't fail entire migration
          }
        }

        offset += BATCH_SIZE;

        // Safety check - don't migrate more than 10,000 fragments at once
        if (totalMigrated >= 10000) {
          console.warn(
            `[SCHEMA_REGISTRY] Migration limit reached (10,000 fragments), stopping`,
          );
          break;
        }
      }
    }

    logSchemaRegistryInfo(
      `[SCHEMA_REGISTRY] Migration complete. Total fragments processed: ${totalMigrated}`,
    );

    return { migrated_count: totalMigrated };
  }

  /**
   * Determine change type for schema update
   * 
   * Breaking changes (major):
   * - Removing fields
   * - Changing field types (not just adding converters)
   * - Changing field from optional to required
   * - Removing converters
   * 
   * Minor changes (minor):
   * - Adding new optional fields
   * - Adding converters to existing fields
   * - Changing reducer strategies
   * 
   * Patch changes (patch):
   * - Documentation updates
   * - Non-functional changes
   */
  private determineChangeType(options: {
    fields_to_add?: Array<{
      field_name: string;
      field_type: string;
      required?: boolean;
    }>;
    converters_to_add?: Array<{
      field_name: string;
      converter: any;
    }>;
    fields_to_remove?: string[];
    fields_to_modify?: Array<{
      field_name: string;
      old_type?: string;
      new_type?: string;
      old_required?: boolean;
      new_required?: boolean;
    }>;
  }): "major" | "minor" | "patch" {
    // Breaking changes (major version)
    if (
      options.fields_to_remove &&
      options.fields_to_remove.length > 0
    ) {
      return "major";
    }

    if (options.fields_to_modify && options.fields_to_modify.length > 0) {
      for (const mod of options.fields_to_modify) {
        // Changing field type is breaking
        if (mod.old_type && mod.new_type && mod.old_type !== mod.new_type) {
          return "major";
        }
        // Changing from optional to required is breaking
        if (
          mod.old_required === false &&
          mod.new_required === true
        ) {
          return "major";
        }
      }
    }

    // Minor changes (additive, backward compatible)
    if (
      (options.fields_to_add && options.fields_to_add.length > 0) ||
      (options.converters_to_add && options.converters_to_add.length > 0)
    ) {
      return "minor";
    }

    // Patch changes (no functional changes)
    return "patch";
  }

  /**
   * Increment schema version using semantic versioning (major.minor.patch)
   * 
   * - Major: Breaking changes (removing fields, changing types, making fields required)
   * - Minor: Additive changes (new fields, new converters) - backward compatible
   * - Patch: Non-functional changes (documentation, formatting)
   * 
   * Examples:
   * - 1.0.0 -> 1.1.0 (add new optional field)
   * - 1.1.0 -> 1.1.1 (patch change)
   * - 1.1.1 -> 2.0.0 (breaking change - remove field)
   */
  private incrementVersion(
    currentVersion: string,
    changeType: "major" | "minor" | "patch" = "minor"
  ): string {
    // Parse version (support both "1.0" and "1.0.0" formats)
    const parts = currentVersion.split(".");
    const major = parseInt(parts[0] || "1", 10);
    const minor = parseInt(parts[1] || "0", 10);
    const patch = parseInt(parts[2] || "0", 10);

    switch (changeType) {
      case "major":
        // Breaking change: increment major, reset minor and patch
        return `${major + 1}.0.0`;
      case "minor":
        // Additive change: increment minor, reset patch
        return `${major}.${minor + 1}.0`;
      case "patch":
        // Non-functional change: increment patch
        return `${major}.${minor}.${patch + 1}`;
      default:
        // Default to minor for backward compatibility
        return `${major}.${minor + 1}.0`;
    }
  }

  /**
   * Activate schema version
   * Supports user-specific schemas: deactivates other versions for same entity_type and user_id/scope
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async activate(entityType: string, version: string, _userId?: string): Promise<void> {
    // Load the schema to get its scope and user_id
    const { data: schema } = await db
      .from("schema_registry")
      .select("scope, user_id")
      .eq("entity_type", entityType)
      .eq("schema_version", version)
      .single();

    if (!schema) {
      throw new Error(`Schema not found: ${entityType} version ${version}`);
    }

    const scope = schema.scope || "global";
    const schemaUserId = schema.user_id;

    // Deactivate all other versions for this entity type and scope/user_id
    let deactivateQuery = db
      .from("schema_registry")
      .update({ active: false })
      .eq("entity_type", entityType)
      .eq("active", true);

    if (scope === "user" && schemaUserId) {
      deactivateQuery = deactivateQuery.eq("user_id", schemaUserId);
    } else {
      deactivateQuery = deactivateQuery.eq("scope", "global").is("user_id", null);
    }

    await deactivateQuery;

    // Activate specified version
    const { error } = await db
      .from("schema_registry")
      .update({ active: true })
      .eq("entity_type", entityType)
      .eq("schema_version", version);

    if (error) {
      throw new Error(`Failed to activate schema: ${error.message}`);
    }

    // Automatically export schema snapshots (non-blocking)
    this.exportSnapshotsAsync();
  }

  /**
   * Deactivate schema version
   */
  async deactivate(entityType: string, version: string): Promise<void> {
    const { error } = await db
      .from("schema_registry")
      .update({ active: false })
      .eq("entity_type", entityType)
      .eq("schema_version", version);

    if (error) {
      throw new Error(`Failed to deactivate schema: ${error.message}`);
    }

    // Automatically export schema snapshots (non-blocking)
    this.exportSnapshotsAsync();
  }

  /**
   * Get all entity schema versions for entity type
   */
  async getSchemaVersions(entityType: string): Promise<SchemaRegistryEntry[]> {
    const { data, error } = await db
      .from("schema_registry")
      .select("*")
      .eq("entity_type", entityType)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to get schema versions: ${error.message}`);
    }

    return (data || []) as SchemaRegistryEntry[];
  }

  /**
   * Generate searchable text for an entity schema (for embedding generation)
   */
  private generateSearchableText(schema: SchemaRegistryEntry): string {
    const parts: string[] = [schema.entity_type];
    
    // Add field names
    const fieldNames = Object.keys(schema.schema_definition.fields || {});
    parts.push(...fieldNames);
    
    // Add field types for context (e.g., "date", "amount", "name")
    for (const [fieldName, fieldDef] of Object.entries(schema.schema_definition.fields || {})) {
      if (fieldDef.type === "date" && fieldName.includes("date")) {
        parts.push("date", "time", "timestamp");
      }
      if (fieldDef.type === "number" && (fieldName.includes("amount") || fieldName.includes("price") || fieldName.includes("cost"))) {
        parts.push("amount", "price", "cost", "money", "financial");
      }
      if (fieldName.includes("name") || fieldName.includes("title")) {
        parts.push("name", "title", "label");
      }
    }
    
    return parts.join(" ");
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * List all active entity types, optionally filtered by keyword with vector search fallback
   */
  async listEntityTypes(keyword?: string): Promise<Array<{
    entity_type: string;
    schema_version: string;
    field_names: string[];
    field_summary: Record<string, { type: string; required: boolean }>;
    similarity_score?: number;
    match_type?: "keyword" | "vector";
  }>> {
    // Get all active schemas from database
    const query = db
      .from("schema_registry")
      .select("entity_type, schema_version, schema_definition")
      .eq("active", true);

    const { data: dbSchemas } = await query;

    // Fallback to code-defined schemas if database is empty or error
    const { ENTITY_SCHEMAS } = await import("./schema_definitions.js");
    const allSchemas = new Map<string, SchemaRegistryEntry>();

    if (dbSchemas && dbSchemas.length > 0) {
      for (const schema of dbSchemas) {
        allSchemas.set(schema.entity_type, schema as SchemaRegistryEntry);
      }
    } else {
      // Use code-defined schemas as fallback
      for (const [entityType, schema] of Object.entries(ENTITY_SCHEMAS)) {
        allSchemas.set(entityType, {
          id: "",
          entity_type: schema.entity_type,
          schema_version: schema.schema_version,
          schema_definition: schema.schema_definition,
          reducer_config: schema.reducer_config,
          active: true,
          created_at: new Date().toISOString(),
        });
      }
    }

    const allSchemasArray = Array.from(allSchemas.values());

    // If no keyword, return all
    if (!keyword) {
      return allSchemasArray.map((schema) => {
        const fieldNames = Object.keys(schema.schema_definition.fields || {});
        const fieldSummary: Record<string, { type: string; required: boolean }> = {};
        for (const [fieldName, fieldDef] of Object.entries(schema.schema_definition.fields || {})) {
          fieldSummary[fieldName] = {
            type: fieldDef.type,
            required: fieldDef.required || false,
          };
        }

        return {
          entity_type: schema.entity_type,
          schema_version: schema.schema_version,
          field_names: fieldNames,
          field_summary: fieldSummary,
        };
      });
    }

    const keywordLower = keyword.toLowerCase();
    
    // Step 1: Try keyword matching first (deterministic, strong consistency)
    const keywordMatches: Array<{
      schema: SchemaRegistryEntry;
      score: number;
    }> = [];

    for (const schema of allSchemasArray) {
      let score = 0;
      
      // Exact entity type match (highest score)
      if (schema.entity_type.toLowerCase() === keywordLower) {
        score = 10;
      }
      // Entity type contains keyword
      else if (schema.entity_type.toLowerCase().includes(keywordLower)) {
        score = 5;
      }
      
      // Field name matches
      const fieldNames = Object.keys(schema.schema_definition.fields || {});
      for (const fieldName of fieldNames) {
        if (fieldName.toLowerCase() === keywordLower) {
          score += 3;
        } else if (fieldName.toLowerCase().includes(keywordLower)) {
          score += 1;
        }
      }
      
      if (score > 0) {
        keywordMatches.push({ schema, score });
      }
    }

    // If we have good keyword matches (score >= 3), return those
    const goodKeywordMatches = keywordMatches.filter(m => m.score >= 3);
    if (goodKeywordMatches.length > 0) {
      return goodKeywordMatches
        .sort((a, b) => b.score - a.score)
        .map(({ schema, score }) => {
          const fieldNames = Object.keys(schema.schema_definition.fields || {});
          const fieldSummary: Record<string, { type: string; required: boolean }> = {};
          for (const [fieldName, fieldDef] of Object.entries(schema.schema_definition.fields || {})) {
            fieldSummary[fieldName] = {
              type: fieldDef.type,
              required: fieldDef.required || false,
            };
          }

          return {
            entity_type: schema.entity_type,
            schema_version: schema.schema_version,
            field_names: fieldNames,
            field_summary: fieldSummary,
            similarity_score: score / 10, // Normalize to 0-1 range
            match_type: "keyword" as const,
          };
        });
    }

    // Step 2: Fallback to vector search (semantic matching, bounded eventual consistency)
    const { generateEmbedding } = await import("../embeddings.js");
    const queryEmbedding = await generateEmbedding(keyword);
    
    if (!queryEmbedding) {
      // If embeddings not available, return keyword matches even if low score
      return keywordMatches
        .sort((a, b) => b.score - a.score)
        .map(({ schema, score }) => {
          const fieldNames = Object.keys(schema.schema_definition.fields || {});
          const fieldSummary: Record<string, { type: string; required: boolean }> = {};
          for (const [fieldName, fieldDef] of Object.entries(schema.schema_definition.fields || {})) {
            fieldSummary[fieldName] = {
              type: fieldDef.type,
              required: fieldDef.required || false,
            };
          }

          return {
            entity_type: schema.entity_type,
            schema_version: schema.schema_version,
            field_names: fieldNames,
            field_summary: fieldSummary,
            similarity_score: score / 10,
            match_type: "keyword" as const,
          };
        });
    }

    // Generate embeddings for all schemas and calculate similarity
    const schemaEmbeddings: Array<{
      schema: SchemaRegistryEntry;
      embedding: number[];
      similarity: number;
    }> = [];

    for (const schema of allSchemasArray) {
      const searchableText = this.generateSearchableText(schema);
      const schemaEmbedding = await generateEmbedding(searchableText);
      
      if (schemaEmbedding) {
        const similarity = this.cosineSimilarity(queryEmbedding, schemaEmbedding);
        schemaEmbeddings.push({ schema, embedding: schemaEmbedding, similarity });
      }
    }

    // Sort by similarity and return top matches
    const vectorMatches = schemaEmbeddings
      .filter(item => item.similarity > 0.3) // Threshold for relevance
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 20) // Limit results
      .map(({ schema, similarity }) => {
        const fieldNames = Object.keys(schema.schema_definition.fields || {});
        const fieldSummary: Record<string, { type: string; required: boolean }> = {};
        for (const [fieldName, fieldDef] of Object.entries(schema.schema_definition.fields || {})) {
          fieldSummary[fieldName] = {
            type: fieldDef.type,
            required: fieldDef.required || false,
          };
        }

        return {
          entity_type: schema.entity_type,
          schema_version: schema.schema_version,
          field_names: fieldNames,
          field_summary: fieldSummary,
          similarity_score: similarity,
          match_type: "vector" as const,
        };
      });

    // If vector search found results, return them
    if (vectorMatches.length > 0) {
      return vectorMatches;
    }

    // Final fallback: return keyword matches even if low score
    return keywordMatches
      .sort((a, b) => b.score - a.score)
      .map(({ schema, score }) => {
        const fieldNames = Object.keys(schema.schema_definition.fields || {});
        const fieldSummary: Record<string, { type: string; required: boolean }> = {};
        for (const [fieldName, fieldDef] of Object.entries(schema.schema_definition.fields || {})) {
          fieldSummary[fieldName] = {
            type: fieldDef.type,
            required: fieldDef.required || false,
          };
        }

        return {
          entity_type: schema.entity_type,
          schema_version: schema.schema_version,
          field_names: fieldNames,
          field_summary: fieldSummary,
          similarity_score: score / 10,
          match_type: "keyword" as const,
        };
      });
  }

  /**
   * Validate schema definition
   */
  private validateSchemaDefinition(definition: SchemaDefinition): void {
    if (!definition.fields || typeof definition.fields !== "object") {
      throw new Error("Schema definition must have fields object");
    }

    // R2: every schema must either declare `canonical_name_fields` or opt
    // out explicitly via `identity_opt_out`. This moves the failure from
    // first-write runtime ("why did this entity collapse into a
    // heuristic-named duplicate?") to schema-registration time, where it
    // is visible before any data is written.
    if (
      definition.canonical_name_fields === undefined &&
      definition.identity_opt_out === undefined
    ) {
      throw new Error(
        "Schema definition must declare `canonical_name_fields` OR " +
          "`identity_opt_out: \"heuristic_canonical_name\"`. See " +
          "docs/foundation/schema_agnostic_design_rules.md (R2).",
      );
    }

    if (definition.identity_opt_out !== undefined) {
      if (typeof definition.identity_opt_out !== "string") {
        throw new Error(
          "identity_opt_out must be a string token (e.g. \"heuristic_canonical_name\")",
        );
      }
      if (!VALID_IDENTITY_OPT_OUT_TOKENS.has(definition.identity_opt_out)) {
        throw new Error(
          `identity_opt_out has unknown value: ${definition.identity_opt_out}. ` +
            `Allowed: ${Array.from(VALID_IDENTITY_OPT_OUT_TOKENS).join(", ")}`,
        );
      }
    }

    if (definition.name_collision_policy !== undefined) {
      const policy = definition.name_collision_policy;
      if (policy !== "merge" && policy !== "warn" && policy !== "reject") {
        throw new Error(
          `name_collision_policy has unknown value: ${String(policy)}. ` +
            "Allowed: merge | warn | reject.",
        );
      }
      if (policy !== "merge" && definition.identity_opt_out !== undefined) {
        throw new Error(
          "name_collision_policy cannot be set to \"warn\" or \"reject\" on a " +
            "schema that also declares identity_opt_out. Either declare " +
            "canonical_name_fields so identity can be matched deterministically, " +
            "or keep the default policy (\"merge\").",
        );
      }
      if (policy === "reject" && definition.canonical_name_fields === undefined) {
        throw new Error(
          "name_collision_policy: \"reject\" requires a reachable " +
            "canonical_name_fields declaration so callers have a deterministic " +
            "path to resolve identity. See docs/foundation/schema_agnostic_design_rules.md (R2).",
        );
      }
    }

    if (definition.canonical_name_fields !== undefined) {
      if (!Array.isArray(definition.canonical_name_fields)) {
        throw new Error(
          "canonical_name_fields must be an array of field names or { composite: string[] } rules",
        );
      }
      for (const entry of definition.canonical_name_fields) {
        if (typeof entry === "string") {
          if (!entry.trim()) {
            throw new Error("canonical_name_fields entries must be non-empty strings");
          }
          if (!definition.fields[entry]) {
            throw new Error(
              `canonical_name_fields references unknown field: ${entry}`,
            );
          }
          continue;
        }
        if (!entry || typeof entry !== "object" || !Array.isArray((entry as { composite?: unknown }).composite)) {
          throw new Error(
            "canonical_name_fields entries must be strings or { composite: string[] } objects",
          );
        }
        const compositeFields = (entry as { composite: unknown[] }).composite;
        if (compositeFields.length === 0) {
          throw new Error("canonical_name_fields composite rule must declare at least one field");
        }
        for (const name of compositeFields) {
          if (typeof name !== "string" || !name.trim()) {
            throw new Error(
              "canonical_name_fields composite fields must be non-empty strings",
            );
          }
          if (!definition.fields[name]) {
            throw new Error(
              `canonical_name_fields references unknown field: ${name}`,
            );
          }
        }
      }
    }

    if (definition.temporal_fields !== undefined) {
      if (!Array.isArray(definition.temporal_fields)) {
        throw new Error("temporal_fields must be an array");
      }
      for (const entry of definition.temporal_fields) {
        if (!entry || typeof entry !== "object" || typeof entry.field !== "string") {
          throw new Error("temporal_fields entries must be { field, event_type? }");
        }
        if (!definition.fields[entry.field]) {
          throw new Error(
            `temporal_fields references unknown field: ${entry.field}`,
          );
        }
      }
    }

    if (definition.reference_fields !== undefined) {
      if (!Array.isArray(definition.reference_fields)) {
        throw new Error("reference_fields must be an array");
      }
      for (const entry of definition.reference_fields) {
        if (
          !entry ||
          typeof entry !== "object" ||
          typeof entry.field !== "string" ||
          typeof entry.target_entity_type !== "string"
        ) {
          throw new Error(
            "reference_fields entries must be { field, target_entity_type, relationship_type? }",
          );
        }
        if (!definition.fields[entry.field]) {
          throw new Error(
            `reference_fields references unknown field: ${entry.field}`,
          );
        }
      }
    }

    if (definition.aliases !== undefined) {
      if (!Array.isArray(definition.aliases)) {
        throw new Error("aliases must be an array of strings");
      }
      for (const alias of definition.aliases) {
        if (typeof alias !== "string" || !alias.trim()) {
          throw new Error("aliases entries must be non-empty strings");
        }
      }
    }

    const validTypes = [
      "string",
      "number",
      "date",
      "boolean",
      "array",
      "object",
    ];
    for (const [fieldName, fieldDef] of Object.entries(definition.fields)) {
      if (!validTypes.includes(fieldDef.type)) {
        throw new Error(
          `Invalid field type for ${fieldName}: ${fieldDef.type}`,
        );
      }

      // Validate converters if defined
      if (fieldDef.converters) {
        if (!Array.isArray(fieldDef.converters)) {
          throw new Error(
            `Converters for ${fieldName} must be an array`,
          );
        }

        for (const converter of fieldDef.converters) {
          // Validate required properties
          if (!converter.from || !converter.to || !converter.function) {
            throw new Error(
              `Converter for ${fieldName} must have from, to, and function properties`,
            );
          }

          // Validate deterministic property
          if (converter.deterministic !== true) {
            throw new Error(
              `Converter for ${fieldName} must be deterministic (deterministic: true)`,
            );
          }

          // Validate from/to types
          if (!validTypes.includes(converter.from)) {
            throw new Error(
              `Invalid converter from type for ${fieldName}: ${converter.from}`,
            );
          }
          if (!validTypes.includes(converter.to)) {
            throw new Error(
              `Invalid converter to type for ${fieldName}: ${converter.to}`,
            );
          }

          // Validate that converter 'to' type matches field type
          if (converter.to !== fieldDef.type) {
            throw new Error(
              `Converter for ${fieldName} must convert to field type ${fieldDef.type}, not ${converter.to}`,
            );
          }

          // Validate converter function name format (basic check)
          if (typeof converter.function !== "string" || converter.function.length === 0) {
            throw new Error(
              `Converter function name for ${fieldName} must be a non-empty string`,
            );
          }
        }
      }
    }
  }

  /**
   * Validate reducer config
   */
  private validateReducerConfig(
    config: ReducerConfig,
    schemaDefinition: SchemaDefinition,
  ): void {
    if (!config.merge_policies || typeof config.merge_policies !== "object") {
      throw new Error("Reducer config must have merge_policies object");
    }

    const validStrategies = [
      "last_write",
      "highest_priority",
      "most_specific",
      "merge_array",
    ];
    const validTieBreakers = ["observed_at", "source_priority"];

    for (const [fieldName, policy] of Object.entries(config.merge_policies)) {
      if (!schemaDefinition.fields[fieldName]) {
        throw new Error(`Merge policy references unknown field: ${fieldName}`);
      }

      if (!validStrategies.includes(policy.strategy)) {
        throw new Error(
          `Invalid merge strategy for ${fieldName}: ${policy.strategy}`,
        );
      }

      if (
        policy.tie_breaker &&
        !validTieBreakers.includes(policy.tie_breaker)
      ) {
        throw new Error(
          `Invalid tie breaker for ${fieldName}: ${policy.tie_breaker}`,
        );
      }
    }

    if (config.observation_source_priority !== undefined) {
      if (!Array.isArray(config.observation_source_priority)) {
        throw new Error(
          "observation_source_priority must be an array of observation_source values",
        );
      }
      const seen = new Set<string>();
      for (const value of config.observation_source_priority) {
        if (!OBSERVATION_SOURCE_RANK_VALUES.includes(value)) {
          throw new Error(
            `Invalid observation_source in observation_source_priority: ${value}`,
          );
        }
        if (seen.has(value)) {
          throw new Error(
            `Duplicate observation_source in observation_source_priority: ${value}`,
          );
        }
        seen.add(value);
      }
    }
  }

  /**
   * Update icon metadata for a schema
   */
  async updateIconMetadata(
    entityType: string,
    iconMetadata: IconMetadata,
    userId?: string
  ): Promise<void> {
    // Find the active schema for this entity type
    const schema = await this.loadActiveSchema(entityType, userId);
    
    if (!schema) {
      console.warn(`[SCHEMA_REGISTRY] No active schema found for ${entityType}, cannot update icon`);
      return;
    }
    
    // Update metadata with icon
    const updatedMetadata = {
      ...(schema.metadata || {}),
      icon: iconMetadata,
    };
    
    const { error } = await db
      .from("schema_registry")
      .update({ metadata: updatedMetadata })
      .eq("id", schema.id);
    
    if (error) {
      console.error(`[SCHEMA_REGISTRY] Failed to update icon metadata for ${entityType}:`, error);
    }
  }

  /**
   * Merge partial metadata fields into the active schema row for an entity type.
   * Preserves existing metadata keys that are not in the patch.
   */
  async updateMetadata(
    entityType: string,
    patch: Partial<SchemaMetadata>,
    userId?: string,
  ): Promise<void> {
    const schema = await this.loadActiveSchema(entityType, userId);
    if (!schema) {
      throw new Error(
        `No active schema found for entity type "${entityType}"; cannot update metadata.`,
      );
    }

    const updatedMetadata: SchemaMetadata = {
      ...(schema.metadata || {}),
      ...patch,
    };

    const { error } = await db
      .from("schema_registry")
      .update({ metadata: updatedMetadata })
      .eq("id", schema.id);

    if (error) {
      throw new Error(
        `Failed to update metadata for ${entityType}: ${error.message}`,
      );
    }
  }

  /**
   * Generate icon for a schema asynchronously (non-blocking)
   */
  private async generateIconAsync(
    entityType: string,
    metadata?: SchemaMetadata
  ): Promise<void> {
    // Only generate if icon doesn't already exist
    if (metadata?.icon) {
      return;
    }
    
    try {
      // Import icon service dynamically to avoid circular dependencies
      const { generateIconForEntityType } = await import("./schema_icon_service.js");
      
      // Generate icon
      const iconMetadata = await generateIconForEntityType(entityType, metadata);
      
      // Update schema with icon
      await this.updateIconMetadata(entityType, iconMetadata);
    } catch (error) {
      // Don't fail schema registration if icon generation fails
      console.warn(`[SCHEMA_REGISTRY] Failed to generate icon for ${entityType}:`, error);
    }
  }

  /**
   * Export schema snapshots asynchronously (non-blocking)
   * Automatically exports snapshots after schema changes without blocking operations
   */
  private exportSnapshotsAsync(): void {
    // Only export if we're in a Node.js environment (not browser)
    if (typeof process === "undefined" || !process.env) {
      return;
    }

    // Skip export in test environments to avoid side effects
    if (process.env.NODE_ENV === "test" || process.env.VITEST) {
      return;
    }

    // Run export script asynchronously (fire-and-forget)
    const scriptPath = join(
      __dirname,
      "../../scripts/export_schema_snapshots.ts",
    );
    const child = spawn("tsx", [scriptPath], {
      stdio: "ignore", // Suppress output to avoid cluttering logs
      detached: true,
      env: { ...process.env, NODE_ENV: process.env.NODE_ENV || "development" },
    });

    // Don't wait for completion - let it run in background
    child.unref();

    // Handle errors silently (don't fail schema operations if export fails)
    child.on("error", (error) => {
      // Silently ignore export errors - schema operations should not fail
      // if snapshot export fails (e.g., in CI/CD or restricted environments)
      if (process.env.NODE_ENV === "development") {
        console.warn(
          `[Schema Registry] Failed to export snapshots: ${error.message}`,
        );
      }
    });
  }
}

export const schemaRegistry = new SchemaRegistryService();
