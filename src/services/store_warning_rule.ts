/**
 * Evaluation of schema-declared `store_warnings` rules.
 *
 * A `store_warnings` rule is advisory by definition: its entire purpose is to
 * append a non-blocking message to the store response. Before this module the
 * two store paths (`src/actions.ts`, `src/server.ts`) each inlined the same
 * one-line evaluation — `rule.fields.some(...)` — which made two assumptions
 * that a registered schema is under no obligation to satisfy:
 *
 *   1. that every rule spells its condition as a flat `fields: string[]`, and
 *   2. that `rule.fields` is present at all.
 *
 * Schemas registered through `register_schema` carry whatever shape the
 * registering caller wrote. A rule that spells its condition declaratively —
 * `condition: { missing_all_of: ["content"] }` — has no `fields` key, so
 * `rule.fields.some(...)` threw `TypeError: Cannot read properties of
 * undefined (reading 'some')`. That throw escaped the store handler and
 * surfaced to callers as `DB_QUERY_FAILED`, which made an advisory warning
 * rule an unconditional, undiagnosable write failure for every entity of that
 * type — on `commit: false` dry runs too, since the evaluator runs before the
 * commit decision. See issues #2067, #2165, #2170.
 *
 * Two properties follow from "a warning must not be able to block a write",
 * and this module exists to hold both in one place:
 *
 *   - **`missing_all_of` is supported.** It is not a new concept; it is the
 *     declarative spelling of the condition the inline code already
 *     implemented (fire when none of the named fields carry a value). Both
 *     spellings evaluate identically.
 *   - **An unrecognised condition fails open and legibly.** A rule this
 *     evaluator cannot understand yields a
 *     `STORE_WARNING_RULE_NOT_EVALUATED` warning naming the rule and the keys
 *     it did not recognise, and never a thrown error. A schema author gets
 *     told their rule is inert; the writer still gets their write.
 */

/**
 * One schema-declared store-warning rule, as it arrives from the registry.
 *
 * Deliberately permissive: these values come from `register_schema` callers
 * and from rows written by earlier versions of the schema language, so the
 * evaluator must treat every field as untrusted rather than assume the
 * declared TypeScript shape held at write time.
 */
export interface StoreWarningRuleInput {
  code?: unknown;
  message?: unknown;
  /** Legacy/flat spelling: fire when none of these fields carry a value. */
  fields?: unknown;
  /** Declarative spelling, e.g. `{ missing_all_of: ["content"] }`. */
  condition?: unknown;
  [key: string]: unknown;
}

/** Outcome of evaluating one rule. */
export interface StoreWarningRuleEvaluation {
  /** Whether the rule's condition is met and its warning should be emitted. */
  fired: boolean;
  /** Warning code to emit. */
  code: string;
  /** Warning message to emit. */
  message: string;
  /**
   * True when the rule could not be evaluated and this is the fail-open
   * diagnostic rather than the rule's own warning. Callers may use this to
   * log or meter inert rules; the emission path is otherwise identical.
   */
  notEvaluated: boolean;
}

/**
 * Warning code emitted when a rule's condition cannot be evaluated. Distinct
 * from the rule's own `code` so an inert rule is never mistaken for a fired
 * one by anything counting warning codes.
 */
export const STORE_WARNING_RULE_NOT_EVALUATED = "STORE_WARNING_RULE_NOT_EVALUATED";

/** Condition keys this evaluator understands. Extend deliberately. */
export const SUPPORTED_CONDITION_KEYS = ["missing_all_of"] as const;

/** A field counts as absent when it is undefined, null, or the empty string. */
function isAbsent(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

/** Narrow an unknown to a string[] of at least one entry. */
function asFieldList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const names = value.filter((v): v is string => typeof v === "string");
  return names.length > 0 ? names : null;
}

/**
 * Evaluate one schema-declared store-warning rule against a stored payload.
 *
 * Never throws. A rule that cannot be evaluated returns a
 * `STORE_WARNING_RULE_NOT_EVALUATED` evaluation with `fired: true`, so the
 * condition is surfaced to the caller rather than swallowed — an inert rule
 * that nobody can see is how this defect stayed invisible.
 *
 * @param rule   The rule as declared on the active schema.
 * @param fields The resolved field values of the observation being stored.
 */
export function evaluateStoreWarningRule(
  rule: StoreWarningRuleInput,
  fields: Record<string, unknown>
): StoreWarningRuleEvaluation {
  const code = typeof rule?.code === "string" && rule.code ? rule.code : "STORE_WARNING";
  const message = typeof rule?.message === "string" ? rule.message : "";

  // Flat spelling: `fields: [...]` — fire when none carry a value.
  const flat = asFieldList(rule?.fields);
  if (flat) {
    const anyPresent = flat.some((f) => !isAbsent(fields[f]));
    return { fired: !anyPresent, code, message, notEvaluated: false };
  }

  // Declarative spelling: `condition: { missing_all_of: [...] }`.
  const condition = rule?.condition;
  if (condition && typeof condition === "object" && !Array.isArray(condition)) {
    const conditionKeys = Object.keys(condition as Record<string, unknown>);
    const missingAllOf = asFieldList((condition as Record<string, unknown>).missing_all_of);
    const unsupported = conditionKeys.filter(
      (k) => !(SUPPORTED_CONDITION_KEYS as readonly string[]).includes(k)
    );

    // Only evaluate when every declared key is understood. A rule carrying an
    // extra key we do not implement may mean something narrower than the part
    // we can read, so firing on the readable half would be a guess. Report it
    // instead.
    if (missingAllOf && unsupported.length === 0) {
      const allAbsent = missingAllOf.every((f) => isAbsent(fields[f]));
      return { fired: allAbsent, code, message, notEvaluated: false };
    }

    return {
      fired: true,
      code: STORE_WARNING_RULE_NOT_EVALUATED,
      message:
        `Store-warning rule "${code}" declared on this entity type could not be evaluated: ` +
        `unrecognised condition ${JSON.stringify(conditionKeys)}. ` +
        `Supported condition keys: ${JSON.stringify([...SUPPORTED_CONDITION_KEYS])}. ` +
        "The write was NOT blocked; the rule is inert until the schema is corrected.",
      notEvaluated: true,
    };
  }

  // Neither spelling present: the rule declares no condition at all.
  return {
    fired: true,
    code: STORE_WARNING_RULE_NOT_EVALUATED,
    message:
      `Store-warning rule "${code}" declared on this entity type could not be evaluated: ` +
      "it declares neither a `fields` list nor a recognised `condition`. " +
      "The write was NOT blocked; the rule is inert until the schema is corrected.",
    notEvaluated: true,
  };
}
