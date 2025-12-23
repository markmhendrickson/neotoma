import "@testing-library/jest-dom/vitest";
import dotenv from "dotenv";

// Load .env file before setting any defaults
dotenv.config(); // Load .env

// Only set test key if no real key exists (don't override real keys)
if (!process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = "test-openai-key";
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
