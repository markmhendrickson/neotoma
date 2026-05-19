/**
 * Unit tests for pull_request schema definition (issue #158).
 *
 * Verifies that the pull_request entity type is registered in the bootstrap
 * schema registry with:
 *   - canonical_name_fields covering repo + number composite and url fallback
 *   - temporal_fields for created_at, merged_at, and closed_at
 *   - reference_fields for author, repo, and linked_issues
 *   - all expected fields declared in schema_definition.fields
 *   - merge policies for mutable fields
 */

import { describe, it, expect } from "vitest";
import {
  ENTITY_SCHEMAS,
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

  it("has productivity category metadata", () => {
    expect(schema.metadata?.category).toBe("productivity");
  });

  it("metadata aliases include pr, github_pr, and merge_request", () => {
    const aliases = schema.metadata?.aliases ?? [];
    expect(aliases).toContain("pr");
    expect(aliases).toContain("github_pr");
    expect(aliases).toContain("merge_request");
  });

  // --- canonical_name_fields ---

  it("canonical_name_fields is defined and non-empty", () => {
    const { canonical_name_fields } = schema.schema_definition;
    expect(canonical_name_fields).toBeDefined();
    expect(Array.isArray(canonical_name_fields)).toBe(true);
    expect((canonical_name_fields ?? []).length).toBeGreaterThan(0);
  });

  it("canonical_name_fields includes a composite rule for number + repo", () => {
    const rules = schema.schema_definition
      .canonical_name_fields as Array<string | { composite: string[] }>;
    const compositeRule = rules.find(
      (r): r is { composite: string[] } =>
        typeof r === "object" && "composite" in r,
    );
    expect(compositeRule).toBeDefined();
    expect(compositeRule?.composite).toContain("number");
    expect(compositeRule?.composite).toContain("repo");
  });

  it("canonical_name_fields includes url as a fallback rule", () => {
    const rules = schema.schema_definition
      .canonical_name_fields as Array<string | { composite: string[] }>;
    const hasUrl = rules.some((r) => r === "url");
    expect(hasUrl).toBe(true);
  });

  // --- temporal_fields ---

  it("temporal_fields is defined", () => {
    expect(schema.schema_definition.temporal_fields).toBeDefined();
  });

  it("temporal_fields includes created_at with event_type pull_request_created", () => {
    const tf = schema.schema_definition.temporal_fields ?? [];
    const entry = tf.find((t) => t.field === "created_at");
    expect(entry).toBeDefined();
    expect(entry?.event_type).toBe("pull_request_created");
  });

  it("temporal_fields includes merged_at with event_type pull_request_merged", () => {
    const tf = schema.schema_definition.temporal_fields ?? [];
    const entry = tf.find((t) => t.field === "merged_at");
    expect(entry).toBeDefined();
    expect(entry?.event_type).toBe("pull_request_merged");
  });

  it("temporal_fields includes closed_at with event_type pull_request_closed", () => {
    const tf = schema.schema_definition.temporal_fields ?? [];
    const entry = tf.find((t) => t.field === "closed_at");
    expect(entry).toBeDefined();
    expect(entry?.event_type).toBe("pull_request_closed");
  });

  // --- reference_fields ---

  it("reference_fields is defined and non-empty", () => {
    const { reference_fields } = schema.schema_definition;
    expect(reference_fields).toBeDefined();
    expect(Array.isArray(reference_fields)).toBe(true);
    expect((reference_fields ?? []).length).toBeGreaterThan(0);
  });

  it("reference_fields links author to contact", () => {
    const refs = schema.schema_definition.reference_fields ?? [];
    const entry = refs.find((r) => r.field === "author");
    expect(entry).toBeDefined();
    expect(entry?.target_entity_type).toBe("contact");
    expect(entry?.relationship_type).toBe("REFERS_TO");
  });

  it("reference_fields links repo to github_repo", () => {
    const refs = schema.schema_definition.reference_fields ?? [];
    const entry = refs.find((r) => r.field === "repo");
    expect(entry).toBeDefined();
    expect(entry?.target_entity_type).toBe("github_repo");
    expect(entry?.relationship_type).toBe("REFERS_TO");
  });

  it("reference_fields links linked_issues to issue", () => {
    const refs = schema.schema_definition.reference_fields ?? [];
    const entry = refs.find((r) => r.field === "linked_issues");
    expect(entry).toBeDefined();
    expect(entry?.target_entity_type).toBe("issue");
    expect(entry?.relationship_type).toBe("REFERS_TO");
  });

  // --- field declarations ---

  it("required fields number and repo are declared", () => {
    const { fields } = schema.schema_definition;
    expect(fields.number).toBeDefined();
    expect(fields.number.type).toBe("number");
    expect(fields.number.required).toBe(true);
    expect(fields.repo).toBeDefined();
    expect(fields.repo.type).toBe("string");
    expect(fields.repo.required).toBe(true);
  });

  it("has expected optional fields declared", () => {
    const { fields } = schema.schema_definition;
    const optionalFields = [
      "url",
      "title",
      "body",
      "status",
      "author",
      "base_branch",
      "head_branch",
      "linked_issues",
      "created_at",
      "merged_at",
      "closed_at",
      "data_source",
      "source_quote",
    ];
    for (const f of optionalFields) {
      expect(fields, `expected field '${f}' in pull_request schema`).toHaveProperty(f);
    }
  });

  // --- merge policies ---

  it("reducer_config has last_write merge policies for mutable fields", () => {
    const { merge_policies } = schema.reducer_config;
    const mutableFields = [
      "title",
      "body",
      "status",
      "url",
      "author",
      "base_branch",
      "head_branch",
      "linked_issues",
      "merged_at",
      "closed_at",
    ] as const;
    for (const f of mutableFields) {
      expect(
        merge_policies[f]?.strategy,
        `expected last_write strategy for field '${f}'`,
      ).toBe("last_write");
    }
  });

  it("reducer_config merge policies do not reference undeclared fields", () => {
    const { fields } = schema.schema_definition;
    const { merge_policies } = schema.reducer_config;
    for (const key of Object.keys(merge_policies)) {
      expect(fields, `merge policy references undeclared field '${key}'`).toHaveProperty(key);
    }
  });

  it("reference_fields entries all reference declared fields", () => {
    const { fields, reference_fields } = schema.schema_definition;
    for (const ref of reference_fields ?? []) {
      expect(
        fields,
        `reference_field '${ref.field}' is not declared in schema fields`,
      ).toHaveProperty(ref.field);
    }
  });
});
