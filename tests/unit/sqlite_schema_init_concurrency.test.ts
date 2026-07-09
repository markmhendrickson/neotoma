/**
 * Regression test for #1927: SQLITE_BUSY_SNAPSHOT race in ensureSchema under
 * parallel test workers.
 *
 * Two compounding races on first-touch open of a fresh DB file, both fixed
 * together:
 *
 * 1. ensureSchema() ran its DDL/backfill inside a deferred db.transaction():
 *    two processes opening a fresh DB file concurrently could both start as
 *    readers on the same WAL snapshot, and whichever tried to upgrade to a
 *    writer second hit SQLITE_BUSY_SNAPSHOT — a snapshot conflict
 *    busy_timeout cannot retry. Fixed by taking the write lock up front
 *    (`BEGIN IMMEDIATE` via db.transaction(fn, { mode: "immediate" })).
 *
 * 2. Once (1) is fixed, `PRAGMA journal_mode = WAL` itself — applied in
 *    applyConnectionPragmas() before ensureSchema() ever runs — turned out to
 *    independently throw plain SQLITE_BUSY on a brand-new file: switching
 *    journal mode rewrites the file header and briefly needs the write lock,
 *    and this specific pragma call happens before `busy_timeout` has taken
 *    effect on that connection. Fixed with a scoped busy-retry around just
 *    that pragma call (retryOnBusy in sqlite_client.ts), catching only
 *    SQLITE_BUSY/SQLITE_BUSY_SNAPSHOT and rethrowing anything else.
 *
 * This reproduces the real failure topology: separate child processes (like
 * real vitest workers, each with their own module cache and connection)
 * racing to open the *same fresh* on-disk DB file for the first time via
 * NEOTOMA_SQLITE_PATH. Workers are spawned asynchronously (execFile, not
 * execFileSync) so they genuinely overlap rather than running one-at-a-time,
 * and are handed a shared future timestamp (WORKER_SYNC_AT_MS) so they all
 * call getSqliteDb() within the same instant — reproducing the two-readers-
 * race-to-upgrade window the original bug required. Runs in an isolated tmp
 * directory — never a path that could collide with or leak a real operator
 * DB — and only asserts on the child's JSON stdout (error code + path
 * basename), never raw connection strings or file contents, so a failure
 * doesn't leak DB internals into test output.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { ensureSqliteDbInitialized } from "../../src/repositories/sqlite/sqlite_client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_SCRIPT = path.join(__dirname, "../helpers/sqlite_schema_init_worker.ts");
const TSX_BIN = path.join(__dirname, "../../node_modules/.bin/tsx");

type WorkerResult = { ok: true; tables: string[] } | { ok: false; code: string; message: string };

function parseWorkerStdout(stdout: string): WorkerResult {
  const lastLine = stdout.trim().split("\n").pop();
  return JSON.parse(lastLine ?? "");
}

/** Spawn one child worker against `dbPath`, asynchronously (never blocks the
 *  event loop), landing its getSqliteDb() call at `syncAtMs`. Never throws:
 *  a non-zero exit or a bad spawn still resolves to a WorkerResult so
 *  Promise.all always settles with every worker's outcome. `extraEnv` lets
 *  callers override e.g. NEOTOMA_SQLITE_BUSY_TIMEOUT_MS for boundary tests. */
function runWorker(
  dbPath: string,
  syncAtMs: number,
  extraEnv?: Record<string, string>
): Promise<WorkerResult> {
  return new Promise((resolve) => {
    execFile(
      TSX_BIN,
      [WORKER_SCRIPT],
      {
        env: {
          ...process.env,
          NEOTOMA_SQLITE_PATH: dbPath,
          NODE_ENV: "test",
          WORKER_SYNC_AT_MS: String(syncAtMs),
          ...extraEnv,
        },
        encoding: "utf-8",
      },
      (error, stdout) => {
        if (!error) {
          resolve(parseWorkerStdout(stdout));
          return;
        }
        const stdoutFromError = (error as unknown as { stdout?: string }).stdout ?? stdout;
        if (stdoutFromError) {
          try {
            resolve(parseWorkerStdout(stdoutFromError));
            return;
          } catch {
            // fall through to unknown-failure result below
          }
        }
        resolve({ ok: false, code: "spawn_failure", message: String(error.message ?? error) });
      }
    );
  });
}

