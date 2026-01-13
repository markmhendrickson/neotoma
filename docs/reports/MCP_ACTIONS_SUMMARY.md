# MCP Actions Summary

**Date:** 2025-01-27  
**Total Actions:** 15 (1 deprecated in spec, not implemented)

## Quick Reference

| Category | Count | Actions |
|----------|-------|---------|
| **Storing** | 1 | `ingest` |
| **File Operations** | 1 | `get_file_url` |
| **Entity Operations** | 6 | `get_entity_snapshot`, `retrieve_entities`, `get_entity_by_identifier`, `get_related_entities`, `get_graph_neighborhood`, `merge_entities` |
| **Observation & Relationship** | 5 | `list_observations`, `get_field_provenance`, `create_relationship`, `list_relationships`, `list_timeline_events` |
| **Correction & Interpretation** | 2 | `correct`, `reinterpret` |

## Complete Action List

### 1. Storing Operations

#### `ingest`
**Purpose:** Unified storing for all source material (unstructured and structured)

**Input:**
- Unstructured: `{user_id, file_content, mime_type, original_filename?, interpret?, interpretation_config?}`
- Structured: `{user_id, entities: [{entity_type, ...}], source_priority?}`

**Output:** `{source_id, content_hash, file_size?, deduplicated, interpretation?}`

**Features:**
- Content-addressed storage (SHA-256 deduplication)
- Supports both files and structured entity data
- Optional AI interpretation for unstructured content

---

### 2. File Operations

#### `get_file_url`
**Purpose:** Get signed URL for accessing stored source material

**Input:** `{file_path, expires_in?}`

**Output:** `{signed_url, expires_at}`

**Features:**
- Time-limited access URLs
- Configurable expiration

---

### 3. Entity Operations

#### `get_entity_snapshot`
**Purpose:** Get entity snapshot with provenance. Supports historical snapshots.

**Input:** `{entity_id, at?}` (ISO 8601 timestamp for historical state)

**Output:** `{entity_id, entity_type, schema_version, snapshot, provenance, computed_at, observation_count, last_observation_at}`

**Features:**
- Current snapshot (default)
- Historical snapshot via `at` parameter
- Full provenance tracking

#### `retrieve_entities`
**Purpose:** Query entities with filters

**Input:** `{entity_type?, user_id?, limit?, offset?, include_snapshots?, include_merged?}`

**Output:** `{entities: [...], total, excluded_merged}`

**Features:**
- Filter by type, user
- Pagination support
- Optional snapshot inclusion

#### `get_entity_by_identifier`
**Purpose:** Find entity by identifier (name, email, tax_id, etc.)

**Input:** `{identifier, entity_type?}`

**Output:** `{entities: [...], total}`

**Features:**
- Cross-type search
- Identifier normalization
- Type-specific search option

#### `get_related_entities`
**Purpose:** Get entities connected via relationships (n-hop traversal)

**Input:** `{entity_id, relationship_types?, direction?, max_hops?, include_entities?}`

**Output:** `{entities: [...], relationships: [...], total_entities, total_relationships, hops_traversed}`

**Features:**
- N-hop relationship traversal
- Filter by relationship types
- Direction control (inbound/outbound/both)

#### `get_graph_neighborhood`
**Purpose:** Get complete graph context around a node

**Input:** `{node_id, node_type?: 'entity' | 'source', include_relationships?, include_sources?, include_events?, include_observations?}`

**Output:** `{node_id, node_type, entity?, entity_snapshot?, source_material?, relationships?, related_entities?, related_sources?, timeline_events?, observations?}`

**Features:**
- Works with entities or source material
- Configurable inclusion of related data
- Complete graph context

#### `merge_entities`
**Purpose:** Merge duplicate entities

**Input:** `{user_id, from_entity_id, to_entity_id, merge_reason?}`

**Output:** `{from_entity_id, to_entity_id, observations_moved, merged_at, merge_reason?}`

**Features:**
- Rewrites observations to target entity
- Marks source as merged
- Audit trail

---

### 4. Observation & Relationship Operations

#### `list_observations`
**Purpose:** List observations for an entity

**Input:** `{entity_id, limit?, offset?}`

**Output:** `{observations: [...], total, limit, offset}`

**Features:**
- Pagination support
- Sorted by `observed_at` DESC

#### `get_field_provenance`
**Purpose:** Trace field to source material (full provenance chain)

**Input:** `{entity_id, field}`

**Output:** `{field, value, source_observation: {...}, source_material: {...}, observed_at}`

