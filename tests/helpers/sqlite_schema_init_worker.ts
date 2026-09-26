/**
 * Standalone entry point spawned as a child process by
 * tests/unit/sqlite_schema_init_concurrency.test.ts. Each invocation opens a
 * fresh SQLite connection against NEOTOMA_SQLITE_PATH via the real
 * ensureDbInitialized() path (applyConnectionPragmas + ensureSchema) —
 * separate process, separate module cache, mirroring how real vitest worker
 * processes each open the shared DB file independently. Prints a single JSON
 * line to stdout: either {"ok": true, "tables": [...]}, or {"ok": false,
 * "code": <sqlite error code or "unknown">} on failure. Never throws past
 * this boundary — the parent test asserts on the JSON payload, not on
 * process exit behavior.
 *
 * If WORKER_SYNC_AT_MS is set (epoch ms), this process busy-waits until that
 * instant before opening the DB, so N sibling workers (spawned with slightly
 * staggered process-start times) still hit ensureDbInitialized()'s
 * first-touch ensureSchema() within the same instant — reproducing the
 * two-readers-race-to-upgrade window the original bug required, rather than
 * relying on raw process-spawn jitter alone.
 */
import { ensureDbInitialized } from "../../src/repositories/db/connection.js";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";

const syncAtMs = process.env.WORKER_SYNC_AT_MS ? Number(process.env.WORKER_SYNC_AT_MS) : null;
const dbPath = process.env.NEOTOMA_SQLITE_PATH as string;

async function main(): Promise<void> {
  if (syncAtMs !== null) {
    while (Date.now() < syncAtMs) {
      // Busy-wait (not setTimeout/sleep) to land as close as possible to the
      // shared instant — this is a short-lived test synchronization barrier,
      // not a production code path.
    }
  }

  await ensureDbInitialized(dbPath);

  // ensureDbInitialized closes its own connection; reopen read-only-in-intent
  // to list the resulting schema without re-running init.
  const verifyDb = new AsyncSqliteDatabase(dbPath);
  try {
    const rows = (await verifyDb
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()) as { name: string }[];
    process.stdout.write(JSON.stringify({ ok: true, tables: rows.map((r) => r.name) }) + "\n");
  } finally {
    await verifyDb.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    const code = (error as { code?: string } | undefined)?.code ?? "unknown";
    process.stdout.write(
      JSON.stringify({ ok: false, code, message: String((error as Error)?.message ?? error) }) + "\n"
    );
    process.exit(1);
  });
