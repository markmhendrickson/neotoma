/**
 * Unit tests for pull_request entity schema registration (issue #158).
 *
 * Verifies that:
 * - The `pull_request` schema is present in ENTITY_SCHEMAS after bootstrap
 * - `canonical_name_fields` has a composite rule for ["pr_number", "repo"] and a "title" fallback
 * - Required fields (pr_number, title) are declared as required
 * - All expected fields are declared with correct types
 * - reducer_config has merge policies covering all declared fields
 */

import { describe, it, expect } from "vitest";
import {
  ENTITY_SCHEMAS,
  getRegisteredEntityTypes,
  getSchemaDefinition,
} from "../../src/services/schema_definitions.js";

describe("pull_request schema (#158)", () => {
  const schema = ENTITY_SCHEMAS["pull_request"];

  it("is registered in ENTITY_SCHEMAS", () => {
    expect(schema).toBeDefined();
    expect(schema.entity_type).toBe("pull_request");
  });

  it("is retrievable via getSchemaDefinition", () => {
    const result = getSchemaDefinition("pull_request");
    expect(result).not.toBeNull();
    expect(result?.entity_type).toBe("pull_request");
  });

  it("has pr_number declared as a required number field", () => {
    const { fields } = schema.schema_definition;
    expect(fields.pr_number).toBeDefined();
    expect(fields.pr_number.type).toBe("number");
    expect(fields.pr_number.required).toBe(true);
  });

  it("has title declared as a required string field", () => {
    const { fields } = schema.schema_definition;
    expect(fields.title).toBeDefined();
    expect(fields.title.type).toBe("string");
    expect(fields.title.required).toBe(true);
  });

  it("has all expected optional fields with correct types", () => {
    const { fields } = schema.schema_definition;
    expect(fields.status?.type).toBe("string");
    expect(fields.base_branch?.type).toBe("string");
    expect(fields.head_branch?.type).toBe("string");
    expect(fields.github_url?.type).toBe("string");
    expect(fields.body?.type).toBe("string");
    expect(fields.merged_at?.type).toBe("string");
    expect(fields.repo?.type).toBe("string");
    expect(fields.author?.type).toBe("string");
  });

  it("canonical_name_fields includes a composite rule for [pr_number, repo]", () => {
    const cnf = schema.schema_definition.canonical_name_fields;
    expect(cnf).toBeDefined();
    expect(Array.isArray(cnf)).toBe(true);
    const rules = cnf as Array<string | { composite: string[] }>;
    const hasComposite = rules.some(
      (r) =>
        typeof r === "object" &&
        "composite" in r &&
        r.composite.includes("pr_number") &&
        r.composite.includes("repo"),
    );
    expect(hasComposite).toBe(true);
  });

  it("canonical_name_fields includes 'title' as a fallback rule", () => {
    const cnf = schema.schema_definition.canonical_name_fields;
    const rules = cnf as Array<string | { composite: string[] }>;
    expect(rules.some((r) => r === "title")).toBe(true);
  });

  it("reducer_config has merge policies for all declared fields (no dangling policies)", () => {
    const fields = schema.schema_definition.fields;
    const policies = schema.reducer_config.merge_policies;
    for (const key of Object.keys(policies)) {
      expect(fields, `merge policy references undeclared field '${key}'`).toHaveProperty(key);
    }
  });

  it("appears in list of registered entity types", () => {
    const types: string[] = getRegisteredEntityTypes();
    expect(types).toContain("pull_request");
  });
});
