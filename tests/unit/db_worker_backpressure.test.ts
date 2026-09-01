/**
 * Bounded worker queue (neotoma#2280 follow-through).
 *
 * Moving statements off the event loop stops a slow query from freezing the
 * process, but it does not make the database faster. If arrivals outpace what
 * SQLite can retire, the backlog has to go somewhere — and unbounded, it goes
 * into the heap, trading an event-loop stall for unbounded memory growth and an
 * eventual OOM. That is strictly worse than being slow: it takes the process
 * down and loses every queued request rather than just delaying them.
 *
 * So the per-connection queue is bounded and overflow is rejected fast, with an
 * error naming the limit and how to raise it. These tests pin both halves: a
 * realistic burst is never shed, and genuine saturation sheds rather than grows.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  DEFAULT_MAX_QUEUED_STATEMENTS,
  WorkerFileDatabase,
  WorkerDbOverloadError,
} from "../../src/repositories/worker/worker_file_database.js";

const workDir = mkdtempSync(path.join(tmpdir(), "neotoma-backpressure-"));

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("worker queue backpressure", () => {
  it("does not shed a realistic concurrent burst under the default limit", async () => {
    const db = new WorkerFileDatabase(path.join(workDir, "burst.db"));
    try {
      await db.exec("CREATE TABLE t (v INTEGER)");
      const results = await Promise.allSettled(
        Array.from({ length: 300 }, () => db.prepare("SELECT 1 AS ok").get())
      );
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(0);
    } finally {
      await db.close();
    }
  }, 60_000);

  it("rejects overflow with an actionable error instead of growing the queue", async () => {
    const previous = process.env.NEOTOMA_DB_MAX_QUEUED_STATEMENTS;
    process.env.NEOTOMA_DB_MAX_QUEUED_STATEMENTS = "10";
    const db = new WorkerFileDatabase(path.join(workDir, "overflow.db"));
    try {
      await db.exec("CREATE TABLE t (v INTEGER)");
      const results = await Promise.allSettled(
        Array.from({ length: 200 }, () => db.prepare("SELECT 1 AS ok").get())
      );
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected"
      );

      // Some are shed — the queue is bounded, not elastic.
      expect(rejected.length).toBeGreaterThan(0);
      // Accepted work still completes; shedding does not fail the whole batch.
      expect(results.length - rejected.length).toBeGreaterThan(0);

      const reason = rejected[0].reason as Error;
      expect(reason).toBeInstanceOf(WorkerDbOverloadError);
      // The message must tell an operator what to do about it.
      expect(reason.message).toMatch(/queue is full/i);
      expect(reason.message).toMatch(/NEOTOMA_DB_MAX_QUEUED_STATEMENTS/);
    } finally {
      await db.close();
      if (previous === undefined) delete process.env.NEOTOMA_DB_MAX_QUEUED_STATEMENTS;
      else process.env.NEOTOMA_DB_MAX_QUEUED_STATEMENTS = previous;
    }
  }, 60_000);

  it("keeps a default bound well above any legitimate burst", () => {
    expect(DEFAULT_MAX_QUEUED_STATEMENTS).toBeGreaterThanOrEqual(256);
  });
});
