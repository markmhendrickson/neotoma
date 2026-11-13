/**
 * Bounded evaluation of caller-supplied regular expressions.
 *
 * Schema constraints, derived-entity conditions and tenant rendering rules all
 * carry regular-expression sources authored by callers. This module is the single
 * place such sources are validated and evaluated. It is dependency-free.
 *
 * Policy (fail closed):
 *   - A pattern longer than MAX_PATTERN_LENGTH is invalid.
 *   - A subject longer than the subject cap is not evaluated and does not match.
 *   - Patterns with nested variable quantifiers, quantified alternations whose
 *     branches begin identically, or backreferences are invalid.
 *   - Evaluation runs under a wall-clock budget; exceeding it is "timeout".
 *   - Invalid, over-long and timed-out evaluations never report a match.
 */

import vm from "node:vm";
import { AsyncLocalStorage } from "node:async_hooks";

export const MAX_PATTERN_LENGTH = 256;
export const MAX_SUBJECT_LENGTH = 10_000;
/** Wall-clock budget for a single evaluation, in milliseconds. */
export const MATCH_TIMEOUT_MS = 100;

/** Per-schema and per-request counts accepted at registration and evaluation. */
export const MAX_PATTERNS_PER_CONDITION = 16;
export const MAX_PATTERNS_PER_SCHEMA = 64;
export const MAX_CONFORMANCE_RULES_PER_PAGE = 32;
/** Total evaluation time shared by every pattern check made for one store request, in milliseconds. */
export const REQUEST_PATTERN_BUDGET_MS = 1_500;
/** Flags accepted by safePatternTest. */
const ALLOWED_FLAGS = /^[imsu]*$/;
/** Subjects up to this length have their result remembered for the rest of the request. */
const RESULT_CACHE_SUBJECT_MAX = 2_048;
/** Total wall-clock budget shared by all rules evaluated for one page, in milliseconds. */
export const CONFORMANCE_TOTAL_BUDGET_MS = 1_000;

export type PatternRefusalCode = "syntax" | "shape" | "length";

/**
 * Raised when schema registration refuses a pattern or a pattern count. Carries
 * the refusal kind and the rewrite guidance separately from the message, so API
 * layers can return the guidance as a structured hint.
 */
export class SchemaPatternRefusalError extends Error {
  readonly code = "SCHEMA_PATTERN_REFUSED";
  constructor(
    message: string,
    readonly refusal: PatternRefusalCode | "count",
    readonly remedy: string
  ) {
    super(message);
    this.name = "SchemaPatternRefusalError";
  }
}

export type PatternValidation =
  | { ok: true }
  | { ok: false; code: PatternRefusalCode; reason: string; remedy: string };

/** One-line message for a refusal, naming what to change. Never includes the pattern. */
export function describePatternRefusal(v: Extract<PatternValidation, { ok: false }>): string {
  return `${v.reason}. ${v.remedy}`;
}

export type SafeTestResult =
  | { status: "match" }
  | { status: "no_match" }
  | { status: "invalid_pattern"; code: PatternRefusalCode; reason: string }
  | { status: "subject_too_long"; limit: number }
  | { status: "timeout" }
  | { status: "budget_exhausted" };

export interface Quant {
  min: number;
  max: number; // Infinity when unbounded
  end: number; // index just past the quantifier (including lazy marker)
}

interface Frame {
  hasVariable: boolean;
  branchStarts: string[];
  currentStart: string | null;
  currentEmpty: boolean;
}

function newFrame(): Frame {
  return { hasVariable: false, branchStarts: [], currentStart: null, currentEmpty: true };
}

/**
 * The engine's count ceiling, 2^31 − 1. V8 reads any count at or above this
 * value as exactly this value, and a repeat whose upper count is this value has
 * no upper limit. So `{2147483647}` and `{2147483647,2147483647}` repeat at
 * least 2^31 − 1 times with no maximum, while `{2147483646}` is a fixed count.
 * readQuantifier applies the same rule: a count at or above the ceiling clamps
 * to it on the lower side and is unbounded on the upper side.
 */
const COUNT_CAP = 2 ** 31 - 1;

