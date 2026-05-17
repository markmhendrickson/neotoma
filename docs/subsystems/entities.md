---
title: "Neotoma Entity Record Type — Canonical Record Primitive"
summary: "**Authoritative Vocabulary:** [`docs/vocabulary/canonical_terms.md`](../vocabulary/canonical_terms.md)"
---

# Neotoma Entity Record Type — Canonical Record Primitive

**Authoritative Vocabulary:** [`docs/vocabulary/canonical_terms.md`](../vocabulary/canonical_terms.md)

## Scope

This document covers:

- The `entities` table — canonical record for every entity in Neotoma
- Deterministic, hash-based entity IDs
- Aliases and metadata
- User isolation and RLS
- Merge tracking columns (`merged_to_entity_id`, `merged_at`) and how merge handling preserves history

This document does NOT cover:

- The reducer output stored in `entity_snapshots` (see [`docs/subsystems/entity_snapshots.md`](./entity_snapshots.md))
- Heuristic entity resolution / dedupe at write time (see [`docs/subsystems/ingestion/ingestion.md`](./ingestion/ingestion.md))
- Merge mechanics in detail (see [`docs/subsystems/entity_merge.md`](./entity_merge.md))
- Application-level entity types (`contact`, `task`, `transaction`, …) — those are documented in [`docs/subsystems/record_types.md`](./record_types.md)

## 1. What Is an Entity?

An **entity** is the canonical record for a person, company, location, document, task, or any other thing Neotoma knows about. Every observation, relationship, and timeline event ultimately points at an entity. The entity row itself is small and stable; the rich, current view of that entity lives in [`entity_snapshots`](./entity_snapshots.md), which is recomputed deterministically from observations.

**Why the entity row exists separately from observations and snapshots:**

1. Observations need a stable target to point at, so they can be created out-of-order and from multiple sources before any snapshot exists.
2. Merge needs a permanent target — when two entities are merged, the loser's row stays in `entities` (with `merged_to_entity_id` set) so historical observations can still resolve.
3. Aliases, identity decisions, and merge history have to live somewhere durable; snapshots are recomputed views and aren't the right home.

## 2. `entities` Table

### 2.1 Schema

```sql
CREATE TABLE entities (
  id TEXT PRIMARY KEY,                             -- Deterministic hash-based ID
  entity_type TEXT NOT NULL,                       -- 'person', 'company', 'location', 'invoice', …
  canonical_name TEXT NOT NULL,                    -- Normalized name
  aliases JSONB DEFAULT '[]',                      -- Array of alternate names
  metadata JSONB DEFAULT '{}',
  first_seen_at TIMESTAMP WITH TIME ZONE,
  last_seen_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID NOT NULL,
  merged_to_entity_id TEXT REFERENCES entities(id),
  merged_at TIMESTAMPTZ
);
```

### 2.2 Field Semantics

| Field                 | Type        | Mutable | Purpose                                                                         |
| --------------------- | ----------- | ------- | ------------------------------------------------------------------------------- |
| `id`                  | TEXT        | No      | Deterministic hash-based ID derived from `(entity_type, canonical_name, user_id)` |
| `entity_type`         | TEXT        | No      | Classification driving which entity schema applies                              |
| `canonical_name`      | TEXT        | Yes\*   | Normalised display name; updated by reducer / corrections, never freely renamed |
| `aliases`             | JSONB array | Yes     | Alternate names accumulated from observations                                   |
| `metadata`            | JSONB       | Yes     | Open-ended attributes that are not normalised into the snapshot                 |
| `first_seen_at`       | TIMESTAMPTZ | Yes\*   | Earliest observation timestamp seen for this entity                             |
| `last_seen_at`        | TIMESTAMPTZ | Yes     | Most recent observation timestamp seen for this entity                          |
| `user_id`             | UUID        | No      | Owner — combined with deterministic ID this enforces user-scoped identity        |
| `merged_to_entity_id` | TEXT        | Yes     | Set when this entity is merged INTO another entity                              |
| `merged_at`           | TIMESTAMPTZ | Yes     | Timestamp of the merge                                                          |

\* Some fields look mutable but are append-only in practice — see § 4.

### 2.3 Indexes

```sql
CREATE INDEX idx_entities_user ON entities(user_id);
CREATE INDEX idx_entities_user_type ON entities(user_id, entity_type);
CREATE INDEX idx_entities_user_type_name ON entities(user_id, entity_type, canonical_name);
CREATE INDEX idx_entities_merged ON entities(user_id, merged_to_entity_id)
  WHERE merged_to_entity_id IS NOT NULL;
```

The `(user_id, entity_type, canonical_name)` index is the hot read path for identity lookups; the partial `merged_to_entity_id` index is what lets queries cheaply filter merged rows out.

### 2.4 RLS Policies

