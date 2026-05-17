/**
 * Regression tests for issue #164:
 * no-schema fallback MUST surface affected entity types in the response and
 * use a distinct fragment reason when schema auto-registration was attempted
 * but failed.
 *
 * This test exercises:
 * - `noSchemaEntityTypes` populated in InterpretationResult
 * - Fragment reason set to "no_schema_registration_failed" when creation tried
 * - Fragment reason set to "no_schema" when creation is disabled via config
 * - Normal (schema-present) entities are not included in noSchemaEntityTypes
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/db.js";
import { runInterpretation } from "../../src/services/interpretation.js";
import type { InterpretationConfig } from "../../src/services/interpretation.js";
import { cleanupTestEntityType } from "../helpers/test_schema_helpers.js";

// Unique test user to avoid cross-test pollution.
const TEST_USER_ID = "00000000-0000-0000-0000-000000000164";

// An entity type that will NEVER have a schema seeded in these tests.
const UNKNOWN_TYPE = "no_schema_regression_unknown_type_164";

// An entity type that has a real schema and should resolve normally.
const KNOWN_TYPE = "no_schema_regression_known_type_164";

const CONFIG: InterpretationConfig = {
  provider: "test",
  model_id: "test-model",
  temperature: 0.0,
  prompt_hash: "test_hash_164",
  code_version: "1.0.0",
};

async function insertSource(): Promise<string> {
  const { data, error } = await db
    .from("sources")
    .insert({
      user_id: TEST_USER_ID,
      original_filename: "regression164.json",
      mime_type: "application/json",
      file_size: 42,
      content_hash: `hash_164_${randomUUID()}`,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Failed to insert source: ${error?.message}`);
  return data.id;
}

async function seedKnownSchema(): Promise<void> {
  await db.from("schema_registry").delete().eq("entity_type", KNOWN_TYPE);
  const { error } = await db.from("schema_registry").insert({
    entity_type: KNOWN_TYPE,
    schema_version: "1.0",
    schema_definition: {
      fields: {
        label: { type: "string" },
      },
      canonical_name_fields: ["label"],
    },
    reducer_config: {
      merge_policies: {
        label: { strategy: "last_write", tie_breaker: "observed_at" },
      },
    },
    active: true,
    scope: "global",
    user_id: null,
  });
  if (error) throw new Error(`Failed to seed known schema: ${error.message}`);
}

describe("interpretation no-schema fallback (issue #164)", () => {
  let sourceId: string;

  beforeEach(async () => {
    await cleanupTestEntityType(UNKNOWN_TYPE, TEST_USER_ID);
    await cleanupTestEntityType(KNOWN_TYPE, TEST_USER_ID);
    await seedKnownSchema();
    sourceId = await insertSource();
  });

  afterEach(async () => {
    await cleanupTestEntityType(UNKNOWN_TYPE, TEST_USER_ID);
    await cleanupTestEntityType(KNOWN_TYPE, TEST_USER_ID);
    await db.from("sources").delete().eq("id", sourceId);
  });

  it("populates noSchemaEntityTypes when an entity type has no schema and auto-registration fails", async () => {
    // Provide only entity_type with no other fields — buildSchemaFromExtractedFields
    // skips entity_type and produces only the default schema_version field, so
    // fields.length === 1 and ensureSchemaForExtractedEntity returns null.
    // Reason becomes "no_schema_registration_failed".
    const result = await runInterpretation({
      userId: TEST_USER_ID,
      sourceId,
      extractedData: [
        {
          entity_type: UNKNOWN_TYPE,
          // No data fields — schema builder produces too-sparse output and refuses.
        },
      ],
      config: CONFIG,
    });

    expect(result.observationsCreated).toBe(0);
    expect(result.entities).toHaveLength(0);
    expect(result.noSchemaEntityTypes).toBeDefined();
    expect(result.noSchemaEntityTypes).toContain(UNKNOWN_TYPE);

    // Verify the raw_fragment was written with the expected "registration_failed" reason.
    const { data: fragments } = await db
      .from("raw_fragments")
      .select("fragment_key, fragment_envelope")
      .eq("entity_type", UNKNOWN_TYPE)
      .eq("user_id", TEST_USER_ID);

    expect(fragments).toBeDefined();
    expect(fragments!.length).toBeGreaterThan(0);
    // The fragment_key for a no-schema fallback is "full_entity".
    expect(fragments![0].fragment_key).toBe("full_entity");
    // When schema registration was attempted (and failed), the envelope reason
    // should be "no_schema_registration_failed", not the generic "no_schema".
    expect(fragments![0].fragment_envelope?.reason).toBe("no_schema_registration_failed");
  });

  it("does not include normally-resolved entity types in noSchemaEntityTypes", async () => {
    // KNOWN_TYPE has a schema — it should produce an observation and not appear
    // in noSchemaEntityTypes.
    const result = await runInterpretation({
      userId: TEST_USER_ID,
      sourceId,
      extractedData: [
        {
          entity_type: KNOWN_TYPE,
          label: "test entity",
        },
      ],
      config: CONFIG,
    });

    expect(result.observationsCreated).toBe(1);
    expect(result.entities).toHaveLength(1);
    expect(result.noSchemaEntityTypes ?? []).not.toContain(KNOWN_TYPE);
  });

  it("only lists the no-schema type in noSchemaEntityTypes in a mixed batch", async () => {
    // KNOWN_TYPE resolves normally; UNKNOWN_TYPE falls to no-schema.
    const result = await runInterpretation({
      userId: TEST_USER_ID,
      sourceId,
      extractedData: [
        {
          entity_type: KNOWN_TYPE,
          label: "known entity in mixed batch",
        },
        {
          entity_type: UNKNOWN_TYPE,
          // No data fields — schema builder produces too-sparse output and refuses.
        },
      ],
      config: CONFIG,
    });

    // Only KNOWN_TYPE produces an observation.
    expect(result.observationsCreated).toBe(1);
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].entityType).toBe(KNOWN_TYPE);

    // noSchemaEntityTypes lists UNKNOWN_TYPE but not KNOWN_TYPE.
    expect(result.noSchemaEntityTypes).toBeDefined();
    expect(result.noSchemaEntityTypes).toContain(UNKNOWN_TYPE);
    expect(result.noSchemaEntityTypes).not.toContain(KNOWN_TYPE);
  });

  it("uses reason 'no_schema' when create_schema_for_unknown is disabled", async () => {
    // With create_schema_for_unknown: false, the no-schema path fires but
    // schema creation is never attempted — reason stays "no_schema".
    const result = await runInterpretation({
      userId: TEST_USER_ID,
      sourceId,
      extractedData: [
        {
          entity_type: UNKNOWN_TYPE,
          // No data fields — schema builder would refuse anyway, but creation is also disabled.
        },
      ],
      config: { ...CONFIG, create_schema_for_unknown: false },
    });

    expect(result.observationsCreated).toBe(0);
    expect(result.noSchemaEntityTypes).toContain(UNKNOWN_TYPE);

    const { data: fragments } = await db
      .from("raw_fragments")
      .select("fragment_envelope")
      .eq("entity_type", UNKNOWN_TYPE)
      .eq("user_id", TEST_USER_ID);

    expect(fragments).toBeDefined();
    expect(fragments!.length).toBeGreaterThan(0);
    expect(fragments![0].fragment_envelope?.reason).toBe("no_schema");
  });
});
