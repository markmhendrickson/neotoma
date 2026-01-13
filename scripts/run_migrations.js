#!/usr/bin/env node

/**
 * Run Supabase database migrations
 *
 * Executes migration files from supabase/migrations/ against the configured Supabase database.
 *
 * This script attempts multiple methods:
 * 1. Supabase CLI (if available): `supabase db push`
 * 2. Direct SQL execution via Supabase REST API (requires helper RPC function)
 * 3. Manual instructions if automated methods fail
 *
 * Usage: tsx scripts/run_migrations.js [--dry-run]
 *
 * For automatic execution, ensure migrations are applied via:
 * - Supabase CLI: `supabase db push`
 * - Or manually via Supabase SQL Editor
 */

import { readFile, readdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const execAsync = promisify(exec);

// Load environment variables
const env = process.env.NODE_ENV || "development";
dotenv.config(); // Load .env

// Get Supabase config from environment
function getSupabaseConfig() {
  const buildUrl = (projectId, fallbackUrl) => {
    if (projectId) return `https://${projectId}.supabase.co`;
    return fallbackUrl || "";
  };

  // Use single variable names (set by 1Password sync based on ENVIRONMENT variable)
  const projectId = process.env.SUPABASE_PROJECT_ID;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const url = process.env.SUPABASE_URL;

  return {
    url: buildUrl(projectId, url),
    key: serviceKey || "",
  };
}

const supabaseConfig = getSupabaseConfig();

if (!supabaseConfig.url || !supabaseConfig.key) {
  console.error("[ERROR] Missing Supabase URL or service key");
  console.error(
    "[ERROR] Set SUPABASE_PROJECT_ID (or SUPABASE_URL) and SUPABASE_SERVICE_KEY"
  );
  process.exit(1);
}

const supabase = createClient(supabaseConfig.url, supabaseConfig.key);

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "../supabase/migrations");

// Track applied migrations in a table
const MIGRATIONS_TABLE = "schema_migrations";

/**
 * Check if Supabase CLI is available (via npx)
 */
async function checkSupabaseCLI() {
  try {
    await execAsync("npx supabase --version");
    return true;
  } catch {
    return false;
  }
}

/**
 * Link Supabase project if not already linked
 */
async function ensureSupabaseLinked() {
  try {
    // Check if already linked by looking for project_id in config.toml
    const configPath = join(__dirname, "../supabase/config.toml");
    try {
      const configContent = await readFile(configPath, "utf-8");
      if (configContent.includes("project_id")) {
        console.log("[INFO] Supabase project already linked");
        return true;
      }
    } catch {
      // Config file doesn't exist or can't be read
    }

    // Extract project ref from URL
    const projectRef = supabaseConfig.url.match(
      /https:\/\/([^.]+)\.supabase\.co/
    )?.[1];
    if (!projectRef) {
      console.warn("[WARN] Could not extract project ref from URL");
      return false;
    }

    console.log(`[INFO] Linking Supabase project: ${projectRef}`);
    const { stdout, stderr } = await execAsync(
      `npx supabase link --project-ref ${projectRef}`,
      {
        cwd: join(__dirname, ".."),
      }
    );

    if (stderr && !stderr.includes("INFO") && !stderr.includes("linked")) {
      console.warn("[WARN] Link stderr:", stderr);
    }

    console.log("[INFO] Link output:", stdout);
    return true;
  } catch (error) {
    // Check if error is about access token
    if (
      error.message.includes("Access token") ||
      error.message.includes("login")
    ) {
      console.warn("[WARN] Supabase login required. Run: npx supabase login");
      return false;
    }
    console.warn(`[WARN] Could not link Supabase project: ${error.message}`);
    return false;
  }
}

/**
 * Execute migrations using Supabase CLI
 */
async function executeMigrationsViaCLI(dryRun = false) {
  if (dryRun) {
    console.log("[INFO] DRY-RUN: Would execute: npx supabase db push");
    return true;
  }

  try {
    // Ensure project is linked
    const linked = await ensureSupabaseLinked();
    if (!linked) {
      return false;
    }

    console.log("[INFO] Using Supabase CLI to apply migrations...");
    const { stdout, stderr } = await execAsync("npx supabase db push", {
      cwd: join(__dirname, ".."),
    });

    if (stderr && !stderr.includes("INFO") && !stderr.includes("Applying")) {
      console.warn("[WARN] Supabase CLI stderr:", stderr);
    }

    if (stdout) {
      console.log("[INFO] Supabase CLI output:", stdout);
    }
    return true;
  } catch (error) {
    // Check if error is about access token
    if (
      error.message.includes("Access token") ||
      error.message.includes("login")
    ) {
      console.error("[ERROR] Supabase login required. Run: npx supabase login");
      return false;
    }
    console.error("[ERROR] Supabase CLI failed:", error.message);
    if (error.stdout) console.error("stdout:", error.stdout);
    if (error.stderr) console.error("stderr:", error.stderr);
    return false;
  }
}

