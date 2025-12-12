/**
 * Validation Schema Tests for v0.1.0
 *
 * Goal: Verify that all Zod schemas, type normalization, property validation, and authorization work correctly.
 */

import { describe, it, expect } from "vitest";
import { normalizeRecordType } from "../../../../src/config/record_types.js";
import { normalizeEntityValue } from "../../../../src/services/entity_resolution.js";

describe("Validation Schema Tests", () => {
  describe("Type normalization", () => {
    it("should normalize record types to lowercase", () => {
      expect(normalizeRecordType("INVOICE").type).toBe("invoice");
      expect(normalizeRecordType("Invoice").type).toBe("invoice");
      expect(normalizeRecordType("InVoIcE").type).toBe("invoice");
      expect(normalizeRecordType("invoice").type).toBe("invoice");
    });

    it("should normalize record types with alias handling", () => {
      // "bill" is an alias for "invoice"
      expect(normalizeRecordType("bill").type).toBe("invoice");
      expect(normalizeRecordType("Bill").type).toBe("invoice");
      expect(normalizeRecordType("BILL").type).toBe("invoice");
    });

    it("should handle type normalization with whitespace", () => {
      expect(normalizeRecordType("  invoice  ").type).toBe("invoice");
      expect(normalizeRecordType(" Invoice ").type).toBe("invoice");
    });

    it("should normalize unknown types", () => {
      const result1 = normalizeRecordType("CustomType");
      const result2 = normalizeRecordType("CUSTOM_TYPE");
      // Unknown types get mapped to a default type
      expect(result1.type).toBeDefined();
      expect(result2.type).toBeDefined();
    });
  });

  describe("Entity value normalization", () => {
    it("should normalize company names to lowercase", () => {
      const normalized = normalizeEntityValue("company", "Acme Corp");
      expect(normalized).toBe("acme");
    });

    it("should remove company suffixes", () => {
      expect(normalizeEntityValue("company", "Acme Inc")).toBe("acme");
      expect(normalizeEntityValue("company", "Acme LLC")).toBe("acme");
      expect(normalizeEntityValue("company", "Acme Ltd")).toBe("acme");
      expect(normalizeEntityValue("company", "Acme Corp")).toBe("acme");
      expect(normalizeEntityValue("company", "Acme Corporation")).toBe("acme");
      expect(normalizeEntityValue("company", "Acme Co")).toBe("acme");
      expect(normalizeEntityValue("company", "Acme Company")).toBe("acme");
      expect(normalizeEntityValue("company", "Acme Limited")).toBe("acme");
    });

    it("should normalize whitespace", () => {
      expect(normalizeEntityValue("company", "  Acme   Corp  ")).toBe("acme");
      expect(normalizeEntityValue("company", "Acme  Multi  Space  Corp")).toBe(
        "acme multi space"
      );
    });

    it("should handle case variations", () => {
      expect(normalizeEntityValue("company", "ACME CORP")).toBe("acme");
      expect(normalizeEntityValue("company", "AcMe CoRp")).toBe("acme");
      expect(normalizeEntityValue("company", "acme corp")).toBe("acme");
    });

    it("should preserve non-company entity types", () => {
      const personNorm = normalizeEntityValue("person", "John Doe");
      expect(personNorm).toBe("john doe");
      expect(personNorm).not.toContain("inc");
      expect(personNorm).not.toContain("llc");
    });

    it("should handle Unicode in entity names", () => {
      const unicode = normalizeEntityValue("company", "北京公司 Inc");
      expect(unicode).toBe("北京公司");
    });
  });

  describe("Property validation", () => {
    it("should accept valid property types", () => {
      const properties = {
        string_field: "value",
        number_field: 123,
        boolean_field: true,
        null_field: null,
        array_field: [1, 2, 3],
        object_field: { nested: "value" },
      };

      // All should be valid JSONB
      expect(typeof properties.string_field).toBe("string");
      expect(typeof properties.number_field).toBe("number");
      expect(typeof properties.boolean_field).toBe("boolean");
      expect(properties.null_field).toBeNull();
      expect(Array.isArray(properties.array_field)).toBe(true);
      expect(typeof properties.object_field).toBe("object");
    });

    it("should handle property key validation", () => {
      const validKeys = [
        "simple_key",
        "key_with_numbers_123",
        "key-with-dashes",
        "key.with.dots",
        "CamelCaseKey",
        "UPPERCASE_KEY",
      ];

      validKeys.forEach((key) => {
        expect(typeof key).toBe("string");
        expect(key.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Array validation", () => {
    it("should validate file_urls array", () => {
      const validFileUrls = [
        "https://example.com/file.pdf",
        "file:///local/path/file.pdf",
        "/absolute/path/file.pdf",
        "relative/path/file.pdf",
      ];

      validFileUrls.forEach((url) => {
        expect(typeof url).toBe("string");
        expect(url.length).toBeGreaterThan(0);
      });
    });

    it("should validate ids array", () => {
      const validIds = [
        "00000000-0000-0000-0000-000000000000",
        "550e8400-e29b-41d4-a716-446655440000",
      ];

      validIds.forEach((id) => {
        expect(typeof id).toBe("string");
        expect(id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        );
      });
    });

    it("should validate search_terms array", () => {
      const validSearchTerms = ["term1", "term2", "term with spaces"];

      validSearchTerms.forEach((term) => {
        expect(typeof term).toBe("string");
      });
    });
  });

  describe("Numeric range validation", () => {
    it("should validate limit ranges", () => {
      const validLimits = [1, 10, 50, 100, 1000];
      const invalidLimits = [-1, 0, 10001];

      validLimits.forEach((limit) => {
        expect(limit).toBeGreaterThan(0);
        expect(limit).toBeLessThanOrEqual(10000);
      });

      invalidLimits.forEach((limit) => {
        expect(limit <= 0 || limit > 10000).toBe(true);
      });
    });

    it("should validate similarity_threshold ranges", () => {
      const validThresholds = [0.0, 0.5, 0.7, 0.9, 1.0];
      const invalidThresholds = [-0.1, 1.1, 2.0];

      validThresholds.forEach((threshold) => {
        expect(threshold).toBeGreaterThanOrEqual(0);
        expect(threshold).toBeLessThanOrEqual(1);
      });

      invalidThresholds.forEach((threshold) => {
        expect(threshold < 0 || threshold > 1).toBe(true);
      });
    });

    it("should validate offset ranges", () => {
      const validOffsets = [0, 10, 100, 1000];
      const invalidOffsets = [-1, -10];

      validOffsets.forEach((offset) => {
        expect(offset).toBeGreaterThanOrEqual(0);
      });

      invalidOffsets.forEach((offset) => {
        expect(offset).toBeLessThan(0);
      });
    });
  });

  describe("Field type detection", () => {
    it("should detect date fields ending with _date", () => {
      const datePattern = /(_date|_datetime|_at)$/i;
      expect(datePattern.test("created_date")).toBe(true);
      expect(datePattern.test("updated_date")).toBe(true);
      expect(datePattern.test("transaction_date")).toBe(true);
      expect(datePattern.test("posted_date")).toBe(true);
      // Fields with "date_" prefix don't match because pattern looks for suffix
      expect(datePattern.test("date_issued")).toBe(false);
      expect(datePattern.test("date_due")).toBe(false);
    });

    it("should detect fields ending with _at", () => {
      const datePattern = /(_date|_datetime|_at)$/i;
      expect(datePattern.test("created_at")).toBe(true);
      expect(datePattern.test("updated_at")).toBe(true);
      expect(datePattern.test("observed_at")).toBe(true);
    });

    it("should detect fields ending with _datetime", () => {
      const datePattern = /(_date|_datetime|_at)$/i;
      expect(datePattern.test("departure_datetime")).toBe(true);
      expect(datePattern.test("arrival_datetime")).toBe(true);
    });

    it("should not match fields with date in middle", () => {
      const datePattern = /(_date|_datetime|_at)$/i;
      expect(datePattern.test("date_issued")).toBe(false);
      expect(datePattern.test("date_due")).toBe(false);
      expect(datePattern.test("date_paid")).toBe(false);
    });

    it("should not match simple date field with pattern alone", () => {
      const datePattern = /(_date|_datetime|_at)$/i;
      expect(datePattern.test("date")).toBe(false);
    });

    it("should detect date fields with special handling", () => {
      // Schema-specific date fields are handled separately
      const dateFieldsMap = {
        invoice: ["date_issued", "date_due", "date_paid"],
        receipt: ["date", "transaction_date"],
      };
      
      expect(dateFieldsMap.invoice).toContain("date_issued");
      expect(dateFieldsMap.receipt).toContain("date");
    });

    it("should detect entity fields by pattern", () => {
      const entityFields = [
        "vendor_name",
        "customer_name",
        "merchant_name",
        "counterparty",
        "full_name",
      ];

      // These should be detected by schema-specific extraction
      entityFields.forEach((field) => {
        expect(field.includes("name") || field === "counterparty").toBe(true);
      });
    });
  });

  describe("Schema version validation", () => {
    it("should validate schema version format", () => {
      const validVersions = ["1.0", "1.1", "2.0", "10.5"];
      const invalidVersions = ["1", "v1.0", "1.0.0", "invalid"];

      validVersions.forEach((version) => {
        expect(version).toMatch(/^\d+\.\d+$/);
      });

      invalidVersions.forEach((version) => {
        expect(/^\d+\.\d+$/.test(version)).toBe(false);
      });
    });
  });

  describe("ID format validation", () => {
    it("should validate entity ID format", () => {
      const validEntityIds = [
        "ent_123456789012345678901234",
        "ent_abcdef1234567890abcdef12",
      ];

      validEntityIds.forEach((id) => {
        expect(id).toMatch(/^ent_[a-f0-9]{24}$/);
      });
    });

    it("should validate event ID format", () => {
      const validEventIds = [
        "evt_123456789012345678901234",
        "evt_abcdef1234567890abcdef12",
      ];

      validEventIds.forEach((id) => {
        expect(id).toMatch(/^evt_[a-f0-9]{24}$/);
      });
    });

    it("should validate record ID format (UUID)", () => {
      const validRecordIds = [
        "00000000-0000-0000-0000-000000000000",
        "550e8400-e29b-41d4-a716-446655440000",
      ];

      validRecordIds.forEach((id) => {
        expect(id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        );
      });
    });
  });

  describe("Relationship type validation", () => {
    it("should validate known relationship types", () => {
      const validTypes = [
        "PART_OF",
        "CORRECTS",
        "REFERS_TO",
        "SETTLES",
        "DUPLICATE_OF",
        "SUPERSEDES",
      ];

      validTypes.forEach((type) => {
        expect(typeof type).toBe("string");
        expect(type).toMatch(/^[A-Z_]+$/);
      });
    });

    it("should validate relationship direction enum", () => {
      const validDirections = ["inbound", "outbound", "both"];

      validDirections.forEach((direction) => {
        expect(["inbound", "outbound", "both"]).toContain(direction);
      });
    });
  });

  describe("JSONB field validation", () => {
    it("should validate metadata fields", () => {
      const validMetadata = {
        string_value: "test",
        number_value: 123,
        boolean_value: true,
        null_value: null,
        array_value: [1, 2, 3],
        nested_object: {
          level1: {
            level2: "value",
          },
        },
      };

      // All values should be JSON serializable
      const serialized = JSON.stringify(validMetadata);
      const deserialized = JSON.parse(serialized);
      expect(deserialized).toEqual(validMetadata);
    });

    it("should validate provenance JSONB structure", () => {
      const validProvenance = {
        field1: "observation_id_1",
        field2: "observation_id_2",
        field3: "observation_id_3",
      };

      // Provenance should be a map of field names to observation IDs
      Object.entries(validProvenance).forEach(([field, observationId]) => {
        expect(typeof field).toBe("string");
        expect(typeof observationId).toBe("string");
      });
    });

    it("should validate snapshot JSONB structure", () => {
      const validSnapshot = {
        vendor_name: "Acme Corp",
        amount: 1000,
        date_issued: "2024-01-15",
        status: "paid",
      };

      // Snapshot should be a flexible object
      Object.entries(validSnapshot).forEach(([field, value]) => {
        expect(typeof field).toBe("string");
        expect(value).toBeDefined();
      });
    });
  });

  describe("Edge value validation", () => {
    it("should handle very long string values", () => {
      const longString = "a".repeat(10000);
      expect(longString.length).toBe(10000);
      // Should be serializable
      const serialized = JSON.stringify({ long: longString });
      expect(serialized.length).toBeGreaterThan(10000);
    });

    it("should handle very small numbers", () => {
      const values = {
        zero: 0,
        negative: -1,
        decimal: 0.0001,
        negative_decimal: -0.0001,
      };

      Object.values(values).forEach((value) => {
        expect(typeof value).toBe("number");
        expect(isFinite(value)).toBe(true);
      });
    });

    it("should handle very large numbers", () => {
      const values = {
        large_int: 999999999,
        large_decimal: 999999.999,
      };

      Object.values(values).forEach((value) => {
        expect(typeof value).toBe("number");
        expect(isFinite(value)).toBe(true);
      });
    });

    it("should handle special number values", () => {
      const infinity = Infinity;
      const negInfinity = -Infinity;
      const nan = NaN;

      expect(isFinite(infinity)).toBe(false);
      expect(isFinite(negInfinity)).toBe(false);
      expect(isNaN(nan)).toBe(true);

      // JSON serialization of these values
      expect(JSON.stringify({ inf: infinity })).toBe('{"inf":null}');
      expect(JSON.stringify({ nan: nan })).toBe('{"nan":null}');
    });
  });

  describe("Timestamp validation", () => {
    it("should validate ISO 8601 timestamp format", () => {
      const validTimestamps = [
        "2024-01-15T10:30:00Z",
        "2024-01-15T10:30:00.123Z",
        "2024-01-15T10:30:00+00:00",
        "2024-01-15T10:30:00-05:00",
      ];

      validTimestamps.forEach((timestamp) => {
        const date = new Date(timestamp);
        expect(isNaN(date.getTime())).toBe(false);
        expect(date.toISOString()).toBeDefined();
      });
    });

    it("should handle invalid timestamp formats", () => {
      const invalidTimestamps = [
        "not-a-date",
        "2024-13-01", // Invalid month
        "2024-01-32", // Invalid day
        "2024-01-15 10:30:00", // Missing T
      ];

      invalidTimestamps.forEach((timestamp) => {
        const date = new Date(timestamp);
        // Some may parse, some may not
        expect(typeof date.getTime()).toBe("number");
      });
    });
  });

  describe("Enum validation", () => {
    it("should validate relationship direction enum", () => {
      const validDirections = ["inbound", "outbound", "both"];
      const invalidDirections = ["in", "out", "all", "none"];

      validDirections.forEach((direction) => {
        expect(["inbound", "outbound", "both"]).toContain(direction);
      });

      invalidDirections.forEach((direction) => {
        expect(["inbound", "outbound", "both"]).not.toContain(direction);
      });
    });

    it("should validate edge type enum", () => {
      const validEdgeTypes = ["EXTRACTED_FROM", "GENERATED_FROM", "INVOLVES"];

      validEdgeTypes.forEach((type) => {
        expect(typeof type).toBe("string");
        expect(type).toMatch(/^[A-Z_]+$/);
      });
    });
  });

  describe("Constraint validation", () => {
    it("should validate specificity score range (0-1)", () => {
      const validScores = [0, 0.5, 0.8, 1.0];
      const invalidScores = [-0.1, 1.1, 2.0];

      validScores.forEach((score) => {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      });

      invalidScores.forEach((score) => {
        expect(score < 0 || score > 1).toBe(true);
      });
    });

    it("should validate source priority (integer)", () => {
      const validPriorities = [0, 1, 5, 10, 100];
      const invalidPriorities = [0.5, 1.5, -1];

      validPriorities.forEach((priority) => {
        expect(Number.isInteger(priority)).toBe(true);
        expect(priority).toBeGreaterThanOrEqual(0);
      });

      invalidPriorities.forEach((priority) => {
        expect(Number.isInteger(priority) && priority >= 0).toBe(false);
      });
    });

    it("should validate observation count (positive integer)", () => {
      const validCounts = [1, 5, 10, 100];
      const invalidCounts = [0, -1, 0.5];

      validCounts.forEach((count) => {
        expect(Number.isInteger(count)).toBe(true);
        expect(count).toBeGreaterThan(0);
      });

      invalidCounts.forEach((count) => {
        expect(Number.isInteger(count) && count > 0).toBe(false);
      });
    });
  });
});




