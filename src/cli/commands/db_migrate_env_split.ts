/**
 * `neotoma db migrate-env-split` — detect and repair dev/prod database splits.
 *
 * The problem: before v0.13.x, npm-installed Neotoma defaulted to the development
 * database (neotoma.db) instead of the production database (neotoma.prod.db).
 * Agents using the CLI could accumulate real user data in the wrong file.
 *
 * The command:
 *   1. Inspects both DB files for user-contributed row counts (observations, sources,
 *      entities via snapshots).
 *   2. In the common case (dev has data, prod is empty/absent): atomically renames
 *      dev → prod after writing a timestamped backup.
 *   3. In the merge case (both have data): refuses and emits clear instructions —
 *      full merge is a separate, more invasive operation.
 *   4. --dry-run always safe; --yes required to write anything.
 *   5. Idempotent: re-running after a successful migration reports "no action needed".
 */

import { existsSync, copyFileSync, renameSync } from "node:fs";
import path from "node:path";

export interface DbInfo {
  path: string;
  exists: boolean;
  /** User-contributed observation rows (excludes bootstrap schema seeds). */
  observation_count: number;
  /** Rows in the snapshots table (proxy for distinct entities with data). */
  snapshot_count: number;
  /** Rows in the sources table. */
  source_count: number;
}

export type EnvSplitStatus =
  | "no_data"           // Neither DB has user data — nothing to do.
  | "prod_only"         // Prod has data, dev empty/absent — already correct.
  | "dev_only"          // Dev has data, prod empty/absent — rename candidate.
  | "both_have_data"    // Both have user data — manual merge required.
  | "dev_empty_prod_empty"; // Both exist but both empty — nothing to do.

export interface EnvSplitReport {
  status: EnvSplitStatus;
  dev: DbInfo;
  prod: DbInfo;
  /** Set when status === "dev_only": path the dev DB would be renamed to. */
  rename_target?: string;
  /** Set when status === "dev_only": backup path written before rename. */
  backup_path?: string;
}

export interface MigrateEnvSplitResult extends EnvSplitReport {
  action_taken: "none" | "renamed" | "dry_run_would_rename";
  backup_written: boolean;
  renamed: boolean;
}

import { createRequire } from "node:module";

const _nodeRequire = createRequire(import.meta.url);

type SimpleDb = {
  prepare: (sql: string) => { get: (...p: unknown[]) => unknown };
  close?: () => void;
};

function openDb(dbPath: string): SimpleDb {
  try {
    const native = _nodeRequire("node:sqlite") as { DatabaseSync: new (path: string) => SimpleDb };
    return new native.DatabaseSync(dbPath);
  } catch {
    const bsq = _nodeRequire("better-sqlite3") as new (path: string) => SimpleDb;
    return new bsq(dbPath);
  }
}

/** Count user-contributed rows in a SQLite file without starting the full API. */
function inspectDb(dbPath: string): Omit<DbInfo, "path" | "exists"> {
  let db: SimpleDb | null = null;
  try {
    db = openDb(dbPath);
    const count = (sql: string): number => {
      try {
        const row = db!.prepare(sql).get() as { n: number } | undefined;
        return row?.n ?? 0;
      } catch {
        return 0;
      }
    };
    const observation_count = count("SELECT COUNT(*) AS n FROM observations");
    const snapshot_count = count("SELECT COUNT(*) AS n FROM entity_snapshots");
    const source_count = count("SELECT COUNT(*) AS n FROM sources");
    return { observation_count, snapshot_count, source_count };
  } catch {
    return { observation_count: 0, snapshot_count: 0, source_count: 0 };
  } finally {
    try { db?.close?.(); } catch { /* ignore */ }
  }
}

