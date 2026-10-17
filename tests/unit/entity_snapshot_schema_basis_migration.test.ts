import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ensureSchema } from "../../src/repositories/sqlite/sqlite_client.js";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";

it("adds nullable materialization basis without recertifying or replacing existing snapshots", async () => {
  const root = mkdtempSync(join(tmpdir(), "neotoma-schema-basis-migration-"));
  const database = new AsyncSqliteDatabase(join(root, "synthetic.sqlite"));
  try {
    await database.exec(`CREATE TABLE entity_snapshots (
      entity_id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, schema_version TEXT NOT NULL,
      canonical_name TEXT, snapshot TEXT, computed_at TEXT, observation_count INTEGER,
      last_observation_at TEXT, provenance TEXT, user_id TEXT
    )`);
    await database
      .prepare(
        `INSERT INTO entity_snapshots
      (entity_id, entity_type, schema_version, snapshot, observation_count, provenance, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "ent_synthetic_prior",
        "synthetic_type",
        "1.0",
        '{"status":"ready"}',
        1,
        "{}",
        "synthetic_owner"
      );
    await ensureSchema(database);
    await ensureSchema(database);
    const columns = (await database.prepare("PRAGMA table_info(entity_snapshots)").all()) as Array<{
      name: string;
    }>;
    expect(columns.filter((column) => column.name === "schema_basis")).toHaveLength(1);
    const prior = await database
      .prepare(
        `SELECT entity_id, snapshot, observation_count, schema_basis
      FROM entity_snapshots WHERE entity_id = ?`
      )
      .get("ent_synthetic_prior");
    expect(prior).toEqual({
      entity_id: "ent_synthetic_prior",
      snapshot: '{"status":"ready"}',
      observation_count: 1,
      schema_basis: null,
    });
  } finally {
    await database.close();
    rmSync(root, { recursive: true, force: true });
  }
});
