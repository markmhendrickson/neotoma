/**
 * Current-state read cost versus observation-history length (#2792).
 *
 * Excluded from the default lane (RUN_BENCH=1 only). Run on its own:
 *
 *   RUN_BENCH=1 npx vitest run tests/performance/history_length_reads.bench.test.ts
 *
 * Scale with HISTORY_BENCH_ENTITIES (default 200) and HISTORY_BENCH_LENGTH
 * (default 500 observations per long-history entity).
 *
 * Reported symptom: a client that re-stores every record on each sync pass
 * leaves hundreds of identical observations per entity. Listing such a type
 * took seconds to tens of seconds while a type with the same entity count and
 * short histories listed in well under a second. Current state is materialized
 * in `entity_snapshots`, so its cost should not depend on how long the history
 * behind each snapshot is.
 *
 * Two types are seeded with EQUAL entity counts:
 *  - short: 1 observation per entity;
 *  - long:  HISTORY observations per entity, one per sync pass, every pass from
 *           its own source re-storing identical fields plus one unknown field
 *           (so raw_fragments grow with the passes too, as they do in practice).
 * A tenth of each type is soft-deleted, so the hidden-entity side of count
 * certification is exercised as well.
 *
 * Every measurement runs twice: on a store with no recorded lifecycle cutover
 * (how most stores run today) and again after the cutover is recorded, because
 * the two modes decide visibility through different code.
 *
 * Gates:
 *  - list (page + total), count certification and single-snapshot latency for
 *    the long type stay within 2x the short type (medians);
 *  - the list reads no more observation rows for the long type than it would
 *    for one observation per entity (deterministic, not timing);
 *  - re-storing an unchanged record N times does not grow its observation rows
 *    linearly with N.
 *
 * The bench uses its own temporary database: recording a lifecycle cutover is
 * permanent by design and must not leak into the shared test database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";

const dataDir = mkdtempSync(path.join(tmpdir(), "neotoma-history-bench-"));
process.env.NEOTOMA_SQLITE_PATH = path.join(dataDir, "history_bench.db");

const USER_ID = "00000000-0000-0000-0000-000000000000";
const ENTITIES = Number(process.env.HISTORY_BENCH_ENTITIES ?? "200");
const HISTORY = Number(process.env.HISTORY_BENCH_LENGTH ?? "500");
const REPS = 5;
const SNAPSHOT_SAMPLE = 20;
const RESTORES = 30;
const MAX_RATIO = 2;
const DELETED_EVERY = 10;

const runTag = randomBytes(4).toString("hex");
const SHORT = `hist_short_${runTag}`;
const LONG = `hist_long_${runTag}`;
const body = "x".repeat(1500);

type Mods = {
  getDb: typeof import("../../src/repositories/db/connection.js").getDb;
  queryEntitiesWithCount: typeof import("../../src/shared/action_handlers/entity_handlers.js").queryEntitiesWithCount;
  certifySnapshotPopulation: typeof import("../../src/services/entity_population_certificate.js").certifySnapshotPopulation;
  getEntityWithProvenance: typeof import("../../src/services/entity_queries.js").getEntityWithProvenance;
  isOwnedEntityHiddenAfterCutover: typeof import("../../src/services/current_state_reads.js").isOwnedEntityHiddenAfterCutover;
  migrateEntityLifecycleAuthority: typeof import("../../src/services/entity_lifecycle_storage.js").migrateEntityLifecycleAuthority;
  storeStructuredForApi: typeof import("../../src/actions.js").storeStructuredForApi;
};
let m: Mods;
const report: string[] = [];
const ids: Record<string, string[]> = { [SHORT]: [], [LONG]: [] };
const visible: Record<string, string[]> = { [SHORT]: [], [LONG]: [] };

async function seed(): Promise<void> {
  const database = await m.getDb();
  const base = Date.parse("2026-01-01T00:00:00Z");
  await database.transaction(async (tx) => {
    const insertEntity = tx.prepare(
      "INSERT INTO entities (id, entity_type, canonical_name, user_id, created_at, updated_at, merged_to_entity_id) VALUES (?,?,?,?,?,?,NULL)"
    );
    const insertSnapshot = tx.prepare(
      "INSERT INTO entity_snapshots (entity_id, entity_type, schema_version, canonical_name, snapshot, computed_at, observation_count, last_observation_at, provenance, user_id) VALUES (?,?,?,?,?,?,?,?,?,?)"
    );
    const insertObservation = tx.prepare(
      "INSERT INTO observations (id, entity_id, entity_type, schema_version, source_id, observed_at, source_priority, fields, created_at, user_id) VALUES (?,?,?,?,?,?,?,?,?,?)"
    );
    const insertFragment = tx.prepare(
      "INSERT INTO raw_fragments (id, source_id, entity_id, entity_type, fragment_key, fragment_value, frequency_count, first_seen, last_seen, user_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
    );
    for (const [type, passes] of [
      [SHORT, 1],
      [LONG, HISTORY],
    ] as const) {
      for (let i = 0; i < ENTITIES; i++) {
        const entityId = `ent_${type}_${String(i).padStart(5, "0")}`;
        ids[type].push(entityId);
        const deleted = i % DELETED_EVERY === DELETED_EVERY - 1;
        const fields = JSON.stringify({ name: `${type} ${i}`, status: "active", body });
        const created = new Date(base).toISOString();
        const last = new Date(base + (passes - 1) * 60_000).toISOString();
        await insertEntity.run(entityId, type, `${type} ${i}`, USER_ID, created, last);
        for (let p = 0; p < passes; p++) {
          // One source per sync pass, shared by every entity the pass stored.
          const sourceId = `src_${type}_pass_${p}`;
          const at = new Date(base + p * 60_000).toISOString();
          await insertObservation.run(
            `obs_${type}_${i}_${p}`,
            entityId,
            type,
            "1.0",
            sourceId,
            at,
            100,
            fields,
            at,
            USER_ID
          );
          await insertFragment.run(
            `frag_${type}_${i}_${p}`,
            sourceId,
            entityId,
            type,
            "sync_cursor",
            JSON.stringify("unchanged"),
            1,
            at,
            at,
            USER_ID,
            at
          );
        }
        if (deleted) {
          const at = new Date(base + passes * 60_000).toISOString();
          await insertObservation.run(
            `obs_${type}_${i}_deleted`,
            entityId,
            type,
            "1.0",
            null,
            at,
            1000,
            JSON.stringify({ _deleted: true, deleted_at: at }),
            at,
            USER_ID
          );
        } else {
          visible[type].push(entityId);
          await insertSnapshot.run(
            entityId,
            type,
            "1.0",
            `${type} ${i}`,
            fields,
            last,
            passes,
            last,
            "{}",
            USER_ID
          );
        }
      }
    }
  });
}

/** Rows returned from statements that read `observations`, while `fn` runs. */
async function countObservationRows(fn: () => Promise<unknown>): Promise<number> {
  const database = await m.getDb();
  const original = database.prepare.bind(database);
  let rows = 0;
  (database as { prepare: typeof database.prepare }).prepare = (sql: string) => {
    const statement = original(sql);
    if (!/\bFROM observations\b/i.test(sql)) return statement;
    const all = statement.all.bind(statement);
    const get = statement.get.bind(statement);
    statement.all = async (...params: unknown[]) => {
      const result = await all(...params);
      rows += result.length;
      return result;
    };
    statement.get = async (...params: unknown[]) => {
      const result = await get(...params);
      if (result) rows += 1;
      return result;
    };
    return statement;
  };
  try {
    await fn();
  } finally {
    (database as { prepare: typeof database.prepare }).prepare = original;
  }
  return rows;
}

