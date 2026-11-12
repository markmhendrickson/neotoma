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
import { Worker } from "node:worker_threads";
import { afterAll, describe, expect, it, vi } from "vitest";
import { holdOrdinaryWorker, holdWriterWorker } from "../helpers/worker_lifetime_barrier.js";
import { logger } from "../../src/utils/logger.js";
import {
  summarizeQueuedStatements,
  oldestQueuedWaitMs,
  WorkerFileDatabase,
  WorkerDbCrashError,
  WorkerDbTimeoutError,
  WorkerDbAbortError,
  withDbAbortSignal,
  detachDbAbortSignal,
  currentDbAbortSignal,
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

  it("does not abandon reads issued inside detachDbAbortSignal, even after the signal fired (#2144)", async () => {
    // A write loop is read -> write -> read -> write. Its reads must not be
    // cancellable by the request's signal, or a client hang-up ends the loop
    // between two writes and leaves the batch half applied.
    const db = makeDb(1);
    try {
      await db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY)");
      const controller = new AbortController();
      controller.abort();

      const outcome = await withDbAbortSignal(controller.signal, async () => {
        expect(currentDbAbortSignal()).toBe(controller.signal);
        const detached = await detachDbAbortSignal(async () => {
          expect(currentDbAbortSignal()).toBeUndefined();
          // Reads survive across several awaits, as the store loop's do.
          const first = await db.prepare("SELECT 1 AS ok").get();
          await db.prepare("INSERT INTO t (id) VALUES (1)").run();
          const second = await db.prepare("SELECT COUNT(*) AS n FROM t").get();
          return { first, second };
        });
        // The ambient signal is restored for the caller afterwards.
        expect(currentDbAbortSignal()).toBe(controller.signal);
        return detached;
      });

      expect(outcome).toEqual({ first: { ok: 1 }, second: { n: 1 } });
      // Control: the same read outside the detach is still abandoned.
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
      expect(saturated.oldestQueuedWaitMs).toBe(0);

      // A third statement queues behind a busy reader, so its wait is visible.
      const third = db.prepare(SLOW_SQL).get();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(db.readerPoolStats().oldestQueuedWaitMs).toBeGreaterThan(0);

      await Promise.all([...slow, third]);
      expect(db.readerPoolStats().busy).toBe(0);
    } finally {
      await db.close();
    }
  }, 120_000);

  it("names the queued statements when the reader pool saturates", async () => {
    const db = makeDb(2);
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    try {
      await seedSlowTable(db);
      await Promise.all(Array.from({ length: 2 }, () => db.prepare("SELECT 1 AS ok").get()));
      const slow = [db.prepare(SLOW_SQL).get(), db.prepare(SLOW_SQL).get()];
      await new Promise((resolve) => setTimeout(resolve, 50));
      // Every reader is busy, so this read is the one that trips the warning.
      const third = db.prepare(SLOW_SQL).get();
      await Promise.all([...slow, third]);
      const message = warn.mock.calls.map((c) => String(c[0])).find((m) => m.includes("saturated"));
      expect(message).toBeDefined();
      expect(message).toContain("In flight: ");
      expect(message).toContain(SLOW_SQL.replace(/\s+/g, " ").trim().slice(0, 70));
    } finally {
      warn.mockRestore();
      await db.close();
    }
  }, 120_000);

  it("summarizes queued statements by shape without bound values", () => {
    const summary = summarizeQueuedStatements([
      "SELECT * FROM entities\n   WHERE id IN (?, ?)",
      "SELECT * FROM entities WHERE id IN (?, ?)",
      "SELECT 1",
    ]);
    expect(summary).toBe('2x "SELECT * FROM entities WHERE id IN (?, ?)"; 1x "SELECT 1"');
  });

  it("close waits for actual exit when termination rejects, without an unhandled rejection", async () => {
    const db = makeDb();
    await db.prepare("SELECT 1").get();
    const actual = Worker.prototype.terminate;
    let held: Worker | undefined;
    const spy = vi.spyOn(Worker.prototype, "terminate").mockImplementationOnce(function (
      this: Worker
    ) {
      held = this;
      return Promise.reject(new Error("synthetic termination failure"));
    });
    let closed = false;
    const closing = db.close().then(() => {
      closed = true;
    });
    try {
      await vi.waitFor(() => expect(held).toBeDefined());
      expect(closed).toBe(false);
    } finally {
      spy.mockRestore();
      if (held) await actual.call(held);
      await expect(closing).resolves.toBeUndefined();
      await db.close();
    }
  });
});

