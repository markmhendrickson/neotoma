/**
 * Helpers for authoring bundle-originated entity schemas.
 *
 * A bundle schema is an ordinary {@link EntitySchema} (the same shape as the
 * built-in `ENTITY_SCHEMAS` entries) that lives under
 * `src/services/bundles/<bundle>/schemas/<entity_type>.ts`. It is deliberately
 * NOT added to `ENTITY_SCHEMAS`: a code-defined schema is a fallback that is
 * always present, which would bypass the `guided`-mode gate in
 * `enforcement.ts`. Bundle schemas reach the registry only through
 * {@link ../bundle_schemas.ts} when their bundle is enabled.
 *
 * See `docs/foundation/bundles.md` -> "Bundle schemas and seeding".
 */

import type {
  CanonicalNameRule,
  FieldDefinition,
  ReducerConfig,
  SchemaDefinition,
} from "../schema_registry.js";
import type { EntitySchema, EntitySchemaMetadata } from "../schema_definitions.js";

type MergePolicy = ReducerConfig["merge_policies"][string];

export interface BundleSchemaSpec {
  entity_type: string;
  /** Defaults to "1.0". */
  schema_version?: string;
  label: string;
  description: string;
  category?: EntitySchemaMetadata["category"];
  /** Alternate names that resolve to this type. */
  aliases?: string[];
  fields: Record<string, FieldDefinition>;
  /** Ordered identity rules. Exactly one of this or `identity_opt_out` is required (R2). */
  canonical_name_fields?: CanonicalNameRule[];
  identity_opt_out?: "heuristic_canonical_name";
  agent_instructions?: string;
  /**
   * Per-field merge policy overrides. Every declared field defaults to
   * `last_write`, which matches how these types are corrected in place today.
   */
  merge_policies?: Record<string, MergePolicy>;
}

/** Build an {@link EntitySchema} from a compact bundle schema spec. */
export function defineBundleSchema(spec: BundleSchemaSpec): EntitySchema {
  const fields: Record<string, FieldDefinition> = {
    schema_version: { type: "string", required: false },
    ...spec.fields,
  };

  const schema_definition: SchemaDefinition = { fields };
  if (spec.canonical_name_fields) {
    schema_definition.canonical_name_fields = spec.canonical_name_fields;
  }
  if (spec.identity_opt_out) {
    schema_definition.identity_opt_out = spec.identity_opt_out;
  }
  if (spec.agent_instructions) {
    schema_definition.agent_instructions = spec.agent_instructions;
  }

  const merge_policies: Record<string, MergePolicy> = {};
  for (const name of Object.keys(spec.fields)) {
    merge_policies[name] = { strategy: "last_write" };
  }
  Object.assign(merge_policies, spec.merge_policies ?? {});

  const metadata: EntitySchemaMetadata = {
    label: spec.label,
    description: spec.description,
    category: spec.category ?? "knowledge",
  };
  if (spec.aliases && spec.aliases.length > 0) {
    metadata.aliases = spec.aliases;
  }

  return {
    entity_type: spec.entity_type,
    schema_version: spec.schema_version ?? "1.0",
    metadata,
    schema_definition,
    reducer_config: { merge_policies },
  };
}

/** Shorthand field constructors, so schema files read as a field list. */
export const str = (
  description?: string,
  extra: Partial<FieldDefinition> = {}
): FieldDefinition => ({
  type: "string",
  required: false,
  ...(description ? { description } : {}),
  ...extra,
});
export const text = (description?: string): FieldDefinition =>
  str(description, { preserveCase: true });
export const num = (description?: string): FieldDefinition => ({
  type: "number",
  required: false,
  ...(description ? { description } : {}),
});
export const date = (description?: string): FieldDefinition => ({
  type: "date",
  required: false,
  ...(description ? { description } : {}),
});
export const bool = (description?: string): FieldDefinition => ({
  type: "boolean",
  required: false,
  ...(description ? { description } : {}),
});
export const list = (description?: string): FieldDefinition => ({
  type: "array",
  required: false,
  ...(description ? { description } : {}),
});
export const obj = (description?: string): FieldDefinition => ({
  type: "object",
  required: false,
  ...(description ? { description } : {}),
});
