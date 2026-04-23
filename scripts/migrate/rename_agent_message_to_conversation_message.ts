/**
 * Phase 2 migration: rename historical `agent_message` rows to
 * `conversation_message` so entity_type filters in read paths no longer need
 * the alias fallback.
 *
 * Safe to re-run. Only rewrites rows whose current entity_type is literally
 * `agent_message`. Observations carrying the legacy type are also rewritten
 * so snapshot rebuilds stay consistent.
 *
 * This script is opt-in. Run it after upgrading a Neotoma instance that
 * stored rows under the pre-v0.6 `agent_message` entity_type.
 *
 * Usage (from a local Neotoma checkout):
 *
 *   npx tsx scripts/migrate/rename_agent_message_to_conversation_message.ts \
 *     --data-dir <path-to-neotoma-data-dir> \
 *     [--dry-run]
 *
 * Defaults `--data-dir` to `NEOTOMA_DATA_DIR` when set, otherwise the local
 * `data/` directory of the checkout. `--dry-run` prints the counts without
 * writing anything.
 *
 * Pipes through the CLI as `neotoma migrate message-rename` as well; see
 * `docs/developer/cli_reference.md`.
 */

import path from "node:path";
import process from "node:process";
import Database from "../../src/repositories/sqlite/sqlite_driver.js";

interface CliArgs {
  dataDir: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    dataDir:
      process.env.NEOTOMA_DATA_DIR ??
      path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "data"),
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--data-dir" && argv[i + 1]) {
      args.dataDir = argv[i + 1]!;
      i += 1;
      continue;
    }
    if (a === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (a === "--help" || a === "-h") {
      process.stdout.write(
        `Usage: rename_agent_message_to_conversation_message.ts [--data-dir <path>] [--dry-run]\n`,
      );
      process.exit(0);
    }
  }
  return args;
}

interface CountRow {
  n: number;
}

function main(): void {
  const { dataDir, dryRun } = parseArgs(process.argv.slice(2));
  const dbPath = path.join(dataDir, "neotoma.db");
  const db = new Database(dbPath);

  try {
    const beforeEntities = (db
      .prepare("SELECT COUNT(*) AS n FROM entities WHERE entity_type = ?")
      .get("agent_message") as CountRow | undefined)?.n ?? 0;
    const beforeObservations = (db
      .prepare("SELECT COUNT(*) AS n FROM observations WHERE entity_type = ?")
      .get("agent_message") as CountRow | undefined)?.n ?? 0;

    process.stdout.write(
      `[migrate] Found ${beforeEntities} entities and ${beforeObservations} observations with entity_type='agent_message'.\n`,
    );

    if (beforeEntities === 0 && beforeObservations === 0) {
      process.stdout.write("[migrate] Nothing to do.\n");
      return;
    }

    if (dryRun) {
      process.stdout.write("[migrate] --dry-run set; no rows written.\n");
      return;
    }

    const tx = db.transaction(() => {
      db.prepare(
        "UPDATE entities SET entity_type = ? WHERE entity_type = ?",
      ).run("conversation_message", "agent_message");
      db.prepare(
        "UPDATE observations SET entity_type = ? WHERE entity_type = ?",
      ).run("conversation_message", "agent_message");
    });
    tx();

    const afterEntities = (db
      .prepare("SELECT COUNT(*) AS n FROM entities WHERE entity_type = ?")
      .get("agent_message") as CountRow | undefined)?.n ?? 0;
    const afterObservations = (db
      .prepare("SELECT COUNT(*) AS n FROM observations WHERE entity_type = ?")
      .get("agent_message") as CountRow | undefined)?.n ?? 0;

    process.stdout.write(
      `[migrate] Rewrote ${beforeEntities - afterEntities} entities and ${beforeObservations - afterObservations} observations to entity_type='conversation_message'.\n`,
    );
    if (afterEntities > 0 || afterObservations > 0) {
      process.stderr.write(
        `[migrate] WARNING: ${afterEntities} entity rows and ${afterObservations} observation rows still carry entity_type='agent_message'. Re-run or inspect manually.\n`,
      );
      process.exitCode = 1;
    }
  } finally {
    db.close();
  }
}

main();
