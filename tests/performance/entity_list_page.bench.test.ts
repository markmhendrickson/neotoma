/**
 * Entity listing and fragment-upsert cost versus stored volume.
 *
 * Excluded from the default lane (RUN_BENCH=1 only). Run: `npm run test:bench`.
 * Scale the corpus with BENCH_SCALE (default 1; 4 is a ~2 GB database).
 *
 * Reproduces the reported symptom on the single-connection SQLite backend:
 * `GET /entities?entity_type=<large type>&limit=500` took seconds and froze
 * every other request, with cost that did not track the page size, and a store
 * of a few dozen entities froze it too. Two things were measured:
 *
 *  - a 500-entity listing page of each of four entity types shaped like a mail
 *    type (large observations, several large extra fragments per entity), a
 *    shipment type, a customer type and an order type with no fragments;
 *  - 210 `storeFragment` upserts (35 entities x 6 unknown fields), the
 *    per-fragment probe a store issues.
 *
 * Pre-fix, each listing fetched every fragment of every source the page touched
 * (a page's entities are spread across all of a type's sources, so that was the
 * whole type) through full scans of `raw_fragments` and `observations`, and each
 * upsert probe was a full scan of `raw_fragments`.
 *
 * Measured on a laptop, BENCH_SCALE=1 (34k observations, 32k fragments, mail
 * fragments 8 KB), median of 5, milliseconds:
 *
 *   | step                   | before | after |
 *   |------------------------|--------|-------|
 *   | list 500 mail          |    444 |    87 |
 *   | list 500 shipment      |     80 |    35 |
 *   | list 500 customer      |     60 |    23 |
 *   | list 500 order         |     50 |    20 |
 *   | 210 fragment upserts   |    840 |    40 |
 *
 * and at BENCH_SCALE=4 the "before" listing grows with the corpus (mail 653,
 * order 146) while "after" stays flat in the fetch (mail 82). Timings are printed
 * for the record; the gates below assert the deterministic properties (rows
 * fetched, query plans) plus one deliberately loose time bound.
 */
import { afterAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { getDb } from "../../src/repositories/db/connection.js";
import { queryEntitiesWithCount } from "../../src/shared/action_handlers/entity_handlers.js";
import { storeFragment } from "../../src/services/raw_fragments.js";

const USER_ID = "7f3e1c52-8a4b-4d0e-9c61-2b5f0a7d9e13";
const SCALE = Number(process.env.BENCH_SCALE ?? "1");
const PAGE = 500;
const REPS = 5;
/** Entities stored per source (one store call's worth). */
const BATCH = 35;

const hex = (n: number) => randomBytes(n).toString("hex");
const pad = (n: number) => "x".repeat(n);
const runTag = hex(4);

interface TypeSpec {
  type: string;
  entities: number;
  obsPer: number;
  fieldsBytes: number;
  fragsPer: number;
  fragBytes: number;
}

const SPECS: TypeSpec[] = [
  {
    type: `bench_mail_${runTag}`,
    entities: 6000,
    obsPer: 3,
    fieldsBytes: 6000,
    fragsPer: 4,
    fragBytes: 8000,
  },
  {
    type: `bench_ship_${runTag}`,
    entities: 3000,
    obsPer: 2,
    fieldsBytes: 3000,
    fragsPer: 2,
    fragBytes: 600,
  },
  {
    type: `bench_cust_${runTag}`,
    entities: 2000,
    obsPer: 2,
    fieldsBytes: 1000,
    fragsPer: 1,
    fragBytes: 300,
  },
  {
    type: `bench_order_${runTag}`,
    entities: 6000,
    obsPer: 1,
    fieldsBytes: 600,
    fragsPer: 0,
    fragBytes: 0,
  },
].map((s) => ({ ...s, entities: Math.round(s.entities * SCALE) }));

const rows: string[] = [];

async function seed(): Promise<void> {
  const database = await getDb();
  const now = new Date().toISOString();
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
    const maxN = Math.max(...SPECS.map((s) => s.entities));
    // Interleave types so rows of different types are mixed on disk, as in a real store.
    for (let i = 0; i < maxN; i++) {
      for (const s of SPECS) {
        if (i >= s.entities) continue;
        const entityId = `ent_${hex(12)}`;
        const sourceId = `src_${s.type}_${Math.floor(i / BATCH)}`;
        const body = pad(s.fieldsBytes);
        await insertEntity.run(entityId, s.type, `${s.type} ${i}`, USER_ID, now, now);
        await insertSnapshot.run(
          entityId,
          s.type,
          "1.0",
          `${s.type} ${i}`,
          JSON.stringify({ name: `${s.type} ${i}`, body }),
          now,
          s.obsPer,
          now,
          "{}",
          USER_ID
        );
        for (let o = 0; o < s.obsPer; o++) {
          await insertObservation.run(
            `obs_${hex(12)}`,
            entityId,
            s.type,
            "1.0",
            sourceId,
            new Date(Date.now() - o * 1000).toISOString(),
            100 - o,
            JSON.stringify({ name: `${s.type} ${i}`, body }),
            now,
            USER_ID
          );
        }
        for (let f = 0; f < s.fragsPer; f++) {
          await insertFragment.run(
            `frag_${hex(12)}`,
            sourceId,
            entityId,
            s.type,
            `extra_${f}`,
            JSON.stringify(pad(s.fragBytes)),
            1,
            now,
            now,
            USER_ID,
            now
          );
        }
      }
    }
  });
}

