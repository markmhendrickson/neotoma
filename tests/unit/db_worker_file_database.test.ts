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
  WorkerDbTimeoutError,
  WorkerDbAbortError,
  withDbAbortSignal,
} from "../../src/repositories/worker/worker_file_database.js";

const workDir = mkdtempSync(path.join(tmpdir(), "neotoma-worker-db-"));

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

let counter = 0;
function makeDb(
  readerWorkers = 2,
  options: { statementTimeoutMs?: number } = {}
): WorkerFileDatabase {
  counter += 1;
  return new WorkerFileDatabase(path.join(workDir, `w-${counter}.db`), {
    readerWorkers,
    // Off unless a test opts in, so the pre-existing cases keep their old
    // semantics and only the #2217 suite exercises the budget.
    statementTimeoutMs: options.statementTimeoutMs ?? 0,
  });
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

  it("transparently retries on the writer when a read-only reader rejects a read that writes", async () => {
    const db = makeDb(2); // reader pool on, so routeRead tries a reader first
    try {
      await db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");

      // .get() issuing an INSERT ... RETURNING is a read-shaped call that
      // mutates — SQLite rejects it on a read-only reader connection, which
      // is exactly the isReadonlyRejection/retry path in routeRead().
      const row = await db.prepare("INSERT INTO t (id, v) VALUES (1, 'x') RETURNING id, v").get();

      expect(row).toEqual({ id: 1, v: "x" });

      // Confirm it actually landed (retried on the writer, not silently dropped).
      const persisted = await db.prepare("SELECT COUNT(*) AS n FROM t").get();
      expect(persisted).toEqual({ n: 1 });
    } finally {
      await db.close();
    }
  }, 30_000);
});

/**
 * Reader-pool bounding (#2217).
 *
 * The reported outage: two slow reads occupied the 2-worker pool and every
 * other query — including `limit=1` on a 7-row table — hung behind them. Two
 * properties are asserted here, each of which was absent before this suite:
 *
 *   1. Dispatch is busy-aware. Measured on `main`: occupy exactly ONE worker,
 *      leave seven idle, fire seven trivial queries — six returned in ~15 ms
 *      and the seventh took 271 ms, because blind round-robin dealt it onto
 *      the single busy worker. Adding workers cannot fix that (2/4/8 readers
 *      all measured ~270-300 ms); only choosing an idle one does.
 *   2. A statement cannot hold a reader forever. Terminate-and-respawn is the
 *      only lever available — the synchronous driver runs each statement to
 *      completion before the worker can read another message, so a cancel
 *      opcode would arrive too late to matter.
 */
