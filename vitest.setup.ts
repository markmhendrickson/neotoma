import "@testing-library/jest-dom/vitest";
import dotenv from "dotenv";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Load .env file before setting any defaults
dotenv.config(); // Load .env

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
