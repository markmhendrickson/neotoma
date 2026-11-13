/**
 * Bounds on caller-supplied regular expressions in schema constraints,
 * derived-entity conditions and rendered-page rules.
 */

import { describe, it, expect } from "vitest";
import {
  CONFORMANCE_TOTAL_BUDGET_MS,
  MATCH_TIMEOUT_MS,
  MAX_CONFORMANCE_RULES_PER_PAGE,
  MAX_PATTERNS_PER_CONDITION,
  MAX_PATTERNS_PER_SCHEMA,
  MAX_PATTERN_LENGTH,
  MAX_SUBJECT_LENGTH,
  REQUEST_PATTERN_BUDGET_MS,
  SchemaPatternRefusalError,
  withPatternBudget,
  safePatternTest,
  validatePattern,
} from "../../src/services/safe_pattern.js";
import { checkFieldConstraints } from "../../src/services/field_constraints.js";
import { evaluateCondition } from "../../src/services/schema_derived_entity_extraction.js";
import { checkRenderedPageConformance } from "../../src/services/rendered_page/conformance.js";
import { SchemaRegistryService } from "../../src/services/schema_registry.js";
import type { SchemaDefinition } from "../../src/services/schema_registry.js";

const NESTED = "^(a+)+$";
const NESTED_VARIANTS = ["^(a*)*$", "^(a+)*$", "^(?:[a-z]+)+$", "^(\\w+\\s?)*$"];
const SUBJECT = "a".repeat(40) + "!";

function validate(def: SchemaDefinition, mode?: "register" | "load"): Error | null {
  const registry = new SchemaRegistryService();
  try {
    // @ts-expect-error private method used for test purposes
    registry["validateSchemaDefinition"](def, mode);
    return null;
  } catch (err) {
    return err as Error;
  }
}

function schemaWithPattern(pattern: string): SchemaDefinition {
  return {
    fields: { code: { type: "string", constraints: { pattern } } },
    canonical_name_fields: ["code"],
  } as SchemaDefinition;
}

async function elapsed(fn: () => unknown): Promise<number> {
  const t = performance.now();
  fn();
  return performance.now() - t;
}

describe("validatePattern", () => {
  it.each([NESTED, ...NESTED_VARIANTS])(
    "rejects patterns with nested unbounded quantifiers: %s",
    (p) => {
      expect(validatePattern(p).ok).toBe(false);
    }
  );

  it("rejects repeated alternations whose branches begin identically", () => {
    expect(validatePattern("^(a|ab)+$").ok).toBe(false);
    expect(validatePattern("^(x|x)*$").ok).toBe(false);
  });

  it("rejects backreferences", () => {
    expect(validatePattern("^(a)\\1$").ok).toBe(false);
    expect(validatePattern("^(?<n>a)\\k<n>$").ok).toBe(false);
  });

  it("accepts ordinary patterns", () => {
    for (const p of [
      "^[A-Z]{2}-\\d{4}$",
      "^\\d{3}-\\d{4}$",
      "^[a-z0-9_]+$",
      "^(\\d{1,3}\\.){3}\\d{1,3}$",
      "^(foo|bar)+$",
      "^https?://[^/]+/.*$",
      "^(?:abc)?def$",
    ]) {
      expect(validatePattern(p), p).toEqual({ ok: true });
    }
  });

  it("caps pattern length", () => {
    expect(validatePattern("a".repeat(MAX_PATTERN_LENGTH)).ok).toBe(true);
    expect(validatePattern("a".repeat(MAX_PATTERN_LENGTH + 1)).ok).toBe(false);
  });

  it("does not echo the pattern in the reason", () => {
    const v = validatePattern(NESTED);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).not.toContain("a+");
  });
});

describe("safePatternTest", () => {
  it("matches ordinary patterns", () => {
    expect(safePatternTest("^[A-Z]{2}-\\d{4}$", "AB-1234").status).toBe("match");
    expect(safePatternTest("^[A-Z]{2}-\\d{4}$", "ab-1234").status).toBe("no_match");
  });

  it("caps subject length", () => {
    const r = safePatternTest("^a+$", "a".repeat(MAX_SUBJECT_LENGTH + 1));
    expect(r.status).toBe("subject_too_long");
    expect(safePatternTest("^a+$", "a".repeat(MAX_SUBJECT_LENGTH)).status).toBe("match");
  });

  it("never reports a match for a rejected pattern", () => {
    expect(safePatternTest(NESTED, "aaaa").status).toBe("invalid_pattern");
  });

  it("bounds evaluation time for shapes that pass the static rules", async () => {
    // Passes the static rules (no nesting); evaluation time is bounded by the budget.
    const pattern = ".*.*.*.*.*x";
    expect(validatePattern(pattern).ok).toBe(true);
    let status: string | undefined;
    const ms = await elapsed(() => {
      status = safePatternTest(pattern, "a".repeat(MAX_SUBJECT_LENGTH)).status;
    });
    // The time budget, not the static rules, ends this evaluation.
    expect(status).toBe("timeout");
    expect(ms).toBeLessThan(MATCH_TIMEOUT_MS * 5 + 500);
    // The evaluator remains usable afterwards.
    expect(safePatternTest("^a+$", "aaa").status).toBe("match");
  });
});

