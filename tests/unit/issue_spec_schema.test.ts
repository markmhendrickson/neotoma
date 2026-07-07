/**
 * Unit tests for issue_spec entity schema registration.
 *
 * Backs ateles#178 (swarm issue-spec pipeline). Verifies that:
 * - The `issue_spec` schema is present in ENTITY_SCHEMAS after bootstrap
 * - `canonical_name_fields` has a composite rule for ["repo", "issue_number"]
 *   and a "spec_key" fallback so two stores for the same repo#number resolve
 *   to the SAME entity (agents correct in place)
 * - Required fields (repo, issue_number) are declared as required
 * - All expected per-agent section + bookkeeping fields are declared with
 *   correct types
 * - reducer_config has merge policies covering only declared fields
 */

import { describe, it, expect } from "vitest";
import {
  ENTITY_SCHEMAS,
  getRegisteredEntityTypes,
  getSchemaDefinition,
} from "../../src/services/schema_definitions.js";
import { deriveCanonicalNameFromFieldsWithTrace } from "../../src/services/entity_resolution.js";

describe("issue_spec schema (ateles#178)", () => {
  const schema = ENTITY_SCHEMAS["issue_spec"];

  it("is registered in ENTITY_SCHEMAS", () => {
    expect(schema).toBeDefined();
    expect(schema.entity_type).toBe("issue_spec");
  });

  it("is retrievable via getSchemaDefinition", () => {
    const result = getSchemaDefinition("issue_spec");
    expect(result).not.toBeNull();
    expect(result?.entity_type).toBe("issue_spec");
  });

  it("has repo declared as a required string field", () => {
    const { fields } = schema.schema_definition;
    expect(fields.repo).toBeDefined();
    expect(fields.repo.type).toBe("string");
    expect(fields.repo.required).toBe(true);
  });

  it("has issue_number declared as a required number field", () => {
    const { fields } = schema.schema_definition;
    expect(fields.issue_number).toBeDefined();
    expect(fields.issue_number.type).toBe("number");
    expect(fields.issue_number.required).toBe(true);
  });

  it("has all expected section + bookkeeping fields with correct types", () => {
    const { fields } = schema.schema_definition;
    expect(fields.spec_key?.type).toBe("string");
    expect(fields.title?.type).toBe("string");
    expect(fields.pm_section?.type).toBe("string");
    expect(fields.design_section?.type).toBe("string");
    expect(fields.eng_section?.type).toBe("string");
    expect(fields.qa_section?.type).toBe("string");
    expect(fields.security_section?.type).toBe("string");
    expect(fields.legal_section?.type).toBe("string");
    expect(fields.sequence_state?.type).toBe("array");
    expect(fields.last_updated_at?.type).toBe("string");
    expect(fields.last_mirrored_at?.type).toBe("string");
  });

  it("canonical_name_fields includes a composite rule for [repo, issue_number]", () => {
    const cnf = schema.schema_definition.canonical_name_fields;
    expect(cnf).toBeDefined();
    expect(Array.isArray(cnf)).toBe(true);
    const rules = cnf as Array<string | { composite: string[] }>;
    const hasComposite = rules.some(
      (r) =>
        typeof r === "object" &&
        "composite" in r &&
        r.composite.includes("repo") &&
        r.composite.includes("issue_number")
    );
    expect(hasComposite).toBe(true);
  });

  it("canonical_name_fields includes 'spec_key' as a fallback rule", () => {
    const cnf = schema.schema_definition.canonical_name_fields;
    const rules = cnf as Array<string | { composite: string[] }>;
    expect(rules.some((r) => r === "spec_key")).toBe(true);
  });

  it("reducer_config has merge policies for only declared fields (no dangling policies)", () => {
    const fields = schema.schema_definition.fields;
    const policies = schema.reducer_config.merge_policies;
    for (const key of Object.keys(policies)) {
      expect(fields, `merge policy references undeclared field '${key}'`).toHaveProperty(key);
    }
  });

  it("appears in list of registered entity types", () => {
    const types: string[] = getRegisteredEntityTypes();
    expect(types).toContain("issue_spec");
  });

  it("two stores for the same (repo, issue_number) derive the SAME canonical_name (identity dedup)", () => {
    const base = {
      repo: "markmhendrickson/neotoma",
      issue_number: 178,
      spec_key: "markmhendrickson/neotoma#178",
    };
    const a = deriveCanonicalNameFromFieldsWithTrace(
      "issue_spec",
      { ...base, pm_section: "first pass" },
      { canonical_name_fields: schema.schema_definition.canonical_name_fields }
    );
    const b = deriveCanonicalNameFromFieldsWithTrace(
      "issue_spec",
      { ...base, eng_section: "later pass" },
      { canonical_name_fields: schema.schema_definition.canonical_name_fields }
    );
    expect(a.canonicalName).toBeTruthy();
    expect(a.canonicalName).toBe(b.canonicalName);
    expect(a.identityBasis).toBe("schema_rule");
  });

  it("different issue numbers derive DIFFERENT canonical_names (distinct entities)", () => {
    const a = deriveCanonicalNameFromFieldsWithTrace(
      "issue_spec",
      { repo: "markmhendrickson/neotoma", issue_number: 178 },
      { canonical_name_fields: schema.schema_definition.canonical_name_fields }
    );
    const b = deriveCanonicalNameFromFieldsWithTrace(
      "issue_spec",
      { repo: "markmhendrickson/neotoma", issue_number: 179 },
      { canonical_name_fields: schema.schema_definition.canonical_name_fields }
    );
    expect(a.canonicalName).not.toBe(b.canonicalName);
  });
});
