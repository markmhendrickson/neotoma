/**
 * Entity search scan benchmark (#2659).
 *
 * Excluded from the default lane (RUN_BENCH=1 only). Run:
 *   npm run build:server && npx cross-env RUN_BENCH=1 vitest run tests/performance/entity_search_scan.bench.test.ts
 * Sizes and noise are tunable: BENCH_SEARCH_SIZES=5000,20000,50000 BENCH_NOISE_FRAGMENTS=400000
 *
 * Search decides, for entities of the requested type, whether their normalized
 * text contains each query token. Before #2659 that meant hydrating and
 * normalizing EVERY entity of the type in JavaScript, so a `limit: 1` search
 * cost as much as a scan of the type. With the lexical prefilter index, SQL
 * returns only the entities that can contain every token and only those are
 * hydrated, so the cost follows the number of matches, not the type's size.
 *
 * The benchmark runs on its own database file. It seeds entity types of
 * increasing size (about 1.2 KB snapshots, one fragment each) plus a block of
 * fragment rows that belong to other entities, then for each size:
 *
 *   - backfills the index with the maintainer (timed; the basis for the
 *     backfill estimate on a large database) and records the file growth;
 *   - times the same typed `limit: 1` queries three ways, on the same data:
 *       reference  the pre-#2659 acquisition shape (chunked, unindexed reads);
 *       full scan  `queryEntitiesWithCount` with the index switched off;
 *       indexed    `queryEntitiesWithCount` with the index current;
 *     and asserts all three agree on the matched total.
 *
 * It also times building `idx_raw_fragments_entity` over the fragment table,
 * which is what the first open after upgrade pays.
 */
const isolated = vi.hoisted(() => {
  const previous = process.env.NEOTOMA_SQLITE_PATH;
  const path =
    `${process.env.NEOTOMA_DATA_DIR ?? "."}/search-index-bench-` +
    `${process.pid}-${Date.now()}.db`;
  process.env.NEOTOMA_SQLITE_PATH = path;
  return { path, previous };
});

import { randomUUID } from "node:crypto";
import { rmSync, statSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db.js";
import { clearDbCache, getDb } from "../../src/repositories/db/connection.js";
import { runEntitySearchIndexMaintenance } from "../../src/services/entity_search_index.js";

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
const SIZES = (process.env.BENCH_SEARCH_SIZES ?? "5000,20000,50000").split(",").map(Number);
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
  query: string;
  reference_ms: number;
  full_scan_ms: number;
  indexed_ms: number;
  total: number;
}
interface BackfillRow {
  entities: number;
  backfill_ms: number;
  per_second: number;
  db_growth_mb: number;
}
interface LoaderRow {
  entities: number;
  chunked_ms: number;
  single_ms: number;
}
const rowsOut: Row[] = [];
const backfillRows: BackfillRow[] = [];
const loaderRows: LoaderRow[] = [];
const notes: string[] = [];

function dbBytes(): number {
  let bytes = 0;
  for (const suffix of ["", "-wal"]) {
    try {
      bytes += statSync(isolated.path + suffix).size;
    } catch {
      // no WAL yet
    }
  }
  return bytes;
}

/** Median of `n` runs, after one warm-up run. */
async function median(fn: () => Promise<unknown>, n = 5): Promise<number> {
  await fn();
  const samples: number[] = [];
  for (let i = 0; i < n; i++) samples.push((await timed(fn)).ms);
  samples.sort((a, b) => a - b);
  return samples[Math.floor(n / 2)]!;
}

async function search(entityType: string, text: string) {
  return queryEntitiesWithCount({
    userId: USER_ID,
    entityType,
    search: text,
    limit: 1,
    offset: 0,
    includeSnapshots: false,
  });
}

async function withIndexOff<T>(fn: () => Promise<T>): Promise<T> {
  process.env.NEOTOMA_ENTITY_SEARCH_INDEX = "off";
  try {
    return await fn();
  } finally {
    delete process.env.NEOTOMA_ENTITY_SEARCH_INDEX;
  }
}

