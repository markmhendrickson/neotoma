/**
 * Integration tests for entity creation via MCP store action
 * 
 * Tests per MCP_SPEC.md section 2.3 & 3.1:
 * - Entity creation for known entity types (with schema)
 * - Entity creation for unknown entity types (without schema)
 * - Deterministic entity IDs (per spec 7.1)
 * - Entity resolution and persistence
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { supabase } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import fs from "fs";
import path from "path";
import os from "os";
import {
  createParquetWithKnownSchema,
  createParquetWithUnknownSchema
} from "../helpers/create_test_parquet.js";
import {
  validateStoreStructuredResponse
} from "../helpers/mcp_spec_validators.js";
import {
  seedTestSchema,
  cleanupTestEntityType,
  verifyEntityExists,
  verifyObservationExists
} from "../helpers/test_schema_helpers.js";

describe("MCP Entity Creation - Integration", () => {
  let server: NeotomaServer;
  const testUserId = "00000000-0000-0000-0000-000000000000";
  const knownEntityType = "test_entity_known";
  const unknownEntityType = "test_entity_unknown";
  const createdEntityIds: string[] = [];
  const createdSourceIds: string[] = [];
  const tempFiles: string[] = [];

  beforeAll(async () => {
    server = new NeotomaServer();
  });

  beforeEach(async () => {
    // Cleanup test data
    await cleanupTestEntityType(knownEntityType, testUserId);
    await cleanupTestEntityType(unknownEntityType, testUserId);
    createdEntityIds.length = 0;
    createdSourceIds.length = 0;
    
    // Cleanup temp files
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
    await cleanupTestEntityType(knownEntityType, testUserId);
    await cleanupTestEntityType(unknownEntityType, testUserId);
    
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

  describe("Entity Creation with Known Schema (per spec 2.3, 3.1)", () => {
    it("should create entities when schema exists", async () => {
      // 1. Seed schema
      await seedTestSchema(server, knownEntityType, {
        title: { type: "string", required: false },
        status: { type: "string", required: false },
      });

      // 2. Create test file
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-test-"));
      const testFile = path.join(tempDir, `${knownEntityType}.parquet`);
      tempFiles.push(testFile);
      tempFiles.push(tempDir);

      await createParquetWithKnownSchema(testFile, knownEntityType);

      // 3. Store via MCP
      const result = await (server as any).store({
        user_id: testUserId,
        file_path: testFile,
        interpret: false,
      });

      const responseData = JSON.parse(result.content[0].text);
      validateStoreStructuredResponse(responseData);

      // 4. Verify entities were created (per spec 2.3)
      expect(responseData.entities.length).toBeGreaterThan(0);

      for (const entityInfo of responseData.entities) {
        expect(entityInfo.entity_id).toBeDefined();
        expect(entityInfo.entity_type).toBe(knownEntityType);
        expect(entityInfo.observation_id).toBeDefined();

        // Verify entity persisted to database
        const entityExists = await verifyEntityExists(entityInfo.entity_id);
        expect(entityExists).toBe(true);

        // Verify observation persisted
        const observationExists = await verifyObservationExists(entityInfo.observation_id);
        expect(observationExists).toBe(true);

        // Verify entity has correct fields
        const { data: entity } = await supabase
          .from("entities")
          .select("*")
          .eq("id", entityInfo.entity_id)
          .single();

        expect(entity).toBeDefined();
        expect(entity?.entity_type).toBe(knownEntityType);
        expect(entity?.canonical_name).toBeDefined();

        createdEntityIds.push(entityInfo.entity_id);
      }

      createdSourceIds.push(responseData.source_id);
    });

    it("should store known fields in observations.fields", async () => {
      await seedTestSchema(server, knownEntityType, {
        title: { type: "string", required: false },
        status: { type: "string", required: false },
      });

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-test-"));
      const testFile = path.join(tempDir, `${knownEntityType}_fields.parquet`);
      tempFiles.push(testFile);
      tempFiles.push(tempDir);

      await createParquetWithKnownSchema(testFile, knownEntityType);

      const result = await (server as any).store({
        user_id: testUserId,
        file_path: testFile,
        interpret: false,
      });

      const responseData = JSON.parse(result.content[0].text);

      // Verify observations have known fields
      for (const entityInfo of responseData.entities) {
        const { data: observation } = await supabase
          .from("observations")
          .select("fields")
          .eq("id", entityInfo.observation_id)
          .single();

        expect(observation).toBeDefined();
        expect(observation?.fields).toBeDefined();
        expect(observation?.fields.title).toBeDefined();
        expect(observation?.fields.status).toBeDefined();

        createdEntityIds.push(entityInfo.entity_id);
      }

      createdSourceIds.push(responseData.source_id);
    });
  });

  describe("Entity Creation without Schema (per spec 2.3, 3.1)", () => {
    it("should create entities even when no schema exists", async () => {
      // No schema seeding - test with unknown entity type

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-test-"));
      const testFile = path.join(tempDir, `${unknownEntityType}.parquet`);
      tempFiles.push(testFile);
      tempFiles.push(tempDir);

      await createParquetWithUnknownSchema(testFile);

      const result = await (server as any).store({
        user_id: testUserId,
        file_path: testFile,
        interpret: false,
      });

      const responseData = JSON.parse(result.content[0].text);
      validateStoreStructuredResponse(responseData);

      // Verify entities were created despite no schema (per spec 2.3)
      expect(responseData.entities.length).toBeGreaterThan(0);

      for (const entityInfo of responseData.entities) {
        expect(entityInfo.entity_id).toBeDefined();
        expect(entityInfo.entity_type).toBe(unknownEntityType);

        // Verify entity persisted to database
        const entityExists = await verifyEntityExists(entityInfo.entity_id);
        expect(entityExists).toBe(true);

        const { data: entity } = await supabase
          .from("entities")
          .select("*")
          .eq("id", entityInfo.entity_id)
          .single();

        expect(entity).toBeDefined();
        expect(entity?.entity_type).toBe(unknownEntityType);

        createdEntityIds.push(entityInfo.entity_id);
      }

      createdSourceIds.push(responseData.source_id);
    });

    it("should store all fields in observations.fields when no schema exists", async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-test-"));
      const testFile = path.join(tempDir, `${unknownEntityType}_all_fields.parquet`);
      tempFiles.push(testFile);
      tempFiles.push(tempDir);

      await createParquetWithUnknownSchema(testFile);

      const result = await (server as any).store({
        user_id: testUserId,
        file_path: testFile,
        interpret: false,
      });

      const responseData = JSON.parse(result.content[0].text);

      // Verify all fields stored in observations
      for (const entityInfo of responseData.entities) {
        const { data: observation } = await supabase
          .from("observations")
          .select("fields")
          .eq("id", entityInfo.observation_id)
          .single();

        expect(observation).toBeDefined();
        expect(observation?.fields).toBeDefined();
        
        // All fields should be present (no schema → all fields valid)
        expect(observation?.fields.field_a).toBeDefined();
        expect(observation?.fields.field_b).toBeDefined();
        expect(observation?.fields.field_c).toBeDefined();

        createdEntityIds.push(entityInfo.entity_id);
      }

      createdSourceIds.push(responseData.source_id);
    });
  });

  describe("Deterministic Entity IDs (per spec 7.1)", () => {
    it("should generate same entity ID for same canonical name", async () => {
      const { generateEntityId, normalizeEntityValue } = await import("../../src/services/entity_resolution.js");

      const entityType = "test_determinism";
      const name1 = "Test Company Inc";
      const name2 = "TEST COMPANY INC";
      const name3 = "test company inc";

      // Normalize and generate IDs
      const normalized1 = normalizeEntityValue(entityType, name1);
      const normalized2 = normalizeEntityValue(entityType, name2);
      const normalized3 = normalizeEntityValue(entityType, name3);

      const id1 = generateEntityId(entityType, normalized1);
      const id2 = generateEntityId(entityType, normalized2);
      const id3 = generateEntityId(entityType, normalized3);

      // Per spec 7.1: same canonical name → same entity ID (deterministic)
      expect(id1).toBe(id2);
      expect(id2).toBe(id3);
      expect(id1).toMatch(/^ent_[a-f0-9]{24}$/);
    });

    it("should reuse existing entities for duplicate names", async () => {
      await seedTestSchema(server, knownEntityType, {
        name: { type: "string", required: false },
      });

      // Create structured data with duplicate entity names
      const result1 = await (server as any).store({
        user_id: testUserId,
        entities: [
          { entity_type: knownEntityType, name: "Duplicate Entity" }
        ],
      });

      const responseData1 = JSON.parse(result1.content[0].text);
      const firstEntityId = responseData1.entities[0].entity_id;

      createdEntityIds.push(firstEntityId);
      createdSourceIds.push(responseData1.source_id);

      // Store again with same name (different case)
      const result2 = await (server as any).store({
        user_id: testUserId,
        entities: [
          { entity_type: knownEntityType, name: "DUPLICATE ENTITY" }
        ],
      });

      const responseData2 = JSON.parse(result2.content[0].text);
      const secondEntityId = responseData2.entities[0].entity_id;

      createdSourceIds.push(responseData2.source_id);

      // Should be same entity ID (deterministic resolution)
      expect(secondEntityId).toBe(firstEntityId);

      // Verify only one entity in database
      const { data: entities } = await supabase
        .from("entities")
        .select("*")
        .eq("id", firstEntityId);

      expect(entities).toBeDefined();
      expect(entities!.length).toBe(1);
    });
  });
});
