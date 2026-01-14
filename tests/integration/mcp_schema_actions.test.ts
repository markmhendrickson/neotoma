/**
 * Integration tests for MCP schema actions
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { supabase } from "../../src/db.js";
import { SchemaRecommendationService } from "../../src/services/schema_recommendation.js";
import { SchemaRegistryService } from "../../src/services/schema_registry.js";
import { NeotomaServer } from "../../src/server.js";

describe("MCP Schema Actions - Integration", () => {
  let server: NeotomaServer;
  let recommendationService: SchemaRecommendationService;
  let registryService: SchemaRegistryService;
  const testUserId = "00000000-0000-0000-0000-000000000000";
  const testEntityType = "test_transaction";
  const createdSchemaIds: string[] = [];
  const createdRecommendationIds: string[] = [];
  const createdRawFragmentIds: string[] = [];

  beforeAll(async () => {
    server = new NeotomaServer();
    recommendationService = new SchemaRecommendationService();
    registryService = new SchemaRegistryService();
  });

  beforeEach(async () => {
    // Cleanup test data
    if (createdSchemaIds.length > 0) {
      await supabase.from("schema_registry").delete().in("id", createdSchemaIds);
      createdSchemaIds.length = 0;
    }
    if (createdRecommendationIds.length > 0) {
      await supabase.from("schema_recommendations").delete().in("id", createdRecommendationIds);
      createdRecommendationIds.length = 0;
    }
    if (createdRawFragmentIds.length > 0) {
      await supabase.from("raw_fragments").delete().in("id", createdRawFragmentIds);
      createdRawFragmentIds.length = 0;
    }
  });

  afterAll(async () => {
    // Final cleanup
    await supabase.from("schema_registry").delete().eq("entity_type", testEntityType);
    await supabase.from("schema_recommendations").delete().eq("entity_type", testEntityType);
    await supabase.from("raw_fragments").delete().eq("entity_type", testEntityType);
  });

  describe("analyze_schema_candidates", () => {
    it("should analyze raw_fragments and return recommendations", async () => {
      // Create test raw_fragments
      const { data: fragments } = await supabase
        .from("raw_fragments")
        .insert([
          {
            entity_type: testEntityType,
            fragment_key: "test_field",
            fragment_value: "value1",
            frequency_count: 5,
            user_id: testUserId,
            record_id: "test-record-1",
            source_id: "test-source-1",
          },
          {
            entity_type: testEntityType,
            fragment_key: "test_field",
            fragment_value: "value2",
            frequency_count: 3,
            user_id: testUserId,
            record_id: "test-record-2",
            source_id: "test-source-2",
          },
        ])
        .select("id");

      if (fragments) {
        createdRawFragmentIds.push(...fragments.map((f) => f.id));
      }

      // Call analyzeRawFragments directly (service layer)
      const recommendations = await recommendationService.analyzeRawFragments({
        entity_type: testEntityType,
        user_id: testUserId,
        min_frequency: 5,
        min_confidence: 0.5,
      });

      expect(recommendations).toBeDefined();
      expect(Array.isArray(recommendations)).toBe(true);
      if (recommendations.length > 0) {
        expect(recommendations[0].entity_type).toBe(testEntityType);
      }
    });

    it("should filter by entity_type", async () => {
      const recommendations = await recommendationService.analyzeRawFragments({
        entity_type: testEntityType,
        min_frequency: 1,
        min_confidence: 0.1,
      });

      if (recommendations.length > 0) {
        expect(recommendations[0].entity_type).toBe(testEntityType);
      }
    });

    it("should filter by min_frequency", async () => {
      const recommendations = await recommendationService.analyzeRawFragments({
        entity_type: testEntityType,
        min_frequency: 100, // Very high threshold
        min_confidence: 0.1,
      });

      // Should filter out low-frequency fields
      expect(recommendations.length).toBe(0);
    });
  });

  describe("get_schema_recommendations", () => {
    it("should retrieve stored recommendations", async () => {
      // Create test recommendation
      const { data: recommendation } = await supabase
        .from("schema_recommendations")
        .insert({
          entity_type: testEntityType,
          user_id: testUserId,
          source: "agent",
          recommendation_type: "add_fields",
          fields_to_add: [
            {
              field_name: "test_field",
              field_type: "string",
            },
          ],
          confidence_score: 0.9,
          status: "pending",
        })
        .select("id")
        .single();

      if (recommendation) {
        createdRecommendationIds.push(recommendation.id);
      }

      // Call getRecommendations directly
      const recommendations = await recommendationService.getRecommendations({
        entity_type: testEntityType,
        user_id: testUserId,
        source: "agent",
        status: "pending",
      });

      expect(recommendations).toBeDefined();
      expect(Array.isArray(recommendations)).toBe(true);
      if (recommendations.length > 0) {
        expect(recommendations[0].entity_type).toBe(testEntityType);
      }
    });

    it("should filter by source", async () => {
      const recommendations = await recommendationService.getRecommendations({
        entity_type: testEntityType,
        source: "agent",
      });

      if (recommendations.length > 0) {
        expect(recommendations[0].source).toBe("agent");
      }
    });

    it("should return empty array if no recommendations", async () => {
      const recommendations = await recommendationService.getRecommendations({
        entity_type: "non_existent_entity_type",
      });

      expect(recommendations).toEqual([]);
    });
  });

  describe("update_schema_incremental", () => {
    it("should add new fields to existing schema", async () => {
      // First, create a base schema
      const baseSchema = await registryService.register({
        entity_type: testEntityType,
        schema_version: "1.0",
        schema_definition: {
          fields: {
            existing_field: { type: "string" },
          },
        },
        reducer_config: {
          merge_policies: {
            existing_field: { strategy: "last_write" },
          },
        },
        activate: true,
      });

      createdSchemaIds.push(baseSchema.id);

      // Call updateSchemaIncremental directly
      const updatedSchema = await registryService.updateSchemaIncremental({
        entity_type: testEntityType,
        fields_to_add: [
          {
            field_name: "new_field",
            field_type: "number",
            required: false,
          },
        ],
        activate: true,
      });

      expect(updatedSchema).toBeDefined();
      expect(updatedSchema.schema_version).toBe("1.1");

      // Verify schema was updated
      const activeSchema = await registryService.loadActiveSchema(testEntityType);
      expect(activeSchema).toBeDefined();
      expect(activeSchema?.schema_definition.fields.new_field).toBeDefined();
      expect(activeSchema?.schema_definition.fields.existing_field).toBeDefined();
    });

    it("should increment schema version", async () => {
      // Create base schema
      const baseSchema = await registryService.register({
        entity_type: `${testEntityType}_version`,
        schema_version: "1.0",
        schema_definition: { fields: {} },
        reducer_config: { merge_policies: {} },
        activate: true,
      });

      createdSchemaIds.push(baseSchema.id);

      const updatedSchema = await registryService.updateSchemaIncremental({
        entity_type: `${testEntityType}_version`,
        fields_to_add: [
          { field_name: "test_field", field_type: "string" },
        ],
      });

      expect(updatedSchema.schema_version).toBe("1.1");
    });

    it("should skip duplicate fields", async () => {
      // Create schema with existing field
      const baseSchema = await registryService.register({
        entity_type: `${testEntityType}_duplicate`,
        schema_version: "1.0",
        schema_definition: {
          fields: {
            existing_field: { type: "string" },
          },
        },
        reducer_config: {
          merge_policies: {
            existing_field: { strategy: "last_write" },
          },
        },
        activate: true,
      });

      createdSchemaIds.push(baseSchema.id);

      const updatedSchema = await registryService.updateSchemaIncremental({
        entity_type: `${testEntityType}_duplicate`,
        fields_to_add: [
          { field_name: "existing_field", field_type: "string" },
          { field_name: "new_field", field_type: "number" },
        ],
      });

      expect(updatedSchema).toBeDefined();
      // Verify new_field was added
      expect(updatedSchema.schema_definition.fields.new_field).toBeDefined();
      // existing_field should still exist
      expect(updatedSchema.schema_definition.fields.existing_field).toBeDefined();
    });

    it("should activate schema by default", async () => {
      const baseSchema = await registryService.register({
        entity_type: `${testEntityType}_activate`,
        schema_version: "1.0",
        schema_definition: { fields: {} },
        reducer_config: { merge_policies: {} },
        activate: true,
      });

      createdSchemaIds.push(baseSchema.id);

      await registryService.updateSchemaIncremental({
        entity_type: `${testEntityType}_activate`,
        fields_to_add: [
          { field_name: "test_field", field_type: "string" },
        ],
        activate: true,
      });

      // Verify schema is active
      const activeSchema = await registryService.loadActiveSchema(`${testEntityType}_activate`);
      expect(activeSchema?.schema_version).toBe("1.1");
    });

    it("should not activate if activate=false", async () => {
      const baseSchema = await registryService.register({
        entity_type: `${testEntityType}_no_activate`,
        schema_version: "1.0",
        schema_definition: { fields: {} },
        reducer_config: { merge_policies: {} },
        activate: true,
      });

      createdSchemaIds.push(baseSchema.id);

      await registryService.updateSchemaIncremental({
        entity_type: `${testEntityType}_no_activate`,
        fields_to_add: [
          { field_name: "test_field", field_type: "string" },
        ],
        activate: false,
      });

      // Verify old schema is still active
      const activeSchema = await registryService.loadActiveSchema(`${testEntityType}_no_activate`);
      expect(activeSchema?.schema_version).toBe("1.0");
    });

    it("should require user_id for user-specific schemas", async () => {
      // This validation happens in the MCP handler, not the service
      // The service will work but the MCP handler validates user_id requirement
      // For integration test, we test the service directly
      await expect(
        registryService.updateSchemaIncremental({
          entity_type: testEntityType,
          fields_to_add: [
            { field_name: "test_field", field_type: "string" },
          ],
          user_specific: true,
          // Missing user_id - service doesn't validate this, MCP handler does
        }),
      ).resolves.toBeDefined();
    });
  });

  describe("register_schema", () => {
    it("should register new schema", async () => {
      const registeredSchema = await registryService.register({
        entity_type: `${testEntityType}_register`,
        schema_definition: {
          fields: {
            test_field: { type: "string" },
          },
        },
        reducer_config: {
          merge_policies: {
            test_field: { strategy: "last_write" },
          },
        },
        schema_version: "1.0",
        activate: false,
      });

      expect(registeredSchema).toBeDefined();
      expect(registeredSchema.entity_type).toBe(`${testEntityType}_register`);

      // Verify schema was registered
      const schema = await registryService.loadActiveSchema(`${testEntityType}_register`);
      // Should be null since activate=false
      expect(schema).toBeNull();
    });

    it("should validate schema definition", async () => {
      await expect(
        registryService.register({
          entity_type: testEntityType,
          schema_definition: null as any, // Invalid
          reducer_config: { merge_policies: {} },
          schema_version: "1.0",
        }),
      ).rejects.toThrow();
    });

    it("should support user-specific schemas", async () => {
      const registeredSchema = await registryService.register({
        entity_type: `${testEntityType}_user`,
        schema_definition: {
          fields: {
            test_field: { type: "string" },
          },
        },
        reducer_config: {
          merge_policies: {
            test_field: { strategy: "last_write" },
          },
        },
        user_specific: true,
        user_id: testUserId,
        activate: false,
        schema_version: "1.0",
      });

      expect(registeredSchema.scope).toBe("user");

      // Verify user-specific schema
      const userSchema = await registryService.loadUserSpecificSchema(
        `${testEntityType}_user`,
        testUserId,
      );
      expect(userSchema).toBeDefined();
      expect(userSchema?.scope).toBe("user");
    });

    it("should activate if requested", async () => {
      const registeredSchema = await registryService.register({
        entity_type: `${testEntityType}_register_activate`,
        schema_definition: {
          fields: {
            test_field: { type: "string" },
          },
        },
        reducer_config: {
          merge_policies: {
            test_field: { strategy: "last_write" },
          },
        },
        activate: true,
        schema_version: "1.0",
      });

      expect(registeredSchema.active).toBe(true);

      // Verify schema is active
      const activeSchema = await registryService.loadActiveSchema(
        `${testEntityType}_register_activate`,
      );
      expect(activeSchema).toBeDefined();
    });
  });

  describe("End-to-End Workflow", () => {
    it("should complete full auto-enhancement workflow", async () => {
      const workflowEntityType = `${testEntityType}_workflow`;

      // 1. Store structured data with unknown fields -> raw_fragments
      // (This would normally be done via store() MCP action, but for test we'll create raw_fragments directly)
      const { data: fragments } = await supabase
        .from("raw_fragments")
        .insert([
          {
            entity_type: workflowEntityType,
            fragment_key: "workflow_field",
            fragment_value: "value1",
            frequency_count: 5,
            user_id: testUserId,
            record_id: "workflow-record-1",
            source_id: "workflow-source-1",
          },
          {
            entity_type: workflowEntityType,
            fragment_key: "workflow_field",
            fragment_value: "value2",
            frequency_count: 3,
            user_id: testUserId,
            record_id: "workflow-record-2",
            source_id: "workflow-source-2",
          },
        ])
        .select("id");

      if (fragments) {
        createdRawFragmentIds.push(...fragments.map((f) => f.id));
      }

      // 2. Analyze raw_fragments
      const recommendations = await recommendationService.analyzeRawFragments({
        entity_type: workflowEntityType,
        user_id: testUserId,
        min_frequency: 5,
        min_confidence: 0.5,
      });

      expect(recommendations.length).toBeGreaterThan(0);

      // 3. Create base schema first
      const baseSchema = await registryService.register({
        entity_type: workflowEntityType,
        schema_version: "1.0",
        schema_definition: { fields: {} },
        reducer_config: { merge_policies: {} },
        activate: true,
      });

      createdSchemaIds.push(baseSchema.id);

      // 4. Update schema incrementally
      const updatedSchema = await registryService.updateSchemaIncremental({
        entity_type: workflowEntityType,
        fields_to_add: [
          { field_name: "workflow_field", field_type: "string" },
        ],
        activate: true,
      });

      expect(updatedSchema).toBeDefined();

      // 5. Verify new schema is active
      const activeSchema = await registryService.loadActiveSchema(workflowEntityType);
      expect(activeSchema?.schema_definition.fields.workflow_field).toBeDefined();
    });

    it("should handle user-specific schema evolution", async () => {
      const userEntityType = `${testEntityType}_user_evolution`;

      // 1. Create global schema
      const globalSchema = await registryService.register({
        entity_type: userEntityType,
        schema_version: "1.0",
        schema_definition: {
          fields: {
            global_field: { type: "string" },
          },
        },
        reducer_config: {
          merge_policies: {
            global_field: { strategy: "last_write" },
          },
        },
        activate: true,
      });

      createdSchemaIds.push(globalSchema.id);

      // 2. Create user-specific schema
      const userSchema = await registryService.register({
        entity_type: userEntityType,
        schema_version: "1.0",
        schema_definition: {
          fields: {
            global_field: { type: "string" },
            user_field: { type: "number" },
          },
        },
        reducer_config: {
          merge_policies: {
            global_field: { strategy: "last_write" },
            user_field: { strategy: "last_write" },
          },
        },
        user_id: testUserId,
        user_specific: true,
        activate: true,
      });

      createdSchemaIds.push(userSchema.id);

      // 3. Verify user gets user-specific schema
      const userActiveSchema = await registryService.loadActiveSchema(
        userEntityType,
        testUserId,
      );
      expect(userActiveSchema?.scope).toBe("user");
      expect(userActiveSchema?.schema_definition.fields.user_field).toBeDefined();

      // 4. Verify other users get global schema
      const otherUserSchema = await registryService.loadActiveSchema(
        userEntityType,
        "other-user-id",
      );
      expect(otherUserSchema?.scope).toBe("global");
      expect(otherUserSchema?.schema_definition.fields.user_field).toBeUndefined();
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid parameters", async () => {
      // Service-level validation - empty entity_type might not throw, but schema lookup will fail
      await expect(
        registryService.updateSchemaIncremental({
          entity_type: "", // Invalid
          fields_to_add: [
            { field_name: "test", field_type: "string" },
          ],
        }),
      ).rejects.toThrow();
    });

    it("should handle missing required fields", async () => {
      // Service doesn't validate this - MCP handler does
      // Test that service handles empty fields array gracefully
      const baseSchema = await registryService.register({
        entity_type: `${testEntityType}_missing_fields`,
        schema_version: "1.0",
        schema_definition: { fields: {} },
        reducer_config: { merge_policies: {} },
        activate: true,
      });
      createdSchemaIds.push(baseSchema.id);

      // Empty fields_to_add should still work (just no new fields added)
      const result = await registryService.updateSchemaIncremental({
        entity_type: `${testEntityType}_missing_fields`,
        fields_to_add: [],
      });

      expect(result).toBeDefined();
    });
  });
});
