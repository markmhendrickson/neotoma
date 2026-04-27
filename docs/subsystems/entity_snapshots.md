# Neotoma Entity Snapshot Record Type — Reducer Output Primitive

**Authoritative Vocabulary:** [`docs/vocabulary/canonical_terms.md`](../vocabulary/canonical_terms.md)

## Scope

This document covers:

- The `entity_snapshots` table — deterministic, provenance-rich, current-truth view of every entity
- How snapshots are computed by the reducer from observations
- The provenance map (`field → observation_id`) and how it powers Inspector and audit views
- The optional `embedding` column used for semantic similarity search
- Local SQLite vector index parity (`entity_embeddings_vec`, `entity_embedding_rows`)

This document does NOT cover:

- The canonical entity row (see [`docs/subsystems/entities.md`](./entities.md))
- Reducer internals, merge strategies, and converter logic (see [`docs/subsystems/reducer.md`](./reducer.md))
- Observation creation and immutability (see [`docs/subsystems/observation_architecture.md`](./observation_architecture.md))
- Vector search query patterns and tuning (see [`docs/subsystems/vector_ops.md`](./vector_ops.md))

## 1. What Is an Entity Snapshot?

An **entity snapshot** is the deterministic reducer output for one entity. It represents the system's current best answer to "given every observation we have for this entity, what is the truth right now?" It is not authoritative on its own — observations are the durable ground truth. Snapshots are derived, cached, and recomputed.

Three things make snapshots distinct:

1. **Deterministic.** Same observations + same schema + same merge rules ⇒ same snapshot. Re-running the reducer never randomly changes a field.
2. **Provenance-mapped.** Every field in the snapshot records the `observation_id` that produced it, so any value can be traced back to an interpretation, a source, and ultimately raw bytes.
3. **Embedding-aware.** Snapshots optionally carry an `embedding` vector so the entity can be semantically searched without re-reading its observations.

## 2. `entity_snapshots` Table

### 2.1 Schema

```sql
CREATE TABLE entity_snapshots (
  entity_id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL,
  observation_count INTEGER NOT NULL,
  last_observation_at TIMESTAMPTZ NOT NULL,
  provenance JSONB NOT NULL,
  user_id UUID NOT NULL,
  embedding vector(1536)
);
```

### 2.2 Field Semantics

| Field                 | Type          | Mutable | Purpose                                                                  |
| --------------------- | ------------- | ------- | ------------------------------------------------------------------------ |
| `entity_id`           | TEXT          | No      | Foreign key to `entities.id`; primary key — at most one snapshot per entity |
| `entity_type`         | TEXT          | No      | Mirrors `entities.entity_type` to avoid join on every read               |
| `schema_version`      | TEXT          | No      | Schema version used to compute this snapshot                             |
| `snapshot`            | JSONB         | Yes     | Current truth for the entity, computed by the reducer                    |
| `computed_at`         | TIMESTAMPTZ   | Yes     | Wall-clock time of the most recent reducer run                           |
| `observation_count`   | INTEGER       | Yes     | Number of observations the snapshot was computed from                    |
| `last_observation_at` | TIMESTAMPTZ   | Yes     | Timestamp of the newest observation included in the snapshot             |
| `provenance`          | JSONB         | Yes     | Map `field → observation_id`; one entry per snapshot field               |
| `user_id`             | UUID          | No      | Owner; mirrors `entities.user_id` for RLS                                |
| `embedding`           | vector(1536)  | Yes     | Optional embedding of the snapshot for semantic similarity search        |

The `snapshot` and `provenance` JSONB columns are sized 1:1 in field count: every field in `snapshot` MUST have a corresponding entry in `provenance`.

### 2.3 Indexes

```sql
CREATE INDEX idx_snapshots_type ON entity_snapshots(entity_type);
CREATE INDEX idx_snapshots_user ON entity_snapshots(user_id);
CREATE INDEX idx_snapshots_snapshot ON entity_snapshots USING GIN(snapshot);

CREATE INDEX idx_entity_snapshots_embedding
  ON entity_snapshots USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE embedding IS NOT NULL;
```

