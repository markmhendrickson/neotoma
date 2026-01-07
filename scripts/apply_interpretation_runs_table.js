#!/usr/bin/env node

/**
 * Apply interpretation_runs table migration directly
 * 
 * This script applies the interpretation_runs table migration SQL directly
 * to fix the "missing table" error when PostgREST schema cache is stale.
 */

import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables
dotenv.config();

// Get Supabase config
function getSupabaseConfig() {
  const buildUrl = (projectId, fallbackUrl) => {
    if (projectId) return `https://${projectId}.supabase.co`;
    return fallbackUrl || "";
  };

  const env = process.env.NODE_ENV || "development";
  if (env === "production") {
    const prodId = process.env.PROD_SUPABASE_PROJECT_ID;
    return {
      url: buildUrl(prodId, process.env.PROD_SUPABASE_URL),
      key: process.env.PROD_SUPABASE_SERVICE_KEY || "",
    };
  }

  const devId = process.env.DEV_SUPABASE_PROJECT_ID;
  return {
    url: buildUrl(devId, process.env.DEV_SUPABASE_URL),
    key: process.env.DEV_SUPABASE_SERVICE_KEY || "",
  };
}

const config = getSupabaseConfig();

if (!config.url || !config.key) {
  console.error("[ERROR] Missing Supabase URL or service key");
  if (process.env.NODE_ENV === "production") {
    console.error("[ERROR] Set PROD_SUPABASE_PROJECT_ID and PROD_SUPABASE_SERVICE_KEY");
  } else {
    console.error("[ERROR] Set DEV_SUPABASE_PROJECT_ID and DEV_SUPABASE_SERVICE_KEY");
  }
  process.exit(1);
}

const supabase = createClient(config.url, config.key);

async function applyMigration() {
  console.log("[INFO] Applying interpretation_runs table migration...");

  const migrationPath = join(
    __dirname,
    "../supabase/migrations/20251231000003_add_interpretation_runs_table.sql"
  );

  let sql;
  try {
    sql = await readFile(migrationPath, "utf-8");
  } catch (error) {
    console.error(`[ERROR] Could not read migration file: ${error.message}`);
    process.exit(1);
  }

  // Extract project ref for Management API
  const projectRef = config.url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  
  if (!projectRef) {
    console.error("[ERROR] Could not extract project ref from URL");
    console.error("[ERROR] Please apply the migration manually via Supabase SQL Editor:");
    console.error(`[INFO] Migration file: ${migrationPath}`);
    process.exit(1);
  }

  try {
    // Use Management API to execute SQL
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.key}`,
          apikey: config.key,
        },
        body: JSON.stringify({ query: sql }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ERROR] Migration failed: ${errorText}`);
      console.error("\n[INFO] Alternative: Apply migration manually via Supabase SQL Editor");
      console.error(`[INFO] Migration file: ${migrationPath}`);
      process.exit(1);
    }

    const result = await response.json();
    console.log("[INFO] ✅ Migration applied successfully");
    console.log("[INFO] Note: PostgREST schema cache may take a few seconds to refresh");
    return true;
  } catch (error) {
    console.error(`[ERROR] Failed to apply migration: ${error.message}`);
    console.error("\n[INFO] Alternative: Apply migration manually via Supabase SQL Editor");
    console.error(`[INFO] Migration file: ${migrationPath}`);
    console.error("\n[INFO] Or copy and paste this SQL:");
    console.log("\n" + "=".repeat(80));
    console.log(sql);
    console.log("=".repeat(80));
    process.exit(1);
  }
}

applyMigration()
  .then(() => {
    console.log("[INFO] ✅ Process completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("[ERROR] Process failed:", error);
    process.exit(1);
  });





