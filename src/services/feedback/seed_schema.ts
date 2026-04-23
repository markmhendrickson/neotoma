/**
 * Seed / extend the global `neotoma_feedback` entity schema.
 *
 * Called once per install (or idempotently on server start) so the Neotoma
 * entity graph has a typed home for records mirrored from the
 * agent.neotoma.io pipeline. The fields mirror the shape documented in
 * docs/subsystems/feedback_neotoma_forwarder.md and the Netlify-side
 * `StoredFeedback` interface.
 *
 * Design notes:
 *   - Registered as a GLOBAL schema (scope="global") because neotoma_feedback
 *     rows are produced by an ambient pipeline agent, not per-user workflows.
 *   - `schema-version` follows the `<major>.<minor>` scheme used by the
 *     registry. Adding optional fields later goes through
 *     `SchemaRegistryService.updateSchemaIncremental` which bumps minor.
 *   - Idempotent: if an active schema already exists, the seeder uses
 *     `updateSchemaIncremental` with `fields_to_add` only. Existing fields
 *     are skipped by the registry.
 */

import type {
  FieldDefinition,
  ReducerConfig,
  SchemaDefinition,
  SchemaRegistryEntry,
} from "../schema_registry.js";
import { SchemaRegistryService } from "../schema_registry.js";

export const NEOTOMA_FEEDBACK_ENTITY_TYPE = "neotoma_feedback";

type FieldSpec = Array<{
  name: string;
  type: FieldDefinition["type"];
  required?: boolean;
  reducer?: "last_write" | "highest_priority" | "most_specific" | "merge_array";
  description?: string;
}>;

/**
 * Full field list the forwarder can project onto a `neotoma_feedback`
 * entity. Order is documentation-first; registry order is not significant.
 */
const FEEDBACK_FIELDS: FieldSpec = [
  { name: "feedback_id", type: "string", required: true, description: "agent.neotoma.io feedback id" },
  { name: "access_token_hash", type: "string", description: "sha256 of the single-purpose status token" },
  { name: "submitter_id", type: "string" },
  { name: "title", type: "string", required: true },
  { name: "body", type: "string" },
  { name: "kind", type: "string", required: true },
  { name: "redaction_applied", type: "boolean" },
  { name: "redaction_backstop_hits", type: "array" },
  { name: "neotoma_version", type: "string" },
  { name: "client_name", type: "string" },
  { name: "client_version", type: "string" },
  { name: "os", type: "string" },
  { name: "os_version", type: "string" },
  { name: "node_version", type: "string" },
  { name: "tool_name", type: "string" },
  { name: "invocation_shape", type: "array" },
  { name: "error_type", type: "string" },
  { name: "error_message", type: "string" },
  { name: "error_class", type: "string" },
  { name: "hit_count", type: "number" },
  { name: "consent_mode_at_submit", type: "string" },
  { name: "status", type: "string" },
  { name: "status_updated_at", type: "date" },
  { name: "submitted_at", type: "date" },
  { name: "last_activity_at", type: "date" },
  { name: "next_check_suggested_at", type: "date" },
  { name: "classification", type: "string" },
  { name: "triage_notes", type: "string" },
  { name: "github_issue_urls", type: "array", reducer: "merge_array" },
  { name: "pull_request_urls", type: "array", reducer: "merge_array" },
  { name: "commit_shas", type: "array", reducer: "merge_array" },
  { name: "duplicate_of_feedback_id", type: "string" },
  { name: "notes_markdown", type: "string" },
  { name: "verifications", type: "array", reducer: "merge_array" },
  { name: "upgrade_guidance", type: "object", description: "Full UpgradeGuidance block, stored as nested JSON" },
  { name: "verification_count_by_outcome", type: "object" },
  { name: "resolution_confidence", type: "string" },
  { name: "first_verification_at", type: "date" },
  { name: "last_verification_at", type: "date" },
  { name: "regression_candidate", type: "boolean" },
  { name: "regression_detected_at", type: "date" },
  { name: "regression_count", type: "number" },
  { name: "superseded_by_version", type: "string" },
  { name: "prefer_human_draft", type: "boolean" },
  { name: "data_source", type: "string", description: "Provenance — e.g. 'agent-site netlify submit 2026-04-22'" },
  { name: "source_file", type: "string" },
  { name: "original_submission_payload", type: "object" },
];

