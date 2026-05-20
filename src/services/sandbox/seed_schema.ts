/**
 * Seed the global `sandbox_abuse_report` entity schema.
 *
 * Mirrors `src/services/feedback/seed_schema.ts` so the sandbox-report
 * pipeline has a first-class entity type in the central Neotoma once the
 * forwarder writes reports there. Registered once on server start and idempotent.
 */

import type {
  FieldDefinition,
  ReducerConfig,
  SchemaDefinition,
  SchemaRegistryEntry,
} from "../schema_registry.js";
import { SchemaRegistryService } from "../schema_registry.js";

export const SANDBOX_ABUSE_REPORT_ENTITY_TYPE = "sandbox_abuse_report";

type FieldSpec = Array<{
  name: string;
  type: FieldDefinition["type"];
  required?: boolean;
  reducer?: "last_write" | "highest_priority" | "most_specific" | "merge_array";
  description?: string;
}>;

const FIELDS: FieldSpec = [
  {
    name: "report_id",
    type: "string",
    required: true,
    description: "Local sandbox report id (e.g. sbx_...)",
  },
  {
    name: "access_token_hash",
    type: "string",
    description: "sha256 of the single-purpose status token",
  },
  {
    name: "submitter_ip_hash",
    type: "string",
    description: "sha256 prefix of the reporter's IP, never raw IP",
  },
  { name: "reason", type: "string", required: true },
  { name: "description", type: "string", required: true },
  { name: "entity_id", type: "string", description: "Reported entity id in the sandbox" },
  { name: "url", type: "string" },
  {
    name: "reporter_contact",
    type: "string",
    description: "Redacted / hashed contact, never raw email",
  },
  { name: "status", type: "string", required: true },
  { name: "status_updated_at", type: "date" },
  { name: "submitted_at", type: "date", required: true },
  { name: "resolution_notes", type: "string" },
  { name: "redaction_applied", type: "boolean" },
  { name: "redaction_backstop_hits", type: "array", reducer: "merge_array" },
  { name: "forwarded_at", type: "date" },
  { name: "forwarded_report_id", type: "string" },
  {
    name: "data_source",
    type: "string",
    description: "Provenance — e.g. 'sandbox.neotoma.io POST /sandbox/report'",
  },
  { name: "original_submission_payload", type: "object" },
];

function buildSchemaDefinition(): SchemaDefinition {
  const fields: Record<string, FieldDefinition> = {
    schema_version: { type: "string", required: true },
  };
  for (const spec of FIELDS) {
    fields[spec.name] = {
      type: spec.type,
      required: spec.required === true,
      ...(spec.description ? { description: spec.description } : {}),
    };
  }
  return {
    fields,
    canonical_name_fields: [{ composite: ["report_id"] }],
    temporal_fields: [
      { field: "submitted_at", event_type: "sandbox_report_submitted" },
      { field: "status_updated_at", event_type: "sandbox_report_status_changed" },
      { field: "forwarded_at", event_type: "sandbox_report_forwarded" },
    ],
  };
}

function buildReducerConfig(): ReducerConfig {
  const merge_policies: ReducerConfig["merge_policies"] = {
    schema_version: { strategy: "last_write" },
  };
  for (const spec of FIELDS) {
    merge_policies[spec.name] = { strategy: spec.reducer ?? "last_write" };
  }
  return { merge_policies };
}

export async function seedSandboxAbuseReportSchema(options?: {
  registry?: SchemaRegistryService;
}): Promise<SchemaRegistryEntry> {
  const registry = options?.registry ?? new SchemaRegistryService();
  const existing = await registry.loadGlobalSchema(SANDBOX_ABUSE_REPORT_ENTITY_TYPE);

  const definition = buildSchemaDefinition();
  const reducerConfig = buildReducerConfig();

  if (!existing) {
    return await registry.register({
      entity_type: SANDBOX_ABUSE_REPORT_ENTITY_TYPE,
      schema_version: "1.0",
      schema_definition: definition,
      reducer_config: reducerConfig,
      user_specific: false,
      activate: true,
      metadata: {
        label: "Sandbox Abuse Report",
        description:
          "Abuse / PII / bug reports submitted to the public sandbox deployment at sandbox.neotoma.io.",
        category: "knowledge",
      },
    });
  }

  const existingFieldNames = new Set(Object.keys(existing.schema_definition.fields ?? {}));
  const missing = FIELDS.filter((spec) => !existingFieldNames.has(spec.name));
  if (missing.length === 0) return existing;

  return await registry.updateSchemaIncremental({
    entity_type: SANDBOX_ABUSE_REPORT_ENTITY_TYPE,
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

export const SANDBOX_ABUSE_REPORT_FIELD_SPECS: ReadonlyArray<{
  name: string;
  type: FieldDefinition["type"];
  required?: boolean;
  reducer?: "last_write" | "highest_priority" | "most_specific" | "merge_array";
  description?: string;
}> = FIELDS;
