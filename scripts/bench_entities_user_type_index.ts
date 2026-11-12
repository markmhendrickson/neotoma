/**
 * Timing harness for the idx_entities_user_type index (synthetic data only).
 *
 *   npx tsx scripts/bench_entities_user_type_index.ts [rows ...]   (default 300000 1000000)
 *
 * For each row count and each driver (better-sqlite3 and the libsql file
 * driver the hosted worker uses) it builds a throwaway database in a temp dir,
 * drops the index, seeds `entities` + `entity_snapshots` with a skewed type
 * spread, times the page and population-certificate queries, times the index
 * build (via the real `ensureSchema` boot path, and a bare CREATE INDEX on a
 * second copy), then times the queries again. Never touches a real database.
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
const TAIL_TYPES = Array.from({ length: 150 }, (_, i) => `tail_type_${i}`);

function pickType(r: number): string {
  let acc = 0;
  for (const [t, w] of DOMINANT) {
    acc += w;
    if (r < acc) return t;
  }
  return TAIL_TYPES[Math.floor(((r - acc) / (1 - acc)) * TAIL_TYPES.length) % TAIL_TYPES.length];
}

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
      const name = `${type} ${randomBytes(10).toString("hex")} sample canonical name`;
      const merged = i % 200 === 0 ? `ent_${randomBytes(12).toString("hex")}` : null;
      ins.run(
        id, type, name,
        i % 5 === 0 ? JSON.stringify([`alias ${i}`, `other alias ${i}`]) : null,
        ts, ts, USER, ts, ts, merged, merged ? ts : null
      );
      // ~99% of entities have a snapshot, like a healthy store.
      if (i % 100 !== 7) {
        insSnap.run(
          id, type, "1.0", name,
          JSON.stringify({ name, status: "active", note: randomBytes(40).toString("hex") }),
          ts, 3, ts, "{}", USER
        );
      }
    }
  })();
  raw.pragma("wal_checkpoint(TRUNCATE)");
  raw.close();
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function time(db: DbDatabase, sql: string, params: unknown[], runs = 5): Promise<number> {
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    await db.prepare(sql).all(...params);
    samples.push(performance.now() - t);
  }
  return median(samples);
}

const QUERIES: Array<[string, string, unknown[]]> = [
  [
    "page limit 5 (dominant type)",
    "SELECT id, entity_type, canonical_name, created_at FROM entities WHERE user_id = ? AND entity_type = ? AND merged_to_entity_id IS NULL ORDER BY id ASC LIMIT 5",
    [USER, "email_message"],
  ],
  [
    "page limit 5 (tail type)",
    "SELECT id, entity_type, canonical_name, created_at FROM entities WHERE user_id = ? AND entity_type = ? AND merged_to_entity_id IS NULL ORDER BY id ASC LIMIT 5",
    [USER, "tail_type_3"],
  ],
  [
    "population certificate (tail type)",
    "SELECT e.id,e.user_id,e.entity_type FROM entities e LEFT JOIN entity_snapshots s ON s.entity_id=e.id AND s.user_id=e.user_id AND s.entity_type=e.entity_type WHERE e.user_id=? AND e.merged_to_entity_id IS NULL AND e.entity_type IN (?) AND s.entity_id IS NULL",
    [USER, "tail_type_3"],
  ],
  [
    "population certificate (dominant type)",
    "SELECT e.id,e.user_id,e.entity_type FROM entities e LEFT JOIN entity_snapshots s ON s.entity_id=e.id AND s.user_id=e.user_id AND s.entity_type=e.entity_type WHERE e.user_id=? AND e.merged_to_entity_id IS NULL AND e.entity_type IN (?) AND s.entity_id IS NULL",
    [USER, "email_message"],
  ],
];

async function run(n: number, driver: string): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-entidx-bench-"));
  const file = path.join(dir, "bench.db");
  const open = (): DbDatabase =>
    driver === "sqlite"
      ? new AsyncSqliteDatabase(file)
      : openLibsqlDatabase(`file:${file}`, { busyTimeoutMs: 60000 });
  try {
    // Build the schema, drop the new index to model an existing database, seed.
    let db = open();
    await ensureSchema(db);
    await db.prepare("DROP INDEX IF EXISTS idx_entities_user_type").run();
    await db.close();
    const t0 = performance.now();
    seed(file, n);
    const seedS = ((performance.now() - t0) / 1000).toFixed(1);
    const sizeBefore = fs.statSync(file).size;

    db = open();
    const before = [];
    for (const [, sql, p] of QUERIES) before.push(await time(db, sql, p));
    const tb = performance.now();
    await ensureSchema(db); // the boot path: builds the index on this existing DB
    const bootMs = performance.now() - tb;
    await db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    const sizeAfter = fs.statSync(file).size;
    const after = [];
    for (const [, sql, p] of QUERIES) after.push(await time(db, sql, p));
    // Bare build time on a second drop/create cycle.
    await db.prepare("DROP INDEX idx_entities_user_type").run();
    const tc = performance.now();
    await db
      .prepare("CREATE INDEX idx_entities_user_type ON entities(user_id, entity_type, id)")
      .run();
    const createMs = performance.now() - tc;
    await db.close();

    console.log(`\n== ${driver} @ ${n.toLocaleString()} entity rows (seed ${seedS}s) ==`);
    console.log(
      `db size: ${(sizeBefore / 1e6).toFixed(0)} MB -> ${(sizeAfter / 1e6).toFixed(0)} MB (+${((sizeAfter - sizeBefore) / 1e6).toFixed(1)} MB)`
    );
    console.log(
      `index build: bare CREATE INDEX ${(createMs / 1000).toFixed(2)} s; ensureSchema on existing DB ${(bootMs / 1000).toFixed(2)} s`
    );
    QUERIES.forEach(([label], i) =>
      console.log(
        `${label.padEnd(40)} before ${before[i].toFixed(1).padStart(8)} ms   after ${after[i].toFixed(2).padStart(8)} ms`
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
