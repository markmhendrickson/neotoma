/**
 * Unit tests for the field-attribution guard in
 * scripts/backfill_canonical_names.ts.
 *
 * The guard exists because an unconstrained re-derive can rename a contact to
 * their email or employer (the schema's canonical_name_fields ranks
 * ["email", "phone", "external_id", "contact_id", "name"]). The backfill must
 * only ever move canonical_name to a value drawn from a name-ish field
 * (NAME_FIELDS), never to email/organization/title, however the schema
 * precedence ranks them. This is pure logic with no DB dependency.
 */

import { describe, expect, it } from "vitest";
import {
  sourceFieldOf,
  changesSourceField,
  NAME_FIELDS,
} from "../../scripts/backfill_canonical_names.js";

describe("sourceFieldOf", () => {
  it("finds the snapshot field whose value matches the canonical name", () => {
    const snapshot = { name: "Rani Sweis", email: "rani@example.com" };
    expect(sourceFieldOf("Rani Sweis", snapshot)).toBe("name");
  });

  it("matches case-insensitively and whitespace-normalized", () => {
    const snapshot = { name: "  Rani   Sweis  " };
    expect(sourceFieldOf("rani sweis", snapshot)).toBe("name");
  });

  it("returns null when no field matches", () => {
    const snapshot = { name: "Rani Sweis" };
    expect(sourceFieldOf("Someone Else", snapshot)).toBeNull();
  });

  it("returns null for an empty canonical name", () => {
    const snapshot = { name: "" };
    expect(sourceFieldOf("", snapshot)).toBeNull();
  });

  // formatCanonicalNameForStorage strips apostrophes, parens, commas and
  // corporate suffixes on the way to storage. An exact-match attribution made
  // the guard skip these — i.e. it blocked precisely the real-world names most
  // worth repairing. A dry run over 50 production rows skipped 8 of them for
  // this reason alone; these cases lock the fix in.
  it.each([
    ["James O Brien", { name: "James O'Brien" }],
    ["Vlad Volodymyr Pavlov", { name: "Vlad (Volodymyr) Pavlov" }],
    ["Lauren Piche PHR", { name: "Lauren Piche, PHR" }],
    ["Michael O Loughlin", { name: "Michael O'Loughlin" }],
    ["Aviv Ben Yosef", { name: "Aviv Ben-Yosef" }],
    ["Vincent Kok VK 郭进强 MCT ACLP", { name: "Vincent Kok (VK) 郭进强, MCT, ACLP" }],
  ])("attributes %j to `name` despite punctuation normalization", (derived, snapshot) => {
    expect(sourceFieldOf(derived as string, snapshot as Record<string, unknown>)).toBe("name");
  });

  it("attributes a suffix-stripped company name to `name`", () => {
    // "Sea Waves Inc" -> "Sea Waves": a leading subset of the field's words.
    expect(sourceFieldOf("Sea Waves", { name: "Sea Waves Inc" })).toBe("name");
  });

  it("does NOT attribute a different person to `name` via subset matching", () => {
    // Guard against the subset rule being too loose: a first-name-only match
    // must not silently attribute, since that would permit a real rename.
    expect(sourceFieldOf("Completely Different", { name: "Rani Sweis" })).toBeNull();
  });

  it("still attributes an email-valued derivation to `email`, not `name`", () => {
    const snapshot = { name: "Sample Contact", email: "sample@example.com" };
    expect(sourceFieldOf("sample@example.com", snapshot)).toBe("email");
  });

  it("ignores non-string snapshot fields", () => {
    const snapshot = { name: "Rani Sweis", tags: ["a", "b"], age: 30 };
    expect(sourceFieldOf("Rani Sweis", snapshot)).toBe("name");
  });
});

describe("changesSourceField", () => {
  it("returns false when the new name still comes from a name-ish field", () => {
    const snapshot = { name: "Rani Sweis", email: "rani@example.com" };
    expect(changesSourceField("🦄 Rani Sweis", "Rani Sweis", snapshot)).toBe(false);
  });

  it("returns true when the new name would come from email (the reported production risk)", () => {
    const snapshot = { name: "Manual Contact", email: "sample@example.com" };
    // Simulates schema precedence deriving from email instead of name.
    expect(changesSourceField("Manual Contact", "sample@example.com", snapshot)).toBe(true);
  });

  it("returns true when the new name would come from organization (the reported production risk)", () => {
    const snapshot = { name: "Manual Contact", organization: "ManualOrg" };
    expect(changesSourceField("Manual Contact", "ManualOrg", snapshot)).toBe(true);
  });

  it("returns true when the new name matches no snapshot field at all", () => {
    const snapshot = { name: "Rani Sweis" };
    expect(changesSourceField("Rani Sweis", "Someone Unattributed", snapshot)).toBe(true);
  });

  it("accepts every field in NAME_FIELDS as a legitimate source", () => {
    for (const field of NAME_FIELDS) {
      const snapshot = { [field]: "New Value" };
      expect(changesSourceField("Old Value", "New Value", snapshot)).toBe(false);
    }
  });
});
