name: Sources-First Ingestion v10
overview: Greenfield, production-ready sources-first ingestion with explicit determinism boundaries, schema-valid interpretation output, durable unknown-field preservation, and a minimal entity-merge mechanism to control duplicate drift.
todos:
  - id: schema-v10
    content: Define sources-first schema changes (sources, interpretation_runs metrics-only unknowns, raw_fragments extension, entity_merges) with RLS and indexes
    status: pending
  - id: schema-seed-v10
    content: Seed schema_registry with base types plus generic fallback using only supported field types/merge strategies
    status: pending
    dependencies:
      - schema-v10
  - id: storage-service-v10
    content: Implement raw storage service with hashing, object storage upload, file-based queue, disk checks, idempotent storage_usage increment
    status: pending
    dependencies:
      - schema-v10
  - id: interpretation-service-v10
    content: Implement interpretation service with schema filtering, unknown routing to raw_fragments, run logging, multi-entity extraction
    status: pending
    dependencies:
      - schema-v10
      - schema-seed-v10
      - storage-service-v10
  - id: mcp-tools-v10
    content: Implement MCP tools ingest/ingest_structured/reinterpret/correct/merge_entities with security model (service_role writes, explicit user stamping)
    status: pending
    dependencies:
      - interpretation-service-v10
  - id: entity-merge-v10
    content: Implement minimal merge_entities path (entity_merges log + rewrite observations entity_id + recompute snapshot)
    status: pending
    dependencies:
      - mcp-tools-v10
  - id: tests-v10
    content: Add unit/integration/perf tests for schema filtering, unknown routing, reinterpret immutability, idempotent usage, merge_entities behavior
    status: pending
    dependencies:
      - entity-merge-v10