describe("validatePattern refusal codes", () => {
  it("distinguishes syntax, shape and length refusals", () => {
    const code = (p: string) => {
      const v = validatePattern(p);
      return v.ok ? "ok" : v.code;
    };
    expect(code("(unclosed")).toBe("syntax");
    expect(code(NESTED)).toBe("shape");
    expect(code("a".repeat(MAX_PATTERN_LENGTH + 1))).toBe("length");
    expect(code("^[A-Z]+$")).toBe("ok");
  });

  it("carries a remedy and states the length limit", () => {
    const shape = validatePattern(NESTED);
    expect(!shape.ok && shape.remedy.length > 0).toBe(true);
    const len = validatePattern("a".repeat(MAX_PATTERN_LENGTH + 1));
    expect(!len.ok && len.reason).toContain(String(MAX_PATTERN_LENGTH));
  });
});

describe("empty character classes", () => {
  // `[]` and `[^]` are complete classes in JavaScript.
  const wrapped = ["^[](a+)+[x]$", "^[^](a+)+[x]$"];

  it.each(wrapped)("refuses a nested-quantifier fixture following an empty class: %s", (p) => {
    for (const flags of ["", "u", "v"]) {
      expect(() => new RegExp(p, flags)).not.toThrow();
    }
    expect(validatePattern(p).ok).toBe(false);
  });

  it.each(wrapped)("refuses it in a constraint pattern: %s", (p) => {
    const v = checkFieldConstraints("code", "aaaa!", { pattern: p });
    expect(v).not.toBeNull();
    expect(v!.constraint).toBe("pattern");
    expect(validate(schemaWithPattern(p))).not.toBeNull();
  });

  it.each(wrapped)("ignores it in a matches_any_pattern condition: %s", (p) => {
    expect(
      evaluateCondition(
        { field: "body", op: "matches_any_pattern", patterns: [p] },
        { body: SUBJECT }
      )
    ).toBe(false);
  });

  it.each(wrapped)("is refused by safePatternTest, with and without u/v flags: %s", (p) => {
    for (const flags of ["i", "iu", "iv"]) {
      expect(safePatternTest(p, SUBJECT, { flags }).status).toBe("invalid_pattern");
    }
  });

  it("still accepts ordinary classes", () => {
    expect(validatePattern("^[a-z]+[^0-9]*$").ok).toBe(true);
    expect(validatePattern("^[\\]]+$").ok).toBe(true);
  });
});

describe("load-time integrity check", () => {
  it("accepts a stored schema holding a pattern the registration rules refuse", () => {
    expect(validate(schemaWithPattern(NESTED), "load")).toBeNull();
    expect(validate(schemaWithPattern(NESTED), "register")).not.toBeNull();
  });

  it("still rejects invalid pattern syntax at load", () => {
    expect(validate(schemaWithPattern("(unclosed"), "load")).not.toBeNull();
  });
});

