#!/usr/bin/env node
/**
 * Check for Deprecated Tables in Supabase
 * 
 * This script queries the database to find:
 * - Tables that should be removed (deprecated/replaced)
 * - Tables that are missing (expected but not found)
 * - Tables that exist but aren't documented
 * 
 * Usage:
 *   node scripts/check-deprecated-tables.js
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

// Load environment variables
config();

// Expected tables (canonical, should exist)
const EXPECTED_TABLES = [
  // Core source
  "sources",
  "interpretations",

  // Entities and observations
  "entities",
  "observations",
  "entity_snapshots",
  "raw_fragments",

  // Relationships
  "relationship_observations",
  "relationship_snapshots",

  // Graph edges (source-based, canonical)
  "source_entity_edges",
  "source_event_edges",

  // Events
  "timeline_events",

  // Entity operations
  "entity_merges",

  // Schema registry and recommendations
  "schema_registry",
  "schema_recommendations",

  // Automation and controls
  "auto_enhancement_queue",
  "field_blacklist",

  // MCP OAuth
  "mcp_oauth_state",
  "mcp_oauth_connections",
  "mcp_oauth_client_state",

  // Auth tables (Supabase auth schema mirrors)
  "auth_users",
  "auth_sessions",
];

// Deprecated tables (should be removed)
const DEPRECATED_TABLES = [
  "records",
  "record_relationships",
  "record_entity_edges", // Replaced by source_entity_edges
  "record_event_edges", // Replaced by source_event_edges
  "entity_event_edges",
  "state_events",
  "relationships",
  "payload_submissions",
  "interpretation_runs", // Renamed to interpretations
];

// Optional tables (may or may not exist)
const OPTIONAL_TABLES = [
  "upload_queue", // May not be created yet
  "storage_usage", // May not be created yet
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

async function getAllTables(supabase) {
  // Query information_schema to get all tables in public schema
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `
  });

  // If RPC doesn't work, try a different approach
  if (error) {
    // Try querying a known table to get connection, then use raw SQL via PostgREST
    // Since we can't execute arbitrary SQL easily, let's try to query each expected table
    // and see which ones exist
    const tables = [];
    const allPossibleTables = [...EXPECTED_TABLES, ...DEPRECATED_TABLES, ...OPTIONAL_TABLES];
    
    for (const tableName of allPossibleTables) {
      try {
        const { error: testError } = await supabase.from(tableName).select('*').limit(0);
        if (!testError || (testError.code !== "PGRST116" && testError.code !== "PGRST205")) {
          tables.push(tableName);
        }
      } catch (e) {
        // Table doesn't exist or other error
      }
    }
    
    return tables;
  }

  return data?.map(row => row.table_name) || [];
}

async function checkTables() {
  console.log("🔍 Checking Supabase Database Tables\n");

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

  // Get all tables
  console.log("📊 Querying database tables...\n");
  const existingTables = await getAllTables(supabase);
  
  console.log(`Found ${existingTables.length} tables in database\n`);

  // Categorize tables
  const foundExpected = existingTables.filter(t => EXPECTED_TABLES.includes(t));
  const foundDeprecated = existingTables.filter(t => DEPRECATED_TABLES.includes(t));
  const foundOptional = existingTables.filter(t => OPTIONAL_TABLES.includes(t));
  const foundUnknown = existingTables.filter(
    t => !EXPECTED_TABLES.includes(t) && 
         !DEPRECATED_TABLES.includes(t) && 
         !OPTIONAL_TABLES.includes(t)
  );
  const missingExpected = EXPECTED_TABLES.filter(t => !existingTables.includes(t));

  // Report results
  console.log("=".repeat(60));
  console.log("TABLE ANALYSIS RESULTS");
  console.log("=".repeat(60));
  
  // Expected tables
  console.log(`\n✅ Expected Tables (${foundExpected.length}/${EXPECTED_TABLES.length}):`);
  if (foundExpected.length > 0) {
    foundExpected.forEach(t => console.log(`   ✓ ${t}`));
  }
  if (missingExpected.length > 0) {
    console.log(`\n⚠️  Missing Expected Tables (${missingExpected.length}):`);
    missingExpected.forEach(t => console.log(`   ✗ ${t}`));
  }

  // Deprecated tables
  console.log(`\n🗑️  Deprecated Tables (${foundDeprecated.length}):`);
  if (foundDeprecated.length > 0) {
    foundDeprecated.forEach(t => {
      let replacement = "";
      if (t === "records") replacement = " → replaced by sources + observations";
      if (t === "record_relationships") replacement = " → replaced by relationship_observations";
      if (t === "record_entity_edges") replacement = " → replaced by source_entity_edges";
      if (t === "record_event_edges") replacement = " → replaced by source_event_edges";
      if (t === "entity_event_edges") replacement = " → replaced by source_event_edges";
      if (t === "state_events") replacement = " → replaced by timeline_events";
      if (t === "relationships") replacement = " → replaced by relationship_snapshots";
      if (t === "payload_submissions") replacement = " → replaced by interpretations";
      if (t === "interpretation_runs") replacement = " → renamed to interpretations";
      console.log(`   ⚠️  ${t}${replacement}`);
    });
    console.log("\n   💡 These tables should be removed (safe to DROP).");
  } else {
    console.log("   ✓ No deprecated tables found");
  }

  // Optional tables
  console.log(`\n📋 Optional Tables (${foundOptional.length}/${OPTIONAL_TABLES.length}):`);
  if (foundOptional.length > 0) {
    foundOptional.forEach(t => console.log(`   ✓ ${t}`));
  }
  const missingOptional = OPTIONAL_TABLES.filter(t => !existingTables.includes(t));
  if (missingOptional.length > 0) {
    console.log(`   (${missingOptional.length} not created yet):`);
    missingOptional.forEach(t => console.log(`   - ${t}`));
  }

  // Unknown tables
  if (foundUnknown.length > 0) {
    console.log(`\n❓ Unknown Tables (${foundUnknown.length}):`);
    foundUnknown.forEach(t => console.log(`   ? ${t} (not in expected/deprecated/optional lists)`));
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total tables found: ${existingTables.length}`);
  console.log(`Expected: ${foundExpected.length}/${EXPECTED_TABLES.length}`);
  console.log(`Deprecated (should remove): ${foundDeprecated.length}`);
  console.log(`Optional: ${foundOptional.length}/${OPTIONAL_TABLES.length}`);
  console.log(`Unknown: ${foundUnknown.length}`);

  // Recommendations
  if (foundDeprecated.length > 0) {
    console.log("\n💡 RECOMMENDATIONS:");
    console.log("   Run the following SQL to remove deprecated tables:");
    console.log("");
    foundDeprecated.forEach(t => {
      console.log(`   DROP TABLE IF EXISTS ${t} CASCADE;`);
    });
  }

  if (missingExpected.length > 0) {
    console.log("\n⚠️  WARNING:");
    console.log("   Some expected tables are missing. You may need to run migrations.");
  }

  console.log("");
}

checkTables().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
