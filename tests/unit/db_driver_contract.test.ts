/**
 * Async DB driver contract tests (concurrent-backend plan).
 *
 * Runs the same behavioral suite against both backends — the synchronous
 * SQLite driver wrapped in the async contract, and the libSQL driver — so a
 * backend swap via NEOTOMA_DB_BACKEND cannot silently change semantics:
 * run/get/all results, positional-vs-array binding, run() change counts,
 * transaction commit/rollback atomicity, statement isolation while a
 * transaction is open, and the AsyncLocalStorage join rule (statements issued
 * on the db handle inside a transaction callback land inside the transaction).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { DbDatabase } from "../../src/repositories/db/driver.js";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import { openLibsqlDatabase } from "../../src/repositories/libsql/libsql_driver.js";

const workDir = mkdtempSync(path.join(tmpdir(), "neotoma-driver-contract-"));
const cleanups: Array<() => Promise<void>> = [];

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
  rmSync(workDir, { recursive: true, force: true });
});

let dbCounter = 0;
function makeDb(backend: "sqlite" | "libsql"): DbDatabase {
  dbCounter += 1;
  const file = path.join(workDir, `${backend}-${dbCounter}.db`);
  const db: DbDatabase =
    backend === "sqlite" ? new AsyncSqliteDatabase(file) : openLibsqlDatabase(`file:${file}`);
  cleanups.push(() => db.close());
  return db;
}

describe.each(["sqlite", "libsql"] as const)("db driver contract (%s)", (backend) => {
  it("runs DDL/DML and reads rows back as plain objects", async () => {
    const db = makeDb(backend);
    await db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, score REAL)");

    const insert = await db
      .prepare("INSERT INTO t (id, name, score) VALUES (?, ?, ?)")
      .run(1, "alpha", 1.5);
    expect(insert.changes).toBe(1);

    // Array-style binding (adapter passes a values array as a single arg).
    await db.prepare("INSERT INTO t (id, name, score) VALUES (?, ?, ?)").run([2, "beta", 2.5]);

    const row = (await db.prepare("SELECT * FROM t WHERE id = ?").get(1)) as Record<
      string,
      unknown
    >;
    expect(row).toEqual({ id: 1, name: "alpha", score: 1.5 });
    // Must be spreadable/JSON-serializable like a plain object.
    expect({ ...row }).toEqual({ id: 1, name: "alpha", score: 1.5 });

    const all = (await db.prepare("SELECT * FROM t ORDER BY id").all()) as Record<
      string,
      unknown
    >[];
    expect(all.map((r) => r.name)).toEqual(["alpha", "beta"]);

    const missing = await db.prepare("SELECT * FROM t WHERE id = ?").get(999);
    expect(missing).toBeUndefined();
  });

  it("binds null/undefined/boolean values safely", async () => {
    const db = makeDb(backend);
    await db.exec("CREATE TABLE b (id INTEGER PRIMARY KEY, flag INTEGER, note TEXT)");
    await db.prepare("INSERT INTO b (id, flag, note) VALUES (?, ?, ?)").run(1, true, null);
    const row = (await db.prepare("SELECT * FROM b WHERE id = 1").get()) as Record<
      string,
      unknown
    >;
    expect(row.flag).toBe(1);
    expect(row.note).toBeNull();
  });

  it("reports UPDATE/DELETE change counts", async () => {
    const db = makeDb(backend);
    await db.exec("CREATE TABLE c (id INTEGER PRIMARY KEY, v TEXT)");
    await db.prepare("INSERT INTO c (id, v) VALUES (1, 'x'), (2, 'x'), (3, 'y')").run();
    const updated = await db.prepare("UPDATE c SET v = 'z' WHERE v = 'x'").run();
    expect(updated.changes).toBe(2);
    const deleted = await db.prepare("DELETE FROM c WHERE v = 'z'").run();
    expect(deleted.changes).toBe(2);
  });

  it("commits a transaction and returns the callback result", async () => {
    const db = makeDb(backend);
    await db.exec("CREATE TABLE tx (id INTEGER PRIMARY KEY, v TEXT)");
    const result = await db.transaction(async (tx) => {
      await tx.prepare("INSERT INTO tx (id, v) VALUES (?, ?)").run(1, "committed");
      const inserted = await tx.prepare("SELECT v FROM tx WHERE id = 1").get();
      return inserted;
    });
    expect(result).toEqual({ v: "committed" });
    const persisted = await db.prepare("SELECT COUNT(*) AS n FROM tx").get();
    expect(persisted).toEqual({ n: 1 });
  });

  it("rolls back the whole transaction when the callback throws", async () => {
    const db = makeDb(backend);
    await db.exec("CREATE TABLE rb (id INTEGER PRIMARY KEY, v TEXT)");
    await expect(
      db.transaction(async (tx) => {
        await tx.prepare("INSERT INTO rb (id, v) VALUES (1, 'a')").run();
        await tx.prepare("INSERT INTO rb (id, v) VALUES (2, 'b')").run();
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    const count = await db.prepare("SELECT COUNT(*) AS n FROM rb").get();
    expect(count).toEqual({ n: 0 });
  });

  it("keeps statements issued outside an open transaction out of it", async () => {
    const db = makeDb(backend);
    await db.exec("CREATE TABLE iso (id INTEGER PRIMARY KEY, v TEXT)");

    let outsideDone = false;
    let insideDone = false;
    const txPromise = db.transaction(async (tx) => {
      await tx.prepare("INSERT INTO iso (id, v) VALUES (1, 'in-tx')").run();
      // Yield so a queued outside write would have the chance to interleave
      // if the gate were broken.
      await new Promise((resolve) => setTimeout(resolve, 30));
      insideDone = true;
      throw new Error("rollback-please");
    });
    // Issued while the transaction is open, from OUTSIDE its async context:
    // must queue until the transaction settles, then apply independently.
    const outsidePromise = db
      .prepare("INSERT INTO iso (id, v) VALUES (2, 'outside')")
      .run()
      .then(() => {
        outsideDone = true;
        expect(insideDone).toBe(true); // gate held it until the tx settled
      });

    await expect(txPromise).rejects.toThrow("rollback-please");
    await outsidePromise;
    expect(outsideDone).toBe(true);

    const rows = (await db.prepare("SELECT id, v FROM iso ORDER BY id").all()) as Array<{
      id: number;
      v: string;
    }>;
    // The tx insert rolled back; the outside insert survived independently.
    expect(rows).toEqual([{ id: 2, v: "outside" }]);
  });

  it("routes db-handle statements inside a transaction callback into the transaction", async () => {
    const db = makeDb(backend);
    await db.exec("CREATE TABLE als (id INTEGER PRIMARY KEY, v TEXT)");
    await expect(
      db.transaction(async () => {
        // Uses the db handle, not the tx handle — must join the open
        // transaction (old synchronous semantics), not deadlock or escape it.
        await db.prepare("INSERT INTO als (id, v) VALUES (1, 'joined')").run();
        throw new Error("undo");
      })
    ).rejects.toThrow("undo");
    const count = await db.prepare("SELECT COUNT(*) AS n FROM als").get();
    expect(count).toEqual({ n: 0 }); // joined the tx, so it rolled back too
  });

  it("serializes back-to-back transactions", async () => {
    const db = makeDb(backend);
    await db.exec("CREATE TABLE seq (id INTEGER PRIMARY KEY AUTOINCREMENT, tag TEXT)");
    await Promise.all(
      ["a", "b", "c"].map((tag) =>
        db.transaction(async (tx) => {
          await tx.prepare("INSERT INTO seq (tag) VALUES (?)").run(tag);
          await new Promise((resolve) => setTimeout(resolve, 5));
          await tx.prepare("INSERT INTO seq (tag) VALUES (?)").run(tag);
        })
      )
    );
    const rows = (await db.prepare("SELECT tag FROM seq ORDER BY id").all()) as Array<{
      tag: string;
    }>;
    // Each transaction's two inserts must be adjacent (no interleaving).
    for (let i = 0; i < rows.length; i += 2) {
      expect(rows[i].tag).toBe(rows[i + 1].tag);
    }
  });

  it("supports pragma()", async () => {
    const db = makeDb(backend);
    const rows = await db.pragma("journal_mode = WAL");
    expect(Array.isArray(rows)).toBe(true);
  });
});
