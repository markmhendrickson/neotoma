/**
 * After an entity lifecycle cutover is recorded, every visibility check
 * (`isEntityDeleted` -> `acquireEntityLifecycleContext`) must be a keyed lookup.
 *
 * Reported symptom (hosted-instance list freeze, mail-sized type): a 500-entity
 * page took 31 s on a store with a recorded cutover while the same read on the
 * same data without one took tens of milliseconds. The count and the page both
 * run the visibility selector once per entity, and two of its statements were
 * full scans, so the cost per entity grew with the whole store (membership rows,
 * observations) and a page cost O(page x store):
 *
 *  - the attached-membership join scanned every membership row;
 *  - the baseline lookup could not use the partial unique index because it did
 *    not state `entity_lifecycle_kind IS NOT NULL`;
 *  - the membership-by-target read walked the owner's whole membership range.
 *
 * Checked to FAIL on the pre-fix statements (plan assertions below).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import {
  acquireEntityLifecycleContext,
  migrateEntityLifecycleAuthority,
} from "../../src/services/entity_lifecycle_storage.js";

const ENTITIES = 300;

describe("recorded-cutover visibility checks use keyed lookups", () => {
  let dir: string;
  let database: AsyncSqliteDatabase;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "neotoma-lifecycle-plans-"));
    database = new AsyncSqliteDatabase(path.join(dir, "plans.sqlite"));
    await database.exec(`CREATE TABLE entities(id TEXT PRIMARY KEY, user_id TEXT, entity_type TEXT, merged_to_entity_id TEXT);
      CREATE TABLE observations(id TEXT PRIMARY KEY, entity_id TEXT, user_id TEXT, entity_type TEXT, schema_version TEXT, observed_at TEXT, created_at TEXT, source_priority INTEGER, observation_source TEXT, fields TEXT);
      CREATE INDEX idx_observations_entity_id ON observations(entity_id, source_priority, observed_at);`);
    const insertEntity = database.prepare(
      "INSERT INTO entities(id, user_id, entity_type) VALUES (?, 'owner', 'synthetic')"
    );
    const insertObservation = database.prepare(
      "INSERT INTO observations(id, entity_id, user_id, entity_type, schema_version, observed_at, created_at, source_priority, fields) VALUES (?, ?, 'owner', 'synthetic', '1.0', '2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z', 10, '{\"title\":\"fact\"}')"
    );
    for (let i = 0; i < ENTITIES; i++) {
      await insertEntity.run(`ent_${i}`);
      await insertObservation.run(`fact_${i}_a`, `ent_${i}`);
      await insertObservation.run(`fact_${i}_b`, `ent_${i}`);
    }
    await migrateEntityLifecycleAuthority(database);
  });

  afterEach(async () => {
    await database.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("acquires a context without scanning observations or membership", async () => {
    const captured: string[] = [];
    const original = database.prepare.bind(database);
    (database as { prepare: typeof database.prepare }).prepare = (sql: string) => {
      captured.push(sql);
      return original(sql);
    };
    const target = { id: "ent_7", user_id: "owner", entity_type: "synthetic" };
    const rows = (await original(
      "SELECT * FROM observations WHERE entity_id = ? ORDER BY observed_at DESC"
    ).all(target.id)) as never[];
    const context = await acquireEntityLifecycleContext(database, target, rows);
    expect(context.mode).toBe("current");

    const lifecycle = captured.filter((sql) =>
      /entity_lifecycle_legacy_membership|entity_lifecycle_sequence/.test(sql)
    );
    expect(lifecycle.length).toBeGreaterThanOrEqual(3);
    for (const sql of lifecycle) {
      const plan = (await original(`EXPLAIN QUERY PLAN ${sql}`).all(
        ...Array.from({ length: (sql.match(/\?/g) ?? []).length }, () => "x")
      )) as { detail: string }[];
      for (const step of plan) {
        expect(step.detail, `${sql}\n${step.detail}`).not.toMatch(
          /^SCAN (observations|o|m|entity_lifecycle_legacy_membership)\b/
        );
        // A SEARCH on only the owner prefix still walks the owner's whole range.
        expect(step.detail, `${sql}\n${step.detail}`).not.toMatch(
          /entity_lifecycle_legacy_membership.*\(cutover_id=\? AND owner_id=\?\)$/
        );
      }
    }
  });
});
