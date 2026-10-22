import { describe, expect, it } from "vitest";
import {
  canonicalExactIdentityContract,
  createAcceptedIdentityBinding,
  deriveExactEntityIdentity,
  EntityIdentityContractError,
  prepareExactEntityIdentityRecord,
  validateExactEntityIdentityRecord,
} from "../../src/services/entity_identity_contract.js";
import { generateEntityId } from "../../src/services/entity_resolution.js";

const fields = { code: { type: "string" as const }, extra: { type: "string" as const } };
const contract = canonicalExactIdentityContract(
  {
    version: "2",
    mode: "exact_utf8",
    namespace: "synthetic:exact:v2",
    canonical_name_fields: ["code"],
  },
  fields
);
const binding = createAcceptedIdentityBinding({
  anchorSchemaId: "synthetic-schema-anchor",
  entityType: "synthetic_exact_item",
  scope: "global",
  userId: null,
  tenantScopedEntityIds: true,
  contract,
});
const id = (code: string, owner = "synthetic-owner") =>
  deriveExactEntityIdentity(binding, { code }, owner).entityId;

describe("admitted exact identity bytes", () => {
  it("preserves case, whitespace, punctuation and Unicode normalization while legacy IDs still fold", () => {
    const codes = ["SR-cli", "sr-cli", " sr-cli", "sr-cli ", "sr_cli", "sr.cli", "é", "e\u0301"];
    expect(new Set(codes.map((code) => id(code))).size).toBe(codes.length);
    expect(id("SR-cli")).toBe(id("SR-cli"));
    // Independent fixed framing vectors, including a multibyte component.
    expect(id("SR-cli")).toBe("ent_94085175329aff89a5bb9e53");
    expect(id("é")).toBe("ent_16609d6359b9f342c49075c9");
    expect(id("SR-cli", "another-owner")).not.toBe(id("SR-cli"));
    expect(generateEntityId("note", "SR-cli")).toBe(generateEntityId("note", "sr-cli"));
    expect(generateEntityId("note", "SR-cli")).toBe("ent_6d3cdb774dbd43b20b542abb");
  });

  it("preserves the flat-array composite grammar and frames separator-bearing components independently", () => {
    const composite = createAcceptedIdentityBinding({
      anchorSchemaId: "composite-anchor",
      entityType: "synthetic_composite_item",
      scope: "global",
      userId: null,
      tenantScopedEntityIds: false,
      contract: {
        ...contract,
        namespace: "synthetic:composite:v2",
        canonical_name_fields: ["code", "extra"],
      },
    });
    expect(() => deriveExactEntityIdentity(composite, { code: "present" }, "owner")).toThrow(
      /complete declared/
    );
    const first = deriveExactEntityIdentity(composite, { code: "a|b", extra: "c" }, "owner");
    const second = deriveExactEntityIdentity(composite, { code: "a", extra: "b|c" }, "owner");
    expect(first.entityId).not.toBe(second.entityId);
    expect(first.components).toEqual([
      ["code", "a|b"],
      ["extra", "c"],
    ]);
    expect(first.entityId).toBe(
      deriveExactEntityIdentity(composite, { code: "a|b", extra: "c" }, "another-owner").entityId
    );
  });

  it("uses ordered mixed rules without display fallback or implicit coercion", () => {
    const ordered = createAcceptedIdentityBinding({
      anchorSchemaId: binding.anchor_schema_id,
      entityType: binding.entity_type,
      scope: binding.scope,
      userId: binding.user_id,
      tenantScopedEntityIds: binding.tenant_scoped_entity_ids,
      contract: { ...contract, canonical_name_fields: [{ composite: ["code", "extra"] }, "code"] },
    });
    expect(deriveExactEntityIdentity(ordered, { code: "x" }, "synthetic-owner").ruleIndex).toBe(1);
    for (const value of [undefined, null, "", 1, false, ["x"], { code: "x" }, "\ud800", "\udc00"]) {
      expect(() =>
        deriveExactEntityIdentity(binding, { code: value, name: "display" }, "synthetic-owner")
      ).toThrow(EntityIdentityContractError);
    }
    expect(() =>
      deriveExactEntityIdentity(binding, { name: "display" }, "synthetic-owner")
    ).toThrow(/complete declared/);
  });

  it("refuses caller-mutated accepted bytes rather than treating helper arguments as authority", () => {
    for (const changed of [
      { ...binding, tenant_scoped_entity_ids: false },
      { ...binding, entity_type: "synthetic_other_type" },
      { ...binding, contract_id: "0".repeat(64) },
      { ...binding, contract: { ...contract, namespace: "synthetic:rebound:v2" } },
    ])
      expect(() =>
        deriveExactEntityIdentity(changed, { code: "SR-cli" }, "synthetic-owner")
      ).toThrow(EntityIdentityContractError);
  });

  it("retains immutable ordered original components and validates them against the admitted entity", () => {
    const fields = { code: " SR-cli\u00a0" };
    const record = prepareExactEntityIdentityRecord(binding, fields, "synthetic-owner");
    const entityId = deriveExactEntityIdentity(binding, fields, "synthetic-owner").entityId;
    expect(record.components).toEqual([["code", " SR-cli\u00a0"]]);
    expect(record.namespace).toBe(binding.contract.namespace);
    expect(record.contract_id).toBe(binding.contract_id);
    expect(record.anchor_schema_id).toBe(binding.anchor_schema_id);
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.components[0])).toBe(true);
    expect(
      validateExactEntityIdentityRecord(
        binding,
        JSON.stringify(record),
        entityId,
        "synthetic-owner"
      )
    ).toEqual(record);
    for (const changed of [
      { ...record, owner_id: "synthetic-other-owner" },
      { ...record, namespace: "synthetic:changed" },
      { ...record, contract_id: "0".repeat(64) },
      { ...record, anchor_schema_id: "synthetic-other-anchor" },
      { ...record, rule_index: 7 },
      { ...record, components: [["code", "sr-cli"]] },
      {
        ...record,
        components: [
          ["code", "SR-cli"],
          ["code", "sr-cli"],
        ],
      },
      { ...record, extra: "unsupported" },
    ])
      expect(() =>
        validateExactEntityIdentityRecord(binding, changed, entityId, "synthetic-owner")
      ).toThrow(EntityIdentityContractError);
    expect(() =>
      validateExactEntityIdentityRecord(binding, record, "ent_different", "synthetic-owner")
    ).toThrow(EntityIdentityContractError);
    expect(() =>
      validateExactEntityIdentityRecord(binding, "{broken", entityId, "synthetic-owner")
    ).toThrow(EntityIdentityContractError);
  });

  it("canonicalizes declaration key order and refuses unsupported declarations before encoding", () => {
    expect(
      canonicalExactIdentityContract(
        {
          namespace: contract.namespace,
          canonical_name_fields: ["code"],
          mode: "exact_utf8",
          version: "2",
        },
        fields
      )
    ).toEqual(contract);
    for (const input of [
      { ...contract, namespace: "\ud800" },
      { ...contract, mode: "lowercase" },
      { ...contract, canonical_name_fields: ["missing"] },
      { ...contract, canonical_name_fields: [{ composite: ["code", "code"] }] },
      { ...contract, invented: true },
    ])
      expect(() => canonicalExactIdentityContract(input, fields)).toThrow(
        EntityIdentityContractError
      );
    expect(() => canonicalExactIdentityContract(contract, { code: { type: "number" } })).toThrow(
      /string fields/
    );
  });
});
