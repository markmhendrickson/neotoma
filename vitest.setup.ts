import "@testing-library/jest-dom/vitest";
import dotenv from "dotenv";
import { randomBytes } from "node:crypto";

// Load .env file before setting any defaults
dotenv.config(); // Load .env

// Only set test key if no real key exists (don't override real keys)
if (!process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = "test-openai-key";
}

// Set test encryption key for OAuth token encryption tests (if not already set)
if (!process.env.MCP_TOKEN_ENCRYPTION_KEY) {
  // Generate a test encryption key (32 bytes = 64 hex characters)
  const testKey = randomBytes(32).toString("hex");
  process.env.MCP_TOKEN_ENCRYPTION_KEY = testKey;
}

// Set test OAuth client ID for OAuth 2.1 Server tests (if not already set)
if (!process.env.SUPABASE_OAUTH_CLIENT_ID) {
  process.env.SUPABASE_OAUTH_CLIENT_ID = "test-client-id";
}

// Set test MCP authentication (for MCP server action tests)
if (!process.env.NEOTOMA_CONNECTION_ID && !process.env.NEOTOMA_SESSION_TOKEN) {
  // Use a test connection ID that bypasses authentication in test environment
  process.env.NEOTOMA_CONNECTION_ID = "test-connection-bypass";
}

// Run database migrations before tests
(async () => {
  try {
    // Use dynamic import to avoid issues with module resolution
    const migrationModule = await import("./scripts/run_migrations.js");
    if (migrationModule.runMigrations) {
      const success = await migrationModule.runMigrations(false);
      if (!success) {
        console.error(
          "[ERROR] Migrations could not be applied. Tests may fail due to missing tables."
        );
        console.error(
          "[ERROR] Required tables: state_events, entities, payload_submissions, schema_registry"
        );
        console.error(
          "[ERROR] To fix: Run supabase/migrations/APPLY_ALL_MISSING_TABLES.sql in Supabase Dashboard SQL Editor"
        );
        // Don't exit - let tests run and fail clearly rather than silently
      }
    }
  } catch (error) {
    console.error(
      `[ERROR] Could not run migrations in vitest.setup: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    console.error(
      "[ERROR] Tests may fail due to missing database tables."
    );
    // Don't exit - let tests run and fail clearly
  }
})();
