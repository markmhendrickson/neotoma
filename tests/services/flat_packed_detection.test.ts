import { describe, expect, it } from "vitest";
import {
  detectFlatPackedRows,
  FlatPackedRowsError,
} from "../../src/services/flat_packed_detection.js";

describe("detectFlatPackedRows", () => {
  it("returns detected=false for a single well-formed entity", () => {
    const result = detectFlatPackedRows({
      entity_type: "contact",
      name: "Holly Blondin",
      email: "holly@example.com",
      phone: "+1-555-0100",
    });
    expect(result.detected).toBe(false);
  });

  it("returns detected=false for a small number of flat `foo_1`, `foo_2` keys with no suffixes", () => {
    // `address_1`, `address_2` alone isn't a flat-packed row — there are no
    // suffix fields like `address_1_line1`.
    const result = detectFlatPackedRows({
      address_1: "101 Main",
      address_2: "Suite 5",
    });
    expect(result.detected).toBe(false);
  });

  it("detects `contact_<N>_<field>` flat-packed rows", () => {
    const result = detectFlatPackedRows({
      contact_1_name: "Alice",
      contact_1_email: "alice@example.com",
      contact_2_name: "Bob",
      contact_2_email: "bob@example.com",
      contact_3_name: "Carol",
      contact_3_email: "carol@example.com",
    });
    expect(result.detected).toBe(true);
    expect(result.prefix).toBe("contact");
    expect(result.indices).toEqual([1, 2, 3]);
    expect(result.suggestedEntities).toHaveLength(3);
    expect(result.suggestedEntities?.[0]).toMatchObject({
      entity_type: "contact",
      name: "Alice",
      email: "alice@example.com",
    });
  });

  it("detects the flat-packed prefix with the most indices when multiple prefixes collide", () => {
    const result = detectFlatPackedRows({
      row_1_a: 1,
      row_1_b: 2,
      row_2_a: 3,
      row_2_b: 4,
      line_1_x: "x1",
      line_1_y: "y1",
      line_2_x: "x2",
      line_2_y: "y2",
      line_3_x: "x3",
      line_3_y: "y3",
    });
    expect(result.detected).toBe(true);
    expect(result.prefix).toBe("line");
    expect(result.indices).toEqual([1, 2, 3]);
  });

  it("FlatPackedRowsError carries code and detection", () => {
    const detection = detectFlatPackedRows({
      transaction_1_amount: 10,
      transaction_1_currency: "USD",
      transaction_2_amount: 20,
      transaction_2_currency: "EUR",
    });
    expect(detection.detected).toBe(true);
    const err = new FlatPackedRowsError(detection);
    expect(err.code).toBe("ERR_FLAT_PACKED_ROWS");
    expect(err.name).toBe("FlatPackedRowsError");
    expect(err.message).toContain("2 flat-packed transaction rows");
  });
});
