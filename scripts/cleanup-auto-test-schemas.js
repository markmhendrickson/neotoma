#!/usr/bin/env node
/**
 * Cleanup Auto Test Schemas
 * 
 * Removes all schemas with entity_type starting with "auto_test_" from schema_registry.
 * These are test artifacts from integration tests that should have been cleaned up.
 * 
 * Usage:
 *   node scripts/cleanup-auto-test-schemas.js [--confirm]
 * 
 * Options:
 *   --confirm    Skip confirmation prompt
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import readline from "readline";

// Load environment variables
config();

function getSupabaseConfig() {
  const buildUrl = (projectId, fallbackUrl) => {
    if (projectId) return `https://${projectId}.supabase.co`;
    return fallbackUrl || "";
  };

  // Use single variable names (set by 1Password sync based on ENVIRONMENT variable)
  const projectId = process.env.SUPABASE_PROJECT_ID;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const url = process.env.SUPABASE_URL;

  return {
    url: buildUrl(projectId, url),
    key: serviceKey || "",
  };
}

const supabaseConfig = getSupabaseConfig();

if (!supabaseConfig.url || !supabaseConfig.key) {
  console.error("Error: Missing required environment variables");
  console.error("Required: SUPABASE_PROJECT_ID (or SUPABASE_URL) and SUPABASE_SERVICE_KEY");
  console.error("Please set these in your .env file or sync from 1Password");
  process.exit(1);
}

const supabase = createClient(supabaseConfig.url, supabaseConfig.key);

async function cleanupAutoTestSchemas(confirm = false) {
  // Find all auto_test schemas
  const { data: schemas, error: fetchError } = await supabase
    .from("schema_registry")
    .select("id, entity_type, schema_version, scope, user_id")
    .ilike("entity_type", "auto_test_%");

  if (fetchError) {
    console.error("Error fetching schemas:", fetchError);
    process.exit(1);
  }

  if (!schemas || schemas.length === 0) {
    console.log("✅ No auto_test schemas found. Database is clean.");
    return;
  }

  console.log(`\nFound ${schemas.length} auto_test schema(s) to delete:`);
  schemas.forEach((schema) => {
    console.log(`  - ${schema.entity_type} (v${schema.schema_version}, ${schema.scope || "global"})`);
  });

  if (!confirm) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise((resolve) => {
      rl.question("\nDelete these schemas? (yes/no): ", resolve);
    });

    rl.close();

    if (answer.toLowerCase() !== "yes" && answer.toLowerCase() !== "y") {
      console.log("Cancelled.");
      return;
    }
  }

  // Delete all auto_test schemas
  const schemaIds = schemas.map((s) => s.id);
  const { error: deleteError } = await supabase
    .from("schema_registry")
    .delete()
    .in("id", schemaIds);

  if (deleteError) {
    console.error("Error deleting schemas:", deleteError);
    process.exit(1);
  }

  console.log(`\n✅ Successfully deleted ${schemas.length} auto_test schema(s).`);
}

// Parse command line arguments
const args = process.argv.slice(2);
const confirm = args.includes("--confirm");

cleanupAutoTestSchemas(confirm).catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
