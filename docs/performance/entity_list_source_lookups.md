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
