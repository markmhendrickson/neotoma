#!/usr/bin/env tsx
/**
 * `npm run bundles:scaffold <name>` — generate a new bundle skeleton
 * (Bundles m4 contributor tooling).
 *
 * Creates `src/services/bundles/<name>/` with a `manifest.yaml` that stubs every
 * field from the doc's "manifest.yaml field reference" table, plus the standard
 * `schemas/`, `skills/`, `record_types/`, and `tests/` subdirectories (each with
 * a `.gitkeep` so the empty dir is committable). The generated manifest is valid
 * by construction: it parses, normalizes, and passes `npm run bundles:check`.
 *
 * Usage:
 *   npm run bundles:scaffold my_bundle
 *   npm run bundles:scaffold my_skills --type skill
 *
 * Options:
 *   --type schema|skill   Bundle classification (default: schema).
 *   --force               Overwrite an existing bundle directory.
 *   --dir <path>          Target bundles root (default: src/services/bundles).
 *
 * Exit 0 on success, 1 on bad input or an existing dir without --force.
 *
 * Tracking: Neotoma plan `ent_089da2ecebc3bd804d63dcf2` (Bundles Strategy).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { BundleType } from "../src/services/bundles/index.js";

export interface ScaffoldOptions {
  /** Bundle identifier (snake_case). */
  name: string;
  /** Bundle classification. Defaults to "schema". */
  type?: BundleType;
  /** Overwrite an existing directory. */
  force?: boolean;
  /** Bundles root directory. Defaults to the real `src/services/bundles`. */
  bundlesRoot?: string;
}

export interface ScaffoldResult {
  /** Absolute path to the created bundle directory. */
  dir: string;
  /** Absolute path to the created manifest.yaml. */
  manifestPath: string;
  /** Created subdirectories (absolute paths). */
  createdDirs: string[];
}

const SUBDIRS = ["schemas", "skills", "record_types", "tests"] as const;
const NAME_RE = /^[a-z][a-z0-9_]*$/;

function defaultBundlesRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "src", "services", "bundles");
}

/**
 * Render the stub `manifest.yaml` body for a new bundle. Schema bundles get a
 * placeholder commented entry in `provides_entity_types`; skill bundles keep it
 * empty (the doc invariant the parser enforces) and stub `provides_skills`.
 */
export function renderManifest(name: string, type: BundleType): string {
  const isSkill = type === "skill";
  const lines: string[] = [
    "# Bundle manifest — see docs/foundation/bundles.md",
    `# Scaffolded by \`npm run bundles:scaffold ${name}\`. Fill in the stubs below.`,
    `name: ${name}`,
    "version: 0.1.0",
    `description: TODO one-line summary of the ${name} bundle.`,
    `bundle_type: ${type}`,
    "requires_bundles: []",
  ];

  if (isSkill) {
    lines.push(
      "# Skill bundles MUST have empty provides_entity_types (enforced by the parser).",
      "provides_entity_types: []"
    );
  } else {
    lines.push(
      "# List the entity types this bundle originates (snake_case). At least one",
      "# is expected for a schema bundle; replace the placeholder before shipping.",
      "provides_entity_types: []"
    );
  }

  lines.push("references_shared_schemas: []", "extends_schemas: []");

  if (isSkill) {
    lines.push(
      "# Skills this bundle delivers. Each maps to skills/<name>/SKILL.md.",
      "provides_skills: []"
    );
  } else {
    lines.push(
      "# Schema bundles MAY ship supporting skills (skills/<name>/SKILL.md).",
      "provides_skills: []"
    );
  }

  lines.push(
    "compatible_modes:",
    "  - evolving",
    "  - guided",
    "  - locked",
    `category: ${name}`,
    "# Use-case ids this bundle contributes to (informational).",
    "serves_use_cases: []",
    ""
  );

  return lines.join("\n");
}

/** Create the bundle skeleton on disk. Throws on bad input or an existing dir. */
export function scaffoldBundle(opts: ScaffoldOptions): ScaffoldResult {
  const name = opts.name.trim();
  if (!NAME_RE.test(name)) {
    throw new Error(
      `invalid bundle name "${name}": must be snake_case (start with a letter, ` +
        `then lowercase letters, digits, or underscores)`
    );
  }
  const type: BundleType = opts.type ?? "schema";
  if (type !== "schema" && type !== "skill") {
    throw new Error(`invalid --type "${type}": must be "schema" or "skill"`);
  }

  const root = opts.bundlesRoot ?? defaultBundlesRoot();
  const dir = path.join(root, name);
  if (fs.existsSync(dir) && !opts.force) {
    throw new Error(
      `bundle directory already exists: ${dir} (pass --force to overwrite the manifest)`
    );
  }

  fs.mkdirSync(dir, { recursive: true });
  const createdDirs: string[] = [];
  for (const sub of SUBDIRS) {
    const subPath = path.join(dir, sub);
    fs.mkdirSync(subPath, { recursive: true });
    // Keep empty scaffolded dirs committable.
    fs.writeFileSync(path.join(subPath, ".gitkeep"), "");
    createdDirs.push(subPath);
  }

  const manifestPath = path.join(dir, "manifest.yaml");
  fs.writeFileSync(manifestPath, renderManifest(name, type));

  return { dir, manifestPath, createdDirs };
}

/** Parse argv into {@link ScaffoldOptions}. Exported for testing. */
export function parseArgs(argv: string[]): ScaffoldOptions {
  let name: string | undefined;
  let type: BundleType | undefined;
  let force = false;
  let bundlesRoot: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--type") {
      type = argv[++i] as BundleType;
    } else if (arg === "--force") {
      force = true;
    } else if (arg === "--dir") {
      bundlesRoot = argv[++i];
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown option "${arg}"`);
    } else if (name === undefined) {
      name = arg;
    } else {
      throw new Error(`unexpected extra argument "${arg}"`);
    }
  }

  if (!name) {
    throw new Error("missing bundle name. Usage: npm run bundles:scaffold <name> [--type skill]");
  }
  return { name, type, force, bundlesRoot };
}

function main(): void {
  let opts: ScaffoldOptions;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`bundles:scaffold: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  let result: ScaffoldResult;
  try {
    result = scaffoldBundle(opts);
  } catch (err) {
    console.error(`bundles:scaffold: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const rel = path.relative(process.cwd(), result.dir);
  console.log(`Scaffolded bundle "${opts.name}" at ${rel}/`);
  console.log("  manifest.yaml");
  for (const d of result.createdDirs) {
    console.log(`  ${path.basename(d)}/`);
  }
  console.log("\nNext steps:");
  console.log(
    "  1. Fill in description, provides_entity_types / provides_skills, serves_use_cases."
  );
  console.log("  2. Run `npm run bundles:check` to validate.");
}

// Run only when invoked directly (not when imported by tests).
const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main();
}
