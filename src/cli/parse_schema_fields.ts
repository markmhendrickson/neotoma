/**
 * Parses the `--fields` JSON argument for `neotoma schemas register`.
 *
 * Three input forms are accepted:
 *   1. Object map: `{ fieldName: { type, required?, reducer_config?, ... } }`
 *   2. Pre-built schema object: `{ fields: { fieldName: { ... } }, reducer_config?: { merge_policies } }`
 *   3. Array form: `[{ field_name, field_type, required?, reducer_config? }, ...]`
 *
 * Per-field `reducer_config: { strategy, tie_breaker? }` is extracted from each field
 * definition and collected into the top-level `reducer_config.merge_policies` map that
 * the server expects — it must NOT remain inside the field definition.
 */

export interface FieldReducerConfig {
  strategy: string;
  tie_breaker?: string;
}

export interface ParsedSchemaFields {
  schemaFields: Record<string, Record<string, unknown>>;
  mergePolicies: Record<string, FieldReducerConfig>;
}

/**
 * Parse a raw `--fields` JSON value (already `JSON.parse`'d) into separated
 * `schemaFields` and `mergePolicies`.
 */
export function parseSchemaFields(parsedFields: unknown): ParsedSchemaFields {
  const mergePolicies: Record<string, FieldReducerConfig> = {};
  const schemaFields: Record<string, Record<string, unknown>> = {};

  function extractPolicy(fieldName: string, fieldDef: Record<string, unknown>): void {
    const rc = fieldDef["reducer_config"] as FieldReducerConfig | undefined;
    if (rc?.strategy) {
      const policy: FieldReducerConfig = { strategy: rc.strategy };
      if (rc.tie_breaker) {
        policy.tie_breaker = rc.tie_breaker;
      }
      mergePolicies[fieldName] = policy;
    }
  }

  if (Array.isArray(parsedFields)) {
    // Form 3: array of { field_name, field_type, required?, reducer_config?, ... }
    for (const f of parsedFields as Record<string, unknown>[]) {
      const fieldName = f["field_name"] as string;
      const { reducer_config: _rc, field_name: _fn, field_type, required, ...rest } = f;
      schemaFields[fieldName] = { type: field_type, required: required ?? false, ...rest };
      extractPolicy(fieldName, f);
    }
  } else if (
    parsedFields !== null &&
    typeof parsedFields === "object" &&
    "fields" in (parsedFields as object)
  ) {
    // Form 2: pre-built schema definition object with a top-level `fields` key
    const schemaObj = parsedFields as Record<string, unknown>;
    const rawFields = schemaObj["fields"] as Record<string, Record<string, unknown>>;
    for (const [fieldName, fieldDef] of Object.entries(rawFields)) {
      const { reducer_config: _rc, ...fieldProps } = fieldDef;
      schemaFields[fieldName] = fieldProps;
      extractPolicy(fieldName, fieldDef);
    }
    // Also honour any pre-existing top-level reducer_config.merge_policies
    const topLevelRc = schemaObj["reducer_config"] as
      | { merge_policies?: Record<string, FieldReducerConfig> }
      | undefined;
    if (topLevelRc?.merge_policies) {
      Object.assign(mergePolicies, topLevelRc.merge_policies);
    }
  } else {
    // Form 1: plain object map { fieldName: { type, required?, reducer_config?, ... } }
    for (const [name, def] of Object.entries(
      parsedFields as Record<string, Record<string, unknown>>
    )) {
      const { reducer_config: _rc, type, required, ...rest } = def;
      schemaFields[name] = { type: type ?? "string", required: required ?? false, ...rest };
      extractPolicy(name, def);
    }
  }

  return { schemaFields, mergePolicies };
}
