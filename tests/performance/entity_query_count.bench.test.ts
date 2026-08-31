/**
 * Entity-query per-request overhead benchmark (ateles#576 / this repo's #2222).
 *
 * Excluded from the default lane (RUN_BENCH=1 only). Run: `npm run test:bench`.
 *
 * Reproduces the reported production symptom: a `limit: 1` entity query costing
 * tens of seconds. The cost is per-request overhead, not result-set size — so
 * this benchmark holds `limit` at 1 and grows only the corpus, which is the
 * variable the symptom actually tracks.
 *
 * The attribution it prints separates the page fetch (what the caller asked
 * for) from the total count (`queryEntitiesWithCount`'s `total` field). Before
 * the fix the count dominates by orders of magnitude, because it read every
 * observation row of every entity to re-derive deletion state on each request.
 */

import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../src/db.js";
import { queryEntitiesWithCount } from "../../src/shared/action_handlers/entity_handlers.js";
import { queryEntities } from "../../src/services/entity_queries.js";

const USER_ID = "00000000-0000-0000-0000-000000000000";
const SIZES = [1_000, 10_000, 40_000];
/** Observations per entity — prod averages several per entity. */
const OBS_PER_ENTITY = 3;

interface BenchRow {
  entities: number;
  page_ms: number;
  with_count_ms: number;
  count_overhead_ms: number;
  total: number;
}

const prefix = `bench576_${process.hrtime.bigint()}`;
const results: BenchRow[] = [];
const seededTypes: string[] = [];

/**
 * Seed `count` entities of a dedicated type, each with OBS_PER_ENTITY
 * observations carrying a realistic `fields` payload. The `fields` blob matters:
 * the pre-fix count path selected it for every observation row, so its size is
 * part of the cost being measured.
 */
async function seed(entityType: string, count: number): Promise<void> {
  const CHUNK = 1_000;
  const entityRows: Array<Record<string, unknown>> = [];
  const snapshotRows: Array<Record<string, unknown>> = [];
  const observationRows: Array<Record<string, unknown>> = [];

  for (let i = 0; i < count; i++) {
    const entityId = `${entityType}_e${i}`;
    entityRows.push({
      id: entityId,
      entity_type: entityType,
      canonical_name: `Bench Entity ${i}`,
      user_id: USER_ID,
      merged_to_entity_id: null,
      created_at: new Date().toISOString(),
    });
    snapshotRows.push({
      entity_id: entityId,
      entity_type: entityType,
      schema_version: "1.0",
      snapshot: { name: `Bench Entity ${i}`, status: "active" },
      observation_count: OBS_PER_ENTITY,
      user_id: USER_ID,
    });
    for (let o = 0; o < OBS_PER_ENTITY; o++) {
      observationRows.push({
        id: `${entityId}_o${o}`,
        entity_id: entityId,
        entity_type: entityType,
        observed_at: new Date(Date.now() - o * 1000).toISOString(),
        source_priority: 100 - o,
        // Representative payload — the pre-fix count path read this column for
        // every observation of every entity on every request.
        fields: {
          name: `Bench Entity ${i}`,
          status: "active",
          description: "x".repeat(200),
          tags: ["alpha", "beta", "gamma"],
        },
        user_id: USER_ID,
      });
    }
  }

  for (let i = 0; i < entityRows.length; i += CHUNK) {
    await db.from("entities").insert(entityRows.slice(i, i + CHUNK));
  }
  for (let i = 0; i < snapshotRows.length; i += CHUNK) {
    await db.from("entity_snapshots").insert(snapshotRows.slice(i, i + CHUNK));
  }
  for (let i = 0; i < observationRows.length; i += CHUNK) {
    await db.from("observations").insert(observationRows.slice(i, i + CHUNK));
  }
}

async function cleanup(entityType: string): Promise<void> {
  await db.from("observations").delete().eq("entity_type", entityType);
  await db.from("entity_snapshots").delete().eq("entity_type", entityType);
  await db.from("entities").delete().eq("entity_type", entityType);
}

describe("entity query per-request overhead (ateles#576)", () => {
  afterAll(async () => {
    for (const t of seededTypes) await cleanup(t);
    const header = "| entities | page only (ms) | with count (ms) | count overhead (ms) | total |";
    const sep = "|---|---|---|---|---|";
    const lines = results.map(
      (r) =>
        `| ${r.entities} | ${r.page_ms.toFixed(1)} | ${r.with_count_ms.toFixed(1)} | ${r.count_overhead_ms.toFixed(1)} | ${r.total} |`
    );
    // eslint-disable-next-line no-console
    console.log(
      ["", "limit:1 entity query overhead (ateles#576)", header, sep, ...lines, ""].join("\n")
    );
  });

  for (const size of SIZES) {
    it(`serves a limit:1 query over ${size} entities without scanning the corpus`, async () => {
      const entityType = `${prefix}_s${size}`;
      seededTypes.push(entityType);
      await seed(entityType, size);

      // Stage A: the page fetch alone — what the caller actually asked for.
      const pageStart = process.hrtime.bigint();
      const page = await queryEntities({
        userId: USER_ID,
        entityType,
        limit: 1,
        offset: 0,
        includeSnapshots: false,
      });
      const pageMs = Number(process.hrtime.bigint() - pageStart) / 1_000_000;

      // Stage B: the full handler path, which additionally computes `total`.
      const withCountStart = process.hrtime.bigint();
      const result = await queryEntitiesWithCount({
        userId: USER_ID,
        entityType,
        limit: 1,
        offset: 0,
        includeSnapshots: false,
      });
      const withCountMs = Number(process.hrtime.bigint() - withCountStart) / 1_000_000;

      results.push({
        entities: size,
        page_ms: pageMs,
        with_count_ms: withCountMs,
        count_overhead_ms: withCountMs - pageMs,
        total: result.total,
      });

      // Correctness: the count must still be exact.
      expect(result.total).toBe(size);
      expect(page).toHaveLength(1);
      expect(result.entities).toHaveLength(1);

      // Regression gate: the count must not re-scan the corpus. Before the fix
      // this overhead grew linearly with corpus size (5.8ms / 58.5ms / 235.8ms
      // at 1k / 10k / 40k locally, extrapolating to tens of seconds at prod
      // scale on a network volume). The bound is deliberately loose — an order
      // of magnitude above the measured ~1ms — so it catches a return to
      // linear scanning without flaking on a busy CI box.
      expect(withCountMs - pageMs).toBeLessThan(50);
    }, 600_000);
  }
});