describe("registration limits and messages", () => {
  const withConditions = (patterns: string[], conditions = 1) =>
    ({
      fields: { body: { type: "string" } },
      canonical_name_fields: ["body"],
      derived_entities: Array.from({ length: conditions }, () => ({
        conditions: [{ field: "body", op: "matches_any_pattern", patterns }],
        derived_entity_type: "task",
        derived_fields: { title: { value: "t" } },
      })),
    }) as unknown as SchemaDefinition;

  it("caps patterns per condition", () => {
    const ok = Array.from({ length: MAX_PATTERNS_PER_CONDITION }, (_, i) => `^p${i}$`);
    expect(validate(withConditions(ok))).toBeNull();
    expect(validate(withConditions([...ok, "^extra$"]))).not.toBeNull();
  });

  it("caps patterns per schema", () => {
    const perCondition = Array.from({ length: MAX_PATTERNS_PER_CONDITION }, (_, i) => `^p${i}$`);
    const conditions = Math.ceil(MAX_PATTERNS_PER_SCHEMA / MAX_PATTERNS_PER_CONDITION) + 1;
    const err = validate(withConditions(perCondition, conditions));
    expect(err).not.toBeNull();
    expect(err!.message).toContain(String(MAX_PATTERNS_PER_SCHEMA));
  });

  const refusal = (pattern: string) => {
    const registry = new SchemaRegistryService();
    try {
      // @ts-expect-error private method used for test purposes
      registry["validateSchemaDefinition"](schemaWithPattern(pattern));
    } catch (err) {
      return err as SchemaPatternRefusalError;
    }
    throw new Error("expected a refusal");
  };

  it("carries the rewrite guidance as a remedy, separate from the message", () => {
    const nested = refusal(NESTED);
    expect(nested).toBeInstanceOf(SchemaPatternRefusalError);
    expect(nested.refusal).toBe("shape");
    expect(nested.remedy).toMatch(/bounded count/);
    expect(nested.message).not.toMatch(/bounded count/);
    expect(refusal("^(a)\\1$").remedy).toMatch(/backreference/);
    expect(refusal("^(a|ab)+$").remedy).toMatch(/distinct/);
  });

  it("states the length limit", () => {
    const long = refusal("a".repeat(MAX_PATTERN_LENGTH + 1));
    expect(long.refusal).toBe("length");
    expect(long.message).toContain(String(MAX_PATTERN_LENGTH));
  });

  it("raises a typed error for count limits", () => {
    const perCondition = Array.from(
      { length: MAX_PATTERNS_PER_CONDITION + 1 },
      (_, i) => `^p${i}$`
    );
    const registry = new SchemaRegistryService();
    try {
      // @ts-expect-error private method used for test purposes
      registry["validateSchemaDefinition"](withConditions(perCondition));
      throw new Error("expected a refusal");
    } catch (err) {
      expect(err).toBeInstanceOf(SchemaPatternRefusalError);
      expect((err as SchemaPatternRefusalError).refusal).toBe("count");
    }
  });
});

describe("rendered-page rule limits", () => {
  it("evaluates at most the per-page rule count", () => {
    const rules = Array.from({ length: MAX_CONFORMANCE_RULES_PER_PAGE + 5 }, (_, i) => ({
      code: `R${i}`,
      pattern: "<p>",
      mode: "require_absent" as const,
    }));
    const codes = checkRenderedPageConformance("<p>x</p>", "", { rules }).map((w) => w.code);
    expect(codes).toContain("R0");
    expect(codes).toContain(`R${MAX_CONFORMANCE_RULES_PER_PAGE - 1}`);
    expect(codes).not.toContain(`R${MAX_CONFORMANCE_RULES_PER_PAGE}`);
    expect(CONFORMANCE_TOTAL_BUDGET_MS).toBeGreaterThan(0);
  });
});

describe("schema registration", () => {
  it.each([NESTED, ...NESTED_VARIANTS])(
    "rejects nested-quantifier constraint patterns: %s",
    (p) => {
      const err = validate(schemaWithPattern(p));
      expect(err).not.toBeNull();
      expect(err!.message).toContain("code");
      expect(err!.message).not.toContain(p);
    }
  );

  it("rejects over-long constraint patterns", () => {
    expect(validate(schemaWithPattern("a".repeat(MAX_PATTERN_LENGTH + 1)))).not.toBeNull();
  });

  it("accepts ordinary constraint patterns", () => {
    expect(validate(schemaWithPattern("^[A-Z]{2}-\\d{4}$"))).toBeNull();
  });

  it("rejects nested-quantifier derived-entity condition patterns", () => {
    const def = {
      fields: { body: { type: "string" } },
      canonical_name_fields: ["body"],
      derived_entities: [
        {
          conditions: [{ field: "body", op: "matches_any_pattern", patterns: [NESTED] }],
          derived_entity_type: "task",
          derived_fields: { title: { value: "t" } },
        },
      ],
    } as unknown as SchemaDefinition;
    const err = validate(def);
    expect(err).not.toBeNull();
    expect(err!.message).toContain("derived_entities[0]");
  });
});

