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
 *   1. An unhandled `WorkerDbAbortError` rejection does not kill the process
 *      and produces the structured diagnostic log line.
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
 * The child imports `handleAbandonedAbortRejection` from the real compiled
 * `dist/actions.js` — the exact function the production entrypoint installs —
 * rather than reimplementing its logic, so this test exercises the shipped
 * code, not a copy that could drift from it.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..", "..");
const entryDir = mkdtempSync(path.join(repoRoot, "node_modules", ".neotoma-abort-contain-test-"));
const entries: string[] = [];
let nextEntry = 0;

afterAll(() => {
  for (const entry of entries) rmSync(entry, { force: true });
  rmSync(entryDir, { recursive: true, force: true, maxRetries: 2 });
});

/**
 * A minimal script that installs the SAME `unhandledRejection` wiring the
 * production entrypoint (actions.ts, `isMainModule` block) installs — reusing
 * the real `handleAbandonedAbortRejection` export rather than a reimplemented
 * copy — then deliberately produces one unhandled rejection of `errorKind`.
 *
 * Deliberately does not import the whole autostart block (which would boot
 * the full HTTP server, migrations, and schema seeding): that machinery is
 * unrelated to what this suite is about, which is the process-level listener
 * itself. Reusing the actual exported handler function keeps this a real test
 * of shipped code rather than a test of a parallel reimplementation.
 */
function scriptSource(errorKind: "abandoned-abort" | "other"): string {
  const actionsPath = JSON.stringify(path.join(repoRoot, "dist/actions.js"));
  const workerDbPath = JSON.stringify(
    path.join(repoRoot, "dist/repositories/worker/worker_file_database.js")
  );
  return `
import { handleAbandonedAbortRejection } from ${actionsPath};
import { WorkerDbAbortError } from ${workerDbPath};

// Mirrors the production wiring in actions.ts's isMainModule block: the
// guarded error type is contained and logged; anything else falls through to
// the same behavior Node's default --unhandled-rejections=throw would give.
process.on("unhandledRejection", (reason) => {
  if (handleAbandonedAbortRejection(reason)) return;
  console.error("[test-child] unhandled rejection (not contained):", reason);
  process.exit(1);
});

process.stdout.write("READY\\n");

// A promise nobody attaches a rejection handler to before rejection happens —
// the exact shape of an abandoned read whose caller has already walked away.
async function rejectUnhandled() {
  ${
    errorKind === "abandoned-abort"
      ? 'throw new WorkerDbAbortError("DB request aborted by caller");'
      : 'throw new Error("some other unrelated fault — must still crash");'
  }
}
void rejectUnhandled();

// Proves liveness rather than merely the absence of an immediate exit: still
// running and still able to do work 1.5s after the rejection fired.
setInterval(() => {
  process.stdout.write("ALIVE\\n");
}, 300);
`;
}

/** Spawn the child with PRODUCTION node flags (i.e. none — the default IS throw). */
function spawnChild(errorKind: "abandoned-abort" | "other") {
  const entry = path.join(entryDir, `child-${errorKind}-${process.pid}-${nextEntry++}.mjs`);
  entries.push(entry);
  writeFileSync(entry, scriptSource(errorKind));

  // No --unhandled-rejections flag passed: this IS production's configuration.
  // Node 20's default is already `throw` (verified: neither the Dockerfile,
  // fly.toml, nor any package.json start script overrides it), so omitting
  // the flag here is not a weaker test — it is the exact flag production
  // runs under. Made explicit rather than silently relied upon so a future
  // change to any of those three files that adds an override is caught by
  // this comment being wrong, not by a silent behavior change.
  const proc = spawn(process.execPath, [entry], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
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

describe("unhandled WorkerDbAbortError containment (#2483)", () => {
  it("stays alive and logs a structured event for an unhandled WorkerDbAbortError", async () => {
    const { proc, getStdout, getStderr } = spawnChild("abandoned-abort");
    try {
      const result = await waitForExitOrTimeout(proc, 1_500);

      expect(
        result.timedOut,
        `process should still be running 1.5s after the unhandled WorkerDbAbortError; ` +
          `instead it exited (code=${result.exitCode}, signal=${result.signalCode}).\n` +
          `stdout:\n${getStdout()}\nstderr:\n${getStderr()}`
      ).toBe(true);

      // Liveness beyond "didn't exit yet": the event loop is still turning,
      // proven by the interval continuing to fire.
      const aliveCount = (getStdout().match(/ALIVE/g) ?? []).length;
      expect(
        aliveCount,
        `expected the setInterval to keep firing after the rejection; ` +
          `stdout:\n${getStdout()}\nstderr:\n${getStderr()}`
      ).toBeGreaterThan(0);

      // The structured diagnostic event, from handleAbandonedAbortRejection's
      // logger.error call — not merely "did not crash" but "reported enough
      // to find the still-unknown leaking path": name, message, and stack.
      const stderr = getStderr();
      expect(stderr).toMatch(/unhandled WorkerDbAbortError contained/);
      expect(stderr).toMatch(/WorkerDbAbortError/);
      expect(stderr).toMatch(/DB request aborted by caller/);
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
