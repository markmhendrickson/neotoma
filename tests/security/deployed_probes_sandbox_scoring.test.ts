/**
 * Regression coverage for sandbox probe scoring (issue #2111 / PR #2475).
 *
 * Pure unit tests — no curl. Sabotage of the shared helper must fail CI
 * via the security_gates lane (`test:security:probe-scoring`).
 */

import { describe, it, expect } from "vitest";

import {
  isSandboxHeaderValue,
  widenExpectedStatuses,
  SANDBOX_HOSTED_OK_EXTRA_STATUSES,
  SANDBOX_DESTRUCTIVE_EXTRA_STATUSES,
} from "../../scripts/security/probe_sandbox_scoring.mjs";

describe("isSandboxHeaderValue", () => {
  it("accepts trimmed exact value 1 only", () => {
    expect(isSandboxHeaderValue("1")).toBe(true);
    expect(isSandboxHeaderValue(" 1 ")).toBe(true);
    expect(isSandboxHeaderValue("\t1\n")).toBe(true);
  });

  it("rejects empty, 0, false, true, yes, and junk", () => {
    expect(isSandboxHeaderValue("")).toBe(false);
    expect(isSandboxHeaderValue("   ")).toBe(false);
    expect(isSandboxHeaderValue(null)).toBe(false);
    expect(isSandboxHeaderValue(undefined)).toBe(false);
    expect(isSandboxHeaderValue("0")).toBe(false);
    expect(isSandboxHeaderValue("false")).toBe(false);
    expect(isSandboxHeaderValue("true")).toBe(false);
    expect(isSandboxHeaderValue("yes")).toBe(false);
    expect(isSandboxHeaderValue("1 1")).toBe(false);
    expect(isSandboxHeaderValue("sandbox")).toBe(false);
  });
});

describe("widenExpectedStatuses", () => {
  const base = [401];

  it("hosted_ok on sandbox unions extras and keeps base 401", () => {
    const widened = widenExpectedStatuses({
      base,
      sandboxAllowed: "hosted_ok",
      hostIsSandbox: true,
    });
    expect(widened).toContain(401);
    for (const status of SANDBOX_HOSTED_OK_EXTRA_STATUSES) {
      expect(widened).toContain(status);
    }
  });

  it("none on sandbox unions only 403 — does not add 200", () => {
    const widened = widenExpectedStatuses({
      base,
      sandboxAllowed: "none",
      hostIsSandbox: true,
    });
    expect(widened).toEqual(
      expect.arrayContaining([401, ...SANDBOX_DESTRUCTIVE_EXTRA_STATUSES]),
    );
    expect(widened).not.toContain(200);
    expect(SANDBOX_DESTRUCTIVE_EXTRA_STATUSES).toEqual([403]);
  });

  it("non-sandbox leaves base unchanged (deep-equals)", () => {
    expect(
      widenExpectedStatuses({
        base: [401, 403],
        sandboxAllowed: "hosted_ok",
        hostIsSandbox: false,
      }),
    ).toEqual([401, 403]);
    expect(
      widenExpectedStatuses({
        base: [401],
        sandboxAllowed: "none",
        hostIsSandbox: false,
      }),
    ).toEqual([401]);
  });
});
