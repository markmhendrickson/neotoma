/** Declared identity preparation only; the caller still owns schema/presence/write transaction. */
import type { SchemaRegistryEntry } from "./schema_registry.js";
import { validateFieldsWithConverters } from "./field_validation.js";
import {
  deriveCanonicalNameFromFieldsWithTrace,
  entityIdTenantSalt,
  generateEntityId,
} from "./entity_resolution.js";
import { canonicalStoreRequest, StoreConditionError } from "./store_condition_keys.js";

export function deriveConditionalStoreIdentity(
  schema: SchemaRegistryEntry,
  fields: Record<string, unknown>,
  owner: string
) {
  canonicalStoreRequest(fields);
  const derived = schema.schema_definition.derived_entities;
  if (derived !== undefined && (!Array.isArray(derived) || derived.length !== 0))
    throw new StoreConditionError(
      "VALIDATION_ERROR",
      "Conditional store requires no derived entities."
    );
  const rules = schema.schema_definition.canonical_name_fields;
  if (!Array.isArray(rules) || !rules.length)
    throw new StoreConditionError(
      "VALIDATION_ERROR",
      "Conditional store requires a complete declared identity."
    );
  // Registry validation owns the rule grammar. Every identity input must be a
  // declared, successfully typed/converted field rather than an advisory fragment.
  for (const rule of rules) {
    const names = typeof rule === "string" ? [rule] : rule.composite;
    if (
      !Array.isArray(names) ||
      !names.length ||
      names.some((name) => !schema.schema_definition.fields[name])
    )
      throw new StoreConditionError("VALIDATION_ERROR", "The declared identity is invalid.");
  }
  const validated = validateFieldsWithConverters(fields, schema.schema_definition.fields);
  let derivation;
  try {
    derivation = deriveCanonicalNameFromFieldsWithTrace(schema.entity_type, validated.validFields, {
      canonical_name_fields: rules,
      canonical_name_strict: true,
    });
  } catch {
    throw new StoreConditionError(
      "VALIDATION_ERROR",
      "The declared identity is incomplete or invalid."
    );
  }
  if (derivation.identityBasis !== "schema_rule")
    throw new StoreConditionError(
      "VALIDATION_ERROR",
      "A heuristic identity is not conditional creation authority."
    );
  return {
    ...validated,
    canonicalName: derivation.canonicalName,
    entityId: generateEntityId(
      schema.entity_type,
      derivation.canonicalName,
      entityIdTenantSalt(owner)
    ),
    identityRule: derivation.identityRule,
  };
}
