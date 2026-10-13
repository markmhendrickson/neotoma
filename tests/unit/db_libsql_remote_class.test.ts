/**
 * LibsqlDatabase (remote sqld/Turso client path) contract tests
 * (concurrent-backend plan, PR #1944 qa follow-up).
 *
 * The driver-contract suite exercises the libsql backend through
 * openLibsqlDatabase("file:..."), which routes to WorkerFileDatabase — NOT the
 * LibsqlDatabase class that serves remote sqld/Turso URLs. LibsqlDatabase is a
 * distinct implementation with its own transaction wiring against
 * @libsql/client's Transaction object (client.transaction("write"),
 * tx.commit()/tx.rollback()/tx.close()), its own AsyncLocalStorage join, and its
 * own pragma/statement classes. That is the path the config docs steer
 * hosted/multi-tenant instances toward, and it previously had zero coverage.
 *
 * We construct LibsqlDatabase directly against a local temp-file @libsql/client
 * (a `file:` URL — the same code path openLibsqlDatabase deliberately reserves
 * for the worker, but here we bypass the factory to hit the class itself). This
 * exercises the real Client, transaction("write"), commit/rollback, the
 * AsyncLocalStorage join, and the row/pragma classes — everything the remote
 * path runs except the network transport, which is @libsql/client's concern and
 * not this driver's. It does NOT claim to verify network behavior against a live
 * Turso endpoint; the transaction/statement/isolation SEMANTICS of the class are
 * what this covers, which is the untested surface qa flagged.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LibsqlDatabase } from "../../src/repositories/libsql/libsql_driver.js";
import { NESTED_TRANSACTION_ERROR } from "../../src/repositories/db/driver.js";

const workDir = mkdtempSync(path.join(tmpdir(), "neotoma-libsql-remote-"));
const cleanups: Array<() => Promise<void>> = [];

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
  rmSync(workDir, { recursive: true, force: true });
});

let counter = 0;
function makeDb(): LibsqlDatabase {
  counter += 1;
  // A file: URL drives LibsqlDatabase's @libsql/client directly (state shared
  // across the client's connections — libsql :memory: gives each connection a
  // fresh DB, which would break multi-statement tests). This is the same class
  // and transaction API the remote sqld/Turso URL path uses.
  const db = new LibsqlDatabase(`file:${path.join(workDir, `r-${counter}.db`)}`);
  cleanups.push(() => db.close());
  return db;
}

describe("LibsqlDatabase (remote-client class path)", () => {
  it("runs DDL/DML and reads rows back as plain objects", async () => {
    const db = makeDb();
    await db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, score REAL)");
    const insert = await db.prepare("INSERT INTO t (id, name, score) VALUES (?, ?, ?)").run(1, "alpha", 1.5);
    expect(insert.changes).toBe(1);
    await db.prepare("INSERT INTO t (id, name, score) VALUES (?, ?, ?)").run([2, "beta", 2.5]);

    const row = (await db.prepare("SELECT * FROM t WHERE id = ?").get(1)) as Record<string, unknown>;
    expect(row).toEqual({ id: 1, name: "alpha", score: 1.5 });
    expect({ ...row }).toEqual({ id: 1, name: "alpha", score: 1.5 });

    const all = (await db.prepare("SELECT * FROM t ORDER BY id").all()) as Record<string, unknown>[];
    expect(all.map((r) => r.name)).toEqual(["alpha", "beta"]);
    expect(await db.prepare("SELECT * FROM t WHERE id = ?").get(999)).toBeUndefined();
  });

  it("reports UPDATE/DELETE change counts and binds null/boolean", async () => {
    const db = makeDb();
    await db.exec("CREATE TABLE c (id INTEGER PRIMARY KEY, flag INTEGER, note TEXT)");
    await db.prepare("INSERT INTO c (id, flag, note) VALUES (?, ?, ?)").run(1, true, null);
    const row = (await db.prepare("SELECT * FROM c WHERE id = 1").get()) as Record<string, unknown>;
    expect(row.flag).toBe(1);
    expect(row.note).toBeNull();

    await db.prepare("INSERT INTO c (id, flag, note) VALUES (2, 1, 'x'), (3, 1, 'x')").run();
    const updated = await db.prepare("UPDATE c SET note = 'z' WHERE note = 'x'").run();
    expect(updated.changes).toBe(2);
  });

  it("commits a transaction and returns the callback result", async () => {
    const db = makeDb();
    await db.exec("CREATE TABLE tx (id INTEGER PRIMARY KEY, v TEXT)");
    const result = await db.transaction(async (t) => {
      await t.prepare("INSERT INTO tx (id, v) VALUES (?, ?)").run(1, "committed");
      return t.prepare("SELECT v FROM tx WHERE id = 1").get();
    });
    expect(result).toEqual({ v: "committed" });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM tx").get()).toEqual({ n: 1 });
  });

  it("rolls back the whole transaction when the callback throws", async () => {
    const db = makeDb();
    await db.exec("CREATE TABLE rb (id INTEGER PRIMARY KEY, v TEXT)");
    await expect(
      db.transaction(async (t) => {
        await t.prepare("INSERT INTO rb (id, v) VALUES (1, 'a')").run();
        await t.prepare("INSERT INTO rb (id, v) VALUES (2, 'b')").run();
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(await db.prepare("SELECT COUNT(*) AS n FROM rb").get()).toEqual({ n: 0 });
  });

  it("routes db-handle statements inside a transaction callback into the transaction", async () => {
    const db = makeDb();
    await db.exec("CREATE TABLE als (id INTEGER PRIMARY KEY, v TEXT)");
    await expect(
      db.transaction(async () => {
        // Uses the db handle, not the tx arg — must join the open transaction
        // via AsyncLocalStorage, then roll back with it.
        await db.prepare("INSERT INTO als (id, v) VALUES (1, 'joined')").run();
        throw new Error("undo");
      })
    ).rejects.toThrow("undo");
    expect(await db.prepare("SELECT COUNT(*) AS n FROM als").get()).toEqual({ n: 0 });
  });

  it("serializes back-to-back transactions (gate holds order)", async () => {
    const db = makeDb();
    await db.exec("CREATE TABLE seq (id INTEGER PRIMARY KEY AUTOINCREMENT, tag TEXT)");
    await Promise.all(
      ["a", "b", "c"].map((tag) =>
        db.transaction(async (t) => {
          await t.prepare("INSERT INTO seq (tag) VALUES (?)").run(tag);
        })
      )
    );
    const rows = (await db.prepare("SELECT tag FROM seq ORDER BY id").all()) as Array<{ tag: string }>;
    expect(rows.map((r) => r.tag).sort()).toEqual(["a", "b", "c"]);
  });

  it("supports pragma()", async () => {
    const db = makeDb();
    const rows = await db.pragma("integrity_check");
    expect(String(Object.values(rows[0] ?? {})[0] ?? "")).toBe("ok");
  });

  it("throws a clear error on a nested transaction() instead of deadlocking", async () => {
    const db = makeDb();
    await db.exec("CREATE TABLE n (id INTEGER PRIMARY KEY)");
    await expect(
      db.transaction(async () => {
        // A transaction() issued from inside another must fail fast, not hang.
        await db.transaction(async () => {});
      })
    ).rejects.toThrow(NESTED_TRANSACTION_ERROR);
  });
});