/** Build DbInfo for both DB files in the given dataDir. */
export function inspectEnvSplit(dataDir: string): EnvSplitReport {
  const devPath = path.join(dataDir, "neotoma.db");
  const prodPath = path.join(dataDir, "neotoma.prod.db");

  const devExists = existsSync(devPath);
  const prodExists = existsSync(prodPath);

  const devCounts = devExists ? inspectDb(devPath) : { observation_count: 0, snapshot_count: 0, source_count: 0 };
  const prodCounts = prodExists ? inspectDb(prodPath) : { observation_count: 0, snapshot_count: 0, source_count: 0 };

  const dev: DbInfo = { path: devPath, exists: devExists, ...devCounts };
  const prod: DbInfo = { path: prodPath, exists: prodExists, ...prodCounts };

  const devHasData = dev.observation_count > 0 || dev.source_count > 0;
  const prodHasData = prod.observation_count > 0 || prod.source_count > 0;

  let status: EnvSplitStatus;
  if (!devHasData && !prodHasData) {
    status = devExists || prodExists ? "dev_empty_prod_empty" : "no_data";
  } else if (devHasData && prodHasData) {
    status = "both_have_data";
  } else if (devHasData) {
    status = "dev_only";
  } else {
    status = "prod_only";
  }

  const report: EnvSplitReport = { status, dev, prod };

  if (status === "dev_only") {
    report.rename_target = prodPath;
    report.backup_path = path.join(dataDir, `neotoma.db.bak.${Date.now()}`);
  }

  return report;
}

/** Format a count line for human output. */
function fmtCounts(info: DbInfo): string {
  if (!info.exists) return "  (file does not exist)";
  if (info.observation_count === 0 && info.source_count === 0) return "  0 observations, 0 sources (empty)";
  return `  ${info.observation_count} observations, ${info.source_count} sources, ${info.snapshot_count} snapshots`;
}

export interface MigrateEnvSplitOptions {
  dataDir: string;
  dryRun: boolean;
  yes: boolean;
  /** Injected for tests to capture output without hitting stdout. */
  write?: (s: string) => void;
}

/**
 * Detect and (optionally) repair a dev/prod env split.
 * Returns a structured result for programmatic callers (tests, JSON output).
 */
