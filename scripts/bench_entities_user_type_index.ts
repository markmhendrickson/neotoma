/**
 * Timing harness for the idx_entities_* indexes (synthetic data only).
 *
 *   npx tsx scripts/bench_entities_user_type_index.ts [rows ...]   (default 300000 1000000)
 *
 * For each row count and each driver (better-sqlite3, and the libsql file
 * driver the hosted worker uses) it builds a throwaway database in a temp dir,
 * seeds `entities` + `entity_snapshots` with a skewed type spread (5 dominant
 * types, 150 tail types), times every listing shape with the indexes absent,
 * builds them through the real `ensureSchema` boot path, and times the same
 * shapes again. The SQL is the text the real queryEntities builder emits (page
 * chunk size 200). Never touches a real database.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import { ensureSchema } from "../src/repositories/sqlite/sqlite_client.js";
import { AsyncSqliteDatabase } from "../src/repositories/sqlite/sqlite_driver.js";
import { openLibsqlDatabase } from "../src/repositories/libsql/libsql_driver.js";
import type { DbDatabase } from "../src/repositories/db/driver.js";

const USER = "00000000-0000-0000-0000-00000000bench";
const DOMINANT: Array<[string, number]> = [
  ["email_message", 0.55],
  ["transaction", 0.15],
  ["observation_note", 0.1],
  ["contact", 0.05],
  ["task", 0.03],
];
const pickType = (r: number): string => {
  let acc = 0;
  for (const [t, w] of DOMINANT) {
    acc += w;
    if (r < acc) return t;
  }
  return `tail_type_${Math.floor(((r - acc) / (1 - acc)) * 150) % 150}`;
};

function seed(file: string, n: number): void {
  const raw = new Database(file);
  raw.pragma("journal_mode = WAL");
  const ins = raw.prepare(
    "INSERT INTO entities (id, entity_type, canonical_name, aliases, created_at, updated_at, user_id, first_seen_at, last_seen_at, merged_to_entity_id, merged_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
  );
  const insSnap = raw.prepare(
    "INSERT INTO entity_snapshots (entity_id, entity_type, schema_version, canonical_name, snapshot, computed_at, observation_count, last_observation_at, provenance, user_id) VALUES (?,?,?,?,?,?,?,?,?,?)"
  );
  const ts = "2026-10-01T12:00:00.000Z";
  raw.transaction(() => {
    for (let i = 0; i < n; i++) {
      const type = pickType(Math.random());
      const id = `ent_${randomBytes(12).toString("hex")}`;
      const name = `${randomBytes(6).toString("hex")} ${type} sample canonical name`;
      const merged = i % 200 === 0 ? `ent_merged_${i}` : null;
      ins.run(id, type, name, i % 5 === 0 ? '["a","b"]' : null, ts, ts, USER, ts, ts, merged, merged ? ts : null);
      // ~99% of entities have a snapshot, like a healthy store.
      if (i % 100 !== 7) {
        insSnap.run(id, type, "1.0", name, JSON.stringify({ name, note: randomBytes(40).toString("hex") }), ts, 3, ts, "{}", USER);
      }
    }
  })();
  raw.pragma("wal_checkpoint(TRUNCATE)");
  raw.close();
}

const SEL =
  "SELECT id, entity_type, canonical_name, user_id, merged_to_entity_id, merged_at, created_at FROM entities";
const TAIL = "LIMIT 200 OFFSET 0";
const CERT =
  "SELECT e.id,e.user_id,e.entity_type FROM entities e LEFT JOIN entity_snapshots s ON s.entity_id=e.id AND s.user_id=e.user_id AND s.entity_type=e.entity_type WHERE e.user_id=? AND e.merged_to_entity_id IS NULL AND e.entity_type IN (?) AND s.entity_id IS NULL";
const LIVE = "merged_to_entity_id IS NULL";
const QUERIES: Array<[string, string, unknown[]]> = [
  ["type-less listing", `${SEL} WHERE user_id = ? AND ${LIVE} ORDER BY id ASC ${TAIL}`, [USER]],
  ["keyset id > ?", `${SEL} WHERE user_id = ? AND ${LIVE} AND id > ? ORDER BY id ASC ${TAIL}`, [USER, "ent_8"]],
  ["keyset id < ? DESC", `${SEL} WHERE user_id = ? AND ${LIVE} AND id < ? ORDER BY id DESC ${TAIL}`, [USER, "ent_8"]],
  ["single type, dominant", `${SEL} WHERE user_id = ? AND entity_type = ? AND ${LIVE} ORDER BY id ASC ${TAIL}`, [USER, "email_message"]],
  ["single type, tail", `${SEL} WHERE user_id = ? AND entity_type = ? AND ${LIVE} ORDER BY id ASC ${TAIL}`, [USER, "tail_type_3"]],
  ["multi type, dominant+tail", `${SEL} WHERE user_id = ? AND entity_type IN (?, ?) AND ${LIVE} ORDER BY id ASC ${TAIL}`, [USER, "email_message", "tail_type_3"]],
  ["multi type, two tail", `${SEL} WHERE user_id = ? AND entity_type IN (?, ?) AND ${LIVE} ORDER BY id ASC ${TAIL}`, [USER, "tail_type_4", "tail_type_3"]],
  ["name sort, type-less", `${SEL} WHERE user_id = ? AND ${LIVE} ORDER BY canonical_name ASC ${TAIL}`, [USER]],
  ["name sort, dominant", `${SEL} WHERE user_id = ? AND entity_type = ? AND ${LIVE} ORDER BY canonical_name ASC ${TAIL}`, [USER, "email_message"]],
  ["name sort, tail", `${SEL} WHERE user_id = ? AND entity_type = ? AND ${LIVE} ORDER BY canonical_name ASC ${TAIL}`, [USER, "tail_type_3"]],
  ["include_merged, type-less", `${SEL} WHERE user_id = ? ORDER BY id ASC ${TAIL}`, [USER]],
  ["include_merged, tail", `${SEL} WHERE user_id = ? AND entity_type = ? ORDER BY id ASC ${TAIL}`, [USER, "tail_type_3"]],
  ["certificate, tail", CERT, [USER, "tail_type_3"]],
  ["certificate, dominant", CERT, [USER, "email_message"]],
];

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
async function time(db: DbDatabase, sql: string, params: unknown[]): Promise<number> {
  const xs: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    await db.prepare(sql).all(...params);
    xs.push(performance.now() - t);
  }
  return median(xs);
}

async function run(n: number, driver: string): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-entidx-bench-"));
  const file = path.join(dir, "bench.db");
  const open = (): DbDatabase =>
    driver === "sqlite"
      ? new AsyncSqliteDatabase(file)
      : openLibsqlDatabase(`file:${file}`, { busyTimeoutMs: 60000 });
  try {
    let db = open();
    await ensureSchema(db);
    const idx = (await db
      .prepare("SELECT name FROM sqlite_master WHERE name LIKE 'idx_entities_%'")
      .all()) as Array<{ name: string }>;
    for (const { name } of idx) await db.prepare(`DROP INDEX ${name}`).run();
    await db.close();
    seed(file, n);
    const sizeBefore = fs.statSync(file).size;

    db = open();
    const before: number[] = [];
    for (const [, sql, p] of QUERIES) before.push(await time(db, sql, p));
    const tb = performance.now();
    await ensureSchema(db); // the boot path: builds the indexes on this existing DB
    const bootS = (performance.now() - tb) / 1000;
    await db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    const sizeAfter = fs.statSync(file).size;
    const after: number[] = [];
    for (const [, sql, p] of QUERIES) after.push(await time(db, sql, p));
    await db.close();

    console.log(`\n== ${driver} @ ${n.toLocaleString()} entity rows ==`);
    console.log(`first-boot index build (ensureSchema on existing DB): ${bootS.toFixed(2)} s`);
    console.log(
      `db size: ${(sizeBefore / 1e6).toFixed(0)} MB -> ${(sizeAfter / 1e6).toFixed(0)} MB (+${((sizeAfter - sizeBefore) / 1e6).toFixed(0)} MB)`
    );
    QUERIES.forEach(([label], i) =>
      console.log(
        `${label.padEnd(28)} before ${before[i].toFixed(1).padStart(8)} ms   after ${after[i].toFixed(1).padStart(8)} ms`
      )
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const sizes = process.argv.slice(2).map(Number).filter(Boolean);
for (const n of sizes.length ? sizes : [300_000, 1_000_000]) {
  for (const driver of ["sqlite", "libsql"]) await run(n, driver);
}
process.exit(0);
