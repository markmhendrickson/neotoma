# Neotoma Data Models: Global Commitments

_(Core Data Structures and Schema Expectations)_

---

## Purpose

This document defines the global data model commitments for Neotoma, including the four-layer truth model and core entities.

---

## Four-Layer Truth Model

Neotoma implements a four-layer truth model that decouples ingestion order from truth:

1. **Document** — the file itself (PDF, email, CSV, image)
2. **Entity** — the logical thing in the world with a stable ID
3. **Observation** — granular, source-specific facts extracted from documents
4. **Snapshot** — deterministic reducer output representing current truth

This model enables:
- Multiple sources to contribute observations about the same entity
- Deterministic merging via reducers
- Full provenance: every snapshot field traces to specific observations and documents
- Out-of-order ingestion support

See [`docs/architecture/architectural_decisions.md`](../architecture/architectural_decisions.md) for complete architectural rationale.

---

## Core Entities

### Document

- `id` (UUID, deterministic from content hash + user + timestamp)
- `type` (file type: PDF, JPG, PNG, CSV, etc.)
- `raw_text` (original extracted text, immutable)
- `provenance` (source_file, ingestion_timestamp, user_id)

### Observation

- `id` (UUID, deterministic)
- `entity_id` (hash-based: `ent_{sha256(type:normalized_name)}`)
- `entity_type` (person, company, location, invoice, etc.)
- `schema_version` (version of schema used for extraction)
- `source_record_id` (which document/record this observation came from)
- `observed_at` (timestamp when observation was made)
- `specificity_score` (0-1, how specific this observation is)
- `source_priority` (integer, priority of source)
- `fields` (JSONB: granular facts extracted from document)

### Entity

- `id` (hash-based: `ent_{sha256(type:normalized_name)}`)
- `entity_type` (person, company, location, invoice, etc.)
- `canonical_name` (normalized, lowercase, deduplicated)
- `aliases` (array of alternate names)

### Snapshot

- `entity_id` (references Entity)
- `entity_type` (person, company, location, etc.)
- `schema_version` (version of schema used for snapshot computation)
- `snapshot` (JSONB: current truth, computed by reducer)
- `computed_at` (timestamp when snapshot was computed)
- `observation_count` (number of observations merged)
- `last_observation_at` (timestamp of most recent observation)
- `provenance` (JSONB: maps field → observation_id, traces each field to source)

### Event

- `id` (hash-based: `evt_{sha256(record_id:field:date)}`)
- `event_type` (InvoiceIssued, FlightDeparture, PassportExpiry)
- `event_timestamp` (ISO 8601 from source field)
- `source_record_id` (which record?)
- `source_field` (which field? e.g., 'date_issued')

### Relationship

- `id` (UUID)
- `relationship_type` (PART_OF, CORRECTS, REFERS_TO, SETTLES, DUPLICATE_OF, etc.)
- `source_entity_id` (source entity)
- `target_entity_id` (target entity)
- `source_record_id` (which document created this relationship)
- `metadata` (JSONB: relationship-specific metadata)

### Graph Edges

- Document → Observation (which observations extracted from document)
- Observation → Entity (which entity this observation describes)
- Observation → Snapshot (via reducer computation)
- Entity → Snapshot (entity has current snapshot)
- Entity → Relationship → Entity (typed relationships between entities)
- Document → Event (which events derived from document)
- Event → Entity (which entities involved in event)

---

## 12.2 Schema Expectations

- JSON-schema-definable
- Backward compatible
- Versioned (`schema_version` in JSONB)
- Deterministic extraction rules
- Minimal (no bloat)
- Extendable via additive evolution
- Immutable once persisted

---

## Related Documents

- [`docs/context/index.md`](../context/index.md) — Documentation navigation guide
- [`docs/architecture/architectural_decisions.md`](../architecture/architectural_decisions.md) — Core architectural decisions including four-layer model
- [`docs/subsystems/observation_architecture.md`](../subsystems/observation_architecture.md) — Observation layer architecture
- [`docs/subsystems/reducer.md`](../subsystems/reducer.md) — Reducer engine patterns
- [`docs/subsystems/relationships.md`](../subsystems/relationships.md) — Relationship types and patterns
- [`docs/subsystems/record_types.md`](../subsystems/record_types.md) — Complete record type catalog
- [`docs/subsystems/schema.md`](../subsystems/schema.md) — Schema handling
- [`docs/foundation/entity_resolution.md`](./entity_resolution.md) — Entity resolution doctrine
- [`docs/foundation/timeline_events.md`](./timeline_events.md) — Timeline and event doctrine

