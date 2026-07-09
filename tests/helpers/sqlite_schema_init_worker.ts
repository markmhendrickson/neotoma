/**
 * Standalone entry point spawned as a child process by
 * tests/unit/sqlite_schema_init_concurrency.test.ts. Each invocation opens a
 * fresh SQLite connection against NEOTOMA_SQLITE_PATH via the real
 * getSqliteDb()/ensureSchema() path — separate process, separate module
 * cache, mirroring how real vitest worker processes each open the shared DB
 * file independently. Prints a single JSON line to stdout: either
 * {"ok": true, "tables": [...]}, or {"ok": false, "code": <sqlite error
 * code or "unknown">} on failure. Never throws past this boundary — the
 * parent test asserts on the JSON payload, not on process exit behavior.
 *
 * If WORKER_SYNC_AT_MS is set (epoch ms), this process busy-waits until that
 * instant before opening the DB, so N sibling workers (spawned with slightly
 * staggered process-start times) still hit getSqliteDb()'s first-touch
 * ensureSchema() within the same instant — reproducing the two-readers-race-
 * to-upgrade window the original bug required, rather than relying on raw
 * process-spawn jitter alone.
 */
import { getSqliteDb } from "../../src/repositories/sqlite/sqlite_client.js";

const syncAtMs = process.env.WORKER_SYNC_AT_MS ? Number(process.env.WORKER_SYNC_AT_MS) : null;
if (syncAtMs !== null) {
  while (Date.now() < syncAtMs) {
    // Busy-wait (not setTimeout/sleep) to land as close as possible to the
    // shared instant — this is a short-lived test synchronization barrier,
    // not a production code path.
  }
}

try {
  const db = getSqliteDb();
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
    name: string;
  }[];
  process.stdout.write(JSON.stringify({ ok: true, tables: rows.map((r) => r.name) }) + "\n");
  process.exit(0);
} catch (error) {
  const code = (error as { code?: string } | undefined)?.code ?? "unknown";
  process.stdout.write(JSON.stringify({ ok: false, code, message: String((error as Error)?.message ?? error) }) + "\n");
  process.exit(1);
}
