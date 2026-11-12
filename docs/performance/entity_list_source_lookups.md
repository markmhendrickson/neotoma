# Entity listing and fragment upsert cost

Measures the two request shapes that froze a hosted instance on the
single-connection SQLite backend, where one slow read blocks every other
request on the process:

- `GET /entities?entity_type=<large type>&limit=500` (a listing page), whose
  cost did not follow the page size and followed the **stored volume of the
  type** instead.
- A store of a few dozen entities, whose per-fragment upsert probe was a full
  scan of `raw_fragments`.

## Cause

Two things, in how `raw_fragments` and `observations` are reached:

1. There was no index on `source_id` (on either table) or on
   `raw_fragments.entity_id`. Every source lookup, and the probe `storeFragment`
   issues before each fragment write, was a full table scan.
2. The listing fetched fragments by `source_id` alone. A source is shared by
   every entity one store call wrote, and a 500-entity page is spread across
   all of a type's sources, so the fetch returned and JSON-parsed the fragments
   of the whole type on every request. An index on `source_id` alone cannot fix
   that (measured below); the fetch has to be bounded to the page's own entity
   ids.

## Fix

- `idx_observations_source (source_id, entity_type, entity_id)`: the legacy
  source-to-entity link lookup is served from the index alone, and every
  `WHERE source_id = ?` read stops scanning.
- `idx_raw_fragments_entity_source (entity_id, source_id)`: the listing fetch,
  bounded to the page's own entity ids.
- `idx_raw_fragments_source_key (source_id, fragment_key, entity_id)`: the
  `storeFragment` probe, and fragments written without an `entity_id`.
- The listing now fetches fragments that name their entity by the page's entity
  ids, and looks up fragments with no `entity_id` (legacy rows) separately,
  running the source-to-entity link lookup only when such rows exist. Which
  fragments reach a page entity is unchanged; the tests assert that, including
  the legacy attribution rules.

All three indexes are `CREATE INDEX IF NOT EXISTS` in `ensureSchema`, so they
are applied to an existing database the first time it is opened after upgrade
and are a no-op on every later open. Building them is one sequential pass over
the table, synchronous on the single connection, before the server accepts
requests: locally about 0.03 s / 0.01 s / 0.01 s at 34k observations and 32k
fragments, and 0.16 s / 0.09 s / 0.10 s at 136k observations and 128k fragments.
Expect proportionally more on a slow network volume, still seconds rather than
minutes; only the first start after upgrade pays it. Writes pay one extra small
index entry per row on each of the two tables.

## How to run

```bash
npm run build:server
RUN_BENCH=1 npx vitest run tests/performance/entity_list_page.bench.test.ts
BENCH_SCALE=4 RUN_BENCH=1 npx vitest run tests/performance/entity_list_page.bench.test.ts
```

The regression gates are deterministic: the number of fragment rows a listing
fetches, the query plans (no `SCAN raw_fragments` / `SCAN observations`), and
one loose per-upsert time bound. The fast, default-lane checks are in
`tests/integration/entity_list_source_lookups.test.ts`.

## Results

Laptop, median of 5, milliseconds. Corpus: four entity types (a mail-shaped type
with 6 KB observations and four 8 KB fragments per entity, a shipment type, a
customer type and an order type with no fragments), 34k observations and 32k
fragments at `BENCH_SCALE=1`; 500-entity pages.

| step                 | before | indexes only | indexes + bounded fetch |
| -------------------- | ------ | ------------ | ----------------------- |
| list 500 mail        | 444    | 446          | **87**                  |
| list 500 shipment    | 80     | 51           | **35**                  |
| list 500 customer    | 60     | 41           | **23**                  |
| list 500 order       | 50     | 20           | **20**                  |
| 210 fragment upserts | 840    | n/a          | **40**                  |

