/**
 * Worker-hosted local-file backend tests (concurrent-backend plan, PR #1944
 * arch/QA follow-ups).
 *
 * WorkerFileDatabase is what actually serves local `file:` URLs on the libsql
 * backend — the exact configuration of the hosted-instance freeze this whole
 * change fixes. The generic driver-contract suite exercises it through
 * openLibsqlDatabase(), but two properties are specific to the worker topology
 * and were called out as blocking gaps in review:
 *
 *   1. Non-blocking on a LOCAL FILE: a slow query on the worker-hosted local
 *      file must not stall concurrent queries (the literal repro).
 *   2. Supervised restart: a crashed writer/reader worker must reject its
 *      in-flight requests with a clear error and then self-heal on the next
 *      request — not wedge the connection or leak a never-settling promise.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  WorkerFileDatabase,
  WorkerDbCrashError,
} from "../../src/repositories/worker/worker_file_database.js";

const workDir = mkdtempSync(path.join(tmpdir(), "neotoma-worker-db-"));

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

let counter = 0;
function makeDb(readerWorkers = 2): WorkerFileDatabase {
  counter += 1;
  return new WorkerFileDatabase(path.join(workDir, `w-${counter}.db`), { readerWorkers });
}

describe("WorkerFileDatabase (local-file libsql backend)", () => {
  it("does not block a concurrent query while a slow query runs on the local file", async () => {
    const db = makeDb();
    try {
      await db.exec("CREATE TABLE load (id INTEGER PRIMARY KEY, v TEXT)");
      await db.exec(`
        WITH RECURSIVE cnt(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM cnt WHERE x < 6000)
        INSERT INTO load (v) SELECT hex(randomblob(96)) FROM cnt
      `);

      let slowDone = false;
      const slowStart = Date.now();
      const slow = (
        db.prepare("SELECT COUNT(*) AS n FROM load a, load b WHERE a.v < b.v").get() as Promise<{
          n: number;
        }>
      ).then((r) => {
        slowDone = true;
        return r;
      });

      await new Promise((resolve) => setTimeout(resolve, 25));

      const healthStart = Date.now();
      const health = await db.prepare("SELECT 1 AS ok").get();
      const healthMs = Date.now() - healthStart;
      const healthFinishedFirst = !slowDone;

      const result = await slow;
      const slowMs = Date.now() - slowStart;

      expect(result.n).toBeGreaterThan(0);
      expect(health).toEqual({ ok: 1 });
      // Health check must not have waited for the slow query. Relative bound so
      // parallel-worker CPU saturation can't flake it.
      expect(healthMs).toBeLessThan(Math.max(200, slowMs / 2));
      if (slowMs > 300) {
        // On the old sync driver the slow query would always finish first
        // (blocking); here the trivial read returns while the join is still running.
        expect(healthFinishedFirst).toBe(true);
      }
    } finally {
      await db.close();
    }
  }, 60_000);

  it("rejects in-flight requests with WorkerDbCrashError when the writer worker crashes, then self-heals", async () => {
    const db = makeDb(0); // reader pool off → all ops on the writer
    try {
      await db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
      await db.prepare("INSERT INTO t (id, v) VALUES (1, 'before')").run();

      // Crash mid-flight: the returned promise must reject (not hang forever).
      await expect(
        (
          db as unknown as { __crashWorkerForTest(w: "writer" | "reader"): Promise<unknown> }
        ).__crashWorkerForTest("writer")
      ).rejects.toBeInstanceOf(WorkerDbCrashError);

      // Self-heal: the next request spawns a fresh worker and sees committed data.
      const row = await db.prepare("SELECT v FROM t WHERE id = 1").get();
      expect(row).toEqual({ v: "before" });

      // And writes work again on the respawned worker.
      await db.prepare("INSERT INTO t (id, v) VALUES (2, 'after-respawn')").run();
      const count = await db.prepare("SELECT COUNT(*) AS n FROM t").get();
      expect(count).toEqual({ n: 2 });
    } finally {
      await db.close();
    }
  }, 30_000);

  it("recovers when a reader worker crashes (reads reroute to a fresh reader)", async () => {
    const db = makeDb(2);
    try {
      await db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
      await db.prepare("INSERT INTO t (id, v) VALUES (1, 'x')").run();

      await expect(
        (
          db as unknown as { __crashWorkerForTest(w: "writer" | "reader"): Promise<unknown> }
        ).__crashWorkerForTest("reader")
      ).rejects.toBeInstanceOf(WorkerDbCrashError);

      // Subsequent reads still succeed (fresh reader spun up, or routed elsewhere).
      const rows = (await db.prepare("SELECT v FROM t ORDER BY id").all()) as Array<{ v: string }>;
      expect(rows).toEqual([{ v: "x" }]);
    } finally {
      await db.close();
    }
  }, 30_000);

  it("rejects requests issued after close()", async () => {
    const db = makeDb(0);
    await db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY)");
    await db.close();
    await expect(db.prepare("SELECT 1 AS ok").get()).rejects.toBeInstanceOf(WorkerDbCrashError);
  });
});
