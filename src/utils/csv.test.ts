import { describe, expect, it } from "vitest";
import { isCsvLike, parseCsvRows } from "./csv.js";

describe("isCsvLike", () => {
  it("detects csv extensions", () => {
    expect(isCsvLike("data.CSV", "application/octet-stream")).toBe(true);
  });

  it("detects csv mime types", () => {
    expect(isCsvLike("notes.txt", "text/csv")).toBe(true);
  });

  it("returns false when not csv-like", () => {
    expect(isCsvLike("image.png", "image/png")).toBe(false);
  });
});

describe("parseCsvRows", () => {
  it("parses rows with headers and trims values", () => {
    const buffer = Buffer.from("name,amount\nAlice,10\nBob,20\n", "utf8");
    const { rows, truncated } = parseCsvRows(buffer, 10);
    expect(truncated).toBe(false);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: "Alice", amount: "10" });
  });

  it("truncates when exceeding max rows", () => {
    const buffer = Buffer.from("name\nA\nB\nC\n", "utf8");
    const { rows, truncated } = parseCsvRows(buffer, 2);
    expect(rows).toHaveLength(2);
    expect(truncated).toBe(true);
  });

  it("handles semicolon-delimited csv files", () => {
    const buffer = Buffer.from("name;value\nFoo;1\nBar;2\n", "utf8");
    const { rows, truncated } = parseCsvRows(buffer, 10);
    expect(truncated).toBe(false);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: "Foo", value: "1" });
  });
});
