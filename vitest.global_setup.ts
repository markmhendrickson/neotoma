import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  BUILT_CURSOR_HOOK_PACKAGE,
  BUILT_INSPECTOR_ASSETS,
  INSTALLED_INSPECTOR_DEPS,
  announceSkip,
  hasPrerequisite,
} from "./tests/helpers/test_prerequisites.js";

/**
 * Fail fast, and legibly, when the compiled server is absent (issue #2090).
 *
 * `npm test` runs `pretest` (`build:server`) first, so this never trips there.
 * A raw `npx vitest run` on an unbuilt checkout, however, used to produce
 * hundreds of unrelated failures across `tests/cli/**` and the dist-smoke
 * suites — a cascade that buried the one fact the contributor needed. Refuse
 * before a single test file loads, and name the command that fixes it.
 */
function requireBuiltServer(projectRoot: string): void {
  if (existsSync(path.join(projectRoot, "dist", "index.js"))) return;
  const message =
    "[neotoma] dist/ is missing. Run `npm test` (pretest builds server) or " +
    "`npm run build:server` before `npx vitest run`.";
  process.stderr.write(`${message}\n`);
  throw new Error(message);
}

/**
 * Announce, once per run, every hard prerequisite this checkout lacks.
 *
 * Suites gated on these skip themselves via `tests/helpers/test_prerequisites`,
 * but a skip whose reason is invisible is out of contract per #2090 — the
 * contributor has to be able to tell "this needs a build step I did not run"
 * from "my change broke something" without leaving the run output.
 */
function announceMissingPrerequisites(): void {
  const missing = [
    [BUILT_INSPECTOR_ASSETS, "inspector-shell suites"],
    [INSTALLED_INSPECTOR_DEPS, "inspector unit suites"],
    [BUILT_CURSOR_HOOK_PACKAGE, "cursor-hooks suites"],
  ] as const;
  for (const [prereq, subject] of missing) {
    if (!hasPrerequisite(prereq)) announceSkip(prereq, subject);
  }
}

/**
 * Global Vitest setup.
 *
 * Starts the local HTTP Actions server once for the full test run so
 * cross-layer CLI→REST→DB tests have a reachable API. Uses the local
 * SQLite backend and a test-scoped data directory under `.vitest/`.
 */
export default async function globalSetup() {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
  requireBuiltServer(projectRoot);
  announceMissingPrerequisites();
  const vitestDir = path.join(projectRoot, ".vitest");
  mkdirSync(path.join(vitestDir, "sources"), { recursive: true });

  process.env.NEOTOMA_DATA_DIR = process.env.NEOTOMA_DATA_DIR || vitestDir;
  process.env.NODE_ENV = "test";

  // Unit/smoke suites share this HTTP process. Blank the issues target unless the
  // caller deliberately set one — otherwise loadIssuesConfig falls back to
  // DEFAULT_ISSUES_TARGET_URL (prod operator) and CLI smoke tests like
  // tests/cli/issues_message.test.ts hang on remote POST /issues/submit until
  // vitest's 60s timeout (CI baseline flake on PR #2284). Same pattern as
  // tests/helpers/two_server_fixture.ts for the canonical operator server.
  if (process.env.NEOTOMA_ISSUES_TARGET_URL === undefined) {
    process.env.NEOTOMA_ISSUES_TARGET_URL = "";
  }

  // Pick a stable base port for tests and let the server probe upward if in use.
  // Default 19080 keeps tests off the 18080-18099 range used by the local
  // dev-server LaunchAgents (see scripts/reload_neotoma_launchagents.sh).
  const httpPort = process.env.NEOTOMA_HTTP_PORT || process.env.HTTP_PORT || "19080";
  process.env.NEOTOMA_HTTP_PORT = httpPort;
  process.env.HTTP_PORT = httpPort;

  const { startHTTPServer } = await import("./src/actions.ts");
  const started = await startHTTPServer();
  if (started?.port) {
    process.env.NEOTOMA_SESSION_DEV_PORT = String(started.port);
    process.env.NEOTOMA_SESSION_ENV = "dev";
  }

  return async () => {
    await new Promise<void>((resolve) => {
      if (!started?.server) {
        resolve();
        return;
      }
      started.server.close(() => resolve());
    });
  };
}

