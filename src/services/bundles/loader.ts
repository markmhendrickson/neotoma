/**
 * Bundle loader (Bundles m2).
 *
 * Reads bundle manifests, validates them, registers bundles, and triggers
 * schema seeding for each registered bundle. Schema seeding is delegated to
 * the existing per-subsystem seed_schema.ts files (option 2 of the migration
 * plan) — the bundle loader calls them rather than each file living as a
 * standalone startup call in actions.ts.
 *
 * Default-install bundles (`core`, `infrastructure`, `core_workflows`) are
 * always registered. Additional bundles are loaded on demand (m3).
 *
 * Seed wiring (option 2):
 *   - `infrastructure` → seedIssueSchema, seedPlanSchema, seedSubscriptionSchema,
 *     seedSubmissionDefaults, seedPeerConfigSchema, and (in sandbox mode)
 *     seedSandboxAbuseReportSchema.
 *   - `core` → no dedicated seed functions; types rely on the schema-definitions
 *     fallback / database bootstrap path.
 *   - `core_workflows` → skill bundle; no schema seeds.
 *
 * Plan: `ent_089da2ecebc3bd804d63dcf2` (Bundles Strategy m2)
 */

import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../../utils/logger.js";
import type { BundleManifest, BundleRegistration } from "./types.js";

// ── Default-install bundle names ────────────────────────────────────────────

export const DEFAULT_BUNDLE_NAMES = ["core", "infrastructure", "core_workflows"] as const;
export type DefaultBundleName = (typeof DEFAULT_BUNDLE_NAMES)[number];

// ── Bundle registry (in-memory, populated at startup) ───────────────────────

const _registry = new Map<string, BundleRegistration>();
let _initialized = false;

/** All entity types provided by currently-registered schema bundles. */
const _providedEntityTypes = new Set<string>();

// ── Loader ───────────────────────────────────────────────────────────────────

function bundlesRoot(): string {
  // Works in both ESM (tsx/Vite) and CJS (compiled dist) contexts.
  // import.meta.url resolves to the loader module itself, which lives at
  // src/services/bundles/loader.ts — so dirname gives us the bundles root.
  return path.dirname(fileURLToPath(import.meta.url));
}

function parseBundleManifest(raw: unknown, bundleName: string): BundleManifest {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`[bundles] manifest for "${bundleName}" is not an object`);
  }
  const m = raw as Record<string, unknown>;

  if (typeof m.name !== "string" || !m.name) {
    throw new Error(`[bundles] manifest for "${bundleName}" missing required field: name`);
  }
  if (typeof m.version !== "string" || !m.version) {
    throw new Error(`[bundles] manifest for "${bundleName}" missing required field: version`);
  }
  if (m.bundle_type !== "schema" && m.bundle_type !== "skill") {
    throw new Error(
      `[bundles] manifest for "${bundleName}" has invalid bundle_type: ${String(m.bundle_type)}`
    );
  }
  if (!Array.isArray(m.provides_entity_types)) {
    throw new Error(
      `[bundles] manifest for "${bundleName}" missing required field: provides_entity_types`
    );
  }
  if (m.bundle_type === "skill" && (m.provides_entity_types as unknown[]).length > 0) {
    throw new Error(
      `[bundles] skill bundle "${bundleName}" MUST have empty provides_entity_types`
    );
  }

  return {
    name: m.name as string,
    version: m.version as string,
    description: typeof m.description === "string" ? m.description : "",
    bundle_type: m.bundle_type,
    requires_bundles: Array.isArray(m.requires_bundles)
      ? (m.requires_bundles as string[])
      : [],
    provides_entity_types: m.provides_entity_types as string[],
    references_shared_schemas: Array.isArray(m.references_shared_schemas)
      ? (m.references_shared_schemas as string[])
      : [],
    extends_schemas: Array.isArray(m.extends_schemas) ? (m.extends_schemas as string[]) : [],
    provides_skills: Array.isArray(m.provides_skills)
      ? (m.provides_skills as BundleManifest["provides_skills"])
      : [],
    compatible_modes: Array.isArray(m.compatible_modes)
      ? (m.compatible_modes as BundleManifest["compatible_modes"])
      : ["evolving", "guided", "locked"],
    category: typeof m.category === "string" ? m.category : undefined,
    serves_use_cases: Array.isArray(m.serves_use_cases) ? (m.serves_use_cases as string[]) : [],
  };
}

async function loadBundleManifest(bundleName: string): Promise<BundleManifest> {
  const root = bundlesRoot();
  const manifestPath = path.join(root, bundleName, "manifest.yaml");

  // Dynamic import of yaml — js-yaml is already a dep in the workspace.
  const { load: yamlLoad } = await import("js-yaml");
  const { readFileSync } = await import("fs");

  let raw: unknown;
  try {
    const content = readFileSync(manifestPath, "utf-8");
    raw = yamlLoad(content);
  } catch (err) {
    throw new Error(
      `[bundles] failed to read manifest for bundle "${bundleName}" at ${manifestPath}: ${String(err)}`
    );
  }

  return parseBundleManifest(raw, bundleName);
}

// ── Per-bundle seed functions ────────────────────────────────────────────────

