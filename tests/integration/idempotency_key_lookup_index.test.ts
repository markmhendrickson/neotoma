/**
 * Idempotency-key replay lookups must be indexed.
 *
 * `correct` looks up `observations WHERE user_id = ? AND idempotency_key = ?`
 * (existingCorrectionForKey) inside a write transaction that holds the single
 * SQLite write gate; store admission does the same against `sources`. With no
 * index both were full table scans, so write-gate hold time grew with table size
 * (14-58 s per correct on a hosted instance, 2026-11-13).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyConnectionPragmas,
  ensureSchema,
} from "../../src/repositories/sqlite/sqlite_client.js";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";

const CASES = [
  { table: "observations", index: "idx_observations_user_idempotency" },
  { table: "sources", index: "idx_sources_user_idempotency" },
];

describe("idempotency_key lookup indexes", () => {
  let dir: string;
  let database: AsyncSqliteDatabase;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-idem-index-"));
    database = new AsyncSqliteDatabase(path.join(dir, "index.sqlite"));
    await applyConnectionPragmas(database);
    await ensureSchema(database);
  });

  afterEach(async () => {
    await database.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  for (const { table, index } of CASES) {
    it(`${table}: index exists on (user_id, idempotency_key) and is idempotent`, async () => {
      await ensureSchema(database);
      const cols = (await database.prepare(`PRAGMA index_info(${index})`).all()) as Array<{
        seqno: number;
        name: string;
      }>;
      expect(cols.sort((a, b) => a.seqno - b.seqno).map((c) => c.name)).toEqual([
        "user_id",
        "idempotency_key",
      ]);
    });

    it(`${table}: idempotency lookup is an index SEARCH, not a SCAN`, async () => {
      const plan = (await database
        .prepare(
          `EXPLAIN QUERY PLAN SELECT id FROM ${table} WHERE user_id = ? AND idempotency_key = ? LIMIT 1`
        )
        .all("u", "k")) as Array<{ detail: string }>;
      const detail = plan.map((p) => p.detail).join(" | ");
      expect(detail).toContain(`SEARCH ${table} USING INDEX ${index}`);
      expect(detail).not.toMatch(/SCAN/);
    });
  }
});
