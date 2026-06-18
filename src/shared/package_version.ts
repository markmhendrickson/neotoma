/**
 * Shared utility for reading the Neotoma package version at runtime.
 *
 * Used by both the MCP initialize handler (src/server.ts) and the Smithery
 * server card (src/mcp_server_card.ts) to report the real package.json version
 * in the MCP serverInfo.version field.  Having a single source of truth here
 * means all three initialize paths (McpServer ctor, auth-needed, and
 * authenticated/update-notice) always agree on the version string.
 *
 * Resolves package.json relative to the package root supplied by the caller so
 * that both the server entry-point context and the server-card context find the
 * same file regardless of the working directory at runtime.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Read the `version` field from package.json at `packageRoot`.
 *
 * Returns `"0.0.0"` if the file cannot be read or the version field is absent,
 * so callers always get a valid semver-shaped string even in unusual
 * environments (e.g. running from a transpiled bundle that stripped package.json).
 *
 * @param packageRoot  Absolute path to the directory that contains package.json.
 */
export function readPackageVersion(packageRoot: string): string {
  try {
    const pkgPath = join(packageRoot, "package.json");
    const parsed = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };
    return typeof parsed.version === "string" ? parsed.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}
