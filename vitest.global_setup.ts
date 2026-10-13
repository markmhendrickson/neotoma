import os from "node:os";
import path from "node:path";
import { closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, realpathSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  BUILT_CURSOR_HOOK_PACKAGE,
  BUILT_INSPECTOR_ASSETS,
  INSTALLED_INSPECTOR_DEPS,
  announceSkip,
  hasPrerequisite,
} from "./tests/helpers/test_prerequisites.js";
import { resolveHarnessForceMode } from "./src/shared/harness_force_mode.js";

/**
 * Isolate every test worker's notion of "home" from the operator's real
 * home directory, for the whole run.
 *
 * Motivation (neotoma issue: CLI/tests rewriting a user-level harness MCP
 * config): `src/cli/mcp_config_scan.ts` resolves Cursor/Claude/Codex/Windsurf
 * user-level config paths from `os.homedir()`, which on POSIX reads
 * `process.env.HOME` on every call (no caching) — so any test that exercises
 * `offerInstall`/`offerFix`/`scanForMcpConfigs` with `includeUserLevel` or
 * `userLevelFirst`, directly or via a spawned `node dist/cli/index.js`
 * subprocess that inherits `process.env`, can read or write the REAL
 * `~/.cursor/mcp.json` (and siblings) unless that specific test remembers to
 * override HOME itself. Several test files already do this per-test
 * (`tests/cli/cli_init_commands.test.ts`, `tests/integration/cli_init_bootstrap.test.ts`),
 * but that is opt-in and easy to miss — `tests/cli/cli_mcp_commands.test.ts`
 * has at least one case that reads `process.env.HOME` unguarded. A single,
 * unconditional override here removes the opt-in: no test file can reach a
 * real user config path by omission.
 *
 * Vitest's default pool ("forks") forks worker processes from this main
 * process AFTER globalSetup resolves, inheriting `process.env` at fork
 * time — so setting HOME/USERPROFILE here, before any worker or test file
 * loads, binds every worker without per-file setup.
 *
 * A test that deliberately needs its OWN isolated home (e.g. to assert
 * against a specific fixture layout) may still override HOME locally; this
 * only removes the REAL home as a possible default.
 */
function isolateHomeDirectoryForTests(projectRoot: string): string {
  // Capture the REAL home before overriding HOME/USERPROFILE below — os.homedir()
  // reads process.env.HOME on every call, so this must happen first.
  const realHome = os.homedir();
  const isolatedHome = path.join(projectRoot, ".vitest", "home");
  mkdirSync(isolatedHome, { recursive: true });
  process.env.HOME = isolatedHome;
  process.env.USERPROFILE = isolatedHome;
  // Recorded so the write-guard in vitest.setup.ts (per worker) can assert no
  // code path under test touched the real home instead of this stand-in.
  process.env.NEOTOMA_TEST_REAL_HOME = realHome;
  process.env.NEOTOMA_TEST_ISOLATED_HOME = isolatedHome;
  return isolatedHome;
}

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

type OwnedNativeSqlite = { dbPath: string; dev: number; ino: number; runDir: string; runDev: number; runIno: number };

function assertPrivateNativeRoot(dataRoot: string): void {
  const stats = lstatSync(dataRoot);
  const parent = path.dirname(dataRoot);
  const parentStats = lstatSync(parent);
  if (!stats.isDirectory() || stats.uid !== process.getuid() ||
      (stats.mode & 0o022) !== 0 || realpathSync(dataRoot) !== path.resolve(dataRoot) ||
      !parentStats.isDirectory() || parentStats.uid !== process.getuid() ||
      (parentStats.mode & 0o022) !== 0 || realpathSync(parent) !== path.resolve(parent)) {
    throw new Error("Fresh SQLite allocation required: selected native parent is not owner-held and non-writable by others");
  }
}

/** Bind the selected native contract to a database that did not exist before this run. */
function allocateOwnedNativeSqlite(projectRoot: string): OwnedNativeSqlite | undefined {
  if (!process.env.OWNED_NATIVE_ARGS) return undefined;
  const dbPath = process.env.NEOTOMA_SQLITE_PATH;
  const dataRoot = path.join(projectRoot, ".vitest");
  assertPrivateNativeRoot(dataRoot);
  if (!dbPath || path.basename(dbPath) !== "state.sqlite") {
    throw new Error("Fresh SQLite allocation required: selected native path is invalid");
  }
  const runDir = path.dirname(dbPath);
  const canonicalRoot = realpathSync(dataRoot);
  const canonicalRunDir = realpathSync(runDir);
  const runStats = lstatSync(runDir);
  if (canonicalRunDir !== path.resolve(runDir) ||
      !canonicalRunDir.startsWith(canonicalRoot + path.sep) ||
      !runStats.isDirectory() || runStats.uid !== process.getuid() ||
      (runStats.mode & 0o777) !== 0o700) {
    throw new Error("Fresh SQLite allocation required: selected native directory is not private");
  }
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    if (lstatSync(dbPath + suffix, { throwIfNoEntry: false })) {
      throw new Error("Fresh SQLite allocation required: selected native sidecar already exists");
    }
  }
  let fd: number;
  try {
    fd = openSync(dbPath, "wx", 0o600);
  } catch (error) {
    throw new Error("Fresh SQLite allocation required: selected native database already exists or cannot be created", { cause: error });
  }
  let owned: OwnedNativeSqlite | undefined;
  try {
    const stats = fstatSync(fd);
    owned = { dbPath, dev: stats.dev, ino: stats.ino, runDir,
      runDev: runStats.dev, runIno: runStats.ino };
    if (!stats.isFile() || stats.uid !== process.getuid() || (stats.mode & 0o777) !== 0o600 || stats.size !== 0) {
      throw new Error("Fresh SQLite allocation required: selected native database is not private and empty");
    }
  } catch (error) {
    if (owned) removeOwnedNativeSqlite(owned);
    throw error;
  } finally {
    closeSync(fd);
  }
  return owned;
}

