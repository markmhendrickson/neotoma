import "@testing-library/jest-dom/vitest";
import dotenv from "dotenv";
import { randomBytes } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Load .env file before setting any defaults
dotenv.config(); // Load .env

/**
 * Fail the run — do not just warn — if any code under test writes inside the
 * operator's REAL home directory instead of the isolated stand-in that
 * vitest.global_setup.ts points HOME/USERPROFILE at.
 *
 * vitest.global_setup.ts overrides HOME for every worker before any test file
 * loads, so this should be unreachable in practice; it exists as a second,
 * independent layer in case some code path resolves the real home some other
 * way (a hardcoded path, a cached lookup from before the override, a native
 * addon that reads getpwuid directly). Without this, such a write would
 * succeed silently and reproduce the exact incident this guard exists to
 * prevent — a worktree's test run rewriting the operator's real
 * ~/.cursor/mcp.json (or another harness's user-level config).
 *
 * Scoped to path strings, not a full fs mock: it inspects the destination
 * argument of the write-capable fs functions and throws before delegating to
 * the real implementation when that path falls under the real home. Reads
 * are intentionally left alone (a test may legitimately need to read real
 * ambient config to assert isolation works); only writes are refused.
 */
/**
 * Known user-level harness config leaves, relative to a home directory, that
 * `src/cli/mcp_config_scan.ts` (getUserLevelConfigPaths / getUserLevelCodexConfigPath)
 * and the AAuth key lookup (hasAAuthKeys) read or write. Deliberately narrow —
 * the guard's job is to catch a write to one of THESE specific harness config
 * paths landing on the real home, not to forbid every write anywhere under it.
 * A path like `<realHome>/repos/<this-checkout>/...` is legitimately under the
 * real home (the checkout itself lives there) and must not trip this guard;
 * only these harness-config leaves are the actual incident surface.
 */
const GUARDED_USER_CONFIG_RELATIVE_PATHS = [
  path.join(".cursor", "mcp.json"),
  path.join("Library", "Application Support", "Claude", "claude_desktop_config.json"),
  path.join(".config", "Claude", "claude_desktop_config.json"),
  path.join(".codeium", "windsurf", "mcp_config.json"),
  path.join(".codex", "config.toml"),
  path.join(".continue", "config.json"),
  path.join(".neotoma", "aauth", "private.jwk"),
] as const;

function installRealHomeWriteGuard(): void {
  const realHome = process.env.NEOTOMA_TEST_REAL_HOME;
  const isolatedHome = process.env.NEOTOMA_TEST_ISOLATED_HOME;
  if (!realHome || !isolatedHome) {
    // vitest.global_setup.ts did not run (e.g. a test file imported in
    // isolation outside the normal `vitest run`) — nothing to guard.
    return;
  }
  const realHomeResolved = path.resolve(realHome);
  const guardedAbsolutePaths = GUARDED_USER_CONFIG_RELATIVE_PATHS.map((rel) =>
    path.join(realHomeResolved, rel)
  );
  // Also guard the harness config DIRECTORIES themselves (e.g. a bare
  // `mkdir(~/.cursor)` ahead of writing mcp.json), one level up from each leaf.
  const guardedAbsoluteDirs = Array.from(new Set(guardedAbsolutePaths.map((p) => path.dirname(p))));

  function isGuardedRealHomePath(target: unknown): boolean {
    if (typeof target !== "string" && !Buffer.isBuffer(target)) return false;
    const targetStr = target.toString();
    if (!targetStr) return false;
    let resolved: string;
    try {
      resolved = path.resolve(targetStr);
    } catch {
      return false;
    }
    if (guardedAbsolutePaths.includes(resolved)) return true;
    return guardedAbsoluteDirs.some(
      (dir) => resolved === dir || resolved.startsWith(dir + path.sep)
    );
  }

  function guardPathArg(fnName: string, target: unknown): void {
    if (isGuardedRealHomePath(target)) {
      throw new Error(
        `[real-home-write-guard] Refused ${fnName}(${String(target)}): this is a known ` +
          "user-level harness config path under the operator's REAL home directory " +
          `(${realHomeResolved}), not the isolated test home (${isolatedHome}). ` +
          "vitest.global_setup.ts overrides HOME/USERPROFILE for this exact reason (a prior " +
          "incident: CLI code under test rewrote the operator's real ~/.cursor/mcp.json). If " +
          "this test needs a user-level config path, build it from process.env.HOME / " +
          "os.homedir() AFTER importing the code under test, not from a path captured before " +
          "the override, and never hardcode the real home."
      );
    }
  }

  const writeFnNames = [
    "writeFile",
    "writeFileSync",
    "appendFile",
    "appendFileSync",
    "mkdir",
    "mkdirSync",
    "rm",
    "rmSync",
    "rmdir",
    "rmdirSync",
    "unlink",
    "unlinkSync",
    "rename",
    "renameSync",
    "chmod",
    "chmodSync",
    "chflags",
    "chflagsSync",
    "utimes",
    "utimesSync",
    "copyFile",
    "copyFileSync",
    "symlink",
    "symlinkSync",
  ] as const;

  for (const fnName of writeFnNames) {
    // fs (callback) API
    const originalCb = (fs as Record<string, unknown>)[fnName];
    if (typeof originalCb === "function") {
      (fs as Record<string, unknown>)[fnName] = function guarded(
        this: unknown,
        ...args: unknown[]
      ) {
        guardPathArg(`fs.${fnName}`, args[0]);
        return (originalCb as (...a: unknown[]) => unknown).apply(this, args);
      };
    }
    // fs/promises API
    const originalPromise = (fs.promises as unknown as Record<string, unknown>)[fnName];
    if (typeof originalPromise === "function") {
      (fs.promises as unknown as Record<string, unknown>)[fnName] = function guarded(
        this: unknown,
        ...args: unknown[]
      ) {
        guardPathArg(`fs.promises.${fnName}`, args[0]);
        return (originalPromise as (...a: unknown[]) => unknown).apply(this, args);
      };
    }
  }
}

