/**
 * Bundle type definitions for the Neotoma Bundles system (m2).
 *
 * Bundles are the deliverable unit through which Neotoma ships schemas,
 * record-type docs, and skills. Two named bundle types exist:
 *
 *   - schema bundles: provide entity types (`provides_entity_types` non-empty)
 *   - skill bundles:  provide skills (`provides_entity_types` is empty by design,
 *                     MUST declare `requires_bundles` for schema deps)
 *
 * Plan: `ent_089da2ecebc3bd804d63dcf2` (Bundles Strategy m2)
 */

export type BundleType = "schema" | "skill";

export interface SkillProvision {
  /** Skill name (matches SKILL.md `name` frontmatter). */
  name: string;
  /** Path relative to the bundle root, e.g. `skills/start-session/SKILL.md`. */
  file: string;
  /** Entity types this skill requires to be registered before use. */
  requires_entity_types?: string[];
  /** Depth tiers supported by this skill (e.g. snapshot, standard, full). */
  depth_tiers?: string[];
}

export interface BundleManifest {
  name: string;
  version: string;
  description: string;
  bundle_type: BundleType;
  /** Other bundles that must be installed before this one. */
  requires_bundles?: string[];
  /**
   * Entity types this bundle originates.
   * MUST be empty for skill bundles.
   */
  provides_entity_types: string[];
  /**
   * Shared schemas this bundle reuses without re-registering.
   * Triggers automatic ownership transfer to `_shared_schemas/` at second reference.
   */
  references_shared_schemas?: string[];
  /** Field-level extensions to schemas owned by other bundles. */
  extends_schemas?: string[];
  /** Skills this bundle ships. */
  provides_skills?: SkillProvision[];
  /** Schema lock postures this bundle is compatible with. Defaults to all three. */
  compatible_modes?: Array<"evolving" | "guided" | "locked">;
  /** Populates `SchemaMetadata.category`. */
  category?: string;
  /** Informational: use case ids this bundle contributes to. */
  serves_use_cases?: string[];
}

export interface BundleRegistration {
  manifest: BundleManifest;
  /** Absolute path to the bundle root directory. */
  bundle_path: string;
}