async function median(fn: () => Promise<unknown>): Promise<number> {
  await fn(); // warm
  const times: number[] = [];
  for (let r = 0; r < REPS; r++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(REPS / 2)];
}

interface Measured {
  list: number;
  count: number;
  snapshot: number;
  listObservationRows: number;
}

async function measure(type: string, cutover = false): Promise<Measured> {
  const list = () =>
    m.queryEntitiesWithCount({ userId: USER_ID, entityType: type, limit: ENTITIES, offset: 0 });
  const result = await list();
  expect(result.entities).toHaveLength(visible[type].length);
  expect(result.total).toBe(visible[type].length);
  const count = () => m.certifySnapshotPopulation(USER_ID, [type]);
  expect(await count()).toBe(true);
  const sample = visible[type].slice(0, SNAPSHOT_SAMPLE);
  const snapshot = async () => {
    for (const id of sample) {
      const entity = await m.getEntityWithProvenance(id, false, USER_ID);
      if (!entity) throw new Error(`snapshot read lost ${id}`);
      // After a cutover the current-snapshot endpoint also checks visibility.
      if (cutover && (await m.isOwnedEntityHiddenAfterCutover(id, USER_ID)))
        throw new Error(`snapshot endpoint hid ${id}`);
    }
  };
  return {
    list: await median(list),
    count: await median(count),
    snapshot: await median(snapshot),
    listObservationRows: await countObservationRows(list),
  };
}

function record(mode: string, short: Measured, long: Measured): void {
  for (const key of ["list", "count", "snapshot"] as const) {
    report.push(
      `${mode.padEnd(10)} ${key.padEnd(9)} short ${short[key].toFixed(1).padStart(8)} ms  long ${long[key].toFixed(1).padStart(8)} ms  ratio ${(long[key] / Math.max(short[key], 0.01)).toFixed(2)}`
    );
  }
  report.push(
    `${mode.padEnd(10)} list reads observation rows: short ${short.listObservationRows}, long ${long.listObservationRows}`
  );
}

function expectWithinRatio(short: Measured, long: Measured): void {
  // The observation-row count is the deterministic gate; timings are medians
  // and get a 2 ms floor so a sub-millisecond short read cannot make noise
  // look like a regression.
  expect(long.listObservationRows).toBeLessThanOrEqual(
    Math.max(short.listObservationRows, ENTITIES)
  );
  for (const key of ["list", "count", "snapshot"] as const) {
    expect(long[key], `${key}: long ${long[key]} ms vs short ${short[key]} ms`).toBeLessThanOrEqual(
      MAX_RATIO * Math.max(short[key], 2)
    );
  }
}

