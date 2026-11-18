/**
 * Store and create_relationship lookups that read a whole table on every write
 * (see the store-path index fix). Two lookups on `entities` carry entity_type
 * (and canonical_name) but no user_id, and every older entities index leads
 * with user_id; `relationship_observations` had no index besides its primary
 * key. Each statement below mirrors the real query shape and its plan is
 * checked on both drivers. All fail on the pre-change schema, where the plans
 * are `SCAN entities` / `SCAN relationship_observations`.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { ensureSchema } from "../../src/repositories/sqlite/sqlite_client.js";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import { openLibsqlDatabase } from "../../src/repositories/libsql/libsql_driver.js";
import type { DbDatabase } from "../../src/repositories/db/driver.js";

const dirs: string[] = [];
const open: DbDatabase[] = [];
afterAll(async () => {
  while (open.length) await open.pop()!.close();
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

const drivers: Array<[string, (file: string) => DbDatabase]> = [
  ["sqlite", (f) => new AsyncSqliteDatabase(f)],
  ["libsql", (f) => openLibsqlDatabase(`file:${f}`, { busyTimeoutMs: 5000 })],
];

const cases: Array<{
  label: string;
  sql: string;
  params: unknown[];
  search: RegExp;
  scan: RegExp;
}> = [
  {
    label: "canonical-name collision check (entity_type + canonical_name, no user_id)",
    sql: "SELECT id FROM entities WHERE entity_type = ? AND canonical_name = ? AND id != ? LIMIT 1",
    params: ["task", "synthetic task", "ent_synthetic"],
    search: /SEARCH entities USING (COVERING )?INDEX idx_entities_type_name/,
    scan: /SCAN entities\b/,
  },
  {
    label: "instance-policy merge filter (entity_type alone)",
    sql: "SELECT id, merged_to_entity_id FROM entities WHERE entity_type = ?",
    params: ["instance_policy"],
    search: /SEARCH entities USING (COVERING )?INDEX idx_entities_type_name/,
    scan: /SCAN entities\b/,
  },
  {
    label: "relationship observation existence check",
    sql: "SELECT id FROM relationship_observations WHERE relationship_key = ? AND user_id = ? LIMIT 1",
    params: ["PART_OF:ent_a:ent_b", "user_synthetic"],
    search:
      /SEARCH relationship_observations USING (COVERING )?INDEX idx_relationship_observations_key_user/,
    scan: /SCAN relationship_observations\b/,
  },
  {
    label: "relationship observations ordered for the reducer",
    sql: "SELECT * FROM relationship_observations WHERE relationship_key = ? AND user_id = ? ORDER BY observed_at DESC",
    params: ["PART_OF:ent_a:ent_b", "user_synthetic"],
    search:
      /SEARCH relationship_observations USING (COVERING )?INDEX idx_relationship_observations_key_user/,
    scan: /SCAN relationship_observations\b/,
  },
  {
    label: "relationship deletion check ordered by priority",
    sql: "SELECT source_priority, observed_at, metadata FROM relationship_observations WHERE relationship_key = ? AND user_id = ? ORDER BY source_priority DESC, observed_at DESC LIMIT 1",
    params: ["PART_OF:ent_a:ent_b", "user_synthetic"],
    search:
      /SEARCH relationship_observations USING (COVERING )?INDEX idx_relationship_observations_key_user/,
    scan: /SCAN relationship_observations\b/,
  },
];

describe.each(drivers)("store-path write indexes (%s driver)", (_name, make) => {
  async function fresh(): Promise<DbDatabase> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-writeidx-"));
    dirs.push(dir);
    const db = make(path.join(dir, "t.db"));
    open.push(db);
    await ensureSchema(db);
    return db;
  }

  it("creates both indexes in ensureSchema, idempotently", async () => {
    const db = await fresh();
    const names = async () =>
      (
        (await db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_entities_type_name', 'idx_relationship_observations_key_user') ORDER BY name"
          )
          .all()) as Array<{ name: string }>
      ).map((r) => r.name);
    expect(await names()).toEqual([
      "idx_entities_type_name",
      "idx_relationship_observations_key_user",
    ]);
    await db.prepare("DROP INDEX idx_entities_type_name").run();
    await db.prepare("DROP INDEX idx_relationship_observations_key_user").run();
    expect(await names()).toEqual([]);
    await ensureSchema(db);
    await ensureSchema(db);
    expect(await names()).toEqual([
      "idx_entities_type_name",
      "idx_relationship_observations_key_user",
    ]);
  });

  it.each(cases)(
    "plans $label as an index SEARCH, not a SCAN",
    async ({ sql, params, search, scan }) => {
      const db = await fresh();
      const rows = (await db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params)) as Array<{
        detail: string;
      }>;
      const details = rows.map((r) => r.detail).join(" | ");
      expect(details).not.toMatch(scan);
      expect(details).toMatch(search);
    }
  );
});