describe("pinned worker read view", () => {
  it.each(
    ["test", "development", "production"].flatMap((mode) =>
      ["reader", "writer"].map((role) => ({ mode, role }))
    )
  )("confines the valid lifetime barrier to test mode ($mode/$role)", async ({ mode, role }) => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = mode;
    const db = makeDb();
    let held: ReturnType<typeof holdOrdinaryWorker> | undefined;
    try {
      await db.exec("CREATE TABLE environment_control(n INTEGER)");
      await db.prepare("SELECT 1").get();
      held = (role === "reader" ? holdOrdinaryWorker : holdWriterWorker)(
        db,
        new AbortController().signal
      );
      const result = held.pending.then(
        (value) => ({ kind: "returned", value }),
        (error) => ({ kind: "rejected", message: error.message })
      );
      if (mode === "test") {
        await vi.waitFor(() => expect(Atomics.load(held!.flags, 0)).toBe(1));
        held.release();
        expect(await result).toEqual({ kind: "returned", value: { held: true } });
      } else {
        const outcome = await Promise.race([
          result,
          new Promise((resolve) => setTimeout(() => resolve({ kind: "still-held" }), 150)),
        ]);
        expect(outcome).toEqual({ kind: "rejected", message: "Worker test barrier unavailable" });
        expect(Atomics.load(held.flags, 0)).toBe(0);
      }
    } finally {
      held?.release();
      await db.close();
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  it("aborts before BEGIN without creating an exact reader", async () => {
    const db = makeDb();
    const control = new AbortController();
    control.abort();
    try {
      await expect(
        withDbAbortSignal(control.signal, () => db.withPinnedReadView(async () => 1))
      ).rejects.toBeInstanceOf(WorkerDbAbortError);
      expect(db.readerPoolStats().size).toBe(0);
    } finally {
      await db.close();
    }
  });

  it.each(["BEGIN", "SELECT 1 AS exact_stage", "ROLLBACK"])(
    "retains an unfinished %s generation through abort or failed cleanup",
    async (stage) => {
      counter += 1;
      const db = new WorkerFileDatabase(path.join(workDir, `stage-${counter}.db`), {
        readerWorkers: 2,
        orphanGraceMs: 20,
      });
      const flags = new Int32Array(new SharedArrayBuffer(8));
      const originalPost = Worker.prototype.postMessage;
      let held: Worker | undefined;
      const posting = vi.spyOn(Worker.prototype, "postMessage").mockImplementation(function (
        this: Worker,
        message,
        ...rest
      ) {
        if (message?.sql === stage) {
          held = this;
          return originalPost.call(
            this,
            { ...message, sql: "__hold_for_test__", params: [flags.buffer] },
            ...rest
          );
        }
        return originalPost.call(this, message, ...rest);
      });
      const control = new AbortController();
      const pin = withDbAbortSignal(control.signal, () =>
        db.withPinnedReadView((view) => view.prepare("SELECT 1 AS exact_stage").get())
      );
      const failure = expect(pin).rejects.toBeInstanceOf(
        stage === "ROLLBACK" ? WorkerDbTimeoutError : WorkerDbAbortError
      );
      let terminating: ReturnType<typeof vi.spyOn> | undefined;
      try {
        await vi.waitFor(() => expect(Atomics.load(flags, 0)).toBe(1));
        terminating = vi.spyOn(held!, "terminate");
        if (stage !== "ROLLBACK") control.abort();
        await failure;
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(terminating).not.toHaveBeenCalled();
        await expect(db.withPinnedReadView(async () => 1)).rejects.toThrow(/unavailable/);
      } finally {
        posting.mockRestore();
        Atomics.store(flags, 1, 1);
        Atomics.notify(flags, 1);
        await db.close();
        terminating?.mockRestore();
      }
      const next = makeDb();
      try {
        expect(
          await next.withPinnedReadView((view) => view.prepare("SELECT 1 AS n").get())
        ).toEqual({ n: 1 });
      } finally {
        await next.close();
      }
    }
  );

  it("withholds exact work through ordinary retirement and apparent termination until true exit", async () => {
    counter += 1;
    const db = new WorkerFileDatabase(path.join(workDir, `resource-${counter}.db`), {
      readerWorkers: 2,
      statementTimeoutMs: 0,
      orphanGraceMs: 20,
    });
    await db.exec("CREATE TABLE resource_control (n INTEGER)");
    await db.prepare("SELECT 1").get();
    const control = new AbortController();
    const held = holdOrdinaryWorker(db, control.signal);
    const terminate = held.worker.terminate.bind(held.worker);
    const requested = vi.spyOn(held.worker, "terminate").mockResolvedValue(0);
    let exited = false;
    held.worker.once("exit", () => {
      exited = true;
    });
    try {
      await vi.waitFor(() => expect(Atomics.load(held.flags, 0)).toBe(1));
      const rejected = expect(held.pending).rejects.toBeInstanceOf(WorkerDbAbortError);
      control.abort();
      control.abort();
      await rejected;
      await vi.waitFor(() => expect(requested).toHaveBeenCalled());
      expect(exited).toBe(false);
      const scans = vi.fn();
      for (let attempt = 0; attempt < 4; attempt++)
        await expect(
          db.withPinnedReadView(async () => {
            scans();
            return 1;
          })
        ).rejects.toThrow(/unavailable/);
      expect(scans).not.toHaveBeenCalled();
      await db.prepare("INSERT INTO resource_control VALUES (9)").run();
      expect(await db.prepare("SELECT n FROM resource_control").get()).toEqual({ n: 9 });
      let closed = false;
      const closing = db.close();
      closing.then(() => {
        closed = true;
      });
      expect(db.close()).toBe(closing);
      expect(closed).toBe(false);
      held.release();
      requested.mockRestore();
      await terminate();
      await closing;
      expect(exited).toBe(true);
      expect(closed).toBe(true);
    } finally {
      held.release();
      requested.mockRestore();
      await terminate();
      await db.close();
    }
    const fresh = makeDb();
    try {
      expect(await fresh.withPinnedReadView((view) => view.prepare("SELECT 3 AS n").get())).toEqual(
        { n: 3 }
      );
    } finally {
      await fresh.close();
    }
  });

  it("reserves within the pool, expires the view, and leaves other traffic free", async () => {
    const db = makeDb();
    let release!: () => void;
    let entered!: () => void;
    let former: { prepare(sql: string): { get(): Promise<unknown> } } | undefined;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY)");
      const pin = db.withPinnedReadView(async (view) => {
        former = view;
        expect(await view.prepare("SELECT COUNT(*) AS n FROM t").get()).toEqual({ n: 0 });
        expect(() => view.prepare("ATTACH DATABASE 'unexpected' AS outside")).toThrow(
          /only SELECT/
        );
        await expect(view.exec("DELETE FROM t")).rejects.toThrow(/only SELECT/);
        entered();
        await held;
        return view.prepare("SELECT COUNT(*) AS n FROM t").get();
      });
      try {
        await ready;
        await expect(db.withPinnedReadView(async () => "unused")).rejects.toThrow(/unavailable/);
        await db.prepare("INSERT INTO t VALUES (1)").run();
        expect(await db.prepare("SELECT COUNT(*) AS n FROM t").get()).toEqual({ n: 1 });
        expect(db.readerPoolStats().size).toBe(2);
      } finally {
        release();
      }
      expect(await pin).toEqual({ n: 0 });
      await expect(former!.prepare("SELECT 1").get()).rejects.toThrow(/expired/);
      expect(await db.withPinnedReadView((view) => view.prepare("SELECT 2 AS n").get())).toEqual({
        n: 2,
      });
    } finally {
      await db.close();
    }
  });

  it("refuses when both ordinary reader slots are busy", async () => {
    const db = makeDb();
    const control = new AbortController();
    const readers: Promise<unknown>[] = [];
    try {
      await db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY)");
      const sql =
        "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<2500000) SELECT sum(x) FROM n";
      readers.push(
        ...withDbAbortSignal(control.signal, () => [db.prepare(sql).get(), db.prepare(sql).get()])
      );
      await vi.waitFor(() => expect(db.readerPoolStats().busy).toBe(2));
      await expect(db.withPinnedReadView(async () => "unused")).rejects.toThrow(/unavailable/);
      expect(await db.prepare("INSERT INTO t VALUES (1)").run()).toMatchObject({ changes: 1 });
    } finally {
      control.abort();
      await Promise.allSettled(readers);
      await db.close();
    }
  });

  it("releases the reservation at the whole-read deadline between statements", async () => {
    const db = makeDb();
    try {
      await db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY)");
      await expect(
        db.withPinnedReadView(async (view) => {
          await view.prepare("SELECT 1 AS n").get();
          return new Promise<never>(() => {});
        }, 150)
      ).rejects.toBeInstanceOf(WorkerDbTimeoutError);
      expect(await db.withPinnedReadView((view) => view.prepare("SELECT 2 AS n").get())).toEqual({
        n: 2,
      });
    } finally {
      await db.close();
    }
  });

  it("refuses a result that exceeds the budget before the timer callback runs", async () => {
    const db = makeDb();
    try {
      await db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY)");
      await db.prepare("SELECT 1 AS n").get();
      let entered = false;
      await expect(
        db.withPinnedReadView(async () => {
          entered = true;
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);
          return "late";
        }, 100)
      ).rejects.toBeInstanceOf(WorkerDbTimeoutError);
      expect(entered).toBe(true);
      expect(await db.withPinnedReadView((view) => view.prepare("SELECT 2 AS n").get())).toEqual({
        n: 2,
      });
    } finally {
      await db.close();
    }
  });

  it("retires an aborted pinned worker without routing its statement to the writer", async () => {
    const db = makeDb();
    const control = new AbortController();
    try {
      await db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY)");
      const pin = withDbAbortSignal(control.signal, () =>
        db.withPinnedReadView(async (view) => {
          const query = view
            .prepare(
              "SELECT sum(x) FROM (WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<2500000) SELECT x FROM n)"
            )
            .get();
          control.abort();
          return query;
        })
      );
      await expect(pin).rejects.toBeInstanceOf(WorkerDbAbortError);
      await vi.waitFor(async () =>
        expect(await db.withPinnedReadView((view) => view.prepare("SELECT 2 AS n").get())).toEqual({
          n: 2,
        })
      );
    } finally {
      await db.close();
    }
  });

  it("rejects an unfinished statement before releasing the view", async () => {
    const db = makeDb();
    let statement: Promise<unknown> | undefined;
    try {
      await db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY)");
      await expect(
        db.withPinnedReadView(async (view) => {
          statement = view.prepare("SELECT 1 AS n").get();
          return "unfinished";
        })
      ).rejects.toThrow(/unfinished statement/);
      await expect(statement).rejects.toBeInstanceOf(WorkerDbAbortError);
      await vi.waitFor(async () =>
        expect(await db.withPinnedReadView((view) => view.prepare("SELECT 2 AS n").get())).toEqual({
          n: 2,
        })
      );
    } finally {
      await db.close();
    }
  });

  it("never resumes a read view on a replacement after a worker exits", async () => {
    const db = makeDb();
    try {
      await db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY)");
      await expect(
        db.withPinnedReadView(async (view) => {
          await view.prepare("SELECT 1 AS n").get();
          await expect(db.__crashWorkerForTest("pinned")).rejects.toBeInstanceOf(
            WorkerDbCrashError
          );
          await expect(view.prepare("SELECT 2 AS n").get()).rejects.toBeInstanceOf(
            WorkerDbCrashError
          );
          return "unproved";
        })
      ).rejects.toBeInstanceOf(WorkerDbCrashError);
      expect(await db.withPinnedReadView((view) => view.prepare("SELECT 3 AS n").get())).toEqual({
        n: 3,
      });
    } finally {
      await db.close();
    }
  });
});