/** Never remove a caller's pre-existing or replaced path. */
function removeOwnedNativeSqlite(owned: OwnedNativeSqlite): void {
  const runStats = lstatSync(owned.runDir, { throwIfNoEntry: false });
  if (!runStats || !runStats.isDirectory() || runStats.uid !== process.getuid() ||
      (runStats.mode & 0o777) !== 0o700 || runStats.dev !== owned.runDev || runStats.ino !== owned.runIno) {
    throw new Error("Selected native SQLite directory changed before cleanup");
  }
  assertPrivateNativeRoot(path.dirname(owned.runDir));
  const dbStats = lstatSync(owned.dbPath, { throwIfNoEntry: false });
  if (dbStats && (!dbStats.isFile() || dbStats.uid !== process.getuid() ||
      dbStats.dev !== owned.dev || dbStats.ino !== owned.ino)) {
    throw new Error("Selected native SQLite file changed before cleanup");
  }
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    const sidecar = owned.dbPath + suffix;
    const stats = lstatSync(sidecar, { throwIfNoEntry: false });
    if (!stats) continue;
    if (!stats.isFile() || stats.uid !== process.getuid()) {
      throw new Error("Selected native SQLite sidecar changed before cleanup");
    }
    unlinkSync(sidecar);
  }
  if (dbStats) unlinkSync(owned.dbPath);
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
  mkdirSync(vitestDir, { recursive: true });
  if (process.env.OWNED_NATIVE_ARGS) assertPrivateNativeRoot(vitestDir);
  isolateHomeDirectoryForTests(projectRoot);
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

  // Pin the boot-time sandbox-mode resolver to "refuse" (a no-op advisory
  // banner under the default refusePolicy=warn) rather than letting it land
  // on "local_sandbox".
  //
  // Before the HTTP listener bind-host fix, this test server had no
  // NEOTOMA_HTTP_HOST set and app.listen(port) bound all interfaces, so
  // loopbackBindOnly was always false here and the resolver always landed on
  // "refuse" — leaving the shared nil-UUID LOCAL_DEV_USER_ID as the
  // authenticated principal every test in this suite is written against
  // (100+ files assert against that literal user id).
  //
  // After the fix, the listener genuinely binds loopback-only by default, so
  // loopbackBindOnly is now accurately true here too — and the resolver
  // (correctly, by its own design) lands on "local_sandbox" instead, which
  // activates a per-install fingerprinted principal in place of the nil UUID
  // (see _localSandboxActive in src/actions.ts). That is the RIGHT behavior
  // for a real local install; it is not what this shared test harness is
  // written to expect. Force the mode back to the one this environment has
  // always effectively run in, rather than rewriting the test corpus's
  // identity assumptions as a side effect of a bind-host security fix.
  // Shared with eval + playwright harnesses via resolveHarnessForceMode.
  process.env.NEOTOMA_FORCE_MODE = resolveHarnessForceMode(process.env);

  // The HTTP server imports the SQLite config and can open the selected path.
  // Claim it exclusively first; a caller-supplied proof file cannot certify freshness.
  const ownedSqlite = allocateOwnedNativeSqlite(projectRoot);
  try {
    const { startHTTPServer } = await import("./src/actions.ts");
    const started = await startHTTPServer();
    if (started?.port) {
      process.env.NEOTOMA_SESSION_DEV_PORT = String(started.port);
      process.env.NEOTOMA_SESSION_ENV = "dev";
    }

    return async () => {
      try {
        await new Promise<void>((resolve) => {
          if (!started?.server) {
            resolve();
            return;
          }
          started.server.close(() => resolve());
        });
      } finally {
        if (ownedSqlite) removeOwnedNativeSqlite(ownedSqlite);
      }
    };
  } catch (error) {
    if (ownedSqlite) removeOwnedNativeSqlite(ownedSqlite);
    throw error;
  }
}
