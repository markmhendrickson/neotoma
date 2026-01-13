#!/usr/bin/env tsx
/**
 * Initialize Schema Registry from schema_definitions.ts
 * 
 * Loads all entity schemas from src/services/schema_definitions.ts into the
 * schema_registry database table. This makes schemas available in the database
 * instead of relying on runtime fallbacks.
 * 
 * Usage:
 *   npm run schema:init
 *   tsx scripts/initialize-schemas.ts [--dry-run] [--force]
 * 
 * Options:
 *   --dry-run    Show what would be registered without making changes
 *   --force      Re-register and activate schemas even if they exist
 */

// Use dynamic imports to handle missing database config gracefully
import {
  ENTITY_SCHEMAS,
  type EntitySchema,
} from "../src/services/schema_definitions.js";

interface RegistrationResult {
  entity_type: string;
  schema_version: string;
  action: "registered" | "activated" | "skipped" | "error";
  error?: string;
}

async function checkSchemaExists(
  schemaRegistry: any,
  entityType: string,
  version: string
): Promise<boolean | null> {
  try {
    const versions = await schemaRegistry.getSchemaVersions(entityType);
    return versions.some((v) => v.schema_version === version);
  } catch (error: any) {
    // If error is due to missing config, return null to indicate unknown
    if (
      error.message?.includes("Missing Supabase") ||
      error.message?.includes("configuration") ||
      error.code === "PGRST301" // Connection error
    ) {
      return null; // Unknown - database not accessible
    }
    // Other errors - assume it doesn't exist
    return false;
  }
}

async function registerSchema(
  schemaRegistry: any,
  schema: EntitySchema,
  dryRun: boolean,
  force: boolean,
  dbAccessible: boolean
): Promise<RegistrationResult> {
  const { entity_type, schema_version } = schema;

  try {
    // Check if schema already exists (only if database is accessible)
    let exists: boolean | null = false;
    if (dbAccessible && schemaRegistry) {
      exists = await checkSchemaExists(schemaRegistry, entity_type, schema_version);
    } else {
      // Database not accessible - return early to show what would be registered
      return {
        entity_type,
        schema_version,
        action: "registered", // Will show as "would be registered" in output
      };
    }

    // If database check returned null (unknown), assume schema needs to be registered
    if (exists === null) {
      return {
        entity_type,
        schema_version,
        action: "registered",
      };
    }

    if (exists && !force) {
      // Check if it's active (only if database is accessible)
      if (dbAccessible && schemaRegistry) {
        try {
          const activeSchema = await schemaRegistry.loadActiveSchema(entity_type);
          if (activeSchema?.schema_version === schema_version) {
            return {
              entity_type,
              schema_version,
              action: "skipped",
            };
          } else {
            // Exists but not active - activate it
            if (!dryRun) {
              await schemaRegistry.activate(entity_type, schema_version);
            }
            return {
              entity_type,
              schema_version,
              action: "activated",
            };
          }
        } catch (error: any) {
          // If we can't check active status, assume needs activation
          if (!dryRun && dbAccessible && schemaRegistry) {
            try {
              await schemaRegistry.activate(entity_type, schema_version);
            } catch (activateError) {
              // Ignore activation errors in dry-run or if db not accessible
            }
          }
        }
      }
    }

    // Register new schema
    if (!dryRun && schemaRegistry) {
      try {
        await schemaRegistry.register({
          entity_type,
          schema_version,
          schema_definition: schema.schema_definition,
          reducer_config: schema.reducer_config,
        });

        // Activate it (this will deactivate other versions)
        await schemaRegistry.activate(entity_type, schema_version);
      } catch (error: any) {
        // Handle duplicate key errors (schema already exists)
        if (
          error.message?.includes("duplicate key") ||
          error.message?.includes("unique constraint") ||
          error.message?.includes("already exists")
        ) {
          // Try to activate it instead
          await schemaRegistry.activate(entity_type, schema_version);
          return {
            entity_type,
            schema_version,
            action: "activated",
          };
        }
        throw error;
      }
    }

    // Schema doesn't exist - register it
    return {
      entity_type,
      schema_version,
      action: "registered",
    };
  } catch (error: any) {
    return {
      entity_type,
      schema_version,
      action: "error",
      error: error.message || String(error),
    };
  }
}

async function loadSchemaRegistry(): Promise<any | null> {
  try {
    const { schemaRegistry } = await import("../src/services/schema_registry.js");
    return schemaRegistry;
  } catch (error: any) {
    if (
      error.message?.includes("Missing Supabase") ||
      error.message?.includes("configuration")
    ) {
      return null;
    }
    throw error;
  }
}

