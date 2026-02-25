# Neotoma Schema — Canonical Data Models and Evolution Rules
## Scope
This document covers:
- PostgreSQL table definitions
- JSONB property schemas for flexible fields
- Indexes and performance considerations
- Schema versioning and backward compatibility
- Migration safety rules
This document does NOT cover:
- Ingestion pipeline logic (see `docs/subsystems/ingestion/ingestion.md`)
- Entity resolution (see ingestion docs)
- Search indexing (see `docs/subsystems/search/search.md`)
## 1. Core Schema Principles
### 1.1 Foundational Invariants
These principles MUST be maintained across all schema changes:
1. **Immutability:** Once written, truth never changes (exceptions: metadata like `updated_at`)
2. **Provenance:** All data traces to source (file, timestamp, user)
3. **Determinism:** Same input → same schema structure
4. **Explainability:** All fields map to extraction source
5. **Flexibility:** JSONB for schema-specific `properties`
6. **Strong typing:** Core fields are strongly typed SQL columns
7. **No orphans:** All sources and observations have provenance; all relationships have valid endpoints
### 1.2 Schema Evolution Rules
**Additive Changes (Allowed):**
- ✅ Add new optional JSONB keys
- ✅ Add new indexes
- ✅ Add new tables
- ✅ Add new optional columns with defaults
**Breaking Changes (Forbidden in MVP):**
- ❌ Remove columns or tables
- ❌ Change column types (except widening, e.g., VARCHAR(50) → TEXT)
- ❌ Remove required JSONB keys
- ❌ Change JSONB key semantics
**Migration Requirements:**
- All migrations MUST be reversible (down migration)
- All migrations MUST preserve existing data
- All migrations MUST be tested on production-like data
## 2. Core Tables
### 2.1 `observations` Table
**Purpose:** Store granular, source-specific facts extracted from documents. Observations are the intermediate layer between documents and entity snapshots. Links to sources and interpretations for full provenance.
**Schema:**
```sql
CREATE TABLE observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  source_id UUID REFERENCES sources(id),
  interpretation_id UUID REFERENCES interpretations(id),
  observed_at TIMESTAMPTZ NOT NULL,
  specificity_score NUMERIC(3,2) CHECK (specificity_score BETWEEN 0 AND 1),
  source_priority INTEGER DEFAULT 0,
  fields JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL,
  idempotency_key TEXT
);
```
**Field Definitions:**
| Field                   | Type        | Purpose                                           | Mutable | Indexed     |
| ----------------------- | ----------- | ------------------------------------------------- | ------- | ----------- |
| `id`                    | UUID        | Unique observation ID                             | No      | Primary key |
| `entity_id`             | TEXT        | Target entity ID (hash-based)                     | No      | Yes         |
| `entity_type`           | TEXT        | Entity type (person, company, invoice, etc.)      | No      | Yes         |
| `schema_version`        | TEXT        | Schema version used for extraction                | No      | No          |
| `source_id`             | UUID        | Source that produced this observation             | No      | Yes         |
| `interpretation_id`     | UUID        | Interpretation that created this                  | No      | Yes         |
| `observed_at`           | TIMESTAMPTZ | Timestamp when observation was made               | No      | Yes         |
| `specificity_score`     | NUMERIC     | How specific this observation is (0-1)            | No      | No          |
| `source_priority`       | INTEGER     | Priority of source (higher = more trusted)        | No      | No          |
| `fields`                | JSONB       | Granular facts extracted from document            | No      | No          |
| `created_at`            | TIMESTAMPTZ | Observation creation timestamp                    | No      | No          |
| `user_id`               | UUID        | User who owns this observation                    | No      | Yes         |
| `idempotency_key`       | TEXT        | Client-provided key for correction idempotency    | No      | Yes         |
**Source Priority Levels:**
| Source | Priority | Use Case |
|--------|----------|----------|
| AI interpretation | 0 | Automated extraction |
| `ingest_structured()` | 100 | Agent-provided facts |
| `correct()` | 1000 | User corrections (always wins) |
**Indexes:**
```sql
CREATE INDEX idx_observations_entity ON observations(entity_id, observed_at DESC);
CREATE INDEX idx_observations_source ON observations(source_id) WHERE source_id IS NOT NULL;
CREATE INDEX idx_observations_interpretation ON observations(interpretation_id) WHERE interpretation_id IS NOT NULL;
CREATE INDEX idx_observations_user ON observations(user_id);
CREATE INDEX idx_observations_idempotency_key ON observations(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```
**RLS Policies:**
```sql
ALTER TABLE observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own observations" ON observations
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role full access" ON observations
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```
**Notes:**
- Observations are immutable once created
- Multiple observations can exist for the same entity from different sources
- Reducers merge observations into entity snapshots deterministically
- `source_id` and `interpretation_id` provide full provenance chain
- Corrections use `source_priority = 1000` to override AI extraction
- See [`docs/subsystems/observation_architecture.md`](./observation_architecture.md) for details
- See [`docs/subsystems/sources.md`](./sources.md) for sources-first architecture
### 2.8 `entity_snapshots` Table
**Purpose:** Store deterministic reducer output representing current truth for entities. Snapshots are computed from observations.
**Schema:**
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
**Field Definitions:**
| Field                 | Type        | Purpose                                                  | Mutable | Indexed     |
| --------------------- | ----------- | -------------------------------------------------------- | ------- | ----------- |
| `entity_id`           | TEXT        | Entity ID (hash-based, primary key)                      | No      | Primary key |
| `entity_type`         | TEXT        | Entity type (person, company, invoice, etc.)             | No      | Yes         |
| `schema_version`      | TEXT        | Schema version used for snapshot computation             | No      | No          |
| `snapshot`            | JSONB       | Current truth, computed by reducer                       | Yes     | Yes (GIN)   |
| `computed_at`         | TIMESTAMPTZ | When snapshot was computed                               | Yes     | No          |
| `observation_count`   | INTEGER     | Number of observations merged                            | Yes     | No          |
| `last_observation_at` | TIMESTAMPTZ | Timestamp of most recent observation                     | Yes     | No          |
| `provenance`          | JSONB       | Maps field → observation_id, traces each field to source | Yes     | No          |
| `user_id`             | UUID        | User who owns this entity                                | No      | Yes         |
| `embedding`           | vector(1536)| Optional embedding for semantic similarity search        | Yes     | Yes (ivfflat) |
**Indexes:**
```sql
CREATE INDEX idx_snapshots_type ON entity_snapshots(entity_type);
CREATE INDEX idx_snapshots_user ON entity_snapshots(user_id);
CREATE INDEX idx_snapshots_snapshot ON entity_snapshots USING GIN(snapshot);
CREATE INDEX idx_entity_snapshots_embedding ON entity_snapshots
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
  WHERE embedding IS NOT NULL;
```
**Notes:**
- Snapshots are recomputed when new observations arrive
- Provenance enables full traceability: snapshot field → observation → document
- Reducers are deterministic: same observations + merge rules → same snapshot
- See [`docs/subsystems/reducer.md`](./reducer.md) for reducer patterns

