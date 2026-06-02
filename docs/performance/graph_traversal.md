# Graph traversal benchmark (#1467)

Measures the cost of Neotoma's native breadth-first multi-hop traversal — the
algorithm behind `retrieve_related_entities` and `retrieve_graph_neighborhood`
— along two dimensions: graph **scale** (total table size) and **fan-out**
(degree of a single hub). The purpose is to answer, with measured numbers rather
than assumption, whether native traversal is fast enough for a given workload or
whether a dedicated graph database is still warranted.

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
repeats. Composite indexes on `(source_entity_id, user_id)` and
`(target_entity_id, user_id)` (#1467) make each per-hop lookup an indexed query
rather than a table scan. Two dimensions drive cost, and the benchmark measures
them separately:

1. **Total table size** — does traversal stay fast as the overall graph grows?
2. **Fan-out at a node** — what happens at a single high-degree hub (the
   "super-connector": one entity linked to thousands of others)?

These are different questions, and they have different answers.

### Dimension 1: scale (fixed neighbourhood, growing table)

Seeds a breadth-first tree rooted at a hub (fan-out 8), so a 3-hop traversal
visits ≈ 8 + 64 + 512 = 585 nodes — a fixed "warm relationship graph"
neighbourhood — while the _total_ relationship count varies.

| relationships | 1-hop (ms) | 2-hop (ms) | 3-hop (ms) | nodes visited @ 3 hops |
| ------------- | ---------- | ---------- | ---------- | ---------------------- |
| 1,000         | ~0.3       | ~0.5       | ~2.5       | 585                    |
| 10,000        | ~0.1       | ~0.3       | ~2.5       | 585                    |
| 50,000        | ~0.1       | ~0.3       | ~5.8       | 585                    |

With the indexes in place, a fixed-size neighbourhood traversal is **flat
against total table size** — 3-hop over a 585-node neighbourhood costs single-
digit milliseconds whether the table holds 1k or 50k relationships. (Before the
indexes the same 50k/3-hop case was ~777 ms; the indexes are a ~130× reduction
on that case.)

### Dimension 2: fan-out (single high-degree hub)

The scale table holds the neighbourhood fixed, so it does **not** exercise a
wide frontier. This benchmark does: one hub with `degree` direct neighbours,
each neighbour carrying a secondary fan-out of 4. The hub's 1-hop frontier is
`degree` wide; its 2-hop frontier is `degree × 4` wide.

| hub degree | total relationships | 1-hop (ms) | 2-hop (ms) | visited @ 1 | visited @ 2 |
| ---------- | ------------------- | ---------- | ---------- | ----------- | ----------- |
| 100        | 500                 | ~0.3       | ~2.7       | 101         | 501         |
| 1,000      | 5,000               | ~1.7       | ~27.6      | 1,001       | 5,001       |
| 5,000      | 25,000              | ~9.1       | ~142.8     | 5,001       | 25,001      |
| 20,000     | 100,000             | ~40.7      | ~548.5     | 20,001      | 100,001     |

Unlike the scale dimension, **fan-out cost grows roughly linearly with hub
degree.** A 20,000-degree super-connector costs ~40 ms for a single hop and
~550 ms for two hops, because the traversal must materialise and expand a
frontier proportional to the degree. The indexes make each lookup fast; they do
not change the fact that a wide frontier means proportionally more lookups and
more in-memory expansion.

## Interpretation

- **Depth over a normal neighbourhood is cheap** — single-digit ms at 3 hops,
  flat against table size. The indexes solve the "does it stay fast as the graph
  grows?" question.
- **Fan-out is the real ceiling.** Cost scales with the degree of the node you
  start from (and of the nodes you pass through). A high-degree hub is the case
  that gets expensive, and it does so independently of total table size.
- The two combine: a deep traversal _through_ one or more high-degree hubs is
  the worst case, because each such hub multiplies the frontier the next hop
  must expand.

## Practical guidance and the "do we still need a dedicated graph DB?" question

- For **shallow-to-moderate traversals over ordinary-degree nodes**, native
  traversal is comfortably fast (single-digit to low-tens of ms) and a separate
  graph DB is **not** justified by latency, even at tens of thousands of
  relationships.
- For **traversals rooted at or passing through high-degree hubs**, latency
  scales with degree and reaches hundreds of ms at the 2-hop / 20k-degree end. A
  consumer with super-connector nodes and frequent multi-hop queries through
  them should either (a) cap hop depth, (b) cache hot hub neighbourhoods, (c)
  bound or paginate the per-hop frontier, or (d) project into a dedicated graph
  index. Whether to reach for an external graph DB is a function of **how many
  high-degree hubs the workload traverses and how often**, not of total graph
  size.
- The indexes (#1467) remove total-table-size as a cost driver. Fan-out remains
  one. If high-degree multi-hop becomes a hot path, a bounded-frontier or
  adjacency-materialisation optimisation is the natural next step before an
  external graph DB.

## Caveats

- Numbers are from local SQLite in a single process; a production deployment's
  storage and concurrency profile will differ. Absolute values vary by hardware
  — the **scaling shape** (flat vs. table size, linear vs. fan-out) is the
  durable takeaway, not the millisecond figures.
- The benchmark times the traversal algorithm directly against the DB, not
  through the MCP or HTTP transport, so it isolates traversal cost from request
  overhead.
- This is a measurement artifact, not a regression gate: the tests assert only
  loose sanity bounds so they do not become flaky.
