#!/usr/bin/env node
/**
 * Wipe Local SQLite Database
 *
 * Deletes the local SQLite database file (and optionally raw sources, event logs).
 * A fresh DB will be created on next server start.
 * WARNING: This is destructive and cannot be undone!
 *
 * Usage:
 *   node scripts/wipe-local-database.js [--confirm] [--storage]
 *   node scripts/wipe-local-database.js --env production [--storage]
 *
 * Options:
 *   --confirm    Skip confirmation prompt (dev only; prod always requires typing "wipe production")
 *   --storage    Also remove raw sources and logs (env-specific: data/sources or data/sources_prod, data/logs or data/logs_prod; includes events.log)
 *   --env production  Target production DB (neotoma.prod.db). Requires typing "wipe production" to confirm.
 */

import { config } from "dotenv";
import { join, resolve } from "path";
import { existsSync, unlinkSync, rmSync, readdirSync, readFileSync } from "fs";
import readline from "readline";

// Parse --env early to load correct env file
const args = process.argv.slice(2);
const envIdx = args.indexOf("--env");
const envVal = envIdx >= 0 ? args[envIdx + 1] : null;
const targetProd = envVal === "production" || envVal === "prod";

config(); // Load .env
if (targetProd) {
  config({ path: join(process.cwd(), ".env.production"), override: true });
}

function resolvePaths(targetProd) {
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
  const isProd = targetProd || (process.env.NEOTOMA_ENV || "development") === "production";
  const defaultDbFile = isProd ? "neotoma.prod.db" : "neotoma.db";
  const rawStorageSubdir = isProd ? "sources_prod" : "sources";
  const logsSubdir = isProd ? "logs_prod" : "logs";
  const sqlitePath = join(dataDir, defaultDbFile);
  const rawStorageDir =
    process.env.NEOTOMA_RAW_STORAGE_DIR || join(dataDir, rawStorageSubdir);
  const logsDir = process.env.NEOTOMA_LOGS_DIR || join(dataDir, logsSubdir);
  return {
    sqlitePath: resolve(process.cwd(), sqlitePath),
    rawStorageDir: resolve(process.cwd(), rawStorageDir),
    logsDir: resolve(process.cwd(), logsDir),
  };
}

function askConfirmation(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "yes" || answer.toLowerCase() === "y");
    });
  });
}

function askProductionConfirmation(question, required) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim() === required);
    });
  });
}

function safeUnlink(path) {
  if (existsSync(path)) {
    unlinkSync(path);
    return true;
  }
  return false;
}

function clearDirectory(dirPath) {
  if (!existsSync(dirPath)) return { removed: 0 };
  const entries = readdirSync(dirPath, { withFileTypes: true });
  let removed = 0;
  for (const e of entries) {
    const full = join(dirPath, e.name);
    if (e.isDirectory()) {
      rmSync(full, { recursive: true });
      removed++;
    } else {
      unlinkSync(full);
      removed++;
    }
  }
  return { removed };
}

async function wipeLocal() {
  const skipConfirm = args.includes("--confirm");
  const clearStorage = args.includes("--storage");
  const envIdx2 = args.indexOf("--env");
  const envVal2 = envIdx2 >= 0 ? args[envIdx2 + 1] : null;
  const targetProdRun = envVal2 === "production" || envVal2 === "prod";

  console.log(
    targetProdRun
      ? "🗑️  Neotoma Local Production Database Wipe\n"
      : "🗑️  Neotoma Local Dev Database Wipe\n"
  );

  const { sqlitePath, rawStorageDir, logsDir } = resolvePaths(targetProdRun);

  if (!existsSync(sqlitePath)) {
    console.log(`Database not found at ${sqlitePath}. Nothing to wipe.`);
    process.exit(0);
  }

  if (targetProdRun) {
    console.log("⚠️  WARNING: You are about to wipe the LOCAL PRODUCTION database!");
    console.log(`   Path: ${sqlitePath}`);
    console.log("   This cannot be undone.\n");
    const confirmed = await askProductionConfirmation(
      "Type 'wipe production' to continue: ",
      "wipe production"
    );
    if (!confirmed) {
      console.log("\n❌ Operation cancelled.");
      process.exit(0);
    }
    console.log();
  } else if (!skipConfirm) {
    console.log("⚠️  WARNING: This will delete the local database!");
    console.log(`   Path: ${sqlitePath}`);
    console.log("   This cannot be undone.\n");
    const confirmed = await askConfirmation("Type 'yes' to continue: ");
    if (!confirmed) {
      console.log("\n❌ Operation cancelled.");
      process.exit(0);
    }
    console.log();
  }

  let dbRemoved = false;
  if (safeUnlink(sqlitePath)) {
    console.log(`  ✅ Removed ${sqlitePath}`);
    dbRemoved = true;
  }
  if (safeUnlink(sqlitePath + "-wal")) {
    console.log(`  ✅ Removed ${sqlitePath}-wal`);
  }
  if (safeUnlink(sqlitePath + "-shm")) {
    console.log(`  ✅ Removed ${sqlitePath}-shm`);
  }

  if (!dbRemoved) {
    console.log("  ⚠️  Database file was not found or could not be removed.");
  }

  if (clearStorage) {
    const src = clearDirectory(rawStorageDir);
    console.log(`  ✅ Cleared raw sources (${src.removed} items): ${rawStorageDir}`);
    const log = clearDirectory(logsDir);
    console.log(`  ✅ Cleared logs (${log.removed} items): ${logsDir}`);
  } else {
    console.log("\n💡 Tip: Use --storage to also remove data/sources and data/logs");
  }

  if (dbRemoved) {
    console.log("\n✨ Local database wiped. A fresh DB will be created on next server start.");
  }
}

wipeLocal().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
