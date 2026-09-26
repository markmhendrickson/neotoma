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
 * The neon `PendingException` SIGABRT reported alongside it is NOT downstream
 * of that rejection, and this file's original header said it was (#2324). It
 * is a second, independent fault: `worker.terminate()` is built on V8's
 * `TerminateExecution`, which terminates JAVASCRIPT frames and cannot preempt
 * a native one. Terminating a worker that is inside the synchronous libsql
 * addon therefore leaves the isolate tearing down with Rust still on the
 * stack; the next napi call that Rust makes fails, and neon 1.0.0 asserts on
 * the status instead of propagating it. `libsql-js` builds with
 * `panic = "abort"`, so that assertion is a bare `abort()` — SIGABRT, exit
 * 134, unreachable by any JavaScript-level guard.
 *
 * The "twelve back-to-back terminations leave the process alive" experiment
 * that produced the original claim almost certainly ran on `better-sqlite3`,
 * which contains no neon and cannot produce the panic at all. That is why
 * `expectDriverIsLibsql` below FAILS rather than skips: a run on the wrong
 * driver is not a pass, it is a test that cannot fail.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";

/**
 * How long the `/slow-all` handler lets its read run before answering — i.e.
 * how deep into the native call the client's disconnect lands (#2324).
 *
 * The value matters, and both directions fail open. Too short and the worker
 * has not yet taken the message off its queue, so `terminate()` falls
 * harmlessly between statements and the case CANNOT fail on broken code. Too
 * long and the statement has finished.
 *
 * So the lead is a RANGE, sampled per request, not a constant. The window's
 * position depends on machine speed and cache warmth; a single measured value
 * is tuned to one laptop and silently stops reproducing anywhere else. Pinned
 * at 10ms the case caught the panic in roughly half of runs on unpatched main.
 *
 * The larger trap is worker warmth, which cost more debugging than the lead
 * did: the FIRST abandonment of a run spawns a cold reader, and worker boot
 * plus opening the database consumes the whole lead, so iteration 1 reliably
 * misses the window. That is why the case warms the pool before it starts
 * counting, and why a run that never logs a reclamation is a test that did not
 * exercise anything rather than a pass.
 */
const ABORT_LEAD_MIN_MS = 3;
const ABORT_LEAD_SPREAD_MS = 22;

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
function serverSource(dbPath: string, statementTimeoutMs = 0, readerWorkers = 1): string {
  return `
import http from "node:http";
import express from "express";
import { createRequire } from "node:module";
import { WorkerFileDatabase } from ${JSON.stringify(path.join(repoRoot, "dist/repositories/worker/worker_file_database.js"))};
import { dbAbortContext } from ${JSON.stringify(path.join(repoRoot, "dist/middleware/db_abort_context.js"))};

// Report which driver actually resolved. The panic this suite guards exists
// only in the neon binding behind \`libsql\`; \`better-sqlite3\` is a
// hand-written NAPI addon with no neon and cannot produce it. A run that
// silently fell back would be green for the wrong reason, so the parent
// asserts on this line rather than trusting the checkout.
try {
  process.stdout.write("DRIVER " + createRequire(import.meta.url).resolve("libsql") + "\\n");
} catch (e) {
  process.stdout.write("DRIVER none\\n");
}

const db = new WorkerFileDatabase(${JSON.stringify(dbPath)}, {
  readerWorkers: ${readerWorkers},
  statementTimeoutMs: ${statementTimeoutMs}, // 0 == abort is the only lever, as in the outage
});

await db.exec("CREATE TABLE load (id INTEGER PRIMARY KEY, v TEXT)");
await db.exec(
  "WITH RECURSIVE cnt(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM cnt WHERE x<4000) " +
  "INSERT INTO load (v) SELECT hex(randomblob(96)) FROM cnt"
);
const SLOW = "SELECT COUNT(*) AS n FROM load a, load b WHERE a.v < b.v";
// A statement whose time is spent in .all() rather than in one long native
// call. libsql's all() delegates to iterate(), which re-enters native via
// \`rowsNext\` once per 100-row batch (libsql/index.js), so a long result set
// crosses the JS/native boundary hundreds of times. Each crossing is a fresh
// chance for a terminate to land while Rust is on the stack, which widens the
// race from a single window to many — this is the case that actually
// reproduces the SIGABRT (#2324).
const SLOW_ALL = "SELECT a.v FROM load a, load b WHERE a.v < b.v LIMIT 120000";

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

// The same abandonment, on a statement that repeatedly re-enters native code.
//
// The DELAY before answering is load-bearing, and getting it wrong is what
// makes this test silently useless. The abort has to land while the worker is
// genuinely inside the native call. Answer immediately and the client's
// disconnect arrives ~1ms later, before the worker has even picked the
// message off its queue — the terminate then lands harmlessly between
// statements and the process survives on unpatched code. So: start the read,
// let it get properly under way, and only then release the byte that causes
// the client to hang up.
//
// The lead is JITTERED rather than fixed, because a fixed value samples one
// point of a race window whose position moves with machine speed and cache
// warmth. Pinned at 10ms this case reproduced the panic in about half of runs
// on unpatched main; spreading the lead over the window catches the same bug
// on machines where the sweet spot is not where it was measured. A gate that
// only fires when the timing happens to match the author's laptop is not a
// gate.
app.get("/slow-all", (_req, res) => {
  void db.prepare(SLOW_ALL).all();
  const lead = ${ABORT_LEAD_MIN_MS} + Math.random() * ${ABORT_LEAD_SPREAD_MS};
  setTimeout(() => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.write("started");
  }, lead);
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
  statementTimeoutMs = 0,
  readerWorkers = 1
): Promise<{ base: string; child: ChildProcess }> {
  const dir = mkdtempSync(path.join(workDir, `${name}-`));
  // The entry file must live INSIDE the repo tree: Node resolves bare imports
  // (`express`) from the importing file's directory upward, and a script in
  // the OS temp dir finds no node_modules. The database still lives in the
  // temp dir, so nothing durable is written into the checkout.
  const entry = path.join(entryDir, `server-${name}-${process.pid}-${nextEntry++}.mjs`);
  entries.push(entry);
  writeFileSync(entry, serverSource(path.join(dir, "db.sqlite"), statementTimeoutMs, readerWorkers));

  const proc = spawn(process.execPath, [entry], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  proc.stderr?.on("data", (d) => (stderr += String(d)));
  if (process.env.NEOTOMA_ABORT_TEST_DEBUG) {
    proc.stderr?.on("data", (d) => process.stderr.write("[child] " + String(d)));
    proc.stdout?.on("data", (d) => process.stderr.write("[childout] " + String(d)));
  }

  let stdout = "";
  const port = await new Promise<string>((resolve, reject) => {
    let out = "";
    const timer = setTimeout(
      () => reject(new Error(`server did not start in 60s.\nstderr:\n${stderr}`)),
      60_000
    );
    proc.stdout?.on("data", (d) => {
      out += String(d);
      stdout += String(d);
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
  expectDriverIsLibsql(stdout);
  return { base: `http://127.0.0.1:${port}`, child: proc };
}

/**
 * Fail — never skip — when the child did not resolve the `libsql` driver.
 *
 * This is the assertion that makes the rest of the suite able to fail at all.
 * `resolveWorkerDriver` prefers `libsql` and silently falls back to
 * `better-sqlite3`, which has no neon binding and therefore cannot produce the
 * SIGABRT these cases exist to catch. A checkout without `node_modules/libsql`
 * would run every case green while guarding nothing — which is exactly what
 * happened when this bug shipped twice. A skip would reproduce that gap
 * quietly; a hard failure forces a lane that cannot install libsql to say so.
 */
function expectDriverIsLibsql(stdout: string): void {
  const match = stdout.match(/DRIVER (.+)/);
  expect(
    match?.[1] && match[1] !== "none",
    "the `libsql` driver did not resolve in the child process. This suite guards a " +
      "panic inside libsql's neon binding; on `better-sqlite3` there is no neon and " +
      "no case here can fail. Run `npm ci` on a platform with an `@libsql/*` " +
      "prebuild, or fix the lane — do not treat this as a pass."
  ).toBeTruthy();
}

/**
 * `fetch`, retried past a transient connection reset.
 *
 * These cases deliberately destroy many sockets mid-flight, and the server is
 * still tearing those connections down when the probe that follows goes out.
 * A `fetch` landing in that moment can fail with ECONNRESET even though the
 * process is perfectly healthy — a property of the harness's own teardown, not
 * of the code under test.
 *
 * This retry is safe precisely because it cannot hide the bug: every crash
 * assertion in `expectAliveAndServing` — no `panicked at`, no SIGABRT, process
 * still running — has already been evaluated before this is ever called. A
 * process killed by the neon panic is not reachable here, and a server that is
 * genuinely not answering still exhausts the attempts and fails. Only the
 * narrow "healthy server, socket reset in flight" case is absorbed.
 */
