## Release v0.2.0 — Sources-First Ingestion Architecture

_(Pre-MVP Release for Foundational Ingestion Infrastructure)_

---

### 1. Release Overview

- **Release ID**: `v0.2.0`
- **Name**: Sources-First Ingestion Architecture
- **Release Type**: Not Marketed (production deployment without marketing activities)
- **Goal**: Implement a sources-first ingestion architecture that decouples raw data storage from interpretation, enabling content-addressed deduplication, versioned interpretation runs, user isolation, and entity merge capabilities.
- **Priority**: P0 (foundational infrastructure required before MVP)
- **Target Ship Date**: Before Chat Transcript CLI (v0.3.0) and MVP (v1.0.0)
- **Marketing Required**: No (not marketed release)
- **Deployment**: Production (neotoma.io)

#### 1.1 Canonical Specs (Authoritative Sources)

- **Architecture Plan**: `.cursor/plans/sources-first-ingestion-v12-final.plan.md`
- **Manifest**: `docs/NEOTOMA_MANIFEST.md`
- **Schema Registry**: `docs/subsystems/schema_registry.md`
- **Database Schema**: `docs/subsystems/schema.md`

This release plan coordinates the sources-first ingestion architecture into a concrete release.

---

### 2. Scope

#### 2.1 Included Feature Units

**Phase 1: Schema + Storage Foundation**

- `FU-110`: Sources Table Migration (content-addressed raw storage with RLS)
- `FU-111`: Interpretation Runs Table (versioned interpretation tracking with timeout handling)
- `FU-112`: Storage Infrastructure (upload queue, storage usage tracking, quotas)
- `FU-113`: Entity Extensions (user_id, merged_to tracking, RLS)
- `FU-114`: Observation Extensions (source_id, interpretation_run_id linkage)
- `FU-115`: Raw Fragments Extensions (unknown field storage with provenance)
- `FU-116`: Entity Merges Table (merge audit log)

**Phase 2: MCP Tools + Services**

- `FU-120`: Raw Storage Service (SHA-256 hashing, Supabase Storage, queue fallback)
- `FU-121`: Interpretation Service (schema validation, entity resolution, unknown field routing)
- `FU-122`: MCP ingest() Tool (raw ingestion with optional interpretation)
- `FU-123`: MCP ingest_structured() Tool (pre-structured data with schema validation)
- `FU-124`: MCP reinterpret() Tool (versioned re-interpretation with quota enforcement)
- `FU-125`: MCP correct() Tool (high-priority correction observations)
- `FU-126`: MCP merge_entities() Tool (entity deduplication with cascade updates)

**Phase 3: Background Workers + Integration**

- `FU-130`: Upload Queue Processor (async retry for failed uploads) — **P0**
- `FU-131`: Stale Interpretation Cleanup (timeout handling for hung jobs) — **P0**
- `FU-132`: Archival Job (old interpretation run archival) — P2 (deferred)
- `FU-133`: Duplicate Detection Worker (heuristic duplicate flagging) — P2 (deferred)
- `FU-134`: Query Updates (provenance chain, merged entity exclusion) — **P0**

#### 2.2 Explicitly Excluded

- LLM model selection UI (use config/env)
- Semantic search integration (post-MVP)
- Multi-user collaboration (entities remain user-isolated)
- Automated entity merge suggestions (manual/agent-driven only)
- Schema evolution UI (schemas seeded via migration)

---

### 3. Release-Level Acceptance Criteria

#### 3.1 Product

- Raw files can be ingested and content-addressed (same content = same hash)
- Interpretation runs are versioned and auditable
- Users can correct AI-extracted fields via priority observations
- Duplicate entities can be merged deterministically
- All data is user-isolated (no cross-user data leakage)

#### 3.2 Technical

**Implementation Requirements:**

- All new tables created with RLS policies
- `sources` table with `(user_id, content_hash)` uniqueness
- `interpretation_runs` with timeout/heartbeat columns
- `entities` extended with `user_id`, `merged_to_entity_id`
- `observations` linked to `source_id`, `interpretation_run_id`
- `raw_fragments` stores unknown fields with provenance
- `entity_merges` audit log with TEXT IDs (matching `entities.id`)
- `storage_usage` tracks bytes + interpretation counts
- MCP tools: `ingest()`, `ingest_structured()`, `reinterpret()`, `correct()`, `merge_entities()`
- Background workers deployed as Supabase Edge Functions
- Unit tests for schema filtering, unknown routing, merge behavior
- Integration tests for full ingest → query flow, reinterpretation immutability

