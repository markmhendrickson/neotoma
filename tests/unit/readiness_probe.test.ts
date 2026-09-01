/**
 * ateles#577: unit coverage for the readiness probe's pure pieces — the
 * timeout-budget knob and the three-state classifier.
 *
 * The endpoint-level behaviour (503, liveness staying green) lives in
 * tests/integration/health_readiness_split.test.ts, over real HTTP. This file
 * pins the classifier's contract directly, because that contract is the fix:
 * `ok` may only be reported when the probe actually COMPLETED. A probe that
 * could not determine an answer must classify as `timeout`/`error`, never as a
 * confident pass.
 */

import { describe, it, expect } from "vitest";

import {
  READINESS_DB_TIMEOUT_DEFAULT_MS,
  parseReadinessDbTimeoutMs,
  probeComponent,
} from "../../src/actions.js";

describe("parseReadinessDbTimeoutMs", () => {
  it("defaults to 2000ms when unset", () => {
    expect(READINESS_DB_TIMEOUT_DEFAULT_MS).toBe(2000);
    expect(parseReadinessDbTimeoutMs(undefined)).toBe(READINESS_DB_TIMEOUT_DEFAULT_MS);
  });

  it("defaults on empty or whitespace-only values", () => {
    expect(parseReadinessDbTimeoutMs("")).toBe(READINESS_DB_TIMEOUT_DEFAULT_MS);
    expect(parseReadinessDbTimeoutMs("   ")).toBe(READINESS_DB_TIMEOUT_DEFAULT_MS);
  });

  it("defaults on non-numeric values", () => {
    expect(parseReadinessDbTimeoutMs("soon")).toBe(READINESS_DB_TIMEOUT_DEFAULT_MS);
    expect(parseReadinessDbTimeoutMs("2s")).toBe(2);
  });

  it("accepts an explicit positive budget", () => {
    expect(parseReadinessDbTimeoutMs("500")).toBe(500);
    expect(parseReadinessDbTimeoutMs("  5000 ")).toBe(5000);
  });

  it("rejects non-positive budgets back to the default", () => {
    // Unlike the SSE keepalive knob there is no "disable" sentinel here: a
    // readiness probe with no budget is the very defect this endpoint closes,
    // so 0 and negatives must not flow through as "wait forever".
    expect(parseReadinessDbTimeoutMs("0")).toBe(READINESS_DB_TIMEOUT_DEFAULT_MS);
    expect(parseReadinessDbTimeoutMs("-1")).toBe(READINESS_DB_TIMEOUT_DEFAULT_MS);
  });
});

describe("probeComponent three-state classification", () => {
  it("classifies a fast completed probe as ok", async () => {
    const result = await probeComponent(async () => {}, 200);
    expect(result.ok).toBe(true);
    expect(result.state).toBe("ok");
    expect(typeof result.latency_ms).toBe("number");
    expect(result.error).toBeUndefined();
  });

  it("classifies a completed-but-slow probe as slow while staying ok", async () => {
    // A slow-but-answering database is still serving. Flapping a load balancer
    // on latency alone is its own outage, so `slow` keeps ok: true and only
    // surfaces the latency.
    const result = await probeComponent(
      () => new Promise<void>((resolve) => setTimeout(resolve, 60)),
      100,
      50
    );
    expect(result.ok).toBe(true);
    expect(result.state).toBe("slow");
    expect(result.latency_ms).toBeGreaterThanOrEqual(50);
  });

  it("classifies a probe that outruns its budget as timeout, NOT ok", async () => {
    // The core inversion. Pre-fix, an undeterminable check reported PASS.
    const result = await probeComponent(() => new Promise<void>(() => {}), 60);
    expect(result.ok).toBe(false);
    expect(result.state).toBe("timeout");
    expect(result.error).toMatch(/60ms budget/);
    expect(result.latency_ms).toBeGreaterThanOrEqual(50);
  });

  it("gives up at the budget rather than waiting on the probe", async () => {
    // An unbounded readiness check is the same defect in a different costume:
    // it would hang alongside the database instead of reporting on it.
    const started = performance.now();
    await probeComponent(() => new Promise<void>((resolve) => setTimeout(resolve, 5_000)), 80);
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(1_000);
  });

  it("classifies a throwing probe as error and carries the message", async () => {
    const result = await probeComponent(async () => {
      throw new Error("SQLITE_BUSY: database is locked");
    }, 200);
    expect(result.ok).toBe(false);
    expect(result.state).toBe("error");
    expect(result.error).toContain("SQLITE_BUSY");
  });

  it("classifies a non-Error rejection as error", async () => {
    const result = await probeComponent(() => Promise.reject("plain string failure"), 200);
    expect(result.ok).toBe(false);
    expect(result.state).toBe("error");
    expect(result.error).toContain("plain string failure");
  });

  it("reports a latency number in every state", async () => {
    const outcomes = await Promise.all([
      probeComponent(async () => {}, 200),
      probeComponent(() => new Promise<void>(() => {}), 40),
      probeComponent(async () => {
        throw new Error("boom");
      }, 200),
    ]);
    for (const outcome of outcomes) {
      expect(typeof outcome.latency_ms).toBe("number");
      expect(Number.isFinite(outcome.latency_ms)).toBe(true);
      expect(outcome.latency_ms).toBeGreaterThanOrEqual(0);
    }
  });
});
