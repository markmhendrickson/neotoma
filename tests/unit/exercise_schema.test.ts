/**
 * Unit tests for exercise_log and exercise_set schema definitions (issue #246).
 *
 * Verifies that:
 *   - exercise_log is registered as a session container with date+workout_type identity
 *   - exercise_set is registered as a per-set entity with exercise_name+set_number identity
 *   - exercise_set has the expected weight and rep merge policies
 */

import { describe, it, expect } from "vitest";
import {
  ENTITY_SCHEMAS,
  getSchemaDefinition,
} from "../../src/services/schema_definitions.js";

describe("exercise_log schema (#246)", () => {
  const schema = ENTITY_SCHEMAS["exercise_log"];

  it("is registered in ENTITY_SCHEMAS", () => {
    expect(schema).toBeDefined();
    expect(schema.entity_type).toBe("exercise_log");
  });

  it("is retrievable via getSchemaDefinition", () => {
    const result = getSchemaDefinition("exercise_log");
    expect(result).not.toBeNull();
    expect(result?.entity_type).toBe("exercise_log");
  });

  it("has date as a required field", () => {
    const { fields } = schema.schema_definition;
    expect(fields.date).toBeDefined();
    expect(fields.date.type).toBe("date");
    expect(fields.date.required).toBe(true);
  });

  it("has workout_type as an optional string field", () => {
    const { fields } = schema.schema_definition;
    expect(fields.workout_type).toBeDefined();
    expect(fields.workout_type.type).toBe("string");
    expect(fields.workout_type.required).toBe(false);
  });

  it("has duration_minutes and notes as optional fields", () => {
    const { fields } = schema.schema_definition;
    expect(fields.duration_minutes?.type).toBe("number");
    expect(fields.notes?.type).toBe("string");
  });

  it("declares canonical_name_fields with date+workout_type composite as primary rule", () => {
    const { canonical_name_fields } = schema.schema_definition;
    expect(canonical_name_fields).toBeDefined();
    expect(Array.isArray(canonical_name_fields)).toBe(true);

    const rules = canonical_name_fields as Array<string | { composite: string[] }>;
    const primaryRule = rules[0];
    expect(typeof primaryRule).toBe("object");
    expect((primaryRule as { composite: string[] }).composite).toContain("date");
    expect((primaryRule as { composite: string[] }).composite).toContain("workout_type");
  });

  it("declares a temporal_fields entry for date", () => {
    const { temporal_fields } = schema.schema_definition;
    expect(temporal_fields).toBeDefined();
    expect(Array.isArray(temporal_fields)).toBe(true);
    const dateField = temporal_fields?.find((t) => t.field === "date");
    expect(dateField).toBeDefined();
  });

  it("uses last_write for session-level merge policies", () => {
    const { merge_policies } = schema.reducer_config;
    for (const field of ["date", "workout_type", "duration_minutes", "notes"] as const) {
      expect(merge_policies[field]?.strategy).toBe("last_write");
    }
  });

  it("has health category metadata", () => {
    expect(schema.metadata?.category).toBe("health");
  });

  it("does NOT have per-set fields (reps, weight_lbs, exercise_name)", () => {
    const { fields } = schema.schema_definition;
    // exercise_log is a session container; per-set fields belong on exercise_set
    expect(fields["reps"]).toBeUndefined();
    expect(fields["weight_lbs"]).toBeUndefined();
    expect(fields["exercise_name"]).toBeUndefined();
  });
});

describe("exercise_set schema (#246)", () => {
  const schema = ENTITY_SCHEMAS["exercise_set"];

  it("is registered in ENTITY_SCHEMAS", () => {
    expect(schema).toBeDefined();
    expect(schema.entity_type).toBe("exercise_set");
  });

  it("is retrievable via getSchemaDefinition", () => {
    const result = getSchemaDefinition("exercise_set");
    expect(result).not.toBeNull();
    expect(result?.entity_type).toBe("exercise_set");
  });

  it("has exercise_name as a required field", () => {
    const { fields } = schema.schema_definition;
    expect(fields.exercise_name).toBeDefined();
    expect(fields.exercise_name.type).toBe("string");
    expect(fields.exercise_name.required).toBe(true);
  });

  it("has date as a required field", () => {
    const { fields } = schema.schema_definition;
    expect(fields.date).toBeDefined();
    expect(fields.date.type).toBe("date");
    expect(fields.date.required).toBe(true);
  });

  it("has set_number as an optional number field", () => {
    const { fields } = schema.schema_definition;
    expect(fields.set_number).toBeDefined();
    expect(fields.set_number.type).toBe("number");
    expect(fields.set_number.required).toBe(false);
  });

  it("has weight_lbs and weight_kg as optional number fields", () => {
    const { fields } = schema.schema_definition;
    expect(fields.weight_lbs?.type).toBe("number");
    expect(fields.weight_kg?.type).toBe("number");
  });

  it("has reps as an optional number field", () => {
    const { fields } = schema.schema_definition;
    expect(fields.reps?.type).toBe("number");
  });

  it("has duration_seconds and distance_meters for timed/cardio sets", () => {
    const { fields } = schema.schema_definition;
    expect(fields.duration_seconds?.type).toBe("number");
    expect(fields.distance_meters?.type).toBe("number");
  });

  it("declares canonical_name_fields with exercise_name+set_number+date composite as primary rule", () => {
    const { canonical_name_fields } = schema.schema_definition;
    expect(canonical_name_fields).toBeDefined();
    expect(Array.isArray(canonical_name_fields)).toBe(true);

    const rules = canonical_name_fields as Array<string | { composite: string[] }>;
    const primaryRule = rules[0];
    expect(typeof primaryRule).toBe("object");
    const composite = (primaryRule as { composite: string[] }).composite;
    expect(composite).toContain("exercise_name");
    expect(composite).toContain("set_number");
    expect(composite).toContain("date");
  });

  it("has fallback canonical_name rule with exercise_name+date", () => {
    const rules = schema.schema_definition
      .canonical_name_fields as Array<string | { composite: string[] }>;
    const fallback = rules.find(
      (r): r is { composite: string[] } =>
        typeof r === "object" &&
        "composite" in r &&
        !(r as { composite: string[] }).composite.includes("set_number"),
    );
    expect(fallback).toBeDefined();
    expect(fallback?.composite).toContain("exercise_name");
    expect(fallback?.composite).toContain("date");
  });

  it("uses last_write for weight merge policies", () => {
    const { merge_policies } = schema.reducer_config;
    expect(merge_policies.weight_lbs?.strategy).toBe("last_write");
    expect(merge_policies.weight_kg?.strategy).toBe("last_write");
  });

  it("uses last_write for reps merge policy", () => {
    const { merge_policies } = schema.reducer_config;
    expect(merge_policies.reps?.strategy).toBe("last_write");
  });

  it("uses last_write for cardio/timed set merge policies", () => {
    const { merge_policies } = schema.reducer_config;
    expect(merge_policies.duration_seconds?.strategy).toBe("last_write");
    expect(merge_policies.distance_meters?.strategy).toBe("last_write");
  });

  it("has health category metadata", () => {
    expect(schema.metadata?.category).toBe("health");
  });
});