/**
 * Get list of applied migrations
 */
async function getAppliedMigrations() {
  try {
    const { data, error } = await supabase
      .from(MIGRATIONS_TABLE)
      .select("version")
      .order("applied_at", { ascending: true });

    if (error && error.code === "PGRST116") {
      // Table doesn't exist yet
      return [];
    }

    if (error) {
      console.warn(`[WARN] Could not query migrations table: ${error.message}`);
      return [];
    }

    return (data || []).map((m) => m.version);
  } catch (error) {
    console.warn(`[WARN] Could not get applied migrations: ${error.message}`);
    return [];
  }
}

/**
 * Mark migration as applied
 */
async function markMigrationApplied(version, name) {
  try {
    await supabase.from(MIGRATIONS_TABLE).insert({
      version,
      name,
    });
  } catch (error) {
    console.warn(
      `[WARN] Could not mark migration as applied: ${error.message}`
    );
  }
}

/**
 * Run all pending migrations
 * Exported for use in test setup and other scripts
 */
export async function runMigrations(dryRun = false) {
  console.log(
    `[INFO] ${dryRun ? "DRY RUN: " : ""}Running Supabase migrations...`
  );

  // Check if Supabase CLI is available
  const hasCLI = await checkSupabaseCLI();

  if (hasCLI) {
    console.log("[INFO] Supabase CLI detected, using it to apply migrations");
    const success = await executeMigrationsViaCLI(dryRun);
    if (success) {
      // Mark migrations as applied
      const files = await readdir(MIGRATIONS_DIR);
      const migrationFiles = files.filter((f) => f.endsWith(".sql")).sort();

      for (const file of migrationFiles) {
        const version = file.replace(".sql", "");
        await markMigrationApplied(version, file);
      }

      console.log("[INFO] ✅ Migrations applied via Supabase CLI");
      return true;
    }
  }

  // Fallback: Manual instructions
  console.log(
    "[INFO] Supabase CLI not available. Migrations need to be applied manually."
  );
  console.log("[INFO] Migration files found:");

  const files = await readdir(MIGRATIONS_DIR);
  const migrationFiles = files.filter((f) => f.endsWith(".sql")).sort();

  if (migrationFiles.length === 0) {
    console.log(`[INFO] No migration files found in ${MIGRATIONS_DIR}`);
    return true;
  }

  console.log(`[INFO] Found ${migrationFiles.length} migration file(s):`);
  for (const file of migrationFiles) {
    console.log(`  - ${file}`);
  }

  if (!dryRun) {
    console.log("\n[INFO] To apply migrations manually:");
    console.log("  1. Go to Supabase Dashboard → SQL Editor");
    console.log("  2. Copy and paste the contents of each migration file");
    console.log("  3. Execute each migration in order");
    console.log("\n[INFO] Or install Supabase CLI and run:");
    console.log("  npm install -g supabase");
    console.log("  supabase link --project-ref YOUR_PROJECT_REF");
    console.log("  supabase db push");
  }

  // For test environments, try to apply migrations directly if possible
  // Otherwise, fail so tests don't run with missing tables
  console.error(
    "\n[ERROR] Migrations could not be applied automatically."
  );
  console.error(
    "[ERROR] Tests will fail without these tables: state_events, entities, payload_submissions, schema_registry"
  );
  console.error(
    "\n[ERROR] To fix: Apply migrations via Supabase Dashboard SQL Editor or ensure Supabase CLI is configured."
  );
  return false;
}

// Main execution (only if run directly, not imported)
const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  (process.argv[1] && import.meta.url.endsWith(process.argv[1]));

if (isMainModule || !process.env.VITEST) {
  const dryRun = process.argv.includes("--dry-run");

  runMigrations(dryRun)
    .then((success) => {
      if (success) {
        console.log(`[INFO] ✅ Migration process completed`);
        if (isMainModule) process.exit(0);
      } else {
        console.error(`[ERROR] ❌ Migration process failed`);
        if (isMainModule) process.exit(1);
      }
    })
    .catch((error) => {
      console.error(`[ERROR] Migration runner failed:`, error);
      if (isMainModule) process.exit(1);
    });
}