describe("field constraint evaluation", () => {
  it("fails closed and fast on a pre-existing unsafe pattern", async () => {
    const ms = await elapsed(() => {
      const v = checkFieldConstraints("code", SUBJECT, { pattern: NESTED });
      expect(v).not.toBeNull();
      expect(v!.constraint).toBe("pattern");
    });
    expect(ms).toBeLessThan(1000);
  });

  it("keeps ordinary patterns working", () => {
    expect(checkFieldConstraints("code", "AB-1234", { pattern: "^[A-Z]{2}-\\d{4}$" })).toBeNull();
    expect(checkFieldConstraints("code", "AB-12", { pattern: "^[A-Z]{2}-\\d{4}$" })).not.toBeNull();
  });

  it("fails an over-long subject with a clear message", () => {
    const v = checkFieldConstraints("code", "a".repeat(MAX_SUBJECT_LENGTH + 1), {
      pattern: "^a+$",
    });
    expect(v).not.toBeNull();
    expect(v!.message).toContain(String(MAX_SUBJECT_LENGTH));
  });

  it("fails an over-long pattern", () => {
    expect(
      checkFieldConstraints("code", "a", { pattern: "a".repeat(MAX_PATTERN_LENGTH + 1) })
    ).not.toBeNull();
  });
});

describe("derived-entity condition evaluation", () => {
  const cond = (patterns: string[]) => ({
    field: "body",
    op: "matches_any_pattern" as const,
    patterns,
  });

  it("ignores a pre-existing unsafe pattern quickly", async () => {
    const ms = await elapsed(() => {
      expect(evaluateCondition(cond([NESTED]), { body: SUBJECT })).toBe(false);
    });
    expect(ms).toBeLessThan(1000);
  });

  it("keeps ordinary patterns and the substring fallback working", () => {
    expect(evaluateCondition(cond(["^re:\\s"]), { body: "Re: hello" })).toBe(true);
    expect(evaluateCondition(cond(["(unclosed"]), { body: "has (unclosed here" })).toBe(true);
  });

  it("does not match over-long subjects", () => {
    expect(evaluateCondition(cond(["a"]), { body: "a".repeat(MAX_SUBJECT_LENGTH + 1) })).toBe(
      false
    );
  });
});

describe("rendered-page rule evaluation", () => {
  const html = "<p>" + "a".repeat(40) + "!</p>";

  it("skips a rule with an unsafe pattern quickly", async () => {
    const ms = await elapsed(() => {
      const w = checkRenderedPageConformance(html, "", {
        rules: [{ code: "X", pattern: NESTED, mode: "require_absent" }],
      });
      expect(w.map((x) => x.code)).not.toContain("X");
    });
    expect(ms).toBeLessThan(1000);
  });

  it("still evaluates ordinary rules", () => {
    const w = checkRenderedPageConformance(html, "", {
      rules: [{ code: "HAS_P", pattern: "<p>", mode: "require_absent" }],
    });
    expect(w.map((x) => x.code)).toContain("HAS_P");
  });
});

describe("time budget at each sink", () => {
  // Passes validatePattern; evaluation time on a long subject exceeds the budget.
  const SLOW = ".*.*.*.*.*x";
  const LONG = "a".repeat(MAX_SUBJECT_LENGTH);

  it("passes the static rules", () => {
    expect(validatePattern(SLOW).ok).toBe(true);
  });

  it("rejects the value in a field constraint", () => {
    const started = performance.now();
    const v = checkFieldConstraints("code", LONG, { pattern: SLOW });
    expect(performance.now() - started).toBeLessThan(MATCH_TIMEOUT_MS * 5 + 500);
    expect(v).not.toBeNull();
    expect(v!.message).toContain("cannot be evaluated safely");
  });

  it("does not match in a matches_any_pattern condition", () => {
    const started = performance.now();
    expect(
      evaluateCondition(
        { field: "body", op: "matches_any_pattern", patterns: [SLOW] },
        { body: LONG }
      )
    ).toBe(false);
    expect(performance.now() - started).toBeLessThan(MATCH_TIMEOUT_MS * 5 + 500);
  });

  it("skips the rule for a rendered page", () => {
    const html = `<p>${LONG}</p>`;
    const started = performance.now();
    const w = checkRenderedPageConformance(html, "", {
      rules: [{ code: "SLOW_RULE", pattern: SLOW, mode: "require_present" }],
    });
    expect(performance.now() - started).toBeLessThan(MATCH_TIMEOUT_MS * 5 + 500);
    expect(w.map((x) => x.code)).not.toContain("SLOW_RULE");
  });

  it("evaluates ordinary patterns correctly after a timeout", () => {
    expect(safePatternTest(SLOW, LONG).status).toBe("timeout");
    expect(safePatternTest("^[A-Z]{2}-\\d{4}$", "AB-1234").status).toBe("match");
    expect(safePatternTest("^[A-Z]{2}-\\d{4}$", "AB-12").status).toBe("no_match");
    expect(checkFieldConstraints("code", "AB-1234", { pattern: "^[A-Z]{2}-\\d{4}$" })).toBeNull();
  });
});

