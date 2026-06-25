/**
 * `manifest.yaml` parser + validator (Bundles m2 runtime).
 *
 * Parses a bundle manifest YAML string into a normalized {@link BundleManifest},
 * applying defaults from the doc's "manifest.yaml field reference" table and
 * enforcing the structural invariants the doc locks:
 *
 *   - `name`, `version`, `description`, `bundle_type` are required.
 *   - skill bundles MUST have empty `provides_entity_types`.
 *   - `compatible_modes` defaults to all three lock postures.
 *   - list fields default to empty lists.
 *
 * Parsing is total over well-formed input and throws a {@link ManifestError}
 * with a precise message on malformed input, so the loader and the
 * `bundles:check` linter can report exactly which bundle/field is wrong.
 *
 * Tracking: Neotoma plan `ent_089da2ecebc3bd804d63dcf2` (Bundles Strategy).
 */

import * as yaml from "js-yaml";

import type { SchemaMode } from "../schema_mode.js";
import type { BundleManifest, BundleSkillSpec, BundleType, RawBundleManifest } from "./types.js";

const ALL_MODES: SchemaMode[] = ["evolving", "guided", "locked"];
const BUNDLE_TYPES: ReadonlySet<string> = new Set<BundleType>(["schema", "skill"]);

/** Thrown when a manifest is missing required fields or has the wrong shape. */
export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestError";
  }
}

function asString(value: unknown, field: string, where: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ManifestError(`${where}: field "${field}" must be a non-empty string`);
  }
  return value.trim();
}

function asStringList(value: unknown, field: string, where: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ManifestError(`${where}: field "${field}" must be a list`);
  }
  return value.map((item, i) => {
    if (typeof item !== "string" || item.trim() === "") {
      throw new ManifestError(`${where}: field "${field}[${i}]" must be a non-empty string`);
    }
    return item.trim();
  });
}

function asSkills(value: unknown, where: string): BundleSkillSpec[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ManifestError(`${where}: field "provides_skills" must be a list`);
  }
  return value.map((item, i) => {
    // Allow a bare string shorthand: "- skill_name".
    if (typeof item === "string") {
      return { name: asString(item, `provides_skills[${i}]`, where) };
    }
    if (typeof item !== "object" || item === null) {
      throw new ManifestError(`${where}: field "provides_skills[${i}]" must be a string or object`);
    }
    const obj = item as Record<string, unknown>;
    const spec: BundleSkillSpec = {
      name: asString(obj.name, `provides_skills[${i}].name`, where),
    };
    if (obj.requires_entity_types !== undefined) {
      spec.requires_entity_types = asStringList(
        obj.requires_entity_types,
        `provides_skills[${i}].requires_entity_types`,
        where
      );
    }
    if (obj.depth !== undefined) {
      spec.depth = asString(obj.depth, `provides_skills[${i}].depth`, where);
    }
    return spec;
  });
}

function asModes(value: unknown, where: string): SchemaMode[] {
  if (value === undefined || value === null) return [...ALL_MODES];
  const list = asStringList(value, "compatible_modes", where);
  if (list.length === 0) return [...ALL_MODES];
  for (const m of list) {
    if (!ALL_MODES.includes(m as SchemaMode)) {
      throw new ManifestError(
        `${where}: field "compatible_modes" has invalid value "${m}" ` +
          `(valid: ${ALL_MODES.join(", ")})`
      );
    }
  }
  return list as SchemaMode[];
}

/**
 * Normalize a raw parsed manifest object into a {@link BundleManifest}, applying
 * defaults and validating invariants. `where` is a human-readable locator
 * (e.g. the manifest path) used in error messages.
 */
export function normalizeManifest(raw: RawBundleManifest, where: string): BundleManifest {
  const name = asString(raw.name, "name", where);
  const version = asString(raw.version, "version", where);
  const description = asString(raw.description, "description", where);
  const bundleTypeRaw = asString(raw.bundle_type, "bundle_type", where);
  if (!BUNDLE_TYPES.has(bundleTypeRaw)) {
    throw new ManifestError(
      `${where}: field "bundle_type" must be "schema" or "skill" (got "${bundleTypeRaw}")`
    );
  }
  const bundle_type = bundleTypeRaw as BundleType;

  const provides_entity_types = asStringList(
    raw.provides_entity_types,
    "provides_entity_types",
    where
  );

  // Doc invariant: skill bundles MUST have empty provides_entity_types.
  if (bundle_type === "skill" && provides_entity_types.length > 0) {
    throw new ManifestError(
      `${where}: skill bundle "${name}" must have empty provides_entity_types ` +
        `(got ${JSON.stringify(provides_entity_types)})`
    );
  }

  const manifest: BundleManifest = {
    name,
    version,
    description,
    bundle_type,
    requires_bundles: asStringList(raw.requires_bundles, "requires_bundles", where),
    provides_entity_types,
    references_shared_schemas: asStringList(
      raw.references_shared_schemas,
      "references_shared_schemas",
      where
    ),
    extends_schemas: asStringList(raw.extends_schemas, "extends_schemas", where),
    provides_skills: asSkills(raw.provides_skills, where),
    compatible_modes: asModes(raw.compatible_modes, where),
    serves_use_cases: asStringList(raw.serves_use_cases, "serves_use_cases", where),
  };

  if (raw.category !== undefined && raw.category !== null) {
    manifest.category = asString(raw.category, "category", where);
  }

  return manifest;
}

/**
 * Parse a YAML manifest string into a normalized {@link BundleManifest}.
 * `where` is a locator used in error messages (defaults to "<manifest>").
 */
export function parseManifest(source: string, where = "<manifest>"): BundleManifest {
  let parsed: unknown;
  try {
    parsed = yaml.load(source);
  } catch (err) {
    throw new ManifestError(
      `${where}: failed to parse YAML: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ManifestError(`${where}: manifest must be a YAML mapping`);
  }
  return normalizeManifest(parsed as RawBundleManifest, where);
}
