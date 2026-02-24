/**
 * Unit tests for schema_definitions (alias resolution, getSchemaDefinition, etc.)
 */

import { describe, it, expect } from "vitest";
import {
  resolveEntityTypeFromAlias,
  getRegisteredEntityTypes,
  getSchemaDefinition,
  refineEntityTypeFromExtractedFields,
} from "../../src/services/schema_definitions.js";

describe("resolveEntityTypeFromAlias", () => {
  it("resolves Recibo to receipt (Spanish)", () => {
    expect(resolveEntityTypeFromAlias("Recibo")).toBe("receipt");
  });

  it("resolves recibo (lowercase) to receipt", () => {
    expect(resolveEntityTypeFromAlias("recibo")).toBe("receipt");
  });

  it("resolves factura to invoice", () => {
    expect(resolveEntityTypeFromAlias("factura")).toBe("invoice");
  });

  it("resolves canonical type receipt to receipt", () => {
    expect(resolveEntityTypeFromAlias("receipt")).toBe("receipt");
  });

  it("resolves nota to note", () => {
    expect(resolveEntityTypeFromAlias("nota")).toBe("note");
  });

  it("returns null for unknown type", () => {
    expect(resolveEntityTypeFromAlias("unknown_type_xyz")).toBeNull();
  });

  it("returns null for empty or whitespace", () => {
    expect(resolveEntityTypeFromAlias("")).toBeNull();
    expect(resolveEntityTypeFromAlias("   ")).toBeNull();
  });
});

describe("getRegisteredEntityTypes", () => {
  it("includes receipt and invoice", () => {
    const types = getRegisteredEntityTypes();
    expect(types).toContain("receipt");
    expect(types).toContain("invoice");
  });
});

describe("getSchemaDefinition", () => {
  it("returns receipt schema for receipt", () => {
    const schema = getSchemaDefinition("receipt");
    expect(schema).not.toBeNull();
    expect(schema?.entity_type).toBe("receipt");
    expect(schema?.metadata?.aliases).toContain("recibo");
  });
});

describe("refineEntityTypeFromExtractedFields", () => {
  it("refines note to receipt when extracted fields match receipt schema (2+ required)", () => {
    const keys = ["merchant_name", "amount_total", "currency", "date_purchased"];
    expect(refineEntityTypeFromExtractedFields("note", keys)).toBe("receipt");
  });

  it("keeps receipt when current type is receipt and has strong fit", () => {
    const keys = ["merchant_name", "amount_total", "currency", "date_purchased"];
    expect(refineEntityTypeFromExtractedFields("receipt", keys)).toBe("receipt");
  });

  it("keeps note when only note-like fields present", () => {
    const keys = ["content", "title"];
    expect(refineEntityTypeFromExtractedFields("note", keys)).toBe("note");
  });

  it("returns current type when no other schema has 2+ required match", () => {
    const keys = ["some_unknown_field"];
    expect(refineEntityTypeFromExtractedFields("note", keys)).toBe("note");
  });

  it("returns current type when extracted keys empty", () => {
    expect(refineEntityTypeFromExtractedFields("note", [])).toBe("note");
  });

  it("uses dynamic candidateSchemas when provided (e.g. from registry)", () => {
    const dynamicCandidates = [
      { entity_type: "receipt", schema_definition: { fields: { merchant_name: { type: "string", required: true }, amount_total: { type: "number", required: true }, currency: { type: "string", required: true } } } },
      { entity_type: "note", schema_definition: { fields: { content: { type: "string", required: true } } } },
    ];
    const keys = ["merchant_name", "amount_total", "currency"];
    expect(refineEntityTypeFromExtractedFields("note", keys, dynamicCandidates)).toBe("receipt");
  });

  it("keeps receipt when refinement could otherwise pick fixed_cost (trusted domain type)", () => {
    const keys = [
      "merchant",
      "transaction_date",
      "posting_date",
      "amount",
      "category",
      "account",
      "status",
      "transaction_id",
      "schema_version",
    ];
    expect(refineEntityTypeFromExtractedFields("receipt", keys)).toBe("receipt");
  });

  it("keeps invoice when current type is invoice (trusted domain type)", () => {
    const keys = ["merchant_name", "amount_total", "currency", "date_purchased"];
    expect(refineEntityTypeFromExtractedFields("invoice", keys)).toBe("invoice");
  });

  it("refines unregistered current type when extracted fields strongly match a known schema", () => {
    const keys = ["merchant_name", "amount_total", "currency", "date_purchased"];
    expect(refineEntityTypeFromExtractedFields("unknown_document", keys)).toBe("receipt");
  });
});
