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

export type PatternValidation = { ok: true } | { ok: false; reason: string };

export type SafeTestResult =
  | { status: "match" }
  | { status: "no_match" }
  | { status: "invalid_pattern"; reason: string }
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
      if (next === undefined) return { ok: false, reason: "trailing escape" };
      if (/[1-9]/.test(next) || (next === "k" && pattern[i + 2] === "<")) {
        return { ok: false, reason: "backreferences are not allowed" };
      }
      atomToken = pattern.slice(i, i + 2);
      atomEnd = i + 2;
    } else if (c === "[") {
      let j = i + 1;
      if (pattern[j] === "^") j += 1;
      if (pattern[j] === "]") j += 1;
      while (j < n && pattern[j] !== "]") {
        j += pattern[j] === "\\" ? 2 : 1;
      }
      if (j >= n) return { ok: false, reason: "unterminated character class" };
      atomToken = pattern.slice(i, j + 1);
      atomEnd = j + 1;
    } else if (c === "(") {
      if (stack.length >= MAX_GROUP_DEPTH) return { ok: false, reason: "groups nested too deeply" };
      stack.push(newFrame());
      i += 1;
      // Skip group prefix such as (?:  (?=  (?!  (?<=  (?<!  (?<name>
      if (pattern[i] === "?") {
        if (pattern[i + 1] === "<" && pattern[i + 2] !== "=" && pattern[i + 2] !== "!") {
          const close = pattern.indexOf(">", i);
          if (close === -1) return { ok: false, reason: "malformed group name" };
          i = close + 1;
        } else if (pattern[i + 1] === "<") {
          i += 3;
        } else {
          i += 2;
        }
      }
      continue;
    } else if (c === ")") {
      if (stack.length === 1) return { ok: false, reason: "unbalanced group" };
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
            return { ok: false, reason: "repeated alternation with overlapping branches" };
          }
          seen.add(b);
        }
      }
      if (
        q !== null &&
        closedFrame.hasVariable &&
        (q.max === Infinity || q.max > MAX_OUTER_REPEAT_WITH_VARIABLE_INNER)
      ) {
        return { ok: false, reason: "nested unbounded quantifiers are not allowed" };
      }
      noteAtom("(");
      if (variable || closedFrame.hasVariable) top().hasVariable = true;
    } else {
      noteAtom(atomToken as string);
      if (variable) top().hasVariable = true;
    }

    i = q ? q.end : atomEnd;
  }

  if (stack.length !== 1) return { ok: false, reason: "unbalanced group" };
  return { ok: true };
}

const validationCache = new Map<string, PatternValidation>();
const VALIDATION_CACHE_MAX = 512;

/**
 * Validate a regular-expression source. Never throws. The returned reason never
 * includes the pattern text.
 */
export function validatePattern(pattern: unknown): PatternValidation {
  if (typeof pattern !== "string") return { ok: false, reason: "pattern must be a string" };
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return { ok: false, reason: `pattern exceeds ${MAX_PATTERN_LENGTH} characters` };
  }
  const cached = validationCache.get(pattern);
  if (cached) return cached;
  let result: PatternValidation;
  try {
    new RegExp(pattern); // syntax check
    result = analyze(pattern);
  } catch {
    result = { ok: false, reason: "not a valid regular expression" };
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
  if (!v.ok) return { status: "invalid_pattern", reason: v.reason };
  const limit = options.maxSubjectLength ?? MAX_SUBJECT_LENGTH;
  if (subject.length > limit) return { status: "subject_too_long", limit };
  const flags = options.flags ?? "";
  try {
    new RegExp("", flags);
  } catch {
    return { status: "invalid_pattern", reason: "invalid flags" };
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
    return { status: "invalid_pattern", reason: "evaluation failed" };
  }
}