async function fetchWithRetry(url: string, attempts = 5): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fetch(url);
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw lastError;
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

  // Name the #2324 failure specifically rather than reporting it as the
  // generic "process died" that #2316 also produces. A Rust panic under
  // `panic = "abort"` raises SIGABRT (exit 134) and prints `panicked at`
  // before dying, so both signals are checked: the stderr scan additionally
  // catches an abort that a later assertion would otherwise mask.
  expect(
    stderr,
    `${label}: the native driver panicked — this is the #2324 SIGABRT, not a ` +
      `JavaScript-level crash. A worker was terminated while a native call was ` +
      `on its stack.\nstderr:\n${stderr}`
  ).not.toMatch(/panicked at|PendingException/);
  expect(
    proc.signalCode,
    `${label}: server aborted (SIGABRT) — see #2324.\nstderr:\n${stderr}`
  ).not.toBe("SIGABRT");

  expect(
    proc.exitCode === null && proc.signalCode === null,
    `${label}: server process died (exit=${proc.exitCode}, signal=${proc.signalCode}).\n` +
      `stderr:\n${stderr}`
  ).toBe(true);

  // Alive is necessary but not sufficient — it must still answer.
  const ping = await fetchWithRetry(`${base}/ping`);
  expect(ping.status, `${label}: /ping after disconnect`).toBe(200);

  // And the DB layer must have recovered its reader, not just avoided dying.
  const fast = await fetchWithRetry(`${base}/fast`);
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

  it("survives an .all() read abandoned mid-native-call, repeatedly (#2324)", async () => {
    // The case that actually reproduces the neon SIGABRT. `.all()` re-enters
    // native once per 100-row batch, so a disconnect has hundreds of chances
    // to land while Rust is on the stack instead of the single window a
    // `.get()` aggregate offers — on unpatched main this aborts the process
    // with `panicked at .../neon-1.0.0/src/sys/array.rs:22` (the production
    // trace names the sibling assertion at `external.rs:80`; same defect,
    // different napi call).
    //
    // Looped, and disconnected FAST, because it is a race: the terminate has
    // to land inside a native frame. A single slow iteration reliably misses
    // the window and would make this test green on broken code.
    const started = await startServer("slow-all", 0, 2);
    child = started.child;

    // Enough attempts to make the race a certainty rather than a coin flip.
    // Each iteration is an independent batch of rolls: the terminate has to
    // land inside a native frame, and the abort path firing is not the same as
    // the race being won. Every iteration DOES exercise the path (the child
    // logs a reclamation each time); the panic follows on some fraction.
    //
    // The count is measured from both directions rather than guessed, because
    // both directions cost something. Too few and the gate misses the
    // regression; too many and the GREEN path — which runs every iteration,
    // and on fixed code waits for each abandoned worker to finish rather than
    // killing it instantly — overruns its timeout.
    //
    // Measured on unpatched main at 63a7dcf88 with the jittered lead: at 8
    // concurrent abandonments over 4 readers, 25 iterations reproduced in 3 of
    // 6 runs, 60 in 6 of 8, and 120 in 8 of 8.
    //
    // That configuration was then DELIBERATELY LIGHTENED — 2 readers, 3
    // concurrent abandonments, a smaller result set — because it was tuned on
    // a 16-core machine and killed the 2-core CI runner outright ("the runner
    // has received a shutdown signal", twice, ~70s in, with no test output).
    // The iteration count rose to 200 to buy the detection back, and the
    // lighter shape reproduces in 6 of 6 runs while finishing in ~35-50s.
    //
    // The lightening was not merely a CI accommodation: 2 readers SATURATE the
    // pool, and saturation exposed a defect the wider pool hid entirely — see
    // the `__drained__` probe in worker_file_database.ts. The cheaper test is
    // also the stricter one.
    for (let i = 0; i < 200; i += 1) {
      // Stop as soon as the child is gone. When the panic fires mid-loop the
      // server is already dead, and the next request would throw a bare
      // `fetch failed` / `UND_ERR_SOCKET` — a confusing TypeError that buries
      // the actual diagnosis. Break instead and let `expectAliveAndServing`
      // report it as the SIGABRT it is, with the child's stderr attached.
      if (started.child.exitCode !== null || started.child.signalCode !== null) break;

      // Warm the reader before each attempt. Each abandonment takes the pool's
      // only reader out of service, so the next read would otherwise start on
      // a freshly spawned worker whose boot time swallows the lead entirely,
      // and an attempt against a cold worker never reaches the native call.
      try {
        await fetchWithRetry(`${started.base}/fast`);
        // Abandon several reads CONCURRENTLY. Production does not disconnect
        // one client at a time — a daemon restart drops a batch of
        // subscriptions at once — and more simultaneous teardowns means more
        // chances that one of them lands inside a native frame. Each iteration
        // is a batch of independent rolls rather than a single one, which is
        // what makes a bounded loop enough to catch a race.
        await Promise.all(
          Array.from({ length: 3 }, () => connectThenDisconnect(started.base, "/slow-all"))
        );
      } catch {
        // The server died underneath us — the assertion below reports why.
        break;
      }
    }
    await expectAliveAndServing(started.base, started.child, "abandoned .all()");
    // 420s, not 180s. A FAILING run is fast — the loop breaks as soon as the
    // child dies — so this budget only ever bounds the GREEN path, which walks
    // all 120 iterations and measured 153-168s on a warm dev machine. A CI
    // runner is slower and noisier, and a timeout here would read as "the fix
    // regressed" when it actually means "the box was busy". Generous on the
    // path that passes, unchanged on the path that catches the bug.
  }, 420_000);

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
