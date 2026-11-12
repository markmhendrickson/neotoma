/**
 * `entities` had no index besides its primary key, so the /entities/query page
 * query and the population-certificate scans full-scanned the table. This
 * asserts, from EXPLAIN QUERY PLAN on the real query shapes, that the
 * (user_id, entity_type, id) index serves them, that ensureSchema builds it on
 * an existing database that lacks it, and that both drivers behave the same.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ensureSchema } from "../../src/repositories/sqlite/sqlite_client.js";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import { openLibsqlDatabase } from "../../src/repositories/libsql/libsql_driver.js";
import type { DbDatabase } from "../../src/repositories/db/driver.js";

const PAGE_QUERIES: Record<string, string> = {
  page_single_type:
    "SELECT * FROM entities WHERE user_id = ? AND entity_type = ? AND merged_to_entity_id IS NULL ORDER BY id ASC LIMIT 5",
  page_multi_type:
    "SELECT * FROM entities WHERE user_id = ? AND entity_type IN (?, ?) AND merged_to_entity_id IS NULL ORDER BY id ASC LIMIT 5",
  page_keyset:
    "SELECT * FROM entities WHERE user_id = ? AND entity_type = ? AND merged_to_entity_id IS NULL AND id > 'ent_a' ORDER BY id ASC LIMIT 5",
  certificate_missing_snapshots:
    "SELECT e.id,e.user_id,e.entity_type FROM entities e LEFT JOIN entity_snapshots s ON s.entity_id=e.id AND s.user_id=e.user_id AND s.entity_type=e.entity_type WHERE e.user_id=? AND e.merged_to_entity_id IS NULL AND e.entity_type IN (?) AND s.entity_id IS NULL",
};

const dirs: string[] = [];
const open: DbDatabase[] = [];
afterEach(async () => {
  while (open.length) await open.pop()!.close();
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

async function plan(db: DbDatabase, sql: string): Promise<string[]> {
  const params = Array.from({ length: (sql.match(/\?/g) ?? []).length }, (_, i) => `p${i}`);
  const rows = (await db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params)) as Array<{
    detail: string;
  }>;
  return rows.map((r) => r.detail);
}

const drivers: Array<[string, (file: string) => DbDatabase]> = [
  ["sqlite", (f) => new AsyncSqliteDatabase(f)],
  ["libsql", (f) => openLibsqlDatabase(`file:${f}`, { busyTimeoutMs: 5000 })],
];

describe.each(drivers)("idx_entities_user_type (%s driver)", (_name, make) => {
  async function fresh(): Promise<DbDatabase> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-entidx-"));
    dirs.push(dir);
    const db = make(path.join(dir, "t.db"));
    open.push(db);
    await ensureSchema(db);
    return db;
  }

  it("serves the page and certificate queries from the index, not a table scan", async () => {
    const db = await fresh();
    for (const [label, sql] of Object.entries(PAGE_QUERIES)) {
      const details = await plan(db, sql);
      const entitiesLine = details.find((d) => /^(SEARCH|SCAN) (e|entities)\b/.test(d));
      expect(entitiesLine, label).toBeDefined();
      expect(entitiesLine, label).toMatch(/SEARCH/);
      expect(entitiesLine, label).toContain("idx_entities_user_type");
      expect(details.join("\n"), label).not.toMatch(/SCAN (e|entities)\b/);
    }
  });

  it("serves ORDER BY id from index order without a sort step", async () => {
    const db = await fresh();
    const details = await plan(db, PAGE_QUERIES.page_single_type);
    expect(details.join("\n")).not.toMatch(/TEMP B-TREE/);
  });

  it("is built idempotently on an existing database that lacks it", async () => {
    const db = await fresh();
    await db.prepare("DROP INDEX idx_entities_user_type").run();
    const exists = async () =>
      (
        (await db
          .prepare("SELECT name FROM sqlite_master WHERE name = 'idx_entities_user_type'")
          .all()) as unknown[]
      ).length;
    expect(await exists()).toBe(0);
    await ensureSchema(db);
    await ensureSchema(db); // second open must be a no-op
    expect(await exists()).toBe(1);
    const after = await plan(db, PAGE_QUERIES.page_single_type);
    expect(after.join("\n")).toContain("idx_entities_user_type");
  });
});
