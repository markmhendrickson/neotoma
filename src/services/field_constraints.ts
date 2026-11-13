/**
 * Declarative write-time value constraints for schema fields (#1756).
 *
 * This module is pure (no DB, no imports from the rest of the stack) so it can
 * be unit-tested in isolation and imported from both `server.ts` and `actions.ts`
 * without introducing circular dependencies.
 */

import type { FieldConstraints, FieldDefinition } from "./schema_registry.js";
import { safePatternTest } from "./safe_pattern.js";
import { logger } from "../utils/logger.js";

// Re-export so callers that import from this module can reference the types.
export type { FieldConstraints } from "./schema_registry.js";

// ---------------------------------------------------------------------------
// ConstraintViolation
// ---------------------------------------------------------------------------

export interface ConstraintViolation {
  /** The name of the field whose value failed a constraint. */
  field: string;
  /** The specific constraint that was violated. */
  constraint: "min" | "max" | "enum" | "pattern" | "banned";
  /** Human-readable description of the violation. */
  message: string;
  /** The actual value that violated the constraint. */
  value: unknown;
}

/** Optional identification used only in log lines about unusable patterns. */
export interface ConstraintContext {
  entityType?: string;
  schemaVersion?: string;
}

// ---------------------------------------------------------------------------
// checkFieldConstraints — single-field, single-violation (first match wins)
// ---------------------------------------------------------------------------

/**
 * Check a single value against its declared constraints.
 *
 * Returns the first `ConstraintViolation` found, or `null` when the value
 * satisfies all declared constraints.  Checks that are semantically
 * inapplicable to the value's runtime type are silently skipped (e.g. `min`
 * and `max` are only meaningful for numbers; `pattern` is only meaningful for
 * strings).
 */
export function checkFieldConstraints(
  fieldName: string,
  value: unknown,
  constraints: FieldConstraints,
  context?: ConstraintContext
): ConstraintViolation | null {
  // --- numeric bounds ---
  if (typeof value === "number") {
    if (constraints.min !== undefined && value < constraints.min) {
      return {
        field: fieldName,
        constraint: "min",
        message: `Field "${fieldName}" value ${value} is below the minimum allowed value of ${constraints.min}.`,
        value,
      };
    }
    if (constraints.max !== undefined && value > constraints.max) {
      return {
        field: fieldName,
        constraint: "max",
        message: `Field "${fieldName}" value ${value} exceeds the maximum allowed value of ${constraints.max}.`,
        value,
      };
    }
  }

  // --- pattern (strings only) ---
  if (typeof value === "string" && constraints.pattern !== undefined) {
    const res = safePatternTest(constraints.pattern, value);
    if (res.status === "no_match") {
      return {
        field: fieldName,
        constraint: "pattern",
        message: `Field "${fieldName}" value "${value}" does not match the required pattern /${constraints.pattern}/.`,
        value,
      };
    }
    if (res.status === "subject_too_long") {
      return {
        field: fieldName,
        constraint: "pattern",
        message: `Field "${fieldName}" value exceeds ${res.limit} characters and cannot be checked against its pattern constraint.`,
        value: undefined,
      };
    }
    if (res.status === "invalid_pattern" || res.status === "timeout") {
      // Fail closed: a stored pattern that is no longer acceptable rejects the value.
      logger.warn(
        `[FIELD_CONSTRAINTS] Pattern constraint on field "${fieldName}" ` +
          `(entity_type=${context?.entityType ?? "unknown"}, schema_version=${context?.schemaVersion ?? "unknown"}) ` +
          `is unusable (${res.status === "timeout" ? "evaluation budget exceeded" : res.reason}); value rejected.`
      );
      return {
        field: fieldName,
        constraint: "pattern",
        message: `Field "${fieldName}" has a pattern constraint that cannot be evaluated safely; the value was not accepted.`,
        value: undefined,
      };
    }
  }

  // --- enum (allowed values — any type, loose equality) ---
  if (constraints.enum !== undefined) {
    const allowed = constraints.enum;
    // Use loose equality so number 1 matches "1" only if the caller put both in the list;
    // strict-ish: compare numeric value to numeric enum entries and string to string entries.
    const matches = allowed.some((a) => strictishEqual(a, value));
    if (!matches) {
      return {
        field: fieldName,
        constraint: "enum",
        message:
          `Field "${fieldName}" value ${JSON.stringify(value)} is not in the allowed set: ` +
          `[${allowed.map((a) => JSON.stringify(a)).join(", ")}].`,
        value,
      };
    }
  }

  // --- banned (disallowed values — any type) ---
  if (constraints.banned !== undefined) {
    const found = constraints.banned.some((b) => strictishEqual(b, value));
    if (found) {
      return {
        field: fieldName,
        constraint: "banned",
        message: `Field "${fieldName}" value ${JSON.stringify(value)} is explicitly disallowed.`,
        value,
      };
    }
  }

  return null;
}

/**
 * Strict-ish equality: same type → === ; number vs string of the same numeric
 * value → NOT equal (avoids false-positive sentinel matches across types).
 */
function strictishEqual(a: string | number, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (typeof a === "string" && typeof b === "string") return a === b;
  // Cross-type: treat as not equal
  return false;
}

// ---------------------------------------------------------------------------
// collectConstraintViolations — batch over a fields dict
// ---------------------------------------------------------------------------

/**
 * Run `checkFieldConstraints` for every field in `fields` that declares
 * `constraints` on its `FieldDefinition`.  Only fields that are present in
 * `fields` are checked; absent / undefined values are skipped (constraint
 * checks are value-presence-scoped, not required-field checks).
 *
 * Returns an array of all violations found (one entry per violated
 * field/constraint pair — currently at most one per field because
 * `checkFieldConstraints` returns the first violation).
 */
export function collectConstraintViolations(
  fields: Record<string, unknown>,
  schemaFields: Record<string, FieldDefinition>,
  context?: ConstraintContext
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  for (const [fieldName, fieldDef] of Object.entries(schemaFields)) {
    if (!fieldDef.constraints) continue;
    // Only check fields that are present on the incoming payload.
    if (!(fieldName in fields)) continue;
    const value = fields[fieldName];
    if (value === undefined) continue;
    const violation = checkFieldConstraints(fieldName, value, fieldDef.constraints, context);
    if (violation !== null) {
      violations.push(violation);
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// ConstraintViolationError
// ---------------------------------------------------------------------------

/**
 * Thrown by the store path when `constraint_violation_policy` is `"reject"`
 * and at least one constraint violation is found.
 *
 * The `code` property is a stable machine-readable identifier that is surfaced
 * in structured error responses alongside the per-field violation list.
 */
export class ConstraintViolationError extends Error {
  readonly code = "ERR_CONSTRAINT_VIOLATION" as const;
  readonly violations: ConstraintViolation[];

  constructor(violations: ConstraintViolation[]) {
    const summary = violations
      .map((v) => `"${v.field}" (${v.constraint}: ${JSON.stringify(v.value)})`)
      .join(", ");
    super(`Constraint violation(s) on field(s): ${summary}`);
    this.name = "ConstraintViolationError";
    this.violations = violations;
  }
}