The GIN index on `snapshot` is what powers field-shaped filters (e.g. `snapshot @> '{"vendor_name":"Acme Corp"}'`). The partial `ivfflat` index covers cosine-similarity search and is intentionally restricted to rows where `embedding IS NOT NULL` so unbacked rows don't pollute the index.

### 2.4 RLS Policies

```sql
ALTER TABLE entity_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own snapshots" ON entity_snapshots
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role full access" ON entity_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

Snapshots are user-isolated. The reducer runs as `service_role`; clients never write directly. Encrypted-at-rest content columns include `entity_snapshots.snapshot` and `entity_snapshots.provenance` — see [`docs/subsystems/auth.md`](./auth.md) for which columns are encrypted in hosted deployments.

## 3. Computation

### 3.1 When Does the Reducer Run?

The reducer runs when something changes the observation set for an entity:

- A new observation is written by structured ingestion, AI interpretation, or correction.
- A reinterpretation completes and emits new observations.
- An entity merge rewrites observations from `from_entity` to `to_entity` and recomputes the target snapshot.
- A schema upgrade requires snapshots to be recomputed for a different `schema_version`.

Recomputation is **not** triggered by reads. Snapshots are cached state.

### 3.2 What the Reducer Does

For each field declared in the active entity schema:

1. Pick the merge strategy from `reducer_config` (`last_write`, `highest_priority`, `most_specific`, `merge_array`, …).
2. Apply it across the relevant observations, ordered by `(source_priority, specificity_score, observed_at)`.
3. Coerce the resulting value to the schema's declared type via the schema's converter functions.
4. Record `provenance[field] = winning_observation.id`.

Outputs:

- `snapshot` is rewritten in full (not patched) so re-running the reducer is idempotent.
- `provenance` is rewritten in full alongside it.
- `observation_count`, `last_observation_at`, `computed_at`, and `schema_version` are stamped from the run.

See [`docs/subsystems/reducer.md`](./reducer.md) for merge-strategy details and converter behavior.

### 3.3 Determinism Invariant

> Same observations + same schema + same `reducer_config` ⇒ same snapshot, byte-for-byte (modulo `computed_at`).

This is what lets Neotoma replay state at any point in time, audit historical truth, and detect non-determinism in custom reducers. See [`docs/architecture/determinism.md`](../architecture/determinism.md).

## 4. The Provenance Map

`provenance` is a JSONB object whose keys are snapshot field names and whose values are the `observation_id` that produced each value:

```json
{
  "vendor_name": "obs_5fa2…",
  "amount": "obs_91bd…",
  "currency": "obs_91bd…",
  "due_date": "obs_4cc7…"
}
```

Every snapshot field has exactly one provenance entry. From there the chain is fully resolvable:

```text
snapshot.field
  → provenance[field] = observation_id
    → observations.row
       ├── source_id           → sources row (raw bytes, content_hash)
       └── interpretation_id?  → interpretations row (model, prompt, schema_version) — NULL for structured writes
