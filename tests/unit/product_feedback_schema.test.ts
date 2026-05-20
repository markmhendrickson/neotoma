/**
 * Unit tests for the product_feedback schema and store-time identity validation.
 *
 * Covers:
 * - #136: product_feedback schema has a feedback_source discriminator field
 * - #137: store_warnings fires when no identity fields are present
 * - #137: no warning when feedback_source is supplied
 * - #137: no warning when reporter_email / reporter_name / reporter_id is supplied
 */

import { describe, it, expect } from "vitest";
import { ENTITY_SCHEMAS } from "../../src/services/schema_definitions.js";

// ---------------------------------------------------------------------------
// #136 – schema shape
// ---------------------------------------------------------------------------

describe("product_feedback schema (#136)", () => {
  const schema = ENTITY_SCHEMAS["product_feedback"];

  it("is registered in ENTITY_SCHEMAS", () => {
    expect(schema).toBeDefined();
  });

  it("has entity_type 'product_feedback'", () => {
    expect(schema.entity_type).toBe("product_feedback");
  });

  it("has a feedback_source field", () => {
    expect(schema.schema_definition.fields).toHaveProperty("feedback_source");
  });

  it("feedback_source is typed as string", () => {
    expect(schema.schema_definition.fields["feedback_source"].type).toBe("string");
  });

  it("feedback_source has a description mentioning 'internal' and 'external'", () => {
    const desc = schema.schema_definition.fields["feedback_source"].description ?? "";
    expect(desc).toMatch(/internal/i);
    expect(desc).toMatch(/external/i);
  });

  it("has reporter_email as an optional identity field", () => {
    expect(schema.schema_definition.fields).toHaveProperty("reporter_email");
    expect(schema.schema_definition.fields["reporter_email"].required).toBeFalsy();
  });

  it("has reporter_name as an optional identity field", () => {
    expect(schema.schema_definition.fields).toHaveProperty("reporter_name");
    expect(schema.schema_definition.fields["reporter_name"].required).toBeFalsy();
  });

  it("has reporter_id as an optional identity field", () => {
    expect(schema.schema_definition.fields).toHaveProperty("reporter_id");
    expect(schema.schema_definition.fields["reporter_id"].required).toBeFalsy();
  });

  it("has agent_instructions mentioning feedback_source discriminator", () => {
    const instructions = schema.schema_definition.agent_instructions ?? "";
    expect(instructions).toMatch(/feedback_source/);
  });
});

// ---------------------------------------------------------------------------
// #137 – store_warnings rule: helper that mirrors the actions.ts logic
// ---------------------------------------------------------------------------

/**
 * Evaluate store_warnings rules from the schema against a payload.
 * Returns the list of warning objects that fire.
 *
 * This mirrors the check in storeStructuredForApi / storeStructuredInternal so
 * we can unit-test the rule logic without a running server or DB.
 */
function evaluateStoreWarnings(
  fields: Record<string, unknown>,
  entityType: string = "product_feedback",
): Array<{ code: string; message: string }> {
  const schema = ENTITY_SCHEMAS[entityType];
  const rules = schema?.schema_definition?.store_warnings ?? [];
  const fired: Array<{ code: string; message: string }> = [];
  for (const rule of rules) {
    const hasIdentityField = rule.fields.some(
      (f) => fields[f] !== undefined && fields[f] !== null && fields[f] !== "",
    );
    if (!hasIdentityField) {
      fired.push({ code: rule.code, message: rule.message });
    }
  }
  return fired;
}

describe("product_feedback store_warnings rule (#137)", () => {
  it("fires when none of the identity fields are present", () => {
    const warnings = evaluateStoreWarnings({ title: "Bug: crash on login", content: "Repro: ..." });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe("MISSING_IDENTITY_FIELDS");
    expect(warnings[0].message).toMatch(/feedback_source/);
    expect(warnings[0].message).toMatch(/reporter_email/);
  });

  it("does NOT fire when feedback_source is 'internal'", () => {
    const warnings = evaluateStoreWarnings({
      title: "Sprint retro note",
      content: "We should improve test coverage.",
      feedback_source: "internal",
    });
    expect(warnings).toHaveLength(0);
  });

  it("does NOT fire when feedback_source is 'external'", () => {
    const warnings = evaluateStoreWarnings({
      title: "Login page broken on mobile",
      feedback_source: "external",
    });
    expect(warnings).toHaveLength(0);
  });

  it("does NOT fire when reporter_email is supplied", () => {
    const warnings = evaluateStoreWarnings({
      title: "Feature request: dark mode",
      reporter_email: "alice@example.com",
    });
    expect(warnings).toHaveLength(0);
  });

  it("does NOT fire when reporter_name is supplied", () => {
    const warnings = evaluateStoreWarnings({
      title: "Onboarding confusion",
      reporter_name: "Bob Smith",
    });
    expect(warnings).toHaveLength(0);
  });

  it("does NOT fire when reporter_id is supplied", () => {
    const warnings = evaluateStoreWarnings({
      title: "Pagination bug",
      reporter_id: "usr_abc123",
    });
    expect(warnings).toHaveLength(0);
  });

  it("does NOT fire when feedback_source is empty string (treats as missing)", () => {
    // An empty string value is treated the same as absent — must have a real value.
    const warnings = evaluateStoreWarnings({
      title: "Vague report",
      feedback_source: "",
    });
    expect(warnings).toHaveLength(1);
  });

  it("warning message mentions all four identity fields", () => {
    const warnings = evaluateStoreWarnings({ title: "No identity" });
    const msg = warnings[0]?.message ?? "";
    expect(msg).toMatch(/feedback_source/);
    expect(msg).toMatch(/reporter_email/);
    expect(msg).toMatch(/reporter_name/);
    expect(msg).toMatch(/reporter_id/);
  });
});

// ---------------------------------------------------------------------------
// Verify store_warnings is declared on the schema itself
// ---------------------------------------------------------------------------

describe("product_feedback schema store_warnings declaration", () => {
  const schema = ENTITY_SCHEMAS["product_feedback"];

  it("declares store_warnings on schema_definition", () => {
    expect(schema.schema_definition.store_warnings).toBeDefined();
    expect(Array.isArray(schema.schema_definition.store_warnings)).toBe(true);
    expect(schema.schema_definition.store_warnings!.length).toBeGreaterThan(0);
  });

  it("MISSING_IDENTITY_FIELDS rule covers all four identity fields", () => {
    const rule = schema.schema_definition.store_warnings!.find(
      (r) => r.code === "MISSING_IDENTITY_FIELDS",
    );
    expect(rule).toBeDefined();
    expect(rule!.fields).toContain("feedback_source");
    expect(rule!.fields).toContain("reporter_email");
    expect(rule!.fields).toContain("reporter_name");
    expect(rule!.fields).toContain("reporter_id");
  });
});