# Sources-First Ingestion v10 (Final - Issues Resolved)
## Scope
Greenfield build. No migration. AI agent execution via MCP. Uses existing Truth Layer primitives (`observations`, `entity_snapshots`, `schema_registry`, `entities`) and adds sources-first storage + interpretation runs.---
## Goals
1. Accept any raw data type without schema friction at ingest time
2. Content-addressed storage with deterministic deduplication
3. Versioned, auditable interpretation (non-deterministic, but traceable)
4. Corrections via high-priority observations
5. User isolation from day one
6. Prevent schema pollution from interpretation
7. Bound entity-duplication damage with a minimal merge mechanism
## Determinism Doctrine
| Component | Deterministic? | Notes ||---|---:|---|| Content hashing (SHA-256) | Yes | Same bytes = same hash || Deduplication | Yes | `(user_id, content_hash)` uniqueness || Storage path | Yes | `{user_id}/{content_hash}` || Observation creation (given fixed validated fields + entity_id) | Yes | Pure insert || Reducer computation | Yes | Same observations + same merge rules → same snapshot || AI interpretation | No | Outputs vary; config logged for audit || Entity resolution | No | Heuristic; may drift |**Policy**: The system never claims replay determinism for interpretation.---
## Architectural Invariants
### 1) Reinterpretation never moves or deletes prior observations
- `reinterpret()` always creates a new `interpretation_run` and new observations.
- Existing observations remain unchanged and remain linked to their original run.
### 2) Interpretation output must be schema-valid
- Interpretation MUST validate extracted fields against `schema_registry` before observation creation.
- Only **schema-valid fields** are written to observations.
### 3) Unknown/invalid fields are preserved durably, without duplicating stores
- **Authoritative store for unknown fields**: `raw_fragments`.
- `interpretation_runs` stores only summary metrics (counts), not a second copy of unknown field payloads.
### 4) Entity duplication is expected; a minimal merge tool is first-class
- Entity resolution is heuristic and will create duplicates.
- A minimal `merge_entities()` capability exists to repair duplicates deterministically and quickly.
## Data Model
### A) `sources`
```sql
CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash TEXT NOT NULL,
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
CREATE INDEX idx_sources_hash ON sources(content_hash);
CREATE INDEX idx_sources_user ON sources(user_id);
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own sources" ON sources
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role full access" ON sources
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```
Storage path convention:
```javascript
sources/{user_id}/{content_hash}
```
### B) `interpretation_runs`
Key change vs v9: remove `unknown_fields` payload; keep only metrics.
```sql
CREATE TABLE interpretation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id),
  interpretation_config JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  extracted_entities JSONB DEFAULT '[]',
  confidence NUMERIC(3,2),
  unknown_field_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  user_id UUID NOT NULL
);
CREATE INDEX idx_runs_source ON interpretation_runs(source_id);
CREATE INDEX idx_runs_status ON interpretation_runs(status);
CREATE INDEX idx_runs_active ON interpretation_runs(source_id) WHERE archived_at IS NULL;
ALTER TABLE interpretation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own runs" ON interpretation_runs
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role full access" ON interpretation_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```
### C) `observations` extension
```sql
ALTER TABLE observations
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES sources(id),
  ADD COLUMN IF NOT EXISTS interpretation_run_id UUID REFERENCES interpretation_runs(id);
CREATE INDEX IF NOT EXISTS idx_observations_source ON observations(source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_observations_run ON observations(interpretation_run_id) WHERE interpretation_run_id IS NOT NULL;
ALTER TABLE observations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read - observations" ON observations;
CREATE POLICY "Users read own observations" ON observations
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role full access" ON observations
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```
### D) `raw_fragments` extension (authoritative unknown-field store)
```sql
ALTER TABLE raw_fragments
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES sources(id),
  ADD COLUMN IF NOT EXISTS interpretation_run_id UUID REFERENCES interpretation_runs(id),
  ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_fragments_source ON raw_fragments(source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fragments_run ON raw_fragments(interpretation_run_id) WHERE interpretation_run_id IS NOT NULL;
ALTER TABLE raw_fragments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read - raw_fragments" ON raw_fragments;
CREATE POLICY "Users read own raw_fragments" ON raw_fragments
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role full access" ON raw_fragments
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```
### E) Minimal entity-merge log
```sql
CREATE TABLE entity_merges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  from_entity_id TEXT NOT NULL,
  to_entity_id TEXT NOT NULL,
  reason TEXT,
  merged_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT entity_merges_no_self_merge CHECK (from_entity_id <> to_entity_id)
);
CREATE INDEX idx_entity_merges_user ON entity_merges(user_id);
CREATE INDEX idx_entity_merges_from ON entity_merges(from_entity_id);
CREATE INDEX idx_entity_merges_to ON entity_merges(to_entity_id);
ALTER TABLE entity_merges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own entity_merges" ON entity_merges
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role full access" ON entity_merges
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```
Merge semantics:
- Merges are explicit administrative operations.
- They are allowed to update `observations.entity_id` for the user (deterministic repair), and then recompute the canonical snapshot.
## Schema Registry Alignment (fixes v9 type/strategy mismatch)
### Allowed field types
This plan constrains seeded schemas to existing allowed types:
- `string | number | date | boolean | array | object`
No `jsonb` type is introduced.
### Seeded schemas (base)
- `transaction`: `date` (date), `amount` (number), `description` (string), `merchant` (string), optional `external_id` (string)
- `merchant`: `name` (string), optional `category` (string), optional `external_id` (string)
- `invoice`: basic scalar fields + optional `items` (array/object)
- `receipt`: basic scalar fields + optional `items` (array/object)
### `generic` fallback schema (type-correct)
Use `object`, not `jsonb`, and avoid defaults.
- `raw_data`: `{ type: "object", required: true }`
- `suggested_type`: `{ type: "string", required: false }`
- `extraction_notes`: `{ type: "string", required: false }`
- `needs_schema_refinement`: `{ type: "boolean", required: false }`
Reducer merge policies must use only existing strategies:
- `raw_data`: `{ strategy: "last_write" }`
## Interpretation Pipeline (schema-valid + unknown preservation)
For each extracted entity candidate:
1. Determine `entity_type` (or fall back to `generic` if unknown).
2. Validate fields against schema.
3. Write **valid fields** into a new observation with `source_priority = 0`.
4. Write **unknown/type-mismatch fields** into `raw_fragments` with `source_id` + `interpretation_run_id`.
5. Update `interpretation_runs.unknown_field_count`.
6. Recompute snapshot for affected entities.
## MCP Tools
### `ingest()`
- Stores source (file_path/content/external_url), dedups, optionally interprets.
- Returns per-run extracted entities with `fields` that were written (schema-valid) plus an `unknown_field_count` summary.
### `ingest_structured()`
- Validates against `schema_registry`; rejects on schema violation.
- Creates an observation with `source_priority = 100` (agent-provided facts).
- Optional raw attachment creates a `source`.
### `reinterpret()`
- Preconditions: source uploaded; no running run for that source.
- Creates a new run + new observations; never touches prior observations.
### `correct()`
- Validates against schema.
- Writes a correction observation with `source_priority = 1000`, `specificity_score = 1.0`.
### `merge_entities()` (new)
```typescript
merge_entities({
  from_entity_id: string,
  to_entity_id: string,
  reason?: string
})
→ {
  merged: true,
  observations_rewritten: number,
  snapshots_recomputed: string[]
}
```
Deterministic behavior:
- Insert `entity_merges` log row.
- `UPDATE observations SET entity_id = to_entity_id WHERE user_id = ... AND entity_id = from_entity_id`.
- Recompute snapshot for `to_entity_id`.
- Optionally mark the `from_entity_id` entity record as merged/deprecated (if you add such a column; otherwise leave it).
## Security Model
- RLS: client keys have SELECT-only access; no write policies for non-service roles.
- MCP server: all mutations via service_role; user identity enforced at MCP layer and stamped into rows.
- Storage URLs: opaque, never returned to clients; reads go through MCP server + ownership check.
## Implementation Phases
### Phase 1 (1–2 weeks)
- Migrations: `sources`, `interpretation_runs` (with `unknown_field_count`), `upload_queue`, `storage_usage`, `entity_merges`
- Extend: `observations`, `raw_fragments`
- RLS hardening: remove public read on `observations`, `entity_snapshots`, `raw_fragments`
- Schema seeding: base types + `generic` using only allowed field types/strategies
- Raw storage service + file-based queue + idempotent usage tracking
### Phase 2 (2–3 weeks)
- Interpretation service with:
- schema filtering
- unknown routing to `raw_fragments`
- multi-entity extraction
- advisory lock on `source_id`
- MCP tools: `ingest`, `ingest_structured`, `reinterpret`, `correct`, `merge_entities`
- Background workers: queue processor + archival
- Duplicate detection metrics (kept from v9)
### Phase 3 (2 weeks)
- Query updates to expose provenance chain including `source_id` and `interpretation_run_id`
- Add `get_source_metadata(source_id)` (no storage URL exposure)
- Integration + performance tests
## Known Limitations