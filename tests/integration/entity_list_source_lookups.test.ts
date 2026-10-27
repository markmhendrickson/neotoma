/**
 * Entity listing and fragment upsert must reach `raw_fragments` / `observations`
 * through an index, and a listing page must fetch only its own fragments.
 *
 * Reported symptom (a hosted instance on the single-connection SQLite backend):
 * `GET /entities?entity_type=<large type>&limit=500` took seconds and froze every
 * other request while it ran, with cost that tracked the TYPE's stored volume
 * rather than the page size, and a store of a few dozen entities froze it too.
 * Two causes, both in how `raw_fragments` and `observations` are reached:
 *
 *  1. No index on `source_id` (or on `raw_fragments.entity_id`), so every source
 *     lookup and every per-fragment upsert probe was a full table scan.
 *  2. The listing fetched fragments by `source_id` alone. A source is shared by
 *     every entity it stored, and a page's entities are spread across all of
 *     those sources, so the fetch returned (and JSON-parsed) the fragments of the
 *     whole entity type on every request. An index on `source_id` alone cannot
 *     fix that; the fetch has to be bounded to the page's own entity ids.
 *
 * Each assertion below was checked to FAIL against the pre-fix code: the index
 * and plan assertions on the old schema, and the bounded-fetch assertion on the
 * old query.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../../src/repositories/db/connection.js";
import {
  applyConnectionPragmas,
  ensureSchema,
} from "../../src/repositories/sqlite/sqlite_client.js";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import { queryEntities } from "../../src/services/entity_queries.js";
import { storeFragment } from "../../src/services/raw_fragments.js";

const EXPECTED_INDEXES: Record<string, { table: string; columns: string[] }> = {
  idx_observations_source: {
    table: "observations",
    columns: ["source_id", "entity_type", "entity_id"],
  },
  idx_raw_fragments_entity_source: {
    table: "raw_fragments",
    columns: ["entity_id", "source_id"],
  },
  idx_raw_fragments_source_key: {
    table: "raw_fragments",
    columns: ["source_id", "fragment_key", "entity_id"],
  },
};

async function indexColumns(
  database: { prepare(sql: string): { all(...p: unknown[]): Promise<unknown[]> } },
  name: string
): Promise<string[]> {
  const rows = (await database.prepare(`PRAGMA index_info(${name})`).all()) as Array<{
    seqno: number;
    name: string;
  }>;
  return rows.sort((a, b) => a.seqno - b.seqno).map((row) => row.name);
}

describe("source_id / entity_id index schema", () => {
  let dir: string;
  let database: AsyncSqliteDatabase;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-source-index-"));
    database = new AsyncSqliteDatabase(path.join(dir, "index.sqlite"));
    await applyConnectionPragmas(database);
    await ensureSchema(database);
  });

  afterEach(async () => {
    await database.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("creates each index on a fresh database with the expected key columns", async () => {
    for (const [name, spec] of Object.entries(EXPECTED_INDEXES)) {
      const row = (await database
        .prepare("SELECT tbl_name FROM sqlite_master WHERE type = 'index' AND name = ?")
        .get(name)) as { tbl_name: string } | undefined;
      expect(row?.tbl_name, `${name} must exist`).toBe(spec.table);
      expect(await indexColumns(database, name)).toEqual(spec.columns);
    }
  });

  it("builds missing indexes on an already-populated database and is idempotent", async () => {
    const now = new Date().toISOString();
    const insertFragment = database.prepare(
      "INSERT INTO raw_fragments (id, source_id, entity_id, entity_type, fragment_key, fragment_value, user_id, created_at) VALUES (?,?,?,?,?,?,?,?)"
    );
    const insertObservation = database.prepare(
      "INSERT INTO observations (id, entity_id, entity_type, schema_version, source_id, observed_at, source_priority, fields, user_id) VALUES (?,?,?,?,?,?,?,?,?)"
    );
    for (let i = 0; i < 200; i++) {
      await insertFragment.run(
        `frag_${i}`,
        `src_${i % 7}`,
        `ent_${i}`,
        "t",
        `k${i}`,
        '"v"',
        "u",
        now
      );
      await insertObservation.run(
        `obs_${i}`,
        `ent_${i}`,
        "t",
        "1.0",
        `src_${i % 7}`,
        now,
        100,
        "{}",
        "u"
      );
    }
    // Simulate a store created before these indexes existed.
    for (const name of Object.keys(EXPECTED_INDEXES)) {
      await database.exec(`DROP INDEX ${name}`);
    }

    await ensureSchema(database);
    await ensureSchema(database); // second open is a no-op, not an error

    for (const [name, spec] of Object.entries(EXPECTED_INDEXES)) {
      expect(await indexColumns(database, name)).toEqual(spec.columns);
    }
    const counts = (await database
      .prepare(
        "SELECT (SELECT COUNT(*) FROM raw_fragments) AS f, (SELECT COUNT(*) FROM observations) AS o"
      )
      .get()) as { f: number; o: number };
    expect(counts).toEqual({ f: 200, o: 200 });
  });
});

describe("entity listing fragment lookups", () => {
  const userId = randomUUID();
  const entityType = `idxtest_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const entityIds: string[] = [];
  const sourceIds: string[] = [];
  const SOURCES = 3;
  const PER_SOURCE = 4; // entities that share one source
  const PAGE = 4;

  type Captured = { sql: string; params: unknown[]; rows: number };
  let captured: Captured[] = [];
  let restore: (() => void) | null = null;

  async function instrument(): Promise<void> {
    const database = await getDb();
    const original = database.prepare.bind(database);
    (database as { prepare: typeof database.prepare }).prepare = (sql: string) => {
      const statement = original(sql);
      const wrapped = statement.all.bind(statement);
      statement.all = async (...params: unknown[]) => {
        const rows = await wrapped(...params);
        captured.push({ sql, params, rows: rows.length });
        return rows;
      };
      return statement;
    };
    restore = () => {
      (database as { prepare: typeof database.prepare }).prepare = original;
    };
  }

  async function seed(): Promise<void> {
    const database = await getDb();
    const now = new Date().toISOString();
    const insertEntity = database.prepare(
      "INSERT INTO entities (id, entity_type, canonical_name, user_id, created_at, updated_at) VALUES (?,?,?,?,?,?)"
    );
    const insertSnapshot = database.prepare(
      "INSERT INTO entity_snapshots (entity_id, entity_type, schema_version, snapshot, computed_at, observation_count, last_observation_at, provenance, user_id) VALUES (?,?,?,?,?,?,?,?,?)"
    );
    const insertObservation = database.prepare(
      "INSERT INTO observations (id, entity_id, entity_type, schema_version, source_id, observed_at, source_priority, fields, user_id) VALUES (?,?,?,?,?,?,?,?,?)"
    );
    const insertFragment = database.prepare(
      "INSERT INTO raw_fragments (id, source_id, entity_id, entity_type, fragment_key, fragment_value, user_id, first_seen, last_seen, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
    );

    for (let s = 0; s < SOURCES; s++) sourceIds.push(`src_${entityType}_${s}`);
    // Ids sort ascending, and entity i stores under source (i % SOURCES), so the
    // first PAGE entities touch EVERY source while the rest share those sources.
    const total = SOURCES * PER_SOURCE;
    for (let i = 0; i < total; i++) {
      const id = `ent_${entityType}_${String(i).padStart(2, "0")}`;
      const source = sourceIds[i % SOURCES];
      entityIds.push(id);
      await insertEntity.run(id, entityType, `e${i}`, userId, now, now);
      await insertSnapshot.run(
        id,
        entityType,
        "1.0",
        JSON.stringify({ name: `e${i}` }),
        now,
        1,
        now,
        "{}",
        userId
      );
      await insertObservation.run(
        `obs_${id}`,
        id,
        entityType,
        "1.0",
        source,
        now,
        100,
        "{}",
        userId
      );
      for (let f = 0; f < 2; f++) {
        await insertFragment.run(
          `frag_${id}_${f}`,
          source,
          id,
          entityType,
          `extra_${f}`,
          JSON.stringify(`value-${i}-${f}`),
          userId,
          now,
          now,
          now
        );
      }
    }
  }

  beforeEach(async () => {
    entityIds.length = 0;
    sourceIds.length = 0;
    captured = [];
    await seed();
    await instrument();
  });

  afterEach(async () => {
    restore?.();
    const database = await getDb();
    await database.prepare("DELETE FROM raw_fragments WHERE entity_type = ?").run(entityType);
    await database.prepare("DELETE FROM observations WHERE entity_type = ?").run(entityType);
    await database.prepare("DELETE FROM entity_snapshots WHERE entity_type = ?").run(entityType);
    await database.prepare("DELETE FROM entities WHERE entity_type = ?").run(entityType);
  });

  const fragmentStatements = () =>
    captured.filter((c) => /\bFROM raw_fragments\b/.test(c.sql) && /fragment_value/.test(c.sql));

  it("returns each page entity's own fragments, and only those", async () => {
    const page = await queryEntities({ userId, entityType, limit: PAGE, includeSnapshots: true });
    expect(page.map((e) => e.entity_id)).toEqual(entityIds.slice(0, PAGE));
    for (const entity of page) {
      expect(Object.keys(entity.raw_fragments ?? {}).sort()).toEqual(["extra_0", "extra_1"]);
    }
  });

  it("fetches only the page's own fragments, not the whole type's", async () => {
    await queryEntities({ userId, entityType, limit: PAGE, includeSnapshots: true });
    const fetched = fragmentStatements().reduce((sum, c) => sum + c.rows, 0);
    // PAGE entities x 2 fragments. Source-only filtering returned
    // SOURCES * PER_SOURCE * 2 (every entity sharing a touched source).
    expect(fetched).toBe(PAGE * 2);
    expect(fetched).toBeLessThan(SOURCES * PER_SOURCE * 2);
  });

  it("reaches raw_fragments and observations by index, never a table scan", async () => {
    // A legacy fragment (no entity_id) forces the source -> entity link lookup
    // through observations, so that statement is part of the plan check too.
    const database = await getDb();
    const now = new Date().toISOString();
    await database
      .prepare(
        "INSERT INTO raw_fragments (id, source_id, entity_id, entity_type, fragment_key, fragment_value, user_id, first_seen, last_seen, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
      )
      .run(
        `frag_legacy_${entityType}`,
        sourceIds[0],
        null,
        entityType,
        "legacy_key",
        '"legacy"',
        userId,
        now,
        now,
        now
      );

    await queryEntities({ userId, entityType, limit: PAGE, includeSnapshots: true });

    const sourceKeyed = captured.filter(
      (c) =>
        /\bFROM (raw_fragments|observations)\b/.test(c.sql) &&
        /\b(source_id|entity_id)\b/.test(c.sql)
    );
    expect(sourceKeyed.length).toBeGreaterThanOrEqual(3);
    const original = restore;
    original?.();
    restore = null;
    const underlying = await getDb();
    for (const statement of sourceKeyed) {
      const plan = (
        (await underlying
          .prepare(`EXPLAIN QUERY PLAN ${statement.sql}`)
          .all(...statement.params)) as Array<{ detail: string }>
      )
        .map((row) => row.detail)
        .join(" | ");
      expect(plan, statement.sql).not.toMatch(/\bSCAN (raw_fragments|observations)\b/);
      expect(plan, statement.sql).toMatch(/USING (COVERING )?INDEX/);
    }
    // The legacy link statement is covered by the observations index.
    const link = sourceKeyed.find(
      (c) =>
        /FROM observations/.test(c.sql) &&
        /entity_type = \?/.test(c.sql) &&
        /source_id IN/.test(c.sql)
    );
    expect(link, "legacy link lookup must run when a NULL-entity fragment exists").toBeDefined();
  });

  it("still attributes a legacy fragment through its source, but only when one entity owns the source", async () => {
    const database = await getDb();
    const now = new Date().toISOString();
    // Source owned by exactly one entity (the first page entity): attributed to it.
    const soleSource = `src_${entityType}_sole`;
    await database
      .prepare(
        "INSERT INTO observations (id, entity_id, entity_type, schema_version, source_id, observed_at, source_priority, fields, user_id) VALUES (?,?,?,?,?,?,?,?,?)"
      )
      .run(
        `obs_sole_${entityType}`,
        entityIds[0],
        entityType,
        "1.0",
        soleSource,
        now,
        100,
        "{}",
        userId
      );
    await database
      .prepare(
        "INSERT INTO raw_fragments (id, source_id, entity_id, entity_type, fragment_key, fragment_value, user_id, first_seen, last_seen, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
      )
      .run(
        `frag_sole_${entityType}`,
        soleSource,
        null,
        entityType,
        "legacy_sole",
        '"sole"',
        userId,
        now,
        now,
        now
      );
    // Legacy fragment under a source shared by two entities: attributed to neither.
    const sharedSource = sourceIds[0];
    await database
      .prepare(
        "INSERT INTO raw_fragments (id, source_id, entity_id, entity_type, fragment_key, fragment_value, user_id, first_seen, last_seen, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
      )
      .run(
        `frag_shared_${entityType}`,
        sharedSource,
        null,
        entityType,
        "legacy_shared",
        '"shared"',
        userId,
        now,
        now,
        now
      );

    const page = await queryEntities({ userId, entityType, limit: PAGE, includeSnapshots: true });
    const first = page[0].raw_fragments ?? {};
    expect(first.legacy_sole).toBe("sole");
    for (const entity of page) {
      expect(entity.raw_fragments ?? {}).not.toHaveProperty("legacy_shared");
    }
  });

  it("never leaks a fragment that names a different entity or a source the entity has no observation in", async () => {
    const database = await getDb();
    const now = new Date().toISOString();
    const insert = database.prepare(
      "INSERT INTO raw_fragments (id, source_id, entity_id, entity_type, fragment_key, fragment_value, user_id, first_seen, last_seen, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
    );
    // Names a NON-page entity but sits under a source the page entity uses.
    await insert.run(
      `frag_other_${entityType}`,
      sourceIds[0],
      entityIds[PAGE + 1],
      entityType,
      "belongs_elsewhere",
      '"x"',
      userId,
      now,
      now,
      now
    );
    // Names the page entity but sits under a source it has no observation in.
    await insert.run(
      `frag_orphan_${entityType}`,
      `src_${entityType}_unrelated`,
      entityIds[0],
      entityType,
      "wrong_source",
      '"y"',
      userId,
      now,
      now,
      now
    );

    const page = await queryEntities({ userId, entityType, limit: PAGE, includeSnapshots: true });
    for (const entity of page) {
      expect(entity.raw_fragments ?? {}).not.toHaveProperty("belongs_elsewhere");
      expect(entity.raw_fragments ?? {}).not.toHaveProperty("wrong_source");
    }
  });
});

describe("fragment upsert probe", () => {
  it("is index-served, so a store's per-fragment probe does not scan raw_fragments", async () => {
    const database = await getDb();
    const sourceId = `src_probe_${randomUUID()}`;
    const entityId = `ent_probe_${randomUUID()}`;
    const userId = randomUUID();
    const statements: Array<{ sql: string; params: unknown[] }> = [];
    const original = database.prepare.bind(database);
    (database as { prepare: typeof database.prepare }).prepare = (sql: string) => {
      const statement = original(sql);
      for (const method of ["get", "all"] as const) {
        const inner = statement[method].bind(statement);
        statement[method] = (async (...params: unknown[]) => {
          statements.push({ sql, params });
          return inner(...params);
        }) as never;
      }
      return statement;
    };
    try {
      await storeFragment({
        sourceId,
        userId,
        entityId,
        entityType: "probe_type",
        schemaVersion: "1.0",
        key: "unknown_field",
        value: "v",
        reason: "unknown_field",
      });
    } finally {
      (database as { prepare: typeof database.prepare }).prepare = original;
    }
    const probe = statements.find(
      (s) => /FROM raw_fragments/.test(s.sql) && /fragment_key = \?/.test(s.sql)
    );
    expect(probe, "storeFragment must probe for an existing fragment").toBeDefined();
    const plan = (
      (await database.prepare(`EXPLAIN QUERY PLAN ${probe!.sql}`).all(...probe!.params)) as Array<{
        detail: string;
      }>
    )
      .map((row) => row.detail)
      .join(" | ");
    expect(plan).not.toMatch(/\bSCAN raw_fragments\b/);
    expect(plan).toMatch(/idx_raw_fragments_source_key/);
    await database.prepare("DELETE FROM raw_fragments WHERE source_id = ?").run(sourceId);
  });
});
