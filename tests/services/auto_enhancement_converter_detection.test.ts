/**
 * Auto-Enhancement Converter Detection Tests
 *
 * Tests the enhanced auto-enhancement system that detects type mismatches
 * and automatically adds appropriate converters to existing schema fields.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../../src/db.js";
import { schemaRecommendationService } from "../../src/services/schema_recommendation.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";

// Use default UUID for global schemas (user_id column is NOT NULL)
const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";
const TEST_SOURCE_1 = "00000000-0000-0000-0000-000000000001";
const TEST_SOURCE_2 = "00000000-0000-0000-0000-000000000002";

describe("Auto-Enhancement Converter Detection", () => {
  beforeEach(async () => {
    // Clean up test data
    await db
      .from("raw_fragments")
      .delete()
      .eq("user_id", TEST_USER_ID);
    await db
      .from("schema_registry")
      .delete()
      .eq("entity_type", "test_converter_task");
    await db
      .from("schema_recommendations")
      .delete()
      .eq("entity_type", "test_converter_task");
    await db
      .from("auto_enhancement_queue")
      .delete()
      .eq("entity_type", "test_converter_task");
    await db.from("sources").delete().in("id", [TEST_SOURCE_1, TEST_SOURCE_2]);

    // Create test sources (required for foreign key constraint)
    await db.from("sources").insert([
      {
        id: TEST_SOURCE_1,
        content_hash: "test-hash-1",
        mime_type: "application/json",
        file_size: 100,
        user_id: TEST_USER_ID,
      },
      {
        id: TEST_SOURCE_2,
        content_hash: "test-hash-2",
        mime_type: "application/json",
        file_size: 100,
        user_id: TEST_USER_ID,
      },
    ]);
  });

  describe("detectConverterNeeded", () => {
    it("detects timestamp_nanos_to_iso converter for nanosecond timestamps", async () => {
      // Register schema with date field but no converter
      await schemaRegistry.register({
        entity_type: "test_converter_task",
        schema_version: "1.0",
        schema_definition: {
          fields: {
            title: { type: "string", required: true },
            created_at: { type: "date", required: false },
          },
        },
        reducer_config: {
          merge_policies: {
            created_at: { strategy: "last_write" },
          },
        },
        user_specific: false,
        activate: true,
      });

      // Create raw_fragments with nanosecond timestamps
      const nanosTimestamp = 1766102400000000000; // 2026-01-20 in nanoseconds
      const { data: insertResult, error: insertError } = await db
        .from("raw_fragments")
        .insert([
          {
            entity_type: "test_converter_task",
            fragment_key: "created_at",
            fragment_value: nanosTimestamp,
            fragment_envelope: { reason: "unknown_field" },
            user_id: TEST_USER_ID,
            source_id: "test-source-1",
          },
          {
            entity_type: "test_converter_task",
            fragment_key: "created_at",
            fragment_value: nanosTimestamp + 1000000000, // Different timestamp
            fragment_envelope: { reason: "unknown_field" },
            user_id: TEST_USER_ID,
            source_id: TEST_SOURCE_2, // Different source for diversity
          },
        ])
        .select();

      if (insertError) {
        console.error("Insert error:", insertError);
        throw insertError;
      }
      console.log("Insert result:", insertResult?.length, "fragments");

      // Check eligibility (should detect converter needed)
      const eligibility =
        await schemaRecommendationService.checkAutoEnhancementEligibility({
          entity_type: "test_converter_task",
          fragment_key: "created_at",
          user_id: undefined,
          config: {
            enabled: true,
            threshold: 1, // Low threshold for testing
            min_confidence: 0.8,
            auto_enhance_high_confidence: true,
            user_specific_aggressive: true,
            global_conservative: false,
          },
        });

      expect(eligibility.eligible).toBe(true);
      expect(eligibility.converter_suggestion).toBeDefined();
      expect(eligibility.converter_suggestion?.function).toBe(
        "timestamp_nanos_to_iso",
      );
      expect(eligibility.converter_suggestion?.from).toBe("number");
      expect(eligibility.converter_suggestion?.to).toBe("date");
      expect(eligibility.reasoning).toContain("nanosecond timestamps");
    });

    it("detects timestamp_ms_to_iso converter for millisecond timestamps", async () => {
      // Register schema
      await schemaRegistry.register({
        entity_type: "test_converter_task",
        schema_version: "1.0",
        schema_definition: {
          fields: {
            title: { type: "string", required: true },
            updated_at: { type: "date", required: false },
          },
        },
        reducer_config: {
          merge_policies: {
            updated_at: { strategy: "last_write" },
          },
        },
        user_specific: false,
        activate: true,
      });

      // Create raw_fragments with millisecond timestamps
      const msTimestamp = 1766102400000; // 2026-01-20 in milliseconds
      await db.from("raw_fragments").insert([
        {
          entity_type: "test_converter_task",
          fragment_key: "updated_at",
          fragment_value: msTimestamp,
          fragment_envelope: { reason: "unknown_field" },
          user_id: TEST_USER_ID,
          source_id: "test-source-1",
        },
        {
          entity_type: "test_converter_task",
          fragment_key: "updated_at",
          fragment_value: msTimestamp + 1000,
          fragment_envelope: { reason: "unknown_field" },
          user_id: TEST_USER_ID,
          source_id: TEST_SOURCE_2, // Different source for diversity
        },
      ]);

      // Check eligibility
      const eligibility =
        await schemaRecommendationService.checkAutoEnhancementEligibility({
          entity_type: "test_converter_task",
          fragment_key: "updated_at",
          user_id: TEST_USER_ID,
          config: {
            enabled: true,
            threshold: 1,
            min_confidence: 0.8,
            auto_enhance_high_confidence: true,
            user_specific_aggressive: true,
            global_conservative: false,
          },
        });

      expect(eligibility.eligible).toBe(true);
      expect(eligibility.converter_suggestion?.function).toBe(
        "timestamp_ms_to_iso",
      );
    });

    it("detects string_to_number converter for numeric strings", async () => {
      // Register schema with number field but no converter
      await schemaRegistry.register({
        entity_type: "test_converter_task",
        schema_version: "1.0",
        schema_definition: {
          fields: {
            title: { type: "string", required: true },
            amount: { type: "number", required: false },
          },
        },
        reducer_config: {
          merge_policies: {
            amount: { strategy: "last_write" },
          },
        },
        user_specific: false,
        activate: true,
      });

      // Create raw_fragments with numeric strings
      await db.from("raw_fragments").insert([
        {
          entity_type: "test_converter_task",
          fragment_key: "amount",
          fragment_value: "123.45",
          fragment_envelope: { reason: "unknown_field" },
          user_id: TEST_USER_ID,
          source_id: "test-source-1",
        },
        {
          entity_type: "test_converter_task",
          fragment_key: "amount",
          fragment_value: "678.90",
          fragment_envelope: { reason: "unknown_field" },
          user_id: TEST_USER_ID,
          source_id: TEST_SOURCE_2, // Different source for diversity
        },
      ]);

      // Check eligibility
      const eligibility =
        await schemaRecommendationService.checkAutoEnhancementEligibility({
          entity_type: "test_converter_task",
          fragment_key: "amount",
          user_id: TEST_USER_ID,
          config: {
            enabled: true,
            threshold: 1,
            min_confidence: 0.8,
            auto_enhance_high_confidence: true,
            user_specific_aggressive: true,
            global_conservative: false,
          },
        });

      expect(eligibility.eligible).toBe(true);
      expect(eligibility.converter_suggestion?.function).toBe("string_to_number");
    });

    it("returns null when types match (no converter needed)", async () => {
      // Register schema with date field
      await schemaRegistry.register({
        entity_type: "test_converter_task",
        schema_version: "1.0",
        schema_definition: {
          fields: {
            title: { type: "string", required: true },
            date_field: { type: "date", required: false },
          },
        },
        reducer_config: {
          merge_policies: {
            date_field: { strategy: "last_write" },
          },
        },
        user_specific: false,
        activate: true,
      });

      // Create raw_fragments with ISO date strings (already matches type)
      await db.from("raw_fragments").insert([
        {
          entity_type: "test_converter_task",
          fragment_key: "date_field",
          fragment_value: "2026-01-20T00:00:00.000Z",
          fragment_envelope: { reason: "unknown_field" },
          user_id: TEST_USER_ID,
          source_id: "test-source-1",
        },
        {
          entity_type: "test_converter_task",
          fragment_key: "date_field",
          fragment_value: "2026-01-21T00:00:00.000Z",
          fragment_envelope: { reason: "unknown_field" },
          user_id: TEST_USER_ID,
          source_id: "test-source-1",
        },
      ]);

      // Check eligibility (should fail - types already match)
      const eligibility =
        await schemaRecommendationService.checkAutoEnhancementEligibility({
          entity_type: "test_converter_task",
          fragment_key: "date_field",
          user_id: TEST_USER_ID,
          config: {
            enabled: true,
            threshold: 1,
            min_confidence: 0.8,
            auto_enhance_high_confidence: true,
            user_specific_aggressive: true,
            global_conservative: false,
          },
        });

      // Should not be eligible since types match
      expect(eligibility.eligible).toBe(false);
      expect(eligibility.converter_suggestion).toBeUndefined();
      expect(eligibility.reasoning).toContain("converter detection failed");
    });
  });

  describe("autoEnhanceSchema with converters", () => {
    it("creates add_converters recommendation when converter is suggested", async () => {
      // Register schema without converter
      await schemaRegistry.register({
        entity_type: "test_converter_task",
        schema_version: "1.0",
        schema_definition: {
          fields: {
            title: { type: "string", required: true },
            created_at: { type: "date", required: false },
          },
        },
        reducer_config: {
          merge_policies: {
            created_at: { strategy: "last_write" },
          },
        },
        user_specific: false,
        activate: true,
      });

      // Call autoEnhanceSchema with converter suggestion
      const recommendation = await schemaRecommendationService.autoEnhanceSchema(
        {
          entity_type: "test_converter_task",
          field_name: "created_at",
          field_type: "date",
          user_id: TEST_USER_ID,
          converter_suggestion: {
            from: "number",
            to: "date",
            function: "timestamp_nanos_to_iso",
            deterministic: true,
          },
        },
      );

      expect(recommendation).toBeDefined();

      // Verify recommendation was created with add_converters type
      const { data: storedRec } = await db
        .from("schema_recommendations")
        .select("*")
        .eq("entity_type", "test_converter_task")
        .eq("user_id", TEST_USER_ID)
        .single();

      expect(storedRec).toBeDefined();
      expect(storedRec.recommendation_type).toBe("add_converters");
      expect(storedRec.converters_to_add).toBeDefined();
      expect(storedRec.converters_to_add[0].field_name).toBe("created_at");
      expect(storedRec.converters_to_add[0].converter.function).toBe(
        "timestamp_nanos_to_iso",
      );
    });

    it("creates add_fields recommendation when field doesn't exist", async () => {
      // Register schema without the field
      await schemaRegistry.register({
        entity_type: "test_converter_task",
        schema_version: "1.0",
        schema_definition: {
          fields: {
            title: { type: "string", required: true },
          },
        },
        reducer_config: {
          merge_policies: {},
        },
        user_specific: false,
        activate: true,
      });

      // Call autoEnhanceSchema without converter (new field)
      const recommendation = await schemaRecommendationService.autoEnhanceSchema(
        {
          entity_type: "test_converter_task",
          field_name: "new_field",
          field_type: "string",
          user_id: TEST_USER_ID,
        },
      );

      expect(recommendation).toBeDefined();

      // Verify recommendation was created with add_fields type
      const { data: storedRec } = await db
        .from("schema_recommendations")
        .select("*")
        .eq("entity_type", "test_converter_task")
        .eq("user_id", TEST_USER_ID)
        .single();

      expect(storedRec).toBeDefined();
      expect(storedRec.recommendation_type).toBe("add_fields");
      expect(storedRec.fields_to_add).toBeDefined();
      expect(storedRec.fields_to_add[0].field_name).toBe("new_field");
    });
  });

  describe("updateSchemaIncremental with converters", () => {
    it("adds converter to existing field", async () => {
      // Register schema without converter
      const initialSchema = await schemaRegistry.register({
        entity_type: "test_converter_task",
        schema_version: "1.0",
        schema_definition: {
          fields: {
            title: { type: "string", required: true },
            created_at: { type: "date", required: false },
          },
        },
        reducer_config: {
          merge_policies: {
            created_at: { strategy: "last_write" },
          },
        },
        user_specific: false,
        activate: true,
      });

      // Verify no converter exists
      expect(initialSchema.schema_definition.fields.created_at.converters).toBeUndefined();

      // Update schema to add converter
      const updatedSchema = await schemaRegistry.updateSchemaIncremental({
        entity_type: "test_converter_task",
        converters_to_add: [
          {
            field_name: "created_at",
            converter: {
              from: "number",
              to: "date",
              function: "timestamp_nanos_to_iso",
              deterministic: true,
            },
          },
        ],
        user_specific: false,
        activate: true,
      });

      // Verify converter was added
      expect(updatedSchema.schema_definition.fields.created_at.converters).toBeDefined();
      expect(updatedSchema.schema_definition.fields.created_at.converters?.length).toBe(1);
      expect(updatedSchema.schema_definition.fields.created_at.converters?.[0].function).toBe(
        "timestamp_nanos_to_iso",
      );
      expect(updatedSchema.schema_version).toBe("1.1"); // Version incremented
    });

    it("prevents duplicate converters", async () => {
      // Register schema with converter already present
      await schemaRegistry.register({
        entity_type: "test_converter_task",
        schema_version: "1.0",
        schema_definition: {
          fields: {
            title: { type: "string", required: true },
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
          },
        },
        reducer_config: {
          merge_policies: {
            created_at: { strategy: "last_write" },
          },
        },
        user_specific: false,
        activate: true,
      });

      // Try to add same converter again
      const updatedSchema = await schemaRegistry.updateSchemaIncremental({
        entity_type: "test_converter_task",
        converters_to_add: [
          {
            field_name: "created_at",
            converter: {
              from: "number",
              to: "date",
              function: "timestamp_nanos_to_iso",
              deterministic: true,
            },
          },
        ],
        user_specific: false,
        activate: true,
      });

      // Verify still only one converter (no duplicates)
      expect(updatedSchema.schema_definition.fields.created_at.converters?.length).toBe(1);
    });

    it("throws error when adding converter to non-existent field", async () => {
      // Register schema without the field
      await schemaRegistry.register({
        entity_type: "test_converter_task",
        schema_version: "1.0",
        schema_definition: {
          fields: {
            title: { type: "string", required: true },
          },
        },
        reducer_config: {
          merge_policies: {},
        },
        user_specific: false,
        activate: true,
      });

      // Try to add converter to non-existent field
      await expect(
        schemaRegistry.updateSchemaIncremental({
          entity_type: "test_converter_task",
          converters_to_add: [
            {
              field_name: "non_existent_field",
              converter: {
                from: "number",
                to: "date",
                function: "timestamp_nanos_to_iso",
                deterministic: true,
              },
            },
          ],
          user_id: TEST_USER_ID,
          user_specific: true,
          activate: true,
        }),
      ).rejects.toThrow("does not exist in schema");
    });
  });

  describe("End-to-end converter auto-enhancement", () => {
    it("detects type mismatch and adds converter automatically", async () => {
      // Register schema with date field but no converter
      await schemaRegistry.register({
        entity_type: "test_converter_task",
        schema_version: "1.0",
        schema_definition: {
          fields: {
            title: { type: "string", required: true },
            created_at: { type: "date", required: false },
          },
        },
        reducer_config: {
          merge_policies: {
            created_at: { strategy: "last_write" },
          },
        },
        user_specific: false,
        activate: true,
      });

      // Create raw_fragments with nanosecond timestamps
      const nanosTimestamp = 1766102400000000000;
      await db.from("raw_fragments").insert([
        {
          entity_type: "test_converter_task",
          fragment_key: "created_at",
          fragment_value: nanosTimestamp,
          fragment_envelope: { reason: "unknown_field" },
          user_id: TEST_USER_ID,
          source_id: "test-source-1",
        },
        {
          entity_type: "test_converter_task",
          fragment_key: "created_at",
          fragment_value: nanosTimestamp + 1000000000,
          fragment_envelope: { reason: "unknown_field" },
          user_id: TEST_USER_ID,
          source_id: TEST_SOURCE_2, // Different source for diversity
        },
      ]);

      // Check eligibility
      const eligibility =
        await schemaRecommendationService.checkAutoEnhancementEligibility({
          entity_type: "test_converter_task",
          fragment_key: "created_at",
          user_id: TEST_USER_ID,
          config: {
            enabled: true,
            threshold: 1,
            min_confidence: 0.8,
            auto_enhance_high_confidence: true,
            user_specific_aggressive: true,
            global_conservative: false,
          },
        });

      expect(eligibility.eligible).toBe(true);
      expect(eligibility.converter_suggestion).toBeDefined();

      // Auto-enhance schema
      await schemaRecommendationService.autoEnhanceSchema({
        entity_type: "test_converter_task",
        field_name: "created_at",
        field_type: "date",
        user_id: TEST_USER_ID,
        converter_suggestion: eligibility.converter_suggestion,
      });

      // Update schema with converter
      await schemaRegistry.updateSchemaIncremental({
        entity_type: "test_converter_task",
        converters_to_add: [
          {
            field_name: "created_at",
            converter: eligibility.converter_suggestion!,
          },
        ],
        user_specific: false,
        activate: true,
        migrate_existing: false, // Skip migration for this test
      });

      // Verify schema was updated
      const updatedSchema = await schemaRegistry.loadActiveSchema(
        "test_converter_task",
        TEST_USER_ID,
      );

      expect(updatedSchema).toBeDefined();
      expect(updatedSchema!.schema_definition.fields.created_at.converters).toBeDefined();
      expect(updatedSchema!.schema_definition.fields.created_at.converters?.length).toBe(1);
      expect(
        updatedSchema!.schema_definition.fields.created_at.converters?.[0].function,
      ).toBe("timestamp_nanos_to_iso");
    });
  });
});
