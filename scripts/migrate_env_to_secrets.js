#!/usr/bin/env node

/**
 * Migrate credentials from .env file to encrypted secrets manager
 * 
 * Reads environment variables from .env and stores them in the secrets manager.
 * 
 * Usage:
 *   node scripts/migrate_env_to_secrets.js
 */

import { config } from "dotenv";
import { execSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SECRETS_SCRIPT = join(__dirname, "secrets_manager.js");

// Load environment variables from .env
config({ override: true });

// Credentials to migrate
const credentialsToMigrate = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_KEY",
  "DEV_SUPABASE_URL",
  "DEV_SUPABASE_SERVICE_KEY",
  "OPENAI_API_KEY",
  "ACTIONS_BEARER_TOKEN",
];

console.log("[INFO] Migrating credentials from .env to secrets manager...\n");

let migrated = 0;
let skipped = 0;

for (const key of credentialsToMigrate) {
  const value = process.env[key];
  
  if (!value) {
    console.log(`[SKIP] ${key} - not set in .env`);
    skipped++;
    continue;
  }

  try {
    // Use execSync to call secrets_manager.js set command
    execSync(`node ${SECRETS_SCRIPT} set "${key}" "${value}"`, {
      stdio: "inherit",
      env: process.env,
    });
    migrated++;
    console.log(`[OK] ${key} - stored successfully\n`);
  } catch (error) {
    console.error(`[ERROR] Failed to store ${key}: ${error.message}`);
  }
}

console.log("\n[INFO] Migration complete:");
console.log(`  Migrated: ${migrated} credential(s)`);
console.log(`  Skipped: ${skipped} credential(s) (not in .env)`);

if (migrated > 0) {
  console.log("\n[INFO] Verify stored secrets:");
  console.log(`  node ${SECRETS_SCRIPT} list`);
}