```sql
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own entities" ON entities
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role full access - entities" ON entities
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

All client reads are user-scoped by `user_id`. All writes go through the MCP server using `service_role`; clients never insert directly.

## 3. Deterministic Entity IDs

`entities.id` is a **deterministic hash-based ID**, not a random UUID. The hash inputs are `(entity_type, normalised(canonical_name), user_id)`. Two consequences:

1. The same entity (same type, same canonical name, same owner) resolves to the same `id` regardless of write order. Out-of-order ingestion is safe.
2. The same name written by two different users produces two different `id`s — entity identity is per-user.

This is how the system avoids accidentally cross-linking entities across user boundaries while still letting one user's repeated mentions of "Acme Corp" collapse to a single row.

## 4. Mutability Rules

Entities are not strictly immutable — but they are tightly constrained:

- `id`, `entity_type`, `user_id` are **immutable** after insert.
- `canonical_name`, `aliases`, `metadata`, `first_seen_at`, `last_seen_at` are **observation-driven**. The reducer updates them when new observations arrive; agents and clients do NOT freely overwrite these fields.
- `merged_to_entity_id` and `merged_at` are written **only** by the merge path. They are set once per entity and never cleared.

In practice, the entity row is much smaller than the snapshot. Anything that looks like "current truth" — the resolved address, the latest balance, the live relationship status — lives in [`entity_snapshots`](./entity_snapshots.md), not on `entities`.

## 5. Merge Behaviour

When `merge_entities(from_id, to_id)` runs:

1. Observations whose `entity_id` is `from_id` are rewritten to `to_id` (an immutable rewrite — the original observation is replaced, not edited in place; see [`entity_merge.md`](./entity_merge.md)).
2. `from` entity row stays in `entities` with `merged_to_entity_id = to_id` and `merged_at = NOW()`.
3. `from` snapshot is deleted from `entity_snapshots`; `to` snapshot is recomputed from the now-larger observation set.
4. An immutable row is appended to `entity_merges` recording the operation.

**Query implication.** Most application queries should filter merged entities out:

```sql
WHERE merged_to_entity_id IS NULL
```

The `idx_entities_merged` partial index is built to make this filter cheap. The merge-aware read paths in the MCP server apply this automatically; raw SQL access has to opt in.

**Why we don't delete the `from` row.** Historical observations and timeline events still have provenance pointing at the original `entity_id`. Keeping the row lets the system answer "what entity did this old observation originally belong to?" without losing audit fidelity.

## 6. How Entities Relate to the Other Primitives

```text
Source ─▶ Interpretation ─▶ Observation ─▶ Reducer ─▶ Entity Snapshot
                                  │                         ▲
                                  ▼                         │
                            entities row ◀──────── points at by entity_id
                                  ▲
                                  └──────── relationships connect entities
                                  └──────── timeline_events anchor on entity_id
```

- `observations.entity_id` references `entities.id`.
- `entity_snapshots.entity_id` references `entities.id` (PK).
- `relationships` source / target columns reference `entities.id`.
- `timeline_events.entity_id` references `entities.id`.

Every other primitive in Neotoma either points at an entity or is reachable from one.

## 7. Read Surfaces

- **MCP:** `retrieve_entity_by_identifier(identifier, entity_type?)` and `retrieve_entities({ entity_type, limit, … })` resolve and list entities. Both apply user scoping and merged-entity filtering by default.
- **CLI:** `neotoma entities search "<term>"` and `neotoma entities list --type <type>`.
- **HTTP:** `GET /api/entities`, `GET /api/entities/:id`.

All three surfaces exclude merged entities by default; pass an explicit flag (or hit the underlying SQL) to include them.

## 8. Invariants

**MUST:**

- Carry a non-null `id`, `entity_type`, `canonical_name`, and `user_id`.
- Be created via the MCP server using `service_role` — clients never insert directly.
- Resolve to the same `id` for the same `(entity_type, canonical_name, user_id)` regardless of write order.
- Be filterable by merged status; default queries exclude merged rows.

**MUST NOT:**

- Have `id`, `entity_type`, or `user_id` mutated after creation.
- Be merged across user boundaries.
- Be hard-deleted as part of a merge — the loser stays in the table with `merged_to_entity_id` and `merged_at` set.
- Be relied on for "current truth" of entity attributes — that is the snapshot's job.

## Related Documents

- [`docs/subsystems/entity_snapshots.md`](./entity_snapshots.md) — Reducer output that holds current truth for an entity
- [`docs/subsystems/observation_architecture.md`](./observation_architecture.md) — Three-layer truth model that produces observations the reducer composes
- [`docs/subsystems/entity_merge.md`](./entity_merge.md) — Full merge mechanics (rewriting observations, computing the target snapshot, etc.)
- [`docs/subsystems/relationships.md`](./relationships.md) — Typed graph edges between entities
- [`docs/subsystems/timeline_events.md`](./timeline_events.md) — Source-anchored temporal records that point at entities
- [`docs/subsystems/record_types.md`](./record_types.md) — Application-level record types that use the entity primitive
- [`docs/subsystems/schema.md`](./schema.md) — Full DDL reference

## Agent Instructions

- **Identity is per-user.** Never assume an entity ID is portable across users; the deterministic ID hash includes `user_id`.
- **Merged entities still exist.** When you see `merged_to_entity_id`, follow it — but do not write new observations to the merged-from entity; route them to the merge target.
- **Don't mutate canonical fields directly.** If the canonical name needs to change, create a correction observation (`source_priority = 1000`) and let the reducer update the snapshot; do not rewrite `entities.canonical_name` in place.
- **Prefer snapshots for current state.** When agents need attributes (address, status, current balance, …), read `entity_snapshots`, not `entities`. The entities row is identity, not state.