```

This is what powers the Inspector's "where did this value come from?" view and what makes it possible to answer "show me every snapshot field that came from interpretation X" queries.

## 5. Embeddings and Vector Search

The optional `embedding vector(1536)` column lets snapshots participate in semantic similarity search.

- Generation is opt-in per entity / per workflow; not every snapshot has an embedding.
- The cosine-similarity ivfflat index (`lists=100`) is partial and only covers rows where `embedding IS NOT NULL`.
- The embedding represents the snapshot at its current `computed_at`. Recomputing the reducer SHOULD invalidate or refresh the embedding when fields material to retrieval change.

### 5.1 Local SQLite parity

In local mode the `entity_snapshots.embedding` column is mirrored into a `sqlite-vec` virtual table:

- `entity_embeddings_vec` — the `vec0` virtual table itself (`embedding float[1536]`).
- `entity_embedding_rows` — maps `vec.rowid` to `entity_id`, `user_id`, `entity_type`, and `merged` so KNN results can be filtered without scanning the snapshot table.

Local query plans use the vec table for KNN and then JOIN through `entity_embedding_rows` to recover entity context. See [`docs/subsystems/vector_ops.md`](./vector_ops.md) for query shapes and tuning notes.

## 6. Snapshot Lifecycle vs Observation Lifecycle

| Property               | Observations            | Entity snapshots                              |
| ---------------------- | ----------------------- | --------------------------------------------- |
| Mutability             | Immutable               | Recomputed in place                           |
| Authority              | Ground truth            | Derived view of ground truth                  |
| Cardinality per entity | Many                    | At most one per `entity_id`                   |
| Provenance             | Self-describing         | Maps each field back to a winning observation |
| Idempotent re-derivation | N/A                   | Yes — rewriting from the same inputs is a no-op |

If `entity_snapshots` is ever lost (drop the table, restore from a partial backup, …), the reducer can rebuild it from `observations` plus the active schema registry without losing information.

## 7. Read Surfaces

- **MCP:** `get_entity(entity_id)` returns the snapshot with its provenance map. `retrieve_entities` returns snapshot-shaped rows for list/category queries.
- **HTTP:** `GET /api/entities/:id` returns the snapshot; provenance is opt-in via `?include=provenance`.
- **CLI:** `neotoma entities get <id>`; `neotoma entities list --type <type>` (returns snapshot-shaped rows).
- **Inspector:** Snapshot view renders `snapshot` and resolves each `provenance[field]` to a clickable observation/source link.

All read surfaces filter by user ownership and skip merged entities by default — merged entities have no snapshot row (see [`docs/subsystems/entity_merge.md`](./entity_merge.md)).

## 8. Invariants

**MUST:**

- Have exactly one row per entity (PK on `entity_id`).
- Be byte-for-byte reproducible from observations + schema + reducer config (modulo `computed_at`).
- Carry a `provenance` entry for every field in `snapshot`.
- Stamp `schema_version`, `observation_count`, `last_observation_at`, and `computed_at` on every recomputation.
- Be filtered by user ownership on every read path.

**MUST NOT:**

- Be edited directly by clients or agents — every change is the reducer reacting to new observations.
- Survive an entity merge on the merged-from side — the loser's snapshot is deleted, the winner's is recomputed.
- Be treated as durable ground truth — observations are durable, snapshots are derived.
- Carry a value in `snapshot` without a corresponding `provenance` entry.

## Related Documents

- [`docs/subsystems/entities.md`](./entities.md) — The canonical entity row this snapshot is derived for
- [`docs/subsystems/observation_architecture.md`](./observation_architecture.md) — Three-layer truth model and the snapshot computation pipeline
- [`docs/subsystems/reducer.md`](./reducer.md) — Reducer architecture, merge strategies, converters
- [`docs/subsystems/vector_ops.md`](./vector_ops.md) — Embedding generation, ivfflat tuning, sqlite-vec parity
- [`docs/subsystems/auth.md`](./auth.md) — Encrypted-at-rest content columns including `snapshot` and `provenance`
- [`docs/subsystems/entity_merge.md`](./entity_merge.md) — Snapshot deletion and recomputation during merge
- [`docs/architecture/determinism.md`](../architecture/determinism.md) — Determinism invariants the snapshot pipeline relies on

## Agent Instructions

- **Read snapshots, not observations, for "current state".** Observations are atoms of ground truth; the snapshot is the merged answer.
- **Use `provenance` for explanations.** When an agent needs to justify a value, look up `provenance[field]` and resolve the observation's `source_id` and `interpretation_id`.
- **Never write directly to `entity_snapshots`.** If the snapshot is wrong, write a correction observation (`source_priority = 1000`); the reducer will fix the snapshot.
- **Don't depend on a stable `computed_at`.** It changes on every recomputation; if you need a stable "as-of" time, anchor on `last_observation_at` or on a specific observation.
