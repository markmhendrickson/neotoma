import { describe, expect, it } from "vitest";
import { StoreRequestSchema } from "../../src/shared/action_schemas.js";
import { assertConditionalStoreRequest } from "../../src/services/store_condition_request.js";
import { deriveConditionalStoreIdentity } from "../../src/services/store_condition_identity.js";
import { validateFieldsWithConverters } from "../../src/services/field_validation.js";
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
  it("refuses automatic references rather than silently dropping their effects", () => {
    const fields = { code: "SYNTHETIC", region: "ONE" };
    for (const references of [
      null,
      {},
      true,
      "invalid",
      [{ field: "code", target_entity_type: "synthetic" }],
    ])
      expect(() =>
        deriveConditionalStoreIdentity(
          {
            ...schema,
            schema_definition: { ...schema.schema_definition, reference_fields: references },
          } as unknown as SchemaRegistryEntry,
          fields,
          "OWNER"
        )
      ).toThrow("requires no automatic references");
    expect(
      deriveConditionalStoreIdentity(
        {
          ...schema,
          schema_definition: { ...schema.schema_definition, reference_fields: [] },
        },
        fields,
        "OWNER"
      ).entityId
    ).toBe(deriveConditionalStoreIdentity(schema, fields, "OWNER").entityId);
    const legacy = {
      ...schema.schema_definition,
      reference_fields: [{ field: "code", target_entity_type: "synthetic" }],
    };
    expect(
      deriveCanonicalNameFromFieldsWithTrace(schema.entity_type, fields, legacy).canonicalName
    ).toBe(
      deriveCanonicalNameFromFieldsWithTrace(schema.entity_type, fields, schema.schema_definition)
        .canonicalName
    );
  });
  it("refuses hidden/malformed derived work while absent/empty declarations remain valid", () => {
    for (const derived of [null, {}, true, "invalid", [{ entity_type: "synthetic_child" }]])
      expect(() =>
        deriveConditionalStoreIdentity(
          {
            ...schema,
            schema_definition: { ...schema.schema_definition, derived_entities: derived },
          } as unknown as SchemaRegistryEntry,
          { code: "SYNTHETIC", region: "ONE" },
          "OWNER"
        )
      ).toThrow("requires no derived entities");
    const fields = { code: "SYNTHETIC", region: "ONE" };
    expect(
      deriveConditionalStoreIdentity(
        { ...schema, schema_definition: { ...schema.schema_definition, derived_entities: [] } },
        fields,
        "OWNER"
      ).entityId
    ).toBe(deriveConditionalStoreIdentity(schema, fields, "OWNER").entityId);
    const legacy = {
      ...schema.schema_definition,
      derived_entities: [{ entity_type: "synthetic_child", field_mappings: {} }],
    };
    expect(
      deriveCanonicalNameFromFieldsWithTrace(schema.entity_type, fields, legacy).canonicalName
    ).toBe(
      deriveCanonicalNameFromFieldsWithTrace(schema.entity_type, fields, schema.schema_definition)
        .canonicalName
    );
  });
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