/**
 * A counted quantifier, following the engine's grammar in non-unicode mode: a
 * brace is a quantifier only as `{n}`, `{n,}` or `{n,m}`, where each count is
 * one or more decimal digits of any length (leading zeros included). Any other
 * brace form (`{}`, `{,m}`, `{a}`, an unterminated `{n,m`) is literal text.
 */
const COUNTED_QUANTIFIER = /\{(\d+)(?:(,)(\d*))?\}/y;

/**
 * Parse a quantifier starting at `i`, or return null when none starts there.
 * Exported so the grammar tests can compare it with the engine's own parsing.
 */
export function readQuantifier(p: string, i: number): Quant | null {
  const c = p[i];
  let min: number;
  let max: number;
  let end: number;
  if (c === "*") {
    min = 0;
    max = Infinity;
    end = i + 1;
  } else if (c === "+") {
    min = 1;
    max = Infinity;
    end = i + 1;
  } else if (c === "?") {
    min = 0;
    max = 1;
    end = i + 1;
  } else if (c === "{") {
    COUNTED_QUANTIFIER.lastIndex = i;
    const m = COUNTED_QUANTIFIER.exec(p);
    if (!m) return null;
    // Compare as integers of unbounded size, then map onto the engine's ceiling:
    // a count at or above COUNT_CAP is COUNT_CAP as a minimum and unbounded as
    // a maximum, for the fixed `{n}` form as well as the range forms.
    const cap = BigInt(COUNT_CAP);
    const lower = (v: bigint) => (v >= cap ? COUNT_CAP : Number(v));
    const upper = (v: bigint) => (v >= cap ? Infinity : Number(v));
    const lo = BigInt(m[1]);
    min = lower(lo);
    if (m[2] === undefined) {
      max = upper(lo);
    } else if (m[3] === "") {
      max = Infinity;
    } else {
      max = upper(BigInt(m[3]));
    }
    end = i + m[0].length;
  } else {
    return null;
  }
  if (p[end] === "?") end += 1; // lazy marker
  return { min, max, end };
}

const MAX_OUTER_REPEAT_WITH_VARIABLE_INNER = 5;
const MAX_GROUP_DEPTH = 20;

const REMEDY = {
  backref: "Remove the backreference and match the repeated text with an explicit group instead.",
  nested: "Use a bounded count such as {1,32} on the inner part, or remove the inner quantifier.",
  alternation:
    "Make the alternation branches distinct (for example by anchoring each with different leading text), or remove the repetition around them.",
  structure: "Check the pattern for unbalanced parentheses or an unfinished character class.",
  depth: "Flatten the pattern so groups are nested at most 20 deep.",
  classes: "Escape any literal [ inside a character class as \\[.",
};

function shape(reason: string, remedy: string): PatternValidation {
  return { ok: false, code: "shape", reason, remedy };
}

