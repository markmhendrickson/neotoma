import "@testing-library/jest-dom/vitest";
import dotenv from "dotenv";

// Load .env file before setting any defaults
dotenv.config({ path: ".env.development" });
dotenv.config(); // Load .env as fallback

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
      await migrationModule.runMigrations(false);
    }
  } catch (error) {
    console.warn(
      `[WARN] Could not run migrations in vitest.setup: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    // Continue anyway - migrations might already be applied
  }
})();
