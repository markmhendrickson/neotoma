#!/usr/bin/env node

/**
 * Run database migrations (local SQLite only)
 *
 * Neotoma uses local SQLite by default. Schema is created automatically by
 * sqlite_client on first connection. This script is a no-op for local mode.
 *
 * Usage: node scripts/run_migrations.js [--dry-run]
 */

import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

dotenv.config({ path: join(PROJECT_ROOT, ".env") });
dotenv.config({ path: join(PROJECT_ROOT, ".env.development"), override: false });

/**
 * Run migrations. For local SQLite, schema is auto-created by sqlite_client.
 * Returns true (success) immediately.
 */
export async function runMigrations(dryRun = false) {
  if (dryRun) {
    console.log("[INFO] DRY-RUN: Local SQLite schema is auto-created on first connection.");
    return true;
  }
  console.log("[INFO] Local SQLite: schema created on first connection. No migrations to run.");
  return true;
}

const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  (process.argv[1] && import.meta.url.endsWith(process.argv[1]));

if (isMainModule || !process.env.VITEST) {
  const dryRun = process.argv.includes("--dry-run");
  runMigrations(dryRun)
    .then((success) => {
      if (success) {
        console.log("[INFO] Migration process completed");
        if (isMainModule) process.exit(0);
      } else {
        console.error("[ERROR] Migration process failed");
        if (isMainModule) process.exit(1);
      }
    })
    .catch((error) => {
      console.error("[ERROR] Migration runner failed:", error);
      if (isMainModule) process.exit(1);
    });
}
