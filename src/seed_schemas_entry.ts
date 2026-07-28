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
 * Wired as the Fly.io `release_command` in fly.toml / fly.sandbox.toml, so it
 * runs on every deploy against the target machine's database after the image
 * is built (issue #1968). The server ALSO seeds idempotently at boot via
 * src/services/schema_registry_bootstrap.ts, which covers deploy paths that
 * do not go through Fly (e.g. scripts/redeploy_rc_from_main.sh) as well as
 * ones not yet written. Running both is harmless — whichever gets there first
 * registers, and the other skips.
 *
 * Safe to run repeatedly, and safe on an instance carrying CUSTOM schemas:
 * an entity type that already has an active global registration is skipped
 * outright — not re-registered, not re-activated, not merged. Only types with
 * nothing active are registered. This deliberately does NOT "activate the
 * built-in version if it is registered but inactive": doing so used to revert
 * an operator's deliberately-activated custom schema on every deploy.
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
    // Skip-if-present, keyed on the ACTIVE GLOBAL row rather than on a
    // schema_version string match (issue #1968).
    //
    // The previous implementation compared `schema_version` strings from
    // getSchemaVersions() and called activate() whenever the built-in version
    // was registered-but-inactive. On an instance where an operator had
    // deliberately registered and activated a CUSTOM schema for an entity
    // type, that flipped the built-in row back to active and deactivated the
    // operator's — silently reverting their customization on every deploy.
    // Reading whatever is currently active, and leaving it alone, removes the
    // whole class of hazard: a custom schema is preserved regardless of what
    // version string it carries.
    let activeSchema: { schema_version: string } | null = null;
    try {
      activeSchema = await schemaRegistry.loadGlobalSchema(entity_type);
    } catch (error: any) {
      return {
        entity_type,
        schema_version,
        action: "error",
        error: `loadGlobalSchema failed: ${error.message || String(error)}`,
      };
    }

    if (activeSchema) {
      return { entity_type, schema_version, action: "skipped" };
    }

    // Nothing active for this type - register and activate in one call.
    try {
      await schemaRegistry.register({
        entity_type,
        schema_version,
        schema_definition: schema.schema_definition,
        reducer_config: schema.reducer_config,
        user_specific: false,
        activate: true,
        ...(schema.metadata ? { metadata: schema.metadata } : {}),
      });
      return { entity_type, schema_version, action: "registered" };
    } catch (error: any) {
      // Race with a concurrent registration (e.g. another machine's release
      // command, or a second instance booting). Someone else already put a
      // row in place, so treat it as done and leave whatever they activated
      // alone — deliberately NOT calling activate() here, which would risk
      // overriding a concurrently-registered custom schema.
      if (
        error.message?.includes("duplicate key") ||
        error.message?.includes("unique constraint") ||
        error.message?.includes("already exists")
      ) {
        return { entity_type, schema_version, action: "skipped" };
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
