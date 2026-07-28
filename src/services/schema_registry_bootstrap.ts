/**
 * Idempotent registry-wide schema seeding (issue #1968).
 *
 * `schemaRegistry.loadActiveSchema` is DB-only: it has NO fallback to the
 * code-defined `ENTITY_SCHEMAS` (see loadGlobalSchema / loadUserSpecificSchema,
 * both pure `db.from("schema_registry")` lookups). So on an instance whose
 * `schema_registry` table was never seeded, the store-time auto-link hook
 * (`autoLinkReferenceFields`) reads `null` and silently stops linking — the
 * failure this module exists to prevent. See
 * tests/services/schema_seeding_fresh_instance_gap.test.ts.
 *
 * Before this module, seeding ran ONLY via `npm run schema:init` or an
 * explicit `node dist/seed_schemas_entry.js`, and neither was wired into any
 * deploy path (no fly.toml `release_command`; scripts/redeploy_rc_from_main.sh
 * never called it; the Dockerfile CMD is just `node dist/actions.js`). Seeding
 * at boot closes every deploy path at once, including paths not yet written.
 *
 * ── SAFETY CONTRACT ────────────────────────────────────────────────────────
 * This seeder is strictly ADDITIVE and NEVER overwrites, downgrades, or
 * re-activates over an existing registration:
 *
 *   - If a GLOBAL active schema already exists for an entity_type, it is left
 *     completely untouched — no register(), no activate(), no field merge.
 *     That is deliberate: an operator may have deliberately registered a
 *     CUSTOM schema (via the `register_schema` / `update_schema_incremental`
 *     tools) that intentionally overrides the built-in, sometimes at the very
 *     same `schema_version` string. Re-seeding such an instance must not
 *     revert their customization.
 *   - Only entity types with NO active global schema are registered.
 *
 * This is a narrower contract than `src/seed_schemas_entry.ts` /
 * `scripts/initialize-schemas.ts`, which decide by matching the
 * `schema_version` STRING only and call `activate()` when the version is
 * registered-but-inactive — steps that can resurrect a built-in over an
 * operator's deliberately-activated custom schema. See the module docs there.
 *
 * Boot-safety: seeding is best-effort and must never block or break startup.
 * The caller wraps this in try/catch (matching the other boot-time seeders in
 * src/actions.ts), a DB that is briefly unavailable simply yields a warn log,
 * and concurrent instances racing to register the same type are absorbed by
 * the duplicate-key fallback below rather than crashing a boot.
 */

import { schemaRegistry } from "./schema_registry.js";
import { ENTITY_SCHEMAS } from "./schema_definitions.js";

export interface RegistryBootstrapSummary {
  /** Entity types newly registered because no active global schema existed. */
  registered: string[];
  /** Entity types left untouched because an active global schema already exists. */
  preserved: string[];
  /** Entity types that failed to seed (non-fatal; boot continues). */
  failed: Array<{ entity_type: string; error: string }>;
}

function isDuplicateRegistrationError(error: unknown): boolean {
  const message = (error as { message?: string })?.message ?? "";
  return (
    message.includes("duplicate key") ||
    message.includes("unique constraint") ||
    message.includes("already exists")
  );
}

/**
 * Register every built-in schema that has no active global registration.
 *
 * Idempotent and safe to run on an already-seeded instance: a second run
 * reports every type as `preserved` and issues no writes.
 */
export async function seedSchemaRegistryIfEmpty(options?: {
  registry?: Pick<typeof schemaRegistry, "loadGlobalSchema" | "register">;
  /**
   * Schemas to seed. Defaults to the built-in `ENTITY_SCHEMAS`; overridden in
   * tests so the seeder's real decision logic can be exercised against scratch
   * entity types without touching the shared registry.
   */
  schemas?: Iterable<(typeof ENTITY_SCHEMAS)[string]>;
}): Promise<RegistryBootstrapSummary> {
  const registry = options?.registry ?? schemaRegistry;
  const schemas = options?.schemas ?? Object.values(ENTITY_SCHEMAS);

  const summary: RegistryBootstrapSummary = {
    registered: [],
    preserved: [],
    failed: [],
  };

  for (const schema of schemas) {
    const { entity_type, schema_version } = schema;
    if (!entity_type || !schema_version) continue;

    try {
      // Skip-if-present. Reading the ACTIVE GLOBAL row (rather than matching a
      // version string via getSchemaVersions) is what makes a custom operator
      // schema safe: whatever is active stays active, even when it shares a
      // schema_version with the built-in or carries an unrelated version.
      const existing = await registry.loadGlobalSchema(entity_type);
      if (existing) {
        summary.preserved.push(entity_type);
        continue;
      }

      await registry.register({
        entity_type,
        schema_version,
        schema_definition: schema.schema_definition,
        reducer_config: schema.reducer_config,
        user_specific: false,
        // Activate in the same call: register() only flips `active` when
        // asked, and an inactive row still leaves loadActiveSchema null.
        activate: true,
        ...(schema.metadata ? { metadata: schema.metadata } : {}),
      });
      summary.registered.push(entity_type);
    } catch (error) {
      // Another instance booting concurrently may have registered this type
      // between our read and our write. That is a success for our purposes —
      // the registry now has a row — so record it as preserved, not failed.
      if (isDuplicateRegistrationError(error)) {
        summary.preserved.push(entity_type);
        continue;
      }
      summary.failed.push({
        entity_type,
        error: (error as Error)?.message ?? String(error),
      });
    }
  }

  return summary;
}
