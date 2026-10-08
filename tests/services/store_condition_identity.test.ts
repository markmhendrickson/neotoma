import { describe, expect, it } from "vitest";
import { deriveConditionalStoreIdentity } from "../../src/services/store_condition_identity.js";
import type { SchemaRegistryEntry } from "../../src/services/schema_registry.js";
import {
  deriveCanonicalNameFromFieldsWithTrace,
  entityIdTenantSalt,
  generateEntityId,
} from "../../src/services/entity_resolution.js";
const schema = {
  id: "SYNTHETIC",
  entity_type: "synthetic",
  schema_version: "1.0",
  active: true,
  schema_definition: {
    fields: { code: { type: "string" }, region: { type: "string" } },
    canonical_name_fields: ["code", "region"],
  },
  reducer_config: { merge_policies: {} },
} as SchemaRegistryEntry;
describe("conditional declared identity", () => {
  it("reuses the native declared composite and owner salt while preserving unknown diagnostics", () => {
    const fields = { code: "SYNTHETIC", region: "ONE", unknown: "advisory" };
    const actual = deriveConditionalStoreIdentity(schema, fields, "OWNER");
    const native = deriveCanonicalNameFromFieldsWithTrace(
      schema.entity_type,
      fields,
      schema.schema_definition
    );
    expect(actual.entityId).toBe(
      generateEntityId(schema.entity_type, native.canonicalName, entityIdTenantSalt("OWNER"))
    );
    expect(actual.unknownFields).toEqual({ unknown: "advisory" });
    expect(actual.validFields).toEqual({ code: "SYNTHETIC", region: "ONE" });
  });
  it("refuses absent/null/mistyped/incomplete identity rather than taking a name heuristic", () => {
    for (const fields of [
      { name: "heuristic" },
      { code: null, region: "ONE" },
      { code: 14, region: "ONE" },
      { code: "SYNTHETIC", region: "" },
    ])
      expect(() => deriveConditionalStoreIdentity(schema, fields, "OWNER")).toThrow(
        "incomplete or invalid"
      );
  });
  it("refuses opt-out and identity rules that reference undeclared fields", () => {
    expect(() =>
      deriveConditionalStoreIdentity(
        {
          ...schema,
          schema_definition: {
            fields: { name: { type: "string" } },
            identity_opt_out: "heuristic_canonical_name",
          },
        },
        { name: "SYNTHETIC" },
        "OWNER"
      )
    ).toThrow("complete declared identity");
    expect(() =>
      deriveConditionalStoreIdentity(
        {
          ...schema,
          schema_definition: { ...schema.schema_definition, canonical_name_fields: ["missing"] },
        },
        { missing: "SYNTHETIC" },
        "OWNER"
      )
    ).toThrow("declared identity is invalid");
  });
  it("uses declared converters before identity rather than converting unknown input by String", () => {
    const converted = {
      ...schema,
      schema_definition: {
        fields: {
          code: {
            type: "string" as const,
            converters: [
              {
                from: "number" as const,
                to: "string" as const,
                function: "number_to_string",
                deterministic: true,
              },
            ],
          },
        },
        canonical_name_fields: ["code"],
      },
    };
    const result = deriveConditionalStoreIdentity(converted, { code: 42 }, "OWNER");
    expect(result.validFields).toEqual({ code: "42" });
    expect(result.unknownFields).toEqual({});
  });
});