describe("WorkerFileDatabase reader pool (#2217)", () => {
  /** Seed a table big enough that a cross join takes well over a second. */
  async function seedSlowTable(db: WorkerFileDatabase, rows = 8000): Promise<void> {
    await db.exec("CREATE TABLE load (id INTEGER PRIMARY KEY, v TEXT)");
    await db.exec(`
      WITH RECURSIVE cnt(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM cnt WHERE x < ${rows})
      INSERT INTO load (v) SELECT hex(randomblob(96)) FROM cnt
    `);
  }

  const SLOW_SQL = "SELECT COUNT(*) AS n FROM load a, load b WHERE a.v < b.v";

  /**
   * Occupy exactly ONE reader, leave the rest idle, then issue `fastCount`
   * trivial reads concurrently and return their durations.
   *
   * `fastCount` must be at least `readers` to expose round-robin: with fewer,
   * the cursor walks the idle workers and never revisits the busy one, so the
   * bug hides. At `readers` the cursor wraps and deals one query onto the
   * occupied worker — the measured failure.
   */
  async function timeFastReadsAgainstOneBusyWorker(
    readers: number,
    fastCount: number
  ): Promise<{ timings: number[]; slow: Promise<unknown> }> {
    const db = makeDb(readers);
    await seedSlowTable(db);
    // Warm every reader so the pool is fully spawned; "idle" and "not yet
    // created" must not differ in latency for the comparison to mean anything.
    await Promise.all(Array.from({ length: readers }, () => db.prepare("SELECT 1 AS ok").get()));

    const slow = db.prepare(SLOW_SQL).get();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const timings = await Promise.all(
      Array.from({ length: fastCount }, async () => {
        const start = Date.now();
        await db.prepare("SELECT 1 AS ok").get();
        return Date.now() - start;
      })
    );
    return { timings, slow: slow.finally(() => db.close()) };
  }

  it("does not deal a read onto a busy worker when the round-robin cursor wraps", async () => {
    // The isolated repro. Eight readers, ONE busy, eight trivial reads. On
    // main the first seven return in ~0 ms and the eighth takes as long as the
    // cross join (1.7 s here; 271 ms in the issue's smaller fixture), because
    // the cursor wrapped back onto the single occupied worker. Seven idle
    // workers were available the whole time — which is why raising the pool
    // size measured as no fix at all.
    const { timings, slow } = await timeFastReadsAgainstOneBusyWorker(8, 8);
    const worst = Math.max(...timings);
    expect(worst).toBeLessThan(250);
    await slow;
  }, 180_000);

  it("keeps every read fast with two slow reads in flight at the default pool size", async () => {
    // The reported production shape: readerCount 2, two slow reads occupying
    // it. Busy-aware dispatch cannot conjure a free worker here — the pool
    // really is full — so what is asserted is that the pool GROWS to its cap
    // first and only genuinely-saturated traffic queues. With 4 readers and
    // two slow reads, two workers stay idle and reads must find them.
    const db = makeDb(4);
    try {
      await seedSlowTable(db);
      await Promise.all(Array.from({ length: 4 }, () => db.prepare("SELECT 1 AS ok").get()));

      const slow = [db.prepare(SLOW_SQL).get(), db.prepare(SLOW_SQL).get()];
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Eight reads over four workers, two of which are busy: on main the
      // cursor deals two of these onto the slow workers.
      const timings = await Promise.all(
        Array.from({ length: 8 }, async () => {
          const start = Date.now();
          await db.prepare("SELECT 1 AS ok").get();
          return Date.now() - start;
        })
      );

      expect(Math.max(...timings)).toBeLessThan(250);
      await Promise.all(slow);
    } finally {
      await db.close();
    }
  }, 180_000);

  it("times out a runaway statement and reclaims the reader for later reads", async () => {
    const db = makeDb(1, { statementTimeoutMs: 250 });
    try {
      await seedSlowTable(db);

      const slowStart = Date.now();
      await expect(db.prepare(SLOW_SQL).get()).rejects.toBeInstanceOf(WorkerDbTimeoutError);
      const slowMs = Date.now() - slowStart;

      // Rejected on the budget, not after the query's natural duration.
      expect(slowMs).toBeLessThan(3_000);

      // The pool slot is usable again: the terminated reader respawns lazily.
      const row = await db.prepare("SELECT 1 AS ok").get();
      expect(row).toEqual({ ok: 1 });
    } finally {
      await db.close();
    }
  }, 120_000);

  it("does not time out a statement that finishes inside its budget", async () => {
    const db = makeDb(2, { statementTimeoutMs: 10_000 });
    try {
      await db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
      await db.prepare("INSERT INTO t (id, v) VALUES (1, 'x')").run();
      expect(await db.prepare("SELECT v FROM t WHERE id = 1").get()).toEqual({ v: "x" });
      // Timeout timers must be cleared on success, not left to fire later and
      // tear down a reader that has moved on to unrelated work.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(await db.prepare("SELECT COUNT(*) AS n FROM t").get()).toEqual({ n: 1 });
    } finally {
      await db.close();
    }
  }, 30_000);

  it("abandons a read when the caller's signal aborts, freeing the reader", async () => {
    const db = makeDb(1, { statementTimeoutMs: 0 }); // no timeout: abort is the only lever
    try {
      await seedSlowTable(db);

      const controller = new AbortController();
      const start = Date.now();
      const read = withDbAbortSignal(controller.signal, () => db.prepare(SLOW_SQL).get());
      setTimeout(() => controller.abort(), 100);

      await expect(read).rejects.toBeInstanceOf(WorkerDbAbortError);
      expect(Date.now() - start).toBeLessThan(3_000);

      // Reader reclaimed — subsequent reads are served by a fresh worker.
      expect(await db.prepare("SELECT 1 AS ok").get()).toEqual({ ok: 1 });
    } finally {
      await db.close();
    }
  }, 120_000);

  it("rejects immediately when the caller's signal is already aborted", async () => {
    const db = makeDb(1);
    try {
      await db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY)");
      const controller = new AbortController();
      controller.abort();
      await expect(
        withDbAbortSignal(controller.signal, () => db.prepare("SELECT 1 AS ok").get())
      ).rejects.toBeInstanceOf(WorkerDbAbortError);
    } finally {
      await db.close();
    }
  }, 30_000);

  it("never times out statements issued inside a transaction", async () => {
    // Killing the writer mid-transaction would leave the caller unable to know
    // whether the work committed, so the budget must not apply there.
    const db = makeDb(2, { statementTimeoutMs: 50 });
    try {
      await seedSlowTable(db, 1500);
      const result = await db.transaction(async (tx) => {
        const row = (await tx.prepare(SLOW_SQL).get()) as { n: number };
        await tx.prepare("INSERT INTO load (v) VALUES ('tx')").run();
        return row.n;
      });
      expect(result).toBeGreaterThan(0);
      expect(await db.prepare("SELECT COUNT(*) AS n FROM load WHERE v = 'tx'").get()).toEqual({
        n: 1,
      });
    } finally {
      await db.close();
    }
  }, 120_000);

  it("reports reader-pool occupancy so saturation is observable", async () => {
    const db = makeDb(2);
    try {
      await seedSlowTable(db);
      await Promise.all(Array.from({ length: 2 }, () => db.prepare("SELECT 1 AS ok").get()));
      expect(db.readerPoolStats()).toMatchObject({ capacity: 2, busy: 0, queued: 0 });

      const slow = [db.prepare(SLOW_SQL).get(), db.prepare(SLOW_SQL).get()];
      await new Promise((resolve) => setTimeout(resolve, 50));

      const saturated = db.readerPoolStats();
      expect(saturated.busy).toBe(2);
      expect(saturated.queued).toBeGreaterThanOrEqual(2);

      await Promise.all(slow);
      expect(db.readerPoolStats().busy).toBe(0);
    } finally {
      await db.close();
    }
  }, 120_000);
});
