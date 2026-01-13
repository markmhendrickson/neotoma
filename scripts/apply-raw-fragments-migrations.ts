#!/usr/bin/env tsx
/**
 * Apply the two raw_fragments migrations directly
 * Uses Supabase Management API if SUPABASE_ACCESS_TOKEN is set
 * Otherwise provides instructions for manual application
 */

import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "../src/config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function applyMigrations() {
  console.log("\n📦 Applying raw_fragments migrations...\n");

  // Extract project ref from URL
  const projectRef = config.supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  
  if (!projectRef) {
    console.error("❌ Could not extract project ref from Supabase URL");
    return;
  }

  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  
  if (!accessToken) {
    console.log("ℹ️  SUPABASE_ACCESS_TOKEN not set. Cannot apply via Management API.");
    console.log("\n📋 To apply migrations manually:");
    console.log("1. Go to Supabase Dashboard → SQL Editor");
    console.log("2. Copy and paste the SQL from each migration file:");
    console.log("   - supabase/migrations/20260112000001_make_raw_fragments_record_id_nullable.sql");
    console.log("   - supabase/migrations/20260112000002_add_raw_fragments_idempotence.sql");
    console.log("3. Execute each migration in order\n");
    return;
  }

  // Read migration files
  const migration1 = await readFile(
    join(__dirname, "../supabase/migrations/20260112000001_make_raw_fragments_record_id_nullable.sql"),
    "utf-8"
  );
  
  const migration2 = await readFile(
    join(__dirname, "../supabase/migrations/20260112000002_add_raw_fragments_idempotence.sql"),
    "utf-8"
  );

  // Apply migration 1
  console.log("📝 Applying migration 1: Make record_id nullable...");
  try {
    const response1 = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ query: migration1 }),
      }
    );

    if (!response1.ok) {
      const errorText = await response1.text();
      console.error("❌ Migration 1 failed:", errorText);
      return;
    }

    console.log("✅ Migration 1 applied successfully\n");
  } catch (error) {
    console.error("❌ Failed to apply migration 1:", error);
    return;
  }

  // Apply migration 2
  console.log("📝 Applying migration 2: Add idempotence constraint...");
  try {
    const response2 = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ query: migration2 }),
      }
    );

    if (!response2.ok) {
      const errorText = await response2.text();
      console.error("❌ Migration 2 failed:", errorText);
      return;
    }

    console.log("✅ Migration 2 applied successfully\n");
    console.log("🎉 Both migrations applied successfully!\n");
  } catch (error) {
    console.error("❌ Failed to apply migration 2:", error);
  }
}

applyMigrations().catch(console.error);