function buildSchemaDefinition(): SchemaDefinition {
  const fields: Record<string, FieldDefinition> = {
    schema_version: { type: "string", required: true },
  };
  for (const spec of FEEDBACK_FIELDS) {
    fields[spec.name] = {
      type: spec.type,
      required: spec.required === true,
      ...(spec.description ? { description: spec.description } : {}),
    };
  }
  return {
    fields,
    canonical_name_fields: [{ composite: ["feedback_id"] }, "title"],
    temporal_fields: [
      { field: "submitted_at", event_type: "feedback_submitted" },
      { field: "status_updated_at", event_type: "feedback_status_changed" },
      { field: "last_activity_at", event_type: "feedback_activity" },
    ],
  };
}

function buildReducerConfig(): ReducerConfig {
  const merge_policies: ReducerConfig["merge_policies"] = {
    schema_version: { strategy: "last_write" },
  };
  for (const spec of FEEDBACK_FIELDS) {
    merge_policies[spec.name] = { strategy: spec.reducer ?? "last_write" };
  }
  return { merge_policies };
}

/**
 * Ensure the global `neotoma_feedback` schema exists and has every field
 * required by the pipeline. Safe to call multiple times.
 *
 * @returns The registered or updated schema entry.
 */
export async function seedNeotomaFeedbackSchema(options?: {
  registry?: SchemaRegistryService;
}): Promise<SchemaRegistryEntry> {
  const registry = options?.registry ?? new SchemaRegistryService();
  const existing = await registry.loadGlobalSchema(NEOTOMA_FEEDBACK_ENTITY_TYPE);

  const definition = buildSchemaDefinition();
  const reducerConfig = buildReducerConfig();

  if (!existing) {
    return await registry.register({
      entity_type: NEOTOMA_FEEDBACK_ENTITY_TYPE,
      schema_version: "1.0",
      schema_definition: definition,
      reducer_config: reducerConfig,
      user_specific: false,
      activate: true,
      metadata: {
        label: "Neotoma Feedback",
        description:
          "Feedback items from the agent.neotoma.io pipeline (incidents, reports, primitive asks, doc gaps, contract discrepancies, fix verifications).",
        category: "productivity",
      },
    });
  }

  const existingFieldNames = new Set(
    Object.keys(existing.schema_definition.fields ?? {}),
  );
  const missing = FEEDBACK_FIELDS.filter((spec) => !existingFieldNames.has(spec.name));
  if (missing.length === 0) return existing;

  return await registry.updateSchemaIncremental({
    entity_type: NEOTOMA_FEEDBACK_ENTITY_TYPE,
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

/** Exported for tests / documentation. */
export const NEOTOMA_FEEDBACK_FIELD_SPECS: ReadonlyArray<{
  name: string;
  type: FieldDefinition["type"];
  required?: boolean;
  reducer?: "last_write" | "highest_priority" | "most_specific" | "merge_array";
  description?: string;
}> = FEEDBACK_FIELDS;

/**
 * Backward-compatible aliases kept until downstream scripts migrate imports.
 */
export const PRODUCT_FEEDBACK_ENTITY_TYPE = NEOTOMA_FEEDBACK_ENTITY_TYPE;
export const PRODUCT_FEEDBACK_FIELD_SPECS = NEOTOMA_FEEDBACK_FIELD_SPECS;
export const seedProductFeedbackSchema = seedNeotomaFeedbackSchema;
