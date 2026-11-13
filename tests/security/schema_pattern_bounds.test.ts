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
  readQuantifier,
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

describe("counted quantifiers of any length", () => {
  const refusedAsShape = (pattern: string) => {
    const v = validatePattern(pattern);
    expect(v.ok).toBe(false);
    expect(!v.ok && v.code).toBe("shape");
    const err = validate(schemaWithPattern(pattern));
    expect(err).toBeInstanceOf(SchemaPatternRefusalError);
    expect((err as SchemaPatternRefusalError).refusal).toBe("shape");
  };

  it.each([
    ["inner, six-digit count", "^(a{1,123456})+$"],
    ["inner, open-ended long count", "^(a{123456,})+$"],
    ["inner, zero-padded counts", "^(a{000001,000002})+$"],
    ["inner, zero-padded open-ended", "^(a{0000001,})*$"],
    ["outer, six-digit count", "^(a+){123456}$"],
    ["outer, zero-padded count", "^(a+){000006}$"],
    ["outer, zero-padded range", "^(a*){0000001,000009}$"],
    ["outer, count beyond the safe integer range", "^(a+){99999999999999999999}$"],
    ["inner, count beyond the safe integer range", "^(a{1,99999999999999999999})+$"],
    // The engine reads a count at its ceiling as having no upper limit, so a
    // fixed count spelled at or above it is open-ended on the inner part.
    ["inner, fixed count at the engine ceiling", "^(a{2147483647})+$"],
    ["inner, zero-padded fixed count at the engine ceiling", "^(a{0002147483647})+$"],
    ["inner, equal range at the engine ceiling", "^(a{2147483647,2147483647})+$"],
  ])("refuses a nested variable quantifier written with %s", (_name, pattern) => {
    refusedAsShape(pattern);
  });

  it.each([
    "^[a-z]{1,100000}$",
    "^a{000100000}$",
    "^(a{3}){100000}$",
    "^(a{000003}){000006}$",
    "^(a{99999999999999999999}){2}$",
    "^(a+){0002}$",
    "^(a{2147483646})+$",
    "^(a{0002147483646,0002147483646})+$",
  ])("accepts a large bounded count on a part that is not repeated: %s", (pattern) => {
    expect(() => new RegExp(pattern)).not.toThrow();
    expect(validatePattern(pattern).ok).toBe(true);
    expect(validate(schemaWithPattern(pattern))).toBeNull();
  });
});

/** Counts around the engine's ceiling (2^31 − 1), plain and zero-padded. */
const BOUNDARY_COUNTS = [
  "2147483646", "2147483647", "2147483648",
  "0002147483646", "0002147483647", "0002147483648",
];
/** The same counts in the fixed `{n}` and `{n,n}` forms. */
const BOUNDARY_FIXED = BOUNDARY_COUNTS.flatMap((n) => [`{${n}}`, `{${n},${n}}`]);