function analyze(pattern: string): PatternValidation {
  const stack: Frame[] = [newFrame()];
  const top = () => stack[stack.length - 1];
  let i = 0;
  const n = pattern.length;

  const noteAtom = (token: string) => {
    const f = top();
    if (f.currentStart === null) f.currentStart = token;
    f.currentEmpty = false;
  };

  while (i < n) {
    const c = pattern[i];
    let atomToken: string | null = null;
    let atomEnd = i + 1;
    let closedFrame: Frame | null = null;

    if (c === "\\") {
      const next = pattern[i + 1];
      if (next === undefined) return shape("trailing escape", REMEDY.structure);
      if (/[1-9]/.test(next) || (next === "k" && pattern[i + 2] === "<")) {
        return shape("backreferences are not allowed", REMEDY.backref);
      }
      atomToken = pattern.slice(i, i + 2);
      atomEnd = i + 2;
    } else if (c === "[") {
      // `[]` and `[^]` are complete classes in JavaScript, so a `]` directly
      // after the opening bracket closes the class.
      let j = i + 1;
      if (pattern[j] === "^") j += 1;
      while (j < n && pattern[j] !== "]") {
        if (pattern[j] === "[") {
          return shape("nested character classes are not allowed", REMEDY.classes);
        }
        j += pattern[j] === "\\" ? 2 : 1;
      }
      if (j >= n) return shape("unterminated character class", REMEDY.structure);
      atomToken = pattern.slice(i, j + 1);
      atomEnd = j + 1;
    } else if (c === "(") {
      if (stack.length >= MAX_GROUP_DEPTH) return shape("groups nested too deeply", REMEDY.depth);
      stack.push(newFrame());
      i += 1;
      // Skip group prefix such as (?:  (?=  (?!  (?<=  (?<!  (?<name>
      if (pattern[i] === "?") {
        if (pattern[i + 1] === "<" && pattern[i + 2] !== "=" && pattern[i + 2] !== "!") {
          const close = pattern.indexOf(">", i);
          if (close === -1) return shape("malformed group name", REMEDY.structure);
          i = close + 1;
        } else if (pattern[i + 1] === "<") {
          i += 3;
        } else {
          i += 2;
        }
      }
      continue;
    } else if (c === ")") {
      if (stack.length === 1) return shape("unbalanced group", REMEDY.structure);
      const f = stack.pop() as Frame;
      f.branchStarts.push(f.currentEmpty ? "" : (f.currentStart as string));
      closedFrame = f;
      atomEnd = i + 1;
    } else if (c === "|") {
      const f = top();
      f.branchStarts.push(f.currentEmpty ? "" : (f.currentStart as string));
      f.currentStart = null;
      f.currentEmpty = true;
      i += 1;
      continue;
    } else if (c === "^" || c === "$") {
      i += 1;
      continue;
    } else {
      atomToken = c;
    }

    // An atom (or closed group) occupies [i, atomEnd); a quantifier may follow.
    const q = readQuantifier(pattern, atomEnd);
    const variable = q !== null && q.min !== q.max;

    if (closedFrame) {
      const repeats = q !== null && q.max > 1;
      if (repeats && closedFrame.branchStarts.length > 1) {
        const seen = new Set<string>();
        for (const b of closedFrame.branchStarts) {
          if (b === "" || seen.has(b)) {
            return shape("repeated alternation with overlapping branches", REMEDY.alternation);
          }
          seen.add(b);
        }
      }
      if (
        q !== null &&
        closedFrame.hasVariable &&
        (q.max === Infinity || q.max > MAX_OUTER_REPEAT_WITH_VARIABLE_INNER)
      ) {
        return shape("nested variable quantifiers are not allowed", REMEDY.nested);
      }
      noteAtom("(");
      if (variable || closedFrame.hasVariable) top().hasVariable = true;
    } else {
      noteAtom(atomToken as string);
      if (variable) top().hasVariable = true;
    }

    i = q ? q.end : atomEnd;
  }

  if (stack.length !== 1) return shape("unbalanced group", REMEDY.structure);
  return { ok: true };
}

const validationCache = new Map<string, PatternValidation>();
const VALIDATION_CACHE_MAX = 512;

/**
 * Validate a regular-expression source. Never throws. The returned reason never
 * includes the pattern text.
 */
export function validatePattern(pattern: unknown): PatternValidation {
  if (typeof pattern !== "string") {
    return {
      ok: false,
      code: "syntax",
      reason: "pattern must be a string",
      remedy: "Provide the pattern as a string.",
    };
  }
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return {
      ok: false,
      code: "length",
      reason: `pattern exceeds the ${MAX_PATTERN_LENGTH}-character limit`,
      remedy: `Shorten the pattern to at most ${MAX_PATTERN_LENGTH} characters.`,
    };
  }
  const cached = validationCache.get(pattern);
  if (cached) return cached;
  let result: PatternValidation;
  try {
    new RegExp(pattern); // syntax check
    result = analyze(pattern);
  } catch {
    result = {
      ok: false,
      code: "syntax",
      reason: "not a valid regular expression",
      remedy: "Correct the pattern syntax.",
    };
  }
  if (validationCache.size >= VALIDATION_CACHE_MAX) validationCache.clear();
  validationCache.set(pattern, result);
  return result;
}

// ---------------------------------------------------------------------------
// Per-request evaluation budget
// ---------------------------------------------------------------------------

interface RequestScope {
  remainingMs: number;
  /** Patterns (with flags) that exceeded the per-evaluation limit in this request. */
  timedOut: Set<string>;
  /** Results already computed in this request, for short subjects. */
  results: Map<string, boolean>;
  logged: Set<string>;
}

const requestScope = new AsyncLocalStorage<RequestScope>();