describe("entity search scan (#2659)", () => {
  afterAll(async () => {
    const lines = rowsOut.map(
      (r) =>
        `| ${r.entities} | ${r.query} | ${r.reference_ms.toFixed(0)} | ${r.full_scan_ms.toFixed(0)} | ${r.indexed_ms.toFixed(1)} | ${r.total} |`
    );
    // eslint-disable-next-line no-console
    console.log(
      [
        "",
        `typed search, limit 1 (#2659); ${NOISE_FRAGMENTS} unrelated fragment rows`,
        "| entities of type | query | reference ms | full scan ms | indexed ms | total |",
        "|---|---|---|---|---|---|",
        ...lines,
        "",
        "index backfill (maintainer, batch 200)",
        "| entities | backfill ms | entities/s | db growth MB |",
        "|---|---|---|---|",
        ...backfillRows.map(
          (r) =>
            `| ${r.entities} | ${r.backfill_ms.toFixed(0)} | ${r.per_second.toFixed(0)} | ${r.db_growth_mb.toFixed(1)} |`
        ),
        "",
        "raw_fragments loading for every entity of the type (now indexed on entity_id)",
        "| candidates | chunked ms | single statement ms |",
        "|---|---|---|",
        ...loaderRows.map(
          (r) => `| ${r.entities} | ${r.chunked_ms.toFixed(0)} | ${r.single_ms.toFixed(0)} |`
        ),
        "",
        ...notes,
        "",
      ].join("\n")
    );
    clearDbCache();
    if (isolated.previous === undefined) delete process.env.NEOTOMA_SQLITE_PATH;
    else process.env.NEOTOMA_SQLITE_PATH = isolated.previous;
    for (const suffix of ["", "-wal", "-shm"]) rmSync(isolated.path + suffix, { force: true });
  });

  for (const size of SIZES) {
    it(`typed search over ${size} entities returns the reference total`, async () => {
      if (!noiseSeeded) {
        await seedNoise(NOISE_FRAGMENTS);
        noiseSeeded = true;
        // What the first open after upgrade pays: build the fragment index.
        const connection = await getDb();
        await connection.exec("DROP INDEX IF EXISTS idx_raw_fragments_entity");
        const build = await timed(() =>
          connection.exec(
            "CREATE INDEX IF NOT EXISTS idx_raw_fragments_entity ON raw_fragments(entity_id)"
          )
        );
        notes.push(
          `idx_raw_fragments_entity build over ${NOISE_FRAGMENTS} rows: ${build.ms.toFixed(0)} ms ` +
            `(${((build.ms / NOISE_FRAGMENTS) * 1e6).toFixed(0)} ms per million rows)`
        );
        await runEntitySearchIndexMaintenance();
      }
      const entityType = `bench2659_${run}_s${size}`;
      seededTypes.push(entityType);
      await seed(entityType, size);

      const bytesBefore = dbBytes();
      const backfill = await timed(() => runEntitySearchIndexMaintenance());
      expect(backfill.value.backfillComplete).toBe(true);
      expect(backfill.value.reindexed + backfill.value.backfilled).toBeGreaterThanOrEqual(size);
      backfillRows.push({
        entities: size,
        backfill_ms: backfill.ms,
        per_second: (size / backfill.ms) * 1000,
        db_growth_mb: (dbBytes() - bytesBefore) / 1e6,
      });

      const queries = [
        { label: "no match", text: `zzqxnomatch${run}`, expectTotal: 0 },
        { label: "1% match", text: `rareneedle${run}`, expectTotal: Math.ceil(size / 100) },
      ];
      for (const query of queries) {
        const reference = await timed(() => referenceScan(entityType, query.text));
        const fullScan = await withIndexOff(() => timed(() => search(entityType, query.text)));
        const indexed = await timed(() => search(entityType, query.text));
        const indexedMedian = await median(() => search(entityType, query.text));
        rowsOut.push({
          entities: size,
          query: query.label,
          reference_ms: reference.ms,
          full_scan_ms: fullScan.ms,
          indexed_ms: indexedMedian,
          total: indexed.value.total,
        });
        expect(reference.value).toBe(query.expectTotal);
        expect(fullScan.value.total).toBe(query.expectTotal);
        expect(indexed.value.total).toBe(query.expectTotal);
        expect(indexed.value.entities.map((e) => e.entity_id)).toEqual(
          fullScan.value.entities.map((e) => e.entity_id)
        );
      }

      const { data: idRows } = await db
        .from("entities")
        .select("id")
        .eq("user_id", USER_ID)
        .eq("entity_type", entityType);
      const ids = (idRows ?? []).map((row: { id: string }) => row.id);
      const chunked = await timed(() => loadRawFragmentTextChunked(ids));
      const single = await timed(() => loadRawFragmentTextByEntityId(ids));
      loaderRows.push({ entities: size, chunked_ms: chunked.ms, single_ms: single.ms });
      expect(single.value.size).toBe(chunked.value.size);
    }, 1_800_000);
  }

  it("indexed cost does not grow with the size of the type", () => {
    const noMatch = rowsOut.filter((r) => r.query === "no match");
    if (noMatch.length < 2) return;
    const smallest = noMatch[0]!;
    const largest = noMatch[noMatch.length - 1]!;
    // The full scan grows with the type; the indexed search must not. Allow
    // generous noise: a few milliseconds either way is timer jitter.
    expect(largest.indexed_ms).toBeLessThan(Math.max(25, smallest.indexed_ms * 3));
    expect(largest.indexed_ms).toBeLessThan(largest.full_scan_ms / 10);
  });
});