**Local/SQLite schema additions for entity semantic search (when sqlite-vec loaded):**
- `entity_embeddings_vec`: vec0 virtual table, `embedding float[1536]`. Stores embeddings for KNN similarity search.
- `entity_embedding_rows`: Maps vec rowid to entity metadata. Columns: `rowid` (PK, matches vec rowid), `entity_id` (UNIQUE), `user_id`, `entity_type`, `merged`. See [`docs/subsystems/vector_ops.md`](./vector_ops.md) for local path details.

### 2.9 `schema_registry` Table
**Purpose:** Manage config-driven schema definitions, versions, and merge policies. Enables runtime schema evolution without code deployments.
**Schema:**
```sql
CREATE TABLE schema_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  schema_definition JSONB NOT NULL,
  reducer_config JSONB NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_type, schema_version)
);
```
**Field Definitions:**
| Field               | Type        | Purpose                                      | Mutable | Indexed     |
| ------------------- | ----------- | -------------------------------------------- | ------- | ----------- |
| `id`                | UUID        | Unique registry entry ID                     | No      | Primary key |
| `entity_type`       | TEXT        | Entity type (person, company, invoice, etc.) | No      | Yes         |
| `schema_version`    | TEXT        | Schema version (e.g., "1.0", "1.1")          | No      | Yes         |
| `schema_definition` | JSONB       | Field definitions, types, validators         | No      | No          |
| `reducer_config`    | JSONB       | Merge policies per field                     | No      | No          |
| `active`            | BOOLEAN     | Whether this version is active               | Yes     | Yes         |
| `created_at`        | TIMESTAMPTZ | When schema version was created              | No      | No          |
**Indexes:**
```sql
CREATE INDEX idx_schema_active ON schema_registry(entity_type, active) WHERE active = true;
```
**Notes:**
- Schema definitions include field types, validators, and constraints
- Reducer config defines merge strategies per field (last_write, highest_priority, most_specific, merge_array)
- Only one active schema version per entity_type at a time
- See [`docs/subsystems/schema_registry.md`](./schema_registry.md) for details
- Public schema snapshots are exported to [`docs/subsystems/schema_snapshots/`](./schema_snapshots/) for reference (run `npm run schema:export` to update)
### 2.10 `raw_fragments` Table
**Purpose:** Store unknown fields that don't match current schemas. Enables schema discovery and automated promotion. Links to sources and interpretations for full provenance.
**Schema:**
```sql
CREATE TABLE raw_fragments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES sources(id),
  interpretation_id UUID REFERENCES interpretations(id),
  entity_type TEXT NOT NULL,
  fragment_key TEXT NOT NULL,
  fragment_value JSONB NOT NULL,
  fragment_envelope JSONB NOT NULL,
  frequency_count INTEGER DEFAULT 1,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
**Field Definitions:**
| Field                   | Type        | Purpose                                                | Mutable | Indexed     |
| ----------------------- | ----------- | ------------------------------------------------------ | ------- | ----------- |
| `id`                    | UUID        | Unique fragment ID                                     | No      | Primary key |
| `source_id`             | UUID        | Source that produced this fragment                     | No      | Yes         |
| `interpretation_id`     | UUID        | Interpretation that produced this fragment             | No      | Yes         |
| `entity_type`           | TEXT        | Entity type (e.g., "invoice", "transaction", "task")   | No      | No          |
| `fragment_key`          | TEXT        | Field name/key                                         | No      | Yes         |
| `fragment_value`        | JSONB       | Field value                                            | No      | No          |
| `fragment_envelope`     | JSONB       | Type metadata (type, confidence, etc.)                 | No      | No          |
| `frequency_count`       | INTEGER     | How many times this fragment appeared                  | Yes     | Yes         |
| `first_seen`            | TIMESTAMPTZ | When fragment first appeared                           | No      | No          |
| `last_seen`             | TIMESTAMPTZ | When fragment last appeared                            | Yes     | No          |
| `user_id`               | UUID        | User who owns this fragment                            | No      | Yes         |
| `created_at`            | TIMESTAMPTZ | When this fragment row was recorded                    | No      | No          |
**Indexes:**
```sql
CREATE INDEX idx_fragments_source ON raw_fragments(source_id) WHERE source_id IS NOT NULL;
CREATE INDEX idx_fragments_run ON raw_fragments(interpretation_run) WHERE interpretation_run IS NOT NULL;
CREATE INDEX idx_fragments_frequency ON raw_fragments(fragment_key, frequency_count DESC);
CREATE INDEX idx_fragments_user ON raw_fragments(user_id);
```
**RLS Policies:**
```sql
ALTER TABLE raw_fragments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own raw_fragments" ON raw_fragments
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role full access" ON raw_fragments
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```
**Notes:**
- Raw fragments accumulate until patterns emerge
- Automated schema promotion analyzes fragments to propose schema updates
- Frequency tracking enables pattern detection
- `source_id` and `interpretation_id` provide full provenance
- See [`docs/architecture/schema_expansion.md`](../architecture/schema_expansion.md) for promotion pipeline
- See [`docs/subsystems/sources.md`](./sources.md) for sources-first architecture
### 2.11 `sources` Table
**Purpose:** Store raw content with content-addressed deduplication. Central to the sources-first ingestion architecture.
**Schema:**
```sql
CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash TEXT NOT NULL,
  idempotency_key TEXT,
  storage_url TEXT NOT NULL,
  storage_status TEXT NOT NULL DEFAULT 'uploaded',
  mime_type TEXT NOT NULL,
  file_name TEXT,
  byte_size INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_agent_id TEXT,
  source_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL,
  CONSTRAINT unique_content_per_user UNIQUE(content_hash, user_id)
);
```
**Field Definitions:**
| Field             | Type        | Purpose                                         | Mutable | Indexed     |
| ----------------- | ----------- | ----------------------------------------------- | ------- | ----------- |
| `id`              | UUID        | Unique source ID                                | No      | Primary key |
| `content_hash`    | TEXT        | SHA-256 hash of content                         | No      | Yes         |
| `idempotency_key` | TEXT        | Client-provided key for ingest idempotency      | No      | Yes         |
| `storage_url`     | TEXT        | URL in object storage                           | No      | No          |
| `storage_status`  | TEXT        | 'uploaded', 'pending', 'failed'                 | Yes     | Yes         |
| `mime_type`       | TEXT        | MIME type of content                            | No      | No          |
| `file_name`       | TEXT        | Original filename (optional)                    | No      | No          |
| `byte_size`       | INTEGER     | Size in bytes                                   | No      | No          |
| `source_type`     | TEXT        | Type: 'file_upload', 'agent_submission', etc.   | No      | No          |
| `source_agent_id` | TEXT        | Agent ID if submitted via MCP                   | No      | No          |
| `source_metadata` | JSONB       | Additional metadata                             | No      | No          |
| `created_at`      | TIMESTAMPTZ | When source was created                         | No      | Yes         |
| `user_id`         | UUID        | User who owns this source                       | No      | Yes         |
**Indexes:**
```sql
CREATE INDEX idx_sources_hash ON sources(content_hash);
CREATE INDEX idx_sources_user ON sources(user_id);
CREATE INDEX idx_sources_created ON sources(created_at DESC);
CREATE INDEX idx_sources_idempotency_key ON sources(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```
**RLS Policies:**
```sql
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own sources" ON sources
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role full access" ON sources
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```
**Notes:**
- Content-addressed storage: same content = same hash
- Per-user deduplication via `(content_hash, user_id)` unique constraint
- Storage path convention: `sources/{user_id}/{content_hash}`
- See [`docs/subsystems/sources.md`](./sources.md) for complete architecture
### 2.12 `interpretations` Table
**Purpose:** Track versioned interpretation attempts. Enables audit trail of how raw content was interpreted and supports reinterpretation without losing history.
**Schema:**
```sql
CREATE TABLE interpretations (
  id TEXT PRIMARY KEY,
  source_id TEXT,
  interpretation_config TEXT,
  status TEXT,
  started_at TEXT,
  completed_at TEXT,
  observations_created INTEGER,
  user_id TEXT,
  created_at TEXT,
  error_message TEXT,
  unknown_fields_count INTEGER
);
```
**Field Definitions:**
| Field                     | Type        | Purpose                                         | Mutable | Indexed     |
| ------------------------- | ----------- | ----------------------------------------------- | ------- | ----------- |
| `id`                      | TEXT        | Unique interpretation ID                        | No      | Primary key |
| `source_id`               | TEXT        | Source being interpreted                        | No      | Yes         |
| `interpretation_config`   | TEXT (JSON) | Config used (model, version, params)            | No      | No          |
| `status`                  | TEXT        | 'pending', 'running', 'completed', 'failed'     | Yes     | Yes         |
| `error_message`           | TEXT        | Error details if failed                         | Yes     | No          |
| `observations_created`    | INTEGER     | Count of observations created                   | Yes     | No          |
| `unknown_fields_count`    | INTEGER     | Count of unknown fields routed to raw_fragments | Yes     | No          |
| `started_at`              | TEXT        | When interpretation started (ISO 8601)          | Yes     | No          |
| `completed_at`            | TEXT        | When interpretation completed (ISO 8601)        | Yes     | No          |
| `created_at`              | TEXT        | When interpretation was created (ISO 8601)      | No      | No          |
| `user_id`                 | TEXT        | User who owns this interpretation               | No      | Yes         |
**Indexes:**
```sql
CREATE INDEX idx_interpretations_source ON interpretations(source_id);
CREATE INDEX idx_interpretations_status ON interpretations(status);
```
**Notes:**
- Interpretation is non-deterministic but auditable via `interpretation_config`
- Reinterpretation creates NEW record; never modifies existing
- Unknown fields count tracked; actual fields stored in `raw_fragments`
- Timeout handling via `timeout_at` and `heartbeat_at` columns
### 2.13 `upload_queue` Table
**Purpose:** Async retry queue for failed storage uploads. Enables resilient ingestion when object storage is temporarily unavailable.
**Schema:**
```sql
CREATE TABLE upload_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id),
  temp_file_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 5,
  next_retry_at TIMESTAMPTZ DEFAULT NOW(),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL
);
```
**Indexes:**
```sql
CREATE INDEX idx_upload_queue_retry ON upload_queue(next_retry_at) 
  WHERE retry_count < max_retries;
