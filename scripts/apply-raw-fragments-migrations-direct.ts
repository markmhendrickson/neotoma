#!/usr/bin/env tsx
/**
 * Apply the two raw_fragments migrations directly via Supabase client
 * Uses RPC function if available, otherwise provides SQL for manual execution
 */

import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { supabase } from "../src/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function applyMigrations() {
  console.log("\n📦 Applying raw_fragments migrations...\n");

  // Read migration files
  const migration1 = await readFile(
    join(__dirname, "../supabase/migrations/20260112000001_make_raw_fragments_record_id_nullable.sql"),
    "utf-8"
  );
  
  const migration2 = await readFile(
    join(__dirname, "../supabase/migrations/20260112000002_add_raw_fragments_idempotence.sql"),
    "utf-8"
  );

  // Try to execute via RPC (if exec_sql function exists)
  console.log("📝 Attempting to apply migrations via RPC...\n");
  
  // Migration 1
  console.log("1️⃣  Applying: Make record_id nullable");
  try {
    const { data: result1, error: error1 } = await supabase.rpc("exec_sql", { 
      sql: migration1 
    });
    
    if (error1) {
      if (error1.code === "PGRST202" || error1.message?.includes("function") || error1.message?.includes("does not exist")) {
        console.log("   ℹ️  RPC function not available. Use manual execution below.\n");
        printManualInstructions(migration1, migration2);
        return;
      }
      throw error1;
    }
    
    console.log("   ✅ Migration 1 applied successfully\n");
  } catch (error) {
    console.error("   ❌ Migration 1 failed:", error);
    printManualInstructions(migration1, migration2);
    return;
  }

  // Migration 2
  console.log("2️⃣  Applying: Add idempotence constraint");
  try {
    const { data: result2, error: error2 } = await supabase.rpc("exec_sql", { 
      sql: migration2 
    });
    
    if (error2) {
      throw error2;
    }
    
    console.log("   ✅ Migration 2 applied successfully\n");
    console.log("🎉 Both migrations applied successfully!\n");
  } catch (error) {
    console.error("   ❌ Migration 2 failed:", error);
    console.log("\n📋 Migration 1 was applied, but Migration 2 failed.");
    console.log("📋 Apply Migration 2 manually using the SQL below:\n");
    console.log("=" .repeat(60));
    console.log(migration2);
    console.log("=" .repeat(60));
  }
}

function printManualInstructions(migration1: string, migration2: string) {
  console.log("\n📋 Manual Application Instructions:");
  console.log("=" .repeat(60));
  console.log("Go to Supabase Dashboard → SQL Editor");
  console.log("Execute each migration in order:\n");
  
  console.log("--- Migration 1: Make record_id nullable ---");
  console.log(migration1);
  console.log("\n--- Migration 2: Add idempotence constraint ---");
  console.log(migration2);
  console.log("=" .repeat(60));
}

applyMigrations().catch(console.error);
