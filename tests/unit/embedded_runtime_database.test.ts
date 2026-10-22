import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import { EmbeddedRuntimeContext } from "../../src/core/runtime_context.js";
import { createEmbeddedRuntimeConfiguration } from "../../src/core/runtime_configuration.js";
import { initializeFreshEmbeddedDatabase } from "../../src/core/runtime_database.js";

function make(database: AsyncSqliteDatabase) {
  return new EmbeddedRuntimeContext({
    database,
    configuration: createEmbeddedRuntimeConfiguration({
      dataDirectory: join(process.cwd(), ".vitest", "database-setup"),
      packageRoot: process.cwd(),
    }),
    legacyIdentityPolicy: { tenantScopedEntityIds: false },
    attributionPolicy: { anonymous_writes: "allow" },
    adapters: {},
  });
}
const schema = (database: AsyncSqliteDatabase) =>
  database.prepare("SELECT type,name,sql FROM sqlite_master ORDER BY type,name").all();

describe("explicit fresh database initialization", () => {
  it("does no implicit DDL, then initializes once without taking ownership", async () => {
    const database = new AsyncSqliteDatabase(":memory:");
    const context = make(database);
    try {
      expect(await schema(database)).toEqual([]);
      await initializeFreshEmbeddedDatabase(context);
      expect(await database.prepare("SELECT count(*) AS total FROM observations").get()).toEqual({
        total: 0,
      });
      const initialized = await schema(database);
      await expect(initializeFreshEmbeddedDatabase(context)).rejects.toThrow(
        "EXPLICIT_DATABASE_MUST_BE_EMPTY"
      );
      expect(await schema(database)).toEqual(initialized);
      await context.dispose();
      expect(await database.prepare("SELECT count(*) AS total FROM sources").get()).toEqual({
        total: 0,
      });
    } finally {
      await context.dispose();
      await database.close();
    }
  });
  it.each(["sentinel", "sqlitexcustom"])(
    "rejects an existing %s table before changing schema or data",
    async (table) => {
      const database = new AsyncSqliteDatabase(":memory:");
      const context = make(database);
      try {
        await database.exec(
          `CREATE TABLE ${table}(value TEXT); INSERT INTO ${table} VALUES ('preserve')`
        );
        const before = await schema(database);
        await expect(initializeFreshEmbeddedDatabase(context)).rejects.toThrow(
          "EXPLICIT_DATABASE_MUST_BE_EMPTY"
        );
        expect(await schema(database)).toEqual(before);
        expect(await database.prepare(`SELECT value FROM ${table}`).get()).toEqual({
          value: "preserve",
        });
      } finally {
        await context.dispose();
        await database.close();
      }
    }
  );
  it("serializes competing setup attempts so only one can admit an empty database", async () => {
    const database = new AsyncSqliteDatabase(":memory:");
    const a = make(database),
      b = make(database);
    try {
      const attempts = await Promise.allSettled([
        initializeFreshEmbeddedDatabase(a),
        initializeFreshEmbeddedDatabase(b),
      ]);
      expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(attempts.filter((result) => result.status === "rejected")).toHaveLength(1);
      expect(await database.prepare("SELECT count(*) AS total FROM observations").get()).toEqual({
        total: 0,
      });
    } finally {
      await a.dispose();
      await b.dispose();
      await database.close();
    }
  });
});
