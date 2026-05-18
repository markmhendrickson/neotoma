/**
 * Global `peer_config` entity schema (Phase 5 cross-instance sync).
 * Idempotent on boot.
 */

import type {
  FieldDefinition,
  ReducerConfig,
  SchemaDefinition,
  SchemaRegistryEntry,
} from "../schema_registry.js";
import { SchemaRegistryService } from "../schema_registry.js";

export const PEER_CONFIG_ENTITY_TYPE = "peer_config";

type FieldSpec = Array<{
  name: string;
  type: FieldDefinition["type"];
  required?: boolean;
  reducer?: "last_write" | "highest_priority" | "most_specific" | "merge_array";
  description?: string;
}>;

const PEER_FIELDS: FieldSpec = [
  {
    name: "peer_id",
    type: "string",
    required: true,
    description: "Stable id this peer uses when signing sync webhooks",
  },
  { name: "peer_name", type: "string", required: true, description: "Human label" },
  {
    name: "peer_url",
    type: "string",
    required: true,
    description: "Base URL of the peer Neotoma instance",
  },
  {
    name: "direction",
    type: "string",
    required: true,
    description: "push | pull | bidirectional",
  },
  {
    name: "entity_types",
    type: "array",
    reducer: "merge_array",
    description: "Entity types allowed to sync with this peer",
  },
  {
    name: "sync_scope",
    type: "string",
    required: true,
    description: "all | tagged",
  },
  {
    name: "auth_method",
    type: "string",
    required: true,
    description: "aauth | shared_secret",
  },
  {
    name: "shared_secret",
    type: "string",
    description: "HMAC secret for inbound /sync/webhook verification (redact in UI)",
  },
  {
    name: "peer_public_key_thumbprint",
    type: "string",
    description:
      "Optional AAuth public-key thumbprint expected from this peer when auth_method is aauth",
  },
  {
    name: "sync_target_user_id",
    type: "string",
    description:
      "Optional. Neotoma user_id on the peer instance used as target_user_id in outbound POST /sync/webhook payloads (receiver lookup of shared_secret)",
  },
  {
    name: "conflict_strategy",
    type: "string",
    required: true,
    description: "last_write_wins | source_priority | manual",
  },
  { name: "active", type: "boolean", required: true, description: "When false, peer is ignored" },
  { name: "last_sync_at", type: "date", description: "ISO last successful sync_peer run" },
  { name: "consecutive_failures", type: "number", description: "Failure counter for operators" },
];

function buildSchemaDefinition(): SchemaDefinition {
  const fields: Record<string, FieldDefinition> = {
    schema_version: { type: "string", required: true },
  };
  for (const spec of PEER_FIELDS) {
    fields[spec.name] = {
      type: spec.type,
      required: spec.required === true,
      ...(spec.description ? { description: spec.description } : {}),
    };
  }
  return {
    fields,
    canonical_name_fields: ["peer_id"],
  };
}

function buildReducerConfig(): ReducerConfig {
  const merge_policies: ReducerConfig["merge_policies"] = {
    schema_version: { strategy: "last_write" },
  };
  for (const spec of PEER_FIELDS) {
    merge_policies[spec.name] = { strategy: spec.reducer ?? "last_write" };
  }
  return { merge_policies };
}

export async function seedPeerConfigSchema(options?: {
  registry?: SchemaRegistryService;
}): Promise<SchemaRegistryEntry> {
  const registry = options?.registry ?? new SchemaRegistryService();
  const existing = await registry.loadGlobalSchema(PEER_CONFIG_ENTITY_TYPE);
  const definition = buildSchemaDefinition();
  const reducerConfig = buildReducerConfig();

  if (!existing) {
    return await registry.register({
      entity_type: PEER_CONFIG_ENTITY_TYPE,
      schema_version: "1.0",
      schema_definition: definition,
      reducer_config: reducerConfig,
      user_specific: false,
      activate: true,
      metadata: {
        label: "Peer config",
        description: "Cross-instance Neotoma peering and sync routing.",
        category: "agent_runtime",
      },
    });
  }

  const existingFieldNames = new Set(Object.keys(existing.schema_definition.fields ?? {}));
  const missing = PEER_FIELDS.filter((spec) => !existingFieldNames.has(spec.name));
  if (missing.length === 0) return existing;

  return await registry.updateSchemaIncremental({
    entity_type: PEER_CONFIG_ENTITY_TYPE,
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
