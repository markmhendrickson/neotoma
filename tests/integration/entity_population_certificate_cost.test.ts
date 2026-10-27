/**
 * Population certification must not read the payloads of hidden entities.
 *
 * Reported symptom (hosted instance, single synchronous SQLite connection): every
 * `retrieve_entities` of one large, payload-heavy type stalled for seconds,
 * independent of `limit` (a `limit: 1` read cost the same), while every other type
 * answered in ~0 s. The stall is `certifySnapshotPopulation`, which the default
 * (unfiltered) count runs on every request: for each entity of the type that has
 * no snapshot (soft-deleted ones), it loaded EVERY observation of that entity,
 * `fields` payloads included, and ran the lifecycle selector over them. Cost =
 * (number of deleted entities) x (their stored bytes), i.e. it grows with the
 * type's history and not with the page.
 *
 * The legacy selector is decided by the observations at an entity's highest
 * `source_priority`, so certification now enumerates comparator inputs from
 * `idx_observations_entity_id` and reads only those rows in full.
 *
 * Checked to FAIL on the pre-fix code: "reads only the deciding observation".
 */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { getDb } from "../../src/repositories/db/connection.js";
import { certifySnapshotPopulation } from "../../src/services/entity_population_certificate.js";

const userId = randomUUID();
const createdTypes: string[] = [];

type Obs = {
  priority: number;
  observedAt: string;
  fields: unknown;
  rawObservedAt?: string;
};

async function seedEntity(type: string, hiddenHistory: Obs[], withSnapshot = false) {
  const database = await getDb();
  const id = `ent_${type}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  await database
    .prepare(
      "INSERT INTO entities (id, entity_type, canonical_name, user_id, created_at, updated_at) VALUES (?,?,?,?,?,?)"
    )
    .run(id, type, id, userId, "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z");
  if (withSnapshot) {
    await database
      .prepare(
        "INSERT INTO entity_snapshots (entity_id, entity_type, schema_version, snapshot, computed_at, observation_count, last_observation_at, provenance, user_id) VALUES (?,?,?,?,?,?,?,?,?)"
      )
      .run(id, type, "1.0", "{}", "2026-01-01T00:00:00Z", 1, "2026-01-01T00:00:00Z", "{}", userId);
  }
  for (const [i, o] of hiddenHistory.entries()) {
    await database
      .prepare(
        "INSERT INTO observations (id, entity_id, entity_type, schema_version, source_id, observed_at, source_priority, fields, user_id) VALUES (?,?,?,?,?,?,?,?,?)"
      )
      .run(
        `obs_${id}_${i}`,
        id,
        type,
        "1.0",
        null,
        o.rawObservedAt ?? o.observedAt,
        o.priority,
        typeof o.fields === "string" ? o.fields : JSON.stringify(o.fields),
        userId
      );
  }
  return id;
}

const newType = () => {
  const t = `certcost_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  createdTypes.push(t);
  return t;
};
const body = (n: number) => ({ subject: "mail", body: "x".repeat(n) });
const deletion = (priority = 1000, at = "2026-02-01T00:00:00Z"): Obs => ({
  priority,
  observedAt: at,
  fields: { _deleted: true, deleted_at: at, deleted_by: userId },
});

afterEach(async () => {
  const database = await getDb();
  for (const t of createdTypes.splice(0)) {
    for (const table of ["observations", "entity_snapshots", "entities"]) {
      await database.prepare(`DELETE FROM ${table} WHERE entity_type = ?`).run(t);
    }
  }
});

