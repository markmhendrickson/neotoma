/**
 * Unit tests for Parquet Reader Service
 */

import { describe, it, expect } from "vitest";
import {
  readParquetFile,
  isParquetFile,
  convertBigIntValues,
} from "../../src/services/parquet_reader.js";

describe("Parquet Reader", () => {
  describe("isParquetFile", () => {
    it("should detect parquet files by extension", () => {
      expect(isParquetFile("test.parquet")).toBe(true);
      expect(isParquetFile("test.PARQUET")).toBe(true);
      expect(isParquetFile("/path/to/file.parquet")).toBe(true);
      expect(isParquetFile("test.csv")).toBe(false);
      expect(isParquetFile("test.json")).toBe(false);
      expect(isParquetFile("parquet")).toBe(false);
    });
  });

  describe("convertBigIntValues", () => {
    it("should convert BigInt values to numbers", () => {
      const input = {
        id: BigInt(12345678901234567890),
        name: "test",
        count: 42,
      };

      const result = convertBigIntValues(input);

      expect(typeof result.id).toBe("number");
      expect(result.id).toBe(12345678901234567890);
      expect(result.name).toBe("test");
      expect(result.count).toBe(42);
    });

    it("should handle nested objects with BigInt", () => {
      const input = {
        id: 1,
        metadata: {
          timestamp: BigInt(1234567890),
          nested: {
            value: BigInt(9876543210),
          },
        },
      };

      const result = convertBigIntValues(input);

      expect(result.id).toBe(1);
      expect(typeof (result.metadata as any).timestamp).toBe("number");
      expect((result.metadata as any).timestamp).toBe(1234567890);
      expect(typeof (result.metadata as any).nested.value).toBe("number");
      expect((result.metadata as any).nested.value).toBe(9876543210);
    });

    it("should handle arrays with BigInt values", () => {
      const input = {
        ids: [BigInt(1), BigInt(2), BigInt(3)],
        names: ["a", "b", "c"],
      };

      const result = convertBigIntValues(input);

      expect(Array.isArray(result.ids)).toBe(true);
      expect(result.ids).toEqual([1, 2, 3]);
      expect((result.ids as number[]).every((n) => typeof n === "number")).toBe(true);
      expect(result.names).toEqual(["a", "b", "c"]);
    });

    it("should handle mixed arrays with BigInt and other types", () => {
      const input = {
        values: [BigInt(100), "string", 42, BigInt(200)],
      };

      const result = convertBigIntValues(input);

      expect(result.values).toEqual([100, "string", 42, 200]);
    });

    it("should preserve non-BigInt values", () => {
      const input = {
        string: "test",
        number: 42,
        boolean: true,
        nullValue: null,
        date: new Date("2024-01-01"),
        array: [1, 2, 3],
      };

      const result = convertBigIntValues(input);

      expect(result.string).toBe("test");
      expect(result.number).toBe(42);
      expect(result.boolean).toBe(true);
      expect(result.nullValue).toBe(null);
      expect(result.date).toBeInstanceOf(Date);
      expect(result.array).toEqual([1, 2, 3]);
    });

    it("should handle empty objects", () => {
      const input = {};
      const result = convertBigIntValues(input);
      expect(result).toEqual({});
    });

    it("should handle objects with only BigInt values", () => {
      const input = {
        id: BigInt(123),
        count: BigInt(456),
      };

      const result = convertBigIntValues(input);

      expect(result).toEqual({ id: 123, count: 456 });
      expect(typeof result.id).toBe("number");
      expect(typeof result.count).toBe("number");
    });

    it("should handle deeply nested structures", () => {
      const input = {
        level1: {
          level2: {
            level3: {
              value: BigInt(999),
            },
          },
        },
      };

      const result = convertBigIntValues(input);

      expect(
        (result.level1 as any).level2.level3.value
      ).toBe(999);
      expect(
        typeof (result.level1 as any).level2.level3.value
      ).toBe("number");
    });
  });

  describe("readParquetFile", () => {
    it("should throw error for non-existent file", async () => {
      await expect(
        readParquetFile("/nonexistent/path/file.parquet")
      ).rejects.toThrow();
    });

    // Note: Integration tests with actual parquet files should be in integration test suite
    // This unit test suite focuses on testable functions without file I/O
  });
});
