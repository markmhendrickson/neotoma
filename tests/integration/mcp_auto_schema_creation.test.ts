/**
 * MCP Auto Schema Creation Integration Tests
 *
 * Tests automatic schema creation when storing structured data with unregistered entity types.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { createTestParquetFile } from "../helpers/create_test_parquet.js";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import os from "os";

describe("MCP Auto Schema Creation", () => {
  let server: NeotomaServer;
  const testUserId = "00000000-0000-0000-0000-000000000000"; // Use default user for tests
  let testFilePath: string;
  let createdSchemaIds: string[] = [];
  let createdSourceIds: string[] = [];

  beforeAll(async () => {
    server = new NeotomaServer();
    
    // Set authenticated user for tests
    (server as any).authenticatedUserId = testUserId;
  });

  beforeEach(() => {
    createdSchemaIds = [];
    createdSourceIds = [];
  });

  afterEach(async () => {
    // Cleanup: Delete created schemas
    for (const schemaId of createdSchemaIds) {
      await db.from("schema_registry").delete().eq("id", schemaId);
    }

    // Cleanup: Delete created sources and related data
    for (const sourceId of createdSourceIds) {
      await db.from("observations").delete().eq("source_id", sourceId);
      await db.from("raw_fragments").delete().eq("source_id", sourceId);
      await db.from("sources").delete().eq("id", sourceId);
    }

    // Cleanup: Delete test file if created
    if (testFilePath && fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  describe("store with unregistered entity type", () => {
    it("should auto-create user-specific schema from parquet file", async () => {
      // Create test parquet file with unregistered entity type
      const testDir = path.join(os.tmpdir(), "neotoma-test-parquet");
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      const unregisteredType = `auto_test_${randomUUID().substring(0, 8)}`;
      testFilePath = path.join(testDir, `${unregisteredType}.parquet`);

      const testData = [
        {
          id: BigInt(1),
          name: "Test Entity 1",
          amount: 100,
          created_at: BigInt(1705305600000000000),
          active: true,
        },
        {
          id: BigInt(2),
          name: "Test Entity 2",
          amount: 200,
          created_at: BigInt(1705392000000000000),
          active: false,
        },
      ];

      await createTestParquetFile({
        outputPath: testFilePath,
        rows: testData,
        customSchema: {
          id: { type: "INT64", optional: false },
          name: { type: "UTF8", optional: true },
          amount: { type: "INT32", optional: true },
          created_at: { type: "INT64", optional: true },
          active: { type: "BOOLEAN", optional: true },
        },
      });

      // Verify schema doesn't exist before
      const { data: schemaBefore } = await db
        .from("schema_registry")
        .select("*")
        .eq("entity_type", unregisteredType)
        .eq("user_id", testUserId)
        .eq("active", true)
        .maybeSingle();

      expect(schemaBefore).toBeNull();

      // Store via MCP (should auto-create schema)
      const rawResult = await server.store({
        user_id: testUserId,
        file_path: testFilePath,
        interpret: false,
      });

      const result = JSON.parse(rawResult.content[0].text);

      // Track source_id for cleanup
      if (result.source_id) {
        createdSourceIds.push(result.source_id);
      }

      // Verify schema was created (global scope for default test user)
      const { data: schemaAfter } = await db
        .from("schema_registry")
        .select("*")
        .eq("entity_type", unregisteredType)
        .eq("scope", "global")
        .eq("active", true)
        .single();

      expect(schemaAfter).not.toBeNull();
      expect(schemaAfter.entity_type).toBe(unregisteredType);
      expect(schemaAfter.schema_version).toBe("1.0");
      expect(schemaAfter.scope).toBe("global");
      expect(schemaAfter.active).toBe(true);
      expect(schemaAfter.user_id).toBeNull();

      // Track schema_id for cleanup
      createdSchemaIds.push(schemaAfter.id);

      // Verify schema has expected fields
      const schemaFields = schemaAfter.schema_definition.fields;
      expect(schemaFields).toHaveProperty("name");
      expect(schemaFields).toHaveProperty("amount");
      expect(schemaFields).toHaveProperty("created_at");
      expect(schemaFields).toHaveProperty("active");

      // Verify field types
      expect(schemaFields.name.type).toBe("string");
      expect(schemaFields.amount.type).toBe("number");
      expect(schemaFields.created_at.type).toBe("date");
      expect(schemaFields.active.type).toBe("boolean");

      // Verify all fields are optional
      expect(schemaFields.name.required).toBe(false);
      expect(schemaFields.amount.required).toBe(false);

      // Verify reducer config
      const mergePolicies = schemaAfter.reducer_config.merge_policies;
      expect(mergePolicies).toHaveProperty("name");
      expect(mergePolicies.name.strategy).toBe("last_write");
      expect(mergePolicies.name.tie_breaker).toBe("observed_at");

      // Verify data was stored successfully
      expect(result.entities).toHaveLength(2);
      expect(result.entities[0].entity_type).toBe(unregisteredType);
    });

    it("should reuse existing user-specific schema on second store", async () => {
      // Create test parquet file
      const testDir = path.join(os.tmpdir(), "neotoma-test-parquet");
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      const unregisteredType = `auto_test_${randomUUID().substring(0, 8)}`;
      testFilePath = path.join(testDir, `${unregisteredType}.parquet`);

      const testData = [
        { id: BigInt(1), name: "Entity 1", amount: 100 },
        { id: BigInt(2), name: "Entity 2", amount: 200 },
      ];

      await createTestParquetFile({
        outputPath: testFilePath,
        rows: testData,
      });

      // First store (creates schema)
      const rawResult1 = await server.store({
        user_id: testUserId,
        file_path: testFilePath,
        interpret: false,
      });

      const result1 = JSON.parse(rawResult1.content[0].text);
      createdSourceIds.push(result1.source_id);

      // Get created schema ID (global scope for default test user)
      const { data: schema } = await db
        .from("schema_registry")
        .select("id")
        .eq("entity_type", unregisteredType)
        .eq("scope", "global")
        .single();

      createdSchemaIds.push(schema.id);

      // Second store (should reuse schema)
      const testData2 = [
        { id: BigInt(3), name: "Entity 3", amount: 300 },
        { id: BigInt(4), name: "Entity 4", amount: 400 },
      ];

      const testFilePath2 = path.join(
        testDir,
        `${unregisteredType}_2.parquet`
      );
      await createTestParquetFile({
        outputPath: testFilePath2,
        rows: testData2,
      });

      const rawResult2 = await server.store({
        user_id: testUserId,
        file_path: testFilePath2,
        interpret: false,
      });

      const result2 = JSON.parse(rawResult2.content[0].text);
      createdSourceIds.push(result2.source_id);

      // Verify only one schema exists (global scope)
      const { data: schemas, count } = await db
        .from("schema_registry")
        .select("*", { count: "exact" })
        .eq("entity_type", unregisteredType)
        .eq("scope", "global");

      expect(count).toBe(1);
      expect(schemas).toHaveLength(1);

      // Cleanup second test file
      if (fs.existsSync(testFilePath2)) {
        fs.unlinkSync(testFilePath2);
      }
    });

    it("should handle race condition gracefully (concurrent stores)", async () => {
      // Create test parquet files
      const testDir = path.join(os.tmpdir(), "neotoma-test-parquet");
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      const unregisteredType = `auto_test_${randomUUID().substring(0, 8)}`;
      const testData = [{ id: BigInt(1), name: "Entity", amount: 100 }];

      // Create two test files with SAME name (true race condition)
      const testFilePath = path.join(testDir, `${unregisteredType}.parquet`);
      const testFilePath2 = path.join(
        testDir,
        "..",
        "neotoma-test-parquet-2",
        `${unregisteredType}.parquet`
      );

      // Ensure second directory exists
      const testDir2 = path.dirname(testFilePath2);
      if (!fs.existsSync(testDir2)) {
        fs.mkdirSync(testDir2, { recursive: true });
      }

      await createTestParquetFile({ outputPath: testFilePath, rows: testData });
      await createTestParquetFile({
        outputPath: testFilePath2,
        rows: testData,
      });

      // Store both files concurrently (race condition on same entity_type)
      const [rawResult1, rawResult2] = await Promise.allSettled([
        server.store({
          user_id: testUserId,
          file_path: testFilePath,
          interpret: false,
        }),
        server.store({
          user_id: testUserId,
          file_path: testFilePath2,
          interpret: false,
        }),
      ]);

      // Track source_ids
      if (rawResult1.status === "fulfilled") {
        const result1 = JSON.parse(rawResult1.value.content[0].text);
        if (result1.source_id) {
          createdSourceIds.push(result1.source_id);
        }
      }
      if (rawResult2.status === "fulfilled") {
        const result2 = JSON.parse(rawResult2.value.content[0].text);
        if (result2.source_id) {
          createdSourceIds.push(result2.source_id);
        }
      }

      // At least one should succeed
      const successCount = [rawResult1, rawResult2].filter(
        (r) => r.status === "fulfilled"
      ).length;
      expect(successCount).toBeGreaterThanOrEqual(1);

      // Verify at least one schema was created
      // (Race condition may create 2 schemas temporarily, but one should succeed)
      const { data: schemas, count } = await db
        .from("schema_registry")
        .select("*", { count: "exact" })
        .eq("entity_type", unregisteredType)
        .eq("scope", "global");

      expect(count).toBeGreaterThanOrEqual(1);

      // Track schemas for cleanup
      if (schemas && schemas.length > 0) {
        for (const schema of schemas) {
          createdSchemaIds.push(schema.id);
        }
      }

      // Cleanup test files
      if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
      if (fs.existsSync(testFilePath2)) fs.unlinkSync(testFilePath2);
      
      // Cleanup second test directory
      const testDir2Cleanup = path.dirname(testFilePath2);
      if (fs.existsSync(testDir2Cleanup)) {
        fs.rmSync(testDir2Cleanup, { recursive: true, force: true });
      }
    });

    it("should work with auto-enhancement system after schema creation", async () => {
      // Create test parquet file with unregistered entity type
      const testDir = path.join(os.tmpdir(), "neotoma-test-parquet");
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      const unregisteredType = `auto_test_${randomUUID().substring(0, 8)}`;
      testFilePath = path.join(testDir, `${unregisteredType}.parquet`);

      const testData = [
        {
          id: BigInt(1),
          name: "Entity 1",
          amount: 100,
          extra_field: "value1", // Unknown field
        },
        {
          id: BigInt(2),
          name: "Entity 2",
          amount: 200,
          extra_field: "value2",
        },
      ];

      await createTestParquetFile({
        outputPath: testFilePath,
        rows: testData,
        customSchema: {
          id: { type: "INT64", optional: false },
          name: { type: "UTF8", optional: true },
          amount: { type: "INT32", optional: true },
          extra_field: { type: "UTF8", optional: true },
        },
      });

      // Store via MCP
      const rawResult = await server.store({
        user_id: testUserId,
        file_path: testFilePath,
        interpret: false,
      });

      const result = JSON.parse(rawResult.content[0].text);
      createdSourceIds.push(result.source_id);

      // Get the actual entity_type that was stored (from result)
      const actualEntityType = result.entities[0]?.entity_type || unregisteredType;

      // Track schema (global scope)
      const { data: schema } = await db
        .from("schema_registry")
        .select("*")
        .eq("entity_type", actualEntityType)
        .eq("scope", "global")
        .single();

      if (schema) {
        createdSchemaIds.push(schema.id);
      }

      // Since we auto-created schema from ALL fields, extra_field is now in the schema
      // Verify it was included in schema definition
      expect(schema).not.toBeNull();
      expect(schema!.schema_definition.fields).toHaveProperty("extra_field");

      // Verify data was stored successfully
      expect(result.entities).toHaveLength(2);
    });

    it("should infer correct types from diverse data", async () => {
      // Create test data with various types
      const testDir = path.join(os.tmpdir(), "neotoma-test-parquet");
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      const unregisteredType = `auto_test_${randomUUID().substring(0, 8)}`;
      testFilePath = path.join(testDir, `${unregisteredType}.parquet`);

      const testData = [
        {
          id: BigInt(1),
          text_field: "string value",
          number_field: 42,
          date_field: "2025-01-15T00:00:00Z",
          boolean_field: true,
        },
      ];

      await createTestParquetFile({
        outputPath: testFilePath,
        rows: testData,
        customSchema: {
          id: { type: "INT64", optional: false },
          text_field: { type: "UTF8", optional: true },
          number_field: { type: "INT32", optional: true },
          date_field: { type: "UTF8", optional: true },
          boolean_field: { type: "BOOLEAN", optional: true },
        },
      });

      // Store via MCP
      const rawResult = await server.store({
        user_id: testUserId,
        file_path: testFilePath,
        interpret: false,
      });

      const result = JSON.parse(rawResult.content[0].text);
      createdSourceIds.push(result.source_id);

      // Get the actual entity_type that was stored
      const actualEntityType = result.entities[0]?.entity_type || unregisteredType;

      // Get created schema (global scope)
      const { data: schema } = await db
        .from("schema_registry")
        .select("*")
        .eq("entity_type", actualEntityType)
        .eq("scope", "global")
        .single();

      if (schema) {
        createdSchemaIds.push(schema.id);
      }

      expect(schema).not.toBeNull();

      // Verify field types
      const fields = schema!.schema_definition.fields;
      expect(fields.text_field.type).toBe("string");
      expect(fields.number_field.type).toBe("number");
      expect(fields.date_field.type).toBe("date");
      expect(fields.boolean_field.type).toBe("boolean");
    });

    it("should create schema with all fields from first batch", async () => {
      const testDir = path.join(os.tmpdir(), "neotoma-test-parquet");
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      const unregisteredType = `auto_test_${randomUUID().substring(0, 8)}`;
      testFilePath = path.join(testDir, `${unregisteredType}.parquet`);

      const testData = [
        {
          id: BigInt(1),
          field1: "value1",
          field2: 100,
          field3: "2025-01-15T00:00:00Z",
          field4: true,
        },
      ];

      await createTestParquetFile({
        outputPath: testFilePath,
        rows: testData,
        customSchema: {
          id: { type: "INT64", optional: false },
          field1: { type: "UTF8", optional: true },
          field2: { type: "INT32", optional: true },
          field3: { type: "UTF8", optional: true },
          field4: { type: "BOOLEAN", optional: true },
        },
      });

      const rawResult = await server.store({
        user_id: testUserId,
        file_path: testFilePath,
        interpret: false,
      });

      const result = JSON.parse(rawResult.content[0].text);
      createdSourceIds.push(result.source_id);

      // Get the actual entity_type that was stored
      const actualEntityType = result.entities[0]?.entity_type || unregisteredType;

      // Get created schema (global scope)
      const { data: schema } = await db
        .from("schema_registry")
        .select("*")
        .eq("entity_type", actualEntityType)
        .eq("scope", "global")
        .single();

      if (schema) {
        createdSchemaIds.push(schema.id);
      }

      expect(schema).not.toBeNull();

      // Verify all fields are in schema
      const fieldNames = Object.keys(schema!.schema_definition.fields);
      expect(fieldNames).toContain("field1");
      expect(fieldNames).toContain("field2");
      expect(fieldNames).toContain("field3");
      expect(fieldNames).toContain("field4");
      expect(fieldNames).toHaveLength(5); // Including id field
    });

    it("should not interfere with existing global schemas", async () => {
      // Use existing entity type with global schema (e.g., "task")
      const testDir = path.join(os.tmpdir(), "neotoma-test-parquet");
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      testFilePath = path.join(testDir, "tasks.parquet"); // Will be inferred as "task"

      const testData = [
        {
          id: BigInt(1),
          title: "Test Task",
          status: "pending",
          priority: "high",
        },
      ];

      await createTestParquetFile({
        outputPath: testFilePath,
        rows: testData,
        customSchema: {
          id: { type: "INT64", optional: false },
          title: { type: "UTF8", optional: true },
          status: { type: "UTF8", optional: true },
          priority: { type: "UTF8", optional: true },
        },
      });

      // Store via MCP (should use existing global schema, not create new)
      const rawResult = await server.store({
        user_id: testUserId,
        file_path: testFilePath,
        interpret: false,
      });

      const result = JSON.parse(rawResult.content[0].text);
      createdSourceIds.push(result.source_id);

      // Verify no user-specific schema was created
      const { data: userSchema } = await db
        .from("schema_registry")
        .select("*")
        .eq("entity_type", "task")
        .eq("user_id", testUserId)
        .eq("scope", "user")
        .maybeSingle();

      expect(userSchema).toBeNull();

      // Verify data was stored successfully using global schema
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].entity_type).toBe("task"); // Inferred from "tasks.parquet"
    });

    it("should handle entities with null values", async () => {
      const testDir = path.join(os.tmpdir(), "neotoma-test-parquet");
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      const unregisteredType = `auto_test_${randomUUID().substring(0, 8)}`;
      testFilePath = path.join(testDir, `${unregisteredType}.parquet`);

      const testData = [
        { id: BigInt(1), name: "Entity 1", amount: 100, notes: null },
        { id: BigInt(2), name: "Entity 2", amount: null, notes: "Some notes" },
      ];

      await createTestParquetFile({
        outputPath: testFilePath,
        rows: testData,
        customSchema: {
          id: { type: "INT64", optional: false },
          name: { type: "UTF8", optional: true },
          amount: { type: "INT32", optional: true },
          notes: { type: "UTF8", optional: true },
        },
      });

      const rawResult = await server.store({
        user_id: testUserId,
        file_path: testFilePath,
        interpret: false,
      });

      const result = JSON.parse(rawResult.content[0].text);
      createdSourceIds.push(result.source_id);

      // Get the actual entity_type that was stored
      const actualEntityType = result.entities[0]?.entity_type || unregisteredType;

      // Get created schema (global scope)
      const { data: schema } = await db
        .from("schema_registry")
        .select("*")
        .eq("entity_type", actualEntityType)
        .eq("scope", "global")
        .single();

      if (schema) {
        createdSchemaIds.push(schema.id);
      }

      expect(schema).not.toBeNull();

      // Verify schema was created with correct types (null values handled)
      const fields = schema!.schema_definition.fields;
      expect(fields).toHaveProperty("name");
      expect(fields).toHaveProperty("amount");
      expect(fields).toHaveProperty("notes");

      // Verify data was stored
      expect(result.entities).toHaveLength(2);
    });
  });
});