CREATE INDEX idx_upload_queue_user ON upload_queue(user_id);
```
**Notes:**
- Background worker processes queue every 5 minutes
- Exponential backoff: 30s, 60s, 120s, 300s, 600s
- After max retries, source marked as `storage_status = 'failed'`
### 2.14 `storage_usage` Table
**Purpose:** Track per-user storage consumption and interpretation quotas.
**Schema:**
```sql
CREATE TABLE storage_usage (
  user_id UUID PRIMARY KEY,
  total_bytes BIGINT DEFAULT 0,
  total_sources INTEGER DEFAULT 0,
  last_calculated TIMESTAMPTZ DEFAULT NOW(),
  interpretation_count_month INTEGER DEFAULT 0,
  interpretation_limit_month INTEGER DEFAULT 100,
  billing_month TEXT DEFAULT to_char(NOW(), 'YYYY-MM')
);
```
**Functions:**
```sql
CREATE OR REPLACE FUNCTION increment_storage_usage(
  p_user_id UUID,
  p_bytes BIGINT
) RETURNS void AS $$
BEGIN
  INSERT INTO storage_usage (user_id, total_bytes, total_sources, last_calculated)
  VALUES (p_user_id, p_bytes, 1, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    total_bytes = storage_usage.total_bytes + p_bytes,
    total_sources = storage_usage.total_sources + 1,
    last_calculated = NOW();
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION increment_interpretation_count(
  p_user_id UUID
) RETURNS void AS $$
DECLARE
  current_billing_month TEXT := to_char(NOW(), 'YYYY-MM');
BEGIN
  INSERT INTO storage_usage (user_id, interpretation_count_month, billing_month)
  VALUES (p_user_id, 1, current_billing_month)
  ON CONFLICT (user_id) DO UPDATE SET
    interpretation_count_month = CASE 
      WHEN storage_usage.billing_month = current_billing_month 
      THEN storage_usage.interpretation_count_month + 1
      ELSE 1
    END,
    billing_month = current_billing_month;
END;
$$ LANGUAGE plpgsql;
```
**Notes:**
- Interpretation quota resets monthly
- Default limit: 100/month (free tier)
### 2.15 `entity_merges` Table
**Purpose:** Audit log for entity merge operations. Tracks when duplicate entities are merged.
**Schema:**
```sql
CREATE TABLE entity_merges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  from_entity_id TEXT NOT NULL REFERENCES entities(id),
  to_entity_id TEXT NOT NULL REFERENCES entities(id),
  reason TEXT,
  merged_by TEXT NOT NULL,
  observations_rewritten INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT entity_merges_no_self_merge CHECK (from_entity_id <> to_entity_id)
);
```
**Indexes:**
```sql
CREATE UNIQUE INDEX idx_entity_merges_from_unique ON entity_merges(user_id, from_entity_id);
CREATE INDEX idx_entity_merges_user ON entity_merges(user_id);
CREATE INDEX idx_entity_merges_to ON entity_merges(user_id, to_entity_id);
```
**RLS Policies:**
```sql
ALTER TABLE entity_merges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own entity_merges" ON entity_merges
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role full access" ON entity_merges
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```
**Notes:**
- `from_entity_id` and `to_entity_id` are TEXT (matching `entities.id` type)
- Unique constraint on `(user_id, from_entity_id)` prevents merge chains
- Merge rewrites observations, not the original entity record
- See [`docs/subsystems/entity_merge.md`](./entity_merge.md) for merge semantics
### 2.16 `relationship_observations` Table
**Purpose:** Store observations about relationships from multiple sources. Enables deterministic merging and provenance tracking for relationships.

**Schema:**
```sql
CREATE TABLE relationship_observations (
  id UUID PRIMARY KEY,
  relationship_key TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  source_id UUID REFERENCES sources(id),
  interpretation_id UUID REFERENCES interpretations(id),
  observed_at TIMESTAMPTZ NOT NULL,
  specificity_score NUMERIC(3,2),
  source_priority INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  canonical_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL,
  UNIQUE(source_id, interpretation_id, relationship_key, canonical_hash, user_id)
);
```

**Field Definitions:**

| Field                 | Type        | Purpose                                                       | Mutable | Indexed     |
| --------------------- | ----------- | ------------------------------------------------------------- | ------- | ----------- |
| `id`                  | UUID        | Deterministic observation ID (hash-based)                     | No      | Primary key |
| `relationship_key`    | TEXT        | Composite key: `{type}:{source_entity_id}:{target_entity_id}` | No      | Yes         |
| `relationship_type`   | TEXT        | Relationship type (PART_OF, CORRECTS, REFERS_TO, etc.)       | No      | Yes         |
| `source_entity_id`    | TEXT        | Source entity ID                                              | No      | Yes         |
| `target_entity_id`    | TEXT        | Target entity ID                                              | No      | Yes         |
| `source_id`           | UUID        | Source that created this observation                 | No      | Yes         |
| `interpretation_id`   | UUID        | Interpretation run that created this observation (nullable)   | No      | Yes         |
| `observed_at`         | TIMESTAMPTZ | When observation was made                                     | No      | Yes         |
| `specificity_score`   | NUMERIC     | How specific this observation is (0-1)                        | No      | No          |
| `source_priority`     | INTEGER     | Priority of source (higher = more trusted)                    | No      | No          |
| `metadata`            | JSONB       | Relationship metadata fields                                  | No      | No          |
| `canonical_hash`      | TEXT        | Hash of canonicalized metadata for idempotence               | No      | No          |
| `created_at`          | TIMESTAMPTZ | When observation was created                                  | No      | No          |
| `user_id`             | UUID        | User who owns this observation                                | No      | Yes         |

**Indexes:**
```sql
CREATE INDEX idx_relationship_observations_key ON relationship_observations(relationship_key);
CREATE INDEX idx_relationship_observations_type ON relationship_observations(relationship_type);
CREATE INDEX idx_relationship_observations_source_entity ON relationship_observations(source_entity_id);
CREATE INDEX idx_relationship_observations_target_entity ON relationship_observations(target_entity_id);
CREATE INDEX idx_relationship_observations_source ON relationship_observations(source_id);
CREATE INDEX idx_relationship_observations_interpretation ON relationship_observations(interpretation_id);
CREATE INDEX idx_relationship_observations_user ON relationship_observations(user_id);
```

**Notes:**
- Multiple sources can create observations about the same relationship
- Observations are immutable; corrections create new observations with higher priority
- Unique constraint prevents duplicate observations from same source
- See [`docs/subsystems/relationships.md`](./relationships.md) for observation patterns

### 2.18 `relationship_snapshots` Table
**Purpose:** Store computed snapshots of relationships, representing current truth merged from observations.

**Schema:**
```sql
CREATE TABLE relationship_snapshots (
  relationship_key TEXT PRIMARY KEY,
  relationship_type TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT '1.0',
  snapshot JSONB NOT NULL DEFAULT '{}',
  computed_at TIMESTAMPTZ NOT NULL,
  observation_count INTEGER NOT NULL DEFAULT 0,
  last_observation_at TIMESTAMPTZ NOT NULL,
  provenance JSONB NOT NULL DEFAULT '{}',
  user_id UUID NOT NULL
);
```

**Field Definitions:**

| Field                 | Type        | Purpose                                                    | Mutable | Indexed     |
| --------------------- | ----------- | ---------------------------------------------------------- | ------- | ----------- |
| `relationship_key`    | TEXT        | Composite primary key                                      | No      | Primary key |
| `relationship_type`   | TEXT        | Relationship type                                          | No      | Yes         |
| `source_entity_id`    | TEXT        | Source entity ID                                           | No      | Yes         |
| `target_entity_id`    | TEXT        | Target entity ID                                           | No      | Yes         |
| `schema_version`      | TEXT        | Schema version used for snapshot computation               | No      | No          |
| `snapshot`            | JSONB       | Current truth (merged metadata), computed by reducer       | Yes     | Yes (GIN)   |
| `computed_at`         | TIMESTAMPTZ | When snapshot was computed                                 | Yes     | No          |
| `observation_count`   | INTEGER     | Number of observations merged                              | Yes     | No          |
| `last_observation_at` | TIMESTAMPTZ | Timestamp of most recent observation                       | Yes     | No          |
| `provenance`          | JSONB       | Maps metadata field → observation_id for traceability      | Yes     | No          |
| `user_id`             | UUID        | User who owns this relationship                            | No      | Yes         |

**Indexes:**
```sql
CREATE INDEX idx_relationship_snapshots_type ON relationship_snapshots(relationship_type);
CREATE INDEX idx_relationship_snapshots_source_entity ON relationship_snapshots(source_entity_id);
CREATE INDEX idx_relationship_snapshots_target_entity ON relationship_snapshots(target_entity_id);
CREATE INDEX idx_relationship_snapshots_user ON relationship_snapshots(user_id);
CREATE INDEX idx_relationship_snapshots_snapshot ON relationship_snapshots USING GIN(snapshot);
```

**Notes:**
- Snapshots are recomputed when new relationship observations arrive
- Provenance enables full traceability: metadata field → observation → source
- Reducers are deterministic: same observations + merge rules → same snapshot
- See [`docs/subsystems/reducer.md`](./reducer.md) for reducer patterns

## 3. JSONB `fields` Schema (Observations)
### 3.1 Overview
The `fields` JSONB field in `observations` stores [entity schema](#entity-schema)-specific [extracted](#extraction) fields. Each [entity type](#entity-type) (e.g., `invoice`) has a well-defined `fields` structure based on its [entity schema](#entity-schema).

**Design Principles:**
- **[Entity schema](#entity-schema)-driven:** Structure defined by [entity type](#entity-type) and [entity schema](#entity-schema)
- **Flat where possible:** Avoid deep nesting
- **Null-safe:** Missing keys = absent data (not errors)
- **Versioned:** Include `schema_version` if structure evolves
### 3.2 Example: FinancialRecord
```json
{
  "schema_version": "1.0",
  "document_type": "invoice",
  "invoice_number": "INV-2024-001",
  "amount": 1500.0,
  "currency": "USD",
  "date_issued": "2024-01-15T00:00:00Z",
  "date_due": "2024-02-15T00:00:00Z",
  "vendor_name": "Acme Corp",
  "vendor_address": "123 Main St, City, State, 12345",
  "line_items": [
    {
      "description": "Consulting services",
      "quantity": 10,
      "unit_price": 150.0,
      "total": 1500.0
    }
  ],
  "payment_status": "unpaid",
  "notes": "Net 30 terms"
}
```
**Key Paths (for indexing and queries):**
- `properties->>'invoice_number'`
- `properties->>'amount'`
- `properties->>'date_issued'`
- `properties->>'vendor_name'`
### 3.3 Example: IdentityDocument
```json
{
  "schema_version": "1.0",
  "document_type": "passport",
  "full_name": "John Doe",
  "passport_number": "P12345678",
  "nationality": "US",
  "date_of_birth": "1990-01-15",
  "date_issued": "2020-01-01",
  "date_expiry": "2030-01-01",
  "issuing_authority": "U.S. Department of State",
  "place_of_birth": "New York, NY"
}
```
**Key Paths:**
- `properties->>'passport_number'`
- `properties->>'date_expiry'`
- `properties->>'full_name'`
### 3.4 Example: TravelDocument
```json
{
  "schema_version": "1.0",
  "document_type": "flight_itinerary",
  "booking_reference": "ABC123",
  "passenger_name": "John Doe",
  "departure_airport": "SFO",
  "arrival_airport": "JFK",
  "departure_datetime": "2024-03-15T08:00:00Z",
  "arrival_datetime": "2024-03-15T16:30:00Z",
  "airline": "United Airlines",
  "flight_number": "UA1234",
  "seat": "12A",
  "fare": 450.0,
  "currency": "USD"
}
```
**Key Paths:**
- `properties->>'departure_datetime'`
- `properties->>'arrival_datetime'`
- `properties->>'booking_reference'`
### 3.5 Example: Contract
```json
{
  "schema_version": "1.0",
  "document_type": "contract",
  "contract_type": "service_agreement",
  "contract_number": "CNT-2024-001",
  "parties": [
    {
      "name": "Acme Corp",
      "role": "client"
    },
    {
      "name": "Service Provider Inc",
      "role": "vendor"
    }
  ],
  "effective_date": "2024-01-15T00:00:00Z",
  "expiration_date": "2025-01-15T00:00:00Z",
  "total_value": 50000.0,
  "currency": "USD",
  "key_terms": ["Net 30 payment", "Termination with 30 days notice"],
  "status": "active"
}
```
**Key Paths:**
- `properties->>'contract_number'`
- `properties->>'effective_date'`
- `properties->>'expiration_date'`
- `properties->'parties'->0->>'name'`
**Tier 1 ICP Use Cases:**
- Knowledge workers: Legal research, due diligence, contract analysis
- Founders: Company contracts, vendor agreements, investor agreements
### 3.6 Example: Message (Email/Chat)
```json
{
  "schema_version": "1.0",
  "document_type": "email",
  "thread_id": "thread_abc123",
  "message_id": "msg_xyz789",
  "subject": "Project Update Q1 2024",
  "sender": "john@example.com",
  "sender_name": "John Doe",
  "recipients": ["team@example.com"],
  "cc": [],
  "bcc": [],
  "sent_at": "2024-03-15T10:30:00Z",
  "body": "Here's the Q1 update...",
  "attachments": ["report.pdf"],
  "labels": ["work", "project-update"]
}
```
**Key Paths:**
- `properties->>'sender'`
- `properties->>'sent_at'`
- `properties->>'subject'`
- `properties->>'thread_id'`
**Tier 1 ICP Use Cases:**
- Knowledge workers: Client communications, project tracking
- Founders: Team communications, investor updates
- AI-Native Operators: Email attachment import via Gmail integration
### 3.7 Example: Document (Generic Knowledge Asset)
```json
{
  "schema_version": "1.0",
  "document_type": "research_paper",
  "title": "Market Analysis Q1 2024",
  "author": "Research Team",
  "published_date": "2024-03-01T00:00:00Z",
  "summary": "Analysis of market trends...",
  "tags": ["market-research", "q1-2024"],
  "source": "internal",
  "page_count": 25,
  "language": "en"
}
```
**Key Paths:**
- `properties->>'title'`
- `properties->>'published_date'`
- `properties->>'tags'`
- `properties->>'source'`
**Tier 1 ICP Use Cases:**
- Knowledge workers: Research papers, project documentation, client deliverables
- Founders: Product documentation, user research, competitive analysis
- AI-Native Operators: Research synthesis, knowledge assets
### 3.8 Example: Note
```json
{
  "schema_version": "1.0",
  "document_type": "note",
  "title": "Meeting Notes - Product Planning",
  "content": "Discussed feature X...",
  "tags": ["meeting", "product"],
  "created_at": "2024-03-15T14:00:00Z",
  "source": "manual_entry"
}
```
**Key Paths:**
- `properties->>'title'`
- `properties->>'created_at'`
- `properties->>'tags'`
**Tier 1 ICP Use Cases:**
- All Tier 1 ICPs: Free-form notes, meeting notes, markdown files, journals
### 3.9 Generic Fallback: Document
For unrecognized document types:
```json
{
  "schema_version": "1.0",
  "document_type": "pdf",
  "filename": "document.pdf",
  "page_count": 5,
  "extracted_text": "...",
  "language": "en"
}
```
### 3.10 Querying JSONB Fields (Observations)
**Example Queries:**
**Find all invoices over $1000:**
```sql
SELECT * FROM observations
WHERE entity_type = 'invoice'
  AND (fields->>'amount')::numeric > 1000;
