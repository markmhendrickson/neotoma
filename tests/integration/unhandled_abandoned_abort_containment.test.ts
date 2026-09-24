/**
 * Containment for the unhandled `WorkerDbAbortError` that crash-looped hosted
 * Neotoma on 2026-09-23 (#2483).
 *
 * The prior investigation on #2483 could not reproduce the leak synthetically
 * (five harness shapes, all survived) despite tracing every read path to the
 * `guardAbandonedRead` no-op catch in worker_file_database.ts. Since the
 * leaking path is unknown, `handleAbandonedAbortRejection` in actions.ts
 * contains the SYMPTOM — an unhandled `WorkerDbAbortError` reaching the
 * process-level `unhandledRejection` listener — rather than the still-unknown
 * source. This file proves that containment rather than the leak itself:
 *
 *   1. An unhandled `WorkerDbAbortError` rejection does not kill the process,
 *      produces the structured diagnostic log line with the fields the
 *      containment PR exists to capture, and leaves the process able to serve
 *      a real, successful DB-backed read afterward — HEALTHY, not merely
 *      alive.
 *   2. An unhandled rejection of a DIFFERENT error type is untouched — it
 *      still exits non-zero, proving the handler's scope is exactly one
 *      error type and not a general safety net (which would itself be a
 *      regression: a corrupt migration or an OOM must still crash, per the
 *      `guardAbandonedRead` doc comment in worker_file_database.ts).
 *
 * Both cases run in a CHILD PROCESS for the same reason
 * `db_abort_client_disconnect_survival.test.ts` does: the crash is an
 * unhandled rejection escaping Node's default `--unhandled-rejections=throw`,
 * and vitest installs its own handler that would swallow it, making an
 * in-process assertion pass regardless of whether actions.ts's handler exists
 * at all.
 *
 * REGRESSION BINDING (the point QA's mutation testing of the first version of
 * this file found missing): the child does not reimplement the `process.on`
 * wiring and does not call `installAbandonedAbortContainment()` itself. It
 * runs the real compiled `dist/actions.js` AS THE ENTRYPOINT — the exact file
 * `node dist/actions.js` runs in production — with
 * `NEOTOMA_ACTIONS_SKIP_HTTP_SERVER_FOR_TEST=1` (a test-only escape hatch,
 * inert in production, that skips only the `startHTTPServer()` call so this
 * suite doesn't pay for a full migration/schema/HTTP boot) so the module's
 * own `isMainModule` autostart block runs for real and calls
 * `installAbandonedAbortContainment()` from its actual production call site.
 * Deleting that call site — while leaving `installAbandonedAbortContainment`
 * and `handleAbandonedAbortRejection` themselves untouched — removes the only
 * thing that registers the listener a real boot performs, so this suite goes
 * red. A version of this test that imported and called the installer (or
 * reimplemented its `process.on` body) directly would keep passing after that
 * exact deletion, which is the gap QA's mutation testing found in the first
 * version of this file. Verified by mutation; see the PR comment for the
 * verbatim RED/GREEN output.
 *
 * The follow-up module (`NEOTOMA_ACTIONS_TEST_FOLLOWUP_MODULE`, a second
 * test-only-inert hook in actions.ts) then runs AFTER the real listener is
 * registered: it opens the real `getDb()` connection (same code path
 * production uses, pointed at a scratch `NEOTOMA_DATA_DIR`), performs a real
 * read to warm the reader pool, monkey-patches `logger.error` to capture the
 * exact structured event object `handleAbandonedAbortRejection` logs (rather
 * than regex-scraping `util.inspect` text, which line-wraps unpredictably for
 * long stacks), throws the unhandled rejection, and afterward performs a
 * SECOND real DB read to prove the process is HEALTHY, not merely alive
 * (Falco non-blocking finding #1).
 */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..", "..");
const entryDir = mkdtempSync(path.join(repoRoot, "node_modules", ".neotoma-abort-contain-test-"));
const dataDirRoot = mkdtempSync(path.join(tmpdir(), "neotoma-abort-contain-data-"));
const entries: string[] = [];
let nextEntry = 0;