**Technical Specifications:**

- **Storage Path**: `sources/{user_id}/{content_hash}`
- **Deduplication**: SHA-256 content hash with per-user uniqueness
- **Interpretation Quota**: 100/month (free), 1000/month (pro)
- **Interpretation Timeout**: 10 minutes with heartbeat monitoring
- **Source Priorities**: AI=0, structured=100, correction=1000
- **Entity IDs**: TEXT (not UUID) per baseline schema

**Validation Requirements:**

- **Schema Validation**: Strict JSON schema validation at ingestion boundary using schema registry as single source of truth
- **Rejection Policy**: Records with invalid shapes/types are rejected (not silently accepted); errors logged and surfaced
- **Provenance Validation**: Every observation/raw_fragment MUST have valid `source_id` and `interpretation_run_id` (enforced via FK + NOT NULL where applicable)
- **Integration Tests**: Verify that prompt/model changes cannot silently alter record shapes without corresponding schema version bumps

#### 3.3 Business

- Foundation enables all subsequent ingestion-dependent features
- User data isolation satisfies privacy requirements
- Interpretation auditability enables trust and debugging
- Entity merge capability addresses inevitable resolution duplicates

---

### 4. Goals and Benefits

#### 4.1 Key Goals

1. **Accept any raw data type** without schema friction at ingest time
2. **Content-addressed storage** with deterministic deduplication
3. **Versioned, auditable interpretation** (non-deterministic, but traceable)
4. **Corrections via high-priority observations** (user always wins)
5. **User isolation from day one** (all tables user-scoped with RLS)
6. **Prevent schema pollution** from interpretation (unknown → raw_fragments)
7. **Bound entity-duplication damage** with minimal merge mechanism
8. **Prevent unbounded interpretation costs** with quotas and timeouts

#### 4.2 Benefits

- **Provenance**: Every observation traceable to raw source and interpretation run
- **Immutability**: Reinterpretation never modifies existing observations
- **Flexibility**: Generic fallback type handles unknown schemas gracefully
- **Cost Control**: Monthly quotas prevent runaway AI costs
- **Resilience**: Upload queue handles storage failures with retry
- **Auditability**: Entity merges logged with observation count

#### 4.3 Trade-offs

- **Entity resolution remains heuristic**: Duplicates expected; merge is manual
- **Interpretation is non-deterministic**: Auditability is the guarantee, not replay
- **Storage overhead**: Raw content stored separately from observations
- **Complexity**: More tables and relationships than simple record storage

---

### 5. Determinism Doctrine

#### 5.1 Core Principle

The system is **deterministic given fixed source, interpretation config, and resolver version**—not "deterministic everywhere." Nondeterministic components are explicitly bounded and auditable.

#### 5.2 Determinism Table

| Component | Deterministic? | Boundary Notes |
|-----------|----------------|----------------|
| Content hashing (SHA-256) | Yes | Same bytes = same hash |
| Deduplication | Yes | `(user_id, content_hash)` uniqueness |
| Storage path | Yes | `{user_id}/{content_hash}` |
| Observation creation | Yes | Given fixed validated fields + entity_id |
| Reducer computation | Yes | Same observations + same merge rules → same snapshot |
| Entity merge | Yes | Deterministic rewrite + snapshot recompute |
| AI interpretation | **No** | Config logged; versioned and auditable |
| Entity resolution | **No** | Heuristic; resolver version logged |

#### 5.3 Nondeterminism Boundary

AI interpretation and entity resolution are explicitly outside the deterministic core:
- **Interpretation**: Outputs vary by model, temperature, prompt. Config is logged for audit, not replay.
- **Entity Resolution**: Heuristic matching; resolver version tracked for provenance.

#### 5.4 Interpretation Config Requirements

Every `interpretation_run` MUST record:
- `provider` (e.g., "openai", "anthropic")
- `model_id` (e.g., "gpt-4o", "claude-3-sonnet")
- `temperature` 
- `prompt_hash` (SHA-256 of prompt template)
- `code_version` (git SHA or release tag)
- `feature_flags` (any active flags affecting behavior)

This config is stored in `interpretation_config JSONB` column.

#### 5.5 Provenance Chain

Full provenance for any observation:
```
Source → InterpretationRun (with config) → Observation → EntitySnapshot
```

