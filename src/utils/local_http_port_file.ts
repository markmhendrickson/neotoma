/**
 * Writes the TCP port the HTTP Actions server actually bound to, under the repo
 * root at `.dev-serve/local_http_port` (gitignored). MCP launcher scripts can read
 * this file so Cursor `mcp.json` stays stable while `pick-port` / EADDRINUSE
 * retries use another port.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import { dirname, join } from "node:path";

import { logger } from "./logger.js";

/** Relative to Neotoma `projectRoot`; directory is `.gitignore`d as `.dev-serve/`. */
export const LOCAL_HTTP_PORT_FILE_SEGMENTS = [".dev-serve", "local_http_port"] as const;

export function localHttpPortFilePath(projectRoot: string): string {
  return join(projectRoot, ...LOCAL_HTTP_PORT_FILE_SEGMENTS);
}

export function writeLocalHttpPortFile(projectRoot: string, port: number): void {
  if (!Number.isFinite(port) || port < 1 || port > 65535) return;
  const filePath = localHttpPortFilePath(projectRoot);
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${Math.trunc(port)}\n`, "utf-8");
  } catch (err) {
    logger.warn(
      `[local_http_port_file] failed to write ${filePath}: ${(err as Error).message}`,
    );
  }
}

/**
 * Reads the bound HTTP port written by the dev API (see `writeLocalHttpPortFile`).
 * Returns null if the file is missing, unreadable, or does not contain a valid port.
 */
export async function readLocalHttpPortFromFile(projectRoot: string): Promise<number | null> {
  const filePath = localHttpPortFilePath(projectRoot);
  try {
    const raw = (await fs.readFile(filePath, "utf-8")).trim();
    const firstLine = raw.split(/\r?\n/)[0]?.trim() ?? "";
    const port = Number.parseInt(firstLine, 10);
    if (!Number.isFinite(port) || port < 1 || port > 65535) return null;
    return port;
  } catch {
    return null;
  }
}
