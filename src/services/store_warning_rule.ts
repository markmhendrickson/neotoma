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
 *   - **An unrecognised or malformed condition fails open and legibly.** A
 *     rule this evaluator cannot understand yields a
 *     `STORE_WARNING_RULE_NOT_EVALUATED` warning naming the rule and the exact
 *     path it could not read, and never a thrown error. A schema author gets
 *     told their rule is inert; the writer still gets their write.
 *
 * "Cannot understand" includes a condition the evaluator could *partly* read.
 * A field list is taken whole or not at all: `missing_all_of: ["content", 7]`
 * is not narrowed to `["content"]` and evaluated, because repairing a
 * half-legible declaration by guessing at the author's intent is the same
 * defect this module was written to fix. The list is rejected intact and
 * reported. Likewise a condition carrying an unimplemented sibling key is
 * reported rather than evaluated on its readable half, and the diagnostic
 * names only the keys that are actually unsupported.
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

/**
 * Classification of a declared field list.
 *
 * A list is either usable, absent (the spelling was not declared at all), or
 * malformed. The distinction between *absent* and *malformed* is load-bearing:
 * an earlier revision collapsed both into `null` by filtering non-string
 * entries out of the array, so `["content", 7]` silently became `["content"]`
 * and was evaluated as though the schema author had written it. That is the
 * same defect class this module exists to fix, one level down — a partially
 * understood condition repaired by guessing rather than reported. A list is
 * taken whole or not at all.
 */
type FieldListOutcome =
  | { kind: "ok"; names: string[] }
  | { kind: "absent" }
  | { kind: "malformed"; reason: string };

/**
 * Classify a declared field list without salvaging any part of it.
 *
 * `undefined` is absent — the rule simply did not use this spelling. Anything
 * else that is not a non-empty array of strings is malformed, and the reason
 * names what was actually wrong so the schema author can find it.
 */
function classifyFieldList(value: unknown): FieldListOutcome {
  if (value === undefined) return { kind: "absent" };
  if (!Array.isArray(value)) {
    return {
      kind: "malformed",
      reason: `expected an array of field names, got ${describeType(value)}`,
    };
  }
  if (value.length === 0) {
    return { kind: "malformed", reason: "the list is empty, so it names no field to test" };
  }
  const offenders = value
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => typeof entry !== "string" || entry === "");
  if (offenders.length > 0) {
    const detail = offenders
      .map(({ entry, index }) => `index ${index} (${describeType(entry)})`)
      .join(", ");
    return {
      kind: "malformed",
      reason:
        `the list contains ${offenders.length} entr${offenders.length === 1 ? "y" : "ies"} ` +
        `that ${offenders.length === 1 ? "is" : "are"} not a non-empty field name: ${detail}. ` +
        "The list was rejected intact; no entries were silently discarded",
    };
  }
  return { kind: "ok", names: value as string[] };
}

/** A short, safe description of an unexpected value, for diagnostics. */
function describeType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "string") return value === "" ? "an empty string" : "a string";
  return `a ${typeof value}`;
}

/**
 * Build the fail-open diagnostic for a rule that could not be evaluated.
 *
 * Every such warning names the rule, the specific path that could not be read,
 * and states that the advisory did not block the operation. It deliberately
 * does not claim the entity was persisted: a dry run (`commit: false`) and an
 * independently failed write both reach this path too, and persistence is the
 * caller's `success` / returned ids / read-back to report, not this warning's.
 */
function notEvaluated(code: string, why: string): StoreWarningRuleEvaluation {
  return {
    fired: true,
    code: STORE_WARNING_RULE_NOT_EVALUATED,
    message:
      `Store-warning rule "${code}" declared on this entity type could not be evaluated: ${why}. ` +
      "Correct or remove the rule in the schema; the entity itself does not need to be re-sent " +
      "for this warning alone. This advisory did NOT block the operation.",
    notEvaluated: true,
  };
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
  const flat = classifyFieldList(rule?.fields);
  if (flat.kind === "malformed") {
    return notEvaluated(code, `the \`fields\` list is malformed — ${flat.reason}`);
  }
  if (flat.kind === "ok") {
    const anyPresent = flat.names.some((f) => !isAbsent(fields[f]));
    return { fired: !anyPresent, code, message, notEvaluated: false };
  }

  // Declarative spelling: `condition: { missing_all_of: [...] }`.
  const condition = rule?.condition;
  if (condition !== undefined) {
    if (condition === null || typeof condition !== "object" || Array.isArray(condition)) {
      return notEvaluated(
        code,
        `\`condition\` is malformed — expected an object of condition keys, got ${describeType(condition)}`
      );
    }

    const conditionKeys = Object.keys(condition as Record<string, unknown>);
    const unsupported = conditionKeys.filter(
      (k) => !(SUPPORTED_CONDITION_KEYS as readonly string[]).includes(k)
    );

    // Only evaluate when every declared key is understood. A rule carrying an
    // extra key we do not implement may mean something narrower than the part
    // we can read, so firing on the readable half would be a guess. Report
    // only the keys that are actually unsupported, not the whole condition.
    if (unsupported.length > 0) {
      return notEvaluated(
        code,
        `unrecognised condition ${unsupported.length === 1 ? "key" : "keys"} ` +
          `${JSON.stringify(unsupported)}. Supported condition keys: ` +
          JSON.stringify([...SUPPORTED_CONDITION_KEYS])
      );
    }

    const missingAllOf = classifyFieldList((condition as Record<string, unknown>).missing_all_of);
    if (missingAllOf.kind === "malformed") {
      return notEvaluated(
        code,
        `the \`condition.missing_all_of\` list is malformed — ${missingAllOf.reason}`
      );
    }
    if (missingAllOf.kind === "absent") {
      return notEvaluated(
        code,
        "`condition` declares no recognised condition key. Supported condition keys: " +
          JSON.stringify([...SUPPORTED_CONDITION_KEYS])
      );
    }

    const allAbsent = missingAllOf.names.every((f) => isAbsent(fields[f]));
    return { fired: allAbsent, code, message, notEvaluated: false };
  }

  // Neither spelling present: the rule declares no condition at all.
  return notEvaluated(code, "it declares neither a `fields` list nor a recognised `condition`");
}
