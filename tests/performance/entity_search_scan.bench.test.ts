/**
 * Entity search scan benchmark (#2659).
 *
 * Excluded from the default lane (RUN_BENCH=1 only). Run:
 *   npx cross-env RUN_BENCH=1 vitest run tests/performance/entity_search_scan.bench.test.ts
 *
 * Search decides, for every entity of the requested type, whether its normalized
 * text contains each query token. `raw_fragments` is part of that text and has no
 * index on `entity_id`, so each `entity_id IN (...)` statement scans the whole
 * table. The old loader issued one per 500 candidates; the issue's instance
 * (millions of fragment rows, tens of thousands of tasks) therefore paid dozens
 * of full scans for one `limit: 1` search.
 *
 * This benchmark seeds a few thousand entities of ONE type plus a large block of
 * fragment rows that belong to other entities (the table-size the scans pay for),
 * then times the same typed queries through
 *
 *   - `reference`: the pre-#2659 acquisition shape, reproduced here with the same
 *     db calls and the exported matching helpers (chunked fragment loading);
 *   - `current`: `queryEntitiesWithCount` as shipped.
 *
 * Both run in one process on the same data, and the test asserts they agree on
 * the matched total, so a speedup that changed results would fail here.
 *
 * What this does NOT show: sub-linear growth. Matching still normalizes text in
 * JavaScript, so each entity of the type is still examined and one pass over the
 * fragment table remains. Making cost track `limit` needs normalized text stored
 * and indexed, which is a schema change (see the PR for #2659).
 */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db.js";
import { getDb } from "../../src/repositories/db/connection.js";

vi.mock("../../src/services/entity_semantic_search.js", () => ({
  semanticSearchEntities: vi.fn(async () => ({ entityIds: [], total: 0 })),
}));

import {
  buildEntityLexicalSearchText,
  loadRawFragmentTextByEntityId,
  loadRawFragmentTextChunked,
  matchesSearchTokens,
  normalizeSearchText,
  queryEntitiesWithCount,
} from "../../src/shared/action_handlers/entity_handlers.js";

const USER_ID = `bench2659-${randomUUID()}`;
const SIZES = (process.env.BENCH_SEARCH_SIZES ?? "5000,20000").split(",").map(Number);
const NOISE_FRAGMENTS = Number(process.env.BENCH_NOISE_FRAGMENTS ?? 400_000);
const run = randomUUID().replaceAll("-", "").slice(0, 8);
const seededTypes: string[] = [];
let noiseSeeded = false;

const WORDS = (
  "alpha beta gamma delta task agent swarm deploy review queue merge status owner notes plan " +
  "ateles hosted instance read probe ledger invoice payment contact meeting recap draft"
).split(" ");

function filler(seed: number, count: number): string {
  const out: string[] = [];
  let x = seed + 1;
  for (let i = 0; i < count; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    out.push(WORDS[x % WORDS.length]!);
  }
  return out.join(" ");
}

async function seed(entityType: string, count: number): Promise<void> {
  const CHUNK = 1000;
  for (let start = 0; start < count; start += CHUNK) {
    const entities: Array<Record<string, unknown>> = [];
    const snapshots: Array<Record<string, unknown>> = [];
    const fragments: Array<Record<string, unknown>> = [];
    for (let i = start; i < Math.min(count, start + CHUNK); i++) {
      const id = `${entityType}_e${i}`;
      // 1% of rows carry the rare token; it appears nowhere else.
      const rare = i % 100 === 0 ? ` rareneedle${run}` : "";
      entities.push({
        id,
        user_id: USER_ID,
        entity_type: entityType,
        canonical_name: `Task ${i}: ${filler(i, 4)}`,
      });
      snapshots.push({
        entity_id: id,
        user_id: USER_ID,
        entity_type: entityType,
        schema_version: "1.0",
        snapshot: {
          title: `${filler(i + 7, 6)}${rare}`,
          status: i % 3 === 0 ? "done" : "open",
          body: filler(i + 13, 160),
          owner: `agent${i % 7}`,
          tags: ["alpha", "beta"],
        },
        provenance: {},
        observation_count: 1,
      });
      fragments.push({
        id: `${id}_frag`,
        entity_id: id,
        entity_type: entityType,
        user_id: USER_ID,
        fragment_key: "note",
        fragment_value: filler(i + 21, 12),
      });
    }
    expect((await db.from("entities").insert(entities)).error).toBeNull();
    expect((await db.from("entity_snapshots").insert(snapshots)).error).toBeNull();
    expect((await db.from("raw_fragments").insert(fragments)).error).toBeNull();
  }
}

/** Fragment rows owned by entities outside the benchmarked type. */
async function seedNoise(count: number): Promise<void> {
  const connection = await getDb();
  await connection.transaction(async (tx) => {
    const insert = tx.prepare(
      "INSERT INTO raw_fragments (id, entity_id, entity_type, fragment_key, fragment_value, user_id) VALUES (?, ?, ?, ?, ?, ?)"
    );
    for (let i = 0; i < count; i++) {
      await insert.run(
        `bench2659_noise_${run}_${i}`,
        `bench2659_noise_${run}_ent${i % 60_000}`,
        `bench2659_noise_${run}`,
        `k${i % 40}`,
        JSON.stringify(`noise value ${i}`),
        USER_ID
      );
    }
  });
}

