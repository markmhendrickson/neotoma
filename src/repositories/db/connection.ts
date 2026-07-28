/**
 * Backend-agnostic DB connection lifecycle (concurrent-backend plan).
 *
 * Selects the driver from NEOTOMA_DB_BACKEND (`sqlite` default — synchronous
 * better-sqlite3/node:sqlite wrapped in the async contract; `libsql` —
 * statements off the event loop via worker-hosted driver for local files or
 * @libsql/client for remote sqld/Turso), opens the connection, applies
 * connection PRAGMAs, ensures the schema, and caches the handle.
 */

import { mkdirSync } from "fs";
import path from "path";
import { config } from "../../config.js";
import {
  applyConnectionPragmas,
  ensureSchema,
  SQLITE_BUSY_TIMEOUT_MS,
} from "../sqlite/sqlite_client.js";
import { AsyncSqliteDatabase } from "../sqlite/sqlite_driver.js";
import type { DbDatabase } from "./driver.js";

let cachedDb: DbDatabase | null = null;
let opening: Promise<DbDatabase> | null = null;

function libsqlUrl(): string {
  return config.dbUrl || `file:${config.sqlitePath}`;
}

/**
 * NEOTOMA_DB_URL is only honored by the libsql backend. On the default `sqlite`
 * backend it is otherwise ignored with no signal, so an operator who sets
 * `NEOTOMA_DB_URL=libsql://...` but forgets `NEOTOMA_DB_BACKEND=libsql` silently
 * gets the local sqlite file instead of the remote instance they intended (the
 * silent-misconfiguration gap flagged by the ux review on PR #1944).
 *
 * Returns a directive for the sqlite backend to act on:
 *  - `throw` for a remote URL — unambiguously incompatible with this backend, so
 *    fail loud at startup rather than open the wrong database.
 *  - `warn` for a divergent local `file:` URL — ignored but harmless, so surface
 *    it without hard-failing (a stale env value pointing at the same file, or a
 *    bare path equal to sqlitePath, is silent — nothing to flag).
 *  - `null` when there is nothing to flag.
 */
export function sqliteUrlMisconfig(
  dbUrl: string | undefined,
  sqlitePath: string
): { level: "throw" | "warn"; message: string } | null {
  if (!dbUrl) return null;
  const sameFile = dbUrl === `file:${sqlitePath}` || dbUrl === sqlitePath;
  if (sameFile) return null;
  if (/^(libsql|https?|wss?):\/\//i.test(dbUrl)) {
    return {
      level: "throw",
      message:
        `NEOTOMA_DB_URL is set to "${dbUrl}" but NEOTOMA_DB_BACKEND is "sqlite", ` +
        `which ignores it and opens the local file ${sqlitePath} instead. ` +
        `Set NEOTOMA_DB_BACKEND=libsql to use a remote sqld/Turso URL, or unset NEOTOMA_DB_URL.`,
    };
  }
  return {
    level: "warn",
    message:
      `[neotoma] NEOTOMA_DB_URL="${dbUrl}" is ignored on the sqlite backend; ` +
      `opening ${sqlitePath}. Set NEOTOMA_DB_BACKEND=libsql to honor NEOTOMA_DB_URL.`,
  };
}

function ensureParentDirForFileUrl(url: string): void {
  if (!url.startsWith("file:")) return;
  const filePath = url.slice("file:".length).replace(/^\/\//, "/");
  mkdirSync(path.dirname(filePath), { recursive: true });
}

async function openDb(): Promise<DbDatabase> {
  if (config.dbBackend === "libsql") {
    const { openLibsqlDatabase } = await import("../libsql/libsql_driver.js");
    const url = libsqlUrl();
    ensureParentDirForFileUrl(url);
    const db = openLibsqlDatabase(url, {
      authToken: config.dbAuthToken || undefined,
      busyTimeoutMs: SQLITE_BUSY_TIMEOUT_MS,
    });
    // Connection PRAGMAs are per-connection concepts; remote sqld manages its
    // own journal mode and lock handling, so only apply them to local files.
    if (url.startsWith("file:")) {
      await applyConnectionPragmas(db);
    }
    await ensureSchema(db);
    return db;
  }

  // Guard the silent-misconfiguration footgun (ux review, PR #1944): see
  // sqliteUrlMisconfig() below.
  const misconfig = sqliteUrlMisconfig(config.dbUrl, config.sqlitePath);
  if (misconfig?.level === "throw") throw new Error(misconfig.message);
  if (misconfig?.level === "warn") console.warn(misconfig.message);

  const dbPath = config.sqlitePath;
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new AsyncSqliteDatabase(dbPath);
  await applyConnectionPragmas(db);
  await ensureSchema(db);
  return db;
}

/**
 * Get the cached DB handle, opening (and schema-initializing) it on first use.
 * Concurrent first calls share one open — no double-initialization race.
 */
export function getDb(): Promise<DbDatabase> {
  if (cachedDb) return Promise.resolve(cachedDb);
  if (!opening) {
    opening = openDb()
      .then((db) => {
        cachedDb = db;
        return db;
      })
      .catch((error) => {
        opening = null;
        throw error;
      });
  }
  return opening;
}

/**
 * Clear the cached connection. The next getDb() opens a new one (creating the
 * DB file if missing). Call after I/O errors (disk I/O error, DB file deleted
 * while the server was running).
 */
export function clearDbCache(): void {
  if (cachedDb) {
    const stale = cachedDb;
    cachedDb = null;
    opening = null;
    stale.close().catch(() => {
      // Ignore close errors (e.g. file already deleted).
    });
  } else {
    opening = null;
  }
}

/**
 * Ensure a local database file exists with Neotoma schema initialized, using
 * the configured backend. Used by init to eagerly provision both dev and prod
 * databases.
 */
export async function ensureDbInitialized(dbPath: string): Promise<void> {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  let db: DbDatabase;
  if (config.dbBackend === "libsql") {
    const { openLibsqlDatabase } = await import("../libsql/libsql_driver.js");
    db = openLibsqlDatabase(`file:${dbPath}`, { busyTimeoutMs: SQLITE_BUSY_TIMEOUT_MS });
  } else {
    db = new AsyncSqliteDatabase(dbPath);
  }
  try {
    await applyConnectionPragmas(db);
    await ensureSchema(db);
  } finally {
    await db.close();
  }
}
