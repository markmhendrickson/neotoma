import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildReadyResponse,
  buildStorageReadyResponse,
  createStorageWriteProbe,
  DEFAULT_READY_MIN_FREE_MB,
  nodeStorageWriteProbeFs,
  resolveStorageWriteProbeConfig,
  type ReadinessResult,
  type StorageWriteProbeConfig,
  type StorageWriteProbeFs,
} from "../../src/services/readiness.js";

/**
 * The read probe on /ready passes while every write fails (for example a full
 * data volume). These tests pin the write probe's failure paths, the status
 * code rules for /ready and /ready/storage, and that unauthenticated request
 * volume cannot become write volume.
 */

const MB = 1024 * 1024;
const SYNTHETIC_DIR = "/srv/example-data";

function config(overrides: Partial<StorageWriteProbeConfig> = {}): StorageWriteProbeConfig {
  return {
    enabled: true,
    cacheMs: 30_000,
    timeoutMs: 1_000,
    minFreeBytes: 64 * MB,
    requireForReady: false,
    ...overrides,
  };
}

function fakeFs(options: { free?: () => Promise<number>; write?: () => Promise<void> }): {
  fs: StorageWriteProbeFs;
  writes: string[];
  freeCalls: number[];
} {
  const writes: string[] = [];
  const freeCalls: number[] = [];
  return {
    writes,
    freeCalls,
    fs: {
      freeBytes: async () => {
        freeCalls.push(1);
        return options.free ? options.free() : 10_000 * MB;
      },
      writeAndSync: async (filePath: string) => {
        writes.push(filePath);
        if (options.write) await options.write();
      },
    },
  };
}

const READ_OK: ReadinessResult = { ok: true, checks: { database: "ok" }, latency_ms: 3 };

