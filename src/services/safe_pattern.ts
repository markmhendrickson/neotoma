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

export const MAX_PATTERN_LENGTH = 256;
export const MAX_SUBJECT_LENGTH = 10_000;
/** Wall-clock budget for a single evaluation, in milliseconds. */
export const MATCH_TIMEOUT_MS = 100;

/** Per-schema and per-request counts accepted at registration and evaluation. */
export const MAX_PATTERNS_PER_CONDITION = 16;
export const MAX_PATTERNS_PER_SCHEMA = 64;
export const MAX_CONFORMANCE_RULES_PER_PAGE = 32;
/** Total wall-clock budget shared by all rules evaluated for one page, in milliseconds. */
export const CONFORMANCE_TOTAL_BUDGET_MS = 1_000;

export type PatternRefusalCode = "syntax" | "shape" | "length";

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
  | { status: "timeout" };

interface Quant {
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

/** Parse a quantifier starting at `i`, or return null when none starts there. */
function readQuantifier(p: string, i: number): Quant | null {
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
    const m = /^\{(\d{1,5})(?:(,)(\d{0,5}))?\}/.exec(p.slice(i, i + 16));
    if (!m) return null;
    min = Number(m[1]);
    max = m[2] === undefined ? min : m[3] === "" ? Infinity : Number(m[3]);
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

let sandbox: vm.Context | null = null;
const script = new vm.Script("new RegExp(__p, __f).test(__s)");

function runWithBudget(pattern: string, flags: string, subject: string): boolean {
  if (!sandbox) sandbox = vm.createContext({ __p: "", __f: "", __s: "" });
  const ctx = sandbox as Record<string, unknown>;
  ctx.__p = pattern;
  ctx.__f = flags;
  ctx.__s = subject;
  try {
    return script.runInContext(sandbox, { timeout: MATCH_TIMEOUT_MS }) === true;
  } finally {
    ctx.__s = "";
  }
}

/**
 * Evaluate `pattern` against `subject` under the policy above. Never throws and
 * never reports a match for an invalid, over-long or timed-out evaluation.
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
  try {
    new RegExp("", flags);
  } catch {
    return { status: "invalid_pattern", code: "syntax", reason: "invalid flags" };
  }
  try {
    return runWithBudget(pattern as string, flags, subject)
      ? { status: "match" }
      : { status: "no_match" };
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "ERR_SCRIPT_EXECUTION_TIMEOUT") {
      // The sandbox may hold an aborted context; start fresh next time.
      sandbox = null;
      return { status: "timeout" };
    }
    return { status: "invalid_pattern", code: "syntax", reason: "evaluation failed" };
  }
}
