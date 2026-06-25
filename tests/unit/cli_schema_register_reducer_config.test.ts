/**
 * Unit tests for #1820 — `neotoma schemas register` silently drops per-field
 * `reducer_config` so every field defaults to `last_write`.
 *
 * The fix extracts `reducer_config` from each field definition across all three
 * `--fields` input forms and promotes it to the top-level
 * `reducer_config.merge_policies` map that the server expects.
 */

import { describe, expect, it } from "vitest";
import { parseSchemaFields } from "../../src/cli/parse_schema_fields.js";

describe("#1820 parseSchemaFields: per-field reducer_config → top-level merge_policies", () => {
  // ---------------------------------------------------------------------------
  // Form 1: object map { fieldName: { type, required?, reducer_config?, ... } }
  // ---------------------------------------------------------------------------

  describe("object-map form (--fields '{\"x\":{\"type\":\"number\",\"reducer_config\":{...}}}')", () => {
    it("extracts strategy into mergePolicies for a single field", () => {
      const input = {
        x: { type: "number", required: false, reducer_config: { strategy: "highest_priority" } },
      };
      const { schemaFields, mergePolicies } = parseSchemaFields(input);

      expect(mergePolicies).toEqual({ x: { strategy: "highest_priority" } });
      // reducer_config must NOT appear inside the field definition
      expect(schemaFields["x"]).not.toHaveProperty("reducer_config");
      expect(schemaFields["x"]).toEqual({ type: "number", required: false });
    });

    it("extracts strategy + tie_breaker when both are provided", () => {
      const input = {
        score: {
          type: "number",
          reducer_config: { strategy: "highest_priority", tie_breaker: "observed_at" },
        },
      };
      const { mergePolicies } = parseSchemaFields(input);

      expect(mergePolicies["score"]).toEqual({
        strategy: "highest_priority",
        tie_breaker: "observed_at",
      });
    });

    it("omits a field from mergePolicies when it has no reducer_config", () => {
      const input = {
        name: { type: "string" },
        score: { type: "number", reducer_config: { strategy: "most_specific" } },
      };
      const { mergePolicies, schemaFields } = parseSchemaFields(input);

      expect(Object.keys(mergePolicies)).toEqual(["score"]);
      expect(schemaFields["name"]).toEqual({ type: "string", required: false });
    });

    it("produces empty mergePolicies when no fields carry reducer_config", () => {
      const input = { a: { type: "string" }, b: { type: "boolean", required: true } };
      const { mergePolicies } = parseSchemaFields(input);

      expect(mergePolicies).toEqual({});
    });

    it("handles multiple fields each with their own reducer_config strategy", () => {
      const input = {
        priority: {
          type: "number",
          reducer_config: { strategy: "highest_priority" },
        },
        tags: {
          type: "string",
          reducer_config: { strategy: "merge_array" },
        },
        label: { type: "string" },
      };
      const { mergePolicies, schemaFields } = parseSchemaFields(input);

      expect(mergePolicies["priority"].strategy).toBe("highest_priority");
      expect(mergePolicies["tags"].strategy).toBe("merge_array");
      expect(mergePolicies).not.toHaveProperty("label");
      expect(schemaFields["priority"]).not.toHaveProperty("reducer_config");
      expect(schemaFields["tags"]).not.toHaveProperty("reducer_config");
    });
  });

  // ---------------------------------------------------------------------------
  // Form 2: pre-built schema object { fields: { ... }, reducer_config?: { merge_policies } }
  // ---------------------------------------------------------------------------

  describe("pre-built schema object form ({ fields: { ... } })", () => {
    it("extracts per-field reducer_config from fields sub-object", () => {
      const input = {
        fields: {
          score: {
            type: "number",
            required: false,
            reducer_config: { strategy: "highest_priority" },
          },
        },
      };
      const { schemaFields, mergePolicies } = parseSchemaFields(input);

      expect(mergePolicies).toEqual({ score: { strategy: "highest_priority" } });
      expect(schemaFields["score"]).not.toHaveProperty("reducer_config");
    });

    it("merges top-level reducer_config.merge_policies with per-field entries", () => {
      const input = {
        fields: {
          x: { type: "number", reducer_config: { strategy: "most_specific" } },
          y: { type: "string" },
        },
        reducer_config: {
          merge_policies: { y: { strategy: "last_write" } },
        },
      };
      const { mergePolicies } = parseSchemaFields(input);

      expect(mergePolicies["x"].strategy).toBe("most_specific");
      expect(mergePolicies["y"].strategy).toBe("last_write");
    });
  });

  // ---------------------------------------------------------------------------
  // Form 3: array of { field_name, field_type, required?, reducer_config? }
  // ---------------------------------------------------------------------------

  describe("array form ([{ field_name, field_type, reducer_config? }])", () => {
    it("extracts reducer_config from array-element field definitions", () => {
      const input = [
        {
          field_name: "score",
          field_type: "number",
          required: false,
          reducer_config: { strategy: "highest_priority" },
        },
      ];
      const { schemaFields, mergePolicies } = parseSchemaFields(input);

      expect(mergePolicies).toEqual({ score: { strategy: "highest_priority" } });
      expect(schemaFields["score"]).not.toHaveProperty("reducer_config");
      expect(schemaFields["score"]).toEqual({ type: "number", required: false });
    });

    it("handles mixed array where only some entries have reducer_config", () => {
      const input = [
        { field_name: "name", field_type: "string", required: false },
        {
          field_name: "priority",
          field_type: "number",
          required: false,
          reducer_config: { strategy: "highest_priority", tie_breaker: "source_priority" },
        },
      ];
      const { mergePolicies } = parseSchemaFields(input);

      expect(Object.keys(mergePolicies)).toEqual(["priority"]);
      expect(mergePolicies["priority"]).toEqual({
        strategy: "highest_priority",
        tie_breaker: "source_priority",
      });
    });
  });
});
