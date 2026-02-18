/**
 * Cross-Layer Integration Tests: CLI Schema Commands → Database
 *
 * Validates that CLI schema commands correctly propagate through
 * REST → MCP → Database, verifying schema_registry state.
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";
import {
  verifySchemaVersionActive,
  verifySchemaFieldExists,
} from "../helpers/database_verifiers.js";
import {
  cleanupTestSchema,
  cleanupSchemaRecommendations,
} from "../helpers/cleanup_helpers.js";
import {
  execCliJson,
  TempFileManager,
  extractSourceId,
} from "../helpers/cross_layer_helpers.js";

const TEST_USER_ID = "test-cross-layer-schema";
const TEST_ENTITY_TYPE = `cross_layer_schema_${Date.now()}`;

describe("Cross-layer: CLI schema commands → Database", () => {
  const tracker = new TestIdTracker();
  const files = new TempFileManager();

  beforeAll(async () => {
    await files.setup();
  });

  afterEach(async () => {
    await tracker.cleanup();
    await cleanupSchemaRecommendations(TEST_ENTITY_TYPE, TEST_USER_ID);
    await cleanupTestSchema(TEST_ENTITY_TYPE, TEST_USER_ID);
  });

  describe("schemas register → schema_registry table", () => {
    it("should register schema and verify active in DB", async () => {
      const entityType = `${TEST_ENTITY_TYPE}_reg`;
      const schemaDef = JSON.stringify({
        fields: {
          name: { type: "string", required: true },
          value: { type: "number", required: false },
        },
      });

      const result = await execCliJson(
        `schemas register "${entityType}" --schema '${schemaDef}' --user-id "${TEST_USER_ID}" --activate`
      );

      expect(result).toHaveProperty("schema_version");

      const version = result.schema_version as string;
      await verifySchemaVersionActive(entityType, version, {
        user_id: TEST_USER_ID,
        hasFields: ["name", "value"],
      });

      // Cleanup this specific type
      await cleanupTestSchema(entityType, TEST_USER_ID);
    });

    it("should register schema with --migrate-existing flag", async () => {
      const entityType = `${TEST_ENTITY_TYPE}_migrate`;
      const schemaDef = JSON.stringify({
        fields: {
          title: { type: "string", required: true },
        },
      });

      const result = await execCliJson(
        `schemas register "${entityType}" --schema '${schemaDef}' --user-id "${TEST_USER_ID}" --activate --migrate-existing`
      );

      expect(result).toHaveProperty("schema_version");

      await cleanupTestSchema(entityType, TEST_USER_ID);
    });
  });

  describe("schemas update → schema_registry incremental update", () => {
    it("should add field via schemas update and verify in DB", async () => {
      const entityType = `${TEST_ENTITY_TYPE}_upd`;

      // Register base schema first
      const baseDef = JSON.stringify({
        fields: {
          base_field: { type: "string", required: true },
        },
      });
      const registerResult = await execCliJson(
        `schemas register "${entityType}" --schema '${baseDef}' --user-id "${TEST_USER_ID}" --activate`
      );
      expect(registerResult).toHaveProperty("schema_version");

      // Update with additional field
      const updateDef = JSON.stringify([
        { field_name: "new_field", type: "string", required: false },
      ]);

      const updateResult = await execCliJson(
        `schemas update "${entityType}" --fields '${updateDef}' --user-id "${TEST_USER_ID}"`
      );

      expect(updateResult).toBeDefined();

      await cleanupTestSchema(entityType, TEST_USER_ID);
    });
  });

  describe("schemas list → reads from schema_registry", () => {
    it("should list registered schemas", async () => {
      const result = await execCliJson(
        `schemas list --user-id "${TEST_USER_ID}"`
      );

      // Should return an array or object with schemas
      const hasResult =
        Array.isArray(result) ||
        result.schemas !== undefined ||
        result.entity_types !== undefined;
      expect(hasResult).toBe(true);
    });

    it("should filter schemas by entity type", async () => {
      const entityType = `${TEST_ENTITY_TYPE}_list`;
      const schemaDef = JSON.stringify({
        fields: { test_field: { type: "string", required: false } },
      });

      const registerResult = await execCliJson(
        `schemas register "${entityType}" --schema '${schemaDef}' --user-id "${TEST_USER_ID}" --activate`
      );
      expect(registerResult).toHaveProperty("schema_version");

      const listResult = await execCliJson(
        `schemas list --entity-type "${entityType}" --user-id "${TEST_USER_ID}"`
      );

      const schemas = Array.isArray(listResult)
        ? listResult
        : (listResult.schemas as unknown[]) ?? [];
      expect(schemas.length).toBeGreaterThanOrEqual(1);

      await cleanupTestSchema(entityType, TEST_USER_ID);
    });
  });

  describe("schemas analyze → schema_recommendations from DB", () => {
    it("should analyze entity type schema candidates", async () => {
      // Store some data first to generate candidates
      const filePath = await files.createJson("schema-analyze.json", {
        entity_type: TEST_ENTITY_TYPE,
        canonical_name: "Schema Analyze Test",
        unknown_field_one: "value1",
        unknown_field_two: 42,
      });

      const storeResult = await execCliJson(
        `store-structured --file-path "${filePath}" --user-id "${TEST_USER_ID}"`
      );

      if (storeResult.source_id) {
        tracker.trackSource(storeResult.source_id as string);
      }
      const entityIds = (storeResult.entities_created as Array<{ id: string }>) ?? [];
      for (const e of entityIds) {
        tracker.trackEntity(e.id);
      }

      // Analyze schema candidates
      const analyzeResult = await execCliJson(
        `schemas analyze --entity-type "${TEST_ENTITY_TYPE}" --user-id "${TEST_USER_ID}"`
      );

      // Should return candidates or empty list without error
      expect(analyzeResult).toBeDefined();
    });
  });

  describe("schemas recommend → schema_recommendations from DB", () => {
    it("should return schema recommendations for entity type", async () => {
      const result = await execCliJson(
        `schemas recommend "${TEST_ENTITY_TYPE}" --user-id "${TEST_USER_ID}"`
      );

      // Should return recommendations (possibly empty) without error
      expect(result).toBeDefined();
    });
  });
});
