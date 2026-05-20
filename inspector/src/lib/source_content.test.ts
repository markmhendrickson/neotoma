import { describe, expect, it } from "vitest";
import { tryParseJsonDocument } from "./source_content";

describe("source_content", () => {
  it("parses JSON objects and arrays", () => {
    expect(tryParseJsonDocument('{"a":1}')).toEqual({ a: 1 });
    expect(tryParseJsonDocument("[1,2]")).toEqual([1, 2]);
  });

  it("returns null for non-JSON text", () => {
    expect(tryParseJsonDocument("hello")).toBeNull();
    expect(tryParseJsonDocument("")).toBeNull();
  });
});
