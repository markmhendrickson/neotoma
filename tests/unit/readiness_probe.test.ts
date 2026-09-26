import { describe, expect, it } from "vitest";

import {
  DEFAULT_READY_DB_TIMEOUT_MS,
  probeReadiness,
  resolveReadyTimeoutMs,
  type ReadinessDbClient,
} from "../../src/services/readiness.js";

/**
 * The point of `/ready` is that it fails when the database cannot serve a read.
 * `/health` returns 200 in that state, which is how a total read outage went
 * unnoticed on 2026-08-31 (neotoma#2279, ateles#577, ateles#635).
 *
 * So the assertions that matter here are the negative ones: a hung read, an
 * erroring read, and a rejecting client must each produce `ok: false`. A test
 * that only covered the happy path would pass just as well against the
 * endpoint this one replaces.
 */

/** A db client whose read resolves, rejects, or hangs, on command. */
function dbReturning(behavior: () => Promise<{ error?: { message?: string } | null }>) {
  const calls: Array<{ table: string; columns: string; limit: number }> = [];
  const client: ReadinessDbClient = {
    from: (table: string) => ({
      select: (columns: string) => ({
        limit: (count: number) => {
          calls.push({ table, columns, limit: count });
          return behavior();
        },
      }),
    }),
  };
  return { client, calls };
}

describe("probeReadiness", () => {
  it("reports ready when the database returns a row", async () => {
    const { client, calls } = dbReturning(async () => ({ error: null }));

    const result = await probeReadiness(client);

    expect(result.ok).toBe(true);
    expect(result.checks.database).toBe("ok");
    expect(result.error).toBeUndefined();
    // The probe must be cheap enough to run every 30s forever: one indexed
    // column, one row, from a table migrations guarantee exists.
    expect(calls).toEqual([{ table: "sources", columns: "id", limit: 1 }]);
  });

  it("reports NOT ready when the read returns an error", async () => {
    const { client } = dbReturning(async () => ({ error: { message: "database is locked" } }));

    const result = await probeReadiness(client);

    expect(result.ok).toBe(false);
    expect(result.checks.database).toBe("failed");
    expect(result.error).toContain("database is locked");
  });

  it("reports NOT ready when the read hangs past the timeout", async () => {
    // This is the actual outage shape: the process is alive and answering
    // HTTP, and the query never comes back. A liveness check passes here.
    const { client } = dbReturning(() => new Promise(() => {}));

    const result = await probeReadiness(client, { timeoutMs: 20 });

    expect(result.ok).toBe(false);
    expect(result.checks.database).toBe("failed");
    expect(result.error).toMatch(/exceeded 20ms/);
  });

  it("does not leave an unhandled rejection when the timeout wins", async () => {
    // A readiness check that can crash the process on a slow database would be
    // a cause of outages rather than a detector of them.
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on("unhandledRejection", onRejection);

    try {
      const { client } = dbReturning(
        () =>
          new Promise((_resolve, reject) => {
            setTimeout(() => reject(new Error("late failure")), 30);
          })
      );

      const result = await probeReadiness(client, { timeoutMs: 5 });
      expect(result.ok).toBe(false);

      // Give the losing promise time to settle after the race resolved.
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(rejections).toHaveLength(0);
    } finally {
      process.off("unhandledRejection", onRejection);
    }
  });

  it("reports NOT ready when the client itself throws", async () => {
    const { client } = dbReturning(async () => {
      throw new Error("SQLITE_CANTOPEN: unable to open database file");
    });

    const result = await probeReadiness(client);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("SQLITE_CANTOPEN");
  });

  it("records latency on success and on failure alike", async () => {
    // Degradation is progressive (16s -> 90s -> timeout). A boolean-only probe
    // turns that ramp into a cliff that arrives with no warning.
    let clock = 1_000;
    const { client } = dbReturning(async () => {
      clock += 250;
      return { error: null };
    });

    const healthy = await probeReadiness(client, { now: () => clock });
    expect(healthy.latency_ms).toBe(250);

    const { client: failing } = dbReturning(async () => ({ error: { message: "boom" } }));
    const failed = await probeReadiness(failing, { now: () => 42 });
    expect(failed.latency_ms).toBe(0);
    expect(failed.ok).toBe(false);
  });
});

describe("resolveReadyTimeoutMs", () => {
  it("defaults below the Fly check timeout so a hang returns 503 rather than nothing", () => {
    // fly.toml declares timeout = '30s'. The probe must lose first, so the
    // check reads an explicit "not ready" instead of a silence that looks
    // identical to a network fault.
    expect(resolveReadyTimeoutMs({} as NodeJS.ProcessEnv)).toBe(DEFAULT_READY_DB_TIMEOUT_MS);
    expect(DEFAULT_READY_DB_TIMEOUT_MS).toBeLessThan(30_000);
  });

  it("honours an explicit override", () => {
    expect(
      resolveReadyTimeoutMs({ NEOTOMA_READY_DB_TIMEOUT_MS: "5000" } as NodeJS.ProcessEnv)
    ).toBe(5_000);
  });

  it("floors a too-small override rather than flapping against a healthy server", () => {
    expect(resolveReadyTimeoutMs({ NEOTOMA_READY_DB_TIMEOUT_MS: "10" } as NodeJS.ProcessEnv)).toBe(
      1_000
    );
  });

  it("ignores garbage and negatives", () => {
    for (const value of ["", "abc", "-1", "0"]) {
      expect(
        resolveReadyTimeoutMs({ NEOTOMA_READY_DB_TIMEOUT_MS: value } as NodeJS.ProcessEnv)
      ).toBe(DEFAULT_READY_DB_TIMEOUT_MS);
    }
  });
});
