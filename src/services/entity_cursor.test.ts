// #1943: unit tests for the opaque keyset cursor codec.
import { describe, it, expect } from "vitest";
import {
  encodeCursor,
  decodeCursor,
  isCursorEligibleSort,
  CursorError,
  type CursorPayload,
} from "./entity_cursor.js";

describe("entity_cursor", () => {
  const base: CursorPayload = {
    v: 1,
    sort_by: "entity_id",
    sort_order: "asc",
    entity_id: "ent_abc123",
  };

  it("round-trips an encoded cursor", () => {
    const token = encodeCursor(base);
    expect(typeof token).toBe("string");
    // opaque: base64url, no JSON punctuation leaking
    expect(token).not.toContain("{");
    expect(token).not.toContain('"');
    const decoded = decodeCursor(token, { sortOrder: "asc" });
    expect(decoded).toEqual(base);
  });

  it("preserves descending order through a round-trip", () => {
    const token = encodeCursor({ ...base, sort_order: "desc" });
    const decoded = decodeCursor(token, { sortOrder: "desc" });
    expect(decoded.sort_order).toBe("desc");
    expect(decoded.entity_id).toBe("ent_abc123");
  });

  it("rejects a cursor whose sort_order does not match the request", () => {
    const token = encodeCursor(base); // asc
    expect(() => decodeCursor(token, { sortOrder: "desc" })).toThrow(CursorError);
  });

  it("rejects a structurally malformed token", () => {
    expect(() => decodeCursor("!!!not-base64-json!!!", { sortOrder: "asc" })).toThrow(CursorError);
  });

  it("rejects a token missing entity_id", () => {
    const token = Buffer.from(
      JSON.stringify({ v: 1, sort_by: "entity_id", sort_order: "asc" }),
      "utf8"
    ).toString("base64url");
    expect(() => decodeCursor(token, { sortOrder: "asc" })).toThrow(/entity_id/);
  });

  it("rejects an unsupported version", () => {
    const token = Buffer.from(
      JSON.stringify({ v: 2, sort_by: "entity_id", sort_order: "asc", entity_id: "x" }),
      "utf8"
    ).toString("base64url");
    expect(() => decodeCursor(token, { sortOrder: "asc" })).toThrow(/version/);
  });

  it("rejects a non-entity_id sort_by (interim scope)", () => {
    const token = Buffer.from(
      JSON.stringify({ v: 1, sort_by: "canonical_name", sort_order: "asc", entity_id: "x" }),
      "utf8"
    ).toString("base64url");
    expect(() => decodeCursor(token, { sortOrder: "asc" })).toThrow(/sort_by/);
  });

  it("treats entity_id and undefined sort as cursor-eligible, others not", () => {
    expect(isCursorEligibleSort(undefined)).toBe(true);
    expect(isCursorEligibleSort("entity_id")).toBe(true);
    expect(isCursorEligibleSort("canonical_name")).toBe(false);
    expect(isCursorEligibleSort("observation_count")).toBe(false);
    expect(isCursorEligibleSort("snapshot.period_end")).toBe(false);
  });
});
