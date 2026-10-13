/**
 * Idempotency-under-concurrency (concurrent-backend plan, PR #1944 arch §3).
 *
 * The store path dedups content-addressed observations with a check-then-write:
 * `SELECT ... WHERE id = ?`, and if absent, `INSERT`. Waxwing's arch review
 * flagged that moving off the fully-synchronous better-sqlite3 driver removes
 * the incidental mutex the blocking driver provided — two concurrent identical
 * stores can now both pass the existence check before either inserts (a TOCTOU
 * the old single-threaded driver structurally prevented).
 *
 * The real idempotency guarantee is therefore NOT the check — it is the PRIMARY
 * KEY / UNIQUE constraint on `observations.id` (a deterministic content hash).
 * This test asserts that guarantee holds under genuine concurrency on BOTH
 * backends (AsyncSqlite and the worker-hosted libsql local file): N concurrent
 * inserts of the same-id row settle with exactly one success and the rest
 * rejected by the constraint, leaving exactly one row. It also asserts the
 * check-then-write dedup returns the existing row on a sequential re-store.
 *
 * Testing at the driver layer (not the config-selected adapter singleton)
 * lets both backends run in one process and targets the exact invariant:
 * the constraint survived the async conversion and holds off the main thread.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { DbDatabase } from "../../src/repositories/db/driver.js";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import { openLibsqlDatabase } from "../../src/repositories/libsql/libsql_driver.js";

const workDir = mkdtempSync(path.join(tmpdir(), "neotoma-idem-"));
const cleanups: Array<() => Promise<void>> = [];

afterAll(async () => {
  for (const c of cleanups) await c();
  rmSync(workDir, { recursive: true, force: true });
});

let counter = 0;
function makeDb(backend: "sqlite" | "libsql"): DbDatabase {
  counter += 1;
  const file = path.join(workDir, `${backend}-${counter}.db`);
  const db: DbDatabase =
    backend === "sqlite" ? new AsyncSqliteDatabase(file) : openLibsqlDatabase(`file:${file}`);
  cleanups.push(() => db.close());
  return db;
}

/** Minimal observations table with the id uniqueness the store path relies on. */
async function createObservationsTable(db: DbDatabase): Promise<void> {
  await db.exec(`
    CREATE TABLE observations (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      user_id TEXT,
      fields TEXT
    )
  `);
}

function isUniqueViolation(error: unknown): boolean {
  const msg = String((error as { message?: string })?.message ?? error).toLowerCase();
  const code = String((error as { code?: string })?.code ?? "").toUpperCase();
  return (
    msg.includes("unique") ||
    msg.includes("primary key") ||
    msg.includes("constraint") ||
    code.startsWith("SQLITE_CONSTRAINT")
  );
}

describe.each(["sqlite", "libsql"] as const)(
  "idempotency under concurrency (%s backend)",
  (backend) => {
    it("N concurrent inserts of the same observation id yield exactly one row", async () => {
      const db = makeDb(backend);
      await createObservationsTable(db);

      const OBS_ID = "obs_content_hash_fixed_1";
      const insertOnce = () =>
        db
          .prepare("INSERT INTO observations (id, entity_id, user_id, fields) VALUES (?, ?, ?, ?)")
          .run(OBS_ID, "ent_target", "u1", JSON.stringify({ title: "same content" }));

      // Fire concurrent duplicate inserts with no cross-check. On a
      // fully-synchronous driver only one could ever be mid-flight; here they
      // race, so the id constraint is the only thing preventing a double write.
      const results = await Promise.allSettled(Array.from({ length: 8 }, insertOnce));

      const ok = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(ok.length).toBe(1);
      expect(rejected.length).toBe(7);
      // Every failure must be the uniqueness constraint, not some other error.
      for (const r of rejected) expect(isUniqueViolation(r.reason)).toBe(true);

      const count = (await db
        .prepare("SELECT COUNT(*) AS n FROM observations WHERE id = ?")
        .get(OBS_ID)) as { n: number };
      expect(count.n).toBe(1);
    }, 30_000);

    it("check-then-write dedup: a sequential re-store of the same id is a no-op", async () => {
      const db = makeDb(backend);
      await createObservationsTable(db);
      const OBS_ID = "obs_seq_dedup_1";

      const storeIfAbsent = async (): Promise<"inserted" | "existing"> => {
        const existing = await db.prepare("SELECT id FROM observations WHERE id = ?").get(OBS_ID);
        if (existing) return "existing";
        await db
          .prepare("INSERT INTO observations (id, entity_id, user_id) VALUES (?, ?, ?)")
          .run(OBS_ID, "ent_target", "u1");
        return "inserted";
      };

      expect(await storeIfAbsent()).toBe("inserted");
      expect(await storeIfAbsent()).toBe("existing");
      const count = (await db.prepare("SELECT COUNT(*) AS n FROM observations").get()) as {
        n: number;
      };
      expect(count.n).toBe(1);
    });
  }
);