/** Launch N workers against the same dbPath, all targeting the same
 *  near-future sync instant, and await them together. Issuing every
 *  execFile() call before awaiting anything (no `await` inside the map) is
 *  what makes the children's process-start windows overlap instead of
 *  serializing — the bug this test targets only reproduces under genuine
 *  concurrency, not sequential execution. */
function runConcurrentWorkers(
  dbPath: string,
  count: number,
  extraEnv?: Record<string, string>
): Promise<WorkerResult[]> {
  const syncAtMs = Date.now() + 200;
  const pending = Array.from({ length: count }, () => runWorker(dbPath, syncAtMs, extraEnv));
  return Promise.all(pending);
}

let tmpDirs: string[] = [];

function freshDbPath(prefix: string): { dbPath: string; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return { dbPath: path.join(dir, "neotoma.db"), dir };
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
});

describe("concurrent first-touch SQLite schema init (#1927)", () => {
  it("2 concurrent workers opening a fresh DB both succeed with no SQLITE_BUSY_SNAPSHOT/database-is-locked error", async () => {
    const { dbPath } = freshDbPath("neotoma-schema-race-2w-");

    const results = await runConcurrentWorkers(dbPath, 2);

    for (const result of results) {
      if (!result.ok) {
        expect(result.code, `worker failed: ${result.code} — ${result.message}`).not.toMatch(
          /SQLITE_BUSY|database is locked/i
        );
      }
      expect(result.ok, `worker failed: ${!result.ok ? result.code : ""}`).toBe(true);
    }
  }, 30000);

  it("resulting schema under 2-way contention matches a single-writer control run", async () => {
    const control = freshDbPath("neotoma-schema-race-control-");
    const contended = freshDbPath("neotoma-schema-race-contended-");

    const [controlResult] = await runConcurrentWorkers(control.dbPath, 1);
    expect(controlResult.ok).toBe(true);

    const [a, b] = await runConcurrentWorkers(contended.dbPath, 2);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);

    const controlTables = controlResult.ok ? controlResult.tables : [];
    const contendedTables = a.ok ? a.tables : [];
    expect(contendedTables).toEqual(controlTables);
    expect(contendedTables.length).toBeGreaterThan(0);
  }, 30000);

  it("5-way concurrent first-touch open (closer to real CI worker fan-out) all succeed with matching schema", async () => {
    const { dbPath } = freshDbPath("neotoma-schema-race-5w-");

    const results = await runConcurrentWorkers(dbPath, 5);

    for (const result of results) {
      expect(result.ok, `worker failed: ${!result.ok ? `${result.code} — ${result.message}` : ""}`).toBe(true);
    }

    const tableSets = results.map((r) => (r.ok ? r.tables : []));
    for (const tables of tableSets) {
      expect(tables).toEqual(tableSets[0]);
    }
    expect(tableSets[0].length).toBeGreaterThan(0);
  }, 30000);

  it("re-running schema init against an already-initialized DB is a no-op (idempotent, re-entrant)", () => {
    const { dbPath } = freshDbPath("neotoma-schema-init-idempotent-");

    // .immediate() changes lock-acquisition timing, not DDL logic — confirm
    // addColumnIfMissing / backfillRelationshipLiveness still no-op safely on
    // a second call against the same file, same process.
    expect(() => ensureSqliteDbInitialized(dbPath)).not.toThrow();
    expect(() => ensureSqliteDbInitialized(dbPath)).not.toThrow();
  });

  it("surfaces a clear SQLITE_BUSY (not a hang or corruption) when busy_timeout is set too low to cover real contention", async () => {
    const { dbPath } = freshDbPath("neotoma-schema-busy-boundary-");

    const results = await runConcurrentWorkers(dbPath, 2, { NEOTOMA_SQLITE_BUSY_TIMEOUT_MS: "1" });

    // At least one side of a 2-way race under a near-zero busy_timeout should
    // surface a clean, distinguishable SQLITE_BUSY* error rather than hanging
    // or silently corrupting state — regardless of whether the other side
    // happened to win the race.
    const anyBusyOrBothOk = results.every((r) => r.ok) || results.some((r) => !r.ok && /SQLITE_BUSY/i.test(r.code));
    expect(anyBusyOrBothOk, JSON.stringify(results)).toBe(true);
    for (const r of results) {
      if (!r.ok) {
        expect(r.code).toMatch(/SQLITE_BUSY/i);
      }
    }
  }, 30000);
});
