#!/usr/bin/env tsx
/**
 * Weekly reset for the `sandbox.neotoma.io` Fly deployment.
 *
 * Strategy (keeps the express server up the whole time):
 *  1. Refuse to run unless `NEOTOMA_SANDBOX_MODE=1` — protects non-sandbox
 *     hosts from accidental data loss.
 *  2. Delete the SQLite database files (primary + WAL/SHM) and every file
 *     under `sources/` inside the configured data directory.
 *  3. Re-seed via `seedSandbox()` hitting the server over HTTP so the same
 *     code path that visitors use repopulates entities, observations, and
 *     Agents-directory rows.
 *
 * Scheduled weekly: Sunday 00:00 UTC via Fly Machines. Safe to run manually.
 *
 * Usage:
 *   tsx scripts/reset_sandbox.ts [--base-url http://localhost:3180] [--dry-run]
 *   NEOTOMA_SANDBOX_MODE=1 tsx scripts/reset_sandbox.ts --force
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { seedSandbox, type SeedResult } from "./seed_sandbox.js";

export interface ResetOptions {
  dataDir: string;
  baseUrl: string;
  bearer?: string;
  dryRun?: boolean;
  force?: boolean;
  repoRoot?: string;
  sandboxMode?: string;
  fetchImpl?: typeof fetch;
  logger?: (message: string) => void;
  /**
   * After wiping the on-disk dataset, wait this long before calling the
   * seeder. Real deployment needs a brief gap so the running server can
   * re-initialize its sqlite handles. Default 0 (test-friendly).
   */
  postWipeDelayMs?: number;
}

export interface ResetResult {
  files_removed: number;
  directories_removed: number;
  dry_run: boolean;
  seed: SeedResult | null;
}

function assertSandboxMode(mode: string | undefined, force: boolean): void {
  const normalized = (mode ?? "").toString().trim().toLowerCase();
  const enabled = normalized === "1" || normalized === "true" || normalized === "yes";
  if (!enabled && !force) {
    throw new Error(
      "Refusing to reset: NEOTOMA_SANDBOX_MODE is not set. Pass --force only when you are 100% sure this target is the sandbox host.",
    );
  }
}

async function removeSqliteFiles(dataDir: string, logger: (m: string) => void): Promise<number> {
  let removed = 0;
  // Remove common sqlite files regardless of env (neotoma.db, neotoma.prod.db,
  // their -wal / -shm siblings). Missing files are treated as a no-op.
  const candidates = [
    "neotoma.db",
    "neotoma.db-wal",
    "neotoma.db-shm",
    "neotoma.prod.db",
    "neotoma.prod.db-wal",
    "neotoma.prod.db-shm",
  ];
  for (const name of candidates) {
    const full = path.join(dataDir, name);
    try {
      await fs.unlink(full);
      logger(`removed ${full}`);
      removed++;
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== "ENOENT") throw err;
    }
  }
  return removed;
}

async function removeDirectoryContents(
  dirPath: string,
  logger: (m: string) => void,
): Promise<{ files: number; dirs: number }> {
  let files = 0;
  let dirs = 0;
  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") return { files: 0, dirs: 0 };
    throw err;
  }
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const sub = await removeDirectoryContents(full, logger);
      files += sub.files;
      dirs += sub.dirs;
      await fs.rmdir(full).catch(() => {});
      dirs++;
    } else {
      await fs.unlink(full);
      files++;
    }
  }
  logger(`cleared ${dirPath} (${files} files, ${dirs} dirs)`);
  return { files, dirs };
}

export async function resetSandbox(options: ResetOptions): Promise<ResetResult> {
  const logger = options.logger ?? ((msg: string) => process.stdout.write(msg + "\n"));
  const mode = options.sandboxMode ?? process.env.NEOTOMA_SANDBOX_MODE;
  assertSandboxMode(mode, options.force === true);

  if (options.dryRun) {
    logger(`[dry-run] would wipe sqlite + sources/ under ${options.dataDir}`);
    const seed = await seedSandbox({
      baseUrl: options.baseUrl,
      bearer: options.bearer,
      dryRun: true,
      repoRoot: options.repoRoot,
      fetchImpl: options.fetchImpl,
      logger,
    });
    return { files_removed: 0, directories_removed: 0, dry_run: true, seed };
  }

  const sqliteRemoved = await removeSqliteFiles(options.dataDir, logger);
  const sourcesDir = path.join(options.dataDir, "sources");
  const sources = await removeDirectoryContents(sourcesDir, logger);
  // Leave `sources/` itself in place so the running server can write into it
  // without a re-mkdir. We recreate the dir if it was removed by the loop
  // (it will be if it contained nested user dirs).
  await fs.mkdir(sourcesDir, { recursive: true });

  if (options.postWipeDelayMs && options.postWipeDelayMs > 0) {
    await new Promise((r) => setTimeout(r, options.postWipeDelayMs));
  }

  const seed = await seedSandbox({
    baseUrl: options.baseUrl,
    bearer: options.bearer,
    repoRoot: options.repoRoot,
    fetchImpl: options.fetchImpl,
    logger,
  });

  return {
    files_removed: sqliteRemoved + sources.files,
    directories_removed: sources.dirs,
    dry_run: false,
    seed,
  };
}

function parseArgs(argv: string[]): {
  baseUrl: string;
  dryRun: boolean;
  force: boolean;
  dataDir: string;
} {
  let baseUrl =
    process.env.NEOTOMA_SANDBOX_BASE_URL?.trim() || "http://localhost:3180";
  let dryRun = false;
  let force = false;
  let dataDir = process.env.NEOTOMA_DATA_DIR?.trim() || path.join(process.cwd(), "data");
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--base-url" && argv[i + 1]) {
      baseUrl = argv[i + 1];
      i++;
    } else if (arg === "--data-dir" && argv[i + 1]) {
      dataDir = argv[i + 1];
      i++;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--force") {
      force = true;
    }
  }
  return { baseUrl, dryRun, force, dataDir };
}

function readPostWipeDelayMs(): number | undefined {
  const raw = process.env.NEOTOMA_SANDBOX_POST_WIPE_DELAY_MS?.trim() ?? "";
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

async function main(): Promise<void> {
  const { baseUrl, dryRun, force, dataDir } = parseArgs(process.argv.slice(2));
  const bearer = process.env.NEOTOMA_SANDBOX_BEARER?.trim() || undefined;
  const result = await resetSandbox({
    baseUrl,
    dataDir,
    bearer,
    dryRun,
    force,
    postWipeDelayMs: readPostWipeDelayMs(),
  });
  process.stdout.write(
    JSON.stringify(
      { ok: true, base_url: baseUrl, data_dir: dataDir, ...result },
      null,
      2,
    ) + "\n",
  );
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isMain) {
  main().catch((err) => {
    process.stderr.write(`[reset_sandbox] ${(err as Error).message}\n`);
    process.exit(1);
  });
}
