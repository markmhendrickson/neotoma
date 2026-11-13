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
import { TransactionGate } from "../../src/repositories/db/driver.js";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
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
