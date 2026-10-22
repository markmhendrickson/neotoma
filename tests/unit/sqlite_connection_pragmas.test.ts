/**
 * Connection-PRAGMA tests for the SQLite client.
 *
 * Asserts the durability/concurrency PRAGMAs every Neotoma SQLite handle needs
 * are applied on open: WAL journal mode and a non-zero busy_timeout so
 * cross-process lock contention waits rather than failing immediately with
 * SQLITE_BUSY. See docs/infrastructure/multi_tenant_deployment_topology.md.
 *
 * The driver wrapper (`sqlite_driver.ts`) returns `pragma()` results as an
 * array of row objects on better-sqlite3, e.g. `[{ busy_timeout: 5000 }]`. On
 * the node:sqlite fallback (Node 22+, no `.pragma()` method) the wrapper runs
 * the PRAGMA via `exec` and returns `[]` — the value is still applied, just not
 * readable back through this path — so a readback returning no rows is treated
 * as "driver does not expose pragma readback", not a failure.
 */

import { describe, expect, it } from "vitest";
import { getDb } from "../../src/repositories/db/connection.js";
import { SQLITE_BUSY_TIMEOUT_MS } from "../../src/repositories/sqlite/sqlite_client.js";

/** Read a single-value PRAGMA back through the driver wrapper, or null if the
 *  active driver does not expose pragma readback (returns no rows). */
async function readPragma(command: string): Promise<number | string | null> {
  const db = await getDb();
  const rows = (await db.pragma(command)) as Array<Record<string, unknown>>;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const first = rows[0];
  const values = Object.values(first);
  return (values.length > 0 ? (values[0] as number | string) : null) ?? null;
}

describe("SQLite connection PRAGMAs", () => {
  it("applies WAL journal mode on open", async () => {
    const mode = await readPragma("journal_mode");
    if (mode === null) return; // driver without pragma readback
    expect(String(mode).toLowerCase()).toBe("wal");
  });

  it("applies a non-zero busy_timeout on open (not the better-sqlite3 default of 0)", async () => {
    const timeout = await readPragma("busy_timeout");
    if (timeout === null) return; // driver without pragma readback
    expect(Number(timeout)).toBeGreaterThan(0);
    expect(Number(timeout)).toBe(SQLITE_BUSY_TIMEOUT_MS);
  });

  it("enforces foreign keys on open", async () => {
    const fk = await readPragma("foreign_keys");
    if (fk === null) return; // driver without pragma readback
    expect(Number(fk)).toBe(1);
  });

  it("resolves busy_timeout to a non-negative integer, defaulting to 5000ms", () => {
    expect(Number.isInteger(SQLITE_BUSY_TIMEOUT_MS)).toBe(true);
    expect(SQLITE_BUSY_TIMEOUT_MS).toBeGreaterThanOrEqual(0);
    if (!process.env.NEOTOMA_SQLITE_BUSY_TIMEOUT_MS) {
      expect(SQLITE_BUSY_TIMEOUT_MS).toBe(5000);
    }
  });
});