export async function migrateEnvSplit(opts: MigrateEnvSplitOptions): Promise<MigrateEnvSplitResult> {
  const out = opts.write ?? ((s: string) => process.stdout.write(s));
  const report = inspectEnvSplit(opts.dataDir);
  const { status, dev, prod } = report;

  out(`neotoma db migrate-env-split\n`);
  out(`Data directory: ${opts.dataDir}\n\n`);
  out(`dev  (neotoma.db):      ${fmtCounts(dev)}\n`);
  out(`prod (neotoma.prod.db): ${fmtCounts(prod)}\n\n`);

  const base: Omit<MigrateEnvSplitResult, "action_taken" | "backup_written" | "renamed"> = {
    ...report,
  };

  if (status === "no_data" || status === "dev_empty_prod_empty") {
    out(`Status: no user data found in either database. Nothing to migrate.\n`);
    return { ...base, action_taken: "none", backup_written: false, renamed: false };
  }

  if (status === "prod_only") {
    out(`Status: production database already has data and dev database is empty.\n`);
    out(`No migration needed.\n`);
    return { ...base, action_taken: "none", backup_written: false, renamed: false };
  }

  if (status === "both_have_data") {
    out(`Status: BOTH databases have user data.\n\n`);
    out(`Automatic migration is not safe when both files contain data, because merging\n`);
    out(`two SQLite databases requires replaying all observations through the reducer\n`);
    out(`to recompute correct snapshots.\n\n`);
    out(`Options:\n`);
    out(`  1. If neotoma.prod.db has the data you want to keep and neotoma.db can be\n`);
    out(`     discarded, delete neotoma.db manually and re-run this command.\n`);
    out(`  2. If neotoma.db has the data you want to keep and neotoma.prod.db can be\n`);
    out(`     discarded, delete neotoma.prod.db manually and re-run this command.\n`);
    out(`  3. File a GitHub issue at https://github.com/anthropic/neotoma/issues to\n`);
    out(`     request a merge tool — include approximate row counts from above.\n`);
    return { ...base, action_taken: "none", backup_written: false, renamed: false };
  }

  // status === "dev_only": the common case — rename dev → prod.
  out(`Status: dev database has data; prod database is empty or absent.\n`);
  out(`This is the common pattern for users who ran Neotoma before v0.13.x.\n\n`);
  out(`Plan:\n`);
  out(`  1. Write backup: ${report.backup_path}\n`);
  out(`  2. Rename:       ${dev.path}\n`);
  out(`             →     ${report.rename_target}\n\n`);

  if (opts.dryRun) {
    out(`--dry-run: no files written.\n`);
    out(`Re-run with --yes to execute.\n`);
    return { ...base, action_taken: "dry_run_would_rename", backup_written: false, renamed: false };
  }

  if (!opts.yes) {
    out(`--yes not passed. Re-run with --yes to execute, or use --dry-run to preview.\n`);
    return { ...base, action_taken: "none", backup_written: false, renamed: false };
  }

  // Write backup then rename atomically.
  try {
    copyFileSync(dev.path, report.backup_path!);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    out(`Error writing backup: ${msg}\n`);
    out(`Migration aborted — no files changed.\n`);
    return { ...base, action_taken: "none", backup_written: false, renamed: false };
  }

  out(`Backup written.\n`);

  try {
    renameSync(dev.path, report.rename_target!);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    out(`Error renaming database: ${msg}\n`);
    out(`Backup preserved at: ${report.backup_path}\n`);
    out(`Migration failed. Your data is intact in the dev database.\n`);
    return { ...base, action_taken: "none", backup_written: true, renamed: false };
  }

  out(`Migration complete.\n`);
  out(`Your data is now in: ${report.rename_target}\n`);
  out(`Backup retained at:  ${report.backup_path}\n\n`);
  out(`You can delete the backup once you have verified your data:\n`);
  out(`  rm "${report.backup_path}"\n`);

  return { ...base, action_taken: "renamed", backup_written: true, renamed: true };
}

/** Lightweight summary for use in doctor output and startup warnings. */
export interface EnvSplitWarning {
  has_split: boolean;
  dev_observations: number;
  dev_sources: number;
  prod_observations: number;
  prod_sources: number;
  suggested_action: string | null;
}

export function detectEnvSplitWarning(dataDir: string): EnvSplitWarning {
  const devPath = path.join(dataDir, "neotoma.db");
  const prodPath = path.join(dataDir, "neotoma.prod.db");

  const devExists = existsSync(devPath);
  const prodExists = existsSync(prodPath);

  if (!devExists) {
    return { has_split: false, dev_observations: 0, dev_sources: 0, prod_observations: 0, prod_sources: 0, suggested_action: null };
  }

  const devCounts = inspectDb(devPath);
  const prodCounts = prodExists ? inspectDb(prodPath) : { observation_count: 0, source_count: 0, snapshot_count: 0 };

  const devHasData = devCounts.observation_count > 0 || devCounts.source_count > 0;
  const prodHasData = prodCounts.observation_count > 0 || prodCounts.source_count > 0;

  if (!devHasData) {
    return { has_split: false, dev_observations: 0, dev_sources: 0, prod_observations: prodCounts.observation_count, prod_sources: prodCounts.source_count, suggested_action: null };
  }

  const has_split = !prodHasData; // dev has data, prod is empty → wrong DB
  return {
    has_split,
    dev_observations: devCounts.observation_count,
    dev_sources: devCounts.source_count,
    prod_observations: prodCounts.observation_count,
    prod_sources: prodCounts.source_count,
    suggested_action: has_split
      ? `Run: neotoma db migrate-env-split --dry-run`
      : null,
  };
}