describe("certifySnapshotPopulation cost over hidden entities", () => {
  it("reads only the deciding observation of each hidden entity, in a bounded number of statements", async () => {
    const type = newType();
    const HIDDEN = 300;
    for (let i = 0; i < HIDDEN; i++) {
      await seedEntity(type, [
        { priority: 100, observedAt: "2026-01-01T00:00:00Z", fields: body(20000) },
        { priority: 99, observedAt: "2026-01-02T00:00:00Z", fields: body(20000) },
        { priority: 98, observedAt: "2026-01-03T00:00:00Z", fields: body(20000) },
        deletion(),
      ]);
    }
    const database = await getDb();
    const original = database.prepare.bind(database);
    const seen: { sql: string; rows: number; bytes: number }[] = [];
    (database as { prepare: typeof database.prepare }).prepare = (sql: string) => {
      const statement = original(sql);
      const all = statement.all.bind(statement);
      statement.all = async (...p: unknown[]) => {
        const rows = (await all(...p)) as Array<Record<string, unknown>>;
        seen.push({
          sql,
          rows: rows.length,
          bytes: rows.reduce((n, r) => n + (typeof r.fields === "string" ? r.fields.length : 0), 0),
        });
        return rows;
      };
      return statement;
    };
    try {
      expect(await certifySnapshotPopulation(userId, [type])).toBe(true);
    } finally {
      (database as { prepare: typeof database.prepare }).prepare = original;
    }
    const payloadBytes = seen.reduce((n, s) => n + s.bytes, 0);
    // Pre-fix: 4 observations x 300 entities x ~20 KB = ~24 MB read and parsed.
    expect(payloadBytes).toBeLessThan(HIDDEN * 1000);
    // Pre-fix: two statements per hidden entity. Now: a handful per 400-entity chunk.
    expect(seen.filter((s) => /FROM observations/.test(s.sql)).length).toBeLessThanOrEqual(6);
  }, 60000);

  it("matches the exhaustive selector on every verdict-relevant history", async () => {
    const scenarios: Record<string, Obs[]> = {
      deleted: [
        { priority: 100, observedAt: "2026-01-01T00:00:00Z", fields: body(10) },
        deletion(),
      ],
      restoredAbove: [
        deletion(),
        { priority: 1001, observedAt: "2026-03-01T00:00:00Z", fields: { _deleted: false } },
      ],
      deletionBelowLiveWinner: [
        { priority: 100, observedAt: "2026-01-01T00:00:00Z", fields: body(10) },
        deletion(50),
      ],
      tieNewestWins: [
        { priority: 500, observedAt: "2026-01-01T00:00:00Z", fields: { _deleted: true } },
        { priority: 500, observedAt: "2026-02-01T00:00:00Z", fields: { _deleted: false } },
      ],
      tieNewestIsDeletion: [
        { priority: 500, observedAt: "2026-01-01T00:00:00Z", fields: { _deleted: false } },
        { priority: 500, observedAt: "2026-02-01T00:00:00Z", fields: { _deleted: true } },
      ],
      malformedWinnerTime: [
        { priority: 1000, observedAt: "x", rawObservedAt: "malformed", fields: { _deleted: true } },
      ],
      malformedOlderTime: [
        { priority: 10, observedAt: "x", rawObservedAt: "malformed", fields: body(5) },
        deletion(),
      ],
      winnerNotObject: [{ priority: 1000, observedAt: "2026-02-01T00:00:00Z", fields: "[1]" }],
      noObservations: [],
    };
    for (const [name, history] of Object.entries(scenarios)) {
      const type = newType();
      await seedEntity(type, history);
      const fast = await certifySnapshotPopulation(userId, [type]);
      const slow = await certifySnapshotPopulation(userId, [type], undefined, {
        winnerOnly: false,
      });
      expect(fast, name).toBe(slow);
    }
    // The verdicts themselves, so agreement cannot be two wrong answers.
    const type = newType();
    await seedEntity(type, scenarios.deleted);
    expect(await certifySnapshotPopulation(userId, [type])).toBe(true);
    const live = newType();
    await seedEntity(live, scenarios.restoredAbove);
    expect(await certifySnapshotPopulation(userId, [live])).toBe(false);
  }, 60000);

  it("never certifies a never-observed entity or a visible entity lacking a snapshot", async () => {
    const type = newType();
    await seedEntity(type, deletionHistory());
    await seedEntity(type, []); // no observation at all
    expect(await certifySnapshotPopulation(userId, [type])).toBe(false);
  });
});

function deletionHistory(): Obs[] {
  return [deletion()];
}
