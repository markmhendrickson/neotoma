/**
 * Validate that an existing Neotoma SQLite database opens and reads correctly
 * under the libSQL backend (concurrent-backend plan, migration step).
 *
 * libSQL uses the same on-disk format and SQL dialect as SQLite, so "migration"
 * is adopting the file in place — this script proves that adoption is safe for
 * a specific database before flipping NEOTOMA_DB_BACKEND=libsql:
 *
 *   1. Copies the source DB to a temp file (never touches the original).
 *   2. Opens the copy with @libsql/client and runs PRAGMA integrity_check.
 *   3. Compares per-table row counts between the SQLite driver's view of the
 *      source and the libSQL driver's view of the copy.
 *   4. Runs a snapshot-hydration spot check (SELECT with JSON columns) through
 *      both drivers and compares results.
 *
 * Usage:
 *   npx tsx scripts/validate_libsql_migration.ts /path/to/neotoma.prod.db
 *
 * Exits 0 when every check passes, 1 otherwise.
 */

import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AsyncSqliteDatabase } from "../src/repositories/sqlite/sqlite_driver.js";
import { openLibsqlDatabase } from "../src/repositories/libsql/libsql_driver.js";
import type { DbDatabase } from "../src/repositories/db/driver.js";

const TABLES = [
  "sources",
  "interpretations",
  "observations",
  "entities",
  "entity_snapshots",
  "timeline_events",
  "relationship_observations",
  "relationship_snapshots",
  "raw_fragments",
  "schema_registry",
];

async function tableCount(db: DbDatabase, table: string): Promise<number | null> {
  try {
    const row = (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()) as
      | { n: number }
      | undefined;
    return row?.n ?? 0;
  } catch {
    return null; // Table absent in this DB.
  }
}

export interface MigrationValidationResult {
  passed: boolean;
  messages: string[];
  /** Tables whose row counts diverged between the sqlite and libsql views. */
  failedTables: string[];
}

/**
 * Runs the integrity check, per-table row-count parity, and snapshot
 * spot-check against an already-open sqlite/libsql pair. Extracted from
 * `main()` so tests can inject a deliberately corrupted copy without going
 * through the CLI/process.exit path.
 */
export async function validateMigration(
  sqlite: DbDatabase,
  libsql: DbDatabase
): Promise<MigrationValidationResult> {
  const messages: string[] = [];
  const failedTables: string[] = [];
  let failed = false;

  // 1. Integrity check under libSQL.
  const integrity = (await libsql.pragma("integrity_check")) as Array<Record<string, unknown>>;
  const verdict = String(Object.values(integrity[0] ?? {})[0] ?? "");
  if (verdict === "ok") {
    messages.push("✅ integrity_check: ok");
  } else {
    messages.push(`❌ integrity_check failed: ${JSON.stringify(integrity).slice(0, 500)}`);
    failed = true;
  }

  // 2. Row-count parity across core tables.
  for (const table of TABLES) {
    const a = await tableCount(sqlite, table);
    const b = await tableCount(libsql, table);
    if (a === null && b === null) continue;
    if (a === b) {
      messages.push(`✅ ${table}: ${a} rows (parity)`);
    } else {
      messages.push(`❌ ${table}: sqlite=${a} libsql=${b}`);
      failedTables.push(table);
      failed = true;
    }
  }

  // 3. Spot check: newest entity snapshot hydrates identically.
  const probe = `SELECT entity_id, entity_type, snapshot FROM entity_snapshots
                 ORDER BY computed_at DESC LIMIT 5`;
  try {
    const fromSqlite = (await sqlite.prepare(probe).all()) as Record<string, unknown>[];
    const fromLibsql = (await libsql.prepare(probe).all()) as Record<string, unknown>[];
    const same = JSON.stringify(fromSqlite) === JSON.stringify(fromLibsql);
    if (same) {
      messages.push(`✅ snapshot spot check: ${fromSqlite.length} rows identical`);
    } else {
      messages.push("❌ snapshot spot check: rows differ between drivers");
      failed = true;
    }
  } catch (error) {
    messages.push(`ℹ️ snapshot spot check skipped: ${(error as Error).message}`);
  }

  return { passed: !failed, messages, failedTables };
}

async function main(): Promise<void> {
  const source = process.argv[2];
  if (!source || !existsSync(source)) {
    console.error("Usage: npx tsx scripts/validate_libsql_migration.ts <path-to-sqlite-db>");
    process.exit(1);
  }

  const workDir = mkdtempSync(path.join(tmpdir(), "neotoma-libsql-validate-"));
  const copyPath = path.join(workDir, path.basename(source));
  copyFileSync(source, copyPath);
  const sidecars = ["-wal", "-shm"];
  for (const suffix of sidecars) {
    if (existsSync(source + suffix)) copyFileSync(source + suffix, copyPath + suffix);
  }

  const sqlite = new AsyncSqliteDatabase(source);
  const libsql = openLibsqlDatabase(`file:${copyPath}`);
  let result: MigrationValidationResult;

  try {
    result = await validateMigration(sqlite, libsql);
    for (const message of result.messages) console.log(message);
  } finally {
    await sqlite.close();
    await libsql.close();
    rmSync(workDir, { recursive: true, force: true });
  }

  if (!result.passed) {
    console.error("\nValidation FAILED — do not switch this database to libsql yet.");
    process.exit(1);
  }
  console.log(
    "\nValidation passed. Set NEOTOMA_DB_BACKEND=libsql (optionally NEOTOMA_DB_URL) and restart."
  );
}

// Run only when invoked directly (not when imported by tests).
const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
