/**
 * Schema Inference Unit Tests
 *
 * Tests schema inference from structured data (JSON arrays, parquet files).
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  inferSchemaFromEntities,
  type InferredSchema,
} from "../../src/services/schema_inference.js";

describe("Schema Inference", () => {
  describe("inferSchemaFromEntities", () => {
    it("should infer schema from simple entity array", async () => {
      const entities = [
        {
          entity_type: "test_entity",
          name: "Entity 1",
          amount: 100,
          date: "2025-01-15T00:00:00Z",
          active: true,
        },
        {
          entity_type: "test_entity",
          name: "Entity 2",
          amount: 200,
          date: "2025-01-16T00:00:00Z",
          active: false,
        },
      ];

      const result = await inferSchemaFromEntities(entities, "test_entity");

      expect(result.schemaDefinition.fields).toHaveProperty("name");
      expect(result.schemaDefinition.fields).toHaveProperty("amount");
      expect(result.schemaDefinition.fields).toHaveProperty("date");
      expect(result.schemaDefinition.fields).toHaveProperty("active");

      expect(result.schemaDefinition.fields.name.type).toBe("string");
      expect(result.schemaDefinition.fields.amount.type).toBe("number");
      expect(result.schemaDefinition.fields.date.type).toBe("date");
      expect(result.schemaDefinition.fields.active.type).toBe("boolean");

      // All fields should be optional by default
      expect(result.schemaDefinition.fields.name.required).toBe(false);
      expect(result.schemaDefinition.fields.amount.required).toBe(false);
    });

    it("should handle null values gracefully", async () => {
      const entities = [
        {
          entity_type: "test_entity",
          name: "Entity 1",
          amount: 100,
          notes: null,
        },
        {
          entity_type: "test_entity",
          name: "Entity 2",
          amount: 200,
          notes: "Some notes",
        },
      ];

      const result = await inferSchemaFromEntities(entities, "test_entity");

      expect(result.schemaDefinition.fields).toHaveProperty("notes");
      expect(result.schemaDefinition.fields.notes.type).toBe("string");
    });

    it("should infer date type from field names with _date suffix", async () => {
      const entities = [
        {
          entity_type: "test_entity",
          created_date: "2025-01-15T00:00:00Z",
          updated_date: "2025-01-16T00:00:00Z",
        },
      ];

      const result = await inferSchemaFromEntities(entities, "test_entity");

      expect(result.schemaDefinition.fields.created_date.type).toBe("date");
      expect(result.schemaDefinition.fields.updated_date.type).toBe("date");
    });

    it("should infer date type from field names with _at suffix", async () => {
      const entities = [
        {
          entity_type: "test_entity",
          created_at: "2025-01-15T10:30:00Z",
          updated_at: "2025-01-16T12:45:00Z",
        },
      ];

      const result = await inferSchemaFromEntities(entities, "test_entity");

      expect(result.schemaDefinition.fields.created_at.type).toBe("date");
      expect(result.schemaDefinition.fields.updated_at.type).toBe("date");
    });

    it("should infer date type from timestamps (nanoseconds)", async () => {
      const entities = [
        {
          entity_type: "test_entity",
          created_at: 1705305600000000000, // Nanoseconds
          updated_at: 1705392000000000000,
        },
      ];

      const result = await inferSchemaFromEntities(entities, "test_entity");

      expect(result.schemaDefinition.fields.created_at.type).toBe("date");
      expect(result.schemaDefinition.fields.updated_at.type).toBe("date");
    });

    it("should infer number type for regular numbers", async () => {
      const entities = [
        {
          entity_type: "test_entity",
          price: 99.99,
          quantity: 5,
          discount: 0.1,
        },
      ];

      const result = await inferSchemaFromEntities(entities, "test_entity");

      expect(result.schemaDefinition.fields.price.type).toBe("number");
      expect(result.schemaDefinition.fields.quantity.type).toBe("number");
      expect(result.schemaDefinition.fields.discount.type).toBe("number");
    });

    it("should infer array type", async () => {
      const entities = [
        {
          entity_type: "test_entity",
          tags: ["tag1", "tag2", "tag3"],
          items: [
            { name: "Item 1", price: 10 },
            { name: "Item 2", price: 20 },
          ],
        },
      ];

      const result = await inferSchemaFromEntities(entities, "test_entity");

      expect(result.schemaDefinition.fields.tags.type).toBe("array");
      expect(result.schemaDefinition.fields.items.type).toBe("array");
    });

    it("should infer object type", async () => {
      const entities = [
        {
          entity_type: "test_entity",
          metadata: {
            source: "import",
            version: "1.0",
          },
          address: {
            street: "123 Main St",
            city: "San Francisco",
          },
        },
      ];

      const result = await inferSchemaFromEntities(entities, "test_entity");

      expect(result.schemaDefinition.fields.metadata.type).toBe("object");
      expect(result.schemaDefinition.fields.address.type).toBe("object");
    });

    it("should handle mixed types by choosing dominant type", async () => {
      const entities = [
        { entity_type: "test_entity", field1: "string value" },
        { entity_type: "test_entity", field1: "another string" },
        { entity_type: "test_entity", field1: 123 }, // One number
      ];

      const result = await inferSchemaFromEntities(entities, "test_entity");

      // Dominant type is string (2 out of 3)
      expect(result.schemaDefinition.fields.field1.type).toBe("string");
    });

    it("should create default reducer config with last_write strategy", async () => {
      const entities = [
        {
          entity_type: "test_entity",
          name: "Entity 1",
          amount: 100,
        },
      ];

      const result = await inferSchemaFromEntities(entities, "test_entity");

      expect(result.reducerConfig.merge_policies).toHaveProperty("name");
      expect(result.reducerConfig.merge_policies).toHaveProperty("amount");

      expect(result.reducerConfig.merge_policies.name.strategy).toBe(
        "last_write"
      );
      expect(result.reducerConfig.merge_policies.name.tie_breaker).toBe(
        "observed_at"
      );
    });

    it("should exclude entity_type and type from schema fields", async () => {
      const entities = [
        {
          entity_type: "test_entity",
          type: "test_entity",
          name: "Entity 1",
        },
      ];

      const result = await inferSchemaFromEntities(entities, "test_entity");

      expect(result.schemaDefinition.fields).not.toHaveProperty("entity_type");
      expect(result.schemaDefinition.fields).not.toHaveProperty("type");
      expect(result.schemaDefinition.fields).toHaveProperty("name");
    });

    it("should calculate confidence based on type consistency", async () => {
      const consistentEntities = [
        { entity_type: "test", field1: "string1", field2: 100 },
        { entity_type: "test", field1: "string2", field2: 200 },
        { entity_type: "test", field1: "string3", field2: 300 },
      ];

      const result = await inferSchemaFromEntities(
        consistentEntities,
        "test"
      );

      // High confidence for consistent types
      expect(result.metadata.confidence).toBeGreaterThan(0.9);
    });

    it("should handle empty field values", async () => {
      const entities = [
        { entity_type: "test", name: "", amount: 0 },
        { entity_type: "test", name: "Valid", amount: 100 },
      ];

      const result = await inferSchemaFromEntities(entities, "test");

      expect(result.schemaDefinition.fields).toHaveProperty("name");
      expect(result.schemaDefinition.fields).toHaveProperty("amount");
      expect(result.schemaDefinition.fields.name.type).toBe("string");
      expect(result.schemaDefinition.fields.amount.type).toBe("number");
    });

    it("should infer string type for numeric strings with leading zeros", async () => {
      const entities = [
        {
          entity_type: "test",
          account_number: "00012345",
          zip_code: "00501",
        },
      ];

      const result = await inferSchemaFromEntities(entities, "test");

      // Should keep as string (leading zeros indicate it's an ID)
      expect(result.schemaDefinition.fields.account_number.type).toBe("string");
      expect(result.schemaDefinition.fields.zip_code.type).toBe("string");
    });

    it("should infer string type for long numeric strings", async () => {
      const entities = [
        {
          entity_type: "test",
          transaction_id: "12345678901234567890", // Very long number
        },
      ];

      const result = await inferSchemaFromEntities(entities, "test");

      // Should keep as string (too long to be a regular number)
      expect(result.schemaDefinition.fields.transaction_id.type).toBe("string");
    });

    it("should infer boolean from boolean strings", async () => {
      const entities = [
        { entity_type: "test", flag1: "true", flag2: "yes" },
        { entity_type: "test", flag1: "false", flag2: "no" },
      ];

      const result = await inferSchemaFromEntities(entities, "test");

      expect(result.schemaDefinition.fields.flag1.type).toBe("boolean");
      expect(result.schemaDefinition.fields.flag2.type).toBe("boolean");
    });

    it("should throw error for empty entities array", async () => {
      await expect(
        inferSchemaFromEntities([], "test_entity")
      ).rejects.toThrow("Cannot infer schema from empty entities array");
    });

    it("should sample large entity arrays", async () => {
      // Create 1000 entities
      const entities = Array.from({ length: 1000 }, (_, i) => ({
        entity_type: "test",
        id: i,
        name: `Entity ${i}`,
      }));

      const result = await inferSchemaFromEntities(entities, "test", {
        sampleSize: 50,
      });

      // Should still infer schema correctly from sample
      expect(result.schemaDefinition.fields).toHaveProperty("id");
      expect(result.schemaDefinition.fields).toHaveProperty("name");
      expect(result.metadata.field_count).toBe(2);
    });

    it("should include metadata about inference", async () => {
      const entities = [
        {
          entity_type: "test",
          name: "Entity 1",
          amount: 100,
        },
      ];

      const result = await inferSchemaFromEntities(entities, "test");

      expect(result.metadata).toHaveProperty("field_count");
      expect(result.metadata).toHaveProperty("inferred_types");
      expect(result.metadata).toHaveProperty("confidence");

      expect(result.metadata.field_count).toBe(2);
      expect(result.metadata.inferred_types).toEqual({
        name: "string",
        amount: "number",
      });
    });

    it("should handle entities with varying field sets", async () => {
      const entities = [
        { entity_type: "test", field1: "value1", field2: 100 },
        { entity_type: "test", field1: "value2", field3: "extra" },
        { entity_type: "test", field2: 200, field4: true },
      ];

      const result = await inferSchemaFromEntities(entities, "test");

      // Should include all fields seen across samples
      expect(result.schemaDefinition.fields).toHaveProperty("field1");
      expect(result.schemaDefinition.fields).toHaveProperty("field2");
      expect(result.schemaDefinition.fields).toHaveProperty("field3");
      expect(result.schemaDefinition.fields).toHaveProperty("field4");
    });
  });
});