Every `observation` and `raw_fragment` MUST have:
- `source_id` (mandatory, validated)
- `interpretation_run_id` (mandatory for AI-derived, validated)

**Policy**: LLM extraction is versioned and auditable outside the deterministic core. The system never claims replay determinism for interpretation.

---

### 6. Data Model Summary

#### 6.1 New Tables

| Table | Purpose |
|-------|---------|
| `sources` | Raw content storage (hash, URL, mime_type, provenance) |
| `interpretation_runs` | Versioned interpretation attempts with timeout tracking |
| `upload_queue` | Async retry for failed storage uploads |
| `storage_usage` | Per-user storage and interpretation quotas |
| `entity_merges` | Audit log for entity merge operations |

#### 6.2 Extended Tables

| Table | Extensions |
|-------|------------|
| `entities` | `user_id`, `merged_to_entity_id`, `merged_at` + RLS |
| `observations` | `source_id`, `interpretation_run_id` |
| `raw_fragments` | `source_id`, `interpretation_run_id`, `user_id` |
| `entity_snapshots` | RLS policies only |

---

### 7. MCP Tools Summary

| Tool | Purpose | Priority |
|------|---------|----------|
| `ingest()` | Raw ingestion with optional interpretation | Default |
| `ingest_structured()` | Pre-structured data with schema validation | 100 |
| `reinterpret()` | Trigger new interpretation run | 0 |
| `correct()` | High-priority field correction | 1000 |
| `merge_entities()` | Merge duplicate entities | N/A |

#### 7.1 Agent API Surface

The MCP surface is **minimal and opinionated**. These five tools cover common flows:

| Flow | Tool | Recipe |
|------|------|--------|
| Upload and interpret a document | `ingest()` | Call with file content, `interpret: true` |
| Upload without interpretation | `ingest()` | Call with `interpret: false`, then `reinterpret()` later |
| Fix a wrong field | `correct()` | Call with `entity_id`, `field`, `value` |
| Merge duplicates | `merge_entities()` | Call with `from_entity_id`, `to_entity_id` |
| Re-process with new model | `reinterpret()` | Call with `source_id` |

#### 7.2 Agent Guardrails

Agents **cannot bypass** the intended flows:
- **No direct writes** to `sources`, `interpretation_runs`, `observations` (service_role only via MCP)
- **Provenance enforced**: Observations without valid `source_id`/`interpretation_run_id` are rejected
- **Schema validated**: Fields not matching active schema version are routed to `raw_fragments` or rejected
- **User isolation enforced**: All operations validate `user_id` match; cross-user operations fail

---

### 8. Cross-FU Integration Scenarios

These scenarios must pass end-to-end before v0.2.0 is approved:

#### 8.1 Raw File Ingestion Flow

1. Agent calls `ingest()` with PDF file
2. System computes SHA-256 hash, checks deduplication
3. File uploaded to Supabase Storage at `sources/{user_id}/{hash}`
4. Interpretation triggered (if `interpret: true`)
5. Observations created for extracted entities (schema-validated)
6. Unknown fields routed to `raw_fragments`
7. Entity snapshots recomputed

**Acceptance Criteria:**
- ✅ Same file re-ingested → `deduplicated: true`
- ✅ Observations link to source_id and interpretation_run_id
- ✅ Unknown fields stored in raw_fragments only (not duplicated)

#### 8.2 Reinterpretation Flow

1. Agent calls `reinterpret()` on existing source
2. System creates new interpretation run
3. New observations created (old observations unchanged)
4. Snapshots recomputed including new observations

**Acceptance Criteria:**
- ✅ Prior observations remain unchanged
- ✅ New run has different interpretation_run_id
- ✅ Quota decremented

#### 8.3 Correction Flow

1. Agent calls `correct()` with entity_id, field, value
2. System validates field against schema
3. Correction observation created with priority=1000
4. Snapshot recomputed (correction wins)

**Acceptance Criteria:**
- ✅ Correction overrides AI extraction
- ✅ Correction persists across reinterpretation

#### 8.4 Entity Merge Flow

1. Agent identifies duplicate entities
2. Agent calls `merge_entities()` with from_id, to_id
3. System validates same-user ownership
4. Observations rewritten to target entity
5. Source entity marked as merged
6. Snapshots recomputed

**Acceptance Criteria:**
- ✅ Cross-user merge rejected
- ✅ Merged entity excluded from queries
- ✅ Observations redirect to merged target
- ✅ Audit log created

