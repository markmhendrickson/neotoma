# Graph traversal scale benchmark (#1467)

Measures the cost of Neotoma's native breadth-first multi-hop traversal — the
algorithm behind `retrieve_related_entities` and `retrieve_graph_neighborhood`.
The purpose is to answer, with measured numbers rather than assumption, whether
native traversal is fast enough for a given workload or whether a dedicated
graph database is still warranted.

## How to run

```bash
npm run test:bench
```

The benchmark lives in `tests/performance/graph_traversal.bench.test.ts` and is
**excluded from the default `npm test` lane** (it seeds large datasets and is
slow). It runs only when `RUN_BENCH=1` is set, which `npm run test:bench`
provides.

## What it measures

The traversal is an **in-memory BFS over the `relationship_snapshots` table**:
at each hop it issues point queries (`source_entity_id` / `target_entity_id`)
for every node in the current frontier, expands to unseen neighbours, and
repeats. There is no precomputed adjacency index — cost is dominated by the
number of per-hop queries, which grows with both the neighbourhood size and the
total table size.

The benchmark seeds a breadth-first tree rooted at a hub (fan-out 8), so a
3-hop traversal visits ≈ 8 + 64 + 512 = 585 nodes — a realistic "warm
relationship graph" shape — while the *total* relationship count varies.

## Measured results

Local SQLite (WAL), single process. Indicative numbers; absolute values vary by
hardware, but the **scaling shape** is the takeaway.

| relationships | 1-hop (ms) | 2-hop (ms) | 3-hop (ms) | nodes visited @ 3 hops |
|---|---|---|---|---|
| 1,000  | ~5   | ~23  | ~185 | 585 |
| 10,000 | ~7   | ~53  | ~430 | 585 |
| 50,000 | ~12  | ~96  | ~777 | 585 |

## Interpretation

- **1-hop is cheap and roughly flat** (5–12 ms) across table sizes — a direct
  neighbour lookup is a single indexed query regardless of total graph size.
- **Cost grows super-linearly with hop depth**, because each hop fans out to
  many more point queries. 3-hop over a ~585-node neighbourhood is the
  expensive case.
- **Total table size matters**, not just neighbourhood size: the same 585-node
  3-hop traversal goes from ~185 ms at 1k relationships to ~777 ms at 50k. Each
  per-hop query scans a larger table.

## Practical guidance and the "do we still need Neo4j?" question

- For **shallow traversals (1–2 hops)** at the table sizes a typical
  relationship-intelligence product reaches, native traversal is comfortably
  fast (tens of ms) and a separate graph DB is **not** justified by latency.
- For **deep traversals (3+ hops) over large graphs (tens of thousands of
  relationships and up)**, latency enters the hundreds-of-ms range and keeps
  climbing. A consumer doing frequent deep traversals at scale should either
  (a) cap hop depth, (b) cache hot neighbourhoods, or (c) project into a
  dedicated graph index (e.g. Neo4j) — which is exactly the Phase 5 decision in
  the Prospect CRM adoption plan, now answerable with these numbers rather than
  a guess.
- There is currently **no precomputed adjacency index** and no stated scale
  ceiling in the code. If deep-traversal-at-scale becomes a hot path, an
  adjacency materialisation (or recursive SQL CTE) is the natural next
  optimisation before reaching for an external graph DB.

## Caveats

- Numbers are from local SQLite in a single process; a production deployment's
  storage and concurrency profile will differ.
- The benchmark times the traversal algorithm directly against the DB, not
  through the MCP or HTTP transport, so it isolates traversal cost from request
  overhead.
- This is a measurement artifact, not a regression gate: the test asserts only
  loose sanity bounds so it does not become flaky.
