import { describe, expect, it } from "vitest";
import { normalizeObservationValidity } from "../../src/services/observation_validity.js";
import { generateObservationId } from "../../src/services/observation_identity.js";

const observed = "2026-10-20T12:00:00.000Z";
describe("observation validity canonical material", () => {
  it("retains omission and explicit null separately without validating untouched legacy clocks", () => {
    expect(normalizeObservationValidity({}, "legacy-clock")).toEqual({});
    expect(normalizeObservationValidity({ valid_from: null, valid_to: null }, observed)).toEqual({
      valid_from: null,
      valid_to: null,
    });
    expect(generateObservationId(null, null, "entity", { value: 1 }, "key", {})).toBe(
      generateObservationId(null, null, "entity", { value: 1 }, "key")
    );
  });
  it("normalizes offset instants without losing sub-millisecond interval boundaries", () => {
    expect(
      normalizeObservationValidity(
        {
          valid_from: "2026-10-01T01:00:00.123456789+01:00",
          valid_to: "2026-10-01T00:00:00.123456790Z",
        },
        observed
      )
    ).toEqual({
      valid_from: "2026-10-01T00:00:00.123456789Z",
      valid_to: "2026-10-01T00:00:00.12345679Z",
    });
    expect(() =>
      normalizeObservationValidity(
        {
          valid_from: "2026-10-01T00:00:00.123456790Z",
          valid_to: "2026-10-01T00:00:00.123456789Z",
        },
        observed
      )
    ).toThrow();
  });
  it.each([
    "2026-02-30T00:00:00Z",
    "2026-10-01",
    "2026-10-01T00:00:00",
    "2026-10-01T25:00:00Z",
    "not-a-date",
    "0000-01-01T00:00:00+01:00",
    "9999-12-31T23:59:59-01:00",
  ])("refuses malformed validity %s", (valid_from) => {
    expect(() => normalizeObservationValidity({ valid_from }, observed)).toThrow();
  });
});