/** The pre-#2659 acquisition shape for a typed strict search. */
async function referenceScan(entityType: string, search: string): Promise<number> {
  const tokens = normalizeSearchText(search).split(" ").filter(Boolean);
  const { data: entities } = await db
    .from("entities")
    .select("id, canonical_name, entity_type")
    .eq("user_id", USER_ID)
    .eq("entity_type", entityType)
    .order("id", { ascending: true })
    .is("merged_to_entity_id", null);
  const rows = (entities ?? []) as Array<{ id: string; canonical_name: string }>;
  const ids = rows.map((row) => row.id);
  const snapshotMap = new Map<string, unknown>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data: snaps } = await db
      .from("entity_snapshots")
      .select("entity_id, snapshot")
      .in("entity_id", ids.slice(i, i + 500));
    for (const snap of (snaps ?? []) as Array<{ entity_id: string; snapshot: unknown }>) {
      snapshotMap.set(snap.entity_id, snap.snapshot);
    }
  }
  const fragmentText = await loadRawFragmentTextChunked(ids);
  let matched = 0;
  for (const row of rows) {
    const text = buildEntityLexicalSearchText(
      row.canonical_name,
      snapshotMap.get(row.id),
      fragmentText.get(row.id)
    );
    if (matchesSearchTokens(text, tokens)) matched += 1;
  }
  return matched;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const start = process.hrtime.bigint();
  const value = await fn();
  return { value, ms: Number(process.hrtime.bigint() - start) / 1e6 };
}

interface Row {
  entities: number;
  fragmentRows: number;
  query: string;
  reference_ms: number;
  current_ms: number;
  speedup: string;
  total: number;
}
interface LoaderRow {
  entities: number;
  fragmentRows: number;
  chunked_ms: number;
  single_ms: number;
  speedup: string;
}
const rowsOut: Row[] = [];
const loaderRows: LoaderRow[] = [];

describe("entity search scan (#2659)", () => {
  afterAll(async () => {
    for (const type of seededTypes) {
      await db.from("raw_fragments").delete().eq("entity_type", type);
      await db.from("entity_snapshots").delete().eq("entity_type", type);
      await db.from("entities").delete().eq("entity_type", type);
    }
    await db.from("raw_fragments").delete().eq("user_id", USER_ID);
    const lines = rowsOut.map(
      (r) =>
        `| ${r.entities} | ${r.fragmentRows} | ${r.query} | ${r.reference_ms.toFixed(0)} | ${r.current_ms.toFixed(0)} | ${r.speedup} | ${r.total} |`
    );
    const loaderLines = loaderRows.map(
      (r) =>
        `| ${r.entities} | ${r.fragmentRows} | ${r.chunked_ms.toFixed(0)} | ${r.single_ms.toFixed(0)} | ${r.speedup} |`
    );
    // eslint-disable-next-line no-console
    console.log(
      [
        "",
        "typed search, limit 1 (#2659)",
        "| entities | fragment rows | query | reference ms | current ms | speedup | total |",
        "|---|---|---|---|---|---|---|",
        ...lines,
        "",
        "raw_fragments loading alone",
        "| candidates | fragment rows | chunked ms | single scan ms | speedup |",
        "|---|---|---|---|---|",
        ...loaderLines,
        "",
      ].join("\n")
    );
  });

  for (const size of SIZES) {
    it(`typed search over ${size} entities returns the reference total, faster`, async () => {
      if (!noiseSeeded) {
        await seedNoise(NOISE_FRAGMENTS);
        noiseSeeded = true;
      }
      const entityType = `bench2659_${run}_s${size}`;
      seededTypes.push(entityType);
      await seed(entityType, size);
      const fragmentRows = NOISE_FRAGMENTS + size;

      const queries = [
        { label: "no match", text: `zzqxnomatch${run}`, expectTotal: 0 },
        { label: "1% match", text: `rareneedle${run}`, expectTotal: Math.ceil(size / 100) },
      ];
      for (const query of queries) {
        const reference = await timed(() => referenceScan(entityType, query.text));
        const current = await timed(() =>
          queryEntitiesWithCount({
            userId: USER_ID,
            entityType,
            search: query.text,
            limit: 1,
            offset: 0,
            includeSnapshots: false,
          })
        );
        rowsOut.push({
          entities: size,
          fragmentRows,
          query: query.label,
          reference_ms: reference.ms,
          current_ms: current.ms,
          speedup: `${(reference.ms / current.ms).toFixed(1)}x`,
          total: current.value.total,
        });
        expect(reference.value).toBe(query.expectTotal);
        expect(current.value.total).toBe(query.expectTotal);
        expect(current.value.entities).toHaveLength(Math.min(1, query.expectTotal));
      }

      // The part this change targets, isolated from JavaScript matching: the
      // reference pays candidates/500 full scans of the fragment table, the
      // current loader pays one. Three times is far below the measured gap at
      // the larger size and well above timing noise.
      const { data: idRows } = await db
        .from("entities")
        .select("id")
        .eq("user_id", USER_ID)
        .eq("entity_type", entityType);
      const ids = (idRows ?? []).map((row: { id: string }) => row.id);
      const chunked = await timed(() => loadRawFragmentTextChunked(ids));
      const single = await timed(() => loadRawFragmentTextByEntityId(ids));
      loaderRows.push({
        entities: size,
        fragmentRows,
        chunked_ms: chunked.ms,
        single_ms: single.ms,
        speedup: `${(chunked.ms / single.ms).toFixed(1)}x`,
      });
      expect(single.value.size).toBe(chunked.value.size);
      if (size >= 20_000 && NOISE_FRAGMENTS >= 200_000) {
        expect(single.ms).toBeLessThan(chunked.ms / 3);
      }
    }, 900_000);
  }
});
