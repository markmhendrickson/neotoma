/**
 * Bounds on caller-supplied regular expressions in schema constraints,
 * derived-entity conditions and rendered-page rules.
 */

import { describe, it, expect } from "vitest";
import {
  MAX_PATTERN_LENGTH,
  MAX_SUBJECT_LENGTH,
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

function validate(def: SchemaDefinition): Error | null {
  const registry = new SchemaRegistryService();
  try {
    // @ts-expect-error private method used for test purposes
    registry["validateSchemaDefinition"](def);
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

  it("bounds the remaining super-linear shapes by time", async () => {
    // Passes static validation (no nesting), but is polynomial in the subject.
    const pattern = ".*.*.*.*.*x";
    expect(validatePattern(pattern).ok).toBe(true);
    const ms = await elapsed(() => {
      const r = safePatternTest(pattern, "a".repeat(MAX_SUBJECT_LENGTH));
      expect(["timeout", "no_match"]).toContain(r.status);
    });
    expect(ms).toBeLessThan(1000);
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
