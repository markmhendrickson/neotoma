# Neotoma Timeline Events — Source-Anchored Temporal Records

**Authoritative Vocabulary:** [`docs/vocabulary/canonical_terms.md`](../vocabulary/canonical_terms.md)

## Scope

This document covers the `timeline_events` record type — user-facing temporal records derived deterministically from extracted date fields:

- `timeline_events` table structure and semantics
- Derivation rules: schema-driven `temporal_fields` and the legacy date-like heuristic
- Deterministic event ID generation (hash-based, UUID-shaped)
- Event type mapping per `(entity_type, field_name)`
- Idempotent upsert flow during structured store, [interpretation](../vocabulary/canonical_terms.md#interpretation), and snapshot recomputation
- Read paths (`/api/timeline`, `/api/timeline/:id`) and [provenance](../vocabulary/canonical_terms.md#provenance) attribution
- Row-level security via the owning [source](../vocabulary/canonical_terms.md#source)

This document does NOT cover:

- High-level timeline doctrine and invariants — see [`docs/foundation/timeline_events.md`](../foundation/timeline_events.md)
- System observability events (`source.created`, `ingestion.failed`, …) — see [`docs/subsystems/events.md`](./events.md)
- [Source](../vocabulary/canonical_terms.md#source) and [interpretation](../vocabulary/canonical_terms.md#interpretation) storage — see [`docs/subsystems/sources.md`](./sources.md) and [`docs/subsystems/interpretations.md`](./interpretations.md)
- [Observation](../vocabulary/canonical_terms.md#observation) creation and the three-layer truth model — see [`docs/subsystems/observation_architecture.md`](./observation_architecture.md)
- [Relationship](../vocabulary/canonical_terms.md#relationship) edges (e.g. `source → event`, `event → entity`) — see [`docs/subsystems/relationships.md`](./relationships.md)

## 1. What a Timeline Event Is

A **timeline event** is an immutable, source-anchored record that fixes one entity in time at a specific date drawn verbatim from a [source](../vocabulary/canonical_terms.md#source) field. It is a primitive [record type](../vocabulary/canonical_terms.md#record-type), not an application-level concept; the application type `event` (calendar/meeting) is distinct and is stored as an [entity](../vocabulary/canonical_terms.md#entity), not a `timeline_events` row.

Every timeline event satisfies four invariants:

1. **Source-linked.** `source_id` references the originating [source](../vocabulary/canonical_terms.md#source); `source_field` records which field on which entity yielded the date.
2. **Deterministic.** `id` is a SHA-256 of `(source_id, entity_id, source_field, event_timestamp)` projected into UUID shape. Re-running derivation against the same inputs upserts the same row.
3. **Timestamp-normalized.** `event_timestamp` is ISO 8601 in UTC; only strings matching strict date shapes (or numeric epoch values inside a sane range) are accepted.
4. **Immutable.** Events are never mutated in place. Reinterpretation, correction, or snapshot recomputation produces new events; obsolete events are not retroactively rewritten.

These invariants are what makes the timeline safe for AI temporal reasoning: every dot on the timeline traces to a source and a field, and the same inputs always yield the same dots.

## 2. Storage

### 2.1 Schema

Postgres / hosted (canonical):

```sql
CREATE TABLE timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  source_id UUID REFERENCES sources(id),
  source_field TEXT,
  entity_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID NOT NULL
);
```

Local SQLite mirrors the same shape with TEXT-typed UUIDs and timestamps. See [`docs/subsystems/schema.md §4.2`](./schema.md) for the live DDL and any in-flight migrations (e.g. legacy `source_record_id`, `entity_ids JSONB` array column kept for back-compat).

Implementation reference: `src/services/timeline_events.ts` defines the canonical row shape consumed by the writer:

```typescript
interface TimelineEventRow {
  id: string;
  event_type: string;
  event_timestamp: string;
  source_id: string;
  source_field: string;
  entity_id: string | null;
  created_at: string;
  user_id: string;
}
```

### 2.2 Field Semantics

| Field             | Purpose                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `id`              | Deterministic UUID derived from `(source_id, entity_id, source_field, event_timestamp)`    |
| `event_type`      | Stable, capitalised event label (e.g. `InvoiceIssued`, `FlightDeparture`, `TaskCompleted`) |
| `event_timestamp` | Normalized ISO 8601 timestamp drawn from the source field                                  |
| `source_id`       | Owning [source](../vocabulary/canonical_terms.md#source) (used for ownership filtering)    |
| `source_field`    | The exact entity/field name that produced the date (e.g. `invoice_date`)                   |
| `entity_id`       | Subject of the event (the entity whose snapshot field carried the date)                    |
| `metadata`        | Optional event-level provenance (agent attribution, tier, schema version)                  |
| `created_at`      | When the row was written; not the event time                                               |
| `user_id`         | Owner; redundant with `sources.user_id` but indexed directly for read paths                |

### 2.3 Row-Level Security

Timeline events are user-isolated transitively through `source_id`. Read paths (see §6) defensively load the authenticated user's `sources.id` set first and filter `timeline_events` by `source_id IN (...)`. Even where `user_id` is also present on the row, the source-scoped filter is the security boundary; `user_id` is treated as a denormalised convenience column. Writes flow only through the MCP server using `service_role`; clients never write timeline events directly.

## 3. Derivation

Timeline events are produced as a side-effect of writing an entity snapshot. They are never authored directly by agents and are never inferred from text — they only crystallise dates that are already extracted into [observations](../vocabulary/canonical_terms.md#observation) or [raw fragments](../vocabulary/canonical_terms.md#raw-fragment).

### 3.1 Inputs

`upsertTimelineEventsForEntitySnapshot` (in `src/services/timeline_events.ts`) is invoked from three writers:

- Structured `store_structured` ingestion
- AI [interpretation](../vocabulary/canonical_terms.md#interpretation) completion
- [Snapshot](../vocabulary/canonical_terms.md#snapshot) recomputation in the [reducer](../vocabulary/canonical_terms.md#reducer)

Each call passes `entity_type`, `entity_id`, `source_id`, `user_id`, the freshly computed snapshot, the count of same-type entities sharing the source batch, and an optional [entity schema](../vocabulary/canonical_terms.md#entity-schema) reference.

### 3.2 Field Selection

Two precedence rules govern which snapshot fields can emit events:

1. **Schema-driven (preferred).** When the entity's schema declares `temporal_fields: [{ field, event_type? }]`, only those fields emit events, and the declared `event_type` (when present) wins over the heuristic mapping.
2. **Legacy heuristic (fallback).** When the schema declares no `temporal_fields`, derivation falls back to:
   - A curated allow-set of date field names (`invoice_date`, `due_date`, `start_date`, `transaction_date`, `flow_date`, `purchase_date`, …), AND
   - Any other top-level snapshot field whose value parses as a strict date shape.

In both modes a denylist removes system/provenance fields that look like timestamps but are not user-facing anchors: `created_at`, `updated_at`, `computed_at`, `deleted_at`, `observed_at`, `last_observation_at`.

### 3.3 Strict Date Parsing

`toISODate(value)` accepts a value only if:

- It is a string matching one of the explicit date-shape regexes (ISO 8601 date/datetime, slash- or dot-separated, textual months, RFC 2822). Year-only strings are rejected.
- Or a finite number that falls in either the "milliseconds since 1970" range (`>= 946684800000` and `< 1e15`) or the "seconds since 1970" range (`946684800`–`4102444800`).

Anything else returns `null`, including strings like `"1.0"`, `"usd"`, `"unknown"`, URLs, or free-text descriptions. This shape gate exists because `new Date(...)` is permissive enough to coerce arbitrary inputs into spurious events; the gate has no fallback path.

### 3.4 Raw-Fragment Pickup

When a single source emits exactly one entity of a given type (`sameTypeInSourceBatch === 1`), the writer also scans `raw_fragments` for that `(source_id, entity_type, user_id)`. Date-like fragment keys not already present in the snapshot become additional events for the same entity. This is gated on uniqueness because attributing a fragment date to one of several same-type entities in the same batch would be guesswork.

### 3.5 Event Type Mapping

`mapFieldToEventType(entityType, fieldName)` produces the canonical `event_type`:

| Entity type        | Field                | Event type        |
| ------------------ | -------------------- | ----------------- |
| `invoice`          | `invoice_date`       | `InvoiceIssued`   |
| `invoice`          | `date_due`           | `InvoiceDue`      |
| `event`            | `start_date`         | `EventStart`      |
| `event`            | `end_date`           | `EventEnd`        |
| `task`             | `start_date`         | `TaskStart`       |
| `task`             | `due_date`           | `TaskDue`         |
| `task`             | `completed_date`     | `TaskCompleted`   |
| `transaction`      | `date`               | `TransactionDate` |
| `income`           | `income_date`        | `IncomeDate`      |
| `travel_document`  | `departure_datetime` | `FlightDeparture` |
| `travel_document`  | `arrival_datetime`   | `FlightArrival`   |
| anything else      | any date field       | CapitalisedCamelCase of the field name |

Schema-declared `temporal_fields[].event_type` takes precedence over this table when present.

### 3.6 Deterministic ID

```typescript
generateTimelineEventId(sourceId, entityId, sourceField, eventTimestamp): string
```

Computes `SHA-256("{sourceId}:{entityId}:{sourceField}:{eventTimestamp}")` and reshapes the first 32 hex chars into UUID format `xxxxxxxx-xxxx-4xxx-axxx-xxxxxxxxxxxx`. The `4` and `a` make the output a syntactically valid UUIDv4 for type compatibility, but it is a deterministic hash, not a random UUID.

Result: re-deriving the same event idempotently upserts the same row. Reinterpretation that emits a *different* timestamp for the same `(source, entity, field)` produces a new event row; the old one persists alongside it.

### 3.7 Writer Flow

Per call to `upsertTimelineEventsForEntitySnapshot`:

1. `enforceAttributionPolicy("timeline_events", ...)` rejects unattributed writes per the active policy (see [`docs/subsystems/agent_attribution_integration.md`](./agent_attribution_integration.md)).
2. Derive snapshot rows via `deriveTimelineEventsFromSnapshot`.
3. If `sameTypeInSourceBatch === 1`, fetch matching `raw_fragments` and append rows from `deriveTimelineEventsFromRawFragments`.
4. Mix in agent attribution (`provenance` block built from `getCurrentAttribution()`) when present.
5. `db.from("timeline_events").upsert(row, { onConflict: "id" })` for each derived row.

The `onConflict: "id"` semantics make derivation safe to retry: identical inputs converge on identical rows; partial writes from a crashed run are reconciled on the next pass.

## 4. Provenance and Attribution

Each row's `metadata.provenance` block records who wrote it: agent identity, attribution tier (`hardware`, `software`, `unverified_client`, `anonymous`), and policy decision. Inspector and `/stats` surface this column so the timeline is filterable by writing agent.

For the writer contract and tier resolution rules, see:

- [`docs/subsystems/agent_attribution_integration.md`](./agent_attribution_integration.md)
- `enforceAttributionPolicy` in `src/services/attribution_policy.ts`

Spoofing or omitting attribution on timeline writes is treated as a policy breach by the same rules that govern observation writes.

## 5. Lifecycle

### 5.1 Creation

Timeline events are created by the writers in §3.1 whenever a snapshot is written. There is no agent-facing "create timeline event" action.

### 5.2 Reinterpretation

Reinterpretation creates new [interpretations](../vocabulary/canonical_terms.md#interpretation) and new [observations](../vocabulary/canonical_terms.md#observation) (see [`docs/subsystems/sources.md §5`](./sources.md)). When the reinterpreted snapshot recomputes, derivation runs again:

- Fields that retained the same date upsert into the same row (no-op).
- Fields that produced a different date emit a new event row with a different `id`.
- Fields that no longer parse as dates do not retroactively delete prior rows.

Stale events from prior interpretations are preserved as audit trail. Consumers that need "current truth only" should join through the latest interpretation or filter by `created_at`.

### 5.3 Correction

User corrections (via `correct()`) flow through observations and the reducer; they reach the timeline through the same snapshot recomputation path. Correction-priority observations win in the reducer and produce the corrected snapshot, which then derives the corrected event row. The original event row is not mutated.

### 5.4 Deletion

Timeline events are not deleted as part of normal operation. Removal happens only when the owning [source](../vocabulary/canonical_terms.md#source) is deleted (cascading via `source_id`) or via explicit user action.

## 6. Read Path

### 6.1 HTTP API

`GET /api/timeline` (see `src/actions.ts`) returns a paginated list of events for the authenticated user:

- Loads the user's `sources.id` set first (security boundary).
- Filters `timeline_events.source_id IN (...)`.
- Supports filtering by `entity_id`, `event_type`, `start_date`, `end_date`.
- Orders by `event_timestamp` (default) or `created_at`.
- Enriches each row with the entity's `canonical_name` and `entity_type` from the latest snapshot for display.

`GET /api/timeline/:id` returns one event scoped by the same source-ownership check; an event whose `source_id` is not in the caller's source set is treated as not found.

### 6.2 MCP

Timeline reads surface through the MCP read tools as described in [`docs/specs/MCP_SPEC.md`](../specs/MCP_SPEC.md) (see `list_timeline_events`). The MCP layer applies the same authenticated-source filter and never exposes events from sources the caller does not own.

### 6.3 Display Conventions

Display layers (Inspector, agent timeline summaries) MUST sort by `event_timestamp` ascending unless explicitly answering a "most recent first" query. They SHOULD render `event_type`, the linked entity's `canonical_name`, and the originating `source_id` so users can audit any dot back to its source.

## 7. Constraints and Invariants

Timeline events MUST:

- Derive only from extracted source date fields; never inferred, predicted, or computed.
- Carry a non-null `source_id`, `source_field`, and `event_timestamp`.
- Use the deterministic `generateTimelineEventId` hash so re-derivation is idempotent.
- Pass `enforceAttributionPolicy` before write.
- Be filtered by source ownership on every read path (defence-in-depth alongside `user_id`).

Timeline events MUST NOT:

- Be created by agents through a direct "write event" surface.
- Mutate after creation.
- Inherit dates from `created_at`, `updated_at`, or other system fields.
- Be derived from string values that fail strict date-shape validation.
- Be returned across user boundaries even when row-level `user_id` matches; source-scoped filtering is required.

For the foundational doctrine (event-generation rules and timeline requirements) that these constraints implement, see [`docs/foundation/timeline_events.md`](../foundation/timeline_events.md).

## 8. Related Documents

- [`docs/foundation/timeline_events.md`](../foundation/timeline_events.md) — Timeline-and-event doctrine (invariants, generation rules)
- [`docs/subsystems/events.md`](./events.md) — System observability events (distinct from timeline events)
- [`docs/subsystems/sources.md`](./sources.md) — Source storage and content addressing
- [`docs/subsystems/interpretations.md`](./interpretations.md) — Interpretation record type and lifecycle
- [`docs/subsystems/observation_architecture.md`](./observation_architecture.md) — Observation lifecycle and three-layer truth model
- [`docs/subsystems/relationships.md`](./relationships.md) — Graph edges (`source → event`, `event → entity`)
- [`docs/subsystems/entities.md`](./entities.md) — Canonical entity row that timeline events relate to
- [`docs/subsystems/entity_snapshots.md`](./entity_snapshots.md) — Reducer output for entities a timeline event references
- [`docs/subsystems/schema.md`](./schema.md) — Authoritative DDL for `timeline_events`
- [`docs/subsystems/agent_attribution_integration.md`](./agent_attribution_integration.md) — Attribution policy applied to timeline writes
- [`docs/specs/MCP_SPEC.md`](../specs/MCP_SPEC.md) — MCP timeline read tools
- `src/services/timeline_events.ts` — Derivation and upsert implementation
- `src/actions.ts` — `/api/timeline` and `/api/timeline/:id` handlers