afterAll(() => {
  for (const entry of entries) rmSync(entry, { force: true });
  rmSync(entryDir, { recursive: true, force: true, maxRetries: 2 });
  rmSync(dataDirRoot, { recursive: true, force: true, maxRetries: 2 });
});

/**
 * The follow-up module actions.ts imports (for side effects, once its own
 * real `isMainModule` autostart block — including the production call to
 * `installAbandonedAbortContainment()` — has already run). It is the only
 * place that knows about "faults" or "DB checks"; actions.ts itself stays
 * test-agnostic.
 *
 * Captures the EXACT object `logger.error` is called with (by monkey-patching
 * the same cached module instance actions.ts imports — Node's ESM loader
 * caches by resolved path, so this is the same `logger` object) and prints it
 * as JSON on a marker line, rather than trying to regex-parse `util.inspect`
 * output, which wraps long `stack` strings across multiple `+`-joined lines
 * and is not meant to be machine-read.
 */
function followUpSource(errorKind: "abandoned-abort" | "other"): string {
  const workerDbPath = JSON.stringify(
    path.join(repoRoot, "dist/repositories/worker/worker_file_database.js")
  );
  const loggerPath = JSON.stringify(path.join(repoRoot, "dist/utils/logger.js"));
  const connectionPath = JSON.stringify(path.join(repoRoot, "dist/repositories/db/connection.js"));
  return `
import { WorkerDbAbortError } from ${workerDbPath};
import { logger } from ${loggerPath};
import { getDb } from ${connectionPath};

const originalError = logger.error;
logger.error = (...args) => {
  const [message, fields] = args;
  if (typeof message === "string" && message.includes("unhandled WorkerDbAbortError contained")) {
    process.stdout.write("CONTAINED_EVENT " + JSON.stringify({
      hasCauseKey: fields !== null && typeof fields === "object" && "cause" in fields,
      ...fields,
      // JSON.stringify drops an explicit \`undefined\` value (e.g. cause),
      // which would silently hide a missing key rather than a present-but-
      // undefined one — hasCauseKey above is what actually proves presence.
      stackIsNonEmptyString: typeof fields?.stack === "string" && fields.stack.length > 0,
    }) + "\\n");
  }
  return originalError.apply(logger, args);
};

// Warm a REAL reader pool through the exact code path production uses
// (getDb(), pointed at a scratch NEOTOMA_DATA_DIR) so
// readerPoolSnapshotForDiagnostics() below has a non-null branch to report,
// and so the post-rejection check below is a real DB round trip rather than
// a no-op.
const db = await getDb();
const before = await db.prepare("SELECT 1 AS ok").get();
process.stdout.write("DB_CHECK_BEFORE " + (before && before.ok === 1 ? "ok" : "FAILED") + "\\n");

async function rejectUnhandled() {
  ${
    errorKind === "abandoned-abort"
      ? 'throw new WorkerDbAbortError("DB request aborted by caller");'
      : 'throw new Error("some other unrelated fault — must still crash");'
  }
}
void rejectUnhandled();

// Proves liveness rather than merely the absence of an immediate exit: still
// running and still able to do work after the rejection fired.
setInterval(() => {
  process.stdout.write("ALIVE\\n");
}, 300);

// HEALTHY, not merely alive (Falco non-blocking finding #1): a second real,
// successful DB-backed read AFTER the contained rejection, on the same
// connection the diagnostic's readerPoolStats reported on. Delayed so it
// runs strictly after the unhandled rejection has already been delivered to
// the process-level listener.
setTimeout(async () => {
  try {
    const after = await db.prepare("SELECT 1 AS ok").get();
    process.stdout.write("DB_CHECK_AFTER " + (after && after.ok === 1 ? "ok" : "FAILED") + "\\n");
  } catch (e) {
    process.stdout.write("DB_CHECK_AFTER FAILED " + String(e && e.message) + "\\n");
  }
}, 500);
`;
}

