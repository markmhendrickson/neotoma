/** Registry pinning only; no claim of complete conditional-store adoption. */
import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import { openLibsqlDatabase } from "../../src/repositories/libsql/libsql_driver.js";
import { SchemaRegistryService } from "../../src/services/schema_registry.js";
import type { DbDatabase } from "../../src/repositories/db/driver.js";
const root = mkdtempSync(path.join(tmpdir(), "conditional-schema-pin-"));
let serial = 0;
const connections: DbDatabase[] = [];
afterAll(async () => {
  for (const db of connections) await db.close();
  rmSync(root, { recursive: true, force: true });
});
async function fixture(backend: "sqlite" | "libsql") {
  const file = path.join(root, `${backend}-${++serial}.db`);
  const db =
    backend === "sqlite" ? new AsyncSqliteDatabase(file) : openLibsqlDatabase(`file:${file}`);
  connections.push(db);
  await db.exec(
    "CREATE TABLE schema_registry (id TEXT PRIMARY KEY,entity_type TEXT,schema_version TEXT,schema_definition TEXT,reducer_config TEXT,active INTEGER,user_id TEXT,scope TEXT,metadata TEXT)"
  );
  return db;
}
async function seed(
  db: DbDatabase,
  id: string,
  scope = "global",
  definition: unknown = { fields: { code: { type: "string" } }, canonical_name_fields: ["code"] }
) {
  await db
    .prepare("INSERT INTO schema_registry VALUES (?,'synthetic','1.0',?,?,1,?,?,NULL)")
    .run(
      id,
      JSON.stringify(definition),
      JSON.stringify({ merge_policies: {} }),
      scope === "user" ? "OWNER" : null,
      scope
    );
}
const registry = new SchemaRegistryService();
describe.each(["sqlite", "libsql"] as const)("transaction-visible schema (%s)", (backend) => {
  it("pins the exact user override and rereads changed version within the native transaction", async () => {
    const db = await fixture(backend);
    await seed(db, "GLOBAL");
    await seed(db, "USER", "user");
    await db.transaction(async (tx) => {
      expect((await registry.loadActiveSchemaInTransaction(tx, "synthetic", "OWNER")).id).toBe(
        "USER"
      );
      await tx.prepare("UPDATE schema_registry SET schema_version='2.0' WHERE id='USER'").run();
      expect(
        (await registry.loadActiveSchemaInTransaction(tx, "synthetic", "OWNER")).schema_version
      ).toBe("2.0");
    });
  });
  it("refuses absent, ambiguous and malformed authoritative schemas without writing", async () => {
    const db = await fixture(backend);
    await expect(
      db.transaction((tx) => registry.loadActiveSchemaInTransaction(tx, "synthetic", "OWNER"))
    ).rejects.toThrow("unavailable");
    await seed(db, "ONE");
    await seed(db, "TWO");
    await expect(
      db.transaction((tx) => registry.loadActiveSchemaInTransaction(tx, "synthetic", "OWNER"))
    ).rejects.toThrow("ambiguous");
    await db.exec("DELETE FROM schema_registry");
    await seed(db, "BAD", "global", null);
    await expect(
      db.transaction((tx) => registry.loadActiveSchemaInTransaction(tx, "synthetic", "OWNER"))
    ).rejects.toThrow("invalid");
    expect(await db.prepare("SELECT COUNT(*) n FROM schema_registry").get()).toEqual({ n: 1 });
  });
  it("never substitutes built-in identity defaults for undeclared identity", async () => {
    const db = await fixture(backend);
    await seed(db, "OPT_OUT", "global", {
      fields: { name: { type: "string" } },
      identity_opt_out: "heuristic_canonical_name",
    });
    await db.prepare("UPDATE schema_registry SET entity_type='contact'").run();
    const pinned = await db.transaction((tx) =>
      registry.loadActiveSchemaInTransaction(tx, "contact", "OWNER")
    );
    expect(pinned.schema_definition.canonical_name_fields).toBeUndefined();
    // The conditional handler must then reject this opt-out rather than derive a heuristic ID.
  });
});