#### 8.5 Upload Queue Retry Flow

1. Storage upload fails during `ingest()`
2. Content queued to `upload_queue` with temp file
3. Source created with `storage_status: 'pending'`
4. Background worker retries upload
5. On success: status updated to 'uploaded'
6. On final failure: status updated to 'failed'

**Acceptance Criteria:**
- ✅ Partial failure doesn't block ingest response
- ✅ Retry succeeds after transient failure
- ✅ Final failure logged with error

---

### 9. Implementation Phases

#### Phase 1: Schema + Storage (1-2 weeks)

**Migrations:**
- `sources` table with RLS
- `interpretation_runs` table with timeout/heartbeat columns
- `upload_queue` table
- `storage_usage` table with interpretation quotas
- `entity_merges` table (TEXT IDs, user-scoped unique index)
- Extend `entities` with user_id, merged_to_entity_id, merged_at + RLS
- Extend `observations` with source_id, interpretation_run_id
- Extend `raw_fragments` with source_id, interpretation_run_id, user_id
- Update RLS on `observations`, `entity_snapshots`, `raw_fragments`

**Schema Seeding:**
- Base types: transaction, merchant, invoice, receipt
- Generic fallback type (using `object`, not `jsonb`)

**Storage Service:**
- `raw_storage_service.ts`
- SHA-256 hashing
- Supabase Storage upload with retry
- File-based queue for failures with disk space check
- Transactional storage usage tracking (idempotent)

**Setup:**
- Create storage bucket `sources` with user-prefix structure
- Create temp directory for queue files

#### Phase 2: MCP Tools + Workers (2-3 weeks)

**Interpretation Service:**
- Schema filtering (valid → observation, unknown → raw_fragments)
- Multi-entity extraction
- Advisory lock on source_id
- Heartbeat updates during long-running interpretation
- Extraction completeness tracking
- User-scoped entity resolution

**MCP Tools:**
- `ingest()` with quota check
- `ingest_structured()` with schema validation
- `reinterpret()` with quota + timeout handling
- `correct()` with schema validation + entity ownership check
- `merge_entities()` with validation + cascade updates + same-user check

**Background Workers (P0 for v0.2.0):**
- Upload queue processor (every 5 min) — required
- Stale interpretation cleanup (every 5 min) — required

**Deferred Workers (P2 — post-core-stability):**
- Archival job (weekly) — defer until core flows stable
- Duplicate detection (weekly, user-scoped) — defer until core flows stable

**Monitoring:**
- Instrument all services with metrics logging

#### Phase 3: Integration + Testing (2 weeks)

**Query Updates:**
- Update `query_records` to return `source_id` in provenance
- Add `get_source_metadata(source_id)` (no storage URL exposure)
- Update entity snapshot queries to include source chain
- Exclude merged entities from default queries
- Redirect observations to merged entity target

**Testing:**
- Unit tests: schema filtering, unknown routing, idempotent usage
- Integration tests: full ingest → query flow, reinterpret immutability, merge behavior
- Merge tests: cross-user prevention, merged entity redirect/exclusion
- Performance tests: concurrent uploads, large files
- Timeout tests: verify stale cleanup works

**Total: 5-7 weeks**

---

### 10. Background Workers

| Worker | Trigger | Priority | Purpose |
|--------|---------|----------|---------|
| Upload Queue Processor | Cron 5 min | **P0** | Retry failed storage uploads |
| Stale Interpretation Cleanup | Cron 5 min | **P0** | Mark timed-out runs as failed |
| Archival Job | Cron weekly | P1 (defer) | Archive old interpretation runs (180 days) |
| Duplicate Detection | Cron weekly | P1 (defer) | Flag potential entity duplicates |

**Prioritization**: P0 workers (Upload Queue, Stale Cleanup) are required for v0.2.0 completion. P1 workers (Archival, Duplicate Detection) are deferred until core flows (ingest, reinterpret, correct, merge) are stable and monitored.

All deployed as Supabase Edge Functions with cron triggers.

---

### 11. Monitoring Metrics

#### 11.1 Core Flow Metrics (P0 — Gating for v0.2.0)

| Metric | Type | Description |
|--------|------|-------------|
| `ingest.latency_ms` | histogram | End-to-end ingest time |
| `ingest.success_total` | counter | Successful ingestions |
| `ingest.failure_total` | counter | Failed ingestions |
| `reinterpret.latency_ms` | histogram | Reinterpretation time |
| `reinterpret.success_total` | counter | Successful reinterpretations |
| `correct.success_total` | counter | Successful corrections |
| `merge.success_total` | counter | Successful entity merges |
| `interpretation.quota_exceeded_total` | counter | Quota exceeded rejections |