/**
 * Spawn the REAL production entrypoint (`dist/actions.js`) as the child's
 * main module, with `NEOTOMA_ACTIONS_SKIP_HTTP_SERVER_FOR_TEST=1` so it takes
 * its normal `isMainModule` autostart branch — including the production call
 * to `installAbandonedAbortContainment()` — without booting the HTTP server,
 * DB migrations/schema seeding, or listening on a port, none of which this
 * suite is about. `NEOTOMA_ACTIONS_TEST_FOLLOWUP_MODULE` points at the
 * per-case follow-up script above, which actions.ts dynamically imports right
 * after skipping `startHTTPServer()` — i.e. strictly after the real listener
 * is already registered.
 */
function spawnChild(errorKind: "abandoned-abort" | "other") {
  const followUpPath = path.join(
    entryDir,
    `followup-${errorKind}-${process.pid}-${nextEntry++}.mjs`
  );
  entries.push(followUpPath);
  writeFileSync(followUpPath, followUpSource(errorKind));

  const dataDir = mkdtempSync(path.join(dataDirRoot, `${errorKind}-`));

  // No --unhandled-rejections flag passed: this IS production's configuration.
  // Node 20's default is already `throw` (verified: neither the Dockerfile,
  // fly.toml, nor any package.json start script overrides it), so omitting
  // the flag here is not a weaker test — it is the exact flag production
  // runs under.
  const actionsEntry = path.join(repoRoot, "dist/actions.js");
  const proc = spawn(process.execPath, [actionsEntry], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NEOTOMA_ACTIONS_SKIP_HTTP_SERVER_FOR_TEST: "1",
      NEOTOMA_ACTIONS_TEST_FOLLOWUP_MODULE: followUpPath,
      NEOTOMA_DATA_DIR: dataDir,
      // readerPoolSnapshotForDiagnostics() only has a non-null branch to
      // report on the worker-hosted (libsql) backend — sqlite's
      // AsyncSqliteDatabase implements no readerPoolStats() at all, by
      // design (see its doc comment in actions.ts). Forcing libsql here is
      // what makes the readerPoolStats assertion below exercise the real
      // branch instead of trivially passing on `null`.
      NEOTOMA_DB_BACKEND: "libsql",
    },
  });
  let stdout = "";
  let stderr = "";
  proc.stdout?.on("data", (d) => (stdout += String(d)));
  proc.stderr?.on("data", (d) => (stderr += String(d)));
  if (process.env.NEOTOMA_ABORT_TEST_DEBUG) {
    proc.stderr?.on("data", (d) => process.stderr.write("[child] " + String(d)));
    proc.stdout?.on("data", (d) => process.stderr.write("[childout] " + String(d)));
  }
  return {
    proc,
    getStdout: () => stdout,
    getStderr: () => stderr,
  };
}

function waitForExitOrTimeout(
  proc: ReturnType<typeof spawnChild>["proc"],
  ms: number
): Promise<{ exitCode: number | null; signalCode: string | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ exitCode: null, signalCode: null, timedOut: true }), ms);
    proc.once("exit", (exitCode, signalCode) => {
      clearTimeout(timer);
      resolve({ exitCode, signalCode, timedOut: false });
    });
  });
}