async function cleanup(): Promise<void> {
  const database = await getDb();
  for (const s of SPECS) {
    for (const table of ["raw_fragments", "observations", "entity_snapshots", "entities"]) {
      await database.prepare(`DELETE FROM ${table} WHERE entity_type = ?`).run(s.type);
    }
  }
  await database
    .prepare("DELETE FROM raw_fragments WHERE source_id LIKE ?")
    .run(`src_write_${runTag}%`);
}

describe("entity list page and fragment upsert cost", () => {
  afterAll(async () => {
    await cleanup();
    // eslint-disable-next-line no-console
    console.log(
      ["", `entity list / fragment upsert (BENCH_SCALE=${SCALE})`, ...rows, ""].join("\n")
    );
  });

  it("serves a 500-entity page without fetching the whole type's fragments", async () => {
    await seed();
    const database = await getDb();
    const original = database.prepare.bind(database);
    let fragmentRows = 0;
    (database as { prepare: typeof database.prepare }).prepare = (sql: string) => {
      const statement = original(sql);
      const all = statement.all.bind(statement);
      statement.all = async (...params: unknown[]) => {
        const result = await all(...params);
        if (/\bFROM raw_fragments\b/.test(sql) && /fragment_value/.test(sql)) {
          fragmentRows += result.length;
        }
        return result;
      };
      return statement;
    };
    try {
      for (const s of SPECS) {
        const times: number[] = [];
        let result: Awaited<ReturnType<typeof queryEntitiesWithCount>> | undefined;
        for (let rep = 0; rep < REPS; rep++) {
          fragmentRows = 0;
          const start = performance.now();
          result = await queryEntitiesWithCount({
            userId: USER_ID,
            entityType: s.type,
            limit: PAGE,
            offset: 0,
          });
          times.push(performance.now() - start);
        }
        times.sort((a, b) => a - b);
        const median = times[Math.floor(REPS / 2)];
        rows.push(
          `list ${PAGE} ${s.type.replace(`_${runTag}`, "")}: median ${median.toFixed(0)} ms, fragments fetched ${fragmentRows} (page holds ${PAGE * s.fragsPer})`
        );
        expect(result!.entities).toHaveLength(PAGE);
        // The page's own fragments and nothing else. Pre-fix this was every
        // fragment of the type that shared a source with the page (about the
        // whole type, many times the page).
        expect(fragmentRows).toBeLessThanOrEqual(PAGE * s.fragsPer);
      }
    } finally {
      (database as { prepare: typeof database.prepare }).prepare = original;
    }

    // The statements a listing issues must be index-served.
    const probes: Array<[string, unknown[]]> = [
      [
        "SELECT fragment_key, fragment_value FROM raw_fragments WHERE entity_type = ? AND source_id IN (?) AND entity_id IN (?) AND (user_id = ?)",
        [SPECS[0].type, "s", "e", USER_ID],
      ],
      [
        "SELECT entity_id, source_id FROM observations WHERE entity_type = ? AND source_id IN (?)",
        [SPECS[0].type, "s"],
      ],
    ];
    for (const [sql, params] of probes) {
      const plan = (
        (await database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params)) as Array<{
          detail: string;
        }>
      )
        .map((row) => row.detail)
        .join(" | ");
      expect(plan).not.toMatch(/\bSCAN (raw_fragments|observations)\b/);
    }
  }, 900_000);

  it("keeps a store's per-fragment upserts independent of the fragment table size", async () => {
    const database = await getDb();
    const entities = (await database
      .prepare("SELECT id FROM entities WHERE entity_type = ? LIMIT 35")
      .all(SPECS[SPECS.length - 1].type)) as Array<{ id: string }>;
    expect(entities.length).toBeGreaterThan(0);
    const sourceId = `src_write_${runTag}`;
    const start = performance.now();
    let upserts = 0;
    for (const entity of entities) {
      for (let k = 0; k < 6; k++) {
        await storeFragment({
          sourceId,
          userId: USER_ID,
          entityId: entity.id,
          entityType: SPECS[SPECS.length - 1].type,
          schemaVersion: "1.0",
          key: `unknown_${k}`,
          value: "v".repeat(300),
          reason: "unknown_field",
        });
        upserts += 1;
      }
    }
    const elapsed = performance.now() - start;
    rows.push(`fragment upserts x${upserts}: ${elapsed.toFixed(0)} ms`);
    // ~4 ms each pre-fix at 32k fragments (a full scan per probe), ~0.2 ms
    // after. The bound is loose enough for a slow CI box and still well under
    // the pre-fix cost at this corpus size.
    expect(elapsed / upserts).toBeLessThan(2);
  }, 900_000);
});