describe("rendered-page subject cap and flags", () => {
  it("skips a rule when the page exceeds the subject cap", () => {
    const html = "<p>" + "a".repeat(1_000_001) + "</p>";
    const w = checkRenderedPageConformance(html, "", {
      rules: [{ code: "BIG_PAGE", pattern: "<p>", mode: "require_absent" }],
    });
    expect(w.map((x) => x.code)).not.toContain("BIG_PAGE");
    const small = checkRenderedPageConformance("<p>x</p>", "", {
      rules: [{ code: "BIG_PAGE", pattern: "<p>", mode: "require_absent" }],
    });
    expect(small.map((x) => x.code)).toContain("BIG_PAGE");
  });

  it("skips a rule with an unsupported flags value", () => {
    expect(safePatternTest("<p>", "<p>", { flags: "zz" }).status).toBe("invalid_pattern");
    const w = checkRenderedPageConformance("<p>x</p>", "", {
      rules: [{ code: "BAD_FLAGS", pattern: "<p>", flags: "zz", mode: "require_absent" }],
    });
    expect(w.map((x) => x.code)).not.toContain("BAD_FLAGS");
  });
});

describe("flags accepted for rendered-page rules", () => {
  it.each(["i", "m", "s", "u", "im", "iu"])("accepts %s", (flags) => {
    expect(safePatternTest("<p>", "<p>", { flags }).status).toBe("match");
  });

  it.each(["v", "iv", "g", "y", "d", "zz"])("refuses %s", (flags) => {
    expect(safePatternTest("<p>", "<p>", { flags }).status).toBe("invalid_pattern");
    const w = checkRenderedPageConformance("<p>x</p>", "", {
      rules: [{ code: "FLAGGED", pattern: "<p>", flags, mode: "require_absent" }],
    });
    expect(w.map((x) => x.code)).not.toContain("FLAGGED");
  });
});

describe("per-request evaluation budget", () => {
  const LONG = "a".repeat(MAX_SUBJECT_LENGTH);
  const slow = (i: number) => `.*.*.*.*.*x${i}`;

  it("does not run a timed-out pattern again within the same request", async () => {
    await withPatternBudget(async () => {
      expect(safePatternTest(slow(0), LONG).status).toBe("timeout");
      const started = performance.now();
      for (let i = 0; i < 50; i++) {
        expect(safePatternTest(slow(0), LONG).status).toBe("timeout");
      }
      expect(performance.now() - started).toBeLessThan(MATCH_TIMEOUT_MS);
    });
  });

  it("stops evaluating when the shared budget is spent", async () => {
    const statuses: string[] = [];
    const started = performance.now();
    await withPatternBudget(async () => {
      for (let i = 0; i < 40; i++) statuses.push(safePatternTest(slow(i), LONG).status);
    });
    const elapsed = performance.now() - started;
    expect(statuses).toContain("budget_exhausted");
    expect(statuses[statuses.length - 1]).toBe("budget_exhausted");
    // Total time stays within the budget plus one evaluation (and slack).
    expect(elapsed).toBeLessThan(REQUEST_PATTERN_BUDGET_MS + MATCH_TIMEOUT_MS + 500);
  });

  it("applies to constraint checks and derived conditions alike", async () => {
    await withPatternBudget(async () => {
      for (let i = 0; i < 20; i++) safePatternTest(slow(i), LONG);
      const v = checkFieldConstraints("code", "ok", { pattern: "^[a-z]+$" });
      expect(v).not.toBeNull();
      expect(v!.message).toMatch(/evaluation limit/);
      expect(
        evaluateCondition(
          { field: "body", op: "matches_any_pattern", patterns: ["^ok$"] },
          { body: "ok" }
        )
      ).toBe(false);
    });
  });

  it("reuses a result computed earlier in the request", async () => {
    await withPatternBudget(async () => {
      const first = checkFieldConstraints("code", "AB-1", { pattern: "^[A-Z]{2}-\\d{4}$" });
      const second = checkFieldConstraints("code", "AB-1", { pattern: "^[A-Z]{2}-\\d{4}$" });
      expect(first).not.toBeNull();
      expect(second).toEqual(first);
    });
  });

  it("has no effect outside a request", () => {
    expect(safePatternTest("^a+$", "aaa").status).toBe("match");
  });

  it("points the caller at the schema when a stored pattern cannot be evaluated", () => {
    const v = checkFieldConstraints("code", "aaa", { pattern: NESTED });
    expect(v!.message).toContain("cannot be evaluated safely");
    expect(v!.message).toMatch(/Rewrite the pattern in the schema/);
    expect(v!.message).not.toContain(NESTED);
  });
});