describe("hand-written parser agrees with the engine's grammar", () => {
  // Spellings of a brace after an atom. The engine decides which are quantifiers.
  const SPELLINGS = [
    "{3}", "{3,}", "{2,5}", "{0}", "{0,}", "{0,0}",
    "{003}", "{0003,}", "{000002,000005}", "{1,00000000000000000002}",
    "{123456}", "{123456,}", "{1,123456}", "{99999999999999999999}",
    "{99999999999999999999,}", "{1,99999999999999999999}",
    "{,5}", "{}", "{,}", "{a}", "{1,a}", "{ 1}", "{1 }", "{1,2,3}", "{-1}", "{+1}",
    "{3", "{3,", "{3,5", "{",
    // The engine's count ceiling, 2^31 − 1, and its neighbours, plain and
    // zero-padded, in the fixed `{n}` and `{n,n}` forms.
    ...BOUNDARY_FIXED,
    // A reversed range is a syntax error in the engine.
    "{5,2}", "{2147483647,2147483646}",
    // Both counts at or above the ceiling read as equal, so this is not reversed.
    "{2147483648,2147483647}",
  ];
  const withLazy = SPELLINGS.flatMap((q) => [q, `${q}?`]);
  const baseOf = (q: string) => (q.endsWith("?") ? q.slice(0, -1) : q);

  const engineCompiles = (q: string, flags: string): boolean => {
    try {
      new RegExp(`^a${baseOf(q)}$`, flags);
      return true;
    } catch {
      return false;
    }
  };

  /**
   * The syntax check runs before the parser, so a spelling the engine reports
   * as a syntax error in both modes never reaches readQuantifier. It must be
   * refused as a syntax error instead.
   */
  const expectSyntaxRefusal = (q: string) => {
    const v = validatePattern(`^a${baseOf(q)}$`);
    expect(v.ok).toBe(false);
    expect(!v.ok && v.code).toBe("syntax");
  };

  /** The engine's answer, observed: is the brace a quantifier on `a` in non-unicode mode? */
  const engineSaysQuantifier = (q: string): boolean => {
    const base = baseOf(q);
    // A literal brace makes the spelling part of the matched text; a quantifier
    // consumes it and matches only runs of `a`.
    // Repetition characters inside a literal brace form repeat their neighbour,
    // so the subject is also tried without them.
    const re = new RegExp(`^a${base}$`);
    return !(re.test(`a${base}`) || re.test(`a${base.replace(/[+*?]/g, "")}`));
  };

  it.each(withLazy)("non-unicode mode: %s", (q) => {
    if (!engineCompiles(q, "")) {
      expectSyntaxRefusal(q);
      return;
    }
    const got = readQuantifier(q, 0);
    expect(got !== null).toBe(q.length > 0 && engineSaysQuantifier(q));
    if (got) expect(got.end).toBe(q.length);
  });

  it.each(withLazy)("unicode mode: %s", (q) => {
    if (!engineCompiles(q, "")) {
      expectSyntaxRefusal(q);
      return;
    }
    // a malformed brace is a syntax error in unicode mode only
    const accepted = engineCompiles(q, "u");
    expect(readQuantifier(q, 0) !== null).toBe(accepted);
  });

  it("observes the engine reporting a reversed range as a syntax error", () => {
    for (const q of ["{5,2}", "{2147483647,2147483646}"]) {
      expect(engineCompiles(q, "")).toBe(false);
      expect(engineCompiles(q, "u")).toBe(false);
      expectSyntaxRefusal(q);
    }
  });

  /**
   * The engine's reading of one count, observed through its own ordering check.
   * V8 reads every count at or above 2^31 − 1 as 2^31 − 1, its marker for "no
   * upper limit" (its parse-tree trace prints `{2147483647}` as `2147483647 -`,
   * the same as `{2147483647,}`). A count it reads at that ceiling is out of
   * order against an upper count of 2^31 − 2; any lower count is not.
   */
  const engineReadsAtCeiling = (count: string): boolean =>
    !engineCompiles(`{${count},2147483646}`, "");

  it.each([...BOUNDARY_FIXED, "{2147483648,2147483647}", "{2147483646,2147483647}"])(
    "reads the counts in %s the way the engine does at its ceiling",
    (q) => {
      const [, lo, hi = lo] = /^\{(\d+)(?:,(\d+))?\}$/.exec(q) as RegExpExecArray;
      const got = readQuantifier(q, 0);
      expect(got).not.toBeNull();
      // Lower count: clamped to the ceiling exactly when the engine clamps it.
      expect(got!.min).toBe(engineReadsAtCeiling(lo) ? 2 ** 31 - 1 : Number(lo));
      // Upper count: unbounded exactly when the engine reads it at the ceiling.
      expect(got!.max === Infinity).toBe(engineReadsAtCeiling(hi));
      expect(got!.max === Infinity || got!.max === Number(hi)).toBe(true);
      // A fixed count stays fixed only below the ceiling.
      expect(got!.min === got!.max).toBe(lo === hi && !engineReadsAtCeiling(hi));
      // The parser's ordering agrees with the engine's syntax check.
      expect(got!.min <= got!.max).toBe(engineCompiles(q, ""));
    }
  );

  it("observes the engine's ceiling at 2^31 − 1, with and without padding", () => {
    expect(BOUNDARY_COUNTS.map(engineReadsAtCeiling)).toEqual([
      false, true, true, false, true, true,
    ]);
  });

  it("agrees with the engine on the lengths a short count matches", () => {
    for (const q of ["{3}", "{3,}", "{2,5}", "{0,0}", "{003}", "{000002,000005}"]) {
      const re = new RegExp(`^a${q}$`);
      const lengths = Array.from({ length: 9 }, (_, k) => k).filter((k) => re.test("a".repeat(k)));
      const got = readQuantifier(q, 0);
      expect(got).not.toBeNull();
      expect(lengths[0]).toBe(got!.min);
      expect(lengths[lengths.length - 1]).toBe(Number.isFinite(got!.max) ? got!.max : 8);
    }
  });

  it("reads zero-padded and oversized counts as numbers", () => {
    expect(readQuantifier("{000002,000005}", 0)).toMatchObject({ min: 2, max: 5 });
    expect(readQuantifier("{99999999999999999999}", 0)).toMatchObject({
      min: 2 ** 31 - 1,
      max: Infinity,
    });
    expect(readQuantifier("{2147483646}", 0)).toMatchObject({ min: 2147483646, max: 2147483646 });
    expect(readQuantifier("{2147483647}", 0)).toMatchObject({ min: 2 ** 31 - 1, max: Infinity });
    expect(readQuantifier("{1,99999999999999999999}", 0)).toMatchObject({ min: 1, max: Infinity });
    expect(readQuantifier("{3,}?", 0)).toMatchObject({ min: 3, max: Infinity, end: 5 });
  });

  // Character-class extents. A group after a class is live (a capture exists)
  // unless the engine reads it as class content.
  const CLASSES = [
    "[]", "[^]", "[\\]]", "[a-]", "[]a]", "[a]", "[^a]", "[\\\\]", "[(]", "[(a+)+]",
    "\\[", "\\]", "[\\[]", "[a-z]", "[-a]",
  ];
  it.each(CLASSES)("class spelling %s", (cls) => {
    const pattern = `^${cls}(a+)+x$`;
    const captures = (new RegExp(`${pattern}|`).exec("") as RegExpExecArray).length - 1;
    const v = validatePattern(pattern);
    // A live group with an unbounded inner quantifier is refused; otherwise accepted.
    expect(v.ok).toBe(captures === 0);
    if (!v.ok) expect(v.code).toBe("shape");
    expect(validatePattern(`^${cls}$`).ok).toBe(true);
  });
});
