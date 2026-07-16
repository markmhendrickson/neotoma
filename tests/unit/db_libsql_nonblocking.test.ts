/**
 * Regression test for the bottega8 event-loop freeze (concurrent-backend plan).
 *
 * With the synchronous SQLite driver, ANY slow query blocks the entire Node
 * event loop — health checks, the web UI, and concurrent MCP requests all
 * stall for the query's duration (observed live on a hosted instance: a
 * deep-offset include_snapshots contact query froze the server for 4.8–7.5s).
 *
 * The libSQL backend executes statements off the event loop. This test
 * asserts that symptom is fixed: while a multi-second query runs, a
 * concurrent trivial query (standing in for GET /health) completes promptly
 * and the event loop keeps ticking.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { openLibsqlDatabase } from "../../src/repositories/libsql/libsql_driver.js";

const workDir = mkdtempSync(path.join(tmpdir(), "neotoma-nonblocking-"));

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("libsql backend does not block the event loop", () => {
  it("answers a concurrent health-check query while a slow query runs", async () => {
    const db = openLibsqlDatabase(`file:${path.join(workDir, "slow.db")}`);
    try {
      await db.exec("CREATE TABLE load (id INTEGER PRIMARY KEY, v TEXT)");
      await db.exec(`
        WITH RECURSIVE cnt(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM cnt WHERE x < 6000)
        INSERT INTO load (v) SELECT hex(randomblob(96)) FROM cnt
      `);

      let slowDone = false;
      const slowStart = Date.now();
      const slowQuery = (
        db.prepare("SELECT COUNT(*) AS n FROM load a, load b WHERE a.v < b.v").get() as Promise<{
          n: number;
        }>
      ).then((row) => {
        slowDone = true;
        return row;
      });

      // Give the slow query a moment to actually start executing.
      await new Promise((resolve) => setTimeout(resolve, 25));

      const healthStart = Date.now();
      const health = await db.prepare("SELECT 1 AS ok").get();
      const healthMs = Date.now() - healthStart;
      const healthFinishedFirst = !slowDone;

      const slow = await slowQuery;
      const slowMs = Date.now() - slowStart;

      expect(slow.n).toBeGreaterThan(0);
      // The blocking signature (what the sync driver produces): the event
      // loop cannot resolve the health check until the slow query finishes,
      // so healthMs ~= slowMs and the slow query always completes first.
      // Assertions are relative to the measured slow-query duration, never
      // absolute wall-clock, so CPU saturation from parallel test workers
      // cannot produce false failures.
      expect(healthMs).toBeLessThan(Math.max(200, slowMs / 2));
      if (slowMs > 300) {
        expect(healthFinishedFirst).toBe(true);
      }
    } finally {
      await db.close();
    }
  }, 60_000);
});
