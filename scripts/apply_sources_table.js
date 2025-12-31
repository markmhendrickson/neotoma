#!/usr/bin/env node

/**
 * Apply sources table migration directly
 * Use this if the migration tracking is out of sync
 */

import { readFile, writeFile, unlink } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";
import dotenv from "dotenv";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config();

const env = process.env.NODE_ENV || "production";

async function applySourcesTable() {
  console.log(`[INFO] Applying sources table migration to ${env}...`);
  
  const sqlPath = join(__dirname, "../supabase/migrations/20251231000001_add_sources_table.sql");
  const sql = await readFile(sqlPath, "utf-8");
  
  // Try using psql if DATABASE_URL is available
  const databaseUrl = env === "production"
    ? process.env.PROD_DATABASE_URL
    : process.env.DEV_DATABASE_URL;
  
  if (databaseUrl) {
    try {
      console.log(`[INFO] Executing SQL via psql...`);
      const { stdout, stderr } = await execAsync(
        `psql "${databaseUrl}" -c "${sql.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
        {
          cwd: join(__dirname, ".."),
        }
      );
      
      if (stdout) {
        console.log(stdout);
      }
      if (stderr && !stderr.includes("INFO")) {
        console.warn(stderr);
      }
      
      console.log(`[INFO] ✅ Migration applied successfully`);
      return;
    } catch (error) {
      console.warn(`[WARN] psql execution failed: ${error.message}`);
      // Fall through to manual instructions
    }
  }
  
  // Since Supabase CLI doesn't support direct SQL execution and migration tracking
  // is out of sync, we need to apply manually via Dashboard
  console.error(`\n[INFO] Automated application not available.`);
  console.error(`[INFO] The Supabase CLI migration system shows migrations as "up to date",`);
  console.error(`[INFO] but the table doesn't exist (migration tracking mismatch).\n`);
  
  console.error(`[INFO] Please apply manually via Supabase Dashboard SQL Editor:`);
  console.error(`[INFO] 1. Go to Supabase Dashboard → SQL Editor`);
  console.error(`[INFO] 2. Copy and paste the SQL below`);
  console.error(`[INFO] 3. Execute the SQL`);
  console.error(`[INFO] 4. The migration uses "CREATE TABLE IF NOT EXISTS" so it's safe to run\n`);
  
  console.log(`SQL to apply:\n`);
  console.log("=".repeat(80));
  console.log(sql);
  console.log("=".repeat(80));
  
  process.exit(0);
}

applySourcesTable().catch(console.error);