```
**Find passports expiring soon:**
```sql
SELECT * FROM observations
WHERE entity_type = 'passport'
  AND (fields->>'date_expiry')::date < NOW() + INTERVAL '6 months';
```
**Find flights departing next week:**
```sql
SELECT * FROM observations
WHERE entity_type = 'flight'
  AND (fields->>'departure_datetime')::timestamptz BETWEEN NOW() AND NOW() + INTERVAL '7 days';
```

### 3.11 [Extraction](#extraction) Metadata Structure
Unknown fields and validation warnings are stored in the `raw_fragments` table. This is part of the **three-layer storage model** that preserves all [extracted](#extraction) data while maintaining [entity schema](#entity-schema) compliance in observation `fields`.

**Three-Layer Storage Model:**
- `raw_text`: Immutable original [extracted](#extraction) text ([stored](#storing) with [source](#source))
- `fields`: [Entity schema](#entity-schema)-compliant fields only (deterministic, queryable) in [observations](#observation)
- `raw_fragments`: Unknown fields, warnings, quality indicators (preservation layer)

**Purpose:**
- Preserve all extracted data (zero data loss)
- Maintain schema compliance in `fields` for deterministic queries
- Provide extraction quality metrics for debugging and schema evolution
- Enable future automatic schema expansion based on patterns in `unknown_fields`
**Structure:**
```typescript
interface ExtractionMetadata {
  unknown_fields?: Record<string, unknown>;
  warnings?: Array<{
    type: "missing_required" | "unknown_field" | "validation_error";
    field?: string;
    message: string;
    value?: unknown;
  }>;
  extraction_quality: {
    fields_extracted_count: number;
    fields_filtered_count: number;
    matched_patterns?: string[];
    confidence_score?: number;
  };
}
```
**Example:**
```json
{
  "unknown_fields": {
    "purchase_order": "PO-789",
    "internal_cost_center": "CC-456"
  },
  "warnings": [
    {
      "type": "unknown_field",
      "field": "purchase_order",
      "message": "Field 'purchase_order' not defined for type 'invoice' - preserved in extraction_metadata"
    },
    {
      "type": "missing_required",
      "field": "date_due",
      "message": "Required field 'date_due' missing for type 'invoice'"
    }
  ],
  "extraction_quality": {
    "fields_extracted_count": 7,
    "fields_filtered_count": 2,
    "matched_patterns": ["invoice_number_pattern", "amount_due_pattern"]
  }
}
```
**Key Paths (for indexing and queries):**
- `fragment_key` — Unknown field name
- `fragment_value` — Unknown field value
- `fragment_envelope->'reason'` — Classification for raw fragment
**Usage Patterns:**
**Find [observations](#observation) with [extraction](#extraction) warnings:**
```sql
SELECT * FROM raw_fragments
WHERE fragment_type = 'unknown_field';
```
**Access unknown fields when needed:**
```sql
SELECT
  id,
  fragment_key,
  fragment_value,
  source_id
