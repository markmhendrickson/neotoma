/** Isolated migration tests, never installed/admitted native authority. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { AsyncSqliteDatabase } from "../sqlite_driver.js";
import { LibsqlDatabase } from "../../libsql/libsql_driver.js";
import type { DbConnection, DbDatabase } from "../../db/driver.js";
import { ensureSchema, migrateNullableRelationshipSources } from "../sqlite_client.js";
import { canonicalStoreRequest } from "../../../services/store_condition_keys.js";

const tables = ["relationship_observations", "relationship_snapshots"];
describe.each(["sqlite", "libsql-file"] as const)("nullable source migration: %s", (backend) => {
  let database: DbDatabase;
  let directory: string;
  beforeEach(async () => {
    mkdirSync(join(process.cwd(), ".vitest"), { recursive: true });
    directory = mkdtempSync(join(process.cwd(), ".vitest/native598-migration-"));
    const path = join(directory, "synthetic-only.sqlite");
    database =
      backend === "sqlite"
        ? new AsyncSqliteDatabase(path)
        : new LibsqlDatabase(pathToFileURL(path).href);
    await ensureSchema(database);
    await database.exec(`CREATE TABLE synthetic_audit (value TEXT);
      CREATE INDEX synthetic_history_lookup ON relationship_observations(user_id,observed_at);
      CREATE TRIGGER synthetic_history_audit AFTER INSERT ON relationship_observations
      BEGIN INSERT INTO synthetic_audit VALUES (NEW.id); END;`);
    await database
      .prepare(
        `INSERT INTO relationship_observations
      (id,relationship_key,relationship_type,source_entity_id,target_entity_id,metadata,provenance,specificity_score,user_id)
      VALUES (?,?,?,?,?,?,?,?,?)`
      )
      .run(
        "synthetic-observation",
        "synthetic-key",
        "PART_OF",
        "synthetic-source",
        "synthetic-target",
        '{"confidence":0.76}',
        '{"synthetic":true}',
        0.76,
        "synthetic-owner"
      );
    await database
      .prepare(
        `INSERT INTO relationship_snapshots
      (relationship_key,relationship_type,source_entity_id,target_entity_id,schema_version,snapshot,observation_count,user_id)
      VALUES (?,?,?,?,?,?,?,?)`
      )
      .run(
        "synthetic-key",
        "PART_OF",
        "synthetic-source",
        "synthetic-target",
        "1.0.0",
        '{"confidence":0.76}',
        1,
        "synthetic-owner"
      );
  });
  afterEach(async () => {
    await database.close();
    rmSync(directory, { recursive: true, force: true });
  });
  async function image() {
    return canonicalStoreRequest({
      schema: await database
        .prepare("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name")
        .all(),
      observations: await database
        .prepare("SELECT * FROM relationship_observations ORDER BY id")
        .all(),
      snapshots: await database
        .prepare("SELECT * FROM relationship_snapshots ORDER BY relationship_key")
        .all(),
      audit: await database.prepare("SELECT * FROM synthetic_audit ORDER BY value").all(),
    });
  }
  async function sources() {
    return Promise.all(
      tables.map(async (table) => {
        const cols = (await database.prepare(`PRAGMA table_info(${table})`).all()) as Array<{
          name: string;
          notnull: number;
        }>;
        return cols.find((c) => c.name === "source_entity_id")!.notnull;
      })
    );
  }
  it("keeps ordinary initialization nonnull and changes neither registration nor ordinary data", async () => {
    expect(await sources()).toEqual([1, 1]);
    await expect(
      database
        .prepare(
          "INSERT INTO relationship_observations(id,relationship_key,relationship_type,source_entity_id,target_entity_id) VALUES ('bad','bad','PART_OF',NULL,'target')"
        )
        .run()
    ).rejects.toThrow();
    expect(
      await database.prepare("SELECT count(*) AS n FROM relationship_type_registry").get()
    ).toEqual({ n: 0 });
  });
  it("rebuilds both actual tables with all historical values/defaults/indexes/triggers preserved", async () => {
    const observation = await database.prepare("SELECT * FROM relationship_observations").all();
    const snapshot = await database.prepare("SELECT * FROM relationship_snapshots").all();
    await migrateNullableRelationshipSources(database);
    expect(await sources()).toEqual([0, 0]);
    expect(await database.prepare("SELECT * FROM relationship_observations").all()).toEqual(
      observation
    );
    expect(await database.prepare("SELECT * FROM relationship_snapshots").all()).toEqual(snapshot);
    expect(await database.prepare("SELECT * FROM synthetic_audit").all()).toEqual([
      { value: "synthetic-observation" },
    ]);
    const index = (await database
      .prepare("PRAGMA index_info(idx_relationship_observations_native_history)")
      .all()) as Array<{ name: string }>;
    expect(index.map((c) => c.name)).toEqual(["user_id", "relationship_type", "id"]);
    await database
      .prepare(
        "INSERT INTO relationship_observations(id,relationship_key,relationship_type,source_entity_id,target_entity_id) VALUES ('null-test','synthetic-null','principal_binding',NULL,'synthetic-target')"
      )
      .run();
    await database
      .prepare(
        "INSERT INTO relationship_snapshots(relationship_key,relationship_type,source_entity_id,target_entity_id,schema_version) VALUES ('synthetic-null','principal_binding',NULL,'synthetic-target','1.0.0')"
      )
      .run();
    expect(
      await database
        .prepare(
          "SELECT is_live FROM relationship_snapshots WHERE relationship_key='synthetic-null'"
        )
        .get()
    ).toEqual({ is_live: 1 });
    expect(await database.prepare("SELECT count(*) AS n FROM synthetic_audit").get()).toEqual({
      n: 2,
    });
    expect(
      await database.prepare("SELECT count(*) AS n FROM relationship_type_registry").get()
    ).toEqual({ n: 0 });
  });
  it("is idempotent, survives a close/reopen and keeps subsequent ordinary initialization compatible", async () => {
    await migrateNullableRelationshipSources(database);
    const before = await image();
    await migrateNullableRelationshipSources(database);
    expect(await image()).toEqual(before);
    await database.close();
    const path = join(directory, "synthetic-only.sqlite");
    database =
      backend === "sqlite"
        ? new AsyncSqliteDatabase(path)
        : new LibsqlDatabase(pathToFileURL(path).href);
    await ensureSchema(database);
    expect(await sources()).toEqual([0, 0]);
    expect(await image()).toEqual(before);
  });
  it.each(["copy-first", "drop-second", "index", "before-commit"])(
    "rolls back BOTH tables and schema on %s failure",
    async (stage) => {
      const before = await image();
      const faulted: DbDatabase = {
        prepare: (sql) => database.prepare(sql),
        exec: (sql) => database.exec(sql),
        pragma: (sql) => database.pragma(sql),
        close: async () => {},
        transaction: (fn) =>
          database.transaction(async (tx) => {
            const wrapped: DbConnection = {
              prepare: (sql) => tx.prepare(sql),
              exec: async (sql) => {
                if (
                  (stage === "copy-first" &&
                    sql.startsWith('INSERT INTO "relationship_observations__native_nullable"')) ||
                  (stage === "drop-second" && sql === 'DROP TABLE "relationship_snapshots"') ||
                  (stage === "index" &&
                    sql.startsWith("CREATE INDEX idx_relationship_observations_native_history"))
                )
                  throw new Error("synthetic injected failure");
                await tx.exec(sql);
              },
            };
            const result = await fn(wrapped);
            if (stage === "before-commit") throw new Error("synthetic precommit failure");
            return result;
          }),
      };
      await expect(migrateNullableRelationshipSources(faulted)).rejects.toMatchObject({
        code: "NATIVE_RELATIONSHIP_STORAGE_UNAVAILABLE",
      });
      expect(await image()).toEqual(before);
      expect(await sources()).toEqual([1, 1]);
    }
  );
  it("refuses mixed layouts without altering either table", async () => {
    await database.exec(
      "DROP TRIGGER synthetic_history_audit; DROP TABLE relationship_observations; CREATE TABLE relationship_observations (id TEXT PRIMARY KEY, source_entity_id TEXT)"
    );
    const before = await image();
    await expect(migrateNullableRelationshipSources(database)).rejects.toThrow(
      "could not be verified"
    );
    expect(await image()).toEqual(before);
  });
  it("detects a truncated copy and rolls back before replacing historical tables", async () => {
    const before = await image();
    const faulted: DbDatabase = {
      prepare: (sql) => database.prepare(sql),
      exec: (sql) => database.exec(sql),
      pragma: (sql) => database.pragma(sql),
      close: async () => {},
      transaction: (fn) =>
        database.transaction((tx) =>
          fn({
            prepare: (sql) => tx.prepare(sql),
            exec: (sql) =>
              tx.exec(
                sql.startsWith('INSERT INTO "relationship_observations__native_nullable"')
                  ? sql + " WHERE 0"
                  : sql
              ),
          })
        ),
    };
    await expect(migrateNullableRelationshipSources(faulted)).rejects.toMatchObject({
      code: "NATIVE_RELATIONSHIP_STORAGE_UNAVAILABLE",
    });
    expect(await image()).toEqual(before);
  });
  it("verifies SQL value types even when a copied INTEGER and REAL share the same JS number", async () => {
    await database.exec(
      "ALTER TABLE relationship_observations ADD COLUMN synthetic_numeric; UPDATE relationship_observations SET synthetic_numeric=1"
    );
    const before = await image();
    const faulted: DbDatabase = {
      prepare: (sql) => database.prepare(sql),
      exec: (sql) => database.exec(sql),
      pragma: (sql) => database.pragma(sql),
      close: async () => {},
      transaction: (fn) =>
        database.transaction((tx) =>
          fn({
            prepare: (sql) => tx.prepare(sql),
            exec: (sql) =>
              tx.exec(
                sql.startsWith('INSERT INTO "relationship_observations__native_nullable"')
                  ? sql.replace(
                      '"synthetic_numeric" FROM',
                      'CAST("synthetic_numeric" AS REAL) FROM'
                    )
                  : sql
              ),
          })
        ),
    };
    await expect(migrateNullableRelationshipSources(faulted)).rejects.toMatchObject({
      code: "NATIVE_RELATIONSHIP_STORAGE_UNAVAILABLE",
    });
    expect(await image()).toEqual(before);
    expect(
      await database
        .prepare("SELECT typeof(synthetic_numeric) AS kind FROM relationship_observations")
        .get()
    ).toEqual({ kind: "integer" });
  });
  it("refuses foreign-key dependents without silently changing constraints", async () => {
    await database.exec(
      "CREATE TABLE synthetic_fk (parent TEXT REFERENCES relationship_observations(id))"
    );
    const before = await image();
    await expect(migrateNullableRelationshipSources(database)).rejects.toThrow(
      "could not be verified"
    );
    expect(await image()).toEqual(before);
  });
  it("refuses an additional source CHECK instead of claiming nullability from column metadata alone", async () => {
    await database.exec(
      "DROP TRIGGER synthetic_history_audit; DROP TABLE relationship_observations; CREATE TABLE relationship_observations (id TEXT PRIMARY KEY,relationship_key TEXT,user_id TEXT,relationship_type TEXT,source_entity_id TEXT NOT NULL CHECK(source_entity_id IS NOT NULL))"
    );
    const before = await image();
    await expect(migrateNullableRelationshipSources(database)).rejects.toThrow(
      "could not be verified"
    );
    expect(await image()).toEqual(before);
  });
  it.each([
    "CREATE INDEX idx_relationship_observations_native_history ON relationship_observations(user_id,relationship_type,id) WHERE user_id IS NOT NULL",
    "CREATE UNIQUE INDEX idx_relationship_observations_native_history ON relationship_observations(user_id,relationship_type,id)",
    "CREATE INDEX idx_relationship_observations_native_history ON relationship_observations(user_id COLLATE NOCASE,relationship_type,id)",
  ])("refuses incompatible history index definitions before changing schema", async (ddl) => {
    await database.exec(ddl);
    const before = await image();
    await expect(migrateNullableRelationshipSources(database)).rejects.toThrow(
      "could not be verified"
    );
    expect(await image()).toEqual(before);
  });
  it("refuses external views rather than risk a rewritten or invalid dependent schema", async () => {
    await database.exec("CREATE VIEW synthetic_view AS SELECT id FROM relationship_observations");
    const before = await image();
    await expect(migrateNullableRelationshipSources(database)).rejects.toThrow(
      "could not be verified"
    );
    expect(await image()).toEqual(before);
  });
});
