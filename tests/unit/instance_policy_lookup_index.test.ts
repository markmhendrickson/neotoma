/**
 * The instance-policy lookup filters entity_snapshots on entity_type alone:
 * the policy is instance-wide by design, so the lookup carries no user id and
 * cannot use idx_entity_snapshots_user_type. It runs on every MCP initialize
 * and every policy-enforced write, and was a full table SCAN. The SQL is taken
 * from the REAL getInstancePolicyResult (by wrapping `prepare`) so the test
 * cannot drift from the code, and the plan is checked on both drivers. It
 * fails on the pre-change schema, where the plan is `SCAN entity_snapshots`.
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
import { getInstancePolicyResult } from "../../src/services/instance_policy.js";

let captured: { sql: string; params: unknown[] } | undefined;

beforeAll(async () => {
  const database = await getDb();
  const original = database.prepare.bind(database);
  (database as { prepare: typeof database.prepare }).prepare = (sql: string) => {
    const statement = original(sql);
    for (const method of ["all", "get"] as const) {
      const fn = statement[method].bind(statement) as (...p: unknown[]) => Promise<unknown>;
      (statement as unknown as Record<string, unknown>)[method] = async (...params: unknown[]) => {
        if (!captured && /FROM entity_snapshots\b/.test(sql) && !/EXPLAIN/.test(sql)) {
          captured = { sql, params };
        }
        return fn(...params);
      };
    }
    return statement;
  };
  try {
    await getInstancePolicyResult();
  } finally {
    (database as { prepare: typeof database.prepare }).prepare = original;
  }
}, 60_000);

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

describe.each(drivers)("instance-policy lookup index (%s driver)", (_name, make) => {
  async function fresh(): Promise<DbDatabase> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-policyidx-"));
    dirs.push(dir);
    const db = make(path.join(dir, "t.db"));
    open.push(db);
    await ensureSchema(db);
    return db;
  }

  it("captures the lookup SQL and it filters on entity_type without user_id", () => {
    expect(captured, "no entity_snapshots SQL captured").toBeDefined();
    expect(captured!.sql).toMatch(/entity_type/);
    expect(captured!.params.flat()).toContain("instance_policy");
    expect(captured!.sql).not.toMatch(/user_id/);
  });

  it("plans the lookup as an index SEARCH, not a full scan of entity_snapshots", async () => {
    const db = await fresh();
    const rows = (await db
      .prepare(`EXPLAIN QUERY PLAN ${captured!.sql}`)
      .all(...captured!.params)) as Array<{ detail: string }>;
    const details = rows.map((r) => r.detail).join(" | ");
    expect(details).not.toMatch(/SCAN entity_snapshots\b/);
    expect(details).toMatch(/SEARCH entity_snapshots USING (COVERING )?INDEX idx_entity_snapshots_type/);
  });

  it("is built idempotently on an existing database that lacks the index", async () => {
    const db = await fresh();
    const has = async () =>
      (
        (await db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='index' AND name = 'idx_entity_snapshots_type'"
          )
          .all()) as Array<{ name: string }>
      ).length;
    expect(await has()).toBe(1);
    await db.prepare("DROP INDEX idx_entity_snapshots_type").run();
    expect(await has()).toBe(0);
    await ensureSchema(db);
    await ensureSchema(db);
    expect(await has()).toBe(1);
  });
});
