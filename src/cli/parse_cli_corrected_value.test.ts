import { describe, it, expect } from "vitest";
import { parseCliCorrectedValue } from "./parse_cli_corrected_value.js";

describe("parseCliCorrectedValue", () => {
  it("returns non-JSON text unchanged", () => {
    expect(parseCliCorrectedValue("Updated Company Name")).toBe("Updated Company Name");
    expect(parseCliCorrectedValue("New description")).toBe("New description");
    expect(parseCliCorrectedValue("2020-01-15")).toBe("2020-01-15");
  });

  it("parses JSON arrays for merge_array-safe corrections", () => {
    expect(parseCliCorrectedValue('["neotoma","sample","cursor"]')).toEqual([
      "neotoma",
      "sample",
      "cursor",
    ]);
  });

  it("parses JSON primitives used by scalar field tests", () => {
    expect(parseCliCorrectedValue("500")).toBe(500);
    expect(parseCliCorrectedValue("true")).toBe(true);
    expect(parseCliCorrectedValue("false")).toBe(false);
    expect(parseCliCorrectedValue("null")).toBe(null);
  });

  it("parses JSON strings", () => {
    expect(parseCliCorrectedValue('"quoted"')).toBe("quoted");
  });

  it("parses JSON objects", () => {
    expect(parseCliCorrectedValue('{"x":1}')).toEqual({ x: 1 });
  });

  it("preserves raw on invalid JSON", () => {
    expect(parseCliCorrectedValue("[not json")).toBe("[not json");
    expect(parseCliCorrectedValue("{bad")).toBe("{bad");
  });

  it("trims only for parse attempt; invalid parse returns original raw", () => {
    expect(parseCliCorrectedValue("  plain text  ")).toBe("  plain text  ");
  });
});
