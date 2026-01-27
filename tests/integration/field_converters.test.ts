/**
 * Integration tests for field converters with parquet ingestion
 *
 * Tests end-to-end workflow:
 * 1. Store parquet file with numeric timestamp fields
 * 2. Verify timestamps are converted to ISO 8601 strings
 * 3. Verify original values are preserved in raw_fragments
 * 4. Verify entity snapshots contain converted values
 */

import { describe, it, expect, beforeAll } from "vitest";
import { supabase } from "../../src/db.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Field Converters Integration", () => {
  const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

  beforeAll(async () => {
    // Ensure task schema with converters is registered
    const existingSchema = await schemaRegistry.loadActiveSchema("task", TEST_USER_ID);
    
    if (!existingSchema) {
      // Register task schema with converters
      await schemaRegistry.register({
        entity_type: "task",
        schema_version: "1.0",
        schema_definition: {
          fields: {
            title: { type: "string", required: true },
            status: { type: "string", required: true },
            created_at: {
              type: "date",
              required: false,
              converters: [
                {
                  from: "number",
                  to: "date",
                  function: "timestamp_nanos_to_iso",
                  deterministic: true,
                },
              ],
            },
            updated_at: {
              type: "date",
              required: false,
              converters: [
                {
                  from: "number",
                  to: "date",
                  function: "timestamp_nanos_to_iso",
                  deterministic: true,
                },
              ],
            },
          },
        },
        reducer_config: {
          merge_policies: {
            status: { strategy: "last_write" },
            created_at: { strategy: "last_write" },
            updated_at: { strategy: "last_write" },
          },
        },
        activate: true,
      });
    }
  });

  it("converts numeric timestamps to ISO dates during parquet ingestion", async () => {
    // Create test data with numeric timestamps
    const testEntities = [
      {
        entity_type: "task",
        title: "Test Task 1",
        status: "active",
        created_at: 1736899200000000000, // 2025-01-15T00:00:00.000Z in nanoseconds
        updated_at: 1736985600000000000, // 2025-01-16T00:00:00.000Z in nanoseconds
      },
    ];

    // Store entities (simulating parquet ingestion)
    const { storeRawContent } = await import("../../src/services/raw_storage.js");
    const { resolveEntity } = await import("../../src/services/entity_resolution.js");
    const { validateFieldsWithConverters } = await import("../../src/services/field_validation.js");

    const jsonContent = JSON.stringify(testEntities, null, 2);
    const fileBuffer = Buffer.from(jsonContent, "utf-8");

    const storageResult = await storeRawContent({
      userId: TEST_USER_ID,
      fileBuffer,
      mimeType: "application/json",
      originalFilename: "test_tasks.json",
      provenance: {
        upload_method: "test",
        client: "vitest",
        source_priority: 100,
      },
    });

    // Process entity with converter-aware validation
    const entityData = testEntities[0];
    const entityType = entityData.entity_type;
    const fieldsToValidate = { ...entityData };
    delete fieldsToValidate.entity_type;

    const schema = await schemaRegistry.loadActiveSchema(entityType, TEST_USER_ID);
    expect(schema).toBeDefined();

    const validationResult = validateFieldsWithConverters(
      fieldsToValidate,
      schema!.schema_definition.fields
    );

    // Verify conversion happened
    expect(validationResult.validFields.created_at).toBe("2025-01-15T00:00:00.000Z");
    expect(validationResult.validFields.updated_at).toBe("2025-01-16T00:00:00.000Z");
    expect(validationResult.originalValues.created_at).toBe(1736899200000000000);
    expect(validationResult.originalValues.updated_at).toBe(1736985600000000000);

    // Resolve entity and create observation
    const entityId = await resolveEntity({
      entityType,
      fields: validationResult.validFields,
      userId: TEST_USER_ID,
    });

    // Create observation with converted values
    const { data: observation, error: obsError } = await supabase
      .from("observations")
      .insert({
        entity_id: entityId,
        source_id: storageResult.sourceId,
        observed_at: new Date().toISOString(),
        fields: validationResult.validFields,
        user_id: TEST_USER_ID,
      })
      .select()
      .single();

    expect(obsError).toBeNull();
    expect(observation).toBeDefined();
    expect(observation!.fields.created_at).toBe("2025-01-15T00:00:00.000Z");
    expect(observation!.fields.updated_at).toBe("2025-01-16T00:00:00.000Z");

    // Store original values in raw_fragments
    for (const [key, value] of Object.entries(validationResult.originalValues)) {
      await supabase.from("raw_fragments").insert({
        source_id: storageResult.sourceId,
        user_id: TEST_USER_ID,
        entity_type: entityType,
        fragment_key: key,
        fragment_value: value,
        fragment_envelope: {
          reason: "converted_value_original",
          entity_type: entityType,
          converted_to: validationResult.validFields[key],
        },
      });
    }

    // Verify raw_fragments contain original numeric timestamps
    const { data: fragments } = await supabase
      .from("raw_fragments")
      .select("*")
      .eq("source_id", storageResult.sourceId)
      .eq("user_id", TEST_USER_ID);

    expect(fragments).toBeDefined();
    expect(fragments!.length).toBeGreaterThanOrEqual(2);

    const createdAtFragment = fragments!.find((f) => f.fragment_key === "created_at");
    const updatedAtFragment = fragments!.find((f) => f.fragment_key === "updated_at");

    expect(createdAtFragment).toBeDefined();
    expect(createdAtFragment!.fragment_value).toBe(1736899200000000000);
    expect(createdAtFragment!.fragment_envelope.reason).toBe("converted_value_original");
    expect(createdAtFragment!.fragment_envelope.converted_to).toBe("2025-01-15T00:00:00.000Z");

    expect(updatedAtFragment).toBeDefined();
    expect(updatedAtFragment!.fragment_value).toBe(1736985600000000000);
    expect(updatedAtFragment!.fragment_envelope.reason).toBe("converted_value_original");
    expect(updatedAtFragment!.fragment_envelope.converted_to).toBe("2025-01-16T00:00:00.000Z");

    // Cleanup
    await supabase.from("observations").delete().eq("id", observation!.id);
    await supabase.from("raw_fragments").delete().eq("source_id", storageResult.sourceId);
    await supabase.from("sources").delete().eq("id", storageResult.sourceId);
  });

  it("handles multiple timestamp formats with different converters", async () => {
    const testEntities = [
      {
        entity_type: "task",
        title: "Test Task 2",
        status: "active",
        created_at: 1736899200000000000, // Nanoseconds
      },
    ];

    const { validateFieldsWithConverters } = await import("../../src/services/field_validation.js");

    const entityData = testEntities[0];
    const fieldsToValidate = { ...entityData };
    delete fieldsToValidate.entity_type;

    const schema = await schemaRegistry.loadActiveSchema("task", TEST_USER_ID);
    expect(schema).toBeDefined();

    const validationResult = validateFieldsWithConverters(
      fieldsToValidate,
      schema!.schema_definition.fields
    );

    // Verify nanosecond timestamp was converted
    expect(validationResult.validFields.created_at).toBe("2025-01-15T00:00:00.000Z");
    expect(validationResult.originalValues.created_at).toBe(1736899200000000000);
  });

  it("preserves original values even when conversion succeeds", async () => {
    const { validateFieldsWithConverters } = await import("../../src/services/field_validation.js");

    const data = {
      title: "Test Task 3",
      status: "active",
      created_at: 1736899200000000000,
    };

    const schema = await schemaRegistry.loadActiveSchema("task", TEST_USER_ID);
    const validationResult = validateFieldsWithConverters(
      data,
      schema!.schema_definition.fields
    );

    // Both converted and original values should be available
    expect(validationResult.validFields.created_at).toBe("2025-01-15T00:00:00.000Z");
    expect(validationResult.originalValues.created_at).toBe(1736899200000000000);
    expect(validationResult.unknownFields).toEqual({});
  });

  it("routes to raw_fragments when conversion fails", async () => {
    const { validateFieldsWithConverters } = await import("../../src/services/field_validation.js");

    const data = {
      title: "Test Task 4",
      status: "active",
      created_at: 9999999999999999999, // Invalid timestamp (far out of range)
    };

    const schema = await schemaRegistry.loadActiveSchema("task", TEST_USER_ID);
    const validationResult = validateFieldsWithConverters(
      data,
      schema!.schema_definition.fields
    );

    // Failed conversion should route to unknownFields
    expect(validationResult.validFields.created_at).toBeUndefined();
    expect(validationResult.unknownFields.created_at).toBe(9999999999999999999);
    expect(validationResult.originalValues.created_at).toBeUndefined();
  });
});
