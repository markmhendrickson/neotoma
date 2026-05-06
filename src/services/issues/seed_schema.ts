/**
 * Seed / extend the `issue` entity schema.
 *
 * Issues represent collaborative threads between Neotoma users and
 * maintainers, backed by GitHub Issues. Each issue has a related
 * conversation entity containing conversation_message entities for
 * each message in the thread.
 *
 * Registered as a GLOBAL schema (user_specific: false) because issues
 * are produced by infrastructure tooling, not per-user workflows.
 * Idempotent: safe to call on every server start.
 */

import type {
  FieldDefinition,
  ReducerConfig,
  SchemaDefinition,
  SchemaRegistryEntry,
} from "../schema_registry.js";
import { SchemaRegistryService } from "../schema_registry.js";

export const ISSUE_ENTITY_TYPE = "issue";

type FieldSpec = Array<{
  name: string;
  type: FieldDefinition["type"];
  required?: boolean;
  reducer?: "last_write" | "highest_priority" | "most_specific" | "merge_array";
  description?: string;
}>;

const ISSUE_FIELDS: FieldSpec = [
  { name: "title", type: "string", required: true, description: "Issue title" },
  { name: "body", type: "string", description: "Issue body (first message)" },
  { name: "status", type: "string", required: true, description: "open | closed" },
  { name: "labels", type: "array", reducer: "merge_array", description: "Issue labels (e.g. bug, doc_gap, enhancement)" },
  { name: "github_number", type: "number", required: true, description: "GitHub issue number" },
  { name: "github_url", type: "string", description: "Full GitHub issue URL" },
  { name: "repo", type: "string", required: true, description: "GitHub repo (owner/name)" },
  { name: "visibility", type: "string", description: "public | advisory" },
  { name: "author", type: "string", description: "GitHub username of issue creator" },
  { name: "github_actor", type: "object", description: "Structured GitHub actor identity: { login, id, type }" },
  { name: "created_at", type: "date", description: "Issue creation timestamp" },
  { name: "closed_at", type: "date", description: "Issue close timestamp (null if open)" },
  { name: "last_synced_at", type: "date", description: "Last time this issue was synced from GitHub" },
  { name: "sync_pending", type: "boolean", description: "True if local changes have not been pushed to GitHub" },
  {
    name: "guest_access_token",
    type: "string",
    description:
      "Guest-scoped token for this issue row (e.g. from remote /store guest_access_token). Sensitive; optional.",
  },
  { name: "data_source", type: "string", description: "Provenance — e.g. 'github issues api markmhendrickson/neotoma #42 2026-05-06'" },
];

function buildSchemaDefinition(): SchemaDefinition {
  const fields: Record<string, FieldDefinition> = {
    schema_version: { type: "string", required: true },
  };
  for (const spec of ISSUE_FIELDS) {
    fields[spec.name] = {
      type: spec.type,
      required: spec.required === true,
      ...(spec.description ? { description: spec.description } : {}),
    };
  }
  return {
    fields,
    canonical_name_fields: [{ composite: ["github_number", "repo"] }, "title"],
    temporal_fields: [
      { field: "created_at", event_type: "issue_created" },
      { field: "closed_at", event_type: "issue_closed" },
      { field: "last_synced_at", event_type: "issue_synced" },
    ],
  };
}

function buildReducerConfig(): ReducerConfig {
  const merge_policies: ReducerConfig["merge_policies"] = {
    schema_version: { strategy: "last_write" },
  };
  for (const spec of ISSUE_FIELDS) {
    merge_policies[spec.name] = { strategy: spec.reducer ?? "last_write" };
  }
  return { merge_policies };
}

