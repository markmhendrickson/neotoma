/**
 * Bundle model types (Bundles m2 runtime).
 *
 * A **bundle** is the deliverable unit through which Neotoma ships schemas,
 * record-type docs, and skills. See `docs/foundation/bundles.md` for the
 * authoritative model. These types mirror the "manifest.yaml field reference"
 * table in that doc.
 *
 * Tracking: Neotoma plan `ent_089da2ecebc3bd804d63dcf2` (Bundles Strategy).
 */

import type { SchemaMode } from "../schema_mode.js";

/** Bundle classification. Schema bundles originate entity types; skill bundles ship skills. */
export type BundleType = "schema" | "skill";

/**
 * A skill contributed by a bundle, with its declared dependencies and depth
 * tier. The shape is intentionally permissive — `provides_skills` is parsed
 * for surface validation only in m2; full skill auto-loading lands with the
 * harness work tracked in plan `ent_b5a51d1395d206e10945b6b1` (Resolve #205).
 */
export interface BundleSkillSpec {
  /** Skill name (snake_case or kebab-case, matching the SKILL.md dir). */
  name: string;
  /** Entity types the skill requires to function. */
  requires_entity_types?: string[];
  /** Depth tier (e.g. "core", "extended"). Informational in m2. */
  depth?: string;
}

/**
 * Parsed `manifest.yaml` for a bundle. Every field corresponds to a row in the
 * doc's "manifest.yaml field reference" table. Optional fields default per the
 * loader (see {@link normalizeManifest}).
 */
export interface BundleManifest {
  /** Bundle identifier (snake_case). */
  name: string;
  /** Bundle version (semver). */
  version: string;
  /** One-line summary. */
  description: string;
  /** Bundle classification. */
  bundle_type: BundleType;
  /** Bundle dependencies. Resolved at install time. */
  requires_bundles: string[];
  /** Types this bundle *originates*. MUST be empty for skill bundles. */
  provides_entity_types: string[];
  /** Shared schemas this bundle reuses without re-registering. */
  references_shared_schemas: string[];
  /** Explicit field-level extensions to schemas owned elsewhere. */
  extends_schemas: string[];
  /** Skill names with their dependencies and depth tiers. */
  provides_skills: BundleSkillSpec[];
  /** Lock postures supported. Defaults to all three. */
  compatible_modes: SchemaMode[];
  /** Populates the existing `SchemaMetadata.category` field. */
  category?: string;
  /** Informational. Use-case ids the bundle contributes to. */
  serves_use_cases: string[];
}

/**
 * A discovered bundle: its parsed manifest plus the absolute directory it was
 * loaded from. `enabled` reflects install state (m2 default install bundles are
 * always enabled; disable support is modeled but no disable surface ships yet).
 */
export interface LoadedBundle {
  manifest: BundleManifest;
  /** Absolute path to the bundle directory containing manifest.yaml. */
  dir: string;
  /** Whether the bundle is enabled (active for auto-create gating). */
  enabled: boolean;
}

/** Raw (unnormalized) manifest shape as parsed from YAML, before defaulting. */
export interface RawBundleManifest {
  name?: unknown;
  version?: unknown;
  description?: unknown;
  bundle_type?: unknown;
  requires_bundles?: unknown;
  provides_entity_types?: unknown;
  references_shared_schemas?: unknown;
  extends_schemas?: unknown;
  provides_skills?: unknown;
  compatible_modes?: unknown;
  category?: unknown;
  serves_use_cases?: unknown;
}
