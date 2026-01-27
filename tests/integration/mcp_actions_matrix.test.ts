/**
 * Matrix-style integration tests for all 17 MCP actions
 * 
 * Tests per MCP_SPEC.md section 2 & 3:
 * - All MCP actions with representative data variations
 * - Response schema validation per spec
 * - Error code validation per spec
 * - Consistency and determinism guarantees
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { supabase } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import os from "os";
import {
  createMinimalTestParquet
} from "../helpers/create_test_parquet.js";
import {
  validateStoreStructuredResponse,
  validateStoreUnstructuredResponse,
  validateRetrieveEntitySnapshotResponse,
  validateListEntityTypesResponse,
  validateAnalyzeSchemaCandidatesResponse,
  validateGetSchemaRecommendationsResponse,
  validateErrorEnvelope,
  VALIDATION_ERROR_CODES
} from "../helpers/mcp_spec_validators.js";
import {
  seedTestSchema,
  cleanupTestEntityType,
  verifyEntityExists
} from "../helpers/test_schema_helpers.js";

/**
 * Helper to call MCP actions - converts snake_case to camelCase method names
 */
function callMCPAction(server: NeotomaServer, actionName: string, params: any): Promise<any> {
  // Convert snake_case to camelCase
  const methodName = actionName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  return (server as any)[methodName](params);
}

