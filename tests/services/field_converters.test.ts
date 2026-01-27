import { describe, it, expect } from "vitest";
import {
  convertTimestampNanosToIso,
  convertTimestampMsToIso,
  convertTimestampSecondsToIso,
  convertNumberToString,
  convertStringToNumber,
  convertBooleanToString,
  convertStringToBoolean,
  getConverter,
  hasConverter,
} from "../../src/services/field_converters.js";

describe("field_converters", () => {
  describe("convertTimestampNanosToIso", () => {
    it("converts nanosecond timestamp to ISO 8601 string", () => {
      // 2025-01-15T00:00:00.000Z = 1736899200000 ms = 1736899200000000000 ns
      const nanos = 1736899200000000000;
      const result = convertTimestampNanosToIso(nanos);
      expect(result).toBe("2025-01-15T00:00:00.000Z");
    });

    it("handles BigInt inputs", () => {
      const nanos = BigInt("1736899200000000000");
      const result = convertTimestampNanosToIso(nanos);
      expect(result).toBe("2025-01-15T00:00:00.000Z");
    });

    it("returns null for non-number/non-bigint inputs", () => {
      expect(convertTimestampNanosToIso("not a number")).toBeNull();
      expect(convertTimestampNanosToIso(null)).toBeNull();
      expect(convertTimestampNanosToIso(undefined)).toBeNull();
      expect(convertTimestampNanosToIso({})).toBeNull();
    });

    it("returns null for invalid timestamp range", () => {
      expect(convertTimestampNanosToIso(-1000000000)).toBeNull();
      expect(convertTimestampNanosToIso(5000000000000000000)).toBeNull();
    });

    it("is deterministic (same input -> same output)", () => {
      const nanos = 1736899200000000000;
      const result1 = convertTimestampNanosToIso(nanos);
      const result2 = convertTimestampNanosToIso(nanos);
      expect(result1).toBe(result2);
    });
  });

  describe("convertTimestampMsToIso", () => {
    it("converts millisecond timestamp to ISO 8601 string", () => {
      const ms = 1736899200000; // 2025-01-15T00:00:00.000Z
      const result = convertTimestampMsToIso(ms);
      expect(result).toBe("2025-01-15T00:00:00.000Z");
    });

    it("returns null for non-number inputs", () => {
      expect(convertTimestampMsToIso("not a number")).toBeNull();
      expect(convertTimestampMsToIso(null)).toBeNull();
      expect(convertTimestampMsToIso(undefined)).toBeNull();
    });

    it("returns null for invalid timestamp range", () => {
      expect(convertTimestampMsToIso(-1000)).toBeNull();
      expect(convertTimestampMsToIso(5000000000000)).toBeNull();
    });

    it("is deterministic", () => {
      const ms = 1736899200000;
      const result1 = convertTimestampMsToIso(ms);
      const result2 = convertTimestampMsToIso(ms);
      expect(result1).toBe(result2);
    });
  });

  describe("convertTimestampSecondsToIso", () => {
    it("converts second timestamp to ISO 8601 string", () => {
      const seconds = 1736899200; // 2025-01-15T00:00:00.000Z
      const result = convertTimestampSecondsToIso(seconds);
      expect(result).toBe("2025-01-15T00:00:00.000Z");
    });

    it("returns null for non-number inputs", () => {
      expect(convertTimestampSecondsToIso("not a number")).toBeNull();
    });

    it("returns null for invalid timestamp range", () => {
      expect(convertTimestampSecondsToIso(-1)).toBeNull();
      expect(convertTimestampSecondsToIso(5000000000)).toBeNull();
    });

    it("is deterministic", () => {
      const seconds = 1736899200;
      const result1 = convertTimestampSecondsToIso(seconds);
      const result2 = convertTimestampSecondsToIso(seconds);
      expect(result1).toBe(result2);
    });
  });

  describe("convertNumberToString", () => {
    it("converts number to string", () => {
      expect(convertNumberToString(42)).toBe("42");
      expect(convertNumberToString(3.14)).toBe("3.14");
      expect(convertNumberToString(0)).toBe("0");
      expect(convertNumberToString(-10)).toBe("-10");
    });

    it("returns null for non-number inputs", () => {
      expect(convertNumberToString("42")).toBeNull();
      expect(convertNumberToString(null)).toBeNull();
      expect(convertNumberToString(undefined)).toBeNull();
    });

    it("is deterministic", () => {
      expect(convertNumberToString(42)).toBe(convertNumberToString(42));
    });
  });

  describe("convertStringToNumber", () => {
    it("converts string to number", () => {
      expect(convertStringToNumber("42")).toBe(42);
      expect(convertStringToNumber("3.14")).toBe(3.14);
      expect(convertStringToNumber("-10")).toBe(-10);
    });

    it("returns null for invalid number strings", () => {
      expect(convertStringToNumber("not a number")).toBeNull();
      expect(convertStringToNumber("")).toBeNull();
    });

    it("returns null for non-string inputs", () => {
      expect(convertStringToNumber(42)).toBeNull();
      expect(convertStringToNumber(null)).toBeNull();
    });

    it("is deterministic", () => {
      expect(convertStringToNumber("42")).toBe(convertStringToNumber("42"));
    });
  });

  describe("convertBooleanToString", () => {
    it("converts boolean to string", () => {
      expect(convertBooleanToString(true)).toBe("true");
      expect(convertBooleanToString(false)).toBe("false");
    });

    it("returns null for non-boolean inputs", () => {
      expect(convertBooleanToString("true")).toBeNull();
      expect(convertBooleanToString(1)).toBeNull();
      expect(convertBooleanToString(null)).toBeNull();
    });

    it("is deterministic", () => {
      expect(convertBooleanToString(true)).toBe(convertBooleanToString(true));
    });
  });

  describe("convertStringToBoolean", () => {
    it("converts true strings to boolean", () => {
      expect(convertStringToBoolean("true")).toBe(true);
      expect(convertStringToBoolean("TRUE")).toBe(true);
      expect(convertStringToBoolean("1")).toBe(true);
      expect(convertStringToBoolean("yes")).toBe(true);
      expect(convertStringToBoolean("YES")).toBe(true);
    });

    it("converts false strings to boolean", () => {
      expect(convertStringToBoolean("false")).toBe(false);
      expect(convertStringToBoolean("FALSE")).toBe(false);
      expect(convertStringToBoolean("0")).toBe(false);
      expect(convertStringToBoolean("no")).toBe(false);
      expect(convertStringToBoolean("NO")).toBe(false);
    });

    it("returns null for invalid boolean strings", () => {
      expect(convertStringToBoolean("maybe")).toBeNull();
      expect(convertStringToBoolean("")).toBeNull();
    });

    it("returns null for non-string inputs", () => {
      expect(convertStringToBoolean(true)).toBeNull();
      expect(convertStringToBoolean(null)).toBeNull();
    });

    it("is deterministic", () => {
      expect(convertStringToBoolean("true")).toBe(convertStringToBoolean("true"));
    });
  });

  describe("getConverter", () => {
    it("returns converter function by name", () => {
      const converter = getConverter("timestamp_nanos_to_iso");
      expect(converter).toBe(convertTimestampNanosToIso);
    });

    it("returns null for unknown converter names", () => {
      expect(getConverter("unknown_converter")).toBeNull();
    });
  });

  describe("hasConverter", () => {
    it("returns true for existing converters", () => {
      expect(hasConverter("timestamp_nanos_to_iso")).toBe(true);
      expect(hasConverter("timestamp_ms_to_iso")).toBe(true);
      expect(hasConverter("number_to_string")).toBe(true);
    });

    it("returns false for non-existing converters", () => {
      expect(hasConverter("unknown_converter")).toBe(false);
    });
  });
});
