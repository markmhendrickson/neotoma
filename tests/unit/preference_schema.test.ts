/**
 * Unit tests for the `preference` entity schema (PR #308 / issue #160).
 *
 * The auto-issue-filing instructions tell agents to store an opt-out as
 * `{ entity_type: "preference", key: "auto_file_issues", value: false }` and to
 * look it up by `key`. For that lookup to match — rather than routing `key` to
 * raw_fragments and silently missing the opt-out — `key` MUST be a declared
 * field AND a canonical identity field on the schema.
 *
 * Verifies that:
 * - The `preference` schema is present in ENTITY_SCHEMAS
 * - `key` is declared as a string field
 * - `value` is declared and required (the opt-out value, e.g. false / "never")
 * - The legacy `title` identifier field is still declared (back-compat)
 * - `canonical_name_fields` resolves identity on `key` (and still on `title`)
 * - reducer_config merge policies reference only declared fields
 */

import { describe, it, expect } from "vitest";
import {
  ENTITY_SCHEMAS,
  getRegisteredEntityTypes,
  getSchemaDefinition,
} from "../../src/services/schema_definitions.js";

describe("preference schema (#160 auto-file opt-out)", () => {
  const schema = ENTITY_SCHEMAS["preference"];

  it("is registered in ENTITY_SCHEMAS", () => {
    expect(schema).toBeDefined();
    expect(schema.entity_type).toBe("preference");
  });

  it("is retrievable via getSchemaDefinition", () => {
    const result = getSchemaDefinition("preference");
    expect(result).not.toBeNull();
    expect(result?.entity_type).toBe("preference");
  });

  it("declares `key` as a string field (so key-based opt-out lookups match)", () => {
    const { fields } = schema.schema_definition;
    expect(fields.key, "`key` must be a declared field, not raw_fragments").toBeDefined();
    expect(fields.key.type).toBe("string");
  });

  it("declares `value` as a required field", () => {
    const { fields } = schema.schema_definition;
    expect(fields.value).toBeDefined();
    expect(fields.value.type).toBe("string");
    expect(fields.value.required).toBe(true);
  });

  it("retains the legacy `title` identifier field for back-compat", () => {
    const { fields } = schema.schema_definition;
    expect(fields.title).toBeDefined();
    expect(fields.title.type).toBe("string");
  });

  it("declares optional `scope` and `description` fields", () => {
    const { fields } = schema.schema_definition;
    expect(fields.scope?.type).toBe("string");
    expect(fields.description?.type).toBe("string");
  });

  it("resolves identity on `key` (auto_file_issues opt-out is matchable)", () => {
    const cnf = schema.schema_definition.canonical_name_fields;
    expect(cnf).toBeDefined();
    expect(Array.isArray(cnf)).toBe(true);
    const rules = cnf as Array<string | { composite: string[] }>;
    expect(rules.some((r) => r === "key")).toBe(true);
  });

  it("still resolves identity on legacy `title`", () => {
    const cnf = schema.schema_definition.canonical_name_fields;
    const rules = cnf as Array<string | { composite: string[] }>;
    expect(rules.some((r) => r === "title")).toBe(true);
  });

  it("reducer_config has merge policies for declared fields only (no dangling policies)", () => {
    const fields = schema.schema_definition.fields;
    const policies = schema.reducer_config.merge_policies;
    for (const key of Object.keys(policies)) {
      expect(fields, `merge policy references undeclared field '${key}'`).toHaveProperty(key);
    }
  });

  it("appears in list of registered entity types", () => {
    const types: string[] = getRegisteredEntityTypes();
    expect(types).toContain("preference");
  });
});
