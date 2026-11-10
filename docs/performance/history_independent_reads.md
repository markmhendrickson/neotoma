# Current-state reads independent of history length (#2792)

Current state lives in `entity_snapshots`. A read of current state (a list
page, its total, the total's certification, a single snapshot) should cost the
same whether an entity has one observation or seven hundred. A client that
re-stores unchanged records on every sync pass produces exactly that history,
and before this change every one of those reads walked it.

## Read paths that walked history, and what they read now

| Path                                                                                                                                 | Before                                                                                                      | Now                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| List page: unknown-field fragments (`queryEntities`)                                                                                 | every observation of every page entity, to learn its sources, then fragments by source                      | per (entity, key), the newest fragment whose source still observed the entity, through `idx_raw_fragments_entity_key_seen` (`readCurrentEntityFragments`) |
| List page and unfiltered/filtered total, after a recorded lifecycle cutover (`getDeletedEntityIds`, `filterCurrentLifecycleRecords`) | `isEntityDeleted` per entity: the full attached history (`SELECT *`), then the physical id list, per entity | the lifecycle-authority rows targeted at the page's entities, one indexed read per chunk (`selectHiddenAfterCutover`)                                     |
| List page before a cutover: snapshot-less candidates (`getLegacyDeletedEntityIds`)                                                   | every observation row of each candidate                                                                     | one existence probe per candidate                                                                                                                         |
| Count certification, hidden entities (`certifySnapshotPopulation`)                                                                   | the full history (`SELECT *`) of every snapshot-less entity                                                 | after a cutover, the authority rows; before, the rows at the entity's highest `source_priority` (the only rows the legacy selector can select)            |
| Single snapshot read (`getEntityWithProvenance`): visibility                                                                         | `isEntityDeleted`: full history                                                                             | as above; before a cutover, the deciding rows, or for a long run of ordinary stores the newest row by an index-ordered read                               |
| Single snapshot read: fragments                                                                                                      | an unordered 100-observation source sample, then every observation of the type from those sources           | same reader as the list                                                                                                                                   |
| Current-snapshot endpoint (`/get_entity_snapshot`), after a cutover                                                                  | `isEntityDeleted`: full history                                                                             | the entity's lifecycle-authority rows (`isOwnedEntityHiddenAfterCutover`)                                                                                 |

`tests/performance/history_length_reads.bench.test.ts` holds a 1-observation
type and a 500-observation type with equal entity counts to within 2x on all
four reads, in both lifecycle modes, and asserts the list reads no more
observation rows for the long type. It runs in the `CI test lanes` workflow.

## Equivalence and what is no longer checked per read

The bounded readers return the answer the exhaustive acquisition returns
whenever that acquisition answers. After a cutover they also refuse, as the
exhaustive acquisition does, when a lifecycle-authority row attached to the
entity is malformed or names something other than an owned entity of the same
type; those rows are read through `idx_entity_lifecycle_attached`, so the check
costs the entity's lifecycle actions, not its history. A refusal there is the
same refusal the exhaustive path gives. The index is created when a store with
the lifecycle columns is opened, not by the lifecycle migration, whose
executor admits only an allowlisted schema delta; migration runs offline, so
the next open of a migrated store creates it.

What lists, totals, count certification and single snapshot reads no longer
re-verify is the integrity of rows that cannot decide the answer: factual
observations below the deciding priority, legacy-membership digests, and
authority rows written under another owner. Field provenance, timeline and
as-of reads, the cutover replay and `verifyEntityLifecycleStorage` keep the
exhaustive acquisition and still refuse that corruption.
`tests/integration/current_state_reads.test.ts` compares the bounded and
exhaustive answers.

Two visible details of the fragment reader:

- A fragment whose source no longer holds an observation of its entity (for
  example after the entity was physically erased) is omitted from
  `raw_fragments`. Before, eligibility was the union of sources across the
  whole page.
- Ties on `last_seen` for one key resolve to the fragment with the greater
  `id`. Before, they resolved in scan order.

A failure reading entity-named fragments on a list page is reported with the
existing trace reason `raw_fragments_unavailable`. The source-lookup reasons
(`raw_fragment_sources_unavailable`, `raw_fragment_source_cap`,
`raw_fragment_links_unavailable`) now fire only on the legacy-fragment path,
which is the only path that still looks sources up.

## Paths that still read history

These are deliberate and bounded by something other than a visible entity's
history length:

- **Legacy fragments** (no `entity_id`) are attributed through their source as
  before, which needs the page entities' sources. This runs only for a type
  that has any legacy fragment (`hasLegacyFragments`).
- **Pre-cutover visibility fallbacks**: more than 64 rows at the deciding
  priority in certification, or an `observed_at` at that priority that is not
  in `toISOString()` form (text order would then not be time order), falls back
  to the exhaustive read. The format check reads index entries only.
- **Merge tombstones** passed to a visibility check keep the exhaustive path
  (their attachment resolves to a survivor).
- **`identity_basis` filters** select from `observations` by basis; that cost
  follows the matching observations, not per-entity history.
- **Provenance, timeline and as-of reads** read history by definition.

## No-op store suppression (#2792 point 1)

Re-storing an unchanged record used to append an observation (and, for unknown
fields, a fragment) per sync pass. Reads no longer pay for that history; this
change stops the history from growing in the first place.

### What a suppressed store does

A structured store (REST `POST /store`, MCP `store`) whose incoming fields
repeat the entity's current top observation appends nothing. It upserts one row
in the side table `observation_sightings` against the observation it repeated
and succeeds:

```json
{ "entity_id": "...", "observation_id": "<the EXISTING observation>", "seen_again": true, "seen_count": 3, "deduplicated": false }
```

`seen_again` and `seen_count` appear only on a suppressed entry; every existing
field keeps its meaning. `deduplicated` still means an idempotency replay, which
is a different thing. `seen_count` counts the repeats (the original write is not
one) including this store.

`observation_sightings(observation_id, user_id, entity_id, seen_count,
first_seen_again_at, last_seen_at, last_source_id)` is keyed by
`(observation_id, user_id)`: one row per repeated observation and owner, so a
sighting can never attach to another owner's observation. Observations stay
append-only and immutable. The table is created when the store is opened, not by
the lifecycle migration, for the same reason as `idx_entity_lifecycle_attached`
above: the migration executor admits only an allowlisted schema delta, and a
table that exists before the migration is on both sides of its comparison.

`list_observations` (MCP and REST) and `GET /observations` add a `seen_again`
object (`seen_count`, `first_seen_again_at`, `last_seen_at`) to an observation
that has been seen again, and nothing to any other. Field provenance still points
at the observation that decided each field, which is the repeated one.

### When a store is suppressed

Only when all of these hold; any doubt stores as before:

- the instance policy switch is on (below);
- the entity's newest observation at its highest `source_priority` is also its
  newest observation overall (the `last_write` strategy ignores priority, so a
  newer lower-priority row could otherwise be re-ordered by a repeat);
- that observation has the same owner, entity type, schema version,
  `source_priority`, `specificity_score` and `observation_source`, and neither
  it nor the incoming write has a peer origin;
- the incoming fields are deep-equal to its fields (canonical JSON: key order
  does not matter);
- it is an ordinary factual store row: no lifecycle authority tuple, no
  `_deleted` or `_encrypted` marker, not a correction, not a conditional write,
  and it has a source. The incoming fields carry no such marker either;
- the store added no new unknown-field fragment (below).

The rule never suppresses: a changed value, a value that changed and changed
back (A, B, A stores all three; the third is compared with B), a write at
another priority or kind of write, anything on an entity that has a deletion,
restore or correction row (those write at priority 1000, above every ordinary
store, so such an entity keeps appending), the first ordinary store after a
lifecycle cutover (the entity's newest row is its baseline authority row; the
next store repeats the row that store appended), and any write path other than
the two structured stores (conditional store, corrections, merges, splits,
interpretation, peer replay).

A repeat would tie the top observation on every merge key and be newer than
it, which is already the newest row overall. `last_write` therefore keeps the
repeated value, `highest_priority` and `most_specific` pick the same winner
with the same value, and `merge_array` unions members the top observation
already contributed. The guards of `createObservation` (attribution, protected
types, override policy, ownership) run before the decision, so a suppressed
write needed the same permissions as an appended one.

### What a sighting does and does not change

- `entity_snapshots.observation_count` and `last_observation_at` keep their
  meaning: observation ROWS. A sighting moves neither. "Last confirmed" is the
  sighting's `last_seen_at`.
- No `observation.created` or `entity.updated` substrate event fires for a
  suppressed store: nothing was created and the snapshot did not change.
- `entities.updated_at` and timeline events are not touched by a repeat.
- Schema-driven auto-linking and derived-entity extraction still run on the
  REST path, so a reference whose target appeared since the last pass still
  links.
- Each pass still writes its own `sources` row (and raw payload, which is
  content-addressed): a batch that changed elsewhere is a new source. That
  growth is not addressed here.

### Fragments

Unknown fields and converted-value originals go to `raw_fragments`. With
suppression on, when the entity's newest fragment for a key already carries the
same value and envelope, from any source, that fragment's `frequency_count` and
`last_seen` are bumped instead of inserting a row. A new fragment row is
inserted when the value changed, and rows inserted with suppression on carry
`frequency_count`, `first_seen` and `last_seen` (before they were NULL, which
sorted below every bumped row). A fragment is current only while its source
still has an observation of the entity, so a store that inserts a new fragment
always appends its observation: only a store whose fragments were all repeats is
suppressed. The newest fragment per key, which is what the readers pick, still
carries the current value.

### The switch

The instance policy field `suppress_noop_observations` (boolean, on unless
`false`; shown by `describe_instance_policy`, set with `neotoma instance-policy
set --file`) turns suppression and fragment reuse off for the whole instance.
It is read once per store call and never cached, so turning it back on takes
effect on the next store. An unreadable policy means off. It never rejects a
write and is not part of `enforcement`.

## Not covered here

Online compaction of existing runs is point 3 and is not part of this change.
Rows already stored are untouched; the `sources` row per pass (above) and
stores whose fields really changed still grow the store. `entity_snapshots`
is rebuilt from observations as before.
