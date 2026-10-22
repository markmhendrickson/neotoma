import { describe, expect, it } from "vitest";
import {
  canonicalExactIdentityContract,
  createAcceptedIdentityBinding,
  deriveExactEntityIdentity,
  EntityIdentityContractError,
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
    const ordered = {
      ...binding,
      contract: { ...contract, canonical_name_fields: [{ composite: ["code", "extra"] }, "code"] },
    };
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
