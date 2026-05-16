/**
 * `neotoma db migrate-encryption` — bidirectional bulk encryption migration.
 *
 * encrypt: reads plaintext values from ENCRYPTED_COLUMNS, writes encrypted values.
 * decrypt: reads encrypted values from ENCRYPTED_COLUMNS, writes plaintext values.
 *
 * The command operates directly on the SQLite file (no running server required)
 * and requires the same key configuration used by the runtime
 * (NEOTOMA_KEY_FILE_PATH or NEOTOMA_MNEMONIC + optional NEOTOMA_MNEMONIC_PASSPHRASE).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import Database, { type SqliteDatabase } from "../../repositories/sqlite/sqlite_driver.js";
import { encryptColumn, decryptColumn, isEncryptedColumn } from "../../crypto/column_encryption.js";
import { deriveKeys, deriveKeysFromMnemonic, hexToKey } from "../../crypto/key_derivation.js";

/** Columns to migrate — mirrors ENCRYPTED_COLUMNS in local_db_adapter.ts. */
const ENCRYPTED_COLUMNS: Record<string, string[]> = {
  observations: ["fields"],
  entity_snapshots: ["snapshot", "provenance"],
  relationship_snapshots: ["snapshot", "provenance"],
  raw_fragments: ["fragment_value", "fragment_envelope"],
  schema_recommendations: [
    "fields_to_add",
    "fields_to_remove",
    "fields_to_modify",
    "converters_to_add",
  ],
  auto_enhancement_queue: ["payload"],
};

type MigrateOpts = {
  direction: "encrypt" | "decrypt";
  dbPath: string;
  keyFilePath?: string;
  mnemonic?: string;
  mnemonicPassphrase?: string;
  dryRun?: boolean;
};

type ColumnResult = { table: string; column: string; processed: number; skipped: number };

function loadDataKey(opts: {
  keyFilePath?: string;
  mnemonic?: string;
  mnemonicPassphrase?: string;
}): Uint8Array {
  const keyFile = opts.keyFilePath ?? process.env.NEOTOMA_KEY_FILE_PATH;
  const mnemonic = opts.mnemonic ?? process.env.NEOTOMA_MNEMONIC;
  const passphrase =
    opts.mnemonicPassphrase ?? process.env.NEOTOMA_MNEMONIC_PASSPHRASE ?? undefined;

  if (keyFile) {
    const raw = readFileSync(keyFile, "utf8").trim();
    return deriveKeys(hexToKey(raw)).dataKey;
  }

  if (mnemonic) {
    return deriveKeysFromMnemonic(mnemonic, passphrase).dataKey;
  }

  throw new Error(
    "No key source found. Set NEOTOMA_KEY_FILE_PATH or NEOTOMA_MNEMONIC, " +
      "or pass --key-file / --mnemonic."
  );
}

function migrateColumn(
  db: SqliteDatabase,
  table: string,
  column: string,
  direction: "encrypt" | "decrypt",
  key: Uint8Array,
  dryRun: boolean
): { processed: number; skipped: number; errors: number } {
  let processed = 0;
  let skipped = 0;
  let errors = 0;

  const rows = db.prepare(`SELECT rowid, ${column} FROM ${table}`).all() as Array<{
    rowid: number;
    [col: string]: unknown;
  }>;

  const update = dryRun ? null : db.prepare(`UPDATE ${table} SET ${column} = ? WHERE rowid = ?`);

  for (const row of rows) {
    const value = row[column];
    if (value === null || value === undefined) {
      skipped++;
      continue;
    }
    const str = typeof value === "string" ? value : null;
    if (str === null) {
      skipped++;
      continue;
    }

    try {
      if (direction === "encrypt") {
        if (isEncryptedColumn(str)) {
          skipped++;
          continue;
        }
        const encrypted = encryptColumn(str, key);
        if (!dryRun) update!.run(encrypted, row.rowid);
        processed++;
      } else {
        if (!isEncryptedColumn(str)) {
          skipped++;
          continue;
        }
        const decrypted = decryptColumn(str, key);
        if (!dryRun) update!.run(decrypted, row.rowid);
        processed++;
      }
    } catch {
      errors++;
    }
  }

  return { processed, skipped, errors };
}

