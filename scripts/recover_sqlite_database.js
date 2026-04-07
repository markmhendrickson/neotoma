#!/usr/bin/env node
/**
 * Neotoma SQLite integrity check and optional `.recover` salvage.
 *
 * Requires `sqlite3` CLI (macOS: preinstalled; elsewhere: install sqlite-tools).
 *
 * Usage:
 *   node scripts/recover_sqlite_database.js [--env production|development]
 *   node scripts/recover_sqlite_database.js --recover [--env production]
 *
 * Options:
 *   --env production   Use neotoma.prod.db (default if NEOTOMA_ENV=production)
 *   --recover          Write sibling file `<basename>.recovered-<timestamp>.db` via SQLite `.recover`
 *   --output <path>    Recovery output path (default: auto next to source DB)
 *
 * Before --recover: stop all Neotoma processes (MCP, API) so the DB is not open for write.
 * After recovery: verify `PRAGMA integrity_check` on the new file, then swap manually or restore from backup.
 *
 * Does not modify the source database. Does not auto-replace the live file.
 */

import { config } from "dotenv";
import { join, resolve, dirname, basename } from "path";
import { existsSync, readFileSync } from "fs";
import { execFileSync, execSync } from "child_process";

const args = process.argv.slice(2);
const envIdx = args.indexOf("--env");
const envVal = envIdx >= 0 ? args[args.indexOf("--env") + 1] : null;
const targetProd =
  envVal === "production" ||
  envVal === "prod" ||
  (process.env.NEOTOMA_ENV || "development") === "production";
const doRecover = args.includes("--recover");
const outIdx = args.indexOf("--output");
const outputArg = outIdx >= 0 ? args[outIdx + 1] : null;

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Usage: node scripts/recover_sqlite_database.js [--env production] [--recover] [--output <path>]

  --env production   Target neotoma.prod.db
  --recover          Run sqlite3 .recover into a new file (stop Neotoma first)
  --output <path>    Recovery output path (default: auto)
`);
  process.exit(0);
}

config();
if (targetProd) {
  config({ path: join(process.cwd(), ".env.production"), override: true });
}

function hydrateDataDirFromUserEnv() {
  if (process.env.NEOTOMA_DATA_DIR?.trim()) return;
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return;
  const p = join(home, ".config", "neotoma", ".env");
  if (!existsSync(p)) return;
  try {
    const raw = readFileSync(p, "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (t.startsWith("#") || !t.includes("=")) continue;
      const idx = t.indexOf("=");
      const key = t.slice(0, idx).trim();
      if (key !== "NEOTOMA_DATA_DIR") continue;
      let v = t.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env.NEOTOMA_DATA_DIR = v;
      break;
    }
  } catch {
    /* ignore */
  }
}

function resolveSqlitePath() {
  hydrateDataDirFromUserEnv();
  let projectRoot = process.env.NEOTOMA_PROJECT_ROOT;
  if (!projectRoot) {
    try {
      const pkgPath = join(process.cwd(), "package.json");
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.name === "neotoma") projectRoot = process.cwd();
    } catch {
      projectRoot = process.cwd();
    }
  }
  const dataDir = process.env.NEOTOMA_DATA_DIR || join(projectRoot || process.cwd(), "data");
  const isProd = targetProd;
  const defaultDbFile = isProd ? "neotoma.prod.db" : "neotoma.db";
  const sqlitePath = join(dataDir, defaultDbFile);
  return resolve(sqlitePath);
}

function sqlite3Version() {
  try {
    return execFileSync("sqlite3", ["--version"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function integrityCheck(dbPath) {
  try {
    const out = execFileSync("sqlite3", [dbPath, "PRAGMA integrity_check;"], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    const trimmed = out.trim();
    const lines = trimmed.split(/\r?\n/).filter(Boolean);
    const healthy = lines.length === 1 && lines[0] === "ok";
    return { healthy, output: trimmed };
  } catch (e) {
    const stderr = e.stderr?.toString?.() || "";
    const stdout = e.stdout?.toString?.() || "";
    return {
      healthy: false,
      output: (stdout + stderr).trim() || String(e.message),
    };
  }
}

const dbPath = resolveSqlitePath();

if (!existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}`);
  process.exit(1);
}

const ver = sqlite3Version();
if (!ver) {
  console.error("sqlite3 CLI not found in PATH. Install SQLite command-line tools.");
  process.exit(1);
}

console.log(`sqlite3: ${ver}`);
console.log(`Database: ${dbPath}`);

const check = integrityCheck(dbPath);

if (check.healthy) {
  console.log("PRAGMA integrity_check: ok");
  process.exit(0);
}

console.error("PRAGMA integrity_check: not ok");
console.error(check.output);

if (!doRecover) {
  console.error("\nRun with --recover to write a new database via SQLite .recover (stop Neotoma first).");
  process.exit(2);
}

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const defaultOut = join(
  dirname(dbPath),
  `${basename(dbPath, ".db")}.recovered-${ts}.db`,
);
const outPath = outputArg ? resolve(outputArg) : defaultOut;

console.log(`\nRecovering (read-only source) -> ${outPath}`);
console.log("If this hangs or errors, ensure no process holds the database for write.\n");

const srcUri = `file:${dbPath}?mode=ro`;
try {
  execSync(`sqlite3 "${srcUri}" ".recover" | sqlite3 "${outPath}"`, {
    shell: true,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (e) {
  console.error("Recovery command failed:", e.message);
  process.exit(3);
}

const verify = integrityCheck(outPath);

if (!verify.healthy) {
  console.error("Recovered file failed integrity_check:");
  console.error(verify.output);
  process.exit(4);
}

console.log(`Recovered file OK: ${outPath}`);
console.log("\nNext steps (manual):");
console.log("  1. Stop Neotoma (MCP + API).");
console.log(`  2. Move aside live DB + -wal + -shm: mv ${dirname(dbPath)}/neotoma*.db-wal ... backup dir (if present)`);
console.log(`  3. cp "${outPath}" "${dbPath}"`);
console.log("  4. Start Neotoma; re-ingest critical rows from sqlite lost_and_found if you dropped it earlier.");
console.log("See .cursor/skills/recover-sqlite-database/SKILL.md for agent workflow.");
