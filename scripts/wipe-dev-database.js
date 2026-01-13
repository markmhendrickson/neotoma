#!/usr/bin/env node
/**
 * Wipe Dev Supabase Database
 * 
 * This script deletes all data from the dev Supabase database.
 * WARNING: This is destructive and cannot be undone!
 * 
 * Usage:
 *   node scripts/wipe-dev-database.js [--confirm] [--storage]
 * 
 * Options:
 *   --confirm    Skip confirmation prompt (useful for automation)
 *   --storage    Also clear storage buckets (sources and files)
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import readline from "readline";

// Load environment variables
config();

// Tables to clear in dependency order (respecting foreign key constraints)
const TABLES_TO_CLEAR = [
  // Graph edges (depend on sources, entities, events)
  "source_entity_edges",
  "source_event_edges",
  "timeline_events",
  "state_events", // Event-sourcing append-only log
  "relationships",
  "record_relationships",
  
  // Observations and fragments (depend on sources, entities, interpretations)
  "observations",
  "raw_fragments",
  
  // Entity-related (depend on entities)
  "entity_merges",
  "entity_snapshots",
  
  // Core entities
  "entities",
  
  // Schema registry (independent, can be cleared)
  "schema_registry",
  
  // Interpretations (depend on sources)
  "interpretations",
  
  // Sources (depend on nothing, but referenced by many)
  "sources",
  
  // Records (legacy, may be referenced by some tables)
  "records",
  
  
  // Queue and usage
  "upload_queue",
  "storage_usage",
  
  // Payload submissions (if exists, legacy)
  "payload_submissions",
];

const STORAGE_BUCKETS = ["sources", "files"];

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

async function clearTable(supabase, tableName) {
  try {
    let error;
    
    // Special handling for entity_snapshots which uses entity_id as primary key
    if (tableName === "entity_snapshots") {
      const result = await supabase.from(tableName).delete().neq("entity_id", "");
      error = result.error;
    } else {
      // For most tables, use id column
      const result = await supabase.from(tableName).delete().neq("id", "00000000-0000-0000-0000-000000000000");
      error = result.error;
      
      // If id column doesn't exist, try deleting all rows (fallback)
      if (error && (error.message.includes("does not exist") || error.message.includes("column"))) {
        const fallbackResult = await supabase.from(tableName).delete().neq("created_at", "1970-01-01");
        error = fallbackResult.error;
      }
    }
    
    if (error) {
      // If table doesn't exist, that's okay (might be a new migration)
      if (error.code === "PGRST116" || error.code === "PGRST205") {
        console.log(`  ⚠️  Table '${tableName}' does not exist (skipping)`);
        return { cleared: false, skipped: true };
      }
      throw error;
    }
    
    return { cleared: true, skipped: false };
  } catch (error) {
    console.error(`  ❌ Error clearing table '${tableName}': ${error.message}`);
    return { cleared: false, skipped: false, error };
  }
}

async function clearStorageBucket(supabase, bucketName) {
  try {
    // List all files in the bucket
    const { data: files, error: listError } = await supabase.storage
      .from(bucketName)
      .list("", { limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } });

    if (listError) {
      if (listError.message.includes("not found")) {
        console.log(`  ⚠️  Bucket '${bucketName}' does not exist (skipping)`);
        return { cleared: false, skipped: true };
      }
      throw listError;
    }

    if (!files || files.length === 0) {
      console.log(`  ✅ Bucket '${bucketName}' is already empty`);
      return { cleared: true, skipped: false };
    }

    // Delete all files
    const filePaths = files.map((file) => file.name);
    const { error: deleteError } = await supabase.storage
      .from(bucketName)
      .remove(filePaths);

    if (deleteError) {
      throw deleteError;
    }

    console.log(`  ✅ Cleared ${filePaths.length} file(s) from bucket '${bucketName}'`);
    return { cleared: true, skipped: false };
  } catch (error) {
    console.error(`  ❌ Error clearing bucket '${bucketName}': ${error.message}`);
    return { cleared: false, skipped: false, error };
  }
}

async function wipeDatabase() {
  const args = process.argv.slice(2);
  const skipConfirm = args.includes("--confirm");
  const clearStorage = args.includes("--storage");

  console.log("🗑️  Neotoma Dev Database Wipe Tool\n");

  // Safety check: only allow in development
  const env = process.env.NEOTOMA_ENV || process.env.NODE_ENV || "development";
  if (env === "production") {
    console.error("❌ ERROR: This script cannot be run in production environment!");
    console.error("   Set NEOTOMA_ENV=development or NODE_ENV=development to proceed.");
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

  // Confirmation prompt
  if (!skipConfirm) {
    console.log("⚠️  WARNING: This will delete ALL data from the dev database!");
    console.log("   This action cannot be undone.\n");
    
    const confirmed = await askConfirmation("Type 'yes' to continue: ");
    if (!confirmed) {
      console.log("\n❌ Operation cancelled.");
      process.exit(0);
    }
    console.log();
  }

  // Clear tables
  console.log("📊 Clearing database tables...\n");
  let clearedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const table of TABLES_TO_CLEAR) {
    process.stdout.write(`  Clearing '${table}'... `);
    const result = await clearTable(supabase, table);
    
    if (result.cleared) {
      console.log("✅");
      clearedCount++;
    } else if (result.skipped) {
      skippedCount++;
    } else {
      errorCount++;
    }
  }

  console.log(`\n📊 Table Summary: ${clearedCount} cleared, ${skippedCount} skipped, ${errorCount} errors\n`);

  // Clear storage buckets if requested
  let bucketClearedCount = 0;
  let bucketSkippedCount = 0;
  let bucketErrorCount = 0;

  if (clearStorage) {
    console.log("🗂️  Clearing storage buckets...\n");

    for (const bucket of STORAGE_BUCKETS) {
      process.stdout.write(`  Clearing bucket '${bucket}'... `);
      const result = await clearStorageBucket(supabase, bucket);
      
      if (result.cleared) {
        bucketClearedCount++;
      } else if (result.skipped) {
        bucketSkippedCount++;
      } else {
        bucketErrorCount++;
      }
    }

    console.log(`\n🗂️  Bucket Summary: ${bucketClearedCount} cleared, ${bucketSkippedCount} skipped, ${bucketErrorCount} errors\n`);
  } else {
    console.log("💡 Tip: Use --storage flag to also clear storage buckets\n");
  }

  // Final summary
  if (errorCount === 0 && (!clearStorage || bucketErrorCount === 0)) {
    console.log("✨ Database wipe completed successfully!");
  } else {
    console.log("⚠️  Database wipe completed with some errors (see above)");
    process.exit(1);
  }
}

wipeDatabase().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
