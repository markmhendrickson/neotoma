/**
 * Regression tests for issue #163:
 * raw_fragments MUST NOT be written before entity resolution succeeds.
 *
 * When resolveEntity throws CanonicalNameUnresolvedError (e.g. the required
 * canonical_name_fields value is absent from the payload), the interpretation
 * loop must discard buffered fragments and write nothing to raw_fragments.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/db.js";
import { runInterpretation } from "../../src/services/interpretation.js";
import type { InterpretationConfig } from "../../src/services/interpretation.js";
import {
  cleanupTestEntityType,
  countRawFragments,
} from "../helpers/test_schema_helpers.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000163";
const ENTITY_TYPE = "fragment_ordering_regression_test";

const CONFIG: InterpretationConfig = {
  provider: "test",
  model_id: "test-model",
  temperature: 0.0,
  prompt_hash: "test_hash_163",
  code_version: "1.0.0",
};

async function insertSource(): Promise<string> {
  const { data, error } = await db
    .from("sources")
    .insert({
      user_id: TEST_USER_ID,
      original_filename: "regression163.json",
      mime_type: "application/json",
      file_size: 42,
      content_hash: `hash_163_${randomUUID()}`,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Failed to insert source: ${error?.message}`);
  return data.id;
}

async function seedSchema(): Promise<void> {
  // Schema requires "required_name" via canonical_name_fields.
  // "numeric_field" is a number — excluded from heuristic string-fallback.
  // When "required_name" is absent AND only numeric fields remain, resolveEntity
  // throws CanonicalNameUnresolvedError, causing the loop to skip the entity.
  await db.from("schema_registry").delete().eq("entity_type", ENTITY_TYPE);
  const { error } = await db.from("schema_registry").insert({
    entity_type: ENTITY_TYPE,
    schema_version: "1.0",
    schema_definition: {
      fields: {
        required_name: { type: "string" },
        numeric_field: { type: "number" },
      },
      canonical_name_fields: ["required_name"],
    },
    reducer_config: {
      merge_policies: {
        required_name: { strategy: "last_write", tie_breaker: "observed_at" },
        numeric_field: { strategy: "last_write", tie_breaker: "observed_at" },
      },
    },
    active: true,
    scope: "global",
    user_id: null,
  });
  if (error) throw new Error(`Failed to seed schema: ${error.message}`);
}

describe("interpretation fragment ordering (issue #163)", () => {
  let sourceId: string;

  beforeEach(async () => {
    await cleanupTestEntityType(ENTITY_TYPE, TEST_USER_ID);
    await seedSchema();
    sourceId = await insertSource();
  });

  afterEach(async () => {
    await cleanupTestEntityType(ENTITY_TYPE, TEST_USER_ID);
    // Clean up the source created in beforeEach
    await db.from("sources").delete().eq("id", sourceId);
  });

  it("does not write raw_fragments when entity resolution fails due to missing canonical name", async () => {
    // Payload deliberately omits "required_name" so resolveEntity throws
    // CanonicalNameUnresolvedError. Only a numeric field and an unknown string
    // field are present. The heuristic last-resort skips numeric values, so no
    // canonical name can be derived. "mystery_field" (unknown) and "numeric_field"
    // would become raw_fragment rows if written before resolution (the bug).
    const result = await runInterpretation({
      userId: TEST_USER_ID,
      sourceId,
      extractedData: [
        {
          entity_type: ENTITY_TYPE,
          numeric_field: 42,
          mystery_field: "unknown to schema",
          // required_name is intentionally absent — heuristic fallback will also
          // fail because numeric_field is not a string candidate.
        },
      ],
      config: CONFIG,
    });

    // Entity resolution failed — no observations should be created.
    expect(result.observationsCreated).toBe(0);
    expect(result.entities).toHaveLength(0);

    // And critically: no raw_fragment rows should exist for this entity type.
    const fragmentCount = await countRawFragments(ENTITY_TYPE, TEST_USER_ID);
    expect(fragmentCount).toBe(0);
  });

  it("writes raw_fragments normally when entity resolution succeeds", async () => {
    // Payload includes "required_name" so resolution succeeds.
    // "mystery_field" is unknown to the schema and should be stored as a
    // raw_fragment (the known-good path must still work after the fix).
    const result = await runInterpretation({
      userId: TEST_USER_ID,
      sourceId,
      extractedData: [
        {
          entity_type: ENTITY_TYPE,
          required_name: "Alice",
          numeric_field: 99,
          mystery_field: "unknown value",
        },
      ],
      config: CONFIG,
    });

    expect(result.observationsCreated).toBe(1);
    expect(result.entities).toHaveLength(1);

    // mystery_field is unknown to the schema → written as a raw_fragment.
    const fragmentCount = await countRawFragments(ENTITY_TYPE, TEST_USER_ID);
    expect(fragmentCount).toBeGreaterThan(0);
  });

  it("does not write fragments for a failing entity in a mixed batch", async () => {
    // Two entities in the same batch: one can resolve, one cannot.
    // Only the resolvable entity should produce raw_fragments.
    const result = await runInterpretation({
      userId: TEST_USER_ID,
      sourceId,
      extractedData: [
        {
          entity_type: ENTITY_TYPE,
          required_name: "Bob",
          mystery_field: "fragment for Bob",
        },
        {
          entity_type: ENTITY_TYPE,
          // required_name absent; only numeric known field — no string heuristic
          numeric_field: 7,
          mystery_field: "should NOT be stored",
        },
      ],
      config: CONFIG,
    });

    // Only the first entity resolves.
    expect(result.observationsCreated).toBe(1);
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].entityType).toBe(ENTITY_TYPE);

    // Fragments from the failing entity must not be written.
    // Only the mystery_field for "Bob" should be stored (1 row).
    const fragmentCount = await countRawFragments(ENTITY_TYPE, TEST_USER_ID);
    expect(fragmentCount).toBe(1);
  });
});
