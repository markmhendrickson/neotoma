/**
 * Unit tests for `src/shared/jcs.ts` (RFC 8785 canonicaliser, restricted domain).
 *
 * Runs every committed cross-language vector from `tests/fixtures/jcs_vectors.json`,
 * asserts every rejection class, pins the vector file hash recorded in the
 * format note, and proves the mutation requirement: a canonicaliser that sorts
 * keys by code point (the default of many other languages) goes red on the
 * non-BMP vectors.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  JCS_MAX_DEPTH,
  JCS_MAX_SAFE_INTEGER,
  JcsError,
  canonicalise,
  sha256Hex,
  type JcsErrorCode,
} from "../../src/shared/jcs.js";

const VECTOR_PATH = new URL("../fixtures/jcs_vectors.json", import.meta.url);
const NOTE_PATH = new URL("../../docs/subsystems/jcs_canonicalization.md", import.meta.url);

interface JcsVector {
  name: string;
  input_json_text: string;
  canonical: string | null;
  sha256: string | null;
  reject?: JcsErrorCode;
}

const vectorBytes = readFileSync(VECTOR_PATH);
const vectors = JSON.parse(vectorBytes.toString("utf8")) as JcsVector[];
const accepted = vectors.filter((v) => v.reject === undefined);
const rejected = vectors.filter((v) => v.reject !== undefined);

function expectJcsError(fn: () => unknown, code: JcsErrorCode): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(JcsError);
    expect((error as JcsError).code).toBe(code);
    return;
  }
  throw new Error(`expected JcsError ${code}, but nothing was thrown`);
}

describe("jcs vector file", () => {
  it("has the documented shape and covers the required categories", () => {
    expect(Array.isArray(vectors)).toBe(true);
    for (const v of vectors) {
      expect(Object.keys(v).sort()).toEqual(
        v.reject === undefined
          ? ["canonical", "input_json_text", "name", "sha256"]
          : ["canonical", "input_json_text", "name", "reject", "sha256"]
      );
      expect(typeof v.name).toBe("string");
      expect(typeof v.input_json_text).toBe("string");
    }
    expect(new Set(vectors.map((v) => v.name)).size).toBe(vectors.length);
    const names = vectors.map((v) => v.name).join("\n");
    for (const required of [
      "rfc8785_3_2_3_key_sorting",
      "key_order_non_bmp_vs_bmp_escaped",
      "key_order_non_bmp_vs_bmp_raw",
      "escape_all_short_forms",
      "control_characters_all",
      "line_and_paragraph_separators_literal",
      "integer_bounds",
      "empty_nested_containers",
      "nested_arrays_depth_64",
      "no_unicode_normalisation_keys",
      "digest_shaped_grant_1",
      "digest_shaped_grant_2",
      "digest_shaped_grant_3",
      "reject_float_top_level",
      "reject_integer_above_safe_max",
      "reject_lone_high_surrogate_value",
    ]) {
      expect(names).toContain(required);
    }
  });

  it("is pinned by the sha256 recorded in the format note", () => {
    const actual = createHash("sha256").update(vectorBytes).digest("hex");
    const note = readFileSync(NOTE_PATH, "utf8");
    const match = /^Vector file sha256: `([0-9a-f]{64})`$/m.exec(note);
    expect(match, "format note must record `Vector file sha256: `<hex>``").not.toBeNull();
    expect(match![1]).toBe(actual);
  });
});

describe("jcs canonicalise: committed cross-language vectors", () => {
  it.each(accepted.map((v) => [v.name, v] as const))("%s", (_name, v) => {
    const canonical = canonicalise(JSON.parse(v.input_json_text));
    expect(canonical).toBe(v.canonical);
    expect(sha256Hex(canonical)).toBe(v.sha256);
  });

  it.each(rejected.map((v) => [v.name, v] as const))("%s", (_name, v) => {
    // The parsed value (or the text-level parse itself) must be refused with the documented code.
    const parsed = JSON.parse(v.input_json_text);
    expectJcsError(() => canonicalise(parsed), v.reject as JcsErrorCode);
  });
});

describe("jcs canonicalise: RFC 8785 reference examples (literal expectations)", () => {
  it("section 3.2.3: sorts keys by UTF-16 code units", () => {
    const input = {
      "€": "Euro Sign",
      "\r": "Carriage Return",
      דּ: "Hebrew Letter Dalet With Dagesh",
      "1": "One",
      "\u{1f600}": "Emoji: Grinning Face",
      "\u0080": "Control",
      ö: "Latin Small Letter O With Diaeresis",
    };
    expect(canonicalise(input)).toBe(
      '{"\\r":"Carriage Return","1":"One","\u0080":"Control",' +
        '"ö":"Latin Small Letter O With Diaeresis","€":"Euro Sign",' +
        '"\u{1f600}":"Emoji: Grinning Face","דּ":"Hebrew Letter Dalet With Dagesh"}'
    );
  });

  it("section 3.2.2: string and literal serialisation", () => {
    const input = {
      string: '€$\u000f\u000aA\'B"\\\\"/',
      literals: [null, true, false],
    };
    expect(canonicalise(input)).toBe(
      '{"literals":[null,true,false],"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}'
    );
  });
});

describe("jcs canonicalise: serialisation rules", () => {
  it("emits no insignificant whitespace and preserves array order", () => {
    expect(canonicalise({ b: [3, 1, 2], a: { d: null, c: true } })).toBe(
      '{"a":{"c":true,"d":null},"b":[3,1,2]}'
    );
  });

  it("serialises negative zero as 0", () => {
    expect(canonicalise(-0)).toBe("0");
    expect(canonicalise([-0, 0])).toBe("[0,0]");
  });

  it("serialises integer bounds without exponent notation", () => {
    expect(JCS_MAX_SAFE_INTEGER).toBe(9007199254740991);
    expect(canonicalise([JCS_MAX_SAFE_INTEGER, -JCS_MAX_SAFE_INTEGER])).toBe(
      "[9007199254740991,-9007199254740991]"
    );
  });

  it("escapes only the required characters and leaves U+2028, U+2029, DEL and '/' literal", () => {
    expect(canonicalise("  \u007f/é\u{1f600}")).toBe('"  \u007f/é\u{1f600}"');
    expect(canonicalise('"\\\b\f\n\r\t')).toBe('"\\"\\\\\\b\\f\\n\\r\\t"');
  });

  it("escapes every other control character as lowercase \\u00xx", () => {
    for (let code = 0; code < 0x20; code += 1) {
      const out = canonicalise(String.fromCharCode(code));
      const short: Record<number, string> = { 8: "\\b", 9: "\\t", 10: "\\n", 12: "\\f", 13: "\\r" };
      expect(out).toBe(`"${short[code] ?? `\\u${code.toString(16).padStart(4, "0")}`}"`);
    }
  });

  it("does not normalise unicode in keys or values", () => {
    const nfc = "é";
    const nfd = "é";
    const out = canonicalise({ [nfc]: nfc, [nfd]: nfd });
    expect(out).toBe(`{"${nfd}":"${nfd}","${nfc}":"${nfc}"}`);
  });

  it("orders astral keys before U+E000..U+FFFF (UTF-16 order, not code point order)", () => {
    const out = canonicalise({ "�": 1, "\u{10000}": 2, "": 3 });
    expect(out).toBe('{"\u{10000}":2,"":3,"�":1}');
  });

  it("canonicalises a null-prototype object and an Object.create(null) tree", () => {
    const o = Object.create(null) as Record<string, unknown>;
    o.b = 1;
    o.a = [];
    expect(canonicalise(o)).toBe('{"a":[],"b":1}');
  });

  it("is deterministic regardless of key insertion order", () => {
    const a = canonicalise({ x: 1, y: { q: 1, p: 2 }, z: [1] });
    const b = canonicalise({ z: [1], y: { p: 2, q: 1 }, x: 1 });
    expect(a).toBe(b);
  });

  it("serialises a hostile key such as __proto__ as an ordinary key", () => {
    const o = JSON.parse('{"__proto__":{"x":1},"a":2}') as unknown;
    expect(canonicalise(o)).toBe('{"__proto__":{"x":1},"a":2}');
  });
});

describe("jcs canonicalise: rejection (typed error, never coercion)", () => {
  const cases: Array<[string, unknown, JcsErrorCode]> = [
    ["NaN", Number.NaN, "non_finite_number"],
    ["Infinity", Number.POSITIVE_INFINITY, "non_finite_number"],
    ["-Infinity", Number.NEGATIVE_INFINITY, "non_finite_number"],
    ["float", 1.5, "non_integer_number"],
    ["integer above safe max", 2 ** 53, "integer_out_of_range"],
    ["integer below safe min", -(2 ** 53), "integer_out_of_range"],
    ["1e21", 1e21, "integer_out_of_range"],
    ["bigint", 10n, "unsupported_type"],
    ["undefined", undefined, "unsupported_type"],
    ["function", () => 1, "unsupported_type"],
    ["symbol", Symbol("s"), "unsupported_type"],
    ["undefined inside object", { a: undefined }, "unsupported_type"],
    ["undefined inside array", [1, undefined], "unsupported_type"],
    ["sparse array hole", [1, , 3], "unsupported_type"], // eslint-disable-line no-sparse-arrays
    ["Date", new Date(0), "non_plain_object"],
    ["Map", new Map(), "non_plain_object"],
    ["Set", new Set(), "non_plain_object"],
    ["class instance", new (class Foo {})(), "non_plain_object"],
    ["boxed Number", Object(1), "non_plain_object"],
    ["boxed String", Object("s"), "non_plain_object"],
    ["typed array", new Uint8Array(1), "non_plain_object"],
    ["lone high surrogate", "\ud800", "lone_surrogate"],
    ["lone low surrogate", "\udc00", "lone_surrogate"],
    ["reversed surrogate pair", "\udc00\ud800", "lone_surrogate"],
    ["high surrogate then BMP", "\ud800a", "lone_surrogate"],
    ["lone surrogate in key", { "\ud800": 1 }, "lone_surrogate"],
    ["lone surrogate nested", { a: [{ b: "x\udfff" }] }, "lone_surrogate"],
  ];

  it.each(cases)("%s", (_name, value, code) => {
    expectJcsError(() => canonicalise(value), code);
  });

  it("rejects an object with a symbol-keyed property", () => {
    expectJcsError(() => canonicalise({ [Symbol("k")]: 1, a: 1 }), "unsupported_type");
  });

  it("rejects an accessor property without invoking it", () => {
    let called = false;
    const o = {};
    Object.defineProperty(o, "a", {
      enumerable: true,
      get() {
        called = true;
        return 1;
      },
    });
    expectJcsError(() => canonicalise(o), "unsupported_type");
    expect(called).toBe(false);
  });

  it("ignores non-enumerable own properties, as JSON.stringify does", () => {
    const o = { a: 1 };
    Object.defineProperty(o, "hidden", { enumerable: false, value: 2 });
    expect(canonicalise(o)).toBe('{"a":1}');
  });

  it("rejects a cycle", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expectJcsError(() => canonicalise(a), "cycle");
    const arr: unknown[] = [];
    arr.push(arr);
    expectJcsError(() => canonicalise(arr), "cycle");
  });

  it("accepts a shared (non-cyclic) reference used twice", () => {
    const shared = { k: 1 };
    expect(canonicalise({ a: shared, b: shared })).toBe('{"a":{"k":1},"b":{"k":1}}');
  });

  it("rejects nesting beyond the depth limit without a stack overflow", () => {
    let deep: unknown = 1;
    for (let i = 0; i < JCS_MAX_DEPTH + 1; i += 1) deep = [deep];
    expectJcsError(() => canonicalise(deep), "depth_exceeded");
    let ok: unknown = 1;
    for (let i = 0; i < JCS_MAX_DEPTH; i += 1) ok = [ok];
    expect(canonicalise(ok).length).toBe(2 * JCS_MAX_DEPTH + 1);
  });

  it("never leaks the offending value into the error message", () => {
    try {
      canonicalise({ secret_value_marker: 1.5 });
    } catch (error) {
      expect((error as Error).message).not.toContain("1.5");
      expect((error as Error).message).not.toContain("secret_value_marker");
      return;
    }
    throw new Error("expected throw");
  });
});

describe("jcs sha256Hex", () => {
  it("returns lowercase hex sha256 over UTF-8 bytes", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    // Non-ASCII input is hashed as UTF-8, not UTF-16 or Latin-1.
    expect(sha256Hex("é")).toBe(
      createHash("sha256")
        .update(Buffer.from([0xc3, 0xa9]))
        .digest("hex")
    );
  });

  it("refuses text containing a lone surrogate instead of hashing U+FFFD", () => {
    expectJcsError(() => sha256Hex("\ud800"), "lone_surrogate");
  });
});

describe("mutation: a code-point-sorting canonicaliser fails the non-BMP vectors", () => {
  /** Deliberately wrong reference: same escaping, but keys ordered by code point. */
  function naiveCodePointCanonicalise(value: unknown): string {
    if (value === null || typeof value !== "object") return canonicalise(value);
    if (Array.isArray(value)) return `[${value.map(naiveCodePointCanonicalise).join(",")}]`;
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort((a, b) => {
      const ca = Array.from(a, (c) => c.codePointAt(0) as number);
      const cb = Array.from(b, (c) => c.codePointAt(0) as number);
      for (let i = 0; i < Math.min(ca.length, cb.length); i += 1) {
        if (ca[i] !== cb[i]) return ca[i] - cb[i];
      }
      return ca.length - cb.length;
    });
    return `{${keys.map((k) => `${canonicalise(k)}:${naiveCodePointCanonicalise(record[k])}`).join(",")}}`;
  }

  const failing = accepted
    .filter((v) => naiveCodePointCanonicalise(JSON.parse(v.input_json_text)) !== v.canonical)
    .map((v) => v.name);

  it("goes red on the non-BMP ordering vectors", () => {
    expect(failing).toContain("key_order_non_bmp_vs_bmp_escaped");
    expect(failing).toContain("key_order_non_bmp_vs_bmp_raw");
    expect(failing).toContain("key_order_non_bmp_prefix");
    expect(failing).toContain("rfc8785_3_2_3_key_sorting");
  });

  it("fails only the vectors that exercise astral-versus-high-BMP ordering", () => {
    for (const name of failing) {
      expect(name).toMatch(/non_bmp|surrogate_range|rfc8785_3_2_3|key_order_nested/);
    }
    // Plain ASCII and single-plane vectors stay green, so the signal is specific.
    expect(failing).not.toContain("key_order_ascii_and_digits");
    expect(failing).not.toContain("empty_object");
  });
});
