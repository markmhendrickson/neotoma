/**
 * Unit tests for the shared batch-correction helpers.
 *
 * The end-to-end path (applyBatchCorrection) hits the SQLite layer via
 * createCorrection + getEntityWithProvenance, so it is exercised in
 * integration tests (tests/integration/). Here we lock down the pure logic:
 * field diffing and schema-driven validation.
 */
import { describe, expect, it } from "vitest";

import { diffSnapshotFields, validateChangesAgainstSchema } from "./batch_correction.ts";

describe("diffSnapshotFields", () => {
  it("returns empty array when desired matches current", () => {
    const diff = diffSnapshotFields({ name: "Alice", age: 30 }, { name: "Alice", age: 30 });
    expect(diff).toEqual([]);
  });

  it("detects scalar changes", () => {
    const diff = diffSnapshotFields({ name: "Alice", age: 31 }, { name: "Alice", age: 30 });
    expect(diff).toEqual([{ field: "age", value: 31 }]);
  });

  it("treats a missing current field as a change", () => {
    const diff = diffSnapshotFields({ email: "a@b.com" }, {});
    expect(diff).toEqual([{ field: "email", value: "a@b.com" }]);
  });

  it("sorts results alphabetically for determinism", () => {
    const diff = diffSnapshotFields(
      { zebra: 1, apple: 2, mango: 3 },
      { zebra: 9, apple: 9, mango: 9 }
    );
    expect(diff.map((c) => c.field)).toEqual(["apple", "mango", "zebra"]);
  });

  it("deep-compares nested objects structurally", () => {
    const same = diffSnapshotFields(
      { address: { city: "NYC", zip: "10001" } },
      { address: { zip: "10001", city: "NYC" } }
    );
    expect(same).toEqual([]);

    const changed = diffSnapshotFields(
      { address: { city: "NYC", zip: "10001" } },
      { address: { city: "NYC", zip: "10002" } }
    );
    expect(changed).toEqual([{ field: "address", value: { city: "NYC", zip: "10001" } }]);
  });

  it("tolerates null / undefined current snapshot", () => {
    const diff = diffSnapshotFields({ x: 1 }, null);
    expect(diff).toEqual([{ field: "x", value: 1 }]);
  });

  it("distinguishes null from undefined previous values", () => {
    const diff = diffSnapshotFields({ x: null }, { x: undefined });
    expect(diff).toEqual([{ field: "x", value: null }]);
  });
});

describe("validateChangesAgainstSchema", () => {
  const schema = {
    schema_definition: {
      fields: {
        name: { type: "string" },
        age: { type: "number" },
        active: { type: "boolean" },
        tags: { type: "array" },
        meta: { type: "object" },
        status: { type: "string", enum: ["new", "active", "done"] },
      },
    },
  };

  it("accepts well-typed values", () => {
    const errs = validateChangesAgainstSchema(
      [
        { field: "name", value: "Alice" },
        { field: "age", value: 30 },
        { field: "active", value: true },
        { field: "tags", value: ["a"] },
        { field: "meta", value: { k: 1 } },
        { field: "status", value: "active" },
      ],
      schema
    );
    expect(errs).toEqual([]);
  });

  it("rejects scalar type mismatches", () => {
    const errs = validateChangesAgainstSchema(
      [
        { field: "name", value: 42 },
        { field: "age", value: "thirty" },
        { field: "active", value: "yes" },
      ],
      schema
    );
    expect(errs.map((e) => e.field).sort()).toEqual(["active", "age", "name"]);
    expect(errs.every((e) => /expected/.test(e.message))).toBe(true);
  });

  it("rejects array and object mismatches", () => {
    const errs = validateChangesAgainstSchema(
      [
        { field: "tags", value: "a,b" },
        { field: "meta", value: ["a"] },
      ],
      schema
    );
    expect(errs).toHaveLength(2);
  });

  it("enforces enum membership", () => {
    const errs = validateChangesAgainstSchema([{ field: "status", value: "archived" }], schema);
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toMatch(/enum/);
  });

  it("allows clearing a field with null or undefined", () => {
    const errs = validateChangesAgainstSchema(
      [
        { field: "name", value: null },
        { field: "status", value: null },
      ],
      schema
    );
    expect(errs).toEqual([]);
  });

  it("allows unknown fields (schemas are additive)", () => {
    const errs = validateChangesAgainstSchema([{ field: "favorite_color", value: "blue" }], schema);
    expect(errs).toEqual([]);
  });

  it("tolerates a missing schema by accepting every change", () => {
    const errs = validateChangesAgainstSchema(
      [
        { field: "name", value: 42 },
        { field: "age", value: "thirty" },
      ],
      null
    );
    expect(errs).toEqual([]);
  });
});
