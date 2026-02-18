/**
 * Shared version check for CLI and MCP: query npm registry, compare semver,
 * format upgrade command. Never throws; returns null on registry failure.
 */

import semver from "semver";

const REGISTRY_DIST_TAGS = "https://registry.npmjs.org/-/package";

/**
 * Fetch latest version for a package from npm registry (dist-tags).
 * On failure (network, non-2xx) returns null; never throws.
 */
export async function getLatestFromRegistry(
  packageName: string,
  distTag: string = "latest"
): Promise<string | null> {
  try {
    const url = `${REGISTRY_DIST_TAGS}/${encodeURIComponent(packageName)}/dist-tags`;
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, string>;
    const version = data?.[distTag] ?? data?.latest ?? null;
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

/**
 * True if current is a valid semver and is strictly less than latest.
 * Invalid versions yield false.
 */
export function isUpdateAvailable(current: string, latest: string): boolean {
  const c = semver.valid(current);
  const l = semver.valid(latest);
  if (!c || !l) return false;
  return semver.lt(c, l);
}

/**
 * Format the upgrade command for display.
 * context 'global' => npm i -g <name>@<distTag>
 * context 'npx' => npx <name>@<distTag> ...
 */
export function formatUpgradeCommand(
  packageName: string,
  distTag: string,
  context: "global" | "npx" = "global"
): string {
  if (context === "npx") {
    return `npx ${packageName}@${distTag}`;
  }
  return `npm i -g ${packageName}@${distTag}`;
}