/** Bump patch segment (1.0 → 1.0.1, 1.2.3 → 1.2.4) for a non-breaking metadata repair row. */
function bumpPatchVersion(currentVersion: string): string {
  const parts = currentVersion.split(".");
  const major = parseInt(parts[0] ?? "1", 10) || 1;
  const minor = parseInt(parts[1] ?? "0", 10) || 0;
  const patch = parseInt(parts[2] ?? "0", 10) || 0;
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * True when the definition would fail schema registry R2 validation
 * (no identity path). Empty `canonical_name_fields` counts as missing.
 */
function needsSchemaDefinitionR2Repair(def: SchemaDefinition): boolean {
  if (def.identity_opt_out !== undefined) return false;
  const rules = def.canonical_name_fields;
  if (rules === undefined) return true;
  return !Array.isArray(rules) || rules.length === 0;
}

/**
 * Ensure the global `issue` schema exists and has every field required
 * by the issues subsystem. Safe to call multiple times.
 */
export async function seedIssueSchema(options?: {
  registry?: SchemaRegistryService;
}): Promise<SchemaRegistryEntry> {
  const registry = options?.registry ?? new SchemaRegistryService();
  let existing = await registry.loadGlobalSchema(ISSUE_ENTITY_TYPE);

  const definition = buildSchemaDefinition();
  const reducerConfig = buildReducerConfig();

  if (!existing) {
    return await registry.register({
      entity_type: ISSUE_ENTITY_TYPE,
      schema_version: "1.0",
      schema_definition: definition,
      reducer_config: reducerConfig,
      user_specific: false,
      activate: true,
      metadata: {
        label: "Issue",
        description:
          "Collaborative issue thread backed by GitHub Issues. Each issue has an associated conversation entity with conversation_message entities for the thread.",
        category: "productivity",
        guest_access_policy: "submitter_scoped",
      },
    });
  }

  // Older installs may have every field but no R2 identity metadata; incremental
  // updates only preserve what's already on the row, so auto-enhance then fails
  // validateSchemaDefinition. Repair by registering a patch version with baseline
  // canonical_name_fields + temporal_fields merged in.
  if (needsSchemaDefinitionR2Repair(existing.schema_definition)) {
    // Merge baseline fields from the current spec first so canonical_name_fields /
    // temporal_fields that reference newer columns (e.g. composite repo) validate.
    const mergedDefinition: SchemaDefinition = {
      ...existing.schema_definition,
      fields: { ...definition.fields, ...existing.schema_definition.fields },
      canonical_name_fields: definition.canonical_name_fields,
      temporal_fields:
        definition.temporal_fields ?? existing.schema_definition.temporal_fields,
    };
    const mergedReducer: ReducerConfig = {
      merge_policies: {
        ...reducerConfig.merge_policies,
        ...existing.reducer_config.merge_policies,
      },
    };
    const newVersion = bumpPatchVersion(existing.schema_version);
    await registry.register({
      entity_type: ISSUE_ENTITY_TYPE,
      schema_version: newVersion,
      schema_definition: mergedDefinition,
      reducer_config: mergedReducer,
      user_specific: false,
      activate: false,
      metadata: existing.metadata ?? {
        label: "Issue",
        description:
          "Collaborative issue thread backed by GitHub Issues. Each issue has an associated conversation entity with conversation_message entities for the thread.",
        category: "productivity",
      },
    });
    await registry.activate(ISSUE_ENTITY_TYPE, newVersion);
    existing = await registry.loadGlobalSchema(ISSUE_ENTITY_TYPE);
    if (!existing) {
      throw new Error(
        `[Issues] expected global ${ISSUE_ENTITY_TYPE} schema after R2 metadata repair`,
      );
    }
  }

  const existingFieldNames = new Set(
    Object.keys(existing.schema_definition.fields ?? {}),
  );
  const missing = ISSUE_FIELDS.filter((spec) => !existingFieldNames.has(spec.name));
  if (missing.length === 0) return existing;

  return await registry.updateSchemaIncremental({
    entity_type: ISSUE_ENTITY_TYPE,
    fields_to_add: missing.map((spec) => ({
      field_name: spec.name,
      field_type: spec.type,
      required: spec.required === true,
      reducer_strategy: spec.reducer ?? "last_write",
    })),
    user_specific: false,
    activate: true,
  });
}

export const ISSUE_FIELD_SPECS: ReadonlyArray<{
  name: string;
  type: FieldDefinition["type"];
  required?: boolean;
  reducer?: "last_write" | "highest_priority" | "most_specific" | "merge_array";
  description?: string;
}> = ISSUE_FIELDS;
