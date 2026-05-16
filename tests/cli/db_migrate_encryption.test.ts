/**
 * Integration tests for `neotoma db migrate-encryption`.
 *
 * Exercises the real `runMigrateEncryption` function against a real SQLite
 * file with a schema that mirrors the production tables it touches. The
 * function operates directly on a closed-server SQLite file in production,
 * so the test does the same — no MCP, no API, no in-memory stubs.
 *
 * Properties validated:
 * - encrypt then decrypt is the identity function across all 5 tables
 * - re-running encrypt (or decrypt) is a no-op (idempotent)
 * - --dry-run does not mutate any rows
 * - null and non-string values are skipped, never corrupted
 * - tables absent from the database are silently skipped
 * - wrong key fails decryption deterministically and is reported as errors
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import Database from "../../src/repositories/sqlite/sqlite_driver.js";
import { runMigrateEncryption } from "../../src/cli/commands/db.js";
import { isEncryptedColumn } from "../../src/crypto/column_encryption.js";
import { writeFileSync } from "fs";
import { randomBytes } from "crypto";

/**
 * Create a database with the subset of tables and columns that
 * `runMigrateEncryption` operates on. Only the columns the migration touches
 * are required — schema fidelity to production is irrelevant here.
 */
/**
 * Create a database that mirrors the relevant subset of production schemas
 * for tables `runMigrateEncryption` touches.
 *
 * Critical: production tables use `TEXT PRIMARY KEY` (not `INTEGER PRIMARY KEY`),
 * so SQLite's `rowid` is an independent implicit column rather than an alias
 * of the declared primary key. The migration's `UPDATE ... WHERE rowid = ?`
 * depends on this — using `INTEGER PRIMARY KEY` here would alias the column
 * away and silently break updates without affecting reported `processed` counts.
 */