describe("storage write probe", () => {
  it("reports ok after a free-space check and one synced write next to the database", async () => {
    const { fs, writes } = fakeFs({});
    const probe = createStorageWriteProbe({ dir: SYNTHETIC_DIR, config: config(), fs });

    expect(await probe.check()).toEqual({ status: "ok" });
    expect(writes).toEqual([`${SYNTHETIC_DIR}/.neotoma_ready_write_probe`]);
  });

  it("reports failed when the write errors", async () => {
    const logs: string[] = [];
    const { fs } = fakeFs({
      write: async () => {
        throw new Error(`ENOSPC: no space left on device, open '${SYNTHETIC_DIR}/x'`);
      },
    });
    const probe = createStorageWriteProbe({
      dir: SYNTHETIC_DIR,
      config: config(),
      fs,
      log: (m) => logs.push(m),
    });

    expect(await probe.check()).toEqual({ status: "failed", reason: "write_failed" });
    // Full detail goes to the log only.
    expect(logs.join("\n")).toContain("ENOSPC");
  });

  it("reports failed below the free-space floor without writing", async () => {
    const { fs, writes } = fakeFs({ free: async () => 10 * MB });
    const probe = createStorageWriteProbe({ dir: SYNTHETIC_DIR, config: config(), fs });

    expect(await probe.check()).toEqual({ status: "failed", reason: "below_free_space_floor" });
    expect(writes).toHaveLength(0);
  });

  it("reports failed when free space cannot be read", async () => {
    const { fs } = fakeFs({
      free: async () => {
        throw new Error("EIO");
      },
    });
    const probe = createStorageWriteProbe({ dir: SYNTHETIC_DIR, config: config(), fs });

    expect(await probe.check()).toEqual({ status: "failed", reason: "free_space_check_failed" });
  });

  it("reports a timeout for a hung write and leaves no unhandled rejection", async () => {
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on("unhandledRejection", onRejection);
    try {
      const { fs } = fakeFs({
        write: () =>
          new Promise((_resolve, reject) => setTimeout(() => reject(new Error("late")), 30)),
      });
      const probe = createStorageWriteProbe({
        dir: SYNTHETIC_DIR,
        config: config({ timeoutMs: 5 }),
        fs,
      });

      expect(await probe.check()).toEqual({ status: "failed", reason: "write_timeout" });
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(rejections).toHaveLength(0);
    } finally {
      process.off("unhandledRejection", onRejection);
    }
  });

  it("never rejects when the fs layer throws synchronously", async () => {
    const fs: StorageWriteProbeFs = {
      freeBytes: () => {
        throw new Error("sync boom");
      },
      writeAndSync: async () => undefined,
    };
    const probe = createStorageWriteProbe({ dir: SYNTHETIC_DIR, config: config(), fs });

    await expect(probe.check()).resolves.toMatchObject({ status: "failed" });
  });

  it("does not stack a new write on a previous one that is still hung", async () => {
    let clock = 0;
    const { fs, writes } = fakeFs({ write: () => new Promise(() => {}) });
    const probe = createStorageWriteProbe({
      dir: SYNTHETIC_DIR,
      config: config({ timeoutMs: 5, cacheMs: 1_000 }),
      fs,
      now: () => clock,
    });

    expect(await probe.check()).toMatchObject({ reason: "write_timeout" });
    clock += 5_000;
    expect(await probe.check()).toMatchObject({ reason: "write_timeout" });
    expect(writes).toHaveLength(1);
  });

  it("caches the result and shares one in-flight probe across concurrent requests", async () => {
    let clock = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { fs, writes } = fakeFs({ write: () => gate });
    const probe = createStorageWriteProbe({
      dir: SYNTHETIC_DIR,
      config: config({ cacheMs: 30_000 }),
      fs,
      now: () => clock,
    });

    const concurrent = Array.from({ length: 50 }, () => probe.check());
    release();
    const results = await Promise.all(concurrent);
    expect(results.every((r) => r.status === "ok")).toBe(true);
    expect(writes).toHaveLength(1);

    // Within the cache interval: no new write, however many requests arrive.
    clock += 29_000;
    for (let i = 0; i < 20; i += 1) await probe.check();
    expect(writes).toHaveLength(1);

    // After it expires: exactly one more.
    clock += 2_000;
    await Promise.all([probe.check(), probe.check(), probe.check()]);
    expect(writes).toHaveLength(2);
  });

  it("caches failures too, so a failing disk is not hammered", async () => {
    const clock = 0;
    const { fs, writes } = fakeFs({
      write: async () => {
        throw new Error("EROFS");
      },
    });
    const probe = createStorageWriteProbe({
      dir: SYNTHETIC_DIR,
      config: config(),
      fs,
      now: () => clock,
    });

    for (let i = 0; i < 10; i += 1) await probe.check();
    expect(writes).toHaveLength(1);
  });

  it("reports skipped, not failed, and writes nothing when disabled", async () => {
    const { fs, writes, freeCalls } = fakeFs({});
    const probe = createStorageWriteProbe({
      dir: SYNTHETIC_DIR,
      config: config({ enabled: false }),
      fs,
    });

    expect(await probe.check()).toEqual({ status: "skipped", reason: "disabled" });
    expect(writes).toHaveLength(0);
    expect(freeCalls).toHaveLength(0);
  });
});

describe("GET /ready response", () => {
  it("keeps the status code on the read probe by default when the write fails", () => {
    const response = buildReadyResponse(
      READ_OK,
      { status: "failed", reason: "write_failed" },
      false
    );

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.checks).toEqual({ database: "ok", storage_write: "failed" });
    expect(response.body.storage_write_reason).toBe("write_failed");
  });

  it("returns 503 on a failed write when NEOTOMA_READY_REQUIRE_WRITE is set", () => {
    const { requireForReady } = resolveStorageWriteProbeConfig({
      NEOTOMA_READY_REQUIRE_WRITE: "1",
    } as NodeJS.ProcessEnv);
    const response = buildReadyResponse(
      READ_OK,
      { status: "failed", reason: "below_free_space_floor" },
      requireForReady
    );

    expect(response.status).toBe(503);
    expect(response.body.ok).toBe(false);
  });

  it("does not fail on a skipped write even when opted in", () => {
    const response = buildReadyResponse(READ_OK, { status: "skipped", reason: "disabled" }, true);
    expect(response.status).toBe(200);
  });

  it("still returns 503 when the read fails, whatever the write result", () => {
    const response = buildReadyResponse(
      { ok: false, checks: { database: "failed" }, latency_ms: 1, error: "database is locked" },
      { status: "ok" },
      false
    );
    expect(response.status).toBe(503);
    expect(response.body.checks.storage_write).toBe("ok");
  });
});

