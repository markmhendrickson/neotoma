/**
 * Bundle activation orchestration (Bundles m3).
 *
 * Thin layer over the state store + loader that the CLI (`neotoma bundles`) and
 * the MCP `manage_bundles` tool both call, so their behavior stays identical.
 * Each mutation invalidates the cached registry so the next read (and the
 * schema-mode enforcement that consults it) reflects the new enabled set.
 *
 * Agent callers are gated in {@link assertAdminGateHook}: an AAuth-admitted
 * agent needs `register_schema` with `entity_types: ["*"]`, since a bundle
 * changes schema behaviour for many types instance-wide. A caller with no
 * agent identity (the CLI, an owner session) is not gated.
 *
 * Tracking: Neotoma plan `ent_089da2ecebc3bd804d63dcf2` (Bundles Strategy, m3).
 */

import { assertCurrentAgentMay } from "../mutation_capability.js";
import {
  BundleStateError,
  getBundle,
  getBundleRegistry,
  isAlwaysActiveBundle,
  isBundleEnabled,
  listInstalledBundleViews,
  resetBundleRegistryForTesting,
  setBundleEnabled,
  type BundleManifest,
  type InstalledBundleView,
} from "./loader.js";

/**
 * Gate for install / enable / disable, before any state mutation in
 * {@link installBundle}/{@link enableBundle}/{@link disableBundle}, so the CLI
 * and MCP surfaces share it. An agent caller needs `register_schema` over
 * every type (`entity_types: ["*"]`): a bundle changes which schemas
 * auto-create for many types, for every user on the instance. A request with
 * no agent identity (the CLI, an owner session) is not gated, which keeps
 * today's behaviour for those callers.
 *
 * @param _action the mutating action being attempted.
 */
function assertAdminGateHook(_action: "install" | "enable" | "disable"): void {
  assertCurrentAgentMay("register_schema", ["*"]);
}

/** A bundle's full manifest detail, for the `info` surface. */
export interface BundleInfo {
  name: string;
  enabled: boolean;
  always_active: boolean;
  manifest: BundleManifest;
}

/** Outcome of a state-mutating activation action. */
export interface BundleActionResult {
  bundle: string;
  enabled: boolean;
  always_active: boolean;
  /** Human-readable summary of what happened. */
  message: string;
}

/** Lists every known bundle with its install/enable state and manifest metadata. */
export function listBundles(): InstalledBundleView[] {
  return listInstalledBundleViews();
}

/**
 * Returns full manifest detail for one bundle, or `null` if no bundle by that
 * name is in the registry.
 */
export function getBundleInfo(name: string): BundleInfo | null {
  const loaded = getBundle(name);
  if (!loaded) return null;
  return {
    name: loaded.manifest.name,
    enabled: isBundleEnabled(loaded.manifest.name),
    always_active: isAlwaysActiveBundle(loaded.manifest.name),
    manifest: loaded.manifest,
  };
}

/** Thrown when an activation action targets a bundle not in the registry. */
export class UnknownBundleError extends Error {
  constructor(name: string) {
    super(
      `Unknown bundle "${name}". Run "neotoma bundles list" to see available bundles. ` +
        `(The registry currently ships the default-install bundles plus catalog references.)`
    );
    this.name = "UnknownBundleError";
  }
}

function ensureKnown(name: string): void {
  if (!getBundle(name)) {
    throw new UnknownBundleError(name);
  }
}

/**
 * Mark a bundle enabled (install). Validates the bundle exists in the registry
 * and records enabled state. Always-active default bundles are already enabled;
 * installing them is a no-op success.
 */
export function installBundle(name: string): BundleActionResult {
  assertAdminGateHook("install");
  ensureKnown(name);
  const enabled = setBundleEnabled(name, true);
  resetBundleRegistryForTesting();
  const always = isAlwaysActiveBundle(name);
  return {
    bundle: name,
    enabled,
    always_active: always,
    message: always
      ? `Bundle "${name}" is a default-install bundle and is always active.`
      : `Bundle "${name}" installed and enabled.`,
  };
}

/** Enable a previously-disabled bundle. */
export function enableBundle(name: string): BundleActionResult {
  assertAdminGateHook("enable");
  ensureKnown(name);
  const enabled = setBundleEnabled(name, true);
  resetBundleRegistryForTesting();
  return {
    bundle: name,
    enabled,
    always_active: isAlwaysActiveBundle(name),
    message: `Bundle "${name}" enabled.`,
  };
}

/**
 * Disable a bundle. Refuses to disable an always-active default bundle
 * (rethrows the {@link BundleStateError} from the state store with the
 * clear-error contract).
 */
export function disableBundle(name: string): BundleActionResult {
  assertAdminGateHook("disable");
  ensureKnown(name);
  const enabled = setBundleEnabled(name, false); // throws BundleStateError for defaults
  resetBundleRegistryForTesting();
  return {
    bundle: name,
    enabled,
    always_active: isAlwaysActiveBundle(name),
    message:
      `Bundle "${name}" disabled. Its schemas remain registered but its types ` +
      `no longer auto-create under guided/locked; existing data is preserved.`,
  };
}

export { BundleStateError, getBundleRegistry };
