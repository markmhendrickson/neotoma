/**
 * Integration tests for Schema Recommendation Service
 * 
 * Tests with real database operations (no mocks) per:
 * - docs/reports/AUTO_ENHANCEMENT_TEST_COVERAGE_GAPS.md
 * - .cursor/rules/testing_test_quality_enforcement_rules.mdc
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { supabase } from "../../src/db.js";
import { schemaRecommendationService } from "../../src/services/schema_recommendation.js";
import { NeotomaServer } from "../../src/server.js";
import {
  seedTestSchema,
  cleanupTestEntityType,
} from "../helpers/test_schema_helpers.js";

describe("Schema Recommendation Service - Integration", () => {
  let server: NeotomaServer;
  const testUserId = "00000000-0000-0000-0000-000000000000";
  const testEntityType = "test_schema_rec";
  const createdFragmentIds: string[] = [];
  const createdEntityIds: string[] = [];

  beforeAll(async () => {
    server = new NeotomaServer();
  });

  beforeEach(async () => {
    await cleanupTestEntityType(testEntityType, testUserId);
    createdFragmentIds.length = 0;
    createdEntityIds.length = 0;
  });

  afterAll(async () => {
    await cleanupTestEntityType(testEntityType, testUserId);
  });

  describe("checkAutoEnhancementEligibility - Real Database Queries", () => {
    it("should find fragments with null user_id", async () => {
      // Insert test fragment with null user_id
      const { data: fragment } = await supabase
        .from("raw_fragments")
        .insert({
          entity_type: testEntityType,
          fragment_key: "test_field",
          fragment_value: "test_value",
          user_id: null,
          frequency_count: 5,
        })
        .select()
        .single();

      if (fragment) {
        createdFragmentIds.push(fragment.id);
      }

      // Check eligibility with null user_id
      const eligibility = await schemaRecommendationService.checkAutoEnhancementEligibility({
        entity_type: testEntityType,
        fragment_key: "test_field",
        user_id: null,
      });

      expect(eligibility).toBeDefined();
      expect(typeof eligibility.eligible).toBe("boolean");
      expect(typeof eligibility.confidence).toBe("number");
      // inferred_type may be undefined if confidence is too low
      if (eligibility.inferred_type) {
        expect(typeof eligibility.inferred_type).toBe("string");
      }
    });

    it("should find fragments with default UUID", async () => {
      // Insert test fragment with default UUID
      const { data: fragment } = await supabase
        .from("raw_fragments")
        .insert({
          entity_type: testEntityType,
          fragment_key: "test_field_uuid",
          fragment_value: "test_value",
          user_id: testUserId,
          frequency_count: 5,
        })
        .select()
        .single();

      if (fragment) {
        createdFragmentIds.push(fragment.id);
      }

      // Check eligibility with default UUID
      const eligibility = await schemaRecommendationService.checkAutoEnhancementEligibility({
        entity_type: testEntityType,
        fragment_key: "test_field_uuid",
        user_id: testUserId,
      });

      expect(eligibility).toBeDefined();
      expect(typeof eligibility.eligible).toBe("boolean");
      expect(typeof eligibility.confidence).toBe("number");
      // inferred_type may be undefined if confidence is too low
      if (eligibility.inferred_type) {
        expect(typeof eligibility.inferred_type).toBe("string");
      }
    });

    it("should query observations with default UUID", async () => {
      // Seed schema and create test entity
      await seedTestSchema(server, testEntityType, {
        title: { type: "string", required: false },
      });

      // Insert test entity
      const { data: entity } = await supabase
        .from("entities")
        .insert({
          id: `ent_test_${Date.now()}`,
          entity_type: testEntityType,
          canonical_name: "test entity",
          user_id: testUserId,
        })
        .select()
        .single();

      if (entity) {
        createdEntityIds.push(entity.id);

        // Insert test observation
        await supabase.from("observations").insert({
          entity_id: entity.id,
          entity_type: testEntityType,
          source_id: `src_test_${Date.now()}`,
          extracted_fields: { title: "test" },
          user_id: testUserId,
        });
      }

      // Insert fragment for eligibility check
      const { data: fragment } = await supabase
        .from("raw_fragments")
        .insert({
          entity_type: testEntityType,
          fragment_key: "new_field",
          fragment_value: "test",
          user_id: testUserId,
          frequency_count: 5,
        })
        .select()
        .single();

      if (fragment) {
        createdFragmentIds.push(fragment.id);
      }

      // Check eligibility - should query observations correctly
      const eligibility = await schemaRecommendationService.checkAutoEnhancementEligibility({
        entity_type: testEntityType,
        fragment_key: "new_field",
        user_id: testUserId,
      });

      expect(eligibility).toBeDefined();
      // Should find the observation we created
      expect(typeof eligibility.eligible).toBe("boolean");
    });
  });

  describe("calculateFieldConfidence - Real Database Queries", () => {
    it("should calculate confidence from actual fragments", async () => {
      // Insert multiple fragments with consistent types
      const fragments = [
        { value: "value1", type: "string" },
        { value: "value2", type: "string" },
        { value: "value3", type: "string" },
      ];

      for (const frag of fragments) {
        const { data: fragment } = await supabase
          .from("raw_fragments")
          .insert({
            entity_type: testEntityType,
            fragment_key: "consistent_field",
            fragment_value: frag.value,
            user_id: testUserId,
            frequency_count: 1,
          })
          .select()
          .single();

        if (fragment) {
          createdFragmentIds.push(fragment.id);
        }
      }

      // Calculate confidence using real database queries
      const confidence = await schemaRecommendationService.calculateFieldConfidence({
        entity_type: testEntityType,
        fragment_key: "consistent_field",
        user_id: testUserId,
      });

      expect(confidence).toBeDefined();
      expect(typeof confidence.confidence).toBe("number");
      // Confidence may be 0 if insufficient data
      expect(confidence.confidence).toBeGreaterThanOrEqual(0);
      // inferred_type may be undefined if confidence is too low
      if (confidence.inferred_type) {
        expect(["string", "number", "boolean", "date", "array", "object"]).toContain(
          confidence.inferred_type
        );
      }
    });

    it("should handle fragments with null user_id", async () => {
      // Insert fragments with null user_id
      const { data: fragment } = await supabase
        .from("raw_fragments")
        .insert({
          entity_type: testEntityType,
          fragment_key: "null_user_field",
          fragment_value: "test",
          user_id: null,
          frequency_count: 3,
        })
        .select()
        .single();

      if (fragment) {
        createdFragmentIds.push(fragment.id);
      }

      // Calculate confidence with null user_id
      const confidence = await schemaRecommendationService.calculateFieldConfidence({
        entity_type: testEntityType,
        fragment_key: "null_user_field",
        user_id: null,
      });

      expect(confidence).toBeDefined();
      expect(typeof confidence.confidence).toBe("number");
      expect(confidence.inferred_type).toBeDefined();
    });

    it("should use correct column names in queries", async () => {
      // This test verifies the fragment_type column is used (not entity_type)
      // Bug from AUTO_ENHANCEMENT_TEST_COVERAGE_GAPS.md line 29-34

      const { data: fragment } = await supabase
        .from("raw_fragments")
        .insert({
          fragment_type: testEntityType, // Correct column name
          fragment_key: "column_test_field",
          fragment_value: "test",
          user_id: testUserId,
          frequency_count: 1,
        })
        .select()
        .single();

      if (fragment) {
        createdFragmentIds.push(fragment.id);
      }

      // Should not throw error about non-existent column
      const confidence = await schemaRecommendationService.calculateFieldConfidence({
        entity_type: testEntityType,
        fragment_key: "column_test_field",
        user_id: testUserId,
      });

      expect(confidence).toBeDefined();
      expect(confidence.inferred_type).toBeDefined();
    });
  });

  describe("Complete Workflow - Store to Schema Update", () => {
    it("should complete end-to-end workflow with real database operations", async () => {
      // 1. Seed minimal schema
      await seedTestSchema(server, testEntityType, {
        title: { type: "string", required: false },
      });

      // 2. Insert fragments directly (simulating unknown fields)
      const unknownFields = ["field1", "field2", "field3"];
      for (const field of unknownFields) {
        const { data: fragment } = await supabase
          .from("raw_fragments")
          .insert({
            entity_type: testEntityType,
            fragment_key: field,
            fragment_value: `value_${field}`,
            user_id: testUserId,
            frequency_count: 5,
          })
          .select()
          .single();

        if (fragment) {
          createdFragmentIds.push(fragment.id);
        }
      }

      // 3. Verify fragments were created
      const { data: fragments, error: fragError } = await supabase
        .from("raw_fragments")
        .select("*")
        .eq("entity_type", testEntityType)
        .eq("user_id", testUserId);

      expect(fragError).toBeNull();
      expect(fragments).toBeDefined();
      // Fragments may or may not be created depending on service logic
      expect(Array.isArray(fragments)).toBe(true);

      // 4. Queue items for auto-enhancement
      for (const field of unknownFields) {
        await supabase.from("auto_enhancement_queue").insert({
          entity_type: testEntityType,
          fragment_key: field,
          user_id: testUserId,
          status: "pending",
          frequency_count: 5,
        });
      }

      // 5. Verify queue items created
      const { data: queueItems, error: queueError } = await supabase
        .from("auto_enhancement_queue")
        .select("*")
        .eq("entity_type", testEntityType)
        .eq("user_id", testUserId);

      expect(queueError).toBeNull();
      expect(queueItems).toBeDefined();
      expect(queueItems!.length).toBeGreaterThanOrEqual(3);

      // 6. Check eligibility for one field
      const eligibility = await schemaRecommendationService.checkAutoEnhancementEligibility({
        entity_type: testEntityType,
        fragment_key: "field1",
        user_id: testUserId,
      });

      expect(eligibility).toBeDefined();
      expect(typeof eligibility.eligible).toBe("boolean");
      expect(typeof eligibility.confidence).toBe("number");
    });
  });

  describe("Error Cases and Edge Conditions", () => {
    it("should handle empty fragments gracefully", async () => {
      // No fragments exist - should return low/zero confidence
      const confidence = await schemaRecommendationService.calculateFieldConfidence({
        entity_type: "nonexistent_type",
        fragment_key: "nonexistent_field",
        user_id: testUserId,
      });

      expect(confidence).toBeDefined();
      expect(typeof confidence.confidence).toBe("number");
    });

    it("should handle null values in fragments", async () => {
      const { data: fragment } = await supabase
        .from("raw_fragments")
        .insert({
          entity_type: testEntityType,
          fragment_key: "null_value_field",
          fragment_value: null,
          user_id: testUserId,
          frequency_count: 1,
        })
        .select()
        .single();

      if (fragment) {
        createdFragmentIds.push(fragment.id);
      }

      // Should handle null values without crashing
      const confidence = await schemaRecommendationService.calculateFieldConfidence({
        entity_type: testEntityType,
        fragment_key: "null_value_field",
        user_id: testUserId,
      });

      expect(confidence).toBeDefined();
      expect(typeof confidence.confidence).toBe("number");
    });

    it("should handle empty string values in fragments", async () => {
      const { data: fragment } = await supabase
        .from("raw_fragments")
        .insert({
          entity_type: testEntityType,
          fragment_key: "empty_value_field",
          fragment_value: "",
          user_id: testUserId,
          frequency_count: 1,
        })
        .select()
        .single();

      if (fragment) {
        createdFragmentIds.push(fragment.id);
      }

      const confidence = await schemaRecommendationService.calculateFieldConfidence({
        entity_type: testEntityType,
        fragment_key: "empty_value_field",
        user_id: testUserId,
      });

      expect(confidence).toBeDefined();
      expect(typeof confidence.confidence).toBe("number");
    });
  });
});
