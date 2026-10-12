#!/usr/bin/env tsx
/**
 * `npm run bundles:check` — bundle manifest linter (Bundles m2).
 *
 * Validates the bundle set under `src/services/bundles/`:
 *
 *   1. Every bundle has a well-formed `manifest.yaml` (parser enforces required
 *      fields, types, and the skill-bundle empty-`provides_entity_types` rule).
 *   2. `provides_entity_types` is empty for skill bundles (re-checked here for a
 *      precise lint message even though the parser already rejects it).
 *   3. Shared-schema ownership is consistent: any entity type referenced by 2+
 *      bundles (via `references_shared_schemas` or `provides_entity_types`) must
 *      have a descriptor in `_shared_schemas/<type>.ts` exporting `originated_by`.
 *   4. `requires_bundles` resolve to installed bundles (no missing deps, no
 *      cycles).
 *   5. A bundle that ships schemas (`bundle_schemas.ts`) registers exactly the
 *      types it lists in `provides_entity_types` — no undeclared schema, no
 *      provided type without a schema — and each schema declares an identity
 *      rule (`canonical_name_fields` or `identity_opt_out`, R2).
 *   6. Bundle schema aliases are unambiguous: no alias is declared by two
 *      schemas, and no alias equals a type some bundle provides.
 *
 * Exit 0 on success, 1 on any violation. Pure filesystem read; no network.
 *
 * Tracking: Neotoma plan `ent_089da2ecebc3bd804d63dcf2` (Bundles Strategy).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ManifestError,
  bundlesWithSchemas,
  getBundleSchemas,
  loadBundlesFrom,
  resolveRequires,
} from "../src/services/bundles/index.js";
import type { LoadedBundle } from "../src/services/bundles/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const bundlesDir = path.resolve(here, "..", "src", "services", "bundles");
const sharedDir = path.join(bundlesDir, "_shared_schemas");

const errors: string[] = [];

function fail(msg: string): void {
  errors.push(msg);
}

let bundles: LoadedBundle[] = [];
try {
  bundles = loadBundlesFrom(bundlesDir);
} catch (err) {
  fail(err instanceof ManifestError ? err.message : String(err));
}

if (bundles.length === 0 && errors.length === 0) {
  fail(`no bundles discovered under ${bundlesDir}`);
}

// (2) skill bundles have empty provides_entity_types.
for (const b of bundles) {
  if (b.manifest.bundle_type === "skill" && b.manifest.provides_entity_types.length > 0) {
    fail(`bundle "${b.manifest.name}": skill bundles must have empty provides_entity_types`);
  }
}

// (4) requires_bundles resolve (and no cycles).
try {
  resolveRequires(bundles);
} catch (err) {
  fail(err instanceof ManifestError ? err.message : String(err));
}

// (3) shared-schema ownership consistency.
// Count, per entity type, how many bundles touch it via provides or references.
const refsByType = new Map<string, Set<string>>();
for (const b of bundles) {
  const touched = new Set<string>([
    ...b.manifest.provides_entity_types,
    ...b.manifest.references_shared_schemas,
  ]);
  for (const t of touched) {
    if (!refsByType.has(t)) refsByType.set(t, new Set());
    refsByType.get(t)!.add(b.manifest.name);
  }
}

function sharedDescriptorExists(type: string): boolean {
  const file = path.join(sharedDir, `${type}.ts`);
  if (!fs.existsSync(file)) return false;
  const src = fs.readFileSync(file, "utf8");
  // Require an originated_by attribution in the descriptor.
  return /originated_by\s*:/.test(src);
}

for (const [type, bundleNames] of refsByType) {
  if (bundleNames.size >= 2) {
    if (!sharedDescriptorExists(type)) {
      fail(
        `entity type "${type}" is referenced by ${bundleNames.size} bundles ` +
          `(${[...bundleNames].sort().join(", ")}) but has no shared-schema ` +
          `descriptor with originated_by at _shared_schemas/${type}.ts`
      );
    }
  }
}

// Also: any bundle that declares references_shared_schemas: [X] must have a
// descriptor for X (the second reference triggers ownership transfer; the
// descriptor is the recorded result).
for (const b of bundles) {
  for (const type of b.manifest.references_shared_schemas) {
    if (!sharedDescriptorExists(type)) {
      fail(
        `bundle "${b.manifest.name}" references shared schema "${type}" but ` +
          `_shared_schemas/${type}.ts is missing or lacks originated_by`
      );
    }
  }
}

// (5) bundle schemas match provides_entity_types.
const bundleNames = new Set(bundles.map((b) => b.manifest.name));
for (const name of bundlesWithSchemas()) {
  if (!bundleNames.has(name)) {
    fail(`bundle_schemas.ts maps schemas for "${name}" but no such bundle dir exists`);
    continue;
  }
  const manifest = bundles.find((b) => b.manifest.name === name)!.manifest;
  const provided = new Set(manifest.provides_entity_types);
  const schemas = getBundleSchemas(name);
  const schemaTypes = new Set<string>();
  for (const schema of schemas) {
    if (schemaTypes.has(schema.entity_type)) {
      fail(`bundle "${name}": duplicate schema for "${schema.entity_type}"`);
    }
    schemaTypes.add(schema.entity_type);
    if (!provided.has(schema.entity_type)) {
      fail(
        `bundle "${name}": ships a schema for "${schema.entity_type}" that is not in ` +
          `provides_entity_types`
      );
    }
    const def = schema.schema_definition;
    if (def.canonical_name_fields === undefined && def.identity_opt_out === undefined) {
      fail(
        `bundle "${name}": schema "${schema.entity_type}" declares neither ` +
          `canonical_name_fields nor identity_opt_out (R2)`
      );
    }
  }
  for (const type of provided) {
    if (!schemaTypes.has(type)) {
      fail(`bundle "${name}": provides "${type}" but ships no schema for it`);
    }
  }
}

// (6) aliases unambiguous across bundles.
const allProvided = new Map<string, string>();
for (const b of bundles) {
  for (const t of b.manifest.provides_entity_types) allProvided.set(t, b.manifest.name);
}
const aliasOwner = new Map<string, string>();
for (const name of bundlesWithSchemas()) {
  for (const schema of getBundleSchemas(name)) {
    for (const rawAlias of schema.schema_definition.aliases ?? []) {
      const alias = rawAlias.trim().toLowerCase();
      const owner = `${name}:${schema.entity_type}`;
      const previous = aliasOwner.get(alias);
      if (previous && previous !== owner) {
        fail(`alias "${alias}" is declared by both ${previous} and ${owner}`);
      }
      aliasOwner.set(alias, owner);
      const provider = allProvided.get(alias);
      if (provider) {
        fail(
          `alias "${alias}" (on ${owner}) is also an entity type provided by bundle "${provider}"`
        );
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`bundles:check FAILED with ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `bundles:check OK — ${bundles.length} bundle(s) validated ` +
    `(${bundles
      .map((b) => b.manifest.name)
      .sort()
      .join(", ")}).`
);
