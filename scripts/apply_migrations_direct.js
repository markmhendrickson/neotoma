#!/usr/bin/env node

/**
 * Apply Supabase migrations directly via SQL execution
 *
 * This script executes migration SQL files directly using Supabase REST API.
 * It uses the service_role key to execute DDL statements.
 */

import { readFile, readdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables
dotenv.config();
dotenv.config();

// Get Supabase config
function getSupabaseConfig() {
  const buildUrl = (projectId, fallbackUrl) => {
    if (projectId) return `https://${projectId}.supabase.co`;
    return fallbackUrl || "";
  };

  const env = process.env.NODE_ENV || "development";
  if (env === "production") {
    // Production: ONLY use PROD_* variables, never generic SUPABASE_* to prevent accidental dev/prod mixups
    const prodId = process.env.PROD_SUPABASE_PROJECT_ID;
    return {
      url: buildUrl(prodId, process.env.PROD_SUPABASE_URL),
      key: process.env.PROD_SUPABASE_SERVICE_KEY || "",
    };
  }

  // Development/test: ONLY use DEV_* variables, never generic SUPABASE_* to prevent accidental prod usage
  const devId = process.env.DEV_SUPABASE_PROJECT_ID;
  return {
    url: buildUrl(devId, process.env.DEV_SUPABASE_URL),
    key: process.env.DEV_SUPABASE_SERVICE_KEY || "",
  };
}

const config = getSupabaseConfig();
const supabase = createClient(config.url, config.key);

const MIGRATIONS_DIR = join(__dirname, "../supabase/migrations");

/**
 * Execute SQL via Supabase REST API using RPC
 * Note: This requires a helper function in the database
 * For now, we'll use a workaround: execute via Management API or psql
 */
async function executeSQL(sql) {
  // Split SQL into statements
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.match(/^--/));

  // Execute each statement
  for (const statement of statements) {
    if (statement.trim().length === 0) continue;

    try {
      // Use Supabase REST API - but DDL statements need special handling
      // For CREATE TABLE, ALTER TABLE, etc., we need to use the Management API
      // or execute via psql

      // Try using Supabase client's RPC if we have an exec_sql function
      // Otherwise, we'll need to use Management API or direct connection

      console.log(`[INFO] Executing: ${statement.substring(0, 100)}...`);

      // For MVP, we'll use a simpler approach: execute via fetch to Supabase REST API
      // But DDL statements aren't supported via PostgREST
      // We need to use Management API or psql

      // Extract project ref
      const projectRef = config.url.match(
        /https:\/\/([^.]+)\.supabase\.co/
      )?.[1];

      // Use Management API
      const response = await fetch(
        `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.key}`,
            apikey: config.key,
          },
          body: JSON.stringify({ query: statement }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SQL execution failed: ${errorText}`);
      }

      const result = await response.json();
      console.log(`[INFO] ✅ Statement executed successfully`);
    } catch (error) {
      console.error(`[ERROR] Failed to execute statement: ${error.message}`);
      throw error;
    }
  }
}

async function applyMigrations() {
  console.log("[INFO] Applying migrations directly via SQL...");

  const files = await readdir(MIGRATIONS_DIR);
  const migrationFiles = files.filter((f) => f.endsWith(".sql")).sort();

  if (migrationFiles.length === 0) {
    console.log("[INFO] No migration files found");
    return;
  }

  console.log(`[INFO] Found ${migrationFiles.length} migration file(s)`);

  for (const file of migrationFiles) {
    console.log(`[INFO] Applying migration: ${file}`);
    try {
      const sqlPath = join(MIGRATIONS_DIR, file);
      const sql = await readFile(sqlPath, "utf-8");
      await executeSQL(sql);
      console.log(`[INFO] ✅ Migration ${file} applied successfully`);
    } catch (error) {
      console.error(
        `[ERROR] Failed to apply migration ${file}: ${error.message}`
      );
      throw error;
    }
  }

  console.log("[INFO] ✅ All migrations applied successfully");
}

applyMigrations()
  .then(() => {
    console.log("[INFO] Migration process completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("[ERROR] Migration process failed:", error);
    process.exit(1);
  });









