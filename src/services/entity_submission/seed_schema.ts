/**
 * Global `submission_config` schema — operator-defined submission pipelines per target entity_type.
 */

import type {
  FieldDefinition,
  ReducerConfig,
  SchemaDefinition,
  SchemaRegistryEntry,
} from "../schema_registry.js";
import { SchemaRegistryService } from "../schema_registry.js";
import { SUBMISSION_CONFIG_ENTITY_TYPE } from "./types.js";

type FieldSpec = Array<{
  name: string;
  type: FieldDefinition["type"];
  required?: boolean;
  reducer?: "last_write" | "highest_priority" | "most_specific" | "merge_array";
  description?: string;
}>;

const CONFIG_FIELDS: FieldSpec = [
  { name: "config_key", type: "string", required: true, description: "Stable config identifier" },
  { name: "target_entity_type", type: "string", required: true, description: "Entity type this config applies to" },
  { name: "access_policy", type: "string", required: true, description: "closed | read_only | submit_only | submitter_scoped | open" },
  { name: "active", type: "boolean", required: true, description: "When false, generic submit rejects this type" },
  {
    name: "enable_conversation_threading",
    type: "boolean",
    required: true,
    description: "Create conversation + initial message linked to the primary entity",
  },
  {
    name: "enable_guest_read_back",
    type: "boolean",
    required: true,
    description: "Return guest_access_token covering primary + conversation entities",
  },
  {
    name: "external_mirrors",
    type: "array",
    reducer: "merge_array",
    description: "Optional mirror definitions [{ provider, config }]",
  },
  { name: "created_at", type: "date", required: true, description: "Row creation time" },
];

function buildSchemaDefinition(): SchemaDefinition {
  const fields: Record<string, FieldDefinition> = {
    schema_version: { type: "string", required: true },
  };
  for (const spec of CONFIG_FIELDS) {
    fields[spec.name] = {
      type: spec.type,
      required: spec.required === true,
      ...(spec.description ? { description: spec.description } : {}),
    };
  }
  return {
    fields,
    canonical_name_fields: ["config_key"],
  };
}

function buildReducerConfig(): ReducerConfig {
  const merge_policies: ReducerConfig["merge_policies"] = {
    schema_version: { strategy: "last_write" },
  };
  for (const spec of CONFIG_FIELDS) {
    merge_policies[spec.name] = { strategy: spec.reducer ?? "last_write" };
  }
  return { merge_policies };
}

export async function seedSubmissionConfigSchema(options?: {
  registry?: SchemaRegistryService;
}): Promise<SchemaRegistryEntry> {
  const registry = options?.registry ?? new SchemaRegistryService();
  const existing = await registry.loadGlobalSchema(SUBMISSION_CONFIG_ENTITY_TYPE);
  const definition = buildSchemaDefinition();
  const reducerConfig = buildReducerConfig();

  if (!existing) {
    return await registry.register({
      entity_type: SUBMISSION_CONFIG_ENTITY_TYPE,
      schema_version: "1.0",
      schema_definition: definition,
      reducer_config: reducerConfig,
      user_specific: false,
      activate: true,
      metadata: {
        label: "Submission config",
        description: "Guest submission and threading configuration per target entity type.",
        category: "agent_runtime",
      },
    });
  }

  const existingFieldNames = new Set(Object.keys(existing.schema_definition.fields ?? {}));
  const missing = CONFIG_FIELDS.filter((spec) => !existingFieldNames.has(spec.name));
  if (missing.length === 0) return existing;

  return await registry.updateSchemaIncremental({
    entity_type: SUBMISSION_CONFIG_ENTITY_TYPE,
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
