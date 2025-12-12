#!/usr/bin/env node

/**
 * Print migration SQL for manual execution
 *
 * Outputs all migration SQL files in order for easy copy-paste into Supabase SQL Editor
 */

import { readFile, readdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "../supabase/migrations");

async function printMigrations() {
  const files = await readdir(MIGRATIONS_DIR);
  const migrationFiles = files.filter((f) => f.endsWith(".sql")).sort();

  if (migrationFiles.length === 0) {
    console.log("No migration files found");
    return;
  }

  console.log("=".repeat(80));
  console.log("SUPABASE MIGRATIONS - COPY AND PASTE INTO SUPABASE SQL EDITOR");
  console.log("=".repeat(80));
  console.log(
    "\nGo to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new\n"
  );
  console.log("=".repeat(80));
  console.log("\n");

  for (let i = 0; i < migrationFiles.length; i++) {
    const file = migrationFiles[i];
    const sqlPath = join(MIGRATIONS_DIR, file);
    const sql = await readFile(sqlPath, "utf-8");

    console.log(`-- Migration ${i + 1}/${migrationFiles.length}: ${file}`);
    console.log("-- " + "=".repeat(76));
    console.log(sql);
    console.log("\n");
    console.log("-- " + "=".repeat(76));
    console.log(
      `-- End of migration ${i + 1}/${migrationFiles.length}: ${file}`
    );
    console.log("\n\n");
  }

  console.log("=".repeat(80));
  console.log("END OF MIGRATIONS");
  console.log("=".repeat(80));
}

printMigrations().catch(console.error);