/**
 * Run schema-seed side-effects for a bundle after it is registered.
 *
 * Each bundle that owns database-backed schema definitions is responsible for
 * seeding them here. `core` types use the schema-definitions fallback / DB
 * bootstrap path and have no dedicated seed functions. Skill bundles seed
 * nothing.
 */
async function runBundleSeeds(bundleName: string): Promise<void> {
  if (bundleName === "infrastructure") {
    const seeds: Array<{ label: string; fn: () => Promise<void> }> = [
      {
        label: "issue",
        fn: async () => {
          const { seedIssueSchema } = await import("../issues/seed_schema.js");
          await seedIssueSchema();
        },
      },
      {
        label: "plan",
        fn: async () => {
          const { seedPlanSchema } = await import("../plans/seed_schema.js");
          await seedPlanSchema();
        },
      },
      {
        label: "subscription",
        fn: async () => {
          const { seedSubscriptionSchema } = await import("../subscriptions/seed_schema.js");
          await seedSubscriptionSchema();
        },
      },
      {
        label: "submission_config",
        fn: async () => {
          const { seedSubmissionDefaults } = await import(
            "../entity_submission/seed_submission_defaults.js"
          );
          await seedSubmissionDefaults();
        },
      },
      {
        label: "peer_config",
        fn: async () => {
          const { seedPeerConfigSchema } = await import("../sync/seed_peer_schema.js");
          await seedPeerConfigSchema();
        },
      },
    ];

    for (const { label, fn } of seeds) {
      try {
        await fn();
        logger.debug(`[bundles] seeded ${label} schema (infrastructure bundle)`);
      } catch (err) {
        logger.warn(
          `[bundles] failed to seed ${label} schema (infrastructure bundle): ${String(err)}`
        );
      }
    }

    // sandbox_abuse_report is only needed in sandbox-mode deployments, but we
    // seed it unconditionally so the schema is available if an operator later
    // enables sandbox mode without restarting. The seed is idempotent.
    try {
      const { seedSandboxAbuseReportSchema } = await import("../sandbox/seed_schema.js");
      await seedSandboxAbuseReportSchema();
      logger.debug(`[bundles] seeded sandbox_abuse_report schema (infrastructure bundle)`);
    } catch (err) {
      logger.warn(
        `[bundles] failed to seed sandbox_abuse_report schema (infrastructure bundle): ${String(err)}`
      );
    }
  }
  // `core` and `core_workflows` have no dedicated seed functions — core types
  // are covered by the schema-definitions fallback / `npm run schema:init`,
  // and core_workflows is a skill bundle with no entity schemas.
}

/**
 * Register a single bundle by name. Idempotent — re-registering an already-
 * loaded bundle is a no-op (uses the first-registered version).
 */
export async function registerBundle(bundleName: string): Promise<BundleRegistration> {
  const existing = _registry.get(bundleName);
  if (existing) return existing;

  const manifest = await loadBundleManifest(bundleName);
  const root = bundlesRoot();
  const registration: BundleRegistration = {
    manifest,
    bundle_path: path.join(root, bundleName),
  };

  _registry.set(bundleName, registration);

  for (const entityType of manifest.provides_entity_types) {
    _providedEntityTypes.add(entityType);
  }

  // Run per-bundle seed side-effects (option 2: delegate to existing
  // seed_schema.ts files rather than duplicating their logic here).
  await runBundleSeeds(bundleName);

  logger.debug(
    `[bundles] registered bundle "${bundleName}" v${manifest.version} (${manifest.bundle_type})`
  );

  return registration;
}

/**
 * Initialize default-install bundles. Called once at server startup.
 * Safe to call multiple times (idempotent).
 */
export async function initDefaultBundles(): Promise<void> {
  if (_initialized) return;
  _initialized = true;

  for (const name of DEFAULT_BUNDLE_NAMES) {
    try {
      await registerBundle(name);
    } catch (err) {
      logger.error(`[bundles] failed to load default bundle "${name}": ${String(err)}`);
      // Non-fatal: default install continues; the missing bundle's types are
      // simply absent from the provided-types set, which means guided/locked
      // mode will block writes for those types.
    }
  }

  logger.info(
    `[bundles] default bundles loaded. Provided entity types: ${[..._providedEntityTypes].sort().join(", ")}`
  );
}

// ── Public query API ─────────────────────────────────────────────────────────

/** Returns the set of entity types provided by all currently-registered bundles. */
export function getProvidedEntityTypes(): ReadonlySet<string> {
  return _providedEntityTypes;
}

/** Returns all registered bundle registrations. */
export function getRegisteredBundles(): ReadonlyMap<string, BundleRegistration> {
  return _registry;
}

/**
 * Returns the names of bundles that provide the given entity type.
 * Used in error responses to point operators at the bundle to install.
 */
export function getBundlesProvidingType(entityType: string): string[] {
  const results: string[] = [];
  for (const [name, reg] of _registry) {
    if (reg.manifest.provides_entity_types.includes(entityType)) {
      results.push(name);
    }
  }
  return results;
}

/** True if any registered bundle provides the given entity type. */
export function isEntityTypeProvided(entityType: string): boolean {
  return _providedEntityTypes.has(entityType);
}

/** Test-only: reset loader state between tests. */
export function resetBundleLoaderForTesting(): void {
  _registry.clear();
  _providedEntityTypes.clear();
  _initialized = false;
}