/**
 * Regression coverage for the two refusal branches commit `83fbf0590` added
 * to the `NEOTOMA_ACTIONS_SKIP_HTTP_SERVER_FOR_TEST` /
 * `NEOTOMA_ACTIONS_TEST_FOLLOWUP_MODULE` handler in response to Falco's
 * PLAUSIBLE code-injection finding (#2484 review). QA verified by direct
 * mutation (reverting both branches back to the pre-fix ungated
 * `import(testModule)`) that the rest of this suite stays green with the
 * gate removed entirely — proving nothing here would catch a regression of
 * it. These three cases close that gap:
 *
 *   1. `NODE_ENV=production` refuses even when the path is otherwise
 *      allowed.
 *   2. A path outside `node_modules/.neotoma-abort-contain-test-*` refuses
 *      even when `NODE_ENV` is not production.
 *   3. Control: inside the allowed prefix, with `NODE_ENV` not production,
 *      the module IS imported — proving cases 1–2 fail because of the gate
 *      being tested, not because the follow-up module never runs at all.
 *
 * Each case spawns `dist/actions.js` directly (the real production
 * entrypoint, same as the rest of this file) rather than reimplementing the
 * gate logic, for the same regression-binding reason given above: a test
 * that doesn't run the actual branch under test would keep passing after the
 * branch is deleted.
 *
 * The observable effect asserted for a refusal is: (a) the follow-up module
 * is never imported — proven by the ABSENCE of a sentinel file only the
 * imported module would create (import failing to even parse would also
 * fail an accidental "file exists" check the same way, but writeFileSync in
 * followUpSource always writes valid syntax, so the only way the sentinel
 * can be missing is that import() was never called); (b) the exact refusal
 * line actions.ts logs to stderr; and (c) the process exits with code 1
 * rather than continuing (it does not fall through to starting the HTTP
 * server or hanging).
 */