describe("GET /ready/storage response", () => {
  it("returns 503 when the write or the floor fails", () => {
    expect(buildStorageReadyResponse({ status: "failed", reason: "write_failed" })).toEqual({
      status: 503,
      body: { ok: false, checks: { storage_write: "failed" }, reason: "write_failed" },
    });
    expect(
      buildStorageReadyResponse({ status: "failed", reason: "below_free_space_floor" }).status
    ).toBe(503);
  });

  it("returns 200 when the write succeeds or is skipped", () => {
    expect(buildStorageReadyResponse({ status: "ok" })).toEqual({
      status: 200,
      body: { ok: true, checks: { storage_write: "ok" } },
    });
    expect(buildStorageReadyResponse({ status: "skipped", reason: "disabled" }).status).toBe(200);
  });

  it("carries no path, size or raw error text in the response", async () => {
    const { fs } = fakeFs({
      free: async () => 3 * MB,
    });
    const floorProbe = createStorageWriteProbe({ dir: SYNTHETIC_DIR, config: config(), fs });
    const { fs: failingFs } = fakeFs({
      write: async () => {
        throw new Error(`ENOSPC: no space left on device, open '${SYNTHETIC_DIR}/probe'`);
      },
    });
    const writeProbe = createStorageWriteProbe({
      dir: SYNTHETIC_DIR,
      config: config(),
      fs: failingFs,
    });

    for (const result of [await floorProbe.check(), await writeProbe.check()]) {
      const bodies = [
        JSON.stringify(buildStorageReadyResponse(result).body),
        JSON.stringify(buildReadyResponse(READ_OK, result, false).body),
      ];
      for (const text of bodies) {
        expect(text).not.toContain(SYNTHETIC_DIR);
        expect(text).not.toContain("ENOSPC");
        expect(text).not.toMatch(/\d{4,}/); // no byte counts
      }
    }
  });
});

describe("resolveStorageWriteProbeConfig", () => {
  it("defaults to enabled, not required for /ready, and a 64 MiB floor", () => {
    const c = resolveStorageWriteProbeConfig({} as NodeJS.ProcessEnv);
    expect(c.enabled).toBe(true);
    expect(c.requireForReady).toBe(false);
    expect(c.minFreeBytes).toBe(DEFAULT_READY_MIN_FREE_MB * MB);
    expect(c.cacheMs).toBeGreaterThanOrEqual(1_000);
  });

  it("honours overrides and floors a too-small cache interval", () => {
    const c = resolveStorageWriteProbeConfig({
      NEOTOMA_READY_MIN_FREE_MB: "256",
      NEOTOMA_READY_WRITE_CACHE_MS: "5",
      NEOTOMA_READY_WRITE_PROBE: "0",
    } as NodeJS.ProcessEnv);
    expect(c.minFreeBytes).toBe(256 * MB);
    expect(c.cacheMs).toBe(1_000);
    expect(c.enabled).toBe(false);
  });
});

describe("nodeStorageWriteProbeFs", () => {
  it("writes one fixed probe file and reads free space on a real volume", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ready-write-probe-"));
    try {
      expect(await nodeStorageWriteProbeFs.freeBytes(dir)).toBeGreaterThan(0);
      const probe = createStorageWriteProbe({
        dir,
        config: config({ minFreeBytes: 0, cacheMs: 1_000 }),
        fs: nodeStorageWriteProbeFs,
      });
      expect(await probe.check()).toEqual({ status: "ok" });
      expect(readdirSync(dir)).toEqual([".neotoma_ready_write_probe"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports write_failed when the directory does not exist", async () => {
    const dir = join(tmpdir(), "ready-write-probe-missing-dir-does-not-exist");
    const probe = createStorageWriteProbe({
      dir,
      config: config({ minFreeBytes: 0 }),
      fs: { ...nodeStorageWriteProbeFs, freeBytes: async () => 1 },
    });
    expect(await probe.check()).toEqual({ status: "failed", reason: "write_failed" });
  });
});
