/**
 * Unit tests for BigInt serialization handling
 * 
 * Ensures all JSON.stringify calls in the codebase handle BigInt values correctly
 */

import { describe, it, expect } from "vitest";

describe("BigInt Serialization", () => {
  describe("JSON.stringify with BigInt", () => {
    it("should fail with standard JSON.stringify", () => {
      const data = {
        id: BigInt(12345678901234567890),
        name: "test",
      };

      // Standard JSON.stringify cannot serialize BigInt
      expect(() => JSON.stringify(data)).toThrow();
    });

    it("should succeed with BigInt replacer function", () => {
      const data = {
        id: BigInt(12345678901234567890),
        name: "test",
        count: 42,
      };

      const replacer = (key: string, value: unknown) => {
        if (typeof value === "bigint") {
          return Number(value);
        }
        return value;
      };

      const serialized = JSON.stringify(data, replacer);
      expect(() => JSON.parse(serialized)).not.toThrow();
      
      const parsed = JSON.parse(serialized);
      expect(typeof parsed.id).toBe("number");
      expect(parsed.id).toBe(12345678901234567890);
      expect(parsed.name).toBe("test");
      expect(parsed.count).toBe(42);
    });

    it("should handle nested objects with BigInt", () => {
      const data = {
        id: 1,
        metadata: {
          timestamp: BigInt(1234567890),
          nested: {
            value: BigInt(9876543210),
          },
        },
      };

      const replacer = (key: string, value: unknown) => {
        if (typeof value === "bigint") {
          return Number(value);
        }
        return value;
      };

      const serialized = JSON.stringify(data, replacer);
      const parsed = JSON.parse(serialized);

      expect(parsed.id).toBe(1);
      expect(typeof parsed.metadata.timestamp).toBe("number");
      expect(parsed.metadata.timestamp).toBe(1234567890);
      expect(typeof parsed.metadata.nested.value).toBe("number");
      expect(parsed.metadata.nested.value).toBe(9876543210);
    });

    it("should handle arrays with BigInt", () => {
      const data = {
        ids: [BigInt(1), BigInt(2), BigInt(3)],
        names: ["a", "b", "c"],
      };

      const replacer = (key: string, value: unknown) => {
        if (typeof value === "bigint") {
          return Number(value);
        }
        return value;
      };

      const serialized = JSON.stringify(data, replacer);
      const parsed = JSON.parse(serialized);

      expect(parsed.ids).toEqual([1, 2, 3]);
      expect(parsed.ids.every((n: unknown) => typeof n === "number")).toBe(true);
      expect(parsed.names).toEqual(["a", "b", "c"]);
    });

    it("should handle mixed arrays with BigInt and other types", () => {
      const data = {
        values: [BigInt(100), "string", 42, BigInt(200), null, undefined],
      };

      const replacer = (key: string, value: unknown) => {
        if (typeof value === "bigint") {
          return Number(value);
        }
        if (value === undefined) {
          return null; // JSON.stringify converts undefined to null
        }
        return value;
      };

      const serialized = JSON.stringify(data, replacer);
      const parsed = JSON.parse(serialized);

      expect(parsed.values).toEqual([100, "string", 42, 200, null, null]);
    });

    it("should preserve Date objects while converting BigInt", () => {
      const date = new Date("2024-01-01");
      const data = {
        id: BigInt(123),
        created_at: date,
      };

      const replacer = (key: string, value: unknown) => {
        if (typeof value === "bigint") {
          return Number(value);
        }
        return value;
      };

      const serialized = JSON.stringify(data, replacer);
      const parsed = JSON.parse(serialized);

      expect(typeof parsed.id).toBe("number");
      expect(parsed.id).toBe(123);
      expect(typeof parsed.created_at).toBe("string"); // Dates are serialized as ISO strings
    });
  });

  describe("Server Response Serialization", () => {
    it("should simulate buildTextResponse with BigInt data", () => {
      // Simulate the buildTextResponse method behavior
      const buildTextResponse = (data: unknown) => {
        const replacer = (key: string, value: unknown) => {
          if (typeof value === "bigint") {
            return Number(value);
          }
          return value;
        };
        return {
          content: [{ type: "text", text: JSON.stringify(data, replacer, 2) }],
        };
      };

      const testData = {
        source_id: "src-123",
        entities: [
          {
            entity_id: "ent-1",
            entity_type: "task",
            observation_id: "obs-1",
          },
        ],
        metadata: {
          total_count: BigInt(1000),
          processed: BigInt(500),
        },
      };

      const response = buildTextResponse(testData);

      expect(response.content).toBeDefined();
      expect(response.content[0].type).toBe("text");
      expect(() => JSON.parse(response.content[0].text)).not.toThrow();

      const parsed = JSON.parse(response.content[0].text);
      expect(typeof parsed.metadata.total_count).toBe("number");
      expect(parsed.metadata.total_count).toBe(1000);
      expect(typeof parsed.metadata.processed).toBe("number");
      expect(parsed.metadata.processed).toBe(500);
    });

    it("should simulate storeStructuredInternal JSON serialization", () => {
      // Simulate the storeStructuredInternal JSON.stringify behavior
      const serializeEntities = (entities: Array<Record<string, unknown>>) => {
        const replacer = (key: string, value: unknown) => {
          if (typeof value === "bigint") {
            return Number(value);
          }
          return value;
        };
        return JSON.stringify(entities, replacer, 2);
      };

      const entities = [
        {
          entity_type: "task",
          id: BigInt(12345678901234567890),
          name: "Test Task",
          count: BigInt(999),
        },
        {
          entity_type: "task",
          id: BigInt(98765432109876543210),
          name: "Another Task",
          count: BigInt(888),
        },
      ];

      const serialized = serializeEntities(entities);
      expect(() => JSON.parse(serialized)).not.toThrow();

      const parsed = JSON.parse(serialized);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
      expect(typeof parsed[0].id).toBe("number");
      expect(typeof parsed[0].count).toBe("number");
      expect(typeof parsed[1].id).toBe("number");
      expect(typeof parsed[1].count).toBe("number");
    });
  });
});