describe("NEOTOMA_ACTIONS_TEST_FOLLOWUP_MODULE security gate (#2484 hardening)", () => {
  const gateEntries: string[] = [];
  const gateDataDirRoot = mkdtempSync(path.join(tmpdir(), "neotoma-abort-gate-data-"));

  afterAll(() => {
    for (const entry of gateEntries) rmSync(entry, { force: true, recursive: true });
    rmSync(gateDataDirRoot, { recursive: true, force: true, maxRetries: 2 });
  });

  /** A follow-up module whose only observable effect is writing a sentinel
   * file — so "sentinel absent" is unambiguous proof `import()` never ran,
   * independent of anything else the module might do. */
  function sentinelFollowUpSource(sentinelPath: string): string {
    return `
import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(sentinelPath)}, "imported\\n");
process.stdout.write("SENTINEL_WRITTEN\\n");
`;
  }

  function spawnGateChild(opts: {
    followUpPath: string;
    nodeEnv?: string;
  }): {
    proc: ReturnType<typeof spawn>;
    getStdout: () => string;
    getStderr: () => string;
  } {
    const dataDir = mkdtempSync(path.join(gateDataDirRoot, "case-"));
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NEOTOMA_ACTIONS_SKIP_HTTP_SERVER_FOR_TEST: "1",
      NEOTOMA_ACTIONS_TEST_FOLLOWUP_MODULE: opts.followUpPath,
      NEOTOMA_DATA_DIR: dataDir,
    };
    if (opts.nodeEnv === undefined) {
      delete env.NODE_ENV;
    } else {
      env.NODE_ENV = opts.nodeEnv;
    }
    const actionsEntry = path.join(repoRoot, "dist/actions.js");
    const proc = spawn(process.execPath, [actionsEntry], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d) => (stdout += String(d)));
    proc.stderr?.on("data", (d) => (stderr += String(d)));
    if (process.env.NEOTOMA_ABORT_TEST_DEBUG) {
      proc.stderr?.on("data", (d) => process.stderr.write("[gate-child] " + String(d)));
      proc.stdout?.on("data", (d) => process.stderr.write("[gate-childout] " + String(d)));
    }
    return { proc, getStdout: () => stdout, getStderr: () => stderr };
  }

  it("refuses and does not import the follow-up module when NODE_ENV=production, even on an allowed path", async () => {
    const sentinelPath = path.join(
      entryDir,
      `sentinel-prod-${process.pid}-${nextEntry++}.marker`
    );
    const followUpPath = path.join(
      entryDir,
      `followup-prod-${process.pid}-${nextEntry++}.mjs`
    );
    gateEntries.push(followUpPath, sentinelPath);
    writeFileSync(followUpPath, sentinelFollowUpSource(sentinelPath));

    const { proc, getStdout, getStderr } = spawnGateChild({
      followUpPath,
      nodeEnv: "production",
    });
    const result = await waitForExitOrTimeout(proc, 5_000);

    expect(
      result.timedOut,
      `expected the process to exit promptly on refusal; stdout:\n${getStdout()}\nstderr:\n${getStderr()}`
    ).toBe(false);
    expect(
      result.exitCode,
      `expected exit code 1 on NODE_ENV=production refusal; stdout:\n${getStdout()}\nstderr:\n${getStderr()}`
    ).toBe(1);
    expect(getStderr()).toContain(
      "NEOTOMA_ACTIONS_TEST_FOLLOWUP_MODULE is set but NODE_ENV=production; refusing to import it."
    );
    expect(
      existsSync(sentinelPath),
      `sentinel file must NOT exist — the follow-up module must never have been imported; stdout:\n${getStdout()}`
    ).toBe(false);
    expect(getStdout()).not.toContain("SENTINEL_WRITTEN");
  }, 15_000);

  it("refuses and does not import the follow-up module when the path is outside the allowed node_modules/.neotoma-abort-contain-test-* prefix", async () => {
    const outsideDir = mkdtempSync(path.join(tmpdir(), "neotoma-abort-gate-outside-"));
    gateEntries.push(outsideDir);
    const sentinelPath = path.join(outsideDir, "sentinel.marker");
    const followUpPath = path.join(outsideDir, "followup.mjs");
    writeFileSync(followUpPath, sentinelFollowUpSource(sentinelPath));

    const { proc, getStdout, getStderr } = spawnGateChild({
      followUpPath,
      nodeEnv: "test",
    });
    const result = await waitForExitOrTimeout(proc, 5_000);

    expect(
      result.timedOut,
      `expected the process to exit promptly on refusal; stdout:\n${getStdout()}\nstderr:\n${getStderr()}`
    ).toBe(false);
    expect(
      result.exitCode,
      `expected exit code 1 on outside-prefix refusal; stdout:\n${getStdout()}\nstderr:\n${getStderr()}`
    ).toBe(1);
    expect(getStderr()).toContain(
      `NEOTOMA_ACTIONS_TEST_FOLLOWUP_MODULE (${path.resolve(followUpPath)}) is outside the`
    );
    expect(getStderr()).toContain("allowed test entry directory");
    expect(
      existsSync(sentinelPath),
      `sentinel file must NOT exist — the follow-up module must never have been imported; stdout:\n${getStdout()}`
    ).toBe(false);
    expect(getStdout()).not.toContain("SENTINEL_WRITTEN");
  }, 15_000);

  it("control: imports the follow-up module when the path IS under the allowed prefix and NODE_ENV is not production", async () => {
    const sentinelPath = path.join(
      entryDir,
      `sentinel-control-${process.pid}-${nextEntry++}.marker`
    );
    const followUpPath = path.join(
      entryDir,
      `followup-control-${process.pid}-${nextEntry++}.mjs`
    );
    gateEntries.push(followUpPath, sentinelPath);
    writeFileSync(followUpPath, sentinelFollowUpSource(sentinelPath));

    const { proc, getStdout, getStderr } = spawnGateChild({
      followUpPath,
      nodeEnv: "test",
    });
    try {
      // The follow-up module here just writes a sentinel and returns — it
      // doesn't keep the event loop alive like the fault-injection modules
      // above, so the process exits on its own once the import settles.
      const result = await waitForExitOrTimeout(proc, 5_000);
      const stdout = getStdout();

      expect(
        stdout,
        `expected the follow-up module to run and print SENTINEL_WRITTEN; stdout:\n${stdout}\nstderr:\n${getStderr()}\ntimedOut=${result.timedOut} exitCode=${result.exitCode}`
      ).toContain("SENTINEL_WRITTEN");
      expect(
        existsSync(sentinelPath),
        `sentinel file must exist — the follow-up module must have been imported; stdout:\n${stdout}`
      ).toBe(true);
      expect(getStderr()).not.toContain("refusing to import it");
    } finally {
      if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL");
    }
  }, 15_000);
});