describe(`current-state reads vs history length (${ENTITIES} entities, ${HISTORY} observations each)`, () => {
  beforeAll(async () => {
    process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART = "1";
    m = {
      getDb: (await import("../../src/repositories/db/connection.js")).getDb,
      queryEntitiesWithCount: (await import("../../src/shared/action_handlers/entity_handlers.js"))
        .queryEntitiesWithCount,
      certifySnapshotPopulation: (
        await import("../../src/services/entity_population_certificate.js")
      ).certifySnapshotPopulation,
      getEntityWithProvenance: (await import("../../src/services/entity_queries.js"))
        .getEntityWithProvenance,
      isOwnedEntityHiddenAfterCutover: (await import("../../src/services/current_state_reads.js"))
        .isOwnedEntityHiddenAfterCutover,
      migrateEntityLifecycleAuthority: (
        await import("../../src/services/entity_lifecycle_storage.js")
      ).migrateEntityLifecycleAuthority,
      storeStructuredForApi: (await import("../../src/actions.js")).storeStructuredForApi,
    };
    const start = performance.now();
    await seed();
    report.push(
      `seeded ${ENTITIES} short + ${ENTITIES} long entities (${ENTITIES * HISTORY} long observations) in ${(performance.now() - start).toFixed(0)} ms`
    );
  }, 900_000);

  afterAll(() => {
    // eslint-disable-next-line no-console
    console.log(["", "history-length reads (#2792)", ...report, ""].join("\n"));
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("serves current state independent of history length before a lifecycle cutover", async () => {
    const short = await measure(SHORT);
    const long = await measure(LONG);
    record("pre-cutover", short, long);
    expectWithinRatio(short, long);
  }, 900_000);

  it("serves current state independent of history length after a lifecycle cutover", async () => {
    const database = await m.getDb();
    const start = performance.now();
    // Snapshots were seeded consistent with the observations, so the cutover
    // needs no re-materialization.
    await m.migrateEntityLifecycleAuthority(database, async () => {});
    // Migration runs offline; the next open creates the attached-authority index.
    await (
      await import("../../src/repositories/sqlite/sqlite_client.js")
    ).ensureLifecycleAttachedIndex(database);
    report.push(`recorded lifecycle cutover in ${(performance.now() - start).toFixed(0)} ms`);
    const short = await measure(SHORT, true);
    const long = await measure(LONG, true);
    record("cutover", short, long);
    expectWithinRatio(short, long);
  }, 900_000);

  // No-op store suppression (#2792 point 1): an unchanged record re-stored in a
  // batch whose other content changed adds no observation row and no fragment
  // row; the repeats are counted on the observation_sightings marker instead.
  it("does not grow observation storage linearly when an unchanged record is re-stored", async () => {
    const database = await m.getDb();
    const type = `hist_restore_${runTag}`;
    const entity = {
      entity_type: type,
      schema_version: "1.0",
      name: "Unchanged Record",
      status: "active",
    };
    let entityId = "";
    const pageCount = async () =>
      ((await database.prepare("PRAGMA page_count").get()) as { page_count: number }).page_count;
    const before = await pageCount();
    // A sync pass re-stores the unchanged record in a batch whose other content
    // changed. (A byte-identical batch already maps to its earlier source and
    // observation, so it is not the case that grows a store.)
    for (let n = 0; n < RESTORES; n++) {
      const result = (await m.storeStructuredForApi({
        userId: USER_ID,
        idempotencyKey: `history-bench-${runTag}-${randomUUID()}`,
        sourcePriority: 100,
        entities: [
          entityId ? { ...entity, target_id: entityId } : entity,
          { entity_type: `${type}_cursor`, schema_version: "1.0", name: "Sync cursor", pass: n },
        ],
      })) as { entities: Array<{ entity_id: string }> };
      entityId = result.entities[0].entity_id;
    }
    const observations = (
      (await database
        .prepare("SELECT COUNT(*) AS n FROM observations WHERE entity_id = ?")
        .get(entityId)) as { n: number }
    ).n;
    const grownPages = (await pageCount()) - before;
    report.push(
      `re-stored an unchanged record ${RESTORES}x: ${observations} observation rows, +${grownPages} pages (${(statSync(process.env.NEOTOMA_SQLITE_PATH!).size / 1e6).toFixed(1)} MB file)`
    );
    const fragments = (
      (await database
        .prepare("SELECT COUNT(*) AS n FROM raw_fragments WHERE entity_id = ?")
        .get(entityId)) as { n: number }
    ).n;
    const sighting = (await database
      .prepare("SELECT SUM(seen_count) AS n FROM observation_sightings WHERE entity_id = ?")
      .get(entityId)) as { n: number | null };
    report.push(
      `  ${fragments} fragment rows; ${sighting.n ?? 0} repeats counted in observation_sightings`
    );
    // The first store only: the other RESTORES - 1 passes are counted, not appended.
    expect(observations).toBe(1);
    expect(fragments).toBe(0);
    expect(sighting.n).toBe(RESTORES - 1);
  }, 900_000);
});