At `BENCH_SCALE=4` (136k observations, 128k fragments) the "before" listing
grows with the corpus (mail 653, shipment 195, customer 149, order 146) and the
fixed listing grows far less (mail 82, shipment 53, customer 43, order 44; the
remaining growth is the entity-id walk and the population check, not the
fragment fetch).

"Indexes only" is the old query on the new schema: it removes the table scans
but still fetches the whole type's fragments, which is why the mail row does
not move. The bounded fetch is what removes that.

## `entities` listing indexes (user, type, id, name)

`entities` had no index beyond its primary key, so every listing or certificate
read scoped by `user_id` and `entity_type` scanned the whole table (hosted
instance: ~1.1 s for a limit-5 page at ~297k rows, bursts saturating the DB
reader pool). `ensureSchema` now builds four indexes, one per query shape the
real `queryEntities` builder emits:

- `idx_entities_user_type_live_id (user_id, entity_type, merged_to_entity_id, id)`: single-type page and keyset; also covers the certificate query.
- `idx_entities_user_live_id (user_id, merged_to_entity_id, id)`: type-less listing, both keyset directions, and multi-type `IN (...)` pages.
- `idx_entities_user_type_live_name (user_id, entity_type, merged_to_entity_id, canonical_name, id)` and `idx_entities_user_live_name (user_id, merged_to_entity_id, canonical_name, id)`: `sort_by=canonical_name`, typed and type-less.

`merged_to_entity_id` is placed after the equality columns because listings
filter `IS NULL`, which SQLite treats as an equality, so the next column still
supplies order. A single `(user_id, entity_type, id)` index was tried first and
regressed the type-less listing (~0.1 ms to ~220 ms, temp sort of every row the
user owns) and `sort_by=canonical_name` (30 ms to 150-300 ms), which is why the
set is larger. `tests/unit/entities_user_type_index.test.ts` captures the SQL
from the real builder and asserts each plan; `scripts/bench_entities_user_type_index.ts`
produced the numbers below (synthetic data, 5 dominant types plus 150 tail
types, median of 5, 200-row page chunk, sqlite driver; libsql is within noise).

| shape | 300k before | 300k after | 1M before | 1M after |
| --- | --- | --- | --- | --- |
| type-less listing | 0.3 | 0.2 | 0.2 | 0.3 |
| keyset `id >` / `id <` DESC | 0.2 | 0.2 | 0.2 | 0.2 |
| single type, dominant | 0.2 | 0.2 | 0.3 | 0.2 |
| single type, tail | 301 | 0.2 | 276 | 0.2 |
| multi type, dominant + tail | 0.3 | 0.3 | 0.3 | 0.3 |
| multi type, two tail (id-ordered walk of the user's rows, filtered) | 130 | 135 | 133 | 135 |
| name sort, type-less | 31 | 0.2 | 105 | 0.3 |
| name sort, dominant type | 33 | 0.2 | 105 | 0.2 |
| name sort, tail type | 25 | 0.2 | 89 | 0.2 |
| `include_merged=true`, type-less | 0.2 | **15** | 0.3 | **47** |
| `include_merged=true`, tail type | 265 | 0.3 | 262 | 0.3 |
| certificate, tail type | 30 | 0.1 | 102 | 0.3 |
| certificate, dominant type | 177 | 136 | 828 | 786 |

Costs: first-boot build on an existing database ~3 s at 300k rows and ~10-14 s
at 1M (a one-time cost, inside the boot transaction so it holds the write lock;
later boots are a no-op); the database grows by about 131 MB at 300k rows and
436 MB at 1M. Known limits: a multi-type `IN (...)` page of rare types walks the
user's id-ordered rows and is no faster than before (the planner may also use a
temp sort for this shape, so it is not asserted sort-free); `include_merged=true`
(opt-in, no `IS NULL` filter) loses index order for the type-less case and sorts
it (worse than before, bounded); a dominant-type certificate still visits most
of the type, so it improves only modestly.