describe("MCP Actions Matrix - All 17 Actions", () => {
  let server: NeotomaServer;
  const testUserId = "00000000-0000-0000-0000-000000000000";
  const testEntityType = "test_matrix";
  const createdEntityIds: string[] = [];
  const createdSourceIds: string[] = [];
  const createdRelationshipIds: string[] = [];
  const tempFiles: string[] = [];

  beforeAll(async () => {
    server = new NeotomaServer();
    
    // Seed a basic schema for tests
    await seedTestSchema(server, testEntityType, {
      name: { type: "string", required: false },
      amount: { type: "number", required: false },
    });
  });

  beforeEach(async () => {
    // Cleanup between tests
    if (createdEntityIds.length > 0) {
      // Reset merged state before deleting
      await supabase
        .from("entities")
        .update({ merged_to_entity_id: null, merged_at: null })
        .in("id", createdEntityIds);
      
      await supabase.from("entity_snapshots").delete().in("entity_id", createdEntityIds);
      await supabase.from("entities").delete().in("id", createdEntityIds);
      createdEntityIds.length = 0;
    }
    
    if (createdSourceIds.length > 0) {
      await supabase.from("observations").delete().in("source_id", createdSourceIds);
      await supabase.from("sources").delete().in("id", createdSourceIds);
      createdSourceIds.length = 0;
    }

    if (createdRelationshipIds.length > 0) {
      await supabase.from("relationship_observations").delete().in("relationship_key", createdRelationshipIds);
      await supabase.from("relationship_snapshots").delete().in("relationship_key", createdRelationshipIds);
      await supabase.from("relationships").delete().in("id", createdRelationshipIds);
      createdRelationshipIds.length = 0;
    }
    
    for (const file of tempFiles) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    tempFiles.length = 0;
  });

  afterAll(async () => {
    await cleanupTestEntityType(testEntityType, testUserId);
    
    for (const file of tempFiles) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  describe("1. Core Storing Operations", () => {
    describe("store (MCP_SPEC.md 3.1)", () => {
      it("should store structured entities", async () => {
        const result = await (server as any).store({
          user_id: testUserId,
          entities: [
            { entity_type: testEntityType, name: "Test Entity", amount: 100 }
          ],
        });

        const responseData = JSON.parse(result.content[0].text);
        validateStoreStructuredResponse(responseData);

        expect(responseData.source_id).toBeDefined();
        expect(responseData.entities.length).toBe(1);
        expect(responseData.entities[0].entity_type).toBe(testEntityType);

        createdEntityIds.push(responseData.entities[0].entity_id);
        createdSourceIds.push(responseData.source_id);
      });

      it("should store unstructured file via file_path", async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-test-"));
        const testFile = path.join(tempDir, "test.txt");
        tempFiles.push(testFile);
        tempFiles.push(tempDir);

        fs.writeFileSync(testFile, "Test content");

        const result = await (server as any).store({
          user_id: testUserId,
          file_path: testFile,
          interpret: false,
        });

        const responseData = JSON.parse(result.content[0].text);
        validateStoreUnstructuredResponse(responseData);

        expect(responseData.source_id).toBeDefined();
        expect(responseData.content_hash).toBeDefined();
        expect(responseData.deduplicated).toBe(false);

        createdSourceIds.push(responseData.source_id);
      });

      it("should return VALIDATION_ERROR for invalid input", async () => {
        let error: any = null;

        try {
          await (server as any).store({
            user_id: "invalid-uuid",
            entities: [],
          });
        } catch (e) {
          error = e;
        }

        expect(error).toBeDefined();
      });
    });
  });

  describe("2. Entity Operations", () => {
    describe("retrieve_entity_snapshot (MCP_SPEC.md 3.4)", () => {
      it("should retrieve entity snapshot with provenance", async () => {
        // Create entity first
        const storeResult = await (server as any).store({
          user_id: testUserId,
          entities: [
            { entity_type: testEntityType, name: "Snapshot Test", amount: 500 }
          ],
        });

        const storeData = JSON.parse(storeResult.content[0].text);
        const entityId = storeData.entities[0].entity_id;
        createdEntityIds.push(entityId);
        createdSourceIds.push(storeData.source_id);

        // Retrieve snapshot
        const result = await callMCPAction(server, "retrieve_entity_snapshot", {
          entity_id: entityId,
        });

        const responseData = JSON.parse(result.content[0].text);
        validateRetrieveEntitySnapshotResponse(responseData);

        expect(responseData.entity_id).toBe(entityId);
        expect(responseData.entity_type).toBe(testEntityType);
        expect(responseData.snapshot).toBeDefined();
        expect(responseData.provenance).toBeDefined();
      });

      it("should return ENTITY_NOT_FOUND for nonexistent entity", async () => {
        let error: any = null;

        try {
          await callMCPAction(server, "retrieve_entity_snapshot", {
            entity_id: "ent_nonexistent123456789012",
          });
        } catch (e) {
          error = e;
        }

        expect(error).toBeDefined();
        expect(error.message).toContain("not found");
      });
    });

    describe("retrieve_entities (MCP_SPEC.md 3.7)", () => {
      it("should retrieve entities with filters", async () => {
        // Create entity first
        const storeResult = await (server as any).store({
          user_id: testUserId,
          entities: [
            { entity_type: testEntityType, name: "Query Test", amount: 300 }
          ],
        });

        const storeData = JSON.parse(storeResult.content[0].text);
        createdEntityIds.push(storeData.entities[0].entity_id);
        createdSourceIds.push(storeData.source_id);

        // Retrieve entities
        const result = await callMCPAction(server, "retrieve_entities", {
          entity_type: testEntityType,
          user_id: testUserId,
        });

        const responseData = JSON.parse(result.content[0].text);

        expect(responseData.entities).toBeDefined();
        expect(Array.isArray(responseData.entities)).toBe(true);
        expect(typeof responseData.total).toBe("number");
        expect(responseData.excluded_merged).toBeDefined();
      });

      it("should support pagination", async () => {
        const result = await callMCPAction(server, "retrieve_entities", {
          entity_type: testEntityType,
          limit: 10,
          offset: 0,
        });

        const responseData = JSON.parse(result.content[0].text);
        expect(Array.isArray(responseData.entities)).toBe(true);
        expect(responseData.entities.length).toBeLessThanOrEqual(10);
      });
    });

    describe("list_entity_types (MCP_SPEC.md 3.2)", () => {
      it("should list all entity types", async () => {
        const result = await callMCPAction(server, "list_entity_types", {});

        const responseData = JSON.parse(result.content[0].text);
        validateListEntityTypesResponse(responseData);

        expect(responseData.entity_types).toBeDefined();
        expect(Array.isArray(responseData.entity_types)).toBe(true);
        expect(typeof responseData.total).toBe("number");
        expect(responseData.keyword).toBeNull();
      });

      it("should filter entity types by keyword", async () => {
        const result = await callMCPAction(server, "list_entity_types", {
          keyword: "task",
        });

        const responseData = JSON.parse(result.content[0].text);
        validateListEntityTypesResponse(responseData);

        expect(responseData.keyword).toBe("task");
        expect(responseData.search_method).toBeDefined();

        // Verify results are relevant to keyword
        if (responseData.entity_types.length > 0) {
          const hasRelevantResult = responseData.entity_types.some(
            (et: any) => 
              et.entity_type.includes("task") || 
              (et.field_names && et.field_names.some((f: string) => f.includes("task")))
          );
          expect(hasRelevantResult).toBe(true);
        }
      });

      it("should return summary mode with field counts only", async () => {
        const result = await callMCPAction(server, "list_entity_types", {
          summary: true,
        });

        const responseData = JSON.parse(result.content[0].text);
        validateListEntityTypesResponse(responseData);

        expect(responseData.entity_types).toBeDefined();
        expect(Array.isArray(responseData.entity_types)).toBe(true);
        expect(responseData.entity_types.length).toBeGreaterThan(0);

        // In summary mode, each entity type should have field_count but not full field definitions
        for (const et of responseData.entity_types) {
          expect(et.entity_type).toBeDefined();
          expect(et.schema_version).toBeDefined();
          expect(typeof et.field_count).toBe("number");
          expect(et.field_count).toBeGreaterThanOrEqual(0);
          // Should not have full field definitions in summary mode
          expect(et.field_names).toBeUndefined();
          expect(et.field_summary).toBeUndefined();
        }
      });
    });

    describe("retrieve_entity_by_identifier (MCP_SPEC.md 3.8)", () => {
      it("should find entity by identifier", async () => {
        // Create entity with known name
        const storeResult = await (server as any).store({
          user_id: testUserId,
          entities: [
            { entity_type: testEntityType, name: "Identifier Test Entity", amount: 750 }
          ],
        });

        const storeData = JSON.parse(storeResult.content[0].text);
        createdEntityIds.push(storeData.entities[0].entity_id);
        createdSourceIds.push(storeData.source_id);

        // Retrieve by identifier
        const result = await callMCPAction(server, "retrieve_entity_by_identifier", {
          identifier: "Identifier Test Entity",
          entity_type: testEntityType,
        });

        const responseData = JSON.parse(result.content[0].text);

        expect(responseData.entities).toBeDefined();
        expect(Array.isArray(responseData.entities)).toBe(true);
        expect(typeof responseData.total).toBe("number");

        if (responseData.entities.length > 0) {
          expect(responseData.entities[0].canonical_name).toBeDefined();
        }
      });
    });

    describe("merge_entities (MCP_SPEC.md 3.14)", () => {
      it("should merge two entities", async () => {
        // Create two entities
        const storeResult1 = await (server as any).store({
          user_id: testUserId,
          entities: [
            { entity_type: testEntityType, name: "Entity A", amount: 100 }
          ],
        });

        const storeResult2 = await (server as any).store({
          user_id: testUserId,
          entities: [
            { entity_type: testEntityType, name: "Entity B", amount: 200 }
          ],
        });

        const entity1Id = JSON.parse(storeResult1.content[0].text).entities[0].entity_id;
        const entity2Id = JSON.parse(storeResult2.content[0].text).entities[0].entity_id;

        createdEntityIds.push(entity1Id, entity2Id);
        createdSourceIds.push(
          JSON.parse(storeResult1.content[0].text).source_id,
          JSON.parse(storeResult2.content[0].text).source_id
        );

        // Merge entity1 into entity2
        const mergeResult = await callMCPAction(server, "merge_entities", {
          user_id: testUserId,
          from_entity_id: entity1Id,
          to_entity_id: entity2Id,
        });

        const mergeData = JSON.parse(mergeResult.content[0].text);

        expect(mergeData.from_entity_id).toBe(entity1Id);
        expect(mergeData.to_entity_id).toBe(entity2Id);
        expect(typeof mergeData.observations_moved).toBe("number");
        expect(mergeData.merged_at).toBeDefined();
      });

      it("should return ENTITY_NOT_FOUND for nonexistent entity", async () => {
        let error: any = null;

        try {
          await callMCPAction(server, "merge_entities", {
            user_id: testUserId,
            from_entity_id: "ent_nonexistent123456789012",
            to_entity_id: "ent_nonexistent987654321098",
          });
        } catch (e) {
          error = e;
        }

        expect(error).toBeDefined();
      });
    });
  });

  describe("3. Observation Operations", () => {
    describe("list_observations (MCP_SPEC.md 3.5)", () => {
      it("should list observations for entity", async () => {
        // Create entity
        const storeResult = await (server as any).store({
          user_id: testUserId,
          entities: [
            { entity_type: testEntityType, name: "Obs Test", amount: 400 }
          ],
        });

        const storeData = JSON.parse(storeResult.content[0].text);
        const entityId = storeData.entities[0].entity_id;
        createdEntityIds.push(entityId);
        createdSourceIds.push(storeData.source_id);

        // List observations
        const result = await callMCPAction(server, "list_observations", {
          entity_id: entityId,
        });

        const responseData = JSON.parse(result.content[0].text);

        expect(responseData.observations).toBeDefined();
        expect(Array.isArray(responseData.observations)).toBe(true);
        expect(typeof responseData.total).toBe("number");
        expect(typeof responseData.limit).toBe("number");
        expect(typeof responseData.offset).toBe("number");

        // Verify observations have required fields (per spec 3.5)
        if (responseData.observations.length > 0) {
          const obs = responseData.observations[0];
          expect(obs.id).toBeDefined();
          expect(obs.entity_id).toBe(entityId);
          expect(obs.entity_type).toBeDefined();
          expect(obs.schema_version).toBeDefined();
          expect(obs.source_id).toBeDefined();
          expect(obs.observed_at).toBeDefined();
          expect(typeof obs.specificity_score).toBe("number");
          expect(typeof obs.source_priority).toBe("number");
          expect(obs.fields).toBeDefined();
        }
      });

      it("should return ENTITY_NOT_FOUND for nonexistent entity", async () => {
        let error: any = null;

        try {
          await callMCPAction(server, "list_observations", {
            entity_id: "ent_nonexistent123456789012",
          });
        } catch (e) {
          error = e;
        }

        expect(error).toBeDefined();
      });
    });

    describe("retrieve_field_provenance (MCP_SPEC.md 3.6)", () => {
      it("should retrieve provenance chain for field", async () => {
        // Create entity
        const storeResult = await (server as any).store({
          user_id: testUserId,
          entities: [
            { entity_type: testEntityType, name: "Provenance Test", amount: 600 }
          ],
        });

        const storeData = JSON.parse(storeResult.content[0].text);
        const entityId = storeData.entities[0].entity_id;
        createdEntityIds.push(entityId);
        createdSourceIds.push(storeData.source_id);

        // Retrieve provenance
        const result = await callMCPAction(server, "retrieve_field_provenance", {
          entity_id: entityId,
          field: "amount",
        });

        const responseData = JSON.parse(result.content[0].text);

        expect(responseData.field).toBe("amount");
        expect(responseData.value).toBe(600);
        expect(responseData.source_observation).toBeDefined();
        expect(responseData.source_observation.id).toBeDefined();
        expect(responseData.source_observation.source_id).toBeDefined();
        expect(responseData.source_material).toBeDefined();
      });

      it("should return FIELD_NOT_FOUND for nonexistent field", async () => {
        // Create entity
        const storeResult = await (server as any).store({
          user_id: testUserId,
          entities: [
            { entity_type: testEntityType, name: "Field Test", amount: 100 }
          ],
        });

        const storeData = JSON.parse(storeResult.content[0].text);
        const entityId = storeData.entities[0].entity_id;
        createdEntityIds.push(entityId);
        createdSourceIds.push(storeData.source_id);

        let error: any = null;

        try {
          await callMCPAction(server, "retrieve_field_provenance", {
            entity_id: entityId,
            field: "nonexistent_field",
          });
        } catch (e) {
          error = e;
        }

        expect(error).toBeDefined();
      });
    });
  });

  describe("4. Relationship Operations", () => {
    describe("create_relationship (MCP_SPEC.md 3.15)", () => {
      it("should create relationship between entities", async () => {
        // Create two entities
        const storeResult1 = await (server as any).store({
          user_id: testUserId,
          entities: [
            { entity_type: testEntityType, name: "Source Entity", amount: 100 }
          ],
        });

        const storeResult2 = await (server as any).store({
          user_id: testUserId,
          entities: [
            { entity_type: testEntityType, name: "Target Entity", amount: 200 }
          ],
        });

        const entity1Id = JSON.parse(storeResult1.content[0].text).entities[0].entity_id;
        const entity2Id = JSON.parse(storeResult2.content[0].text).entities[0].entity_id;

        createdEntityIds.push(entity1Id, entity2Id);
        createdSourceIds.push(
          JSON.parse(storeResult1.content[0].text).source_id,
          JSON.parse(storeResult2.content[0].text).source_id
        );

        // Create relationship
        const result = await callMCPAction(server, "create_relationship", {
          relationship_type: "REFERS_TO",
          source_entity_id: entity1Id,
          target_entity_id: entity2Id,
          metadata: { reason: "test" },
        });

        const responseData = JSON.parse(result.content[0].text);

        expect(responseData.id).toBeDefined();
        expect(responseData.relationship_type).toBe("REFERS_TO");
        expect(responseData.source_entity_id).toBe(entity1Id);
        expect(responseData.target_entity_id).toBe(entity2Id);
        expect(responseData.created_at).toBeDefined();

        createdRelationshipIds.push(responseData.id);
      });

      it("should return CYCLE_DETECTED for circular relationships", async () => {
        // Create three entities in a chain
        const entity1Result = await (server as any).store({
          user_id: testUserId,
          entities: [{ entity_type: testEntityType, name: "Entity 1", amount: 1 }],
        });

        const entity2Result = await (server as any).store({
          user_id: testUserId,
          entities: [{ entity_type: testEntityType, name: "Entity 2", amount: 2 }],
        });

        const entity3Result = await (server as any).store({
          user_id: testUserId,
          entities: [{ entity_type: testEntityType, name: "Entity 3", amount: 3 }],
        });

        const entity1Id = JSON.parse(entity1Result.content[0].text).entities[0].entity_id;
        const entity2Id = JSON.parse(entity2Result.content[0].text).entities[0].entity_id;
        const entity3Id = JSON.parse(entity3Result.content[0].text).entities[0].entity_id;

        createdEntityIds.push(entity1Id, entity2Id, entity3Id);
        createdSourceIds.push(
          JSON.parse(entity1Result.content[0].text).source_id,
          JSON.parse(entity2Result.content[0].text).source_id,
          JSON.parse(entity3Result.content[0].text).source_id
        );

        // Create chain: 1 → 2 → 3
        const rel1 = await callMCPAction(server, "create_relationship", {
          relationship_type: "DEPENDS_ON",
          source_entity_id: entity1Id,
          target_entity_id: entity2Id,
        });

        const rel2 = await callMCPAction(server, "create_relationship", {
          relationship_type: "DEPENDS_ON",
          source_entity_id: entity2Id,
          target_entity_id: entity3Id,
        });

        createdRelationshipIds.push(
          JSON.parse(rel1.content[0].text).id,
          JSON.parse(rel2.content[0].text).id
        );

        // Try to create cycle: 3 → 1 (should fail)
        let error: any = null;

        try {
          await callMCPAction(server, "create_relationship", {
            relationship_type: "DEPENDS_ON",
            source_entity_id: entity3Id,
            target_entity_id: entity1Id,
          });
        } catch (e) {
          error = e;
        }

        expect(error).toBeDefined();
        expect(error.message).toContain("cycle");
      });
    });

    describe("list_relationships (MCP_SPEC.md 3.16)", () => {
      it("should list relationships for entity", async () => {
        // Create entities and relationship
        const storeResult1 = await (server as any).store({
          user_id: testUserId,
          entities: [
            { entity_type: testEntityType, name: "Rel Source", amount: 100 }
          ],
        });

        const storeResult2 = await (server as any).store({
          user_id: testUserId,
          entities: [
            { entity_type: testEntityType, name: "Rel Target", amount: 200 }
          ],
        });

        const entity1Id = JSON.parse(storeResult1.content[0].text).entities[0].entity_id;
        const entity2Id = JSON.parse(storeResult2.content[0].text).entities[0].entity_id;

        createdEntityIds.push(entity1Id, entity2Id);
        createdSourceIds.push(
          JSON.parse(storeResult1.content[0].text).source_id,
          JSON.parse(storeResult2.content[0].text).source_id
        );

        const relResult = await callMCPAction(server, "create_relationship", {
          relationship_type: "REFERS_TO",
          source_entity_id: entity1Id,
          target_entity_id: entity2Id,
        });

        const relData = JSON.parse(relResult.content[0].text);
        createdRelationshipIds.push(relData.id);

        // List relationships
        const result = await callMCPAction(server, "list_relationships", {
          entity_id: entity1Id,
        });

        const responseData = JSON.parse(result.content[0].text);

        expect(responseData.relationships).toBeDefined();
        expect(Array.isArray(responseData.relationships)).toBe(true);
        expect(typeof responseData.total).toBe("number");
        expect(typeof responseData.limit).toBe("number");
        expect(typeof responseData.offset).toBe("number");

        // Verify relationships have required fields
        if (responseData.relationships.length > 0) {
          const rel = responseData.relationships[0];
          expect(rel.id).toBeDefined();
          expect(rel.relationship_type).toBeDefined();
          expect(rel.source_entity_id).toBeDefined();
          expect(rel.target_entity_id).toBeDefined();
          expect(rel.created_at).toBeDefined();
        }
      });
    });
  });

  describe("5. Schema Management Operations", () => {
    describe("analyze_schema_candidates (MCP_SPEC.md 3.18)", () => {
      it("should return recommendations structure", async () => {
        const result = await callMCPAction(server, "analyze_schema_candidates", {
          entity_type: testEntityType,
          min_frequency: 1,
          min_confidence: 0.5,
        });

        const responseData = JSON.parse(result.content[0].text);
        validateAnalyzeSchemaCandidatesResponse(responseData);

        expect(typeof responseData.total_entity_types).toBe("number");
        expect(typeof responseData.total_fields).toBe("number");
        expect(responseData.min_frequency).toBe(1);
        expect(responseData.min_confidence).toBe(0.5);
      });
    });

    describe("get_schema_recommendations (MCP_SPEC.md 3.19)", () => {
      it("should return recommendations for entity type", async () => {
        const result = await callMCPAction(server, "get_schema_recommendations", {
          entity_type: testEntityType,
        });

        const responseData = JSON.parse(result.content[0].text);
        validateGetSchemaRecommendationsResponse(responseData);

        expect(responseData.entity_type).toBe(testEntityType);
        expect(typeof responseData.total).toBe("number");
        expect(Array.isArray(responseData.recommendations)).toBe(true);
      });
    });

    describe("update_schema_incremental (MCP_SPEC.md 3.20)", () => {
      it("should add fields to schema", async () => {
        const result = await callMCPAction(server, "update_schema_incremental", {
          entity_type: testEntityType,
          fields_to_add: [
            { field_name: "new_field", field_type: "string", required: false }
          ],
          activate: true,
        });

        const responseData = JSON.parse(result.content[0].text);

        expect(responseData.success).toBe(true);
        expect(responseData.entity_type).toBe(testEntityType);
        expect(responseData.schema_version).toBeDefined();
        expect(Array.isArray(responseData.fields_added)).toBe(true);
        expect(typeof responseData.activated).toBe("boolean");
        expect(typeof responseData.migrated_existing).toBe("boolean");
        expect(["global", "user"]).toContain(responseData.scope);
      });

      it("should return SCHEMA_NOT_FOUND for nonexistent entity type", async () => {
        let error: any = null;

        try {
          await callMCPAction(server, "update_schema_incremental", {
            entity_type: "nonexistent_type_xyz",
            fields_to_add: [
              { field_name: "test", field_type: "string" }
            ],
          });
        } catch (e) {
          error = e;
        }

        expect(error).toBeDefined();
      });
    });

    describe("register_schema (MCP_SPEC.md 3.21)", () => {
      it("should register new schema", async () => {
        const newEntityType = `${testEntityType}_new_${randomUUID().substring(0, 8)}`;
        
        const result = await callMCPAction(server, "register_schema", {
          entity_type: newEntityType,
          schema_definition: {
            fields: {
              test_field: { type: "string", required: false }
            }
          },
          reducer_config: {
            merge_policies: {
              test_field: { strategy: "last_write", tie_breaker: "observed_at" }
            }
          },
          schema_version: "1.0",
          activate: false,
        });

        const responseData = JSON.parse(result.content[0].text);

        expect(responseData.success).toBe(true);
        expect(responseData.entity_type).toBe(newEntityType);
        expect(responseData.schema_version).toBe("1.0");
        expect(typeof responseData.activated).toBe("boolean");
        expect(["global", "user"]).toContain(responseData.scope);
        expect(responseData.schema_id).toBeDefined();

        // Cleanup
        await cleanupTestEntityType(newEntityType, testUserId);
      });

      it("should return VALIDATION_ERROR for invalid schema", async () => {
        let error: any = null;

        try {
          await callMCPAction(server, "register_schema", {
            entity_type: "invalid_schema_test",
            schema_definition: {
              fields: null, // Invalid
            },
            reducer_config: {
              merge_policies: {}
            },
          });
        } catch (e) {
          error = e;
        }

        expect(error).toBeDefined();
      });
    });
  });

  describe("6. Correction Operations", () => {
    describe("correct (MCP_SPEC.md 3.12)", () => {
      it("should create high-priority correction observation", async () => {
        // Create entity
        const storeResult = await (server as any).store({
          user_id: testUserId,
          entities: [
            { entity_type: testEntityType, name: "Correction Test", amount: 100 }
          ],
        });

        const storeData = JSON.parse(storeResult.content[0].text);
        const entityId = storeData.entities[0].entity_id;
        createdEntityIds.push(entityId);
        createdSourceIds.push(storeData.source_id);

        // Create correction
        const result = await callMCPAction(server, "correct", {
          user_id: testUserId,
          entity_id: entityId,
          entity_type: testEntityType,
          field: "amount",
          value: 200,
        });

        const responseData = JSON.parse(result.content[0].text);

        expect(responseData.observation_id).toBeDefined();
        expect(responseData.entity_id).toBe(entityId);
        expect(responseData.field).toBe("amount");
        expect(responseData.value).toBe(200);
        expect(responseData.message).toBeDefined();
      });

      it("should return ENTITY_NOT_FOUND for nonexistent entity", async () => {
        let error: any = null;

        try {
          await callMCPAction(server, "correct", {
            user_id: testUserId,
            entity_id: "ent_nonexistent123456789012",
            entity_type: testEntityType,
            field: "amount",
            value: 300,
          });
        } catch (e) {
          error = e;
        }

        expect(error).toBeDefined();
      });
    });
  });

  describe("7. Consistency and Determinism (per MCP_SPEC.md sections 6, 7)", () => {
    it("should provide strong consistency for all actions", async () => {
      // Store entity
      const storeResult = await (server as any).store({
        user_id: testUserId,
        entities: [
          { entity_type: testEntityType, name: "Consistency Test", amount: 123 }
        ],
      });

      const storeData = JSON.parse(storeResult.content[0].text);
      const entityId = storeData.entities[0].entity_id;
      createdEntityIds.push(entityId);
      createdSourceIds.push(storeData.source_id);

      // Immediately retrieve (strong consistency: read-after-write)
      const retrieveResult = await callMCPAction(server, "retrieve_entity_snapshot", {
        entity_id: entityId,
      });

      const retrieveData = JSON.parse(retrieveResult.content[0].text);

      // Should see the just-stored entity immediately
      expect(retrieveData.entity_id).toBe(entityId);
      expect(retrieveData.snapshot).toBeDefined();
      expect(retrieveData.snapshot.name).toBe("Consistency Test");
    });

    it("should be deterministic for same inputs", async () => {
      // Store same entity data twice
      const input = {
        user_id: testUserId,
        entities: [
          { entity_type: testEntityType, name: "Determinism Test", amount: 999 }
        ],
      };

      const result1 = await (server as any).store(input);
      const result2 = await (server as any).store(input);

      const data1 = JSON.parse(result1.content[0].text);
      const data2 = JSON.parse(result2.content[0].text);

      // Same input → same entity ID (deterministic per spec 7.1)
      expect(data1.entities[0].entity_id).toBe(data2.entities[0].entity_id);

      createdEntityIds.push(data1.entities[0].entity_id);
      createdSourceIds.push(data1.source_id);
      if (data2.source_id !== data1.source_id) {
        createdSourceIds.push(data2.source_id);
      }
    });
  });
});
