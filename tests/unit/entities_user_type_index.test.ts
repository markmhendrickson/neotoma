/**
 * `entities` had no index besides its primary key, so listing and certificate
 * reads scoped by (user_id, entity_type) full-scanned it. These tests take the
 * SQL from the REAL `queryEntities` / `certifySnapshotPopulation` code (by
 * wrapping `prepare`), so a later builder change cannot drift from the test,
 * and assert on EXPLAIN QUERY PLAN that every shape is an index SEARCH on the
 * intended index with no table SCAN and, except where noted, no temp b-tree
 * sort. The empty tables are deliberate: production has no ANALYZE stats, so
 * the planner chooses by index shape alone, which is what is being pinned. Each
 * assertion fails on the pre-change schema (the id-order shapes fail because
 * the primary key is a SCAN, the name shapes because of the temp sort).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDb } from "../../src/repositories/db/connection.js";
import { ensureSchema } from "../../src/repositories/sqlite/sqlite_client.js";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import { openLibsqlDatabase } from "../../src/repositories/libsql/libsql_driver.js";
import type { DbDatabase } from "../../src/repositories/db/driver.js";
import { queryEntities } from "../../src/services/entity_queries.js";
import { encodeCursor } from "../../src/services/entity_cursor.js";
import { certifySnapshotPopulation } from "../../src/services/entity_population_certificate.js";

type Shape = {
  sql: string;
  params: unknown[];
  index: string;
  /** Multi-type IN (...) is planned as an id-ordered walk of the user's rows. */
  allowTempSort?: boolean;
};
const shapes: Record<string, Shape> = {};

async function capture(
  label: string,
  index: string,
  run: () => Promise<unknown>,
  allowTempSort = false
): Promise<void> {
  const database = await getDb();
  const original = database.prepare.bind(database);
  const seen: Array<{ sql: string; params: unknown[] }> = [];
  (database as { prepare: typeof database.prepare }).prepare = (sql: string) => {
    const statement = original(sql);
    for (const method of ["all", "get"] as const) {
      const fn = statement[method].bind(statement) as (...p: unknown[]) => Promise<unknown>;
      (statement as unknown as Record<string, unknown>)[method] = async (...params: unknown[]) => {
        if (/FROM entities\b/.test(sql) && !/EXPLAIN/.test(sql)) seen.push({ sql, params });
        return fn(...params);
      };
    }
    return statement;
  };
  try {
    await run();
  } finally {
    (database as { prepare: typeof database.prepare }).prepare = original;
  }
  const first = seen[0];
  if (!first) throw new Error(`no entities SQL captured for ${label}`);
  shapes[label] = { ...first, index, allowTempSort };
}

const U = "plan-test-user";
beforeAll(async () => {
  const cur = (sort_order: "asc" | "desc", entity_id: string) =>
    encodeCursor({ v: 1, sort_by: "entity_id", sort_order, entity_id });
  await capture("type-less listing", "idx_entities_user_live_id", () =>
    queryEntities({ userId: U, limit: 5 })
  );
  await capture("keyset id > ?", "idx_entities_user_live_id", () =>
    queryEntities({ userId: U, limit: 5, cursor: cur("asc", "ent_a") })
  );
  await capture("keyset id < ? DESC", "idx_entities_user_live_id", () =>
    queryEntities({ userId: U, limit: 5, sortOrder: "desc", cursor: cur("desc", "ent_z") })
  );
  await capture("single type", "idx_entities_user_type_live_id", () =>
    queryEntities({ userId: U, entityType: "t", limit: 5 })
  );
  await capture("single type keyset", "idx_entities_user_type_live_id", () =>
    queryEntities({ userId: U, entityType: "t", limit: 5, cursor: cur("asc", "ent_a") })
  );
  await capture(
    "multi type IN (...)",
    "idx_entities_user_live_id",
    () => queryEntities({ userId: U, entityTypes: ["t", "v"], limit: 5 }),
    true
  );
  await capture("name sort, type-less", "idx_entities_user_live_name", () =>
    queryEntities({ userId: U, limit: 5, sortBy: "canonical_name" })
  );
  await capture("name sort, single type", "idx_entities_user_type_live_name", () =>
    queryEntities({ userId: U, entityType: "t", limit: 5, sortBy: "canonical_name" })
  );
  await capture("population certificate", "idx_entities_user_type_live", () =>
    certifySnapshotPopulation(U, ["t"])
  );
}, 60_000);

const dirs: string[] = [];
const open: DbDatabase[] = [];
afterAll(async () => {
  while (open.length) await open.pop()!.close();
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

async function plan(db: DbDatabase, sql: string, params: unknown[]): Promise<string[]> {
  const rows = (await db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params)) as Array<{
    detail: string;
  }>;
  return rows.map((r) => r.detail);
}

const drivers: Array<[string, (file: string) => DbDatabase]> = [
  ["sqlite", (f) => new AsyncSqliteDatabase(f)],
  ["libsql", (f) => openLibsqlDatabase(`file:${f}`, { busyTimeoutMs: 5000 })],
];

describe.each(drivers)("entities indexes (%s driver)", (_name, make) => {
  async function fresh(): Promise<DbDatabase> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-entidx-"));
    dirs.push(dir);
    const db = make(path.join(dir, "t.db"));
    open.push(db);
    await ensureSchema(db);
    return db;
  }

  it("plans every captured shape as a SEARCH on its intended index", async () => {
    const db = await fresh();
    for (const [label, shape] of Object.entries(shapes)) {
      const details = await plan(db, shape.sql, shape.params);
      const line = details.find((d) => /^(SEARCH|SCAN) (e|entities)\b/.test(d));
      expect(line, `${label}: ${details.join(" | ")}`).toBeDefined();
      expect(line, label).toMatch(/^SEARCH/);
      expect(line, label).toContain(shape.index);
      expect(details.join("\n"), label).not.toMatch(/SCAN (e|entities)\b/);
      if (!shape.allowTempSort) {
        expect(details.join("\n"), label).not.toMatch(/TEMP B-TREE FOR ORDER BY/);
      }
    }
  });

  it("is built idempotently on an existing database that lacks the indexes", async () => {
    const db = await fresh();
    const names = async () =>
      (
        (await db
          .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_entities_%'")
          .all()) as Array<{ name: string }>
      )
        .map((r) => r.name)
        .sort();
    const built = await names();
    expect(built).toHaveLength(4);
    for (const name of built) await db.prepare(`DROP INDEX ${name}`).run();
    expect(await names()).toEqual([]);
    await ensureSchema(db);
    await ensureSchema(db); // second open must be a no-op
    expect(await names()).toEqual(built);
  });
});
