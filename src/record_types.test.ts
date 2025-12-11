import { describe, expect, it } from "vitest";
import { normalizeRecordType } from "./config/record_types.js";
import { standardizeType } from "./normalize.js";

describe("normalizeRecordType", () => {
  it("maps aliases to canonical ids", () => {
    const result = normalizeRecordType("Transactions");
    expect(result.type).toBe("transaction");
    expect(result.match).toBe("alias");
  });

  it("resolves csv alias to dataset", () => {
    const result = normalizeRecordType("CSV");
    expect(result.type).toBe("dataset");
  });

  it("falls back to document for unknown types (FU-100 spec)", () => {
    const result = normalizeRecordType("My Custom Type!");
    expect(result.type).toBe("document");
    expect(result.match).toBe("default");
  });
});

describe("standardizeType", () => {
  it("prefers canonical types even when existing types contain variants", () => {
    const value = standardizeType("Workout", ["exercise", "note"]);
    expect(value).toBe("exercise");
  });

  it("falls back to document when input is not canonical and normalized to document", () => {
    // When normalizeRecordType returns 'document' for unknown types (FU-100 spec),
    // standardizeType will return 'document' since it matches 'document' against existingTypes
    const value = standardizeType("customtype", ["custom_type"]);
    expect(value).toBe("document");
  });
});
