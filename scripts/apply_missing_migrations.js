#!/usr/bin/env node

/**
 * Apply missing migrations directly via Supabase SQL execution
 * This script consolidates all missing migrations and applies them
 */

import { readFile, readdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config();

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
      projectRef: prodId,
    };
  }

  const devId = process.env.DEV_SUPABASE_PROJECT_ID;
  return {
    url: buildUrl(devId, process.env.DEV_SUPABASE_URL),
    key: process.env.DEV_SUPABASE_SERVICE_KEY || "",
    projectRef: devId,
  };
}

const config = getSupabaseConfig();
const supabase = createClient(config.url, config.key);
const MIGRATIONS_DIR = join(__dirname, "../supabase/migrations");

async function checkTableExists(tableName) {
  const { error } = await supabase.from(tableName).select("id").limit(1);
  // PGRST205 = table not found
  return !error || error.code !== "PGRST205";
}

async function applyMigrationSQL(sql) {
  // Try to execute via Supabase Management API
  // This requires SUPABASE_ACCESS_TOKEN (not service key)
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  
  if (!accessToken) {
    console.warn("[WARN] SUPABASE_ACCESS_TOKEN not set. Cannot apply migrations automatically.");
    console.warn("[WARN] Please set SUPABASE_ACCESS_TOKEN or apply migrations manually via Supabase Dashboard.");
    return false;
  }

  try {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${config.projectRef}/database/query`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ query: sql }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Management API error: ${errorText}`);
    }

    return true;
  } catch (error) {
    console.error(`[ERROR] Failed to apply migration: ${error.message}`);
    return false;
  }
}

async function applyMigrations() {
  console.log("[INFO] Checking for missing tables...");

  const requiredTables = [
    "state_events",
    "entities", 
    "payload_submissions",
    "schema_registry"
  ];

  const missingTables = [];
  for (const table of requiredTables) {
    const exists = await checkTableExists(table);
    if (!exists) {
      missingTables.push(table);
      console.log(`[INFO] ❌ Missing table: ${table}`);
    } else {
      console.log(`[INFO] ✅ Table exists: ${table}`);
    }
  }

  if (missingTables.length === 0) {
    console.log("[INFO] ✅ All required tables exist. No migrations needed.");
    return true;
  }

  console.log(`\n[INFO] Found ${missingTables.length} missing table(s). Applying migrations...`);

  // Read and apply migration files in order
  const files = await readdir(MIGRATIONS_DIR);
  const migrationFiles = files.filter((f) => f.endsWith(".sql")).sort();

  let applied = 0;
  for (const file of migrationFiles) {
    // Check if this migration is needed
    const needsStateEvents = file.includes("state_events") && missingTables.includes("state_events");
    const needsEntities = file.includes("entities") && missingTables.includes("entities");
    const needsPayload = file.includes("payload_submissions") && missingTables.includes("payload_submissions");
    const needsSchema = file.includes("observation") && missingTables.includes("schema_registry");

    if (!needsStateEvents && !needsEntities && !needsPayload && !needsSchema) {
      console.log(`[INFO] ⏭️  Skipping ${file} - tables already exist`);
      continue;
    }

    console.log(`[INFO] Applying migration: ${file}`);
    try {
      const sqlPath = join(MIGRATIONS_DIR, file);
      const sql = await readFile(sqlPath, "utf-8");
      
      const success = await applyMigrationSQL(sql);
      if (success) {
        console.log(`[INFO] ✅ Migration ${file} applied successfully`);
        applied++;
      } else {
        console.log(`[INFO] ⚠️  Migration ${file} could not be applied automatically`);
        console.log(`[INFO] Please apply manually via Supabase Dashboard SQL Editor`);
        console.log(`[INFO] File: ${sqlPath}`);
      }
    } catch (error) {
      console.error(`[ERROR] Failed to process migration ${file}: ${error.message}`);
    }
  }

  if (applied > 0) {
    console.log(`\n[INFO] ✅ Applied ${applied} migration(s) successfully`);
  } else {
    console.log(`\n[WARN] ⚠️  Could not apply migrations automatically`);
    console.log(`[WARN] Please apply migrations manually via Supabase Dashboard SQL Editor`);
    console.log(`[WARN] Missing tables: ${missingTables.join(", ")}`);
  }

  return applied > 0;
}

applyMigrations()
  .then((success) => {
    if (success) {
      console.log("[INFO] Migration process completed successfully");
      process.exit(0);
    } else {
      console.log("[INFO] Migration process completed with warnings");
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error("[ERROR] Migration process failed:", error);
    process.exit(1);
  });














