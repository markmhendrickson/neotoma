/**
 * Unit tests for declarative write-time value constraints (#1756).
 *
 * Pure tests — no DB, no server, no actions.  Covers:
 *   - checkFieldConstraints: each constraint type, pass and fail
 *   - Type-skip behavior (min/max skipped for non-numbers, pattern for non-strings)
 *   - collectConstraintViolations over a mixed field set
 *   - ConstraintViolationError shape
 *   - SchemaRegistryService.validateSchemaDefinition — new constraint validation rules
 */

import { describe, it, expect } from "vitest";
import {
  checkFieldConstraints,
  collectConstraintViolations,
  ConstraintViolationError,
} from "../../src/services/field_constraints.js";
import type { FieldConstraints } from "../../src/services/field_constraints.js";
import { SchemaRegistryService } from "../../src/services/schema_registry.js";
import type { SchemaDefinition } from "../../src/services/schema_registry.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convenience: invoke validateSchemaDefinition via the private backdoor. */
function validateSchemaDef(def: SchemaDefinition): Error | null {
  const registry = new SchemaRegistryService();
  try {
    // @ts-expect-error accessing private method for test purposes
    registry["validateSchemaDefinition"](def);
    return null;
  } catch (err) {
    return err as Error;
  }
}

/** Minimal valid schema with a single numeric field for constraint tests. */
function minimalSchema(
  fields: SchemaDefinition["fields"],
  extra: Partial<SchemaDefinition> = {}
): SchemaDefinition {
  return {
    fields,
    canonical_name_fields: [Object.keys(fields)[0]!],
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// checkFieldConstraints — min
// ---------------------------------------------------------------------------

describe("checkFieldConstraints — min", () => {
  const c: FieldConstraints = { min: 0 };

  it("passes when value equals min (inclusive)", () => {
    expect(checkFieldConstraints("score", 0, c)).toBeNull();
  });

  it("passes when value is above min", () => {
    expect(checkFieldConstraints("score", 1, c)).toBeNull();
  });

  it("returns violation when value is below min", () => {
    const v = checkFieldConstraints("score", -1, c);
    expect(v).not.toBeNull();
    expect(v!.field).toBe("score");
    expect(v!.constraint).toBe("min");
    expect(v!.value).toBe(-1);
    expect(v!.message).toContain("minimum");
  });

  it("bans the sentinel 0.0 when min is 0.001", () => {
    const v = checkFieldConstraints("lat", 0.0, { min: 0.001 });
    expect(v).not.toBeNull();
    expect(v!.constraint).toBe("min");
  });
});

// ---------------------------------------------------------------------------
// checkFieldConstraints — max
// ---------------------------------------------------------------------------

describe("checkFieldConstraints — max", () => {
  const c: FieldConstraints = { max: 100 };

  it("passes when value equals max (inclusive)", () => {
    expect(checkFieldConstraints("score", 100, c)).toBeNull();
  });

  it("passes when value is below max", () => {
    expect(checkFieldConstraints("score", 50, c)).toBeNull();
  });

  it("returns violation when value exceeds max", () => {
    const v = checkFieldConstraints("score", 101, c);
    expect(v).not.toBeNull();
    expect(v!.field).toBe("score");
    expect(v!.constraint).toBe("max");
    expect(v!.value).toBe(101);
    expect(v!.message).toContain("maximum");
  });
});

// ---------------------------------------------------------------------------
// checkFieldConstraints — min + max combined
// ---------------------------------------------------------------------------

describe("checkFieldConstraints — min and max combined", () => {
  const c: FieldConstraints = { min: 1, max: 10 };

  it("passes for value in [1, 10]", () => {
    expect(checkFieldConstraints("n", 5, c)).toBeNull();
    expect(checkFieldConstraints("n", 1, c)).toBeNull();
    expect(checkFieldConstraints("n", 10, c)).toBeNull();
  });

  it("fails for value below min (min is checked first)", () => {
    const v = checkFieldConstraints("n", 0, c);
    expect(v!.constraint).toBe("min");
  });

  it("fails for value above max", () => {
    const v = checkFieldConstraints("n", 11, c);
    expect(v!.constraint).toBe("max");
  });
});

// ---------------------------------------------------------------------------
// checkFieldConstraints — enum
// ---------------------------------------------------------------------------

describe("checkFieldConstraints — enum", () => {
  const c: FieldConstraints = { enum: ["active", "archived", "draft"] };

  it("passes when value is in the enum", () => {
    expect(checkFieldConstraints("status", "active", c)).toBeNull();
    expect(checkFieldConstraints("status", "archived", c)).toBeNull();
  });

  it("returns violation when value is not in the enum", () => {
    const v = checkFieldConstraints("status", "deleted", c);
    expect(v).not.toBeNull();
    expect(v!.constraint).toBe("enum");
    expect(v!.message).toContain("allowed set");
  });

  it("numeric enum passes for matching number", () => {
    const nc: FieldConstraints = { enum: [1, 2, 3] };
    expect(checkFieldConstraints("tier", 2, nc)).toBeNull();
  });

  it("numeric enum fails for number not in list", () => {
    const nc: FieldConstraints = { enum: [1, 2, 3] };
    const v = checkFieldConstraints("tier", 4, nc);
    expect(v!.constraint).toBe("enum");
  });

  it("does NOT match string '1' to numeric enum entry 1", () => {
    const nc: FieldConstraints = { enum: [1, 2, 3] };
    // "1" (string) should NOT match 1 (number) — strict-typed
    const v = checkFieldConstraints("tier", "1" as unknown as number, nc);
    expect(v!.constraint).toBe("enum");
  });
});

// ---------------------------------------------------------------------------
// checkFieldConstraints — pattern
// ---------------------------------------------------------------------------

describe("checkFieldConstraints — pattern", () => {
  const c: FieldConstraints = { pattern: "^\\d{4}-\\d{2}-\\d{2}$" };

  it("passes when string matches pattern", () => {
    expect(checkFieldConstraints("date", "2026-06-24", c)).toBeNull();
  });

  it("returns violation when string does not match pattern", () => {
    const v = checkFieldConstraints("date", "24-06-2026", c);
    expect(v).not.toBeNull();
    expect(v!.constraint).toBe("pattern");
    expect(v!.message).toContain("pattern");
  });

  it("skips pattern check for non-string values", () => {
    // A number value with a string pattern constraint should be silently skipped
    expect(checkFieldConstraints("date", 20260624, c)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// checkFieldConstraints — banned
// ---------------------------------------------------------------------------

describe("checkFieldConstraints — banned", () => {
  const c: FieldConstraints = { banned: [0, -1] };

  it("passes when value is not banned", () => {
    expect(checkFieldConstraints("amount", 5, c)).toBeNull();
    expect(checkFieldConstraints("amount", 0.001, c)).toBeNull();
  });

  it("returns violation when value is banned", () => {
    const v = checkFieldConstraints("amount", 0, c);
    expect(v).not.toBeNull();
    expect(v!.constraint).toBe("banned");
    expect(v!.message).toContain("disallowed");
  });

  it("bans the sentinel -1", () => {
    const v = checkFieldConstraints("amount", -1, c);
    expect(v!.constraint).toBe("banned");
  });

  it("string banned list works", () => {
    const sc: FieldConstraints = { banned: ["N/A", "n/a"] };
    const v = checkFieldConstraints("name", "N/A", sc);
    expect(v!.constraint).toBe("banned");
  });

  it("does NOT falsely ban string '0' when only number 0 is banned", () => {
    const v = checkFieldConstraints("amount", "0" as unknown as number, c);
    // "0" (string) ≠ 0 (number) — strict-typed; should pass
    expect(v).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Type-skip behavior
// ---------------------------------------------------------------------------

describe("checkFieldConstraints — type-skip behavior", () => {
  it("skips min/max for string values", () => {
    const c: FieldConstraints = { min: 0, max: 100 };
    expect(checkFieldConstraints("label", "hello", c)).toBeNull();
  });

  it("skips min/max for null values", () => {
    const c: FieldConstraints = { min: 0 };
    expect(checkFieldConstraints("score", null, c)).toBeNull();
  });

  it("skips pattern for number values", () => {
    const c: FieldConstraints = { pattern: "^\\d+$" };
    expect(checkFieldConstraints("code", 123, c)).toBeNull();
  });

  it("applies enum regardless of JS type (and fails cross-type)", () => {
    const c: FieldConstraints = { enum: ["x", "y"] };
    // number 1 is not in string enum — fails
    const v = checkFieldConstraints("f", 1 as unknown as string, c);
    expect(v!.constraint).toBe("enum");
  });

  it("applies banned regardless of JS type (strict-typed, cross-type miss)", () => {
    const c: FieldConstraints = { banned: [0] };
    // string "0" is not banned — strict-typed
    expect(checkFieldConstraints("f", "0" as unknown as number, c)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// collectConstraintViolations
// ---------------------------------------------------------------------------

describe("collectConstraintViolations — batch field set", () => {
  const schemaFields = {
    score: { type: "number" as const, constraints: { min: 0, max: 100 } },
    status: {
      type: "string" as const,
      constraints: { enum: ["active", "archived"] as Array<string | number> },
    },
    name: { type: "string" as const }, // no constraints
    amount: { type: "number" as const, constraints: { banned: [0] as Array<string | number> } },
  };

  it("returns empty array when all fields pass", () => {
    const violations = collectConstraintViolations(
      { score: 50, status: "active", name: "Acme", amount: 100 },
      schemaFields
    );
    expect(violations).toHaveLength(0);
  });

  it("returns one violation per failing field", () => {
    const violations = collectConstraintViolations(
      { score: 150, status: "deleted", amount: 0 },
      schemaFields
    );
    expect(violations).toHaveLength(3);
    expect(violations.map((v) => v.field).sort()).toEqual(["amount", "score", "status"]);
  });

  it("skips fields absent from the payload", () => {
    // Only 'score' is in the payload; status is absent → only score checked
    const violations = collectConstraintViolations({ score: -10 }, schemaFields);
    expect(violations).toHaveLength(1);
    expect(violations[0].field).toBe("score");
  });

  it("skips fields with no constraints declared", () => {
    const violations = collectConstraintViolations({ name: "Acme Corp" }, schemaFields);
    expect(violations).toHaveLength(0);
  });

  it("skips undefined values", () => {
    const violations = collectConstraintViolations(
      { score: undefined } as Record<string, unknown>,
      schemaFields
    );
    expect(violations).toHaveLength(0);
  });

  it("checks fields with constraints even when field is not in declared schema list", () => {
    // collectConstraintViolations iterates schemaFields, not fields — absent fields skipped
    const violations = collectConstraintViolations({}, schemaFields);
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ConstraintViolationError
// ---------------------------------------------------------------------------

describe("ConstraintViolationError", () => {
  it("has the stable error code ERR_CONSTRAINT_VIOLATION", () => {
    const err = new ConstraintViolationError([
      { field: "score", constraint: "min", message: "too low", value: -1 },
    ]);
    expect(err.code).toBe("ERR_CONSTRAINT_VIOLATION");
  });

  it("is instanceof Error", () => {
    const err = new ConstraintViolationError([
      { field: "score", constraint: "min", message: "too low", value: -1 },
    ]);
    expect(err).toBeInstanceOf(Error);
  });

  it("stores the violations array", () => {
    const violation = { field: "score", constraint: "min" as const, message: "too low", value: -1 };
    const err = new ConstraintViolationError([violation]);
    expect(err.violations).toHaveLength(1);
    expect(err.violations[0]).toEqual(violation);
  });

  it("message includes field name, constraint, and value", () => {
    const err = new ConstraintViolationError([
      { field: "amount", constraint: "banned", message: "disallowed", value: 0 },
    ]);
    expect(err.message).toContain("amount");
    expect(err.message).toContain("banned");
    expect(err.message).toContain("0");
  });

  it("includes all violations in message for multi-field failure", () => {
    const err = new ConstraintViolationError([
      { field: "score", constraint: "min" as const, message: "too low", value: -1 },
      { field: "status", constraint: "enum" as const, message: "bad value", value: "deleted" },
    ]);
    expect(err.message).toContain("score");
    expect(err.message).toContain("status");
  });
});

// ---------------------------------------------------------------------------
// SchemaRegistryService.validateSchemaDefinition — new constraint rules
// ---------------------------------------------------------------------------

describe("validateSchemaDefinition — constraint_violation_policy", () => {
  it("accepts 'reject'", () => {
    const err = validateSchemaDef(
      minimalSchema({ score: { type: "number" } }, { constraint_violation_policy: "reject" })
    );
    expect(err).toBeNull();
  });

  it("accepts 'warn'", () => {
    const err = validateSchemaDef(
      minimalSchema({ score: { type: "number" } }, { constraint_violation_policy: "warn" })
    );
    expect(err).toBeNull();
  });

  it("rejects unknown constraint_violation_policy value", () => {
    const err = validateSchemaDef(
      minimalSchema(
        { score: { type: "number" } },
        { constraint_violation_policy: "ignore" as "warn" }
      )
    );
    expect(err).not.toBeNull();
    expect(err!.message).toMatch(/constraint_violation_policy/);
  });

  it("accepts omitted constraint_violation_policy", () => {
    const err = validateSchemaDef(minimalSchema({ score: { type: "number" } }));
    expect(err).toBeNull();
  });
});

describe("validateSchemaDefinition — field constraints", () => {
  it("accepts valid min/max on a number field", () => {
    const err = validateSchemaDef(
      minimalSchema({
        score: { type: "number", constraints: { min: 0, max: 100 } },
      })
    );
    expect(err).toBeNull();
  });

  it("rejects min > max", () => {
    const err = validateSchemaDef(
      minimalSchema({
        score: { type: "number", constraints: { min: 100, max: 0 } },
      })
    );
    expect(err).not.toBeNull();
    expect(err!.message).toMatch(/min.*<=.*max|min \(100\)/);
  });

  it("rejects min on a non-number field", () => {
    const err = validateSchemaDef(
      minimalSchema({
        label: { type: "string", constraints: { min: 0 } as FieldConstraints },
      })
    );
    expect(err).not.toBeNull();
    expect(err!.message).toContain("number");
  });

  it("rejects max on a non-number field", () => {
    const err = validateSchemaDef(
      minimalSchema({
        label: { type: "string", constraints: { max: 100 } as FieldConstraints },
      })
    );
    expect(err).not.toBeNull();
    expect(err!.message).toContain("number");
  });

  it("accepts valid enum on any field type", () => {
    const err = validateSchemaDef(
      minimalSchema({
        status: {
          type: "string",
          constraints: { enum: ["active", "archived"] },
        },
      })
    );
    expect(err).toBeNull();
  });

  it("rejects empty enum array", () => {
    const err = validateSchemaDef(
      minimalSchema({
        status: {
          type: "string",
          constraints: { enum: [] },
        },
      })
    );
    expect(err).not.toBeNull();
    expect(err!.message).toContain("non-empty array");
  });

  it("accepts valid banned list", () => {
    const err = validateSchemaDef(
      minimalSchema({
        amount: {
          type: "number",
          constraints: { banned: [0] },
        },
      })
    );
    expect(err).toBeNull();
  });

  it("rejects empty banned array", () => {
    const err = validateSchemaDef(
      minimalSchema({
        amount: {
          type: "number",
          constraints: { banned: [] },
        },
      })
    );
    expect(err).not.toBeNull();
    expect(err!.message).toContain("non-empty array");
  });

  it("accepts valid pattern on a string field", () => {
    const err = validateSchemaDef(
      minimalSchema({
        iso_date: {
          type: "string",
          constraints: { pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        },
      })
    );
    expect(err).toBeNull();
  });

  it("rejects invalid regex pattern", () => {
    const err = validateSchemaDef(
      minimalSchema({
        code: {
          type: "string",
          constraints: { pattern: "[invalid(" },
        },
      })
    );
    expect(err).not.toBeNull();
    expect(err!.message).toContain("valid regular expression");
  });

  it("rejects pattern on a non-string field", () => {
    const err = validateSchemaDef(
      minimalSchema({
        score: {
          type: "number",
          constraints: { pattern: "\\d+" } as FieldConstraints,
        },
      })
    );
    expect(err).not.toBeNull();
    expect(err!.message).toContain("string");
  });

  it("accepts constraints object with only banned — no min/max required", () => {
    const err = validateSchemaDef(
      minimalSchema({
        amount: {
          type: "number",
          constraints: { banned: [0, -1] },
        },
      })
    );
    expect(err).toBeNull();
  });
});
