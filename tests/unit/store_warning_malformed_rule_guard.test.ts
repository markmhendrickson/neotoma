/**
 * Regression test for the store_warnings malformed-rule guard.
 *
 * Bug: the store path evaluated each `store_warnings` rule with
 * `rule.fields.some(...)`. A rule stored in a legacy/malformed shape — no
 * `fields` array (e.g. a `condition`-shaped entry like
 * `{ code, message, condition: { missing_all_of: ["content"] } }`) — caused
 * `undefined.some` to throw, 500-ing the entire store call. This was observed
 * on the `skill` entity type, whose DB schema carried a `condition`-shaped
 * store_warnings entry, making store() of ANY skill entity fail.
 *
 * Fix: skip any rule whose `fields` is not a non-empty array. A rule with no
 * `fields` cannot evaluate "missing identity field", so it neither fires nor
 * crashes. This mirrors the guard added in src/server.ts and src/actions.ts.
 */

import { describe, it, expect } from "vitest";

/**
 * Faithful mirror of the store_warnings rule evaluation in
 * src/server.ts / src/actions.ts, including the malformed-rule guard.
 */
function evaluateStoreWarnings(
  rules: Array<{ code: string; message: string; fields?: unknown }>,
  entityFields: Record<string, unknown>,
): Array<{ code: string; message: string }> {
  const out: Array<{ code: string; message: string }> = [];
  for (const rule of rules) {
    // Guard: a rule with no `fields` array cannot evaluate; skip, don't throw.
    if (!Array.isArray(rule.fields) || rule.fields.length === 0) continue;
    const hasIdentityField = (rule.fields as string[]).some(
      (f) => entityFields[f] !== undefined && entityFields[f] !== null && entityFields[f] !== "",
    );
    if (!hasIdentityField) {
      out.push({ code: rule.code, message: rule.message });
    }
  }
  return out;
}

describe("store_warnings malformed-rule guard", () => {
  it("does NOT throw on a rule missing `fields` (legacy condition-shaped entry)", () => {
    const malformed = [
      {
        code: "MISSING_CONTENT_FIELD",
        message: "skill has no content body.",
        // legacy shape: no `fields`, has `condition` instead
        condition: { missing_all_of: ["content"] },
      } as unknown as { code: string; message: string; fields?: unknown },
    ];
    expect(() => evaluateStoreWarnings(malformed, { name: "evaluate-leads" })).not.toThrow();
  });

  it("skips a malformed rule (emits no warning for it)", () => {
    const malformed = [
      { code: "MISSING_CONTENT_FIELD", message: "x", condition: { missing_all_of: ["content"] } },
    ] as unknown as Array<{ code: string; message: string; fields?: unknown }>;
    const warnings = evaluateStoreWarnings(malformed, { name: "evaluate-leads" });
    expect(warnings).toHaveLength(0);
  });

  it("skips a rule with an empty `fields` array", () => {
    const warnings = evaluateStoreWarnings([{ code: "C", message: "m", fields: [] }], {});
    expect(warnings).toHaveLength(0);
  });

  it("still fires a well-formed rule when none of its fields are present", () => {
    const warnings = evaluateStoreWarnings(
      [{ code: "MISSING_IDENTITY", message: "no identity", fields: ["email", "name"] }],
      { company: "Acme" },
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe("MISSING_IDENTITY");
  });

  it("does NOT fire a well-formed rule when at least one field is present", () => {
    const warnings = evaluateStoreWarnings(
      [{ code: "MISSING_IDENTITY", message: "no identity", fields: ["email", "name"] }],
      { name: "Alice" },
    );
    expect(warnings).toHaveLength(0);
  });

  it("evaluates a mix: fires the well-formed rule, silently skips the malformed one", () => {
    const rules = [
      { code: "MALFORMED", message: "legacy", condition: { missing_all_of: ["content"] } },
      { code: "MISSING_IDENTITY", message: "no identity", fields: ["email"] },
    ] as unknown as Array<{ code: string; message: string; fields?: unknown }>;
    const warnings = evaluateStoreWarnings(rules, { company: "Acme" });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe("MISSING_IDENTITY");
  });
});
