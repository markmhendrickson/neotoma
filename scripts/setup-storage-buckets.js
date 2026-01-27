#!/usr/bin/env node
/**
 * Setup script to create required Supabase Storage buckets
 * 
 * This script checks for and creates the required storage buckets:
 * - `sources`: Required for MCP ingest() operations
 * - `files`: Used for general file uploads
 * 
 * Usage:
 *   node scripts/setup-storage-buckets.js
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

// Load environment variables
config();

const requiredBuckets = [
  { name: "sources", description: "Required for MCP ingest() and source operations" },
  { name: "files", description: "Used for general file uploads" },
];

async function setupBuckets() {
  // Get Supabase configuration
  // Use single variable names (set by 1Password sync based on ENVIRONMENT variable)
  const projectId = process.env.SUPABASE_PROJECT_ID;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;

  if (!serviceKey) {
    console.error("❌ Error: SUPABASE_SERVICE_KEY not found in environment");
    console.error("   Please set SUPABASE_SERVICE_KEY in your .env file");
    process.exit(1);
  }

  let supabase;
  if (projectId) {
    supabase = createClient(
      `https://${projectId}.supabase.co`,
      serviceKey
    );
  } else if (supabaseUrl) {
    supabase = createClient(supabaseUrl, serviceKey);
  } else {
    console.error("❌ Error: SUPABASE_PROJECT_ID or SUPABASE_URL must be set");
    console.error("   Please set one of them in your .env file");
    process.exit(1);
  }

  console.log("🔍 Checking storage buckets...\n");

  for (const bucket of requiredBuckets) {
    try {
      // Check if bucket exists by trying to list it
      const { data: buckets, error: listError } = await supabase.storage.listBuckets();
      
      if (listError) {
        console.error(`❌ Error listing buckets: ${listError.message}`);
        continue;
      }

      const bucketExists = buckets?.some((b) => b.name === bucket.name);

      if (bucketExists) {
        console.log(`✅ Bucket '${bucket.name}' already exists`);
      } else {
        console.log(`📦 Creating bucket '${bucket.name}'...`);
        
        const { data, error } = await supabase.storage.createBucket(bucket.name, {
          public: false, // Private bucket for security
        });

        if (error) {
          console.error(`❌ Failed to create bucket '${bucket.name}': ${error.message}`);
        } else {
          console.log(`✅ Successfully created bucket '${bucket.name}'`);
          console.log(`   ${bucket.description}`);
        }
      }
    } catch (error) {
      console.error(`❌ Unexpected error with bucket '${bucket.name}': ${error.message}`);
    }
  }

  console.log("\n✨ Storage bucket setup complete!");
  console.log("\n💡 Note: For MCP ingest() operations, you'll also need:");
  console.log("   - A valid user_id (UUID format)");
  console.log("   - Example test UUID: 00000000-0000-0000-0000-000000000000");
}

setupBuckets().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
