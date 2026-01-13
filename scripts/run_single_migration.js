#!/usr/bin/env node

/**
 * Run a single migration file directly via Supabase REST API
 * 
 * This script executes SQL from a migration file using Supabase's exec_sql RPC function
 * (if available) or provides instructions for manual execution.
 */

import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

function getSupabaseConfig() {
  const projectId = process.env.SUPABASE_PROJECT_ID;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;

  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_KEY not found in environment");
  }

  let url;
  if (projectId) {
    url = `https://${projectId}.supabase.co`;
  } else if (supabaseUrl) {
    url = supabaseUrl;
  } else {
    throw new Error("SUPABASE_PROJECT_ID or SUPABASE_URL must be set");
  }

  return { url, serviceKey };
}

async function runMigration(migrationFile) {
  const { url, serviceKey } = getSupabaseConfig();
  const supabase = createClient(url, serviceKey);

  console.log(`[INFO] Reading migration file: ${migrationFile}`);
  const sql = await readFile(migrationFile, "utf-8");

  console.log(`[INFO] Executing migration...`);
  console.log(`[INFO] SQL Preview (first 200 chars):\n${sql.substring(0, 200)}...\n`);

  // Try to execute via RPC function (if available)
  try {
    const { data, error } = await supabase.rpc("exec_sql", { sql });
    
    if (error) {
      // RPC function might not exist, fall back to manual instructions
      if (error.code === "PGRST202" || error.message.includes("function") || error.message.includes("does not exist")) {
        console.log("[INFO] exec_sql RPC function not available. Use manual execution method.");
        return false;
      }
      throw error;
    }

    console.log("[INFO] ✅ Migration executed successfully via RPC");
    console.log("[INFO] Result:", data);
    return true;
  } catch (error) {
    console.error("[ERROR] Failed to execute via RPC:", error.message);
    return false;
  }
}

// Main execution
const migrationFile = process.argv[2] || join(__dirname, "../supabase/migrations/20260127000001_drop_deprecated_edge_tables.sql");

runMigration(migrationFile)
  .then((success) => {
    if (!success) {
      console.log("\n[INFO] To run this migration manually:");
      console.log("  1. Go to Supabase Dashboard → SQL Editor");
      console.log(`  2. Copy and paste the contents of: ${migrationFile}`);
      console.log("  3. Click 'Run' to execute");
      process.exit(1);
    } else {
      process.exit(0);
    }
  })
  .catch((error) => {
    console.error("[ERROR] Migration failed:", error);
    process.exit(1);
  });
