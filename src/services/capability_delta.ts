/**
 * Capability delta computation for the npm_check_update MCP tool.
 *
 * Reads the generated capability manifest (src/shared/capability_manifest.json)
 * to determine which MCP tools were added or removed between two semver versions.
 *
 * The manifest is produced by scripts/generate-capability-manifest.ts and MUST
 * be committed — never edit it by hand. Regenerate with:
 *   npm run generate:capability-manifest
 *
 * Design principles:
 *   - Graceful degradation: if the manifest is missing or a version is unknown,
 *     return empty arrays and a note rather than throwing.
 *   - No network calls — all data comes from the committed manifest.
 *   - Pure functions, easy to test without any DB or filesystem mocking.
 */

import type { CapabilityManifest } from "../shared/capability_manifest_types.js";

/** Parsed entry from the manifest for a single tool. */
export interface ToolManifestEntry {
  addedInVersion: string;
  removedInVersion?: string;
}

/** Input to computeCapabilityDelta. */
export interface CapabilityDeltaInput {
  currentVersion: string;
  latestVersion: string;
  manifest: CapabilityManifest;
}

/** Output of computeCapabilityDelta. */
export interface CapabilityDeltaResult {
  new_tools: string[];
  removed_tools: string[];
  capability_delta_recommendation: string;
  capability_delta_note?: string;
}

/**
 * Parse a semver string (with or without leading "v") into a numeric tuple.
 * Returns null if the string cannot be parsed as X.Y.Z.
 */
export function parseSemver(version: string): [number, number, number] | null {
  const cleaned = version.replace(/^v/, "");
  const m = cleaned.match(/^(\d+)\.(\d+)\.(\d+)(?:[.-].*)?$/);
  if (!m) return null;
  return [parseInt(m[1]!), parseInt(m[2]!), parseInt(m[3]!)];
}

/**
 * Compare two semver tuples.
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
export function compareSemver(
  a: [number, number, number],
  b: [number, number, number]
): -1 | 0 | 1 {
  for (let i = 0; i < 3; i++) {
    if (a[i]! < b[i]!) return -1;
    if (a[i]! > b[i]!) return 1;
  }
  return 0;
}

/**
 * Return true if version `v` is strictly greater than `from` and less than
 * or equal to `to`.  All inputs are semver strings (with or without "v").
 *
 * Returns false if any version is unparseable.
 */
export function versionInRange(v: string, from: string, to: string): boolean {
  const vp = parseSemver(v);
  const fp = parseSemver(from);
  const tp = parseSemver(to);
  if (!vp || !fp || !tp) return false;
  return compareSemver(vp, fp) > 0 && compareSemver(vp, tp) <= 0;
}

/**
 * Compute the capability delta between currentVersion and latestVersion using
 * the supplied manifest.
 *
 * new_tools:     tools whose addedInVersion is in (currentVersion, latestVersion]
 * removed_tools: tools whose removedInVersion is in (currentVersion, latestVersion]
 *
 * Gracefully degrades if versions are unparseable or the manifest is empty.
 */
export function computeCapabilityDelta(input: CapabilityDeltaInput): CapabilityDeltaResult {
  const { currentVersion, latestVersion, manifest } = input;

  const currentParsed = parseSemver(currentVersion);
  const latestParsed = parseSemver(latestVersion);

  if (!currentParsed || !latestParsed) {
    return {
      new_tools: [],
      removed_tools: [],
      capability_delta_recommendation: `Upgrade from ${currentVersion} to ${latestVersion}.`,
      capability_delta_note:
        `Could not parse version strings (current="${currentVersion}", latest="${latestVersion}"); ` +
        `capability delta unavailable. Expected X.Y.Z or vX.Y.Z format (e.g. "0.16.0" or "v0.16.0").`,
    };
  }

  // If current >= latest, no delta (already up-to-date or pre-release).
  if (compareSemver(currentParsed, latestParsed) >= 0) {
    return {
      new_tools: [],
      removed_tools: [],
      capability_delta_recommendation: "Already on the latest version.",
    };
  }

  const tools = manifest.tools ?? {};
  const newTools: string[] = [];
  const removedTools: string[] = [];

  for (const [toolName, entry] of Object.entries(tools)) {
    if (!entry) continue;

    // Detect newly added tools
    if (entry.addedInVersion) {
      if (versionInRange(entry.addedInVersion, currentVersion, latestVersion)) {
        newTools.push(toolName);
      }
    }

    // Detect newly removed tools (removedInVersion was introduced in range)
    if (entry.removedInVersion) {
      if (versionInRange(entry.removedInVersion, currentVersion, latestVersion)) {
        removedTools.push(toolName);
      }
    }
  }

  newTools.sort();
  removedTools.sort();

  const recommendation = buildRecommendation(currentVersion, latestVersion, newTools, removedTools);

  return {
    new_tools: newTools,
    removed_tools: removedTools,
    capability_delta_recommendation: recommendation,
  };
}

function buildRecommendation(
  currentVersion: string,
  latestVersion: string,
  newTools: string[],
  removedTools: string[]
): string {
  const parts: string[] = [`Upgrade from ${currentVersion} to ${latestVersion}`];

  if (newTools.length > 0) {
    const toolList = newTools.join(", ");
    parts.push(`then extend your integration to use: ${toolList}`);
  }

  if (removedTools.length > 0) {
    const toolList = removedTools.join(", ");
    parts.push(`and remove calls to deprecated tools: ${toolList}`);
  }

  return parts.join("; ") + ".";
}

/**
 * Load the capability manifest from the committed JSON file.
 *
 * Returns null if the file cannot be read (e.g. stripped bundles).
 * The caller should degrade gracefully on null.
 */
export async function loadCapabilityManifest(
  projectRoot: string
): Promise<CapabilityManifest | null> {
  try {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const manifestPath = join(projectRoot, "src/shared/capability_manifest.json");
    const raw = readFileSync(manifestPath, "utf-8");
    return JSON.parse(raw) as CapabilityManifest;
  } catch {
    return null;
  }
}