**Features:**
- Complete provenance chain
- Field → Observation → Source Material
- Explains why value was selected

#### `create_relationship`
**Purpose:** Create typed relationship between entities

**Input:** `{relationship_type: enum, source_entity_id, target_entity_id, metadata?}`

**Output:** `{id, relationship_type, source_entity_id, target_entity_id, metadata?, created_at}`

**Features:**
- Enum validation (PART_OF, CORRECTS, REFERS_TO, SETTLES, DUPLICATE_OF, DEPENDS_ON, SUPERSEDES)
- Cycle detection
- Optional metadata

#### `list_relationships`
**Purpose:** List relationships for an entity

**Input:** `{entity_id, direction?, relationship_type?, limit?, offset?}`

**Output:** `{relationships: [...], total, limit, offset}`

**Features:**
- Direction filtering (inbound/outbound/both)
- Type filtering
- Pagination support

#### `list_timeline_events`
**Purpose:** Query timeline events with filters

**Input:** `{event_type?, after_date?, before_date?, source_id?, limit?, offset?}`

**Output:** `{events: [...], total}`

**Features:**
- Date range filtering
- Source material filtering
- Type filtering
- Chronological ordering

---

### 5. Correction & Interpretation Operations

#### `correct`
**Purpose:** Create high-priority correction observation

**Input:** `{user_id, entity_id, entity_type, field, value}`

**Output:** `{observation_id, entity_id, field, value, message}`

**Features:**
- Priority 1000 (always wins)
- Overrides AI-extracted fields
- Immediate effect on snapshot

#### `reinterpret`
**Purpose:** Re-run AI interpretation on existing source material

**Input:** `{source_id, interpretation_config}`

**Output:** `{run_id, entities_created, observations_created, source_id}`

**Features:**
- New interpretation with different config
- Creates new observations (doesn't modify existing)
- Configurable provider, model, temperature, etc.

---

## Deprecated (Not Implemented)

#### `upload_file`
**Status:** Deprecated in spec, not implemented

**Reason:** Replaced by unified `ingest` action which handles both file uploads and structured data ingestion.

---

## Action Categories by Use Case

### Data Ingestion
- `ingest` - Store source material (files or structured data)

### Entity Queries
- `get_entity_snapshot` - Get current/historical entity state
- `retrieve_entities` - Query entities with filters
- `get_entity_by_identifier` - Find by name/email/etc.
- `get_related_entities` - Traverse relationships
- `get_graph_neighborhood` - Get complete context

### Provenance & Traceability
- `list_observations` - See all observations for entity
- `get_field_provenance` - Trace field to source
- `list_timeline_events` - Chronological events

### Relationships
- `create_relationship` - Create entity relationships
- `list_relationships` - Query entity relationships

### Data Management
- `merge_entities` - Merge duplicates
- `correct` - Override with corrections
- `reinterpret` - Re-run interpretation

### File Access
- `get_file_url` - Get signed URLs

---

## Consistency & Determinism

**All actions provide:**
- **Strong Consistency** - Immediate read-after-write
- **Determinism** - Same input → same output (where applicable)

**Exception:**
- `get_file_url` - Non-deterministic (signed URLs contain timestamps)

---

## Common Patterns

### Pagination
Most list/query actions support:
- `limit` (default: 100)
- `offset` (default: 0)
- Response includes `total` count

### Filtering
Many actions support:
- Type filtering (`entity_type`, `relationship_type`, `event_type`)
- Date range filtering (`after_date`, `before_date`)
- Source filtering (`source_id`)

### Historical Queries
- `get_entity_snapshot` supports `at` parameter for historical state

---

## Relationship Types

Valid relationship types (enum):
- `PART_OF`
- `CORRECTS`
- `REFERS_TO`
- `SETTLES`
- `DUPLICATE_OF`
- `DEPENDS_ON`
- `SUPERSEDES`

---

## Entity Types

Common entity types:
- `invoice`, `transaction`, `receipt`, `contract`, `note`
- `person`, `company`, `contact`, `task`
- `feature_unit`, `release`, `agent_decision`, `agent_session`
- `validation_result`, `codebase_entity`, `architectural_decision`

---

## Error Handling

All actions use structured error responses:
- Error codes (e.g., `ENTITY_NOT_FOUND`, `VALIDATION_ERROR`)
- HTTP status codes (400, 404, 500, etc.)
- Retry guidance
- No PII in error messages

---

## Version

**Current Version:** `1.0.0`

All actions follow backward compatibility rules:
- New optional parameters only
- Response schema additive
- Error codes additive
