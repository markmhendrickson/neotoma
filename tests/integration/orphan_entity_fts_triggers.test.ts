/**
 * NEOTOMA_DROP_ORPHAN_ENTITY_FTS: opt-in removal at open of the
 * leftover entity_fts_* triggers, whose `DELETE FROM entity_search_fts WHERE
 * entity_id = ...` reads the whole full-text store on every snapshot write.
 * Runs on both the synchronous sqlite driver and the libsql driver.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { DbDatabase } from "../../src/repositories/db/driver.js";
import { openLibsqlDatabase } from "../../src/repositories/libsql/libsql_driver.js";
import {
  dropOrphanEntityFtsTriggers,
  ensureSchema,
  ORPHAN_ENTITY_FTS_TRIGGERS,
} from "../../src/repositories/sqlite/sqlite_client.js";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";

const FTS_TABLE_SQL = [
  "CREATE VIRTUAL TABLE entity_search_fts USING fts5(entity_id UNINDEXED, name, body, tokenize = 'unicode61');",
  "CREATE TABLE entity_fts_rows (entity_id TEXT PRIMARY KEY);",
];

const TRIGGER_SQL = [
  "CREATE TRIGGER entity_fts_entities_ad AFTER DELETE ON entities BEGIN DELETE FROM entity_search_fts WHERE entity_id = old.id; DELETE FROM entity_fts_rows WHERE entity_id = old.id; END;",
  "CREATE TRIGGER entity_fts_entities_au AFTER UPDATE OF canonical_name ON entities BEGIN UPDATE entity_search_fts SET name = COALESCE(new.canonical_name,'') WHERE entity_id = new.id; END;",
  "CREATE TRIGGER entity_fts_snapshot_ad AFTER DELETE ON entity_snapshots BEGIN DELETE FROM entity_search_fts WHERE entity_id = old.entity_id; DELETE FROM entity_fts_rows WHERE entity_id = old.entity_id; END;",
  "CREATE TRIGGER entity_fts_snapshot_ai AFTER INSERT ON entity_snapshots BEGIN DELETE FROM entity_search_fts WHERE entity_id = new.entity_id; INSERT INTO entity_search_fts(entity_id, name, body) VALUES (new.entity_id, COALESCE(new.canonical_name,''), COALESCE(new.snapshot,'')); INSERT OR IGNORE INTO entity_fts_rows(entity_id) VALUES (new.entity_id); END;",
  "CREATE TRIGGER entity_fts_snapshot_au AFTER UPDATE ON entity_snapshots BEGIN DELETE FROM entity_search_fts WHERE entity_id = new.entity_id; INSERT INTO entity_search_fts(entity_id, name, body) VALUES (new.entity_id, COALESCE(new.canonical_name,''), COALESCE(new.snapshot,'')); INSERT OR IGNORE INTO entity_fts_rows(entity_id) VALUES (new.entity_id); END;",
];

const ENV = "NEOTOMA_DROP_ORPHAN_ENTITY_FTS";

const dirs: string[] = [];
const handles: DbDatabase[] = [];
const savedEnv = process.env[ENV];

afterEach(async () => {
  for (const h of handles.splice(0)) await h.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  if (savedEnv === undefined) delete process.env[ENV];
  else process.env[ENV] = savedEnv;
});

const backends: Array<[string, (file: string) => DbDatabase]> = [
  ["sqlite", (file) => new AsyncSqliteDatabase(file)],
  ["libsql", (file) => openLibsqlDatabase(`file:${file}`)],
];

async function freshDb(open: (file: string) => DbDatabase): Promise<DbDatabase> {
  const dir = mkdtempSync(path.join(tmpdir(), "neotoma-orphan-fts-"));
  dirs.push(dir);
  const db = open(path.join(dir, "neotoma.db"));
  handles.push(db);
  await ensureSchema(db);
  return db;
}

async function addLeftovers(db: DbDatabase): Promise<void> {
  for (const sql of [...FTS_TABLE_SQL, ...TRIGGER_SQL]) await db.exec(sql);
}

async function ftsTriggerNames(db: DbDatabase): Promise<string[]> {
  const rows = (await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'entity_fts_%' ORDER BY name"
    )
    .all()) as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

async function tableExists(db: DbDatabase, name: string): Promise<boolean> {
  return Boolean(
    await db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)
  );
}

describe.each(backends)("dropOrphanEntityFtsTriggers (%s)", (_name, open) => {
  it("does nothing and keeps all five triggers when the variable is unset", async () => {
    delete process.env[ENV];
    const db = await freshDb(open);
    await addLeftovers(db);
    expect(await dropOrphanEntityFtsTriggers(db)).toEqual({ triggers: 0, tables: 0 });
    expect(await ftsTriggerNames(db)).toEqual([...ORPHAN_ENTITY_FTS_TRIGGERS].sort());
    // Re-opening schema initialisation with the variable unset keeps them too.
    await ensureSchema(db);
    expect(await ftsTriggerNames(db)).toHaveLength(5);
  });

  it("drops the five triggers and the unused full-text tables when enabled, leaving writes working", async () => {
    const db = await freshDb(open);
    await addLeftovers(db);
    await db
      .prepare(
        "INSERT INTO entity_snapshots (entity_id, entity_type, schema_version, canonical_name, snapshot) VALUES (?, ?, ?, ?, ?)"
      )
      .run("ent_synthetic_1", "note", "1.0", "first", "{}");

    expect(await dropOrphanEntityFtsTriggers(db, true)).toEqual({ triggers: 5, tables: 2 });
    expect(await ftsTriggerNames(db)).toEqual([]);
    const result = await db
      .prepare("UPDATE entity_snapshots SET snapshot = ? WHERE entity_id = ?")
      .run('{"a":1}', "ent_synthetic_1");
    expect(result.changes).toBe(1);
    expect(await tableExists(db, "entity_search_fts")).toBe(false);
    expect(await tableExists(db, "entity_fts_rows")).toBe(false);
    // Repository triggers on the same tables are untouched.
    const own = await db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name = 'entity_search_text_snapshot_update'"
      )
      .get();
    expect(own).toBeTruthy();
  });

  it("returns 0 on a second call", async () => {
    const db = await freshDb(open);
    await addLeftovers(db);
    expect(await dropOrphanEntityFtsTriggers(db, true)).toEqual({ triggers: 5, tables: 2 });
    expect(await dropOrphanEntityFtsTriggers(db, true)).toEqual({ triggers: 0, tables: 0 });
  });

  it("runs during schema initialisation when the variable is 1", async () => {
    const db = await freshDb(open);
    await addLeftovers(db);
    process.env[ENV] = "1";
    await ensureSchema(db);
    expect(await ftsTriggerNames(db)).toEqual([]);
    expect(await tableExists(db, "entity_search_fts")).toBe(false);
  });

  it("drops the tables even when no trigger is left, and says so", async () => {
    const db = await freshDb(open);
    await addLeftovers(db);
    for (const name of [
      "entity_fts_entities_ad",
      "entity_fts_entities_au",
      "entity_fts_snapshot_ad",
      "entity_fts_snapshot_ai",
      "entity_fts_snapshot_au",
    ]) {
      await db.prepare(`DROP TRIGGER IF EXISTS ${name}`).run();
    }
    expect(await dropOrphanEntityFtsTriggers(db, true)).toEqual({ triggers: 0, tables: 2 });
    expect(await tableExists(db, "entity_search_fts")).toBe(false);
    expect(await tableExists(db, "entity_fts_rows")).toBe(false);
  });

  it("leaves no copy of a deleted snapshot's text anywhere once opted in", async () => {
    const db = await freshDb(open);
    await addLeftovers(db);
    await db
      .prepare(
        "INSERT INTO entity_snapshots (entity_id, entity_type, schema_version, canonical_name, snapshot) VALUES (?, ?, ?, ?, ?)"
      )
      .run("ent_synthetic_2", "note", "1.0", "to be deleted", '{"text":"synthetic-sentinel-text"}');
    expect(await dropOrphanEntityFtsTriggers(db, true)).toEqual({ triggers: 5, tables: 2 });
    await db.prepare("DELETE FROM entity_snapshots WHERE entity_id = ?").run("ent_synthetic_2");
    // The full-text tables are gone, so no copy of the deleted text can remain in them.
    expect(await tableExists(db, "entity_search_fts")).toBe(false);
    expect(await tableExists(db, "entity_fts_rows")).toBe(false);
    const leftover = await db
      .prepare("SELECT 1 AS present FROM entity_snapshots WHERE entity_id = ?")
      .get("ent_synthetic_2");
    expect(leftover).toBeFalsy();
  });
});

describe("orphan entity_fts triggers: write cost", () => {
  it("makes a snapshot update at least 5x faster once dropped", async () => {
    const db = await freshDb((file) => new AsyncSqliteDatabase(file));
    for (const sql of FTS_TABLE_SQL) await db.exec(sql);
    const ROWS = 5000;
    const body = "lorem ipsum dolor sit amet ".repeat(80).slice(0, 2048);
    await db.transaction(async (tx) => {
      const insert = tx.prepare(
        "INSERT INTO entity_snapshots (entity_id, entity_type, schema_version, canonical_name, snapshot) VALUES (?, 'note', '1.0', ?, ?)"
      );
      for (let i = 0; i < ROWS; i++) await insert.run(`ent_synthetic_${i}`, `name ${i}`, body);
    });
    await db.exec(
      "INSERT INTO entity_search_fts(entity_id, name, body) SELECT entity_id, canonical_name, snapshot FROM entity_snapshots"
    );
    await db.exec("INSERT INTO entity_fts_rows(entity_id) SELECT entity_id FROM entity_snapshots");
    for (const sql of TRIGGER_SQL) await db.exec(sql);

    const update = db.prepare("UPDATE entity_snapshots SET snapshot = ? WHERE entity_id = ?");
    const timeUpdate = async (n: number): Promise<number> => {
      const started = performance.now();
      await update.run(`${body} v${n}`, "ent_synthetic_42");
      return performance.now() - started;
    };
    await timeUpdate(0); // warm the page cache
    const before = await timeUpdate(1);
    expect(await dropOrphanEntityFtsTriggers(db, true)).toEqual({ triggers: 5, tables: 2 });
    await timeUpdate(2);
    const after = await timeUpdate(3);
    console.info(
      `orphan entity_fts triggers: snapshot update ${before.toFixed(2)} ms before, ${after.toFixed(2)} ms after`
    );
    expect(after * 5).toBeLessThanOrEqual(before);
  }, 120_000);
});