describe("WorkerFileDatabase reads do not wait for write transactions", () => {
  it("completes a read outside a transaction while a write transaction is still open", async () => {
    const db = makeDb(2);
    try {
      await db.exec("CREATE TABLE gate_t (id INTEGER PRIMARY KEY, v TEXT)");
      await db.prepare("INSERT INTO gate_t (v) VALUES (?)").run("committed");

      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let inserted!: () => void;
      const insertedSignal = new Promise<void>((resolve) => {
        inserted = resolve;
      });
      let committed = false;
      const tx = db
        .transaction(async (conn) => {
          await conn.prepare("INSERT INTO gate_t (v) VALUES (?)").run("uncommitted");
          inserted();
          await held;
        })
        .then(() => {
          committed = true;
        });

      await insertedSignal;
      // Read outside the transaction: must not wait for it, and must not see its row.
      const rows = (await db.prepare("SELECT v FROM gate_t ORDER BY id").all()) as { v: string }[];
      expect(committed).toBe(false);
      expect(rows.map((r) => r.v)).toEqual(["committed"]);

      release();
      await tx;
      const after = (await db.prepare("SELECT COUNT(*) AS n FROM gate_t").get()) as { n: number };
      expect(after.n).toBe(2);
    } finally {
      await db.close();
    }
  });

  it("still lets a read inside the transaction see its own uncommitted write", async () => {
    const db = makeDb(2);
    try {
      await db.exec("CREATE TABLE gate_t (id INTEGER PRIMARY KEY, v TEXT)");
      await db.transaction(async (conn) => {
        await conn.prepare("INSERT INTO gate_t (v) VALUES (?)").run("mine");
        const row = (await conn.prepare("SELECT v FROM gate_t").get()) as { v: string };
        expect(row.v).toBe("mine");
      });
    } finally {
      await db.close();
    }
  });

  it("keeps waiting for the open transaction when the pool has no readers", async () => {
    const db = makeDb(0);
    try {
      await db.exec("CREATE TABLE gate_t (id INTEGER PRIMARY KEY, v TEXT)");
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let inserted!: () => void;
      const insertedSignal = new Promise<void>((resolve) => {
        inserted = resolve;
      });
      const tx = db.transaction(async (conn) => {
        await conn.prepare("INSERT INTO gate_t (v) VALUES (?)").run("x");
        inserted();
        await held;
      });
      await insertedSignal;
      let readDone = false;
      const read = db
        .prepare("SELECT COUNT(*) AS n FROM gate_t")
        .get()
        .then((r) => {
          readDone = true;
          return r as { n: number };
        });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(readDone).toBe(false);
      release();
      await tx;
      expect((await read).n).toBe(1);
    } finally {
      await db.close();
    }
  });

  it("logs a transaction that holds the gate over three seconds, without bound values", async () => {
    const db = makeDb(2);
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    try {
      await db.exec("CREATE TABLE gate_t (id INTEGER PRIMARY KEY, v TEXT)");
      await db.transaction(async (conn) => {
        await conn.prepare("INSERT INTO gate_t (v) VALUES (?)").run("secret-value");
        await new Promise((resolve) => setTimeout(resolve, 3300));
      });
      const msg = warn.mock.calls.map((c) => String(c[0])).find((m) => m.includes("held the gate"));
      expect(msg).toBeDefined();
      expect(msg).toContain("First statement: INSERT INTO gate_t");
      expect(msg).toContain("waited for gate");
      expect(msg).toContain("reads are not affected");
      expect(msg).not.toContain("secret-value");
    } finally {
      warn.mockRestore();
      await db.close();
    }
  }, 30_000);

  it("reports event-loop delay and oldest queued wait in the pool snapshot", async () => {
    const db = makeDb(2);
    try {
      await db.prepare("SELECT 1 AS ok").get();
      const stats = db.readerPoolStats();
      expect(stats.oldestQueuedWaitMs).toBe(0);
      expect(stats.eventLoopDelaySinceLastSnapshotMs).not.toBeNull();
      expect(stats.eventLoopDelaySinceLastSnapshotMs?.max).toBeGreaterThanOrEqual(0);
    } finally {
      await db.close();
    }
  });
});

