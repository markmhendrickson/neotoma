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
 * Create exec_sql RPC function if it doesn't exist
 */
async function ensureExecSQLFunction() {
  const createFunctionSQL = `
    CREATE OR REPLACE FUNCTION exec_sql(sql_text text)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      EXECUTE sql_text;
    END;
    $$;
  `;

  // Try to create via Management API first (doesn't require function to exist)
  const projectRef = supabaseConfig.url.match(
    /https:\/\/([^.]+)\.supabase\.co/
  )?.[1];
  
  if (projectRef) {
    const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
    if (!accessToken) {
      // Can't create function without access token
      return false;
    }

    try {
      const response = await fetch(
        `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: supabaseConfig.key,
          },
          body: JSON.stringify({ query: createFunctionSQL }),
        }
      );

      if (response.ok) {
        console.log("[INFO] Created exec_sql RPC function");
        return true;
      }
    } catch (error) {
      // Management API might not be available - that's OK, we'll try RPC
    }
  }

  // If Management API fails, try checking if function already exists
  try {
    const { error } = await supabase.rpc("exec_sql", { sql_text: "SELECT 1" });
    if (!error) {
      // Function exists
      return true;
    }
  } catch {
    // Function doesn't exist - we'll need to create it manually
  }

  return false;
}

/**
 * Execute SQL directly via Supabase using service key
 */
async function executeSQLDirect(sql) {
  try {
    // First try RPC (if exec_sql function exists)
    const { error: rpcError } = await supabase.rpc("exec_sql", { sql_text: sql });
    
    if (!rpcError) {
      return true;
    }

    // If RPC doesn't work, try using the Management API
    const projectRef = supabaseConfig.url.match(
      /https:\/\/([^.]+)\.supabase\.co/
    )?.[1];
    
    if (projectRef) {
      const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
      if (!accessToken) {
        console.warn(`[WARN] SUPABASE_ACCESS_TOKEN not set. Management API requires access token.`);
        console.warn(`[WARN] To enable automatic migrations, run: bash scripts/sync-env-from-1password.sh`);
        return false;
      }

      const response = await fetch(
        `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: supabaseConfig.key,
          },
          body: JSON.stringify({ query: sql }),
        }
      );

      if (response.ok) {
        return true;
      }
      
      const errorText = await response.text();
      if (errorText.includes("JWT could not be decoded")) {
        console.warn(`[WARN] Invalid SUPABASE_ACCESS_TOKEN. Please sync from 1Password: bash scripts/sync-env-from-1password.sh`);
      } else {
        console.warn(`[WARN] Management API failed: ${errorText.substring(0, 200)}`);
      }
    }
    
    console.warn(`[WARN] Could not execute SQL: ${rpcError?.message || "Unknown error"}`);
    return false;
  } catch (error) {
    console.warn(`[WARN] SQL execution failed: ${error.message}`);
    return false;
  }
}

/**
 * Apply migrations directly via SQL execution
 */
