/**
 * Cleanup Test Schemas
 * 
 * Identifies, marks, and removes test schemas from the database.
 * Test schemas are identified by entity_type patterns like "test", "test_*", etc.
 */

import { supabase } from "../src/db.js";
import type { SchemaMetadata } from "../src/services/schema_registry.js";

interface TestSchemaInfo {
  id: string;
  entity_type: string;
  schema_version: string;
  user_id: string | null;
  scope: string;
  metadata: SchemaMetadata | null;
  created_at: string;
}

interface CleanupResult {
  entity_type: string;
  action: "marked" | "removed" | "skipped" | "error";
  reason?: string;
  error?: string;
}

/**
 * Identify test schemas by entity_type patterns
 */
function isTestSchema(entityType: string): boolean {
  const normalized = entityType.toLowerCase().trim();
  
  // Patterns that indicate test schemas
  const testPatterns = [
    /^test$/i,           // Exact match "test"
    /^test_/i,           // Starts with "test_"
    /_test$/i,           // Ends with "_test"
    /^test\d+$/i,        // "test1", "test2", etc.
    /^test_record$/i,     // "test_record"
    /^test_entity$/i,    // "test_entity"
    /^test_schema$/i,    // "test_schema"
    /^sample_test$/i,     // "sample_test"
    /^test_sample$/i,    // "test_sample"
    /^auto_test/i,       // Starts with "auto_test" (from integration tests)
    /_auto_test/i,        // Contains "_auto_test"
  ];
  
  return testPatterns.some(pattern => pattern.test(normalized));
}

/**
 * Mark schemas with test metadata
 */
async function markTestSchemas(
  schemas: TestSchemaInfo[],
  dryRun: boolean
): Promise<CleanupResult[]> {
  const results: CleanupResult[] = [];
  
  for (const schema of schemas) {
    try {
      // Check if already marked
      const currentMetadata = schema.metadata || {};
      if (currentMetadata.test === true) {
        results.push({
          entity_type: schema.entity_type,
          action: "skipped",
          reason: "Already marked as test schema",
        });
        continue;
      }
      
      if (dryRun) {
        results.push({
          entity_type: schema.entity_type,
          action: "marked",
          reason: "Would mark as test schema (dry run)",
        });
        continue;
      }
      
      // Update metadata to mark as test
      const updatedMetadata: SchemaMetadata = {
        ...currentMetadata,
        test: true,
        test_marked_at: new Date().toISOString(),
      };
      
      const { error } = await supabase
        .from("schema_registry")
        .update({ metadata: updatedMetadata })
        .eq("id", schema.id);
      
      if (error) {
        throw new Error(`Failed to update metadata: ${error.message}`);
      }
      
      results.push({
        entity_type: schema.entity_type,
        action: "marked",
        reason: "Marked as test schema",
      });
    } catch (error) {
      results.push({
        entity_type: schema.entity_type,
        action: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  
  return results;
}

/**
 * Remove test schemas from database
 */
async function removeTestSchemas(
  schemas: TestSchemaInfo[],
  dryRun: boolean
): Promise<CleanupResult[]> {
  const results: CleanupResult[] = [];
  
  for (const schema of schemas) {
    try {
      if (dryRun) {
        results.push({
          entity_type: schema.entity_type,
          action: "removed",
          reason: "Would remove (dry run)",
        });
        continue;
      }
      
      // Delete the schema
      const { error } = await supabase
        .from("schema_registry")
        .delete()
        .eq("id", schema.id);
      
      if (error) {
        throw new Error(`Failed to delete: ${error.message}`);
      }
      
      results.push({
        entity_type: schema.entity_type,
        action: "removed",
        reason: "Removed from database",
      });
    } catch (error) {
      results.push({
        entity_type: schema.entity_type,
        action: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  
  return results;
}

/**
 * Main cleanup function
 */
async function cleanupTestSchemas(options: {
  dryRun?: boolean;
  markOnly?: boolean; // Only mark, don't remove
  removeOnly?: boolean; // Only remove already-marked schemas
}): Promise<void> {
  const { dryRun = false, markOnly = false, removeOnly = false } = options;
  
  console.log("[CLEANUP] Starting test schema cleanup...");
  console.log(`[CLEANUP] Dry run: ${dryRun}`);
  console.log(`[CLEANUP] Mark only: ${markOnly}`);
  console.log(`[CLEANUP] Remove only: ${removeOnly}`);
  
  try {
    // Fetch all schemas
    const { data: allSchemas, error: fetchError } = await supabase
      .from("schema_registry")
      .select("id, entity_type, schema_version, user_id, scope, metadata, created_at");
    
    if (fetchError) {
      throw new Error(`Failed to fetch schemas: ${fetchError.message}`);
    }
    
    console.log(`[CLEANUP] Found ${allSchemas?.length || 0} total schemas`);
    
    // Identify test schemas
    const testSchemas = (allSchemas || []).filter((schema) =>
      isTestSchema(schema.entity_type)
    ) as TestSchemaInfo[];
    
    console.log(`[CLEANUP] Identified ${testSchemas.length} test schemas:`);
    testSchemas.forEach((schema) => {
      console.log(`  - ${schema.entity_type} (v${schema.schema_version}, ${schema.scope}, user: ${schema.user_id || "global"})`);
    });
    
    if (testSchemas.length === 0) {
      console.log("[CLEANUP] No test schemas found. Exiting.");
      return;
    }
    
    let results: CleanupResult[] = [];
    
    if (removeOnly) {
      // Only remove schemas that are already marked as test
      const markedSchemas = testSchemas.filter(
        (schema) => schema.metadata?.test === true
      );
      console.log(`[CLEANUP] Found ${markedSchemas.length} schemas already marked as test`);
      
      if (markedSchemas.length > 0) {
        results = await removeTestSchemas(markedSchemas, dryRun);
      }
    } else if (!markOnly) {
      // Mark first, then remove
      console.log("[CLEANUP] Step 1: Marking test schemas...");
      const markResults = await markTestSchemas(testSchemas, dryRun);
      results.push(...markResults);
      
      console.log("[CLEANUP] Step 2: Removing test schemas...");
      const removeResults = await removeTestSchemas(testSchemas, dryRun);
      results.push(...removeResults);
    } else {
      // Only mark, don't remove
      console.log("[CLEANUP] Marking test schemas (not removing)...");
      results = await markTestSchemas(testSchemas, dryRun);
    }
    
    // Print summary
    console.log("\n[CLEANUP] Summary:");
    const byAction = results.reduce((acc, result) => {
      acc[result.action] = (acc[result.action] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    Object.entries(byAction).forEach(([action, count]) => {
      console.log(`  ${action}: ${count}`);
    });
    
    // Print errors if any
    const errors = results.filter((r) => r.action === "error");
    if (errors.length > 0) {
      console.log("\n[CLEANUP] Errors:");
      errors.forEach((error) => {
        console.log(`  - ${error.entity_type}: ${error.error}`);
      });
    }
    
    if (dryRun) {
      console.log("\n[CLEANUP] DRY RUN - No changes were made. Run without --dry-run to apply changes.");
    } else {
      console.log("\n[CLEANUP] Cleanup completed successfully.");
    }
  } catch (error) {
    console.error("[CLEANUP] Fatal error:", error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const markOnly = args.includes("--mark-only");
const removeOnly = args.includes("--remove-only");

// Run cleanup
cleanupTestSchemas({ dryRun, markOnly, removeOnly })
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
