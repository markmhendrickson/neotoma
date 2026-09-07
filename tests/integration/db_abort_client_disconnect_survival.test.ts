/**
 * A client that hangs up mid-query must not kill the server (#2316).
 *
 * The bug being guarded is "the process dies", so these tests assert process
 * LIVENESS, not error shape. An in-process test cannot do that: the crash is an
 * unhandled rejection escaping to Node's default `--unhandled-rejections=throw`
 * handler, and vitest installs its own handler that catches it — which is
 * exactly why the existing unit coverage in
 * `tests/unit/db_worker_file_database.test.ts` passed throughout the outage.
 * So each case runs a real server in a CHILD PROCESS, disconnects a client
 * mid-query, and then asserts the child is still alive AND still serving.
 *
 * Reproduced trace this guards (production, Fly v25, Node 20):
 *
 *   WorkerDbAbortError: DB request aborted by caller
 *       at EventTarget.onAbort (worker_file_database.js:338:34)
 *       at AbortController.abort (node:internal/abort_controller:392:5)
 *       at ServerResponse.onClose (middleware/db_abort_context.js:32:28)
 *       at emitCloseNT (node:_http_server:1019:10)
 *
 * The neon `PendingException` SIGABRT reported alongside it is downstream of
 * this same unhandled rejection: with the rejection handled, twelve
 * back-to-back mid-statement worker terminations leave the process alive, so
 * it needs no separate guard. `expectAliveAndServing` covers both, since a
 * SIGABRT would fail the liveness assertion just as an exit(1) does.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";

const workDir = mkdtempSync(path.join(tmpdir(), "neotoma-abort-survival-"));
const repoRoot = path.resolve(__dirname, "..", "..");
/** Child entry scripts go here so bare imports resolve; removed in afterAll. */
const entryDir = mkdtempSync(path.join(repoRoot, "node_modules", ".neotoma-abort-test-"));
const entries: string[] = [];
let nextEntry = 0;

let child: ChildProcess | undefined;

afterEach(() => {
  child?.kill("SIGKILL");
  child = undefined;
});

afterAll(() => {
  for (const entry of entries) rmSync(entry, { force: true });
  rmSync(entryDir, { recursive: true, force: true, maxRetries: 2 });
  rmSync(workDir, { recursive: true, force: true, maxRetries: 2 });
});

/**
 * A minimal server that reproduces the production topology: the real
 * `dbAbortContext` middleware over the real `WorkerFileDatabase`, with a
 * handler that leaves a slow read in flight when its client goes away.
 *
 * Deliberately not the full Neotoma app — booting that needs auth, schemas and
 * migrations, none of which are part of this bug, and all of which would make a
 * failure ambiguous between "crashed on abort" and "failed to start".
 */
function serverSource(dbPath: string, statementTimeoutMs = 0): string {
  return `
import http from "node:http";
import express from "express";
import { WorkerFileDatabase } from ${JSON.stringify(path.join(repoRoot, "dist/repositories/worker/worker_file_database.js"))};
import { dbAbortContext } from ${JSON.stringify(path.join(repoRoot, "dist/middleware/db_abort_context.js"))};

const db = new WorkerFileDatabase(${JSON.stringify(dbPath)}, {
  readerWorkers: 1,               // 1 reader == the production saturation case
  statementTimeoutMs: ${statementTimeoutMs}, // 0 == abort is the only lever, as in the outage
});

await db.exec("CREATE TABLE load (id INTEGER PRIMARY KEY, v TEXT)");
await db.exec(
  "WITH RECURSIVE cnt(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM cnt WHERE x<4000) " +
  "INSERT INTO load (v) SELECT hex(randomblob(96)) FROM cnt"
);
const SLOW = "SELECT COUNT(*) AS n FROM load a, load b WHERE a.v < b.v";

const app = express();
app.use(dbAbortContext());

// Liveness probe: must not touch the DB, so it answers even if a reader is
// wedged, and a green answer means "the process is up" and nothing more.
app.get("/ping", (_req, res) => res.json({ ok: true }));

// A fast read, to prove the DB layer still SERVES after a reclamation rather
// than merely surviving one.
app.get("/fast", async (_req, res) => {
  try {
    res.json(await db.prepare("SELECT 1 AS ok").get());
  } catch (e) {
    res.status(500).json({ error: String(e && e.message) });
  }
});

// The abandoned slow read. The handler starts it and stops caring, which is
// what an SSE handler and an early-returning handler both do in production.
app.get("/slow", (_req, res) => {
  void db.prepare(SLOW).get();
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.write("started");
});

// A read left to exceed its statement budget with nobody waiting. Same
// reclamation path as the abort, reached by the timeout instead — so this
// needs no client disconnect at all.
app.get("/runaway", (_req, res) => {
  void db.prepare(SLOW).get();
  res.json({ started: true });
});

// The production trigger: a long-lived SSE stream the client is EXPECTED to
// abandon, with a read in flight behind it.
app.get("/events/stream", (_req, res) => {
  void db.prepare(SLOW).get();
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.write("event: open\\ndata: {}\\n\\n");
});

const server = http.createServer(app);
server.listen(0, "127.0.0.1", () => {
  process.stdout.write("LISTENING " + server.address().port + "\\n");
});
`;
}

