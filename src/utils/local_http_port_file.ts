/**
 * Writes the TCP port the HTTP Actions server actually bound to, under the repo
 * root at `.dev-serve/local_http_port_<dev|prod>` (gitignored). MCP launcher scripts
 * read these so parallel dev + prod APIs do not clobber each other.
 *
 * Legacy `.dev-serve/local_http_port` is still written when the API is **dev**
 * (non-production) for older Cursor configs that omit `NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import { dirname, join } from "node:path";

import { logger } from "./logger.js";

/** Relative to Neotoma `projectRoot`; directory is `.gitignore`d as `.dev-serve/`. */
export const LOCAL_HTTP_PORT_FILE_SEGMENTS = [".dev-serve", "local_http_port"] as const;

/** Disk profile for parallel dev/prod local HTTP servers. */
export type LocalHttpPortDiskProfile = "dev" | "prod";

export function neotomaEnvironmentToDiskProfile(environment: string): LocalHttpPortDiskProfile {
  return environment === "production" ? "prod" : "dev";
}

export function localHttpPortFilePath(projectRoot: string): string {
  return join(projectRoot, ...LOCAL_HTTP_PORT_FILE_SEGMENTS);
}

export function localHttpPortFilePathForProfile(
  projectRoot: string,
  profile: LocalHttpPortDiskProfile
): string {
  return join(projectRoot, ".dev-serve", `local_http_port_${profile}`);
}

function readPortFromFilePath(filePath: string): Promise<number | null> {
  return fs
    .readFile(filePath, "utf-8")
    .then((raw) => {
      const firstLine = raw.split(/\r?\n/)[0]?.trim() ?? "";
      const port = Number.parseInt(firstLine, 10);
      if (!Number.isFinite(port) || port < 1 || port > 65535) return null;
      return port;
    })
    .catch(() => null);
}

/**
 * Writes profile-specific port files after HTTP bind. Dev also mirrors the legacy
 * `local_http_port` path so existing MCP configs keep working.
 */
export function writeLocalHttpPortFile(
  projectRoot: string,
  port: number,
  environment: string = "development"
): void {
  if (!Number.isFinite(port) || port < 1 || port > 65535) return;
  const profile = neotomaEnvironmentToDiskProfile(environment);
  const profilePath = localHttpPortFilePathForProfile(projectRoot, profile);
  try {
    mkdirSync(dirname(profilePath), { recursive: true });
    writeFileSync(profilePath, `${Math.trunc(port)}\n`, "utf-8");
  } catch (err) {
    logger.warn(
      `[local_http_port_file] failed to write ${profilePath}: ${(err as Error).message}`,
    );
  }
  if (profile === "dev") {
    const legacyPath = localHttpPortFilePath(projectRoot);
    try {
      mkdirSync(dirname(legacyPath), { recursive: true });
      writeFileSync(legacyPath, `${Math.trunc(port)}\n`, "utf-8");
    } catch (err) {
      logger.warn(
        `[local_http_port_file] failed to write legacy ${legacyPath}: ${(err as Error).message}`,
      );
    }
  }
}

/**
 * Resolves which port file(s) to read for MCP / CLI when `NEOTOMA_MCP_USE_LOCAL_PORT_FILE` is on.
 *
 * Precedence for choosing **profile**:
 * 1. `NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE` = `dev` | `prod`
 * 2. Else `NEOTOMA_ENV` → production → prod, otherwise dev
 *
 * Read order:
 * - **prod**: `local_http_port_prod` only
 * - **dev**: `local_http_port_dev`, then legacy `local_http_port`
 */
export async function readLocalHttpPortFromFile(projectRoot: string): Promise<number | null> {
  const explicit = process.env.NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE?.trim().toLowerCase();
  const profile: LocalHttpPortDiskProfile =
    explicit === "prod"
      ? "prod"
      : explicit === "dev"
        ? "dev"
        : neotomaEnvironmentToDiskProfile(process.env.NEOTOMA_ENV || "development");

  const paths: string[] =
    profile === "prod"
      ? [localHttpPortFilePathForProfile(projectRoot, "prod")]
      : [
          localHttpPortFilePathForProfile(projectRoot, "dev"),
          localHttpPortFilePath(projectRoot),
        ];

  for (const filePath of paths) {
    const port = await readPortFromFilePath(filePath);
    if (port != null) return port;
  }
  return null;
}
