# Neotoma Data Models: Global Commitments
## Three-Layer Truth Model
Neotoma implements a three-layer truth model that decouples ingestion order from truth:
1. **Payload (Document)** — unified ingestion primitive (files + agent data)
2. **Observation** — granular, source-specific facts extracted from payloads
3. **Entity** — the logical thing in the world with a stable ID
4. **Snapshot** — deterministic reducer output representing current truth
This model enables:
- Multiple sources to contribute observations about the same entity
- Deterministic merging via reducers
- Full provenance: every snapshot field traces to specific observations and payloads
- Out-of-order ingestion support
- Unified ingestion: files and agent submissions both create payloads
## Core Entities
### Payload
- `id` (UUID)
- `payload_submission_id` (UUIDv7: time-ordered submission ID)
- `payload_content_id` (hash-based: deterministic for deduplication)
- `capability_id` (versioned intent: e.g., "neotoma:store_invoice:v1")
- `body` (JSONB: payload data)
- `provenance` (source_refs, extracted_at, extractor_version, agent_id)
- `embedding` (1536-dim vector, optional)
- `summary` (text summary, optional)
### Observation
- `id` (UUID, deterministic)
- `entity_id` (hash-based: `ent_{sha256(type:normalized_name)}`)
- `entity_type` (person, company, location, invoice, etc.)
- `schema_version` (version of schema used for extraction)
- `source_payload_id` (which payload this observation came from)
- `observed_at` (timestamp when observation was made)
- `specificity_score` (0-1, how specific this observation is)
- `source_priority` (integer, priority of source)
- `fields` (JSONB: granular facts extracted from payload)
### Entity
- `id` (hash-based: `ent_{sha256(type:normalized_name)}`)
- `entity_type` (person, company, location, invoice, etc.)
- `canonical_name` (normalized, lowercase, deduplicated)
- `aliases` (array of alternate names)
### Entity Snapshot
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
## 12.2 Schema Expectations
- JSON-schema-definable
- Backward compatible
- Versioned (`schema_version` in JSONB)
- Deterministic extraction rules
- Minimal (no bloat)
- Extendable via additive evolution
- Immutable once persisted
