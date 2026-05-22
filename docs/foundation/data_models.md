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
### Relationship Observation
- `id` (UUID, deterministic)
- `relationship_key` (composite: `{type}:{source_entity_id}:{target_entity_id}`)
- `relationship_type` (PART_OF, CORRECTS, REFERS_TO, SETTLES, DUPLICATE_OF, etc.)
- `source_entity_id` (source entity)
- `target_entity_id` (target entity)
- `source_id` (which source created this observation)
- `interpretation_id` (which interpretation run, nullable)
- `observed_at` (timestamp when observation was made)
- `specificity_score` (0-1, how specific this observation is)
- `source_priority` (integer, priority of source)
- `metadata` (JSONB: relationship metadata fields from this source)
- `canonical_hash` (hash for idempotence checking)

### Relationship Snapshot
- `relationship_key` (composite primary key)
- `relationship_type` (PART_OF, CORRECTS, etc.)
- `source_entity_id` (source entity)
- `target_entity_id` (target entity)
- `schema_version` (version used for snapshot computation)
- `snapshot` (JSONB: merged metadata, current truth)
- `computed_at` (timestamp when snapshot was computed)
- `observation_count` (number of observations merged)
- `last_observation_at` (timestamp of most recent observation)
- `provenance` (JSONB: maps metadata field → observation_id for traceability)

### Relationship (Legacy)
**Note:** Direct relationship records are deprecated in favor of relationship observations and snapshots.
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
- Document → Relationship Observation (which relationship observations extracted from document)
- Relationship Observation → Relationship Snapshot (via relationship reducer computation)
- Entity → Relationship Snapshot → Entity (typed relationships between entities)
- Document → Event (which events derived from document)
- Event → Entity (which entities involved in event)

### Subscription
First-class entity for substrate signaling. Subscriptions register a consumer's interest in receiving state-change signals via webhook or SSE. See `philosophy.md` §5.9 (Signal Without Strategy) and `scope_decisions.md` SD-002.
- `id` (UUID)
- `subscriber_id` (agent identity: AAuth public-key thumbprint, AAuth JWT subject, or `clientInfo.name+version` identifier)
- `entity_type_filter` (which entity types trigger delivery; `*` = all)
- `event_type_filter` (`created` | `updated` | `corrected` | `linked` | `*`)
- `delivery_method` (`webhook` | `sse`)
- `delivery_endpoint` (HTTPS URL for webhook; channel id for sse)
- `created_at`, `updated_at`, `last_delivered_at`, `last_delivery_status`

Identity rule: `(user_id, subscriber_id, delivery_endpoint)` — not hash-based content IDs. Subscriptions are user-scoped and may be created, updated, or deleted by the user or the consumer agent.

### PeerConfig
First-class entity for cross-instance federation (Phase 5 of the nervous system plan). Each `PeerConfig` row describes a remote Neotoma instance the user has paired with for bidirectional state propagation.
- `id` (UUID)
- `peer_instance_id` (stable identifier for the remote instance)
- `peer_base_url` (HTTPS endpoint of the remote `/store`)
- `peer_public_key_thumbprint` (AAuth identity used for outbound POST)
- `direction` (`push` | `pull` | `bidirectional`)
- `entity_type_filter` (which entity types sync; `*` = all)
- `created_at`, `updated_at`, `last_sync_at`, `last_sync_status`

Identity rule: `(user_id, peer_instance_id)`.

**Delivery semantics for both:** Best-effort, fire-and-forget. The substrate logs delivery failures but does not maintain a retry queue, dead-letter queue, or ordered delivery guarantees. Consumers responsible for catch-up via state queries (`list_recent_changes`, snapshot reads). See `philosophy.md` §5.9.

## 12.2 Schema Expectations
- JSON-schema-definable
- Backward compatible
- Versioned (`schema_version` in JSONB)
- Deterministic extraction rules
- Minimal (no bloat)
- Extendable via additive evolution
- Immutable once persisted
