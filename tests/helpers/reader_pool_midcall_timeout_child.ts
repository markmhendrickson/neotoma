/**
 * Child-process fixture for reader_pool_midcall_timeout.test.ts. Runs in its own
 * process because the regression it guards is a process-wide SIGABRT (neon
 * PendingException, exit 134) that would otherwise kill the test runner.
 *
 * Forces a statement-timeout reclaim while the reader worker is inside a long
 * native read, then outlives the orphan grace window (which on the old code
 * force-terminated the worker mid-call), then proves the pool still serves reads.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  WorkerDbTimeoutError,
  WorkerFileDatabase,
} from "../../src/repositories/worker/worker_file_database.js";

const db = new WorkerFileDatabase(path.join(mkdtempSync(path.join(tmpdir(), "reader-abort-")), "t.db"), {
  readerWorkers: 2,
  statementTimeoutMs: 30,
  orphanGraceMs: 30,
});
await db.exec("CREATE TABLE load (id INTEGER PRIMARY KEY, v TEXT)");
await db.exec(`
  WITH RECURSIVE cnt(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM cnt WHERE x < 1500)
  INSERT INTO load (v) SELECT hex(randomblob(96)) FROM cnt
`);
const ITERATIONS = 100;
let timeouts = 0;
for (let i = 0; i < ITERATIONS; i += 1) {
  const sql = "SELECT a.v AS x, b.v AS y FROM load a, load b";
  // .all() over a huge result re-enters JS from the addon every few rows
  // (the path that makes a mid-call terminate fatal), unlike a single-row
  // aggregate. Timeout and grace are tiny so the old force-terminate lands
  // while the worker is still inside the addon; it is a race, hence a loop
  // with both readers abandoned at once.
  const settled = await Promise.allSettled([db.prepare(sql).all(), db.prepare(sql).all()]);
  for (const r of settled) {
    if (r.status === "rejected" && r.reason instanceof WorkerDbTimeoutError) timeouts += 1;
  }
  await new Promise((resolve) => setTimeout(resolve, 40));
}
// Capacity returns once the draining orphans finish; until then a read may
// itself hit the (deliberately tiny) budget while queued behind one.
let after: unknown;
let attempts = 0;
const t0 = Date.now();
const deadline = Date.now() + 60_000;
while (after === undefined && Date.now() < deadline) {
  try {
    attempts += 1;
    after = await db.prepare("SELECT 1 AS ok").get();
  } catch (error) {
    if (!(error instanceof WorkerDbTimeoutError)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
await db.close();
console.log(JSON.stringify({ timeouts, after, attempts, recoveryMs: Date.now() - t0 }));
