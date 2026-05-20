/**
 * Unit tests for workout_session schema definition (issue #209).
 *
 * Verifies that the workout_session entity type is registered with:
 *   - exercises field declared as array type with merge_array reducer strategy
 *   - canonical_name_fields covering session_id and name+date composite
 *   - all expected scalar fields
 */

import { describe, it, expect } from "vitest";
import {
  ENTITY_SCHEMAS,
  getSchemaDefinition,
} from "../../src/services/schema_definitions.js";

describe("workout_session schema (#209)", () => {
  const schema = ENTITY_SCHEMAS["workout_session"];

  it("is registered in ENTITY_SCHEMAS", () => {
    expect(schema).toBeDefined();
    expect(schema.entity_type).toBe("workout_session");
  });

  it("is retrievable via getSchemaDefinition", () => {
    const result = getSchemaDefinition("workout_session");
    expect(result).not.toBeNull();
    expect(result?.entity_type).toBe("workout_session");
  });

  it("has exercises declared as array field", () => {
    const { fields } = schema.schema_definition;
    expect(fields.exercises).toBeDefined();
    expect(fields.exercises.type).toBe("array");
  });

  it("uses merge_array strategy for exercises", () => {
    const { merge_policies } = schema.reducer_config;
    expect(merge_policies.exercises).toBeDefined();
    expect(merge_policies.exercises.strategy).toBe("merge_array");
  });

  it("declares canonical_name_fields with session_id as primary rule", () => {
    const { canonical_name_fields } = schema.schema_definition;
    expect(canonical_name_fields).toBeDefined();
    expect(Array.isArray(canonical_name_fields)).toBe(true);
    // First rule: scalar session_id
    const rules = canonical_name_fields as Array<string | { composite: string[] }>;
    expect(rules[0]).toBe("session_id");
  });

  it("includes name+date composite as fallback canonical_name rule", () => {
    const rules = schema.schema_definition
      .canonical_name_fields as Array<string | { composite: string[] }>;
    const compositeRule = rules.find(
      (r): r is { composite: string[] } =>
        typeof r === "object" && "composite" in r,
    );
    expect(compositeRule).toBeDefined();
    expect(compositeRule?.composite).toContain("name");
    expect(compositeRule?.composite).toContain("date");
  });

  it("has expected scalar fields with correct types", () => {
    const { fields } = schema.schema_definition;
    expect(fields.session_id?.type).toBe("string");
    expect(fields.name?.type).toBe("string");
    expect(fields.date?.type).toBe("date");
    expect(fields.duration_minutes?.type).toBe("number");
    expect(fields.notes?.type).toBe("string");
  });

  it("uses last_write for all scalar merge policies", () => {
    const { merge_policies } = schema.reducer_config;
    for (const field of ["name", "date", "started_at", "ended_at", "duration_minutes", "notes", "location"] as const) {
      expect(merge_policies[field]?.strategy).toBe("last_write");
    }
  });

  it("has health category metadata", () => {
    expect(schema.metadata?.category).toBe("health");
  });
});
