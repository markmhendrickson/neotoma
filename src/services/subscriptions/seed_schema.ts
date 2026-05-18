/**
 * Global `subscription` entity schema for Phase 2 webhook/SSE delivery.
 * Idempotent: safe on every server start.
 */

import type {
  FieldDefinition,
  ReducerConfig,
  SchemaDefinition,
  SchemaRegistryEntry,
} from "../schema_registry.js";
import { SchemaRegistryService } from "../schema_registry.js";

export const SUBSCRIPTION_ENTITY_TYPE = "subscription";

type FieldSpec = Array<{
  name: string;
  type: FieldDefinition["type"];
  required?: boolean;
  reducer?: "last_write" | "highest_priority" | "most_specific" | "merge_array";
  description?: string;
}>;

const SUBSCRIPTION_FIELDS: FieldSpec = [
  {
    name: "subscription_id",
    type: "string",
    required: true,
    description: "Stable subscription identifier (UUID)",
  },
  {
    name: "watch_entity_types",
    type: "array",
    reducer: "merge_array",
    description: "Optional filter: entity_type values to deliver (e.g. issue)",
  },
  {
    name: "watch_entity_ids",
    type: "array",
    reducer: "merge_array",
    description: "Optional filter: specific entity_id values",
  },
  {
    name: "watch_event_types",
    type: "array",
    reducer: "merge_array",
    description: "Optional filter: substrate event types (e.g. entity.created)",
  },
  {
    name: "delivery_method",
    type: "string",
    required: true,
    description: "webhook | sse",
  },
  {
    name: "webhook_url",
    type: "string",
    description: "HTTPS callback URL (HTTP allowed for localhost)",
  },
  {
    name: "webhook_secret",
    type: "string",
    description: "HMAC secret for X-Neotoma-Signature-256",
  },
  {
    name: "active",
    type: "boolean",
    required: true,
    description: "When false, matcher skips this subscription",
  },
  { name: "created_at", type: "date", required: true, description: "ISO creation time" },
  { name: "last_delivered_at", type: "date", description: "Last successful webhook delivery" },
  { name: "consecutive_failures", type: "number", description: "Circuit breaker counter" },
  {
    name: "max_failures",
    type: "number",
    description: "Auto-deactivate after this many consecutive failures",
  },
  {
    name: "sync_peer_id",
    type: "string",
    description:
      "When set, skip webhook delivery for substrate events whose observation originated from this peer id (Phase 5 loop prevention).",
  },
];

function buildSchemaDefinition(): SchemaDefinition {
  const fields: Record<string, FieldDefinition> = {
    schema_version: { type: "string", required: true },
  };
  for (const spec of SUBSCRIPTION_FIELDS) {
    fields[spec.name] = {
      type: spec.type,
      required: spec.required === true,
      ...(spec.description ? { description: spec.description } : {}),
    };
  }
  return {
    fields,
    canonical_name_fields: ["subscription_id"],
  };
}

function buildReducerConfig(): ReducerConfig {
  const merge_policies: ReducerConfig["merge_policies"] = {
    schema_version: { strategy: "last_write" },
  };
  for (const spec of SUBSCRIPTION_FIELDS) {
    merge_policies[spec.name] = { strategy: spec.reducer ?? "last_write" };
  }
  return { merge_policies };
}

export async function seedSubscriptionSchema(options?: {
  registry?: SchemaRegistryService;
}): Promise<SchemaRegistryEntry> {
  const registry = options?.registry ?? new SchemaRegistryService();
  const existing = await registry.loadGlobalSchema(SUBSCRIPTION_ENTITY_TYPE);
  const definition = buildSchemaDefinition();
  const reducerConfig = buildReducerConfig();

  if (!existing) {
    return await registry.register({
      entity_type: SUBSCRIPTION_ENTITY_TYPE,
      schema_version: "1.0",
      schema_definition: definition,
      reducer_config: reducerConfig,
      user_specific: false,
      activate: true,
      metadata: {
        label: "Subscription",
        description: "Substrate event subscription for webhook or SSE delivery.",
        category: "agent_runtime",
      },
    });
  }

  const existingFieldNames = new Set(Object.keys(existing.schema_definition.fields ?? {}));
  const missing = SUBSCRIPTION_FIELDS.filter((spec) => !existingFieldNames.has(spec.name));
  if (missing.length === 0) return existing;

  return await registry.updateSchemaIncremental({
    entity_type: SUBSCRIPTION_ENTITY_TYPE,
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