installRealHomeWriteGuard();

// Local-only mode: run integration/service/unit tests against local SQLite DB
const useLocalDb = process.env.RUN_REMOTE_TESTS !== "1";
if (useLocalDb) {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
  const vitestDir = path.join(projectRoot, ".vitest");
  mkdirSync(path.join(vitestDir, "sources"), { recursive: true });
  process.env.NEOTOMA_DATA_DIR = vitestDir;
}

// Only set test key if no real key exists (don't override real keys)
if (!process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = "test-openai-key";
}

// Disable icon generation in tests (avoids network calls and OpenAI dependency).
if (!process.env.ICON_GENERATION_ENABLED) {
  process.env.ICON_GENERATION_ENABLED = "false";
}

// OAuth tests require a 64-char hex key. .env placeholders (e.g. your-encryption-key-here) must not win.
const VALID_MCP_TOKEN_ENC_KEY = /^[0-9a-fA-F]{64}$/;
function isValidMcpTokenEncryptionKey(key: string | undefined): boolean {
  return typeof key === "string" && VALID_MCP_TOKEN_ENC_KEY.test(key);
}
{
  const nk = process.env.NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY;
  const mk = process.env.MCP_TOKEN_ENCRYPTION_KEY;
  if (nk && !isValidMcpTokenEncryptionKey(nk)) {
    delete process.env.NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY;
  }
  if (mk && !isValidMcpTokenEncryptionKey(mk)) {
    delete process.env.MCP_TOKEN_ENCRYPTION_KEY;
  }
  if (
    !isValidMcpTokenEncryptionKey(process.env.NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY) &&
    !isValidMcpTokenEncryptionKey(process.env.MCP_TOKEN_ENCRYPTION_KEY)
  ) {
    process.env.NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  }
}

// Set test OAuth client ID for OAuth 2.1 Server tests (if not already set)
if (!process.env.NEOTOMA_OAUTH_CLIENT_ID) {
  process.env.NEOTOMA_OAUTH_CLIENT_ID = "test-client-id";
}

// Set test MCP authentication (for MCP server action tests)
if (!process.env.NEOTOMA_CONNECTION_ID && !process.env.NEOTOMA_SESSION_TOKEN) {
  // Use a test connection ID that bypasses authentication in test environment
  process.env.NEOTOMA_CONNECTION_ID = "test-connection-bypass";
}

// Run database migrations before tests (skip when VITEST_SKIP_MIGRATIONS=1; local mode uses SQLite, no remote migrations)
const MIGRATION_TIMEOUT_MS = 20000;

(async () => {
  if (process.env.VITEST_SKIP_MIGRATIONS === "1") {
    return;
  }
  // Local-only: skip remote migration setup
  if (process.env.RUN_REMOTE_TESTS !== "1") {
    return;
  }
  try {
    const migrationModule = await import("./scripts/run_migrations.js");
    if (!migrationModule.runMigrations) {
      return;
    }
    const run = migrationModule.runMigrations(false);
    const success = await Promise.race([
      run,
      new Promise<false>((_, reject) =>
        setTimeout(() => reject(new Error("Migration timeout")), MIGRATION_TIMEOUT_MS)
      ),
    ]).catch((error) => {
      console.error(
        `[WARN] Migrations skipped in vitest.setup: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return false;
    });
    if (!success) {
      console.error(
        "[WARN] Migrations could not be applied. Integration tests may fail due to missing tables."
      );
    }
  } catch (error) {
    console.error(
      `[WARN] Could not run migrations in vitest.setup: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
})();
