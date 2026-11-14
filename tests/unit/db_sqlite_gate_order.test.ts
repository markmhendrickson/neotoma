/**
 * Non-transaction statements must not run inside another caller's transaction.
 *
 * The sqlite driver used to `await gate.whenIdle()` (a snapshot of the gate
 * tail) before running a statement synchronously on its single connection. A
 * transaction enqueued after that snapshot began first, so the statement ran
 * inside it and was undone when that transaction rolled back, although the
 * caller had been told it succeeded. Same class as the worker backend's
 * read-your-writes defect (see db_worker_file_database.test.ts).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { logger } from "../../src/utils/logger.js";
import {
  TransactionGate,
  deferUntilCurrentTransactionSettles,
} from "../../src/repositories/db/driver.js";
import Database, { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import type { DbDatabase } from "../../src/repositories/db/driver.js";

const dir = mkdtempSync(path.join(tmpdir(), "neotoma-gate-order-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function scenario(db: DbDatabase) {
  await db.exec("CREATE TABLE g (id INTEGER PRIMARY KEY, v TEXT)");
  let releaseA!: () => void;
  const heldA = new Promise<void>((r) => (releaseA = r));
  let aStarted!: () => void;
  const aStartedSignal = new Promise<void>((r) => (aStarted = r));
  const txA = db.transaction(async (tx) => {
    await tx.prepare("INSERT INTO g (v) VALUES (?)").run("a");
    aStarted();
    await heldA;
  });
  await aStartedSignal;
  // Issued while only A is open; C queues after it and will roll back.
  const write = db.prepare("INSERT INTO g (v) VALUES (?)").run("marker");
  const txC = db
    .transaction(async (tx) => {
      await tx.prepare("INSERT INTO g (v) VALUES (?)").run("c");
      throw new Error("rollback C");
    })
    .catch(() => undefined);
  releaseA();
  await txA;
  await write;
  await txC;
  return (await db.prepare("SELECT v FROM g ORDER BY id").all()) as { v: string }[];
}

describe("non-transaction statements keep their place behind the gate", () => {
  it("sqlite: a write issued before a rolled-back transaction is not undone by it", async () => {
    const db = new AsyncSqliteDatabase(path.join(dir, "s.db"));
    try {
      expect((await scenario(db)).map((r) => r.v)).toEqual(["a", "marker"]);
    } finally {
      await db.close();
    }
  });
});

describe("slow-hold log wording", () => {
  it("labels a slow single statement as a statement, not a long transaction", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    try {
      const gate = new TransactionGate();
      await gate.runInOrder(
        () => new Promise<void>((resolve) => setTimeout(resolve, 3100)),
        undefined,
        () => "INSERT INTO t"
      );
      const msg = warn.mock.calls.map((c) => String(c[0])).find((m) => m.includes("held the gate"));
      expect(msg).toContain("DB single statement held the gate");
      expect(msg).toContain("Statement: INSERT INTO t");
      expect(msg).not.toContain("long write transaction");
    } finally {
      warn.mockRestore();
    }
  }, 10_000);
});

/**
 * deferUntilCurrentTransactionSettles: in-memory caches of committed rows use
 * it to wait until a write inside a transaction is committed or rolled back
 * (src/repositories/db/schema_registry_cache.ts).
 */
describe("transaction settle effects", () => {
  it("returns false outside a transaction, and inside a single gated statement", async () => {
    let ran = false;
    expect(deferUntilCurrentTransactionSettles(() => (ran = true))).toBe(false);
    const gate = new TransactionGate();
    const inStatement = await gate.runInOrder(async () =>
      deferUntilCurrentTransactionSettles(() => (ran = true))
    );
    expect(inStatement).toBe(false);
    expect(ran).toBe(false);
  });

  it("returns false once the transaction has settled, for a late registration", async () => {
    const gate = new TransactionGate();
    let late!: Promise<boolean>;
    await gate.runExclusive(async () => {
      // Fire-and-forget work that outlives the transaction's callback.
      late = new Promise((resolve) =>
        setTimeout(() => resolve(deferUntilCurrentTransactionSettles(() => undefined)), 20)
      );
    });
    expect(await late).toBe(false);
  });

  it("runs after the transaction body and before the next queued transaction starts", async () => {
    const gate = new TransactionGate();
    const log: string[] = [];
    let releaseFirst!: () => void;
    const heldFirst = new Promise<void>((resolve) => (releaseFirst = resolve));
    const first = gate.runExclusive(async () => {
      expect(deferUntilCurrentTransactionSettles(() => log.push("first:effect"))).toBe(true);
      await heldFirst;
      log.push("first:end");
    });
    const second = gate.runExclusive(async () => {
      log.push("second:start");
    });
    const statement = gate.runInOrder(async () => {
      log.push("statement");
    });
    releaseFirst();
    await Promise.all([first, second, statement]);
    expect(log).toEqual(["first:end", "first:effect", "second:start", "statement"]);
  });

  it("runs after COMMIT and after ROLLBACK on a real sqlite transaction", async () => {
    const file = path.join(dir, "settle.db");
    const db = new AsyncSqliteDatabase(file);
    // A second connection sees only committed rows.
    let observer: Database | null = null;
    try {
      await db.exec("CREATE TABLE s (v TEXT)");
      observer = new Database(file);
      const committedRows = () =>
        (observer!.prepare("SELECT v FROM s ORDER BY v").all() as Array<{ v: string }>).map(
          (r) => r.v
        );

      const seen: Record<string, string[]> = {};
      await db.transaction(async (tx) => {
        await tx.prepare("INSERT INTO s (v) VALUES (?)").run("committed");
        deferUntilCurrentTransactionSettles(() => (seen.commit = committedRows()));
        // Not yet visible to another connection while the body runs.
        expect(committedRows()).toEqual([]);
      });
      expect(seen.commit).toEqual(["committed"]);

      await expect(
        db.transaction(async (tx) => {
          await tx.prepare("INSERT INTO s (v) VALUES (?)").run("rolled_back");
          deferUntilCurrentTransactionSettles(() => (seen.rollback = committedRows()));
          throw new Error("roll back");
        })
      ).rejects.toThrow("roll back");
      expect(seen.rollback).toEqual(["committed"]);
    } finally {
      observer?.close();
      await db.close();
    }
  });

  it("keeps running effects, and releases the gate, when an effect throws", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    try {
      const gate = new TransactionGate();
      const log: string[] = [];
      await gate.runExclusive(async () => {
        deferUntilCurrentTransactionSettles(() => {
          throw new Error("effect failed");
        });
        deferUntilCurrentTransactionSettles(() => log.push("second effect"));
      });
      // The gate was released: a queued transaction runs, and does not hang.
      await gate.runExclusive(async () => {
        log.push("next transaction");
      });
      expect(log).toEqual(["second effect", "next transaction"]);
      expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).toContain("effect failed");
    } finally {
      warn.mockRestore();
    }
  });
});