**Gating Criteria**: Core flows (ingest, reinterpret, correct, merge) must have <1% error rate and p99 latency <30s before layering additional complexity.

#### 11.2 Infrastructure Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `storage.upload.latency_ms` | histogram | Upload time |
| `storage.upload.success_total` | counter | Successful uploads |
| `storage.upload.failure_total` | counter | Failed uploads |
| `storage.queue.depth` | gauge | Pending queue items |
| `interpretation.timeout_total` | counter | Timed out interpretations |
| `entity.potential_duplicates` | gauge | Entities flagged as potential duplicates |

---

### 12. Security Model

- **RLS**: Client keys (`anon`, `authenticated`) have SELECT-only access
- **MCP Server**: All mutations via `service_role`; user identity stamped into rows
- **Storage URLs**: Opaque, never returned to clients; reads via MCP server + ownership check
- **Cross-User Prevention**: All operations validate `user_id` match; merge cannot cross users

---

### 13. Deployment and Rollout Strategy

- **Deployment Target**: Production (neotoma.io)
  - All releases deploy to production at neotoma.io
  - Greenfield implementation (no migration required)
- **Marketing Strategy**: Not Marketed
  - No pre-launch marketing activities
  - No announcement or promotion
  - Release deployed silently to production
- **Rollback Plan**: Revert migrations and redeploy; no user data to preserve (pre-release)

---

### 14. Post-Release Validation

- Validate ingestion pipeline:
  - Raw file upload succeeds
  - Content deduplication works
  - Interpretation creates observations
  - Unknown fields route to raw_fragments
  - Entity resolution is user-scoped
  - Corrections override AI extraction
  - Entity merge works correctly
  - Background workers functional

---

### 15. Success Criteria

**Release is Complete When:**

1. ✅ All migrations applied successfully
2. ✅ RLS policies enforced on all user tables
3. ✅ `ingest()` MCP tool functional with deduplication
4. ✅ `ingest_structured()` MCP tool validates against schema
5. ✅ `reinterpret()` creates new observations (immutability verified)
6. ✅ `correct()` creates priority-1000 observations
7. ✅ `merge_entities()` rewrites observations and updates snapshots
8. ✅ Upload queue processor retries failed uploads
9. ✅ Stale interpretation cleanup marks timeouts as failed
10. ✅ Unit tests passing (schema filtering, merge behavior)
11. ✅ Integration tests passing (full ingestion flow)
12. ✅ Cross-user isolation verified (no data leakage)
13. ✅ Core flow monitoring instrumented (ingest, reinterpret, correct, merge)
14. ✅ Interpretation config logging verified (provider, model, temperature, prompt_hash)
15. ✅ Provenance chain complete (source → interpretation_run → observation → snapshot)

---

### 16. Known Limitations

1. **Entity resolution remains heuristic**: Merges are manual/agent-driven
2. **`generic` entities are visibility mechanism**: Not a substitute for schema design
3. **Interpretation is non-deterministic**: Auditability is the guarantee, not replay
4. **Merge chains not supported**: Each entity can only be merged once (flat merges only)
5. **Relationships/timeline_events**: Out of scope unless they become user-scoped
6. **Entity resolution not versioned**: Resolver version tracking deferred to future release (see 16.1)

#### 16.1 Future Enhancements (Post-v0.2.0)

| Enhancement | Description | Why Deferred |
|-------------|-------------|--------------|
| **Resolver versioning** | Track which resolver version produced each `entity_id` or merge decision | Requires `resolution_run` abstraction; adds complexity before core flows are stable |
| **Resolver evolution rules** | Define additive vs breaking changes; audit/rollback capability | Depends on versioning foundation |
| **Automated merge suggestions** | Proactive duplicate detection with UI | Core merge must be stable first |

---

### 17. Status

- **Current Status**: `planning`
- **Owner**: Mark Hendrickson
- **Notes**:
  - Pre-MVP release (not marketed)
  - Foundational infrastructure for all subsequent ingestion features
  - Enables Chat Transcript CLI (v0.3.0) and MVP (v1.0.0)
  - Greenfield implementation (no migration complexity)
  - AI agent execution assumed

---
