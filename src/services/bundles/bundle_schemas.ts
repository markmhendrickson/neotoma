/**
 * Bundle schema registry + seeder.
 *
 * Maps each schema bundle that ships its own definitions to the
 * {@link EntitySchema}s it registers, and seeds them into the schema registry
 * when the bundle is enabled. The default-install bundles (`core`,
 * `infrastructure`) have no entry: their types are built-ins in
 * `schema_definitions.ts`, seeded at boot by `schema_registry_bootstrap.ts`.
 *
 * Why bundle schemas are not in `ENTITY_SCHEMAS`: a code-defined schema is a
 * fallback that exists on every install, so the `guided`-mode gate in
 * `enforcement.ts` never runs for it. Keeping bundle schemas here means a
 * bundle type is unknown (and rejected under `guided`) until its bundle is
 * enabled, and registered with the bundle's curated field set once it is.
 *
 * Seeding reuses {@link seedSchemaRegistryIfEmpty}'s safety contract: strictly
 * additive, an entity type with an active global schema is left untouched, so
 * re-seeding is idempotent and an operator's custom schema is never reverted.
 * Each registered row is stamped with `metadata.bundle` / `bundle_version`.
 *
 * Wiring: the server seeds every enabled bundle at boot (`src/actions.ts`,
 * right after the built-in seeder), and `manage_bundles install|enable` seeds
 * the named bundle immediately. The CLI only records state; the server picks
 * the bundle up at its next boot.
 */

import type { EntitySchema } from "../schema_definitions.js";
import type { RegistryBootstrapSummary } from "../schema_registry_bootstrap.js";
import type { schemaRegistry as SchemaRegistryInstance } from "../schema_registry.js";
import { communicationsSchemas } from "./communications/schemas/index.js";
import { crmSchemas } from "./crm/schemas/index.js";
import { engineeringSchemas } from "./engineering/schemas/index.js";
import { getBundleRegistry } from "./loader.js";

/**
 * Bundle name -> schemas the bundle registers. Every entity type here must be
 * listed in that bundle's `provides_entity_types` and vice versa
 * (enforced by `npm run bundles:check`).
 */
const BUNDLE_SCHEMAS: Readonly<Record<string, readonly EntitySchema[]>> = {
  crm: crmSchemas,
  engineering: engineeringSchemas,
  communications: communicationsSchemas,
};

/** Names of bundles that ship their own schema definitions. */
export function bundlesWithSchemas(): string[] {
  return Object.keys(BUNDLE_SCHEMAS).sort();
}

/**
 * Returns the schemas `bundleName` registers, or `[]` when the bundle ships
 * none (skill bundles, default-install bundles, unknown names).
 */
export function getBundleSchemas(bundleName: string): EntitySchema[] {
  return [...(BUNDLE_SCHEMAS[bundleName] ?? [])];
}

/**
 * If `name` is an alias declared by a bundle schema (`schema_definition.aliases`),
 * returns the bundle and the canonical type it maps to. Case-insensitive.
 * Used to point a `guided`-mode rejection of an alias at the bundle to enable.
 */
export function bundleDeclaringAlias(
  name: string
): { bundle: string; canonical_entity_type: string } | undefined {
  const wanted = name.trim().toLowerCase();
  for (const [bundle, schemas] of Object.entries(BUNDLE_SCHEMAS)) {
    for (const schema of schemas) {
      const aliases = schema.schema_definition.aliases ?? [];
      if (aliases.some((a) => a.trim().toLowerCase() === wanted)) {
        return { bundle, canonical_entity_type: schema.entity_type };
      }
    }
  }
  return undefined;
}

/** Outcome of seeding one bundle's schemas. */
export interface BundleSeedSummary extends RegistryBootstrapSummary {
  bundle: string;
}

type SeedRegistry = Pick<typeof SchemaRegistryInstance, "loadGlobalSchema" | "register">;

function stampBundle(schema: EntitySchema, bundle: string, version?: string): EntitySchema {
  // Built-in schemas reused by a bundle (e.g. `company`) keep their own
  // metadata; the stamp records which bundle registered them on this install.
  return {
    ...schema,
    metadata: schema.metadata
      ? {
          ...schema.metadata,
          bundle,
          ...(version ? { bundle_version: version } : {}),
        }
      : undefined,
  };
}

/**
 * Register `bundleName`'s schemas that have no active global registration.
 * Idempotent: a second run reports every type as `preserved` and writes
 * nothing. `registry` is injectable for tests.
 */
export async function seedBundleSchemas(
  bundleName: string,
  options?: { registry?: SeedRegistry }
): Promise<BundleSeedSummary> {
  const version = getBundleRegistry().bundles.find((b) => b.manifest.name === bundleName)?.manifest
    .version;
  const schemas = getBundleSchemas(bundleName).map((s) => stampBundle(s, bundleName, version));
  if (schemas.length === 0) {
    return { bundle: bundleName, registered: [], preserved: [], failed: [] };
  }
  const { seedSchemaRegistryIfEmpty } = await import("../schema_registry_bootstrap.js");
  const summary = await seedSchemaRegistryIfEmpty({
    schemas,
    ...(options?.registry ? { registry: options.registry } : {}),
  });
  return { bundle: bundleName, ...summary };
}

/**
 * Seed every enabled bundle that ships schemas. Disabled bundles are skipped;
 * schemas a bundle registered before it was disabled stay registered (see
 * "Disable, not uninstall" in `docs/foundation/bundles.md`).
 */
export async function seedEnabledBundleSchemas(options?: {
  registry?: SeedRegistry;
}): Promise<BundleSeedSummary[]> {
  const results: BundleSeedSummary[] = [];
  for (const bundle of getBundleRegistry().bundles) {
    if (!bundle.enabled) continue;
    if (!BUNDLE_SCHEMAS[bundle.manifest.name]) continue;
    results.push(await seedBundleSchemas(bundle.manifest.name, options));
  }
  return results;
}
