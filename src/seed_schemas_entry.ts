/**
 * Production schema-registry seed entry point.
 *
 * The production Docker image ships only `dist/` (built via `tsc`), not
 * `scripts/` or `src/*.ts` sources — so `scripts/initialize-schemas.ts`
 * (run locally via `npm run schema:init`, a tsx script) cannot run there.
 * A fresh Neotoma instance boots with an empty `schema_registry` table, and
 * `schemaRegistry.loadActiveSchema()` is DB-only with no code fallback, so
 * nothing works until schemas are registered.
 *
 * This file lives under `src/` specifically so `npm run build:server`'s
 * plain `tsc` step compiles it into `dist/seed_schemas_entry.js` with
 * correct relative import paths (scripts/ is compiled separately via
 * tsconfig.scripts.json with rootDir: ./scripts, which cannot resolve deep
 * src/ import chains — see initialize-schemas.ts's failed migration there).
 *
 * Intended to run as a Fly.io `release_command` on every deploy, against
 * the target machine's database, after the image is built. Mirrors the
 * registration logic of scripts/initialize-schemas.ts and is safe to run
 * repeatedly: schemas already registered+active are skipped, schemas
 * registered but not active are activated, and anything missing is
 * registered then activated.
 *
 * Usage:
 *   node dist/seed_schemas_entry.js
 */

import { schemaRegistry } from "./services/schema_registry.js";
import { ENTITY_SCHEMAS } from "./services/schema_definitions.js";

interface SeedResult {
  entity_type: string;
  schema_version: string;
  action: "registered" | "activated" | "skipped" | "error";
  error?: string;
}

async function seedSchema(
  schema: (typeof ENTITY_SCHEMAS)[keyof typeof ENTITY_SCHEMAS]
): Promise<SeedResult> {
  const { entity_type, schema_version } = schema;

  try {
    let versions: Array<{ schema_version: string }> = [];
    try {
      versions = await schemaRegistry.getSchemaVersions(entity_type);
    } catch (error: any) {
      return {
        entity_type,
        schema_version,
        action: "error",
        error: `getSchemaVersions failed: ${error.message || String(error)}`,
      };
    }

    const exists = versions.some((v) => v.schema_version === schema_version);

    if (exists) {
      // Already registered - check if it's the active version.
      try {
        const activeSchema = await schemaRegistry.loadActiveSchema(entity_type);
        if (activeSchema?.schema_version === schema_version) {
          return { entity_type, schema_version, action: "skipped" };
        }
        // Registered but not active - activate it.
        await schemaRegistry.activate(entity_type, schema_version);
        return { entity_type, schema_version, action: "activated" };
      } catch {
        // Could not determine active status - attempt activation anyway.
        await schemaRegistry.activate(entity_type, schema_version);
        return { entity_type, schema_version, action: "activated" };
      }
    }

    // Not registered yet - register then activate.
    try {
      await schemaRegistry.register({
        entity_type,
        schema_version,
        schema_definition: schema.schema_definition,
        reducer_config: schema.reducer_config,
      });
      await schemaRegistry.activate(entity_type, schema_version);
      return { entity_type, schema_version, action: "registered" };
    } catch (error: any) {
      // Race with a concurrent registration (e.g. duplicate key) - fall
      // back to activation so a re-run stays idempotent.
      if (
        error.message?.includes("duplicate key") ||
        error.message?.includes("unique constraint") ||
        error.message?.includes("already exists")
      ) {
        await schemaRegistry.activate(entity_type, schema_version);
        return { entity_type, schema_version, action: "activated" };
      }
      throw error;
    }
  } catch (error: any) {
    return {
      entity_type,
      schema_version,
      action: "error",
      error: error.message || String(error),
    };
  }
}

async function seedSchemas(): Promise<void> {
  console.log("[seed_schemas_entry] Seeding schema_registry from schema_definitions.ts\n");

  const results: SeedResult[] = [];

  for (const schema of Object.values(ENTITY_SCHEMAS)) {
    if (!schema.entity_type || !schema.schema_version) {
      console.warn(
        "[seed_schemas_entry] Skipping invalid schema: missing entity_type or schema_version"
      );
      continue;
    }

    const result = await seedSchema(schema);
    results.push(result);

    const icon =
      result.action === "registered"
        ? "+"
        : result.action === "activated"
          ? "~"
          : result.action === "skipped"
            ? "."
            : "!";
    console.log(
      `  ${icon} ${result.entity_type} v${result.schema_version} - ${result.action}${
        result.error ? `: ${result.error}` : ""
      }`
    );
  }

  const registered = results.filter((r) => r.action === "registered").length;
  const activated = results.filter((r) => r.action === "activated").length;
  const skipped = results.filter((r) => r.action === "skipped").length;
  const errors = results.filter((r) => r.action === "error");

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total schemas processed: ${results.length}`);
  console.log(`  Registered: ${registered}`);
  console.log(`  Activated: ${activated}`);
  console.log(`  Skipped (already active): ${skipped}`);
  console.log(`  Failed: ${errors.length}`);

  if (errors.length > 0) {
    console.error("\nErrors:");
    for (const r of errors) {
      console.error(`  - ${r.entity_type} v${r.schema_version}: ${r.error}`);
    }
    throw new Error(`${errors.length} schema(s) failed to seed`);
  }

  console.log("\n[seed_schemas_entry] Schema seeding complete.");
}

seedSchemas()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n[seed_schemas_entry] Fatal error:", error);
    process.exit(1);
  });
