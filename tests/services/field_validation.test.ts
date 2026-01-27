import { describe, it, expect } from "vitest";
import {
  validateFieldWithConverters,
  validateFieldsWithConverters,
} from "../../src/services/field_validation.js";
import type { FieldDefinition } from "../../src/services/schema_registry.js";

describe("field_validation", () => {
  describe("validateFieldWithConverters", () => {
    it("validates string field matching type directly", () => {
      const fieldDef: FieldDefinition = {
        type: "string",
        required: false,
      };
      
      const result = validateFieldWithConverters("name", "John Doe", fieldDef);
      
      expect(result.value).toBe("John Doe");
      expect(result.shouldRouteToRawFragments).toBe(false);
      expect(result.wasConverted).toBe(false);
    });

    it("validates number field matching type directly", () => {
      const fieldDef: FieldDefinition = {
        type: "number",
        required: false,
      };
      
      const result = validateFieldWithConverters("age", 42, fieldDef);
      
      expect(result.value).toBe(42);
      expect(result.shouldRouteToRawFragments).toBe(false);
      expect(result.wasConverted).toBe(false);
    });

    it("validates date field with string value", () => {
      const fieldDef: FieldDefinition = {
        type: "date",
        required: false,
      };
      
      const result = validateFieldWithConverters("created_at", "2025-01-15T00:00:00.000Z", fieldDef);
      
      expect(result.value).toBe("2025-01-15T00:00:00.000Z");
      expect(result.shouldRouteToRawFragments).toBe(false);
      expect(result.wasConverted).toBe(false);
    });

    it("routes to raw_fragments when type doesn't match and no converters", () => {
      const fieldDef: FieldDefinition = {
        type: "date",
        required: false,
      };
      
      const result = validateFieldWithConverters("created_at", 1736899200000000000, fieldDef);
      
      expect(result.value).toBe(1736899200000000000);
      expect(result.shouldRouteToRawFragments).toBe(true);
      expect(result.wasConverted).toBe(false);
    });

    it("applies converter when type doesn't match but converter succeeds", () => {
      const fieldDef: FieldDefinition = {
        type: "date",
        required: false,
        converters: [
          {
            from: "number",
            to: "date",
            function: "timestamp_nanos_to_iso",
            deterministic: true,
          },
        ],
      };
      
      const result = validateFieldWithConverters("created_at", 1736899200000000000, fieldDef);
      
      expect(result.value).toBe("2025-01-15T00:00:00.000Z");
      expect(result.shouldRouteToRawFragments).toBe(false);
      expect(result.wasConverted).toBe(true);
      expect(result.originalValue).toBe(1736899200000000000);
    });

    it("tries multiple converters in order until one succeeds", () => {
      const fieldDef: FieldDefinition = {
        type: "date",
        required: false,
        converters: [
          {
            from: "string",
            to: "date",
            function: "timestamp_ms_to_iso",
            deterministic: true,
          },
          {
            from: "number",
            to: "date",
            function: "timestamp_nanos_to_iso",
            deterministic: true,
          },
        ],
      };
      
      const result = validateFieldWithConverters("created_at", 1736899200000000000, fieldDef);
      
      expect(result.value).toBe("2025-01-15T00:00:00.000Z");
      expect(result.shouldRouteToRawFragments).toBe(false);
      expect(result.wasConverted).toBe(true);
    });

    it("routes to raw_fragments when converter fails", () => {
      const fieldDef: FieldDefinition = {
        type: "date",
        required: false,
        converters: [
          {
            from: "number",
            to: "date",
            function: "timestamp_nanos_to_iso",
            deterministic: true,
          },
        ],
      };
      
      // Invalid timestamp (far out of range - year 2200+)
      const result = validateFieldWithConverters("created_at", 9999999999999999999, fieldDef);
      
      expect(result.value).toBe(9999999999999999999);
      expect(result.shouldRouteToRawFragments).toBe(true);
      expect(result.wasConverted).toBe(false);
    });

    it("routes to raw_fragments when converter function doesn't exist", () => {
      const fieldDef: FieldDefinition = {
        type: "date",
        required: false,
        converters: [
          {
            from: "number",
            to: "date",
            function: "nonexistent_converter",
            deterministic: true,
          },
        ],
      };
      
      const result = validateFieldWithConverters("created_at", 1736899200000000000, fieldDef);
      
      expect(result.value).toBe(1736899200000000000);
      expect(result.shouldRouteToRawFragments).toBe(true);
      expect(result.wasConverted).toBe(false);
    });

    it("validates array fields", () => {
      const fieldDef: FieldDefinition = {
        type: "array",
        required: false,
      };
      
      const result = validateFieldWithConverters("tags", ["tag1", "tag2"], fieldDef);
      
      expect(result.value).toEqual(["tag1", "tag2"]);
      expect(result.shouldRouteToRawFragments).toBe(false);
      expect(result.wasConverted).toBe(false);
    });

    it("validates object fields", () => {
      const fieldDef: FieldDefinition = {
        type: "object",
        required: false,
      };
      
      const result = validateFieldWithConverters("metadata", { key: "value" }, fieldDef);
      
      expect(result.value).toEqual({ key: "value" });
      expect(result.shouldRouteToRawFragments).toBe(false);
      expect(result.wasConverted).toBe(false);
    });
  });

  describe("validateFieldsWithConverters", () => {
    it("validates multiple fields at once", () => {
      const fields: Record<string, FieldDefinition> = {
        title: { type: "string", required: true },
        status: { type: "string", required: true },
        priority: { type: "number", required: false },
      };

      const data = {
        title: "Task 1",
        status: "active",
        priority: 1,
      };

      const result = validateFieldsWithConverters(data, fields);

      expect(result.validFields).toEqual({
        title: "Task 1",
        status: "active",
        priority: 1,
      });
      expect(result.unknownFields).toEqual({});
      expect(result.originalValues).toEqual({});
    });

    it("routes unknown fields to unknownFields", () => {
      const fields: Record<string, FieldDefinition> = {
        title: { type: "string", required: true },
      };

      const data = {
        title: "Task 1",
        unknown_field: "unknown value",
      };

      const result = validateFieldsWithConverters(data, fields);

      expect(result.validFields).toEqual({ title: "Task 1" });
      expect(result.unknownFields).toEqual({ unknown_field: "unknown value" });
      expect(result.originalValues).toEqual({});
    });

    it("applies converters and tracks original values", () => {
      const fields: Record<string, FieldDefinition> = {
        created_at: {
          type: "date",
          required: false,
          converters: [
            {
              from: "number",
              to: "date",
              function: "timestamp_nanos_to_iso",
              deterministic: true,
            },
          ],
        },
      };

      const data = {
        created_at: 1736899200000000000,
      };

      const result = validateFieldsWithConverters(data, fields);

      expect(result.validFields).toEqual({
        created_at: "2025-01-15T00:00:00.000Z",
      });
      expect(result.unknownFields).toEqual({});
      expect(result.originalValues).toEqual({
        created_at: 1736899200000000000,
      });
    });

    it("handles mixed valid, unknown, and converted fields", () => {
      const fields: Record<string, FieldDefinition> = {
        title: { type: "string", required: true },
        created_at: {
          type: "date",
          required: false,
          converters: [
            {
              from: "number",
              to: "date",
              function: "timestamp_nanos_to_iso",
              deterministic: true,
            },
          ],
        },
      };

      const data = {
        title: "Task 1",
        created_at: 1736899200000000000,
        unknown_field: "unknown value",
      };

      const result = validateFieldsWithConverters(data, fields);

      expect(result.validFields).toEqual({
        title: "Task 1",
        created_at: "2025-01-15T00:00:00.000Z",
      });
      expect(result.unknownFields).toEqual({
        unknown_field: "unknown value",
      });
      expect(result.originalValues).toEqual({
        created_at: 1736899200000000000,
      });
    });

    it("routes fields with failed conversion to unknownFields", () => {
      const fields: Record<string, FieldDefinition> = {
        created_at: {
          type: "date",
          required: false,
          converters: [
            {
              from: "number",
              to: "date",
              function: "timestamp_nanos_to_iso",
              deterministic: true,
            },
          ],
        },
      };

      const data = {
        created_at: 9999999999999999999, // Invalid timestamp (far out of range)
      };

      const result = validateFieldsWithConverters(data, fields);

      expect(result.validFields).toEqual({});
      expect(result.unknownFields).toEqual({ created_at: 9999999999999999999 });
      expect(result.originalValues).toEqual({});
    });
  });
});
