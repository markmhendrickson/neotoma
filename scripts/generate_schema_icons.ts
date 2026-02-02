/**
 * Generate Icons for Entity Schemas
 * 
 * Backfills icon metadata for all existing schemas in the database
 * and base schemas from schema_definitions.ts
 */

import { supabase } from "../src/db.js";
import { generateIconForEntityType } from "../src/services/schema_icon_service.js";
import { ENTITY_SCHEMAS } from "../src/services/schema_definitions.js";
import type { SchemaMetadata } from "../src/services/schema_registry.js";

interface GenerationResult {
  entity_type: string;
  status: "success" | "skipped" | "error";
  icon_type?: "lucide" | "svg";
  icon_name?: string;
  confidence?: number;
  error?: string;
}

async function generateIconsForSchemas(options: {
  dryRun?: boolean;
  force?: boolean; // Regenerate even if icon exists
  entityTypes?: string[]; // Only process specific entity types
}): Promise<GenerationResult[]> {
  const results: GenerationResult[] = [];
  
  console.log("[ICON_GENERATOR] Starting icon generation...");
  console.log(`[ICON_GENERATOR] Dry run: ${options.dryRun || false}`);
  console.log(`[ICON_GENERATOR] Force regenerate: ${options.force || false}`);
  
  try {
    // Fetch all active schemas from database
    const { data: schemas, error } = await supabase
      .from("schema_registry")
      .select("*")
      .eq("active", true);
    
    if (error) {
      throw new Error(`Failed to fetch schemas: ${error.message}`);
    }
    
    console.log(`[ICON_GENERATOR] Found ${schemas?.length || 0} active schemas`);
    console.log(`[ICON_GENERATOR] Entity types filter:`, options.entityTypes);
    
    // Process each schema
    for (const schema of schemas || []) {
      const entityType = schema.entity_type;
      
      console.log(`[ICON_GENERATOR] Processing ${entityType}...`);
      
      // Skip if entityTypes filter provided and this type isn't included
      if (options.entityTypes && options.entityTypes.length > 0 && !options.entityTypes.includes(entityType)) {
        console.log(`[ICON_GENERATOR] Skipped ${entityType} (not in filter)`);
        continue;
      }
      
      // Skip if icon already exists and not forcing regeneration
      if (schema.metadata?.icon && !options.force) {
        results.push({
          entity_type: entityType,
          status: "skipped",
        });
        console.log(`[ICON_GENERATOR] Skipped ${entityType} (icon already exists)`);
        continue;
      }
      
      try {
        // Get metadata from base schemas if available
        const baseSchema = ENTITY_SCHEMAS[entityType];
        const metadata: SchemaMetadata | undefined = baseSchema?.metadata;
        
        // Generate icon
        console.log(`[ICON_GENERATOR] Generating icon for ${entityType}...`);
        const iconMetadata = await generateIconForEntityType(entityType, metadata);
        
        if (!options.dryRun) {
          // Update schema with icon metadata
          const updatedMetadata = {
            ...(schema.metadata || {}),
            ...metadata,
            icon: iconMetadata,
          };
          
          const { error: updateError } = await supabase
            .from("schema_registry")
            .update({ metadata: updatedMetadata })
            .eq("id", schema.id);
          
          if (updateError) {
            throw new Error(`Failed to update schema: ${updateError.message}`);
          }
        }
        
        results.push({
          entity_type: entityType,
          status: "success",
          icon_type: iconMetadata.icon_type,
          icon_name: iconMetadata.icon_name,
          confidence: iconMetadata.confidence,
        });
        
        console.log(
          `[ICON_GENERATOR] ✅ ${entityType}: ${iconMetadata.icon_type}/${iconMetadata.icon_name} (confidence: ${iconMetadata.confidence?.toFixed(2)})`
        );
      } catch (error: any) {
        results.push({
          entity_type: entityType,
          status: "error",
          error: error.message,
        });
        console.error(`[ICON_GENERATOR] ❌ ${entityType}: ${error.message}`);
      }
    }
    
    return results;
  } catch (error: any) {
    console.error(`[ICON_GENERATOR] Fatal error: ${error.message}`);
    throw error;
  }
}

async function printSummary(results: GenerationResult[]): Promise<void> {
  const success = results.filter(r => r.status === "success").length;
  const skipped = results.filter(r => r.status === "skipped").length;
  const errors = results.filter(r => r.status === "error").length;
  
  console.log("\n=== Icon Generation Summary ===");
  console.log(`Total schemas: ${results.length}`);
  console.log(`✅ Success: ${success}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`❌ Errors: ${errors}`);
  
  if (errors > 0) {
    console.log("\nFailed schemas:");
    results
      .filter(r => r.status === "error")
      .forEach(r => {
        console.log(`  - ${r.entity_type}: ${r.error}`);
      });
  }
  
  // Group by icon type
  const lucideIcons = results.filter(r => r.icon_type === "lucide");
  const customIcons = results.filter(r => r.icon_type === "svg");
  
  console.log("\nIcon Types:");
  console.log(`  Lucide: ${lucideIcons.length}`);
  console.log(`  Custom SVG: ${customIcons.length}`);
  
  // Show Lucide icon mappings
  if (lucideIcons.length > 0) {
    console.log("\nLucide Icon Mappings:");
    lucideIcons.forEach(r => {
      console.log(`  ${r.entity_type} → ${r.icon_name} (${r.confidence?.toFixed(2)})`);
    });
  }
  
  if (customIcons.length > 0) {
    console.log("\nCustom SVG Icons:");
    customIcons.forEach(r => {
      console.log(`  ${r.entity_type} (${r.confidence?.toFixed(2)})`);
    });
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  const options = {
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
    entityTypes: args
      .filter(arg => !arg.startsWith("--"))
      .map(arg => arg.trim())
      .filter(Boolean),
  };
  
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: npm run schema:icons:generate [options] [entity_types...]

Options:
  --dry-run    Show what would be done without making changes
  --force      Regenerate icons even if they already exist
  --help, -h   Show this help message

Examples:
  npm run schema:icons:generate                    # Generate icons for all schemas
  npm run schema:icons:generate --dry-run          # Preview without changes
  npm run schema:icons:generate --force            # Regenerate all icons
  npm run schema:icons:generate invoice receipt    # Only process specific types
    `);
    process.exit(0);
  }
  
  try {
    const results = await generateIconsForSchemas(options);
    await printSummary(results);
    
    if (options.dryRun) {
      console.log("\n[DRY RUN] No changes were made. Run without --dry-run to apply changes.");
    } else {
      console.log("\n✨ Icon generation complete!");
    }
    
    process.exit(0);
  } catch (error: any) {
    console.error(`\n❌ Icon generation failed: ${error.message}`);
    process.exit(1);
  }
}

main();
