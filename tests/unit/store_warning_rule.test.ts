/**
 * Unit tests for schema-declared `store_warnings` rule evaluation.
 * Covers the defect behind #2067, #2165, #2170.
 *
 * The defect these cover: the two store paths inlined `rule.fields.some(...)`,
 * which threw `TypeError: Cannot read properties of undefined (reading 'some')`
 * for any registered schema whose rule declared a `condition` instead of a flat
 * `fields` list. The throw escaped the store handler as `DB_QUERY_FAILED`, so an
 * advisory warning rule made every entity of that type unwritable — including on
 * `commit: false` dry runs.
 *
 * The load-bearing property under test is therefore not "missing_all_of works"
 * but "no rule shape can make this throw". A warning must never block a write.
 */

import { describe, it, expect } from "vitest";
import {
  evaluateStoreWarningRule,
  STORE_WARNING_RULE_NOT_EVALUATED,
  SUPPORTED_CONDITION_KEYS,
  type StoreWarningRuleInput,
} from "../../src/services/store_warning_rule.js";

describe("evaluateStoreWarningRule — flat `fields` spelling (pre-existing behaviour)", () => {
  const rule: StoreWarningRuleInput = {
    code: "MISSING_IDENTITY_FIELDS",
    fields: ["feedback_source", "reporter_email", "reporter_name"],
    message: "product_feedback stored without identity fields",
  };

  it("fires when none of the listed fields carry a value", () => {
    const result = evaluateStoreWarningRule(rule, { title: "a report" });
    expect(result.fired).toBe(true);
    expect(result.code).toBe("MISSING_IDENTITY_FIELDS");
    expect(result.notEvaluated).toBe(false);
  });

  it("is suppressed when at least one listed field carries a value", () => {
    const result = evaluateStoreWarningRule(rule, { reporter_email: "a@example.com" });
    expect(result.fired).toBe(false);
  });

  it("treats null and empty string as absent, matching the original inline check", () => {
    const result = evaluateStoreWarningRule(rule, {
      feedback_source: null,
      reporter_email: "",
      reporter_name: undefined,
    });
    expect(result.fired).toBe(true);
  });
});

describe("evaluateStoreWarningRule — declarative `condition.missing_all_of` (#2165)", () => {
  /**
   * Verbatim shape of the rule on the live `skill` schema (v2.6.0) that made
   * `entity_type: "skill"` unwritable on the operator's instance.
   */
  const liveSkillRule: StoreWarningRuleInput = {
    code: "MISSING_CONTENT_FIELD",
    message: "skill has no content body.",
    condition: { missing_all_of: ["content"] },
  };

  it("does not throw on the production rule shape that returned DB_QUERY_FAILED", () => {
    // This is the regression proper. Before the fix this call threw
    // `TypeError: Cannot read properties of undefined (reading 'some')`.
    expect(() => evaluateStoreWarningRule(liveSkillRule, { content: "# body" })).not.toThrow();
  });

  it("is suppressed when the named field carries a value", () => {
    const result = evaluateStoreWarningRule(liveSkillRule, { content: "# body" });
    expect(result.fired).toBe(false);
    expect(result.notEvaluated).toBe(false);
  });

  it("fires when every named field is absent", () => {
    const result = evaluateStoreWarningRule(liveSkillRule, { name: "a-skill" });
    expect(result.fired).toBe(true);
    expect(result.code).toBe("MISSING_CONTENT_FIELD");
    expect(result.message).toBe("skill has no content body.");
  });

  it("requires ALL named fields absent before firing", () => {
    const rule: StoreWarningRuleInput = {
      code: "MISSING_BODY",
      message: "no body",
      condition: { missing_all_of: ["content", "summary"] },
    };
    expect(evaluateStoreWarningRule(rule, { summary: "s" }).fired).toBe(false);
    expect(evaluateStoreWarningRule(rule, {}).fired).toBe(true);
  });

  it("agrees with the flat spelling on the same intent", () => {
    const flat: StoreWarningRuleInput = { code: "C", message: "m", fields: ["a", "b"] };
    const declarative: StoreWarningRuleInput = {
      code: "C",
      message: "m",
      condition: { missing_all_of: ["a", "b"] },
    };
    for (const payload of [{}, { a: "x" }, { b: "y" }, { a: "x", b: "y" }]) {
      expect(evaluateStoreWarningRule(declarative, payload).fired).toBe(
        evaluateStoreWarningRule(flat, payload).fired
      );
    }
  });
});

describe("evaluateStoreWarningRule — unknown rule shapes fail open and legibly", () => {
  it("reports, rather than throws, on an unimplemented condition key", () => {
    const rule: StoreWarningRuleInput = {
      code: "SOME_RULE",
      message: "m",
      condition: { present_any_of: ["a"] },
    };
    let result!: ReturnType<typeof evaluateStoreWarningRule>;
    expect(() => {
      result = evaluateStoreWarningRule(rule, {});
    }).not.toThrow();
    expect(result.code).toBe(STORE_WARNING_RULE_NOT_EVALUATED);
    expect(result.notEvaluated).toBe(true);
    // The diagnostic must name what could not be evaluated, and must say the
    // write was not blocked — the whole point of failing open.
    expect(result.message).toContain("present_any_of");
    expect(result.message).toContain("SOME_RULE");
    expect(result.message).toContain("NOT blocked");
  });

  it("does not evaluate a partially-understood condition", () => {
    // `missing_all_of` is readable here, but the sibling key may narrow it.
    // Guessing from the readable half would be wrong; report instead.
    const rule: StoreWarningRuleInput = {
      code: "SOME_RULE",
      message: "m",
      condition: { missing_all_of: ["content"], only_when_kind: "doc" },
    };
    const result = evaluateStoreWarningRule(rule, { content: "body" });
    expect(result.notEvaluated).toBe(true);
    expect(result.code).toBe(STORE_WARNING_RULE_NOT_EVALUATED);
  });

  it("reports a rule declaring neither `fields` nor `condition`", () => {
    const result = evaluateStoreWarningRule({ code: "BARE", message: "m" }, {});
    expect(result.notEvaluated).toBe(true);
    expect(result.message).toContain("neither");
  });

  it("never throws on malformed rule values of any type", () => {
    const malformed: StoreWarningRuleInput[] = [
      {},
      { code: "A", message: "m", fields: "not-an-array" },
      { code: "A", message: "m", fields: [] },
      { code: "A", message: "m", fields: [1, 2, 3] },
      { code: "A", message: "m", condition: null },
      { code: "A", message: "m", condition: "nope" },
      { code: "A", message: "m", condition: [] },
      { code: "A", message: "m", condition: { missing_all_of: "content" } },
      { code: "A", message: "m", condition: { missing_all_of: [] } },
      { code: 42, message: undefined },
    ];
    for (const rule of malformed) {
      expect(() => evaluateStoreWarningRule(rule, { content: "x" })).not.toThrow();
      // Every outcome must still be a usable warning envelope.
      const result = evaluateStoreWarningRule(rule, { content: "x" });
      expect(typeof result.code).toBe("string");
      expect(result.code.length).toBeGreaterThan(0);
      expect(typeof result.message).toBe("string");
    }
  });

  it("declares `missing_all_of` as a supported condition key", () => {
    expect(SUPPORTED_CONDITION_KEYS).toContain("missing_all_of");
  });
});