describe("conditional explicit declared nulls", () => {
  const nullable = {
    ...schema,
    schema_definition: {
      fields: {
        code: { type: "string" as const },
        text: { type: "string" as const, required: true },
        amount: { type: "number" as const },
        enabled: { type: "boolean" as const },
        at: { type: "date" as const },
        items: { type: "array" as const },
        detail: { type: "object" as const },
        converted: {
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
  it.each(["text", "amount", "enabled", "at", "items", "detail", "converted"])(
    "retains declared nonidentity %s null without converting or fragmenting it",
    (field) => {
      const actual = deriveConditionalStoreIdentity(
        nullable,
        { code: "ONE", [field]: null },
        "OWNER"
      );
      expect(actual.validFields).toEqual({ code: "ONE", [field]: null });
      expect(actual.unknownFields).toEqual({});
      expect(actual.originalValues).toEqual({});
    }
  );
  it("keeps absent fields absent and undeclared null advisory; preserves nonnull conversion", () => {
    const actual = deriveConditionalStoreIdentity(
      nullable,
      { code: "ONE", converted: 42, undeclared: null },
      "OWNER"
    );
    expect(actual.validFields).toEqual({ code: "ONE", converted: "42" });
    expect(actual.unknownFields).toEqual({ undeclared: null });
    expect(actual.originalValues).toEqual({ converted: 42 });
    expect(Object.hasOwn(actual.validFields, "text")).toBe(false);
    expect(() =>
      deriveConditionalStoreIdentity(nullable, { code: null, text: null }, "OWNER")
    ).toThrow("incomplete or invalid");
  });
  it("leaves ordinary converter null routing unchanged for every declared type", () => {
    const fields = {
      text: null,
      amount: null,
      enabled: null,
      at: null,
      items: null,
      detail: null,
      converted: null,
    };
    const ordinary = validateFieldsWithConverters(fields, nullable.schema_definition.fields);
    expect(ordinary.validFields).toEqual({});
    expect(ordinary.unknownFields).toEqual(fields);
    expect(ordinary.originalValues).toEqual({});
  });
  it("retains every own declared JSON field without invoking object setters", () => {
    const fields = JSON.parse('{"code":{"type":"string"},"__proto__":{"type":"string"}}');
    const actual = deriveConditionalStoreIdentity(
      { ...nullable, schema_definition: { fields, canonical_name_fields: ["code"] } },
      JSON.parse('{"code":"ONE","__proto__":null}'),
      "OWNER"
    );
    expect(actual.validFields).toEqual(JSON.parse('{"code":"ONE","__proto__":null}'));
    expect(Object.hasOwn(actual.validFields, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(actual.validFields)).toBe(Object.prototype);
    expect(actual.unknownFields).toEqual({});
  });
});

describe("conditional parsed original admission", () => {
  it("restores only explicit own nulls for conditional requests and leaves ordinary parsing unchanged", () => {
    const raw = JSON.parse(
      '{"entities":[{"entity_type":"synthetic","code":"ONE","__proto__":null}],"idempotency_key":"KEY"}'
    );
    const ordinary = StoreRequestSchema.parse(raw);
    assertConditionalStoreRequest(ordinary, raw.entities);
    expect(Object.hasOwn(ordinary.entities![0], "__proto__")).toBe(false);
    raw.expected_entity_absent = true;
    const conditional = StoreRequestSchema.parse(raw);
    assertConditionalStoreRequest(conditional, raw.entities);
    expect(conditional.entities![0]).toEqual(raw.entities[0]);
    expect(Object.getPrototypeOf(conditional.entities![0])).toBe(Object.prototype);
    expect(Object.prototype).not.toHaveProperty("code");
    const nonnull = JSON.parse(JSON.stringify(raw));
    Object.defineProperty(nonnull.entities[0], "__proto__", {
      value: "unselected",
      enumerable: true,
    });
    const parsed = StoreRequestSchema.parse(nonnull);
    assertConditionalStoreRequest(parsed, nonnull.entities);
    expect(Object.hasOwn(parsed.entities![0], "__proto__")).toBe(false);
  });
  it("retains malformed JSON, override and undeclared-field validation boundaries", () => {
    expect(
      StoreRequestSchema.safeParse({ entities: [{}], expected_entity_absent: "true" }).success
    ).toBe(false);
    const base = {
      entities: [{ entity_type: "synthetic", code: "ONE" }],
      expected_entity_absent: true,
      idempotency_key: "KEY",
    };
    const parsed = StoreRequestSchema.parse(base);
    const accessor = { entity_type: "synthetic", code: "ONE" };
    Object.defineProperty(accessor, "private", {
      get() {
        throw new Error("must not read");
      },
      enumerable: true,
    });
    expect(() => assertConditionalStoreRequest(parsed, [accessor])).toThrow("finite plain JSON");
    const forbidden = {
      ...base,
      entities: [{ entity_type: "synthetic", code: "ONE", target_id: null }],
    };
    expect(() =>
      assertConditionalStoreRequest(StoreRequestSchema.parse(forbidden), forbidden.entities)
    ).toThrow("without target");
    const fields = { code: "ONE", region: "TWO", undeclared: null };
    const result = deriveConditionalStoreIdentity(schema, fields, "OWNER");
    expect(Object.hasOwn(result.validFields, "undeclared")).toBe(false);
    expect(result.unknownFields).toHaveProperty("undeclared", null);
  });
});
