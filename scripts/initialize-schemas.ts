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
 * Safe to re-run, including on an instance carrying CUSTOM schemas: an entity
 * type that already has an active global registration is SKIPPED outright —
 * not re-registered and not re-activated (issue #1968). Use --force to
 * deliberately re-register built-ins over whatever is currently active.
 *
 * Options:
 *   --dry-run    Show what would be registered without making changes
 *   --force      Re-register and activate schemas even if they exist.
 *                WARNING: this overrides the skip-if-present guard and will
 *                deactivate an operator-registered custom schema in favor of
 *                the built-in.
 */

// Use dynamic imports to handle missing database config gracefully
import { ENTITY_SCHEMAS, type EntitySchema } from "../src/services/schema_definitions.js";

interface RegistrationResult {
  entity_type: string;
  schema_version: string;
  action: "registered" | "activated" | "skipped" | "error";
  error?: string;
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
    if (!dbAccessible || !schemaRegistry) {
      // Database not accessible - return early to show what would be registered
      return {
        entity_type,
        schema_version,
        action: "registered", // Will show as "would be registered" in output
      };
    }

    // Skip-if-present, keyed on whatever is ACTIVE rather than on a
    // schema_version string match (issue #1968).
    //
    // Previously this activated the built-in version whenever it was
    // registered-but-inactive. On an instance where an operator had
    // deliberately registered and activated a CUSTOM schema for this entity
    // type, that call flipped the built-in back to active — and activate()
    // deactivates every other version for the type, so the operator's schema
    // was silently switched off. Reading the active row and leaving it alone
    // removes that hazard; `--force` remains the explicit opt-in for
    // re-registering built-ins over whatever is present.
    if (!force && dbAccessible && schemaRegistry) {
      const activeSchema = await schemaRegistry.loadGlobalSchema(entity_type);
      if (activeSchema) {
        return {
          entity_type,
          schema_version,
          action: "skipped",
        };
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
    if (error.message?.includes("Missing database") || error.message?.includes("configuration")) {
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
      error.message?.includes("Missing database") ||
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
      console.log("⚠️  Database not accessible - showing all schemas that would be registered\n");
      console.log("   (Configure NEOTOMA_DATA_DIR to check existing schemas)\n");
    } else {
      console.error("❌ Error: Database not accessible. Please configure NEOTOMA_DATA_DIR.\n");
      console.error("   Required environment variables:\n");
      console.error("   - NEOTOMA_DATA_DIR (for local SQLite)\n");
      console.error("\n   Options to configure:\n");
      console.error("   1. Sync from 1Password (recommended):\n");
      console.error("      npm run sync:env\n");
      console.error("      (Requires 1Password CLI and mappings configured)\n");
      console.error("   2. Manually add to .env file:\n");
      console.error("      NEOTOMA_DATA_DIR=./data\n");
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
      console.warn(`⚠️  Skipping invalid schema: missing entity_type or schema_version`);
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

    console.log(`  ${icon} ${schema.entity_type} v${schema.schema_version} - ${actionLabel}`);
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