function createTestDb(dbPath: string): void {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE observations (id TEXT PRIMARY KEY, fields TEXT);
    CREATE TABLE entity_snapshots (id TEXT PRIMARY KEY, snapshot TEXT, provenance TEXT);
    CREATE TABLE relationship_snapshots (id TEXT PRIMARY KEY, snapshot TEXT, provenance TEXT);
    CREATE TABLE raw_fragments (id TEXT PRIMARY KEY, fragment_value TEXT, fragment_envelope TEXT);
    CREATE TABLE schema_recommendations (
      id TEXT PRIMARY KEY,
      fields_to_add TEXT,
      fields_to_remove TEXT,
      fields_to_modify TEXT,
      converters_to_add TEXT
    );
    CREATE TABLE auto_enhancement_queue (id TEXT PRIMARY KEY, payload TEXT);
  `);
  db.close();
}

function writeKeyFile(dir: string): string {
  const keyHex = randomBytes(32).toString("hex");
  const keyPath = join(dir, "key.hex");
  writeFileSync(keyPath, keyHex);
  return keyPath;
}

function getAllPlaintexts(dbPath: string): Record<string, Record<string, (string | null)[]>> {
  const db = new Database(dbPath, { readonly: true });
  const out: Record<string, Record<string, (string | null)[]>> = {};
  const tables = [
    ["observations", ["fields"]],
    ["entity_snapshots", ["snapshot", "provenance"]],
    ["relationship_snapshots", ["snapshot", "provenance"]],
    ["raw_fragments", ["fragment_value", "fragment_envelope"]],
    [
      "schema_recommendations",
      ["fields_to_add", "fields_to_remove", "fields_to_modify", "converters_to_add"],
    ],
    ["auto_enhancement_queue", ["payload"]],
  ] as const;
  for (const [table, cols] of tables) {
    out[table] = {};
    for (const col of cols) {
      const rows = db.prepare(`SELECT ${col} FROM ${table} ORDER BY rowid`).all() as Array<
        Record<string, string | null>
      >;
      out[table][col] = rows.map((r) => r[col]);
    }
  }
  db.close();
  return out;
}

describe("db migrate-encryption", () => {
  let tmpDir: string;
  let dbPath: string;
  let keyFilePath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "neotoma-migrate-enc-"));
    dbPath = join(tmpDir, "neotoma.db");
    keyFilePath = writeKeyFile(tmpDir);
    createTestDb(dbPath);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("encrypt then decrypt is the identity function across all 5 covered tables", () => {
    // Seed every table with distinctive plaintext values.
    const seed = (table: string, cols: string[]) => {
      const db = new Database(dbPath);
      const placeholders = cols.map(() => "?").join(", ");
      const stmt = db.prepare(
        `INSERT INTO ${table} (id, ${cols.join(", ")}) VALUES (?, ${placeholders})`
      );
      stmt.run(`${table}-1`, ...cols.map((c) => JSON.stringify({ table, col: c, n: 1 })));
      stmt.run(`${table}-2`, ...cols.map((c) => JSON.stringify({ table, col: c, n: 2 })));
      db.close();
    };
    seed("observations", ["fields"]);
    seed("entity_snapshots", ["snapshot", "provenance"]);
    seed("relationship_snapshots", ["snapshot", "provenance"]);
    seed("raw_fragments", ["fragment_value", "fragment_envelope"]);
    seed("schema_recommendations", [
      "fields_to_add",
      "fields_to_remove",
      "fields_to_modify",
      "converters_to_add",
    ]);
    seed("auto_enhancement_queue", ["payload"]);

    const before = getAllPlaintexts(dbPath);

    // Encrypt.
    runMigrateEncryption({ direction: "encrypt", dbPath, keyFilePath });

    // Every non-null cell must now be an encrypted column string.
    const afterEncrypt = getAllPlaintexts(dbPath);
    for (const table of Object.keys(afterEncrypt)) {
      for (const col of Object.keys(afterEncrypt[table])) {
        for (const v of afterEncrypt[table][col]) {
          expect(v).not.toBeNull();
          expect(isEncryptedColumn(v as string)).toBe(true);
        }
      }
    }

    // Decrypt back.
    runMigrateEncryption({ direction: "decrypt", dbPath, keyFilePath });

    const after = getAllPlaintexts(dbPath);
    expect(after).toEqual(before);
  });

  it("re-encrypting already-encrypted rows is a no-op (idempotent)", () => {
    const db = new Database(dbPath);
    db.prepare("INSERT INTO observations (id, fields) VALUES (?, ?)").run(
      "obs-1",
      JSON.stringify({ k: "v" })
    );
    db.close();

    const first = runMigrateEncryption({ direction: "encrypt", dbPath, keyFilePath });
    const firstProcessed = first.find((r) => r.table === "observations" && r.column === "fields");
    expect(firstProcessed?.processed).toBe(1);
    expect(firstProcessed?.skipped).toBe(0);

    // Snapshot the encrypted cell.
    const encrypted = getAllPlaintexts(dbPath).observations.fields[0];

    // Second pass: should skip the already-encrypted row, not double-encrypt.
    const second = runMigrateEncryption({ direction: "encrypt", dbPath, keyFilePath });
    const secondProcessed = second.find((r) => r.table === "observations" && r.column === "fields");
    expect(secondProcessed?.processed).toBe(0);
    expect(secondProcessed?.skipped).toBe(1);

    // Encrypted value must not have changed.
    expect(getAllPlaintexts(dbPath).observations.fields[0]).toBe(encrypted);
  });

  it("re-decrypting already-plaintext rows is a no-op (idempotent)", () => {
    const db = new Database(dbPath);
    db.prepare("INSERT INTO observations (id, fields) VALUES (?, ?)").run(
      "obs-1",
      JSON.stringify({ k: "v" })
    );
    db.close();

    // First decrypt on plaintext: nothing should change.
    const result = runMigrateEncryption({ direction: "decrypt", dbPath, keyFilePath });
    const obs = result.find((r) => r.table === "observations" && r.column === "fields");
    expect(obs?.processed).toBe(0);
    expect(obs?.skipped).toBe(1);
  });

  it("--dry-run does not modify any rows", () => {
    const db = new Database(dbPath);
    db.prepare("INSERT INTO observations (id, fields) VALUES (?, ?)").run(
      "obs-1",
      JSON.stringify({ k: "v" })
    );
    db.close();

    const before = getAllPlaintexts(dbPath);

    const result = runMigrateEncryption({
      direction: "encrypt",
      dbPath,
      keyFilePath,
      dryRun: true,
    });

    // The result still reports what would be processed.
    const obs = result.find((r) => r.table === "observations" && r.column === "fields");
    expect(obs?.processed).toBe(1);

    // But no rows actually changed.
    expect(getAllPlaintexts(dbPath)).toEqual(before);
  });

  it("null values are skipped, never corrupted", () => {
    const db = new Database(dbPath);
    db.prepare("INSERT INTO observations (id, fields) VALUES (?, NULL)").run("obs-null");
    db.prepare("INSERT INTO observations (id, fields) VALUES (?, ?)").run(
      "obs-1",
      JSON.stringify({ k: "v" })
    );
    db.close();

    runMigrateEncryption({ direction: "encrypt", dbPath, keyFilePath });

    const fields = getAllPlaintexts(dbPath).observations.fields;
    expect(fields).toHaveLength(2);
    // One must be NULL (preserved), the other must be encrypted. Row order is
    // SELECT * ORDER BY rowid, but we don't depend on which insert got which
    // rowid — assert by partition.
    const nulls = fields.filter((v) => v === null);
    const nonNulls = fields.filter((v) => v !== null) as string[];
    expect(nulls).toHaveLength(1);
    expect(nonNulls).toHaveLength(1);
    expect(isEncryptedColumn(nonNulls[0])).toBe(true);
  });

  it("tables that do not exist in the database are silently skipped", () => {
    // Drop one of the expected tables; runMigrateEncryption must still succeed.
    const db = new Database(dbPath);
    db.exec("DROP TABLE auto_enhancement_queue");
    db.prepare("INSERT INTO observations (id, fields) VALUES (?, ?)").run(
      "obs-1",
      JSON.stringify({ k: "v" })
    );
    db.close();

    const result = runMigrateEncryption({ direction: "encrypt", dbPath, keyFilePath });

    // observations.fields should still have been processed.
    const obs = result.find((r) => r.table === "observations" && r.column === "fields");
    expect(obs?.processed).toBe(1);

    // auto_enhancement_queue should not appear in results because the table was missing.
    const aeq = result.find((r) => r.table === "auto_enhancement_queue");
    expect(aeq).toBeUndefined();
  });

  it("decrypting with the wrong key fails per-row and reports errors", () => {
    // Encrypt with one key.
    const db = new Database(dbPath);
    db.prepare("INSERT INTO observations (id, fields) VALUES (?, ?)").run(
      "obs-1",
      JSON.stringify({ k: "v" })
    );
    db.close();
    runMigrateEncryption({ direction: "encrypt", dbPath, keyFilePath });

    // Attempt to decrypt with a different key written into the same temp dir
    // (different filename, so it doesn't clobber the working key).
    const wrongKeyPath = join(tmpDir, "wrong-key.hex");
    writeFileSync(wrongKeyPath, randomBytes(32).toString("hex"));

    expect(() =>
      runMigrateEncryption({ direction: "decrypt", dbPath, keyFilePath: wrongKeyPath })
    ).toThrow(/Migration completed with errors/);

    // Original encrypted value should be unchanged (transaction rolls back? — actually,
    // per the implementation, the per-row catch swallows the error and the row simply
    // isn't updated, so the encrypted value persists).
    const value = getAllPlaintexts(dbPath).observations.fields[0];
    expect(isEncryptedColumn(value as string)).toBe(true);
  });

  it("throws a clear error when no key source is configured", () => {
    // Clear any test-env key sources.
    const savedKeyFile = process.env.NEOTOMA_KEY_FILE_PATH;
    const savedMnemonic = process.env.NEOTOMA_MNEMONIC;
    delete process.env.NEOTOMA_KEY_FILE_PATH;
    delete process.env.NEOTOMA_MNEMONIC;

    try {
      expect(() => runMigrateEncryption({ direction: "encrypt", dbPath })).toThrow(
        /No key source found/
      );
    } finally {
      if (savedKeyFile) process.env.NEOTOMA_KEY_FILE_PATH = savedKeyFile;
      if (savedMnemonic) process.env.NEOTOMA_MNEMONIC = savedMnemonic;
    }
  });
});
