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
  const references = schema.schema_definition.reference_fields;
  if (references !== undefined && (!Array.isArray(references) || references.length !== 0))
    throw new StoreConditionError(
      "VALIDATION_ERROR",
      "Conditional store requires no automatic references."
    );
  const rules = schema.schema_definition.canonical_name_fields;
  if (!Array.isArray(rules) || !rules.length)
    throw new StoreConditionError(
      "VALIDATION_ERROR",
      "Conditional store requires a complete declared identity."
    );
  // Registry validation owns the rule grammar. Every identity input must be a
  // declared, successfully typed/converted field rather than an advisory fragment.
  const identityFields = new Set<string>();
  for (const rule of rules) {
    const names = typeof rule === "string" ? [rule] : rule.composite;
    if (
      !Array.isArray(names) ||
      !names.length ||
      names.some((name) => !schema.schema_definition.fields[name])
    )
      throw new StoreConditionError("VALIDATION_ERROR", "The declared identity is invalid.");
    for (const name of names) identityFields.add(name);
  }
  // Conditional originals distinguish an explicitly supplied clear from absence.
  // Only declared nonidentity nulls bypass conversion: ordinary writes and every
  // identity input retain the shared validator's existing behavior. Constraints
  // and policy still inspect these retained values inside the write transaction.
  const converterFields = { ...fields };
  const declaredNulls: Record<string, null> = Object.create(null);
  for (const [name, value] of Object.entries(fields)) {
    if (
      value === null &&
      Object.hasOwn(schema.schema_definition.fields, name) &&
      !identityFields.has(name)
    ) {
      declaredNulls[name] = null;
      delete converterFields[name];
    }
  }
  const validated = validateFieldsWithConverters(converterFields, schema.schema_definition.fields);
  validated.validFields = { ...validated.validFields, ...declaredNulls };
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
