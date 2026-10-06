/**
 * RFC 8785 (JSON Canonicalization Scheme) canonicaliser for a restricted value domain.
 *
 * Domain: strings, booleans, null, arrays, plain objects, and integers within
 * +/-(2^53 - 1). Everything else is refused with a typed {@link JcsError}; no value is
 * ever coerced, dropped or defaulted, because the output of this module is the input to
 * a digest that other implementations must reproduce byte for byte.
 *
 * Refused (never coerced): non-integer numbers, NaN, Infinity, integers outside the
 * safe range, bigint, undefined, functions, symbols, lone surrogates (in values AND
 * keys), non-plain objects (Date, Map, class instances, boxed primitives, typed arrays),
 * accessor properties, symbol-keyed properties, sparse arrays, cycles, and nesting deeper
 * than {@link JCS_MAX_DEPTH}.
 *
 * Because the domain contains no non-integer numbers, the ECMAScript Number-to-string
 * rules of RFC 8785 section 3.2.2.3 reduce to plain decimal integer text. `-0` is
 * serialised as `0`.
 *
 * Object keys are sorted by UTF-16 code units (RFC 8785 section 3.2.3), which is what a
 * default JavaScript string comparison does, and which differs from code point order for
 * characters outside the Basic Multilingual Plane. A consumer in another language must
 * sort the same way (for example by the UTF-16 big-endian encoding of each key).
 *
 * Strings are escaped minimally: `"` and `\` plus `\b \f \n \r \t`; every other control
 * character below U+0020 is `\u00xx` with lowercase hex. Nothing else is escaped, so
 * `/`, U+007F, U+2028 and U+2029 stay literal and non-ASCII text is emitted raw. No
 * Unicode normalisation is applied to keys or values.
 *
 * JSON text duplicate-key detection is out of scope: this module canonicalises an
 * already-parsed value, and a JavaScript object cannot hold two properties of the same
 * name. Whatever parses untrusted JSON text is responsible for refusing duplicate keys
 * before calling in.
 *
 * Error messages never include the offending value or key.
 *
 * Format note and cross-language vectors: docs/subsystems/jcs_canonicalization.md and
 * tests/fixtures/jcs_vectors.json.
 */

import { createHash } from "node:crypto";

/** Largest integer magnitude admitted (2^53 - 1). */
export const JCS_MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

/** Maximum nesting depth of arrays and objects. A value nested deeper is refused. */
export const JCS_MAX_DEPTH = 256;

export type JcsErrorCode =
  | "non_finite_number"
  | "non_integer_number"
  | "integer_out_of_range"
  | "lone_surrogate"
  | "unsupported_type"
  | "non_plain_object"
  | "cycle"
  | "depth_exceeded";

export class JcsError extends Error {
  readonly code: JcsErrorCode;

  constructor(code: JcsErrorCode) {
    super(`jcs: value outside the canonicalisation domain (${code})`);
    this.name = "JcsError";
    this.code = code;
  }
}

function assertWellFormed(text: string): void {
  const length = text.length;
  for (let i = 0; i < length; i += 1) {
    const unit = text.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = i + 1 < length ? text.charCodeAt(i + 1) : 0;
      if (next < 0xdc00 || next > 0xdfff) throw new JcsError("lone_surrogate");
      i += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new JcsError("lone_surrogate");
    }
  }
}

const SHORT_ESCAPES: Readonly<Record<number, string>> = {
  0x08: "\\b",
  0x09: "\\t",
  0x0a: "\\n",
  0x0c: "\\f",
  0x0d: "\\r",
  0x22: '\\"',
  0x5c: "\\\\",
};

function serialiseString(text: string): string {
  assertWellFormed(text);
  let out = '"';
  let runStart = 0;
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    if (unit >= 0x20 && unit !== 0x22 && unit !== 0x5c) continue;
    out += text.slice(runStart, i);
    out += SHORT_ESCAPES[unit] ?? `\\u${unit.toString(16).padStart(4, "0")}`;
    runStart = i + 1;
  }
  return `${out}${text.slice(runStart)}"`;
}

function serialiseNumber(value: number): string {
  if (!Number.isFinite(value)) throw new JcsError("non_finite_number");
  if (!Number.isInteger(value)) throw new JcsError("non_integer_number");
  if (Math.abs(value) > JCS_MAX_SAFE_INTEGER) throw new JcsError("integer_out_of_range");
  // Safe integers print without exponent notation; -0 prints as "0".
  return String(value);
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function serialise(value: unknown, depth: number, ancestors: Set<object>): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      return serialiseString(value);
    case "number":
      return serialiseNumber(value);
    case "object":
      break;
    default:
      // undefined, bigint, function, symbol
      throw new JcsError("unsupported_type");
  }

  const container = value as object;
  if (depth >= JCS_MAX_DEPTH) throw new JcsError("depth_exceeded");
  if (ancestors.has(container)) throw new JcsError("cycle");
  ancestors.add(container);
  try {
    if (Array.isArray(container)) {
      const parts: string[] = [];
      for (let i = 0; i < container.length; i += 1) {
        if (!(i in container)) throw new JcsError("unsupported_type");
        parts.push(serialise(container[i], depth + 1, ancestors));
      }
      return `[${parts.join(",")}]`;
    }

    if (!isPlainObject(container)) throw new JcsError("non_plain_object");
    if (
      Object.getOwnPropertySymbols(container).some(
        (s) => Object.getOwnPropertyDescriptor(container, s)?.enumerable
      )
    ) {
      throw new JcsError("unsupported_type");
    }
    const keys = Object.keys(container);
    // Default string comparison is by UTF-16 code unit, as RFC 8785 section 3.2.3 requires.
    keys.sort();
    const parts: string[] = [];
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(container, key);
      if (!descriptor || !("value" in descriptor)) throw new JcsError("unsupported_type");
      parts.push(`${serialiseString(key)}:${serialise(descriptor.value, depth + 1, ancestors)}`);
    }
    return `{${parts.join(",")}}`;
  } finally {
    ancestors.delete(container);
  }
}

/**
 * Serialise `value` to RFC 8785 canonical JSON text. Throws {@link JcsError} for any value
 * outside the domain described in the module header.
 */
export function canonicalise(value: unknown): string {
  return serialise(value, 0, new Set());
}

/**
 * Lowercase hex SHA-256 over the UTF-8 encoding of `text`. Refuses text containing a lone
 * surrogate rather than silently hashing the U+FFFD replacement for it.
 */
export function sha256Hex(text: string): string {
  assertWellFormed(text);
  return createHash("sha256").update(text, "utf8").digest("hex");
}
