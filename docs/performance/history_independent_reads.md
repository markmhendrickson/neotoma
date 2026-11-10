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

`tests/performance/history_length_reads.bench.test.ts` holds a 1-observation
type and a 500-observation type with equal entity counts to within 2x on all
four reads, in both lifecycle modes, and asserts the list reads no more
observation rows for the long type. It runs in the `CI test lanes` workflow.

## Equivalence and what is no longer checked per read

The bounded readers return the answer the exhaustive acquisition returns
whenever that acquisition answers. What a list no longer does is re-verify the
integrity of rows that cannot decide the answer: factual observations below
the deciding priority, legacy-membership digests, and authority rows attached
to other targets. Single-entity provenance and as-of reads, the cutover replay
and `verifyEntityLifecycleStorage` keep the exhaustive acquisition and still
refuse that corruption. `tests/integration/current_state_reads.test.ts`
compares the bounded and exhaustive answers.

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

## Not covered here

Growth itself: re-storing an unchanged record in a batch that changed elsewhere
still appends an observation and a fragment per pass. The benchmark's growth
gate is `it.fails` until no-op store suppression lands (#2792 point 1); online
compaction of existing runs is point 3. Both change what is persisted.
