/**
 * Graph-traversal scale benchmark (#1467).
 *
 * Excluded from the default test lane (see vitest.config.ts: tests/performance/**
 * is only included when RUN_BENCH=1). Run with: `npm run test:bench`.
 *
 * Measures the cost of the breadth-first multi-hop traversal used by
 * retrieve_related_entities / retrieve_graph_neighborhood. The traversal is an
 * in-memory BFS over the relationship_snapshots table: at each hop it queries
 * relationship_snapshots for the current frontier and expands. This benchmark
 * replicates that loop directly against the DB so the numbers reflect the real
 * per-hop query + expansion cost without MCP/HTTP transport noise.
 *
 * The purpose is to answer "is native traversal fast enough, or do we still
 * need a dedicated graph DB?" with measured numbers rather than assumption. It
 * prints a table and asserts only loose sanity bounds (so it does not become a
 * flaky gate) — the artifact is the printed measurement, captured in
 * docs/performance/graph_traversal.md.
 */

import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../src/db.js";

const USER_ID = "00000000-0000-0000-0000-000000000000";
const SIZES = [1_000, 10_000, 50_000];
const HOPS = [1, 2, 3];

interface BenchRow {
  relationships: number;
  hop1_ms: number;
  hop2_ms: number;
  hop3_ms: number;
  visited_at_3: number;
}

/**
 * Replicates the handler's BFS: level frontier + visited set, querying
 * relationship_snapshots (outbound, both directions) per hop.
 */
async function traverse(startId: string, maxHops: number): Promise<number> {
  const visited = new Set<string>([startId]);
  let frontier = [startId];

  for (let hop = 0; hop < maxHops; hop++) {
    const next: string[] = [];
    for (const node of frontier) {
      const { data: outbound } = await db
        .from("relationship_snapshots")
        .select("*")
        .eq("source_entity_id", node)
        .eq("user_id", USER_ID);
      const { data: inbound } = await db
        .from("relationship_snapshots")
        .select("*")
        .eq("target_entity_id", node)
        .eq("user_id", USER_ID);
      for (const rel of outbound ?? []) {
        if (!visited.has(rel.target_entity_id)) {
          visited.add(rel.target_entity_id);
          next.push(rel.target_entity_id);
        }
      }
      for (const rel of inbound ?? []) {
        if (!visited.has(rel.source_entity_id)) {
          visited.add(rel.source_entity_id);
          next.push(rel.source_entity_id);
        }
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return visited.size;
}

/**
 * Seed a wide, shallow graph: one hub linked to `fanout` first-level nodes,
 * each of which links to a few second-level nodes, etc. This produces a
 * realistic relationship count while keeping a known traversal root.
 */
async function seedGraph(
  prefix: string,
  relationshipCount: number
): Promise<{ hub: string; keys: string[] }> {
  const hub = `${prefix}_hub`;
  const rows: Array<Record<string, unknown>> = [];
  const keys: string[] = [];

  // Build a breadth-first tree rooted at the hub so traversal genuinely expands
  // hop by hop (rather than a wide-but-shallow star where 3 hops still only see
  // a handful of nodes). Each node gets up to FANOUT children, assigned in BFS
  // order, until we hit relationshipCount edges. With FANOUT=8 the hub's 3-hop
  // neighbourhood is ~8 + 64 + 512 nodes, a realistic "warm relationship graph"
  // shape.
  const FANOUT = 8;
  const queue: string[] = [hub];
  let created = 0;
  let head = 0;
  while (created < relationshipCount) {
    const parent = queue[head % queue.length]!;
    head++;
    for (let c = 0; c < FANOUT && created < relationshipCount; c++) {
      const child = `${prefix}_n${created}`;
      const key = `related_to:${parent}:${child}`;
      keys.push(key);
      rows.push({
        relationship_key: key,
        relationship_type: "related_to",
        source_entity_id: parent,
        target_entity_id: child,
        schema_version: "1.0",
        snapshot: {},
        user_id: USER_ID,
      });
      queue.push(child);
      created++;
    }
  }
  // Bulk insert in chunks to avoid oversized statements.
  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.from("relationship_snapshots").insert(rows.slice(i, i + CHUNK));
  }
  return { hub, keys };
}

async function cleanup(keys: string[]): Promise<void> {
  const CHUNK = 500;
  for (let i = 0; i < keys.length; i += CHUNK) {
    await db
      .from("relationship_snapshots")
      .delete()
      .in("relationship_key", keys.slice(i, i + CHUNK));
  }
}

describe("graph traversal scale benchmark (#1467)", () => {
  const prefix = `bench_${process.hrtime.bigint()}`;
  const results: BenchRow[] = [];
  const allKeys: string[] = [];

  afterAll(async () => {
    await cleanup(allKeys);
    // Print the table as the benchmark artifact.

    const header = "| relationships | 1-hop (ms) | 2-hop (ms) | 3-hop (ms) | visited@3 |";
    const sep = "|---|---|---|---|---|";
    const lines = results.map(
      (r) =>
        `| ${r.relationships} | ${r.hop1_ms.toFixed(1)} | ${r.hop2_ms.toFixed(1)} | ${r.hop3_ms.toFixed(
          1
        )} | ${r.visited_at_3} |`
    );
    // eslint-disable-next-line no-console
    console.log(["", "Graph traversal benchmark (#1467)", header, sep, ...lines, ""].join("\n"));
  });

  for (const size of SIZES) {
    it(`traverses a ${size}-relationship graph at 1/2/3 hops`, async () => {
      const sizePrefix = `${prefix}_s${size}`;
      const { hub, keys } = await seedGraph(sizePrefix, size);
      allKeys.push(...keys);

      const timings: Record<number, number> = {};
      let visitedAt3 = 0;
      for (const hops of HOPS) {
        const start = process.hrtime.bigint();
        const visited = await traverse(hub, hops);
        const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
        timings[hops] = ms;
        if (hops === 3) visitedAt3 = visited;
      }

      results.push({
        relationships: size,
        hop1_ms: timings[1]!,
        hop2_ms: timings[2]!,
        hop3_ms: timings[3]!,
        visited_at_3: visitedAt3,
      });

      // Loose sanity bounds only — the artifact is the printed table, not a gate.
      expect(visitedAt3).toBeGreaterThan(1);
      expect(timings[1]).toBeGreaterThan(0);
    }, 120_000);
  }
});