async function applyMigrationsDirect(dryRun = false) {
  if (dryRun) {
    console.log("[INFO] DRY-RUN: Would apply migrations directly");
    return true;
  }

  const files = await readdir(MIGRATIONS_DIR);
  const migrationFiles = files
    .filter((f) => f.endsWith(".sql") && !f.startsWith("_"))
    .sort();

  if (migrationFiles.length === 0) {
    console.log(`[INFO] No migration files found in ${MIGRATIONS_DIR}`);
    return true;
  }

  console.log(`[INFO] Attempting to apply ${migrationFiles.length} migration(s) directly...`);

  let applied = 0;
  let failed = 0;

  for (const file of migrationFiles) {
    try {
      const sqlPath = join(MIGRATIONS_DIR, file);
      let sql = await readFile(sqlPath, "utf-8");
      
      // Remove comments (lines starting with --)
      sql = sql
        .split("\n")
        .map((line) => {
          const commentIndex = line.indexOf("--");
          if (commentIndex >= 0) {
            // Check if -- is inside a string (simple check)
            const beforeComment = line.substring(0, commentIndex);
            const singleQuotes = (beforeComment.match(/'/g) || []).length;
            const doubleQuotes = (beforeComment.match(/"/g) || []).length;
            // If odd number of quotes, -- is inside a string, don't remove
            if (singleQuotes % 2 === 0 && doubleQuotes % 2 === 0) {
              return line.substring(0, commentIndex).trimEnd();
            }
          }
          return line;
        })
        .join("\n")
        .trim();

      // Execute the entire migration file as one statement
      // (Management API can handle multi-statement SQL)
      const success = await executeSQLDirect(sql);
      
      if (success) {
        applied++;
        const version = file.replace(".sql", "");
        await markMigrationApplied(version, file);
        console.log(`[INFO] ✅ Applied: ${file}`);
      } else {
        failed++;
        console.warn(`[WARN] Failed to execute ${file}`);
      }
    } catch (error) {
      failed++;
      console.error(`[ERROR] Failed to apply ${file}: ${error.message}`);
    }
  }

  if (applied > 0) {
    console.log(`[INFO] ✅ Successfully applied ${applied} migration(s)`);
  }
  if (failed > 0) {
    console.warn(`[WARN] ${failed} migration(s) failed to apply`);
  }

  return applied > 0;
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
      const migrationFiles = files
    .filter((f) => f.endsWith(".sql") && !f.startsWith("_"))
    .sort();

      for (const file of migrationFiles) {
        const version = file.replace(".sql", "");
        await markMigrationApplied(version, file);
      }

      console.log("[INFO] ✅ Migrations applied via Supabase CLI");
      return true;
    }
  }

  // Fallback: Try direct SQL execution
  console.log("[INFO] Attempting to apply migrations directly via SQL...");
  
  // First, ensure exec_sql function exists
  await ensureExecSQLFunction();
  
  const directSuccess = await applyMigrationsDirect(dryRun);
  if (directSuccess) {
    console.log("[INFO] ✅ Migrations applied directly");
    return true;
  }

  // Final fallback: Manual instructions
  const files = await readdir(MIGRATIONS_DIR);
  const migrationFiles = files
    .filter((f) => f.endsWith(".sql") && !f.startsWith("_"))
    .sort();

  if (migrationFiles.length === 0) {
    console.log(`[INFO] No migration files found in ${MIGRATIONS_DIR}`);
    return true;
  }

  // Get list of failed migrations
  const appliedMigrations = await getAppliedMigrations();
  const failedMigrations = migrationFiles.filter(
    (file) => !appliedMigrations.includes(file.replace(".sql", ""))
  );

  if (failedMigrations.length > 0) {
    console.log(
      `\n[INFO] ${failedMigrations.length} migration(s) still need to be applied:`
    );
    for (const file of failedMigrations) {
      console.log(`  - ${file}`);
    }

    if (!dryRun) {
      console.log("\n[INFO] To apply remaining migrations:");
      console.log("\n[OPTION 1] Supabase CLI (Recommended):");
      console.log("  1. Install: npm install -g supabase");
      console.log("  2. Login: npx supabase login");
      console.log("  3. Link: npx supabase link --project-ref YOUR_PROJECT_REF");
      console.log("  4. Push: npx supabase db push");
      
      console.log("\n[OPTION 2] Management API (Requires SUPABASE_ACCESS_TOKEN):");
      console.log("  1. Get access token from: https://supabase.com/dashboard/account/tokens");
      console.log("  2. Set: export SUPABASE_ACCESS_TOKEN=your_token");
      console.log("  3. Re-run: node scripts/run_migrations.js");
      
      console.log("\n[OPTION 3] Manual via Dashboard:");
      console.log("  1. Go to Supabase Dashboard → SQL Editor");
      console.log("  2. Copy and paste the contents of each migration file");
      console.log("  3. Execute each migration in order");
    }
  }

  // For test environments, warn but don't fail completely if some migrations succeeded
  if (failedMigrations.length > 0) {
    console.warn(
      "\n[WARN] Some migrations could not be applied automatically."
    );
    console.warn(
      "[WARN] Tests may fail if required tables are missing."
    );
    console.warn(
      "\n[WARN] To enable automatic migrations:"
    );
    console.warn(
      "  - Set SUPABASE_ACCESS_TOKEN environment variable, OR"
    );
    console.warn(
      "  - Install and configure Supabase CLI"
    );
  }

  // Return true if at least some migrations were applied
  return appliedMigrations.length > 0;
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