async function checkDatabaseAccessible(schemaRegistry: any): Promise<boolean> {
  if (!schemaRegistry) {
    return false;
  }
  try {
    // Try to query schema_registry table
    await schemaRegistry.getSchemaVersions("__test__");
    return true;
  } catch (error: any) {
    if (
      error.message?.includes("Missing Supabase") ||
      error.message?.includes("configuration") ||
      error.code === "PGRST301"
    ) {
      return false;
    }
    // Other errors might mean table doesn't exist, but DB is accessible
    return true;
  }
}

async function initializeSchemas(dryRun: boolean, force: boolean): Promise<void> {
  console.log("🔧 Initializing Schema Registry from schema_definitions.ts\n");

  if (dryRun) {
    console.log("🔍 DRY RUN MODE - No changes will be made\n");
  }

  if (force) {
    console.log("⚠️  FORCE MODE - Will re-register existing schemas\n");
  }

  // Try to load schema registry (may fail if DB config missing)
  const schemaRegistry = await loadSchemaRegistry();
  const dbAccessible = await checkDatabaseAccessible(schemaRegistry);
  
  if (!dbAccessible) {
    if (dryRun) {
      console.log(
        "⚠️  Database not accessible - showing all schemas that would be registered\n"
      );
      console.log(
        "   (Configure SUPABASE_PROJECT_ID and SUPABASE_SERVICE_KEY to check existing schemas)\n"
      );
    } else {
      console.error(
        "❌ Error: Database not accessible. Please configure Supabase credentials.\n"
      );
      console.error(
        "   Required environment variables:\n"
      );
      console.error(
        "   - SUPABASE_PROJECT_ID (or SUPABASE_URL)\n"
      );
      console.error(
        "   - SUPABASE_SERVICE_KEY\n"
      );
      console.error(
        "\n   Options to configure:\n"
      );
      console.error(
        "   1. Sync from 1Password (recommended):\n"
      );
      console.error(
        "      npm run sync:env\n"
      );
      console.error(
        "      (Requires 1Password CLI and mappings configured)\n"
      );
      console.error(
        "   2. Manually add to .env file:\n"
      );
      console.error(
        "      SUPABASE_PROJECT_ID=your-project-id\n"
      );
      console.error(
        "      SUPABASE_SERVICE_KEY=your-service-key\n"
      );
      console.error(
        "\n   💡 Tip: Run 'npm run schema:init:dry-run' to preview schemas without database access.\n"
      );
      process.exit(1);
    }
  }

  const results: RegistrationResult[] = [];

  // Process all schemas from ENTITY_SCHEMAS
  console.log("Processing schemas...");
  for (const schema of Object.values(ENTITY_SCHEMAS)) {
    if (!schema.entity_type || !schema.schema_version) {
      console.warn(
        `⚠️  Skipping invalid schema: missing entity_type or schema_version`
      );
      continue;
    }

    const result = await registerSchema(schemaRegistry, schema, dryRun, force, dbAccessible);
    results.push(result);

    const icon =
      result.action === "registered"
        ? "✓"
        : result.action === "activated"
          ? "↻"
          : result.action === "skipped"
            ? "⊘"
            : "✗";
    const actionLabel =
      result.action === "registered"
        ? dryRun && !dbAccessible
          ? "would be registered"
          : dryRun
            ? "would be registered"
            : "registered"
        : result.action === "activated"
          ? dryRun
            ? "would be activated"
            : "activated"
          : result.action === "skipped"
            ? "skipped (already active)"
            : `error: ${result.error}`;

    console.log(
      `  ${icon} ${schema.entity_type} v${schema.schema_version} - ${actionLabel}`
    );
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));

  const registered = results.filter((r) => r.action === "registered").length;
  const activated = results.filter((r) => r.action === "activated").length;
  const skipped = results.filter((r) => r.action === "skipped").length;
  const errors = results.filter((r) => r.action === "error").length;

  console.log(`Total schemas processed: ${results.length}`);
  console.log(`  ✓ Registered: ${registered}`);
  console.log(`  ↻ Activated: ${activated}`);
  console.log(`  ⊘ Skipped (already active): ${skipped}`);
  if (errors > 0) {
    console.log(`  ✗ Errors: ${errors}`);
    console.log("\nErrors:");
    results
      .filter((r) => r.action === "error")
      .forEach((r) => {
        console.log(`  - ${r.entity_type} v${r.schema_version}: ${r.error}`);
      });
  }

  if (dryRun) {
    console.log("\n💡 Run without --dry-run to apply changes");
  } else {
    console.log("\n✓ Schema initialization complete!");
    console.log(
      "💡 Schemas are now available in the database and will be used instead of code fallbacks."
    );
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");

initializeSchemas(dryRun, force)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  });