/**
 * Run `fn` with one shared evaluation budget. Every safePatternTest call made
 * inside it (constraint checks and derived-condition checks alike) draws from
 * the same budget; when it is spent, further checks report "budget_exhausted".
 * A pattern that timed out is not run again within the same request. Nested
 * calls share the outermost budget.
 */
export function withPatternBudget<T>(fn: () => Promise<T>): Promise<T> {
  if (requestScope.getStore()) return fn();
  return requestScope.run(
    {
      remainingMs: REQUEST_PATTERN_BUDGET_MS,
      timedOut: new Set(),
      results: new Map(),
      logged: new Set(),
    },
    fn
  );
}

/** Run `log` at most once per key within the current request (always, outside one). */
export function logOncePerRequest(key: string, log: () => void): void {
  const scope = requestScope.getStore();
  if (scope) {
    if (scope.logged.has(key)) return;
    scope.logged.add(key);
  }
  log();
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

let sandbox: vm.Context | null = null;
// Compiled patterns are kept inside the context so repeated checks reuse them.
const script = new vm.Script("__t(__p, __f, __s)");
const SETUP = new vm.Script(`
  var __cache = new Map();
  function __t(p, f, s) {
    var k = f + "/" + p;
    var re = __cache.get(k);
    if (!re) {
      if (__cache.size >= 256) __cache.clear();
      re = new RegExp(p, f);
      __cache.set(k, re);
    }
    return re.test(s);
  }
`);

function runWithBudget(
  pattern: string,
  flags: string,
  subject: string,
  timeoutMs: number
): boolean {
  if (!sandbox) {
    sandbox = vm.createContext({ __p: "", __f: "", __s: "" });
    SETUP.runInContext(sandbox);
  }
  const ctx = sandbox as Record<string, unknown>;
  ctx.__p = pattern;
  ctx.__f = flags;
  ctx.__s = subject;
  try {
    return script.runInContext(sandbox, { timeout: timeoutMs }) === true;
  } finally {
    ctx.__s = "";
  }
}

/**
 * Evaluate `pattern` against `subject` under the policy above. Never throws and
 * never reports a match for an invalid, over-long, timed-out or over-budget
 * evaluation.
 */
export function safePatternTest(
  pattern: unknown,
  subject: string,
  options: { flags?: string; maxSubjectLength?: number } = {}
): SafeTestResult {
  const v = validatePattern(pattern);
  if (!v.ok) return { status: "invalid_pattern", code: v.code, reason: v.reason };
  const limit = options.maxSubjectLength ?? MAX_SUBJECT_LENGTH;
  if (subject.length > limit) return { status: "subject_too_long", limit };
  const flags = options.flags ?? "";
  if (!ALLOWED_FLAGS.test(flags)) {
    return { status: "invalid_pattern", code: "syntax", reason: "unsupported flags" };
  }
  try {
    new RegExp("", flags);
  } catch {
    return { status: "invalid_pattern", code: "syntax", reason: "invalid flags" };
  }

  const scope = requestScope.getStore();
  const key = `${flags}/${pattern as string}`;
  let resultKey: string | null = null;
  let timeoutMs = MATCH_TIMEOUT_MS;
  if (scope) {
    if (scope.timedOut.has(key)) return { status: "timeout" };
    if (subject.length <= RESULT_CACHE_SUBJECT_MAX) {
      resultKey = `${key}\u0000${subject}`;
      const known = scope.results.get(resultKey);
      if (known !== undefined) return known ? { status: "match" } : { status: "no_match" };
    }
    if (scope.remainingMs <= 0) return { status: "budget_exhausted" };
    timeoutMs = Math.max(1, Math.min(MATCH_TIMEOUT_MS, Math.ceil(scope.remainingMs)));
  }

  const started = performance.now();
  try {
    const matched = runWithBudget(pattern as string, flags, subject, timeoutMs);
    if (scope && resultKey !== null) scope.results.set(resultKey, matched);
    return matched ? { status: "match" } : { status: "no_match" };
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "ERR_SCRIPT_EXECUTION_TIMEOUT") {
      // The sandbox may hold an aborted context; start fresh next time.
      sandbox = null;
      scope?.timedOut.add(key);
      return { status: "timeout" };
    }
    return { status: "invalid_pattern", code: "syntax", reason: "evaluation failed" };
  } finally {
    if (scope) scope.remainingMs -= performance.now() - started;
  }
}
