#!/usr/bin/env node
/**
 * Drop Deprecated Tables
 * 
 * This script safely removes deprecated tables from the database.
 * Currently removes:
 * - record_entity_edges (replaced by source_entity_edges)
 * - record_event_edges (replaced by source_event_edges)
 * 
 * Usage:
 *   node scripts/drop-deprecated-tables.js [--confirm]
 * 
 * Options:
 *   --confirm    Skip confirmation prompt
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import readline from "readline";

// Load environment variables
config();

const DEPRECATED_TABLES = [
  { name: "record_entity_edges", replacement: "source_entity_edges" },
  { name: "record_event_edges", replacement: "source_event_edges" },
];

function getSupabaseConfig() {
  // Use single variable names (set by 1Password sync based on ENVIRONMENT variable)
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

function askConfirmation(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "yes" || answer.toLowerCase() === "y");
    });
  });
}

async function checkTableExists(supabase, tableName) {
  try {
    const { error } = await supabase.from(tableName).select("*").limit(0);
    return !error || (error.code !== "PGRST116" && error.code !== "PGRST205");
  } catch {
    return false;
  }
}

async function dropTable(supabase, tableName) {
  // Use RPC to execute DROP TABLE (Supabase doesn't support DROP via PostgREST)
  // We'll need to use the SQL editor or provide instructions
  console.log(`   ⚠️  Cannot drop table via API. Please run in Supabase SQL Editor:`);
  console.log(`      DROP TABLE IF EXISTS ${tableName} CASCADE;`);
  return { dropped: false, needsManual: true };
}

async function dropDeprecatedTables() {
  const args = process.argv.slice(2);
  const skipConfirm = args.includes("--confirm");

  console.log("🗑️  Drop Deprecated Tables\n");

  // Safety check
  const env = process.env.NEOTOMA_ENV || process.env.NODE_ENV || "development";
  if (env === "production") {
    console.error("❌ ERROR: This script cannot be run in production environment!");
    process.exit(1);
  }

  // Get Supabase config
  let supabase;
  try {
    const { url, serviceKey } = getSupabaseConfig();
    supabase = createClient(url, serviceKey);
    console.log(`✅ Connected to Supabase: ${url}\n`);
  } catch (error) {
    console.error(`❌ Error connecting to Supabase: ${error.message}`);
    process.exit(1);
  }

  // Check which tables exist
  console.log("🔍 Checking for deprecated tables...\n");
  const tablesToDrop = [];
  
  for (const table of DEPRECATED_TABLES) {
    const exists = await checkTableExists(supabase, table.name);
    if (exists) {
      tablesToDrop.push(table);
      console.log(`   ✓ Found: ${table.name} (replaced by ${table.replacement})`);
    } else {
      console.log(`   - Not found: ${table.name} (already removed)`);
    }
  }

  if (tablesToDrop.length === 0) {
    console.log("\n✨ No deprecated tables found. Database is clean!");
    return;
  }

  console.log(`\n📋 Found ${tablesToDrop.length} deprecated table(s) to remove:\n`);
  tablesToDrop.forEach(t => {
    console.log(`   - ${t.name} → ${t.replacement}`);
  });

  // Confirmation
  if (!skipConfirm) {
    console.log("\n⚠️  WARNING: This will permanently delete these tables!");
    const confirmed = await askConfirmation("Type 'yes' to continue: ");
    if (!confirmed) {
      console.log("\n❌ Operation cancelled.");
      process.exit(0);
    }
    console.log();
  }

  // Generate SQL
  console.log("📝 SQL to run in Supabase SQL Editor:\n");
  console.log("-- Drop deprecated tables");
  console.log("-- Generated: " + new Date().toISOString());
  console.log("");
  
  tablesToDrop.forEach(t => {
    console.log(`DROP TABLE IF EXISTS ${t.name} CASCADE;`);
  });

  console.log("\n💡 Instructions:");
  console.log("   1. Copy the SQL above");
  console.log("   2. Open Supabase Dashboard → SQL Editor");
  console.log("   3. Paste and run the SQL");
  console.log("   4. Verify tables are removed\n");

  // Note: We can't execute DROP TABLE via Supabase JS client
  // It requires direct SQL access (SQL Editor or psql)
}

dropDeprecatedTables().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