FROM raw_fragments
WHERE fragment_type = 'unknown_field';
```
**Find [observations](#observation) with high field filtering (potential [entity schema](#entity-schema) expansion candidates):**
```sql
SELECT 
  fragment_key,
  COUNT(*) as frequency_count
FROM raw_fragments
WHERE fragment_type = 'unknown_field'
GROUP BY fragment_key
HAVING COUNT(*) > 3;
```

**Indexes:**
```sql
-- Index for querying raw_fragments (unknown fields)
CREATE INDEX idx_raw_fragments_frequency 
  ON raw_fragments(fragment_key, frequency_count DESC);
-- Index for unknown fields analysis by source
CREATE INDEX idx_raw_fragments_source 
  ON raw_fragments(source_id) WHERE fragment_type = 'unknown_field';
```

**Related Documentation:**
- Layered storage model: `docs/architecture/schema_handling.md`
- Field validation patterns: See [entity schema](#entity-schema) definitions in `docs/subsystems/schema_registry.md`
- Automatic schema expansion: `docs/architecture/schema_expansion.md` (post-MVP)
## 4. Entity and Event Schema
### 4.1 `entities` Table
**Purpose:** Store canonical entities (people, companies, locations) with deterministic IDs, including user isolation and merge tracking.
```sql
CREATE TABLE entities (
  id TEXT PRIMARY KEY,                             -- Deterministic hash-based ID
  entity_type TEXT NOT NULL,                       -- 'person', 'company', 'location'
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
**Extensions:**
| Field                 | Type        | Purpose                                         |
| --------------------- | ----------- | ----------------------------------------------- |
| `user_id`             | UUID        | User who owns this entity (user isolation)      |
| `merged_to_entity_id` | TEXT        | Target entity if this entity was merged         |
| `merged_at`           | TIMESTAMPTZ | Timestamp when merge occurred                   |
**Indexes:**
```sql
CREATE INDEX idx_entities_user ON entities(user_id);
CREATE INDEX idx_entities_user_type ON entities(user_id, entity_type);
CREATE INDEX idx_entities_user_type_name ON entities(user_id, entity_type, canonical_name);
CREATE INDEX idx_entities_merged ON entities(user_id, merged_to_entity_id)
  WHERE merged_to_entity_id IS NOT NULL;
```
**RLS Policies:**
```sql
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own entities" ON entities
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role full access - entities" ON entities
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```
**Merge Semantics:**
- Merged entities have `merged_to_entity_id` set to target entity
- Default queries should exclude merged entities: `WHERE merged_to_entity_id IS NULL`
- See [`docs/subsystems/entity_merge.md`](./entity_merge.md) for complete merge behavior
### 4.2 `timeline_events` Table
```sql
CREATE TABLE timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,                        -- 'InvoiceIssued', 'FlightBooked'
  event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  source_id UUID REFERENCES sources(id),
  source_field TEXT,                               -- Field that generated event
  entity_ids JSONB DEFAULT '[]',                   -- Array of entity IDs
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID NOT NULL
);
```
**Graph Edges:**
- `source → entity`: Which entities are mentioned in a source
- `source → event`: Which events are derived from a source
- `event → entity`: Which entities are involved in an event
## 5. Row-Level Security (RLS)
### 5.1 RLS Architecture
All user-owned tables have RLS enabled with user isolation. The security model is:
- **Client keys** (`anon`, `authenticated`): SELECT-only access via RLS
- **Service role**: Full access for all mutations (MCP server uses service_role)
- **User identity**: Enforced at MCP layer and stamped into rows
### 5.2 User-Isolated Tables
The following tables are user-scoped with RLS policies:
| Table | User Column | RLS Policy |
|-------|-------------|------------|
| `sources` | `user_id` | SELECT for own data |
| `interpretations` | `user_id` | SELECT for own data |
| `observations` | `user_id` | SELECT for own data |
| `entity_snapshots` | `user_id` | SELECT for own data |
| `entities` | `user_id` | SELECT for own data |
| `raw_fragments` | `user_id` | SELECT for own data |
| `entity_merges` | `user_id` | SELECT for own data |
**Standard RLS Policy Pattern:**
```sql
ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;
-- Users can only read their own data
CREATE POLICY "Users read own <table_name>" ON <table_name>
  FOR SELECT USING (user_id = auth.uid());
-- Service role has full access for mutations
CREATE POLICY "Service role full access" ON <table_name>
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```
### 5.3 Entity Snapshots RLS
```sql
ALTER TABLE entity_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own snapshots" ON entity_snapshots
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role full access" ON entity_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```
### 5.5 Security Invariants
1. **No client writes**: All INSERT/UPDATE/DELETE via MCP server using `service_role` key
2. **User stamping**: `user_id` explicitly set by MCP server from authenticated context
3. **Storage URLs**: Opaque, never exposed to clients; all reads via MCP server + ownership check
4. **Cross-user prevention**: All operations validate `user_id` match; merge cannot cross users
## 6. Schema Migration Protocol
### 6.1 Migration File Structure
**Location:** `migrations/`
**Naming:** `YYYYMMDDHHMMSS_description.sql`
**Example:** `20240115103000_add_file_name_to_sources.sql`
**Template:**
```sql
-- Migration: Add file_name column to sources
-- Date: 2024-01-15
-- Author: System
-- UP Migration
ALTER TABLE sources ADD COLUMN IF NOT EXISTS file_name TEXT;
-- Create index (if needed)
-- CREATE INDEX idx_sources_file_name ON sources(file_name);
-- Backfill (if needed, deterministic only)
-- UPDATE sources SET file_name = ... WHERE file_name IS NULL;
-- DOWN Migration (commented, for reference)
-- ALTER TABLE sources DROP COLUMN IF EXISTS file_name;
```
### 6.2 Migration Safety Rules
**MUST:**
1. **Test on staging:** Run migration on production-like data first
2. **Measure performance:** Check migration runtime and lock duration
3. **Add defaults:** New columns MUST have defaults (no breaking changes)
4. **Preserve data:** Never delete data without explicit approval
5. **Document changes:** Include purpose and rollback plan in migration file
6. **Version properties schema:** Bump `schema_version` if changing JSONB structure
**MUST NOT:**
1. **Block production:** Migrations MUST NOT lock tables for >1 second
2. **Break clients:** Schema changes MUST be backward-compatible
3. **Lose data:** Never DROP COLUMN without backup
4. **Change semantics:** Existing JSONB keys MUST retain their meaning
5. **Depend on nondeterminism:** Backfills MUST be deterministic
### 6.3 Testing Migrations
**Pre-Migration Checklist:**
- [ ] Migration tested on local DB with production-like data
- [ ] Migration runtime measured (< 1s for tables < 100K rows)
- [ ] Rollback tested (down migration works)
- [ ] Application code updated to handle new schema
- [ ] JSONB `schema_version` bumped if applicable
- [ ] Documentation updated
**Post-Migration Verification:**
- [ ] All indexes rebuilt successfully
- [ ] Query performance unchanged or improved
- [ ] No application errors in logs
- [ ] RLS policies still enforce correctly
## 7. Schema Versioning
### 7.1 JSONB Schema Versions
Each [entity type](#entity-type) SHOULD include `schema_version` in observation `fields`:
```json
{
  "schema_version": "1.0.0",
  ...
}
```
**Semantic Versioning (major.minor.patch):**
- **Major (X.0.0)**: Breaking changes
  - Removing fields
  - Changing field types
  - Making optional fields required
- **Minor (x.Y.0)**: Additive, backward-compatible changes
  - Adding optional fields
  - Adding converters
- **Patch (x.y.Z)**: Non-functional changes
  - Documentation updates

**When to bump version:**
- **Major**: Removing fields, changing types, making fields required
- **Minor**: Adding optional fields, adding converters
- **Patch**: Documentation, formatting

**Backward Compatibility:**
- Old schema versions MUST remain readable
- Application MUST handle missing fields gracefully
- Observations are immutable - they keep their original `schema_version`
- Snapshots use the active schema and must handle missing fields from old observations
**Example Version Migration:**
```typescript
function migrateFinancialRecordProperties(properties: any): any {
  const version = properties.schema_version || "1.0";
  if (version === "1.0") {
    // Migrate 1.0 → 2.0
    return {
      ...properties,
      schema_version: "2.0",
      // Add new field with default
      payment_method: properties.payment_method || "unknown",
    };
  }
  return properties; // Already latest version
}
```
## 8. Performance and Indexing Strategy
### 8.1 Index Usage Patterns
**GIN Indexes (JSONB):**
- Good for: `properties @> {'key': 'value'}` (containment queries)
- Cost: Slower writes, larger storage
**B-Tree Indexes (Scalar Columns):**
- Good for: Range queries, sorting (`created_at`, `type`)
- Cost: Minimal
**Vector Indexes (ivfflat):**
- Good for: Similarity search (`embedding <-> query_vector`)
- Cost: Approximate results, tuning required
**Composite Indexes:**
- Good for: Multi-column queries (`external_source`, `external_id`)
### 8.2 Query Optimization Tips
**Use Indexed Columns First:**
```sql
-- Good: Uses idx_observations_entity
SELECT * FROM observations WHERE entity_type = 'invoice';
-- Bad: Full table scan (if no index on JSONB path)
SELECT * FROM observations WHERE fields->>'amount' = '1000';
```
**Add Expression Indexes for Common JSONB Queries:**
```sql
CREATE INDEX idx_observations_amount ON observations ((fields->>'amount')::numeric)
  WHERE entity_type = 'invoice';
```
**Use `EXPLAIN ANALYZE`:**
```sql
EXPLAIN ANALYZE SELECT * FROM observations WHERE entity_type = 'invoice';
```
## 9. Schema Testing Requirements
### 9.1 Unit Tests
**Test JSONB Schema Validation:**
```typescript
test("FinancialRecord properties are valid", () => {
  const properties = {
    schema_version: "1.0",
    invoice_number: "INV-001",
    amount: 1500.0,
    currency: "USD",
  };
  expect(validateFinancialRecordProperties(properties)).toBe(true);
});
```
### 9.2 Integration Tests
**Test Source Insert/Fetch:**
```typescript
test("insert and fetch source", async () => {
  const source = await insertSource({
    content_hash: "hash_123",
    mime_type: "text/plain",
    storage_url: "file:///tmp/source.txt",
  });
  const fetched = await fetchSource(source.id);
  expect(fetched.content_hash).toBe("hash_123");
});
```
### 9.3 Migration Tests
**Test Up/Down Migrations:**
```typescript
test("migration adds file_name column", async () => {
  await runMigration("20240115_add_file_name_to_sources.sql");
  const columns = await getTableColumns("sources");
  expect(columns).toContain("file_name");
  await rollbackMigration("20240115_add_file_name_to_sources.sql");
  const columnsAfter = await getTableColumns("sources");
  expect(columnsAfter).not.toContain("file_name");
});
```
## 10. Schema Invariants (MUST/MUST NOT)
### MUST
1. **All sources MUST have `id`, `content_hash`, `created_at`**
2. **All observations MUST have `entity_id`, `entity_type`, `fields`**
3. **`entity_type` MUST map to a known schema**
4. **All foreign keys MUST reference valid sources/entities** (no orphans)
5. **Migrations MUST be reversible**
6. **Migrations MUST preserve existing data**
7. **JSONB schemas MUST include `schema_version`**
8. **All indexes MUST be documented**
9. **RLS policies MUST be enabled on all tables**
10. **All timestamps MUST be `TIMESTAMPTZ`** (timezone-aware)
### MUST NOT
1. **MUST NOT change core column types** (e.g., `id` UUID → TEXT)
2. **MUST NOT remove columns without migration**
3. **MUST NOT change JSONB key semantics** without versioning
4. **MUST NOT create circular foreign keys** (no cycles)
5. **MUST NOT store PII in unencrypted logs** (RLS applies)
6. **MUST NOT use `SERIAL` IDs** (use UUID for distributed safety)
7. **MUST NOT skip `schema_version`** in new schemas
8. **MUST NOT create unbounded arrays** in JSONB (performance risk)
## Agent Instructions
### When to Load This Document
Load `docs/subsystems/schema.md` when:
- Modifying database schema (adding tables, columns, indexes)
- Working with `properties` JSONB fields
- Creating or running migrations
- Querying observations with complex JSONB filters
- Planning data model changes
- Debugging schema-related issues
### Required Co-Loaded Documents
- `docs/NEOTOMA_MANIFEST.md` (immutability, provenance)
- `docs/architecture/architecture.md` (layer boundaries)
- `docs/architecture/determinism.md` (deterministic migrations)
- `docs/subsystems/ingestion/ingestion.md` (how properties are populated)
- `docs/private/migration/migrations_lifecycle.md` (migration process)
### Constraints Agents Must Enforce
1. **All schema changes MUST be additive** (no breaking changes)
2. **All migrations MUST be reversible**
3. **All JSONB schemas MUST include `schema_version`**
4. **All new columns MUST have defaults**
5. **All foreign keys MUST cascade appropriately** (ON DELETE CASCADE where logical)
6. **All RLS policies MUST be maintained**
7. **All indexes MUST be justified** (performance tests required)
8. **All properties MUST map to extraction logic** (documented in ingestion)
### Forbidden Patterns
- Removing columns without migration
- Changing column types without compatibility plan
- Creating circular foreign keys
- Storing PII in logs or unprotected fields
- Using non-deterministic defaults (e.g., `random()`)
- Unbounded JSONB arrays (performance risk)
- Missing `schema_version` in new JSONB schemas
### Validation Checklist
- [ ] Schema change is additive only
- [ ] Migration file created with up/down paths
- [ ] Migration tested on staging data
- [ ] New columns have defaults
- [ ] JSONB `schema_version` bumped if applicable
- [ ] Indexes created for new query patterns
- [ ] RLS policies updated if needed
- [ ] Documentation updated
- [ ] Application code handles new schema
- [ ] Tests cover new fields/tables
