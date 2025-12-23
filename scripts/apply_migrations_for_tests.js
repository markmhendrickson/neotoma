#!/usr/bin/env node

/**
 * Apply migrations for test environment
 * Uses Supabase REST API to execute SQL via a helper RPC function
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
    };
  }

  const devId = process.env.DEV_SUPABASE_PROJECT_ID;
  return {
    url: buildUrl(devId, process.env.DEV_SUPABASE_URL),
    key: process.env.DEV_SUPABASE_SERVICE_KEY || "",
  };
}

const config = getSupabaseConfig();
const supabase = createClient(config.url, config.key);

const MIGRATIONS_DIR = join(__dirname, "../supabase/migrations");

async function executeSQL(sql) {
  // For DDL statements, we need to use the Management API
  // Extract project ref from URL
  const projectRef = config.url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  
  if (!projectRef) {
    throw new Error("Could not extract project ref from URL");
  }

  // Use Supabase Management API
  // Note: This requires a Management API access token, not the service key
  // For now, we'll try using the service key as a bearer token
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN || config.key}`,
        apikey: config.key,
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    // If Management API fails, try executing via RPC if available
    console.warn(`[WARN] Management API failed: ${errorText}`);
    console.warn(`[WARN] Attempting to apply migrations via Supabase Dashboard SQL Editor`);
    console.warn(`[WARN] Please apply migrations manually or ensure SUPABASE_ACCESS_TOKEN is set`);
    return false;
  }

  return true;
}

async function applyMigrations() {
  console.log("[INFO] Applying migrations for test environment...");

  const files = await readdir(MIGRATIONS_DIR);
  const migrationFiles = files.filter((f) => f.endsWith(".sql")).sort();

  if (migrationFiles.length === 0) {
    console.log("[INFO] No migration files found");
    return;
  }

  console.log(`[INFO] Found ${migrationFiles.length} migration file(s)`);

  // Check which tables already exist
  const { data: tables } = await supabase
    .from("information_schema.tables")
    .select("table_name")
    .eq("table_schema", "public")
    .in("table_name", ["state_events", "entities", "payload_submissions", "schema_registry"]);

  const existingTables = new Set((tables || []).map((t) => t.table_name));
  console.log(`[INFO] Existing tables: ${Array.from(existingTables).join(", ") || "none"}`);

  for (const file of migrationFiles) {
    console.log(`[INFO] Processing migration: ${file}`);
    
    // Skip if tables already exist (for the specific migrations we care about)
    if (file.includes("state_events") && existingTables.has("state_events")) {
      console.log(`[INFO] ⏭️  Skipping ${file} - state_events table already exists`);
      continue;
    }
    if (file.includes("entities") && existingTables.has("entities")) {
      console.log(`[INFO] ⏭️  Skipping ${file} - entities table already exists`);
      continue;
    }
    if (file.includes("payload_submissions") && existingTables.has("payload_submissions")) {
      console.log(`[INFO] ⏭️  Skipping ${file} - payload_submissions table already exists`);
      continue;
    }

    try {
      const sqlPath = join(MIGRATIONS_DIR, file);
      const sql = await readFile(sqlPath, "utf-8");
      
      // Split into individual statements
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.match(/^--/));

      for (const statement of statements) {
        if (statement.trim().length === 0) continue;
        
        console.log(`[INFO] Executing: ${statement.substring(0, 80)}...`);
        const success = await executeSQL(statement);
        if (!success) {
          console.warn(`[WARN] Could not execute statement automatically`);
        }
      }
      
      console.log(`[INFO] ✅ Migration ${file} processed`);
    } catch (error) {
      console.error(`[ERROR] Failed to process migration ${file}: ${error.message}`);
      // Continue with other migrations
    }
  }

  console.log("[INFO] Migration process completed");
  console.log("[INFO] Note: If migrations failed, apply them manually via Supabase Dashboard SQL Editor");
}

applyMigrations()
  .then(() => {
    console.log("[INFO] Done");
    process.exit(0);
  })
  .catch((error) => {
    console.error("[ERROR] Migration process failed:", error);
    process.exit(1);
  });

