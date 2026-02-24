/**
 * Check Auto Test Schemas
 * 
 * Lists all schemas with "auto_test" in their entity_type name
 */

import { db } from "../src/db.js";

async function checkAutoTestSchemas() {
  console.log("[CHECK] Searching for schemas with 'auto_test' in name...\n");
  
  const { data, error } = await db
    .from("schema_registry")
    .select("entity_type, schema_version, metadata, created_at, user_id, scope, active")
    .ilike("entity_type", "%auto_test%")
    .order("entity_type");
  
  if (error) {
    console.error("[CHECK] Error:", error);
    process.exit(1);
  }
  
  console.log(`[CHECK] Found ${data?.length || 0} schemas with "auto_test" in name:\n`);
  
  if (data && data.length > 0) {
    data.forEach((s) => {
      console.log(`- ${s.entity_type} (v${s.schema_version}, ${s.scope}, user: ${s.user_id || "global"})`);
      console.log(`  Created: ${s.created_at}`);
      console.log(`  Active: ${s.active}`);
      console.log(`  Metadata: ${JSON.stringify(s.metadata || {}, null, 2)}`);
      console.log("");
    });
  } else {
    console.log("No schemas found with 'auto_test' in name.");
  }
}

checkAutoTestSchemas()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