describe("unhandled WorkerDbAbortError containment (#2483)", () => {
  it("stays alive, logs the full structured diagnostic event, and keeps serving after an unhandled WorkerDbAbortError", async () => {
    const { proc, getStdout, getStderr } = spawnChild("abandoned-abort");
    try {
      const result = await waitForExitOrTimeout(proc, 2_000);

      expect(
        result.timedOut,
        `process should still be running 2s after the unhandled WorkerDbAbortError; ` +
          `instead it exited (code=${result.exitCode}, signal=${result.signalCode}).\n` +
          `stdout:\n${getStdout()}\nstderr:\n${getStderr()}`
      ).toBe(true);

      const stdout = getStdout();

      expect(stdout).toContain("DB_CHECK_BEFORE ok");

      // Liveness beyond "didn't exit yet": the event loop is still turning,
      // proven by the interval continuing to fire.
      const aliveCount = (stdout.match(/ALIVE/g) ?? []).length;
      expect(
        aliveCount,
        `expected the setInterval to keep firing after the rejection; stdout:\n${stdout}`
      ).toBeGreaterThan(0);

      // HEALTHY, not merely alive (Falco non-blocking #1): a real,
      // successful DB-backed read must still complete after the contained
      // rejection, on the same connection the diagnostic reported on.
      expect(
        stdout,
        `expected a post-containment DB_CHECK_AFTER ok line; stdout:\n${stdout}\nstderr:\n${getStderr()}`
      ).toContain("DB_CHECK_AFTER ok");

      // The structured diagnostic event, captured verbatim from the exact
      // object handleAbandonedAbortRejection's logger.error call receives —
      // not a regex match against formatted text, which is what let the
      // diagnostic-contract gap through review the first time.
      const eventLine = stdout.split("\n").find((line) => line.startsWith("CONTAINED_EVENT "));
      expect(
        eventLine,
        `expected a CONTAINED_EVENT line; stdout:\n${stdout}\nstderr:\n${getStderr()}`
      ).toBeDefined();
      const payload = JSON.parse(eventLine!.slice("CONTAINED_EVENT ".length));

      expect(payload.name).toBe("WorkerDbAbortError");
      expect(payload.message).toBe("DB request aborted by caller");
      expect(payload.stackIsNonEmptyString).toBe(true);
      // `cause` is legitimately undefined for this synthetic rejection (the
      // class does not set one unless constructed with a cause) — asserting
      // the KEY is present (not its truthiness) is the diagnostic-contract
      // ask: the field must be part of the logged event, whatever its value.
      expect(payload.hasCauseKey).toBe(true);
      // The DB_CHECK_BEFORE warms a real worker DB ahead of the rejection, so
      // this branch must be a real (non-null) object, not merely present.
      expect(payload.readerPoolStats).not.toBeNull();
      expect(typeof payload.readerPoolStats).toBe("object");
      expect(typeof payload.uptimeSeconds).toBe("number");
      expect(payload.uptimeSeconds).toBeGreaterThanOrEqual(0);
    } finally {
      proc.kill("SIGKILL");
    }
  }, 30_000);

  it("still exits non-zero for an unhandled rejection of a DIFFERENT error type", async () => {
    // This is the case that proves the handler is NARROW rather than a
    // general safety net. It must pass both before and after the #2483
    // change — a handler that widened to catch every unhandled rejection
    // would keep the process alive through a genuine fault (a corrupt
    // migration, an OOM), which is its own defect per the doc comment on
    // `guardAbandonedRead` in worker_file_database.ts.
    const { proc, getStdout, getStderr } = spawnChild("other");
    try {
      const result = await waitForExitOrTimeout(proc, 5_000);

      expect(
        result.timedOut,
        `an unrelated unhandled rejection must still crash the process; it did not exit.\n` +
          `stdout:\n${getStdout()}\nstderr:\n${getStderr()}`
      ).toBe(false);
      expect(
        result.exitCode,
        `expected a non-zero exit for the uncontained rejection.\n` +
          `stdout:\n${getStdout()}\nstderr:\n${getStderr()}`
      ).not.toBe(0);
    } finally {
      if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL");
    }
  }, 30_000);
});
