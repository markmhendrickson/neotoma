/**
 * Fixture test for scripts/validate_libsql_migration.ts (concurrent-backend plan).
 *
 * Exercises the migration-safety checker directly (not the CLI wrapper) against
 * a sqlite/libsql pair with deliberately injected divergence, so a broken
 * validator can't silently report "safe to migrate" on a bad database.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import { openLibsqlDatabase } from "../../src/repositories/libsql/libsql_driver.js";
import { validateMigration } from "../../scripts/validate_libsql_migration.js";

const workDir = mkdtempSync(path.join(tmpdir(), "neotoma-libsql-migration-validate-"));
const cleanups: Array<() => Promise<void>> = [];

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
  rmSync(workDir, { recursive: true, force: true });
});

let dbCounter = 0;
async function seedPair(
  seedSqlite: (db: AsyncSqliteDatabase) => Promise<void>,
  seedLibsql: (db: ReturnType<typeof openLibsqlDatabase>) => Promise<void>
): Promise<{ sqlite: AsyncSqliteDatabase; libsql: ReturnType<typeof openLibsqlDatabase> }> {
  dbCounter += 1;
  const sqliteFile = path.join(workDir, `sqlite-${dbCounter}.db`);
  const libsqlFile = path.join(workDir, `libsql-${dbCounter}.db`);

  const sqlite = new AsyncSqliteDatabase(sqliteFile);
  const libsql = openLibsqlDatabase(`file:${libsqlFile}`);
  cleanups.push(() => sqlite.close());
  cleanups.push(() => libsql.close());

  await seedSqlite(sqlite);
  await seedLibsql(libsql);

  return { sqlite, libsql };
}

const CREATE_ENTITIES = "CREATE TABLE entities (entity_id TEXT PRIMARY KEY, entity_type TEXT)";
const CREATE_SNAPSHOTS = `CREATE TABLE entity_snapshots (
  entity_id TEXT, entity_type TEXT, snapshot TEXT, computed_at TEXT
)`;

describe("validateMigration", () => {
  it("passes when sqlite and libsql views agree", async () => {
    const { sqlite, libsql } = await seedPair(
      async (db) => {
        await db.exec(CREATE_ENTITIES);
        await db.exec(CREATE_SNAPSHOTS);
        await db.prepare("INSERT INTO entities VALUES (?, ?)").run("e1", "contact");
        await db
          .prepare("INSERT INTO entity_snapshots VALUES (?, ?, ?, ?)")
          .run("e1", "contact", JSON.stringify({ name: "Alice" }), "2026-01-01T00:00:00Z");
      },
      async (db) => {
        await db.exec(CREATE_ENTITIES);
        await db.exec(CREATE_SNAPSHOTS);
        await db.prepare("INSERT INTO entities VALUES (?, ?)").run("e1", "contact");
        await db
          .prepare("INSERT INTO entity_snapshots VALUES (?, ?, ?, ?)")
          .run("e1", "contact", JSON.stringify({ name: "Alice" }), "2026-01-01T00:00:00Z");
      }
    );

    const result = await validateMigration(sqlite, libsql);

    expect(result.passed).toBe(true);
    expect(result.failedTables).toEqual([]);
    expect(result.messages.some((m) => m.includes("integrity_check: ok"))).toBe(true);
  });

  it("fails with the named table when row counts diverge (injected bad data)", async () => {
    const { sqlite, libsql } = await seedPair(
      async (db) => {
        await db.exec(CREATE_ENTITIES);
        await db.exec(CREATE_SNAPSHOTS);
        await db.prepare("INSERT INTO entities VALUES (?, ?)").run("e1", "contact");
        await db.prepare("INSERT INTO entities VALUES (?, ?)").run("e2", "contact");
      },
      async (db) => {
        await db.exec(CREATE_ENTITIES);
        await db.exec(CREATE_SNAPSHOTS);
        // Injected bad data: libsql copy is missing a row the source has.
        await db.prepare("INSERT INTO entities VALUES (?, ?)").run("e1", "contact");
      }
    );

    const result = await validateMigration(sqlite, libsql);

    expect(result.passed).toBe(false);
    expect(result.failedTables).toEqual(["entities"]);
    expect(result.messages.some((m) => m.includes("entities: sqlite=2 libsql=1"))).toBe(true);
  });

  it("fails when the snapshot spot check diverges between drivers", async () => {
    const { sqlite, libsql } = await seedPair(
      async (db) => {
        await db.exec(CREATE_ENTITIES);
        await db.exec(CREATE_SNAPSHOTS);
        await db
          .prepare("INSERT INTO entity_snapshots VALUES (?, ?, ?, ?)")
          .run("e1", "contact", JSON.stringify({ name: "Alice" }), "2026-01-01T00:00:00Z");
      },
      async (db) => {
        await db.exec(CREATE_ENTITIES);
        await db.exec(CREATE_SNAPSHOTS);
        // Injected bad data: same row count, but hydrated snapshot content differs.
        await db
          .prepare("INSERT INTO entity_snapshots VALUES (?, ?, ?, ?)")
          .run("e1", "contact", JSON.stringify({ name: "CORRUPTED" }), "2026-01-01T00:00:00Z");
      }
    );

    const result = await validateMigration(sqlite, libsql);

    expect(result.passed).toBe(false);
    expect(result.failedTables).toEqual([]);
    expect(result.messages.some((m) => m.includes("snapshot spot check: rows differ"))).toBe(
      true
    );
  });
});
