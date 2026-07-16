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