/** Boot the child server and resolve its base URL once it reports LISTENING. */
async function startServer(
  name: string,
  statementTimeoutMs = 0
): Promise<{ base: string; child: ChildProcess }> {
  const dir = mkdtempSync(path.join(workDir, `${name}-`));
  // The entry file must live INSIDE the repo tree: Node resolves bare imports
  // (`express`) from the importing file's directory upward, and a script in
  // the OS temp dir finds no node_modules. The database still lives in the
  // temp dir, so nothing durable is written into the checkout.
  const entry = path.join(entryDir, `server-${name}-${process.pid}-${nextEntry++}.mjs`);
  entries.push(entry);
  writeFileSync(entry, serverSource(path.join(dir, "db.sqlite"), statementTimeoutMs));

  const proc = spawn(process.execPath, [entry], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  proc.stderr?.on("data", (d) => (stderr += String(d)));

  const port = await new Promise<string>((resolve, reject) => {
    let out = "";
    const timer = setTimeout(
      () => reject(new Error(`server did not start in 60s.\nstderr:\n${stderr}`)),
      60_000
    );
    proc.stdout?.on("data", (d) => {
      out += String(d);
      const m = out.match(/LISTENING (\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]!);
      }
    });
    proc.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited early (code ${code}).\nstderr:\n${stderr}`));
    });
  });

  // Surface the child's own crash output in the failure message — without it a
  // regression here reads only as "expected true, got false".
  (proc as ChildProcess & { __stderr?: () => string }).__stderr = () => stderr;
  return { base: `http://127.0.0.1:${port}`, child: proc };
}

/**
 * Issue a request and destroy the socket mid-flight, the way a client that
 * gives up does. `fetch` cannot express this — its abort tears down cleanly —
 * so drop to a raw socket and destroy it.
 */
async function connectThenDisconnect(base: string, urlPath: string): Promise<void> {
  const http = await import("node:http");
  await new Promise<void>((resolve) => {
    const req = http.get(`${base}${urlPath}`, (res) => {
      res.once("data", () => {
        // First byte received == the handler has run and left a read in flight.
        // Destroy now so `close` fires on the ServerResponse with the read
        // still executing, which is what triggers the abort path.
        req.destroy();
        resolve();
      });
    });
    req.on("error", () => resolve());
  });
}

/** The assertion that actually encodes the bug: still alive, still serving. */
async function expectAliveAndServing(
  base: string,
  proc: ChildProcess,
  label: string
): Promise<void> {
  // Give the abort path time to run, terminate the reader, and (pre-fix) crash.
  await new Promise((r) => setTimeout(r, 2_000));

  const stderr = (proc as ChildProcess & { __stderr?: () => string }).__stderr?.() ?? "";
  expect(
    proc.exitCode === null && proc.signalCode === null,
    `${label}: server process died (exit=${proc.exitCode}, signal=${proc.signalCode}).\n` +
      `stderr:\n${stderr}`
  ).toBe(true);

  // Alive is necessary but not sufficient — it must still answer.
  const ping = await fetch(`${base}/ping`);
  expect(ping.status, `${label}: /ping after disconnect`).toBe(200);

  // And the DB layer must have recovered its reader, not just avoided dying.
  const fast = await fetch(`${base}/fast`);
  expect(fast.status, `${label}: DB read after disconnect`).toBe(200);
  expect(await fast.json()).toEqual({ ok: 1 });
}

describe("client disconnect during an in-flight DB read (#2316)", () => {
  it("survives a slow read abandoned by client disconnect", async () => {
    const started = await startServer("slow");
    child = started.child;

    await connectThenDisconnect(started.base, "/slow");
    await expectAliveAndServing(started.base, started.child, "slow read");
  }, 120_000);

  it("survives an SSE stream abandoned by the client", async () => {
    const started = await startServer("sse");
    child = started.child;

    await connectThenDisconnect(started.base, "/events/stream");
    await expectAliveAndServing(started.base, started.child, "SSE stream");
  }, 120_000);

  it("survives a read that outlives its statement timeout with nobody waiting", async () => {
    // Same reclamation path (`abandon` -> `failInFlight`), reached by the
    // statement-timeout branch rather than the abort branch. Found while
    // fixing #2316 and not in the issue: a single runaway query killed the
    // server on its own, with no client disconnect involved. Guarding only
    // the abort branch would have left that half of the bug live.
    const started = await startServer("runaway", 500);
    child = started.child;

    const res = await fetch(`${started.base}/runaway`);
    expect(res.status).toBe(200);
    await expectAliveAndServing(started.base, started.child, "statement timeout");
  }, 120_000);

  it("survives a reconnect loop of abandoned SSE streams", async () => {
    // The outage was a LOOP: daemons reconnect their subscriptions on every
    // restart, so the server met this path repeatedly rather than once. One
    // survived abort would not have kept the instance up.
    const started = await startServer("loop");
    child = started.child;

    for (let i = 0; i < 5; i += 1) {
      await connectThenDisconnect(started.base, "/events/stream");
      await new Promise((r) => setTimeout(r, 150));
    }
    await expectAliveAndServing(started.base, started.child, "SSE reconnect loop");
  }, 180_000);
});
