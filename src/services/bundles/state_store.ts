/**
 * Bundle install/enable state store (Bundles m3 activation).
 *
 * A persisted record of which bundles are enabled vs disabled. The default
 * bundles (`core`, `infrastructure`, `core_workflows`) are **always active** and
 * cannot be disabled — they are not stored here at all; their active state is a
 * constant. Only deviations from the default (a non-default bundle that has been
 * installed/enabled, or a bundle explicitly disabled) are persisted.
 *
 * Persistence design (justified in the m3 PR): a small JSON file under the
 * Neotoma config dir, mirroring the CLI config pattern in `src/cli/config.ts`
 * (`readConfig`/`writeConfig` → `~/.config/neotoma/config.json`). Rationale:
 *
 *   - Bundle enable/disable is small, machine-local **operator** config, not
 *     user-scoped graph data. It does not belong in the entity graph the way
 *     `submission_config`/`peer_config` do (those are per-user, per-target rows
 *     written through the store pipeline with DB access).
 *   - The loader-level enforcement (`getProvidedEntityTypes`, consulted by the
 *     schema-mode gates) must be able to read this state **without a live DB or
 *     authenticated session** — the same constraint that pushed bundle discovery
 *     to the filesystem in m2. A file-backed store keeps enforcement pure and
 *     testable in isolation (no Supabase/SQLite required).
 *   - It is trivially overridable for tests via `NEOTOMA_BUNDLE_STATE_PATH`.
 *
 * The default-install bundles are the always-active set; see
 * {@link isAlwaysActiveBundle}.
 *
 * Tracking: Neotoma plan `ent_089da2ecebc3bd804d63dcf2` (Bundles Strategy, m3).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { logger } from "../../utils/logger.js";

/**
 * The default-install bundles. These ship in every Neotoma install, are always
 * active, and cannot be disabled (per `docs/foundation/bundles.md`, "Default
 * install" + "Disable, not uninstall"). Kept in sync with the bundle dirs under
 * `src/services/bundles/`.
 */
export const ALWAYS_ACTIVE_BUNDLES: ReadonlySet<string> = new Set([
  "core",
  "infrastructure",
  "core_workflows",
]);

/** Returns true if `name` is a default-install (always-active) bundle. */
export function isAlwaysActiveBundle(name: string): boolean {
  return ALWAYS_ACTIVE_BUNDLES.has(name);
}

/**
 * On-disk shape of the bundle state file. `enabled` maps a bundle name to its
 * persisted enabled flag. A name absent from the map falls back to its default
 * (always-active bundles default enabled; everything else defaults disabled
 * until installed). `version` allows future migrations.
 */
interface BundleStateFile {
  version: 1;
  /** bundle name -> explicit enabled flag (deviation from the default). */
  enabled: Record<string, boolean>;
}

const STATE_VERSION = 1 as const;

/** Resolves the bundle state file path (overridable for tests). */
export function bundleStatePath(): string {
  const override = process.env.NEOTOMA_BUNDLE_STATE_PATH?.trim();
  if (override) return override;
  return path.join(os.homedir(), ".config", "neotoma", "bundle_state.json");
}

let cached: BundleStateFile | undefined;

function emptyState(): BundleStateFile {
  return { version: STATE_VERSION, enabled: {} };
}

function readStateFile(): BundleStateFile {
  if (cached !== undefined) return cached;
  const filePath = bundleStatePath();
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as BundleStateFile).enabled === "object" &&
      (parsed as BundleStateFile).enabled !== null
    ) {
      const enabledRaw = (parsed as BundleStateFile).enabled as Record<string, unknown>;
      const enabled: Record<string, boolean> = {};
      for (const [name, value] of Object.entries(enabledRaw)) {
        if (typeof value === "boolean") enabled[name] = value;
      }
      cached = { version: STATE_VERSION, enabled };
      return cached;
    }
  } catch (err) {
    // Missing file is the common case (nothing installed beyond defaults).
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      logger.warn(
        `[bundles] failed to read bundle state (${bundleStatePath()}): ${
          err instanceof Error ? err.message : String(err)
        }; treating as empty.`
      );
    }
  }
  cached = emptyState();
  return cached;
}

function writeStateFile(state: BundleStateFile): void {
  const filePath = bundleStatePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
  cached = state;
}

/**
 * Returns whether a bundle is enabled. Always-active default bundles are always
 * enabled regardless of stored state. Non-default bundles default to disabled
 * (not installed) unless an explicit `true` is persisted.
 */
export function isBundleEnabled(name: string): boolean {
  if (isAlwaysActiveBundle(name)) return true;
  const state = readStateFile();
  return state.enabled[name] === true;
}

/** One row in the installed-bundles listing. */
export interface InstalledBundleState {
  name: string;
  enabled: boolean;
  always_active: boolean;
}

/**
 * Returns the install state for the given bundle names (defaults to the
 * always-active set plus any names with persisted state). Always-active bundles
 * are reported `enabled: true, always_active: true`.
 */
export function listInstalledBundles(knownBundleNames?: Iterable<string>): InstalledBundleState[] {
  const state = readStateFile();
  const names = new Set<string>([
    ...ALWAYS_ACTIVE_BUNDLES,
    ...Object.keys(state.enabled),
    ...(knownBundleNames ?? []),
  ]);
  return [...names].sort().map((name) => ({
    name,
    enabled: isBundleEnabled(name),
    always_active: isAlwaysActiveBundle(name),
  }));
}

/** Thrown when an operation is refused (e.g. disabling an always-active bundle). */
export class BundleStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BundleStateError";
  }
}

/**
 * Persist a bundle's enabled flag. Refuses to disable an always-active default
 * bundle (throws {@link BundleStateError}). Enabling an always-active bundle is a
 * no-op (they are always enabled). For non-default bundles, the flag is written
 * to the state file.
 *
 * @returns the resulting enabled state for the bundle.
 */
export function setBundleEnabled(name: string, enabled: boolean): boolean {
  if (isAlwaysActiveBundle(name)) {
    if (!enabled) {
      throw new BundleStateError(
        `Bundle "${name}" is a default-install bundle and is always active; it cannot be disabled.`
      );
    }
    // Enabling an always-active bundle is a no-op.
    return true;
  }
  const state = readStateFile();
  const next: BundleStateFile = {
    version: STATE_VERSION,
    enabled: { ...state.enabled, [name]: enabled },
  };
  writeStateFile(next);
  return enabled;
}

/** Test-only: clears the in-memory cache so the next read re-reads the file. */
export function resetBundleStateCacheForTesting(): void {
  cached = undefined;
}
