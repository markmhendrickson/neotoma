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
    expect(result.message).toContain("did NOT block");
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

/**
 * A field list is taken whole or not at all.
 *
 * The first revision of this evaluator filtered non-string entries out of a
 * declared list, so `missing_all_of: ["content", 7]` became `["content"]` and
 * was evaluated as though the schema author had written it — with `content`
 * present the rule was suppressed and nothing was reported at all. That is a
 * partially understood condition repaired by guessing, which is the defect
 * class this whole module exists to fix. These cases pin the opposite: a list
 * with any unusable entry is rejected intact and reported.
 */
describe("evaluateStoreWarningRule — a malformed field list is reported, never salvaged", () => {
  const mixed: StoreWarningRuleInput = {
    code: "MISSING_BODY",
    message: "Body missing.",
    condition: { missing_all_of: ["content", 7] },
  };

  it("reports a mixed-type `condition.missing_all_of` instead of evaluating the string entries", () => {
    // The exact shape from the committed contract scenario: with `content`
    // present, salvaging to ["content"] suppresses the rule silently.
    const result = evaluateStoreWarningRule(mixed, { content: "body" });
    expect(result.code).toBe(STORE_WARNING_RULE_NOT_EVALUATED);
    expect(result.notEvaluated).toBe(true);
    expect(result.fired).toBe(true);
  });

  it("reports the mixed list whether or not the salvageable field is present", () => {
    // Salvaging happened to fire on an absent field, which is how the defect
    // stayed invisible: only the present-field case looked wrong.
    const result = evaluateStoreWarningRule(mixed, {});
    expect(result.code).toBe(STORE_WARNING_RULE_NOT_EVALUATED);
    expect(result.notEvaluated).toBe(true);
  });

  it("names the path, the offending entry, and that nothing was discarded", () => {
    const result = evaluateStoreWarningRule(mixed, { content: "body" });
    expect(result.message).toContain("MISSING_BODY");
    expect(result.message).toContain("condition.missing_all_of");
    expect(result.message).toContain("index 1");
    expect(result.message).toContain("rejected intact");
    expect(result.message).toContain("did NOT block");
  });

  it("applies the same rule to the flat `fields` spelling", () => {
    const result = evaluateStoreWarningRule(
      { code: "MISSING_BODY", message: "m", fields: ["content", 7] },
      { content: "body" }
    );
    expect(result.code).toBe(STORE_WARNING_RULE_NOT_EVALUATED);
    expect(result.message).toContain("`fields`");
    expect(result.message).not.toContain("condition.missing_all_of");
  });

  it.each([
    ["an empty list", { missing_all_of: [] }],
    ["a non-array", { missing_all_of: "content" }],
    ["an all-numeric list", { missing_all_of: [1, 2] }],
    ["a list holding an empty string", { missing_all_of: ["content", ""] }],
    ["a list holding null", { missing_all_of: ["content", null] }],
    ["a list holding a nested array", { missing_all_of: ["content", ["a"]] }],
  ])("reports %s rather than evaluating any readable part", (_label, condition) => {
    const result = evaluateStoreWarningRule(
      { code: "R", message: "m", condition },
      { content: "body" }
    );
    expect(result.code).toBe(STORE_WARNING_RULE_NOT_EVALUATED);
    expect(result.notEvaluated).toBe(true);
  });

  it("names only the unsupported keys of a partially understood condition", () => {
    // Reporting every key would send a schema author looking at the one they
    // wrote correctly.
    const result = evaluateStoreWarningRule(
      {
        code: "R",
        message: "m",
        condition: { missing_all_of: ["content"], only_when_kind: "doc" },
      },
      { content: "body" }
    );
    expect(result.message).toContain("only_when_kind");
    // `missing_all_of` still appears in the "Supported condition keys" list;
    // what must not happen is its being named as one of the unsupported keys.
    expect(result.message).toContain('unrecognised condition key ["only_when_kind"]');
  });

  it("leaves well-formed lists behaving exactly as before", () => {
    const declarative: StoreWarningRuleInput = {
      code: "C",
      message: "m",
      condition: { missing_all_of: ["content"] },
    };
    const flat: StoreWarningRuleInput = { code: "C", message: "m", fields: ["content"] };
    for (const rule of [declarative, flat]) {
      expect(evaluateStoreWarningRule(rule, { content: "body" })).toMatchObject({
        fired: false,
        code: "C",
        notEvaluated: false,
      });
      expect(evaluateStoreWarningRule(rule, {})).toMatchObject({
        fired: true,
        code: "C",
        notEvaluated: false,
      });
    }
  });

  it("does not claim the entity was persisted", () => {
    // A dry run and an independently failed write both reach this path.
    const result = evaluateStoreWarningRule(mixed, { content: "body" });
    expect(result.message).not.toMatch(/write proceeded|data stored|was saved/i);
  });
});