describe("WorkerFileDatabase retry of a read that writes", () => {
  it("waits for an open transaction before running the retried write on the writer", async () => {
    const db = makeDb(2);
    try {
      await db.exec("CREATE TABLE rt (id INTEGER PRIMARY KEY, v TEXT)");
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let inserted!: () => void;
      const insertedSignal = new Promise<void>((resolve) => {
        inserted = resolve;
      });
      const tx = db.transaction(async (conn) => {
        await conn.prepare("INSERT INTO rt (id, v) VALUES (1, 'tx')").run();
        inserted();
        await held;
      });
      await insertedSignal;

      // Read-shaped call that writes: rejected read-only on a reader, then
      // retried on the writer, which must not run inside the open transaction.
      // The rejection is injected because some worker drivers let the reader
      // block on the write lock instead of rejecting, which would never reach
      // the retry path this test pins.
      const dispatch = vi
        .spyOn(
          db as unknown as { dispatchRead: (...a: unknown[]) => Promise<unknown> },
          "dispatchRead"
        )
        .mockRejectedValueOnce(
          Object.assign(new Error("attempt to write a readonly database"), {
            code: "SQLITE_READONLY",
          })
        );
      let done = false;
      const retried = db
        .prepare("INSERT INTO rt (id, v) VALUES (2, 'retry') RETURNING id, v")
        .get()
        .then((r) => {
          done = true;
          return r;
        });
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(done).toBe(false);

      release();
      await tx;
      expect(await retried).toEqual({ id: 2, v: "retry" });
      expect(dispatch).toHaveBeenCalledTimes(1);
      const n = (await db.prepare("SELECT COUNT(*) AS n FROM rt").get()) as { n: number };
      expect(n.n).toBe(2);
    } finally {
      await db.close();
    }
  }, 30_000);
});

describe("oldestQueuedWaitMs", () => {
  it("reports the age of the oldest waiting statement, not the executing one or episode age", () => {
    // Reader A: executing since 1000 (not waiting), one waiting since 4000.
    // Reader B: only an executing statement since 500 (nothing waiting).
    expect(oldestQueuedWaitMs([[1000, 4000], [500]], 5000)).toBe(1000);
    expect(oldestQueuedWaitMs([[1000], [500]], 5000)).toBe(0);
    expect(
      oldestQueuedWaitMs(
        [
          [1000, 4500, 4900],
          [2000, 3000],
        ],
        5000
      )
    ).toBe(2000);
    expect(oldestQueuedWaitMs([], 5000)).toBe(0);
  });
});