export function runMigrateEncryption(opts: MigrateOpts): ColumnResult[] {
  const key = loadDataKey({
    keyFilePath: opts.keyFilePath,
    mnemonic: opts.mnemonic,
    mnemonicPassphrase: opts.mnemonicPassphrase,
  });

  const db: SqliteDatabase = new Database(opts.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const results: ColumnResult[] = [];
  const allErrors: string[] = [];

  const migrate = db.transaction(() => {
    for (const [table, columns] of Object.entries(ENCRYPTED_COLUMNS)) {
      // Skip tables that don't exist in this database.
      const tableExists = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
        .get(table);
      if (!tableExists) continue;

      for (const column of columns) {
        const { processed, skipped, errors } = migrateColumn(
          db,
          table,
          column,
          opts.direction,
          key,
          opts.dryRun ?? false
        );
        results.push({ table, column, processed, skipped });
        if (errors > 0) {
          allErrors.push(`${table}.${column}: ${errors} row(s) failed`);
        }
      }
    }
  });

  migrate();
  db.close();

  if (allErrors.length > 0) {
    throw new Error(`Migration completed with errors:\n${allErrors.join("\n")}`);
  }

  return results;
}

export type DbCliHooks = {
  resolveDbPath: () => Promise<string>;
};

export function registerDbCommand(program: Command, hooks: DbCliHooks): void {
  const dbCommand = program.command("db").description("Database maintenance commands");

  dbCommand
    .command("migrate-encryption <direction>")
    .description(
      "Migrate database column encryption. " +
        "direction: 'encrypt' (plaintext → encrypted) or 'decrypt' (encrypted → plaintext). " +
        "Requires NEOTOMA_KEY_FILE_PATH or NEOTOMA_MNEMONIC to be set."
    )
    .option("--db-path <path>", "Path to the SQLite database file (default: resolved from env)")
    .option("--key-file <path>", "Path to hex-encoded key file (overrides NEOTOMA_KEY_FILE_PATH)")
    .option("--mnemonic <phrase>", "BIP-39 mnemonic (overrides NEOTOMA_MNEMONIC)")
    .option(
      "--mnemonic-passphrase <passphrase>",
      "Passphrase for mnemonic (overrides NEOTOMA_MNEMONIC_PASSPHRASE)"
    )
    .option("--dry-run", "Scan and report what would change without writing any rows", false)
    .action(
      async (
        direction: string,
        opts: {
          dbPath?: string;
          keyFile?: string;
          mnemonic?: string;
          mnemonicPassphrase?: string;
          dryRun?: boolean;
        }
      ) => {
        if (direction !== "encrypt" && direction !== "decrypt") {
          process.stderr.write(
            `Error: direction must be 'encrypt' or 'decrypt', got '${direction}'\n`
          );
          process.exit(1);
        }

        const dbPath = opts.dbPath ?? (await hooks.resolveDbPath());

        if (opts.dryRun) {
          process.stdout.write(
            `Dry run: scanning ${path.basename(dbPath)} for rows to ${direction}...\n`
          );
        } else {
          process.stdout.write(`Migrating ${path.basename(dbPath)} (${direction})...\n`);
        }

        try {
          const results = runMigrateEncryption({
            direction: direction as "encrypt" | "decrypt",
            dbPath,
            keyFilePath: opts.keyFile,
            mnemonic: opts.mnemonic,
            mnemonicPassphrase: opts.mnemonicPassphrase,
            dryRun: opts.dryRun ?? false,
          });

          const totalProcessed = results.reduce((s, r) => s + r.processed, 0);
          const totalSkipped = results.reduce((s, r) => s + r.skipped, 0);

          for (const r of results) {
            if (r.processed > 0 || r.skipped > 0) {
              process.stdout.write(
                `  ${r.table}.${r.column}: ${r.processed} row(s) ${opts.dryRun ? "would be" : ""} ${direction}ed, ${r.skipped} skipped\n`
              );
            }
          }

          process.stdout.write(
            `\n${opts.dryRun ? "[dry run] " : ""}${direction === "encrypt" ? "Encrypted" : "Decrypted"} ${totalProcessed} row(s) across ${results.filter((r) => r.processed > 0).length} column(s). ${totalSkipped} row(s) skipped (already in target state or null).\n`
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          process.stderr.write(`Error: ${msg}\n`);
          process.exit(1);
        }
      }
    );
}
