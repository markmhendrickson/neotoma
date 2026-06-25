/**
 * Bundle loader + registry (Bundles m2 runtime).
 *
 * Discovers bundle directories under `src/services/bundles/<name>/` (each with a
 * `manifest.yaml`), parses + validates their manifests, resolves
 * `requires_bundles`, and exposes "which entity types are provided by the
 * installed/enabled bundles". This is the data source the mode-enforcement
 * gating in `server.ts` and `interpretation.ts` consults under `guided`.
 *
 * The provided-types set is cached for the process lifetime (the default-install
 * bundles are static). {@link resetBundleRegistryForTesting} clears the cache so
 * tests can point the loader at fixtures.
 *
 * Path resolution: bundle manifests live under `src/` (dev/tsx/vitest) and are
 * copied to `dist/services/bundles/` by `scripts/copy_bundle_assets.js` at build
 * time, so {@link bundlesRootDir} resolves correctly in both layouts by anchoring
 * on this module's own location.
 *
 * Tracking: Neotoma plan `ent_089da2ecebc3bd804d63dcf2` (Bundles Strategy).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { logger } from "../../utils/logger.js";
import { ManifestError, parseManifest } from "./manifest.js";
import type { BundleManifest, LoadedBundle } from "./types.js";

/**
 * Directories that are part of the bundles service but are NOT bundles
 * themselves (no manifest.yaml). Skipped during discovery.
 */
const NON_BUNDLE_DIRS = new Set(["_shared_schemas", "use_cases"]);

/** Absolute path to the directory holding bundle subdirectories. */
export function bundlesRootDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

function discoverBundleDirs(root: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const dirs: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
    if (NON_BUNDLE_DIRS.has(entry.name)) continue;
    const dir = path.join(root, entry.name);
    if (fs.existsSync(path.join(dir, "manifest.yaml"))) {
      dirs.push(dir);
    }
  }
  return dirs.sort();
}

/**
 * Load and parse every bundle manifest under `root` (defaults to the real
 * bundles dir). Throws {@link ManifestError} if any manifest is malformed.
 */
export function loadBundlesFrom(root: string): LoadedBundle[] {
  const dirs = discoverBundleDirs(root);
  const bundles: LoadedBundle[] = [];
  for (const dir of dirs) {
    const manifestPath = path.join(dir, "manifest.yaml");
    const source = fs.readFileSync(manifestPath, "utf8");
    const manifest = parseManifest(source, path.relative(root, manifestPath));
    bundles.push({ manifest, dir, enabled: true });
  }
  return bundles;
}

/**
 * Resolve `requires_bundles` across the loaded set: every required bundle must
 * exist among the loaded bundles. Throws {@link ManifestError} on a missing
 * dependency or a cycle, so install-time gaps surface loudly.
 */
export function resolveRequires(bundles: LoadedBundle[]): void {
  const byName = new Map(bundles.map((b) => [b.manifest.name, b]));
  for (const b of bundles) {
    for (const dep of b.manifest.requires_bundles) {
      if (!byName.has(dep)) {
        throw new ManifestError(
          `bundle "${b.manifest.name}" requires_bundles "${dep}" which is not installed`
        );
      }
    }
  }
  // Cycle detection (DFS) — defensive; the default install is acyclic.
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (name: string, stack: string[]): void => {
    if (done.has(name)) return;
    if (visiting.has(name)) {
      throw new ManifestError(`requires_bundles cycle detected: ${[...stack, name].join(" -> ")}`);
    }
    visiting.add(name);
    const node = byName.get(name);
    for (const dep of node?.manifest.requires_bundles ?? []) {
      visit(dep, [...stack, name]);
    }
    visiting.delete(name);
    done.add(name);
  };
  for (const b of bundles) visit(b.manifest.name, []);
}

/** A loaded, dependency-resolved bundle registry. */
export interface BundleRegistry {
  bundles: LoadedBundle[];
  /** Entity types provided by any enabled bundle -> the bundle name that provides it. */
  providedEntityTypes: Map<string, string>;
}

/**
 * Build a {@link BundleRegistry} from a set of loaded bundles: resolves
 * `requires_bundles` and computes the provided-entity-types index from enabled
 * bundles only.
 */
export function buildRegistry(bundles: LoadedBundle[]): BundleRegistry {
  resolveRequires(bundles);
  const providedEntityTypes = new Map<string, string>();
  for (const b of bundles) {
    if (!b.enabled) continue;
    for (const t of b.manifest.provides_entity_types) {
      if (!providedEntityTypes.has(t)) {
        providedEntityTypes.set(t, b.manifest.name);
      }
    }
  }
  return { bundles, providedEntityTypes };
}

let cached: BundleRegistry | undefined;

/**
 * Returns the default-install bundle registry (all bundles discovered under the
 * real bundles dir), cached for the process lifetime. Fail-open: if discovery or
 * parsing fails, logs and returns an empty registry so a manifest mistake never
 * crashes the server — enforcement then treats every type as unprovided under
 * `guided`/`locked` and as provided under `evolving` (default), preserving
 * parity for the default mode.
 */
export function getBundleRegistry(): BundleRegistry {
  if (cached !== undefined) return cached;
  try {
    cached = buildRegistry(loadBundlesFrom(bundlesRootDir()));
  } catch (err) {
    if (err instanceof ManifestError) {
      logger.error(`[bundles] failed to load bundle registry: ${err.message}`);
    } else {
      logger.error(
        `[bundles] unexpected error loading bundle registry: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
    cached = { bundles: [], providedEntityTypes: new Map() };
  }
  return cached;
}

/**
 * Returns the set of entity types provided by installed/enabled bundles.
 */
export function getProvidedEntityTypes(): Set<string> {
  return new Set(getBundleRegistry().providedEntityTypes.keys());
}

/**
 * Returns the bundle name that provides `entityType`, or `undefined` if no
 * enabled bundle provides it.
 */
export function bundleProviding(entityType: string): string | undefined {
  return getBundleRegistry().providedEntityTypes.get(entityType);
}

/** Test-only: clears the cached registry so the next call re-discovers. */
export function resetBundleRegistryForTesting(): void {
  cached = undefined;
}

export type { BundleManifest, LoadedBundle };
