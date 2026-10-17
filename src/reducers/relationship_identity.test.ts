/** Structural key arithmetic only; these synthetic inputs confer no authority. */
import { describe, expect, it } from "vitest";
import type { components } from "../shared/openapi_types.js";
import { RelationshipReducer } from "./relationship_reducer.js";

const presentation = {
  user_id: "synthetic-owner",
  credential_kind: "aauth_sub" as const,
  credential_value: "SYNTHETIC_SUBJECT",
  credential_issuer: "https://synthetic-issuer.invalid",
};
const keyInput: components["schemas"]["CredentialBindingKeyInput"] = {
  identity_strategy: "credential-binding-v1",
  relationship_type: "principal_binding",
  source_entity_id: null,
  target_entity_id: "ent_" + "a".repeat(24),
  presentation,
};
const key = (input: unknown) =>
  RelationshipReducer.generateRelationshipKey(input as typeof keyInput);
const lookup = (input: unknown) =>
  RelationshipReducer.generateCredentialLookupKey(
    input as components["schemas"]["CredentialBindingLookupInput"]
  );
const lookupInput = { identity_strategy: "credential-binding-v1", presentation };

describe("shared relationship identity recipes", () => {
  it.each([
    ["PART_OF", "synthetic-source", "synthetic-target"],
    ["part_of", "Source:with:colons", "target:with:colons"],
    ["REFERS_TO", "synthetic-α-😀", "synthetic-β"],
    ["principal_binding", "legacy-source", "legacy-target"],
  ])("preserves ordinary and inert historical tuple bytes exactly: %s", (type, source, target) => {
    expect(RelationshipReducer.generateRelationshipKey(type, source, target)).toBe(
      `${type}:${source}:${target}`
    );
  });
  it("matches independent SHA256/C byte fixtures without returning a principal/admission", () => {
    // Fixed expectations were calculated independently with Python JSON UTF8
    // arrays + hashlib, not by the implementation under test.
    expect(key(keyInput)).toBe(
      "principal_binding:v1:e2fe6e4f5f656641bcdd96d7c4130509f7ef79f12ba5e6a5a9edbe74fb508919"
    );
    expect(lookup(lookupInput)).toBe(
      "9771e58b510fe22342338182cde933f1d7138748e3c859ba20d772cf21589c7e"
    );
    expect(typeof key(keyInput)).toBe("string");
  });
  it("keeps explicit null issuer distinct, without admitting an issuer-less runtime identity", () => {
    const p = { ...presentation, credential_issuer: null };
    expect(key({ ...keyInput, presentation: p })).toBe(
      "principal_binding:v1:e2541d2c23c0c84ba9538992d8963d99f25eb771f6f76eb9e48e125e2bbb7bc9"
    );
    expect(lookup({ ...lookupInput, presentation: p })).toBe(
      "ea6e200ee78baa9e0cbe63ee82bc659cf0e74071ac65311eb6037057e61ba7d4"
    );
  });
  it("separates every identity-bearing field and every target, without target-scoping the lookup", () => {
    const base = key(keyInput);
    const baselineLookup = lookup(lookupInput);
    for (const p of [
      { ...presentation, user_id: "other-synthetic-owner" },
      { ...presentation, credential_value: "SYNTHETIC_OTHER_SUBJECT" },
      { ...presentation, credential_issuer: "https://other-synthetic-issuer.invalid" },
    ]) {
      expect(key({ ...keyInput, presentation: p })).not.toBe(base);
      expect(lookup({ ...lookupInput, presentation: p })).not.toBe(baselineLookup);
    }
    expect(key({ ...keyInput, target_entity_id: "ent_" + "b".repeat(24) })).not.toBe(base);
    expect(lookup(lookupInput)).toBe(baselineLookup);
  });
  it.each(
    [
      null,
      undefined,
      0,
      {},
      [],
      "",
      { ...keyInput, identity_strategy: undefined },
      { ...keyInput, identity_strategy: null },
      { ...keyInput, identity_strategy: "unknown" },
      { ...keyInput, identity_strategy: "entity-pair-v1" },
      { ...keyInput, identity_strategy: "lease-slot-v1" },
      { ...keyInput, source_entity_id: "legacy-source" },
      { ...keyInput, target_entity_id: null },
      { ...keyInput, target_entity_id: "not-an-entity" },
      { ...keyInput, relationship_type: "PART_OF" },
      { ...keyInput, admitted: true },
      { ...keyInput, presentation: { ...presentation, credential_kind: "unknown" } },
      { ...keyInput, presentation: { ...presentation, user_id: "" } },
      { ...keyInput, presentation: { ...presentation, credential_value: "" } },
      { ...keyInput, presentation: { ...presentation, credential_issuer: undefined } },
      { ...keyInput, presentation: { ...presentation, credential_issuer: "" } },
      { ...keyInput, presentation: { ...presentation, origin: "synthetic" } },
    ].map((input) => ({ input }))
  )("refuses missing/malformed/mixed strategy input %#", ({ input }) => {
    expect(() => key(input)).toThrow();
  });
  it.each(
    [
      null,
      undefined,
      { ...lookupInput, identity_strategy: "unknown" },
      { ...lookupInput, identity_strategy: null },
      { ...lookupInput, target_entity_id: keyInput.target_entity_id },
      { ...lookupInput, admitted: true },
      { ...lookupInput, presentation: { ...presentation, credential_value: NaN } },
    ].map((input) => ({ input }))
  )("refuses malformed or broadened lookup input %#", ({ input }) => {
    expect(() => lookup(input)).toThrow();
  });
  it("refuses accessor inputs before executing them", () => {
    let accessed = 0;
    const input = { ...keyInput };
    Object.defineProperty(input, "presentation", {
      enumerable: true,
      get() {
        accessed++;
        return presentation;
      },
    });
    expect(() => key(input)).toThrow();
    expect(accessed).toBe(0);
  });
  it.each(
    [
      ["PART_OF", null, "target"],
      ["PART_OF", undefined, "target"],
      ["PART_OF", {}, "target"],
      ["PART_OF", 1, "target"],
      ["PART_OF", "source", null],
      ["PART_OF", "source", undefined],
      ["PART_OF", "", "target"],
      ["", "source", "target"],
      ["PART_OF", "source", "target", "credential-binding-v1"],
    ].map((args) => ({ args }))
  )("refuses malformed ordinary endpoint/extra strategy arguments %#", ({ args }) => {
    expect(() =>
      (RelationshipReducer.generateRelationshipKey as (...values: unknown[]) => string)(...args)
    ).toThrow();
  });
});
