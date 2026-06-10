/**
 * Unit tests for the shared #1595 recovery helper.
 */

import { describe, it, expect } from "vitest";
import { recoverJsonArrayString } from "../../src/services/recover_json_array_string.js";

describe("recoverJsonArrayString (#1595)", () => {
  it("recovers a JSON-array-shaped string into a real array", () => {
    expect(recoverJsonArrayString('["a","b","c"]')).toEqual(["a", "b", "c"]);
  });

  it("tolerates surrounding whitespace", () => {
    expect(recoverJsonArrayString('  ["a"]  ')).toEqual(["a"]);
  });

  it("returns null for a non-JSON string", () => {
    expect(recoverJsonArrayString("just a control string")).toBeNull();
  });

  it("returns null for a string that parses to a non-array (object)", () => {
    expect(recoverJsonArrayString('{"a":1}')).toBeNull();
  });

  it("returns null for a bracketed-but-invalid-JSON string", () => {
    expect(recoverJsonArrayString("[not, valid, json]")).toBeNull();
  });

  it("returns null for a real array (no recovery needed — caller keeps it)", () => {
    expect(recoverJsonArrayString(["a", "b"])).toBeNull();
  });

  it("returns null for non-string scalars", () => {
    expect(recoverJsonArrayString(42)).toBeNull();
    expect(recoverJsonArrayString(null)).toBeNull();
    expect(recoverJsonArrayString(undefined)).toBeNull();
  });
});
