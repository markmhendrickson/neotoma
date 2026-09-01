/**
 * Transaction integrity on the worker-hosted backend under concurrency
 * (neotoma#2280).
 *
 * Making servers default to the worker pool is only safe if transactions stay
 * atomic across it. A pool that handed successive statements of one transaction
 * to different connections would break transactions *silently* — a correctness
 * regression far worse than the latency it fixes, because slow is visible and
 * wrong is not. This is a hot path: every session and daemon reads through it.
 *
 * The invariants pinned here:
 *   - writes serialize (SQLite has one writer), so no lost updates;
 *   - a transaction's statements all land on the writer connection, so
 *     read-modify-write across an `await` is safe;
 *   - a failed transaction rolls back completely;
 *   - statements outside a transaction cannot resolve inside its window;
 *   - statements inside a transaction see its own uncommitted writes.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { WorkerFileDatabase } from "../../src/repositories/worker/worker_file_database.js";

const workDir = mkdtempSync(path.join(tmpdir(), "neotoma-tx-integrity-"));

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("worker backend transaction integrity", () => {
  it("serializes concurrent transactions with no lost updates", async () => {
    const db = new WorkerFileDatabase(path.join(workDir, "transfers.db"));
    try {
      await db.exec("CREATE TABLE acct (id INTEGER PRIMARY KEY, bal INTEGER)");
      await db.exec("INSERT INTO acct (id, bal) VALUES (1, 0), (2, 0)");

      const TRANSFERS = 40;
      await Promise.all(
        Array.from({ length: TRANSFERS }, () =>
          db.transaction(async (tx) => {
            const row = (await tx.prepare("SELECT bal FROM acct WHERE id = 1").get()) as {
              bal: number;
            };
            // Read-modify-write spanning an await: correct only if the
            // transaction holds the writer exclusively for its whole body.
            await new Promise((resolve) => setImmediate(resolve));
            await tx.prepare("UPDATE acct SET bal = ? WHERE id = 1").run(row.bal + 1);
            await tx.prepare("UPDATE acct SET bal = bal - 1 WHERE id = 2").run();
          })
        )
      );

      const a = (await db.prepare("SELECT bal FROM acct WHERE id = 1").get()) as { bal: number };
      const b = (await db.prepare("SELECT bal FROM acct WHERE id = 2").get()) as { bal: number };
      expect(a.bal).toBe(TRANSFERS);
      // Double-entry invariant: every debit has its credit.
      expect(a.bal + b.bal).toBe(0);
    } finally {
      await db.close();
    }
  }, 60_000);

  it("rolls a failed transaction back completely", async () => {
    const db = new WorkerFileDatabase(path.join(workDir, "rollback.db"));
    try {
      await db.exec("CREATE TABLE t (v INTEGER)");
      await expect(
        db.transaction(async (tx) => {
          await tx.prepare("INSERT INTO t (v) VALUES (1)").run();
          await tx.prepare("INSERT INTO t (v) VALUES (2)").run();
          throw new Error("boom");
        })
      ).rejects.toThrow("boom");

      const row = (await db.prepare("SELECT COUNT(*) AS n FROM t").get()) as { n: number };
      expect(row.n).toBe(0);
    } finally {
      await db.close();
    }
  }, 60_000);

  it("holds outside statements out of an open transaction's window", async () => {
    const db = new WorkerFileDatabase(path.join(workDir, "isolation.db"));
    try {
      await db.exec("CREATE TABLE t (v INTEGER)");

      let txOpen = true;
      let resolvedWhileOpen = false;

      const txDone = db
        .transaction(async (tx) => {
          await tx.prepare("INSERT INTO t (v) VALUES (99)").run();
          await new Promise((resolve) => setTimeout(resolve, 120));
        })
        .then(() => {
          txOpen = false;
        });

      await new Promise((resolve) => setTimeout(resolve, 20));
      const outsideRead = db
        .prepare("SELECT COUNT(*) AS n FROM t WHERE v = 99")
        .get()
        .then((row) => {
          if (txOpen) resolvedWhileOpen = true;
          return row;
        });

      await txDone;
      const row = (await outsideRead) as { n: number };

      // Asserting on the value alone would not be a valid isolation test: by
      // the time the awaited read resolves the commit has landed, so a correct
      // implementation legitimately returns the committed row. What matters is
      // that it could not resolve *during* the transaction.
      expect(resolvedWhileOpen).toBe(false);
      expect(row.n).toBe(1);
    } finally {
      await db.close();
    }
  }, 60_000);

  it("lets statements inside a transaction see its own uncommitted writes", async () => {
    const db = new WorkerFileDatabase(path.join(workDir, "self_visible.db"));
    try {
      await db.exec("CREATE TABLE t (v INTEGER)");
      let seen = -1;
      await db.transaction(async (tx) => {
        await tx.prepare("INSERT INTO t (v) VALUES (1234)").run();
        const row = (await tx.prepare("SELECT COUNT(*) AS n FROM t WHERE v = 1234").get()) as {
          n: number;
        };
        seen = row.n;
      });
      expect(seen).toBe(1);
    } finally {
      await db.close();
    }
  }, 60_000);
});
