import { describe, expect, it } from "vitest";

import { compareCliApiCompat, parseSemverTriplet } from "./semver_compat.js";

describe("parseSemverTriplet", () => {
  it("parses X.Y.Z prefix", () => {
    expect(parseSemverTriplet("1.2.3")).toEqual([1, 2, 3]);
    expect(parseSemverTriplet("0.11.0-rc.1")).toEqual([0, 11, 0]);
  });
  it("returns null for invalid", () => {
    expect(parseSemverTriplet("unknown")).toBeNull();
    expect(parseSemverTriplet("")).toBeNull();
  });
});

describe("compareCliApiCompat", () => {
  it("same major+minor is compatible without warning", () => {
    expect(compareCliApiCompat("0.6.0", "0.6.5")).toEqual({ compatible: true });
  });

  it("major mismatch is incompatible", () => {
    const r = compareCliApiCompat("1.0.0", "0.9.9");
    expect(r.compatible).toBe(false);
    expect(r.warning).toMatch(/Major version mismatch/);
  });

  it("minor drift > 2 is incompatible", () => {
    const r = compareCliApiCompat("0.11.0", "0.5.0");
    expect(r.compatible).toBe(false);
    expect(r.warning).toMatch(/Minor version drift of 6/);
  });

  it("minor drift 1–2 is compatible with warning", () => {
    const r = compareCliApiCompat("0.6.0", "0.7.0");
    expect(r.compatible).toBe(true);
    expect(r.warning).toMatch(/Minor version difference/);
  });

  it("unknown remote is compatible with warning", () => {
    const r = compareCliApiCompat("0.6.0", "unknown");
    expect(r.compatible).toBe(true);
    expect(r.warning).toMatch(/did not report/);
  });
});
