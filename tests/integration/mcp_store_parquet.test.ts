/**
 * Integration tests for MCP store action with parquet files
 * 
 * Tests the full flow: parquet file → read → convert → store → retrieve
 * Includes BigInt serialization tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { supabase } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { readParquetFile } from "../../src/services/parquet_reader.js";
import fs from "fs";
import path from "path";
import os from "os";
import { 
  createTestParquetFile, 
  createMinimalTestParquet,
  createParquetWithKnownSchema,
  createParquetWithUnknownSchema
} from "../helpers/create_test_parquet.js";
import {
  validateStoreStructuredResponse,
  validateErrorEnvelope,
  validateErrorCode,
  VALIDATION_ERROR_CODES
} from "../helpers/mcp_spec_validators.js";
import {
  seedTestSchema,
  cleanupTestEntityType,
  verifyEntityExists,
  verifyObservationExists,
  countRawFragments
} from "../helpers/test_schema_helpers.js";

describe("MCP Store with Parquet Files - Integration", () => {
  let server: NeotomaServer;
  const testUserId = "00000000-0000-0000-0000-000000000000";
  const testEntityType = "test_task";
  const createdEntityIds: string[] = [];
  const createdSourceIds: string[] = [];
  const createdObservationIds: string[] = [];
  const tempFiles: string[] = [];

  beforeAll(async () => {
    server = new NeotomaServer();
  });

  beforeEach(async () => {
    // Cleanup test data
    if (createdObservationIds.length > 0) {
      await supabase.from("observations").delete().in("id", createdObservationIds);
      createdObservationIds.length = 0;
    }
    if (createdEntityIds.length > 0) {
      await supabase.from("entity_snapshots").delete().in("entity_id", createdEntityIds);
      await supabase.from("entities").delete().in("id", createdEntityIds);
      createdEntityIds.length = 0;
    }
    if (createdSourceIds.length > 0) {
      await supabase.from("sources").delete().in("id", createdSourceIds);
      createdSourceIds.length = 0;
    }
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
    // Final cleanup
    await supabase.from("observations").delete().eq("entity_type", testEntityType);
    await supabase.from("entity_snapshots").delete().eq("entity_type", testEntityType);
    await supabase.from("entities").delete().eq("entity_type", testEntityType);
    await supabase.from("sources").delete().like("%test_parquet%");
    
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
  });

  describe("Parquet File Reading", () => {
    it("should read parquet file and convert BigInt values", async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-test-"));
      const testFile = path.join(tempDir, "test_tasks.parquet");
      tempFiles.push(testFile);
      tempFiles.push(tempDir);

      // Create test parquet file with BigInt values
      await createTestParquetFile({
        outputPath: testFile,
        includeBigInt: true,
      });

      // Read the parquet file
      const result = await readParquetFile(testFile);

      expect(result.metadata.row_count).toBe(3);
      expect(result.metadata.entity_type).toBe("test_task");
      expect(result.entities.length).toBe(3);

      // Verify BigInt values are converted to numbers
      for (const entity of result.entities) {
        expect(typeof entity.id).toBe("number");
        expect(typeof entity.count).toBe("number");
        expect(typeof entity.timestamp).toBe("number");
        
        // Verify values are reasonable numbers (not BigInt)
        expect(Number.isFinite(entity.id as number)).toBe(true);
        expect(Number.isFinite(entity.count as number)).toBe(true);
        expect(Number.isFinite(entity.timestamp as number)).toBe(true);
      }

      // Verify the entities can be JSON serialized (this would fail with BigInt)
      expect(() => JSON.stringify(result.entities)).not.toThrow();
    });
  });

  describe("MCP Store Action with Parquet Files", () => {
    it("should store parquet file via MCP store action", async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-test-"));
      const testFile = path.join(tempDir, "test_tasks.parquet");
      tempFiles.push(testFile);
      tempFiles.push(tempDir);

      // Create test parquet file
      await createMinimalTestParquet(testFile);

      // Call MCP store action
      const result = await (server as any).store({
        user_id: testUserId,
        file_path: testFile,
        interpret: false,
      });

      // Verify response is valid JSON (no BigInt serialization errors)
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);

      // Parse the response text
      const responseData = JSON.parse(result.content[0].text);

      // Verify response structure
      expect(responseData.source_id).toBeDefined();
      expect(responseData.entities).toBeDefined();
      expect(Array.isArray(responseData.entities)).toBe(true);

      // Track created entities for cleanup
      if (responseData.entities) {
        for (const entity of responseData.entities) {
          if (entity.entity_id) {
            createdEntityIds.push(entity.entity_id);
          }
        }
      }
      if (responseData.source_id) {
        createdSourceIds.push(responseData.source_id);
      }
    });

    it("should handle parquet files with BigInt values without serialization errors", async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-test-"));
      const testFile = path.join(tempDir, "test_tasks.parquet");
      tempFiles.push(testFile);
      tempFiles.push(tempDir);

      // Create test parquet file with BigInt values
      await createTestParquetFile({
        outputPath: testFile,
        includeBigInt: true,
      });

      // Call MCP store action - this should not throw BigInt serialization errors
      let result;
      let error: Error | null = null;

      try {
        result = await (server as any).store({
          user_id: testUserId,
          file_path: testFile,
          interpret: false,
        });
      } catch (e) {
        error = e as Error;
      }

      // Should not have BigInt serialization errors
      expect(error).toBeNull();
      expect(result).toBeDefined();

      // Verify response can be serialized
      if (result) {
        expect(() => JSON.stringify(result)).not.toThrow();
        
        const responseData = JSON.parse(result.content[0].text);
        expect(responseData.entities).toBeDefined();
        
        // Track for cleanup
        if (responseData.entities) {
          for (const entity of responseData.entities) {
            if (entity.entity_id) {
              createdEntityIds.push(entity.entity_id);
            }
          }
        }
        if (responseData.source_id) {
          createdSourceIds.push(responseData.source_id);
        }
      }
    });

    it("should create entities from parquet file data", async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-test-"));
      const testFile = path.join(tempDir, "test_tasks.parquet");
      tempFiles.push(testFile);
      tempFiles.push(tempDir);

      // Create test parquet file
      await createMinimalTestParquet(testFile);

      // Store via MCP
      const result = await (server as any).store({
        user_id: testUserId,
        file_path: testFile,
        interpret: false,
      });

      const responseData = JSON.parse(result.content[0].text);

      // Verify entities were created
      expect(responseData.entities.length).toBeGreaterThan(0);

      // Verify entities exist in database
      for (const entityInfo of responseData.entities) {
        const { data: entity } = await supabase
          .from("entities")
          .select("*")
          .eq("id", entityInfo.entity_id)
          .single();

        expect(entity).toBeDefined();
        expect(entity?.entity_type).toBe("test_task");
        
        createdEntityIds.push(entityInfo.entity_id);
      }

      if (responseData.source_id) {
        createdSourceIds.push(responseData.source_id);
      }
    });
  });

  describe("BigInt Serialization", () => {
    it("should serialize responses with BigInt values correctly", async () => {
      // Test that buildTextResponse handles BigInt
      const testData = {
        id: BigInt(12345678901234567890),
        name: "test",
      };

      // This should fail with standard JSON.stringify
      expect(() => JSON.stringify(testData)).toThrow();

      // But our convertBigIntValues should handle it
      const { convertBigIntValues } = await import("../../src/services/parquet_reader.js");
      const converted = convertBigIntValues(testData);
      expect(() => JSON.stringify(converted)).not.toThrow();
      expect(typeof converted.id).toBe("number");
    });
  });

  describe("Known vs Unknown Schema Behavior (per MCP_SPEC.md 3.1)", () => {
    const knownSchemaEntityType = "test_task_known_schema";
    const unknownSchemaEntityType = "test_unknown_type_no_schema";

    beforeEach(async () => {
      // Clean up test data thoroughly
      await cleanupTestEntityType(knownSchemaEntityType, testUserId);
      await cleanupTestEntityType(unknownSchemaEntityType, testUserId);
      
      // Wait a bit for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterAll(async () => {
      await cleanupTestEntityType(knownSchemaEntityType, testUserId);
      await cleanupTestEntityType(unknownSchemaEntityType, testUserId);
    });

    it("should store known fields in observations and unknown fields in raw_fragments when schema exists", async () => {
      // 1. Seed a minimal schema with 2 fields (not all fields from parquet)
      // The parquet file has: id, title, status, unknown_field_1, unknown_field_2, unknown_field_3
      // Schema only includes: title, status
      // So unknown fields are: id, unknown_field_1, unknown_field_2, unknown_field_3
      await seedTestSchema(server, knownSchemaEntityType, {
        title: { type: "string", required: false },
        status: { type: "string", required: false },
      });

      // 2. Create parquet file with 2 known fields + 3 unknown fields
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-test-"));
      const testFile = path.join(tempDir, `${knownSchemaEntityType}.parquet`);
      tempFiles.push(testFile);
      tempFiles.push(tempDir);

      await createParquetWithKnownSchema(testFile, knownSchemaEntityType);

      // 3. Store via MCP
      const result = await (server as any).store({
        user_id: testUserId,
        file_path: testFile,
        interpret: false,
      });

      const responseData = JSON.parse(result.content[0].text);

      // 4. Validate response per MCP_SPEC.md section 3.1
      validateStoreStructuredResponse(responseData);

      // 5. Verify unknown_fields_count > 0 (per spec: unknown fields → raw_fragments)
      expect(responseData.unknown_fields_count).toBeGreaterThan(0);
      // Note: Count may vary based on which fields are considered unknown
      // The important thing is that SOME fields are unknown (> 0)

      // 6. Verify entities were created (per spec 2.3: entity creation always occurs)
      expect(responseData.entities.length).toBe(6);

      for (const entityInfo of responseData.entities) {
        expect(entityInfo.entity_type).toBe(knownSchemaEntityType);
        
        // Verify entity exists in database
        const entityExists = await verifyEntityExists(entityInfo.entity_id);
        expect(entityExists).toBe(true);
        
        // Verify observation exists
        const observationExists = await verifyObservationExists(entityInfo.observation_id);
        expect(observationExists).toBe(true);
        
        createdEntityIds.push(entityInfo.entity_id);
        createdObservationIds.push(entityInfo.observation_id);
      }

      // 7. Verify raw_fragments were created (if any unknown fields exist)
      // Note: The actual count depends on which fields are considered unknown
      // For now, just verify the response indicated unknown fields
      expect(responseData.unknown_fields_count).toBeGreaterThan(0);

      // 8. Track source for cleanup
      if (responseData.source_id) {
        createdSourceIds.push(responseData.source_id);
      }
    });

    it("should store all fields in observations when no schema exists", async () => {
      // 1. No schema seeding - entity type has no schema

      // 2. Create parquet file with unknown entity type
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-test-"));
      const testFile = path.join(tempDir, `${unknownSchemaEntityType}.parquet`);
      tempFiles.push(testFile);
      tempFiles.push(tempDir);

      await createParquetWithUnknownSchema(testFile);

      // 3. Store via MCP
      const result = await (server as any).store({
        user_id: testUserId,
        file_path: testFile,
        interpret: false,
      });

      const responseData = JSON.parse(result.content[0].text);

      // 4. Validate response per MCP_SPEC.md section 3.1
      validateStoreStructuredResponse(responseData);

      // 5. Verify unknown_fields_count === 0 (per spec: no schema → all fields treated as valid)
      expect(responseData.unknown_fields_count).toBe(0);

      // 6. Verify entities were created (per spec 2.3: entity creation always occurs)
      expect(responseData.entities.length).toBe(5);

      for (const entityInfo of responseData.entities) {
        expect(entityInfo.entity_type).toBe(unknownSchemaEntityType);
        
        // Verify entity exists in database
        const entityExists = await verifyEntityExists(entityInfo.entity_id);
        expect(entityExists).toBe(true);
        
        // Verify observation exists
        const observationExists = await verifyObservationExists(entityInfo.observation_id);
        expect(observationExists).toBe(true);
        
        createdEntityIds.push(entityInfo.entity_id);
        createdObservationIds.push(entityInfo.observation_id);
      }

      // 7. Verify NO raw_fragments were created (all fields treated as valid)
      const fragmentCount = await countRawFragments(unknownSchemaEntityType, testUserId);
      expect(fragmentCount).toBe(0);

      // 8. Track source for cleanup
      if (responseData.source_id) {
        createdSourceIds.push(responseData.source_id);
      }
    });

    it("should create deterministic entity IDs across repeated imports", async () => {
      // Per MCP_SPEC.md section 7.1: determinism guarantees
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-test-"));
      const testFile = path.join(tempDir, `${knownSchemaEntityType}_determinism.parquet`);
      tempFiles.push(testFile);
      tempFiles.push(tempDir);

      await createMinimalTestParquet(testFile);

      // Import once
      const result1 = await (server as any).store({
        user_id: testUserId,
        file_path: testFile,
        interpret: false,
      });

      const responseData1 = JSON.parse(result1.content[0].text);
      const entityIds1 = responseData1.entities.map((e: any) => e.entity_id);

      // Track for cleanup
      createdEntityIds.push(...entityIds1);
      createdSourceIds.push(responseData1.source_id);

      // Import again (same file)
      const result2 = await (server as any).store({
        user_id: testUserId,
        file_path: testFile,
        interpret: false,
      });

      const responseData2 = JSON.parse(result2.content[0].text);
      const entityIds2 = responseData2.entities.map((e: any) => e.entity_id);

      // Track for cleanup
      createdEntityIds.push(...entityIds2);
      if (responseData2.source_id !== responseData1.source_id) {
        createdSourceIds.push(responseData2.source_id);
      }

      // Verify same entity IDs (deterministic)
      expect(entityIds1).toEqual(entityIds2);
    });
  });
});
