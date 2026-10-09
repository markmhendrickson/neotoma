import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import { inspectLifecycleDatabase } from "../../src/maintenance/entity_lifecycle_inventory.js";

describe("complete typed lifecycle inventory", () => {
  let dir: string;
  let db: AsyncSqliteDatabase;
  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "owned-lifecycle-inventory-"));
    db = new AsyncSqliteDatabase(path.join(dir, "owned.sqlite"));
    await db.exec(
      "CREATE TABLE owned(id INTEGER PRIMARY KEY, value); CREATE INDEX owned_value ON owned(value);"
    );
  });
  afterEach(async () => {
    await db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  it("scans all acquisition batches deterministically and detects the last row mutation", async () => {
    for (let i = 0; i < 503; i++)
      await db.prepare("INSERT INTO owned VALUES(?,?)").run(i, `owned-${i}`);
    const before = await db.transaction((tx) => inspectLifecycleDatabase(tx));
    expect(before.tables[0].rows).toBe(503);
    expect(await db.transaction((tx) => inspectLifecycleDatabase(tx))).toEqual(before);
    await db.prepare("UPDATE owned SET value='changed' WHERE id=502").run();
    const after = await db.transaction((tx) => inspectLifecycleDatabase(tx));
    expect(after.tables[0].rows).toBe(503);
    expect(after.tables[0].sha256).not.toBe(before.tables[0].sha256);
    expect(after.sha256).not.toBe(before.sha256);
  });
  it("distinguishes null, empty text/blob, exact large integers, REAL and arbitrary bytes", async () => {
    const states = [
      "NULL",
      "''",
      "X''",
      "9223372036854775807",
      "9223372036854775806",
      "1.0000000000000002",
      "1.0",
      "X'00FF80'",
      "CAST(X'00FF80' AS TEXT)",
    ];
    const hashes = new Set<string>();
    for (const value of states) {
      await db.exec(`DELETE FROM owned; INSERT INTO owned VALUES(1,${value});`);
      const result = await db.transaction((tx) => inspectLifecycleDatabase(tx));
      hashes.add(result.tables[0].sha256);
    }
    expect(hashes.size).toBe(states.length);
  });
  it("includes schema indexes/triggers and every table, including empty tables", async () => {
    const before = await db.transaction((tx) => inspectLifecycleDatabase(tx));
    await db.exec(
      "CREATE TABLE empty(value BLOB); CREATE TRIGGER owned_guard BEFORE DELETE ON owned BEGIN SELECT RAISE(ABORT,'owned'); END;"
    );
    const after = await db.transaction((tx) => inspectLifecycleDatabase(tx));
    expect(after.tables.map((table) => table.name)).toEqual(["empty", "owned"]);
    expect(
      after.schema.some((object) => object.type === "index" && object.name === "owned_value")
    ).toBe(true);
    expect(
      after.schema.some((object) => object.type === "trigger" && object.name === "owned_guard")
    ).toBe(true);
    expect(after.schema_sha256).not.toBe(before.schema_sha256);
  });
  it("inspection uses an existing read-only handle without modifying bytes or creating schema", async () => {
    const file = path.join(dir, "owned.sqlite");
    const before = readFileSync(file);
    const ro = new AsyncSqliteDatabase(file, { existing: true, readOnly: true });
    try {
      expect((await ro.transaction((tx) => inspectLifecycleDatabase(tx))).tables[0].rows).toBe(0);
    } finally {
      await ro.close();
    }
    expect(readFileSync(file)).toEqual(before);
    expect(await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).toEqual([
      { name: "owned" },
    ]);
  });
  it("foreign key errors refuse rather than reporting a valid inventory", async () => {
    await db.exec(
      "PRAGMA foreign_keys=OFF; CREATE TABLE parent(id TEXT PRIMARY KEY); CREATE TABLE child(parent_id TEXT REFERENCES parent(id)); INSERT INTO child VALUES('missing'); PRAGMA foreign_keys=ON;"
    );
    await expect(db.transaction((tx) => inspectLifecycleDatabase(tx))).rejects.toThrow(
      "LIFECYCLE_INVENTORY_INVALID"
    );
  });
});
