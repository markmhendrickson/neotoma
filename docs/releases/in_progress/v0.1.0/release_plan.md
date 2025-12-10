## Release v0.1.0 — Internal MCP Release

_(MCP-Focused, Single-User Release for Internal Validation)_

---

### 1. Release Overview

- **Release ID**: `v0.1.0`
- **Name**: Internal MCP Release
- **Release Type**: Not Marketed (production deployment without marketing activities)
- **Goal**: Validate deterministic ingestion, extraction, entity resolution, event generation, and graph construction through MCP-only access. Enable internal validation via Cursor and ChatGPT integration without UI or multi-user infrastructure.
- **Priority**: P0 (critical for MVP foundation)
- **Target Ship Date**: When ready
- **Marketing Required**: No (not marketed release)
- **Deployment**: Production (neotoma.io)

#### 1.1 Canonical Specs (Authoritative Sources)

- **Manifest**: `docs/NEOTOMA_MANIFEST.md`
- **Internal MCP Release Spec**: `docs/specs/INTERNAL_MCP_RELEASE.md`
- **MVP Feature Units**: `docs/specs/MVP_FEATURE_UNITS.md`
- **MCP Specification**: `docs/specs/MCP_SPEC.md`

This release plan coordinates the internal MCP release scope into a concrete release plan.

---

### 2. Scope

#### 2.1 Included Feature Units (P0 Critical Path)

**Blockchain-Ready Architecture Foundation:**

- `FU-050`: Event-Sourcing Foundation (append-only event log, reducers, historical replay)
- `FU-051`: Repository Abstractions (EventRepository, StateRepository interfaces)
- `FU-052`: Reducer Versioning (version metadata, reducer registry)
- `FU-053`: Cryptographic Schema Fields (signer_public_key, signature fields)
- `FU-054`: Hash Chaining Schema Fields (previous_event_hash, event_hash fields)

**Observation Architecture (Building on Event-Sourcing Foundation):**

- `FU-055`: Observation Storage Layer (observations, snapshots, raw_fragments tables)
- `FU-056`: Enhanced Reducer Engine for Observations (merge strategies, provenance)
- `FU-057`: Schema Registry Service (config-driven schemas, versioning)
- `FU-058`: Observation-Aware Ingestion Pipeline (observation creation, reducer invocation)
- `FU-059`: Relationship Types (first-class typed relationships)
- `FU-061`: MCP Actions for Observation Architecture (snapshot, provenance, relationships)

**Optional (P1):**

- `FU-060`: Automated Schema Promotion (optional, pattern detection from raw_fragments)

**Core Backend Services:**

- `FU-000`: Database Schema v1.0 (single-user, no RLS, includes state_events table)
- `FU-002`: Configuration Management
- `FU-100`: File Analysis Service (rule-based extraction, type detection analytics)
- `FU-101`: Entity Resolution Service
- `FU-102`: Event Generation Service
- `FU-103`: Graph Builder Service
- `FU-105`: Search Service (structured search only, deterministic ranking)

**MCP Actions:**

- `FU-200`: MCP Server Core
- `FU-201`: MCP Action — `store_record` (emits events, applies reducers)
- `FU-202`: MCP Action — `retrieve_records`
- `FU-203`: MCP Action — `update_record` (emits events, applies reducers)
- `FU-204`: MCP Action — `delete_record` (emits events, applies reducers)
- `FU-205`: MCP Action — `upload_file`
- `FU-206`: MCP Action — `get_file_url`
- `FU-061`: MCP Actions — `get_entity_snapshot`, `list_observations`, `get_field_provenance`, `create_relationship`, `list_relationships`

**Optional (P1):**

- `FU-104`: Embedding Service (optional, not required for validation)
- `FU-208`: MCP Provider Integrations (optional, Gmail testing)

#### 2.2 Explicitly Excluded

- All UI components (FU-300 through FU-307)
- Multi-user infrastructure (FU-700, FU-701, FU-702, FU-703)
- Onboarding flow (FU-400-403)
- Plaid integration (FU-207, post-MVP)
- Semantic/vector search (structured search only)
- LLM-based extraction (rule-based only)

---

### 3. Release-Level Acceptance Criteria

#### 3.1 Product

- Core workflow: **upload_file → extraction → observation creation → reducer execution → snapshot computation → entity resolution → event generation → graph insertion → retrieve_records** is functional via MCP.
- MCP actions return structured, deterministic responses.
- Entity resolution validated: same entity name → same entity_id across multiple uploads.
- Timeline events validated: date fields → chronological events.
- **4-layer model operational**: Document → Entity → Observation → Snapshot data flow validated.
- **Multi-source entity resolution**: Multiple observations about same entity merge correctly via reducers.
- **Provenance tracking**: Every snapshot field traces to source observations and documents.

#### 3.2 Technical

- Deterministic ingestion and extraction for PDF, JPG, PNG (100% reproducible, 100 runs).
- Graph integrity: **0 orphans**, **0 cycles** in memory graph.
- Deterministic search ranking (same query + same DB state → same order).
- **Event-sourcing foundation operational**: Events emitted for all state changes, reducers applied, historical replay functional.
- **Repository abstractions in place**: Domain logic isolated from storage via repository interfaces.
- **Type detection analytics**: Unknown schema types tracked in `extraction_metadata` and telemetry events (forward-compatible with E2EE).
- **Observation layer operational**: Observations created during ingestion, snapshots computed by reducers.
- **Reducer determinism validated**: Same observations + merge rules → same snapshot (100 runs).
- **Schema registry functional**: Config-driven schemas loaded and applied.
- **Relationship types operational**: First-class typed relationships (PART_OF, CORRECTS, etc.).
- All P0 Feature Units listed above are `completed` with passing tests.
- 100% test coverage on critical path (ingestion, extraction, observation creation, reducer execution, entity resolution, events, graph builder, search, event-sourcing, repositories).
- MCP server operational with all core actions including observation architecture actions (using event-sourcing).

#### 3.3 Business

- Internal validation successful via Cursor and ChatGPT MCP integration.
- Core capabilities validated before building UI and multi-user infrastructure.

---

### 4. Cross-FU Integration Scenarios (High-Level)

These scenarios must pass end-to-end before v0.1.0 is approved:

1. **File Upload → Extraction → Query Flow**

   - Upload PDF via MCP `upload_file` action.
   - System extracts fields via rule-based extraction (FU-100).
   - Entities resolved deterministically (FU-101).
   - Events generated and inserted into graph (FU-102, FU-103).
   - Query records via `retrieve_records` with deterministic ranking (FU-105).

2. **Entity Resolution Validation**

   - Upload two documents containing "Acme Corp" and "ACME CORP".
   - Verify both records link to same entity_id (canonical resolution).

3. **Timeline Event Validation**

   - Upload document with date fields.
   - Verify events generated with correct timestamps.
   - Query events chronologically.

4. **Graph Integrity Validation**

   - Upload multiple documents.
   - Verify 0 orphan nodes, 0 cycles in graph.
   - Verify transactional inserts (all-or-nothing).

5. **Determinism Validation**

   - Upload same file 100 times.
   - Verify identical extraction, entity IDs, event IDs.
   - Verify same query returns same order.

6. **Event-Sourcing Validation**

   - Create/update/delete records via MCP.
   - Verify events emitted to `state_events` table.
   - Verify state reconstructed via reducers matches direct DB state.
   - Verify historical replay: get record state at specific timestamp.

7. **Repository Abstraction Validation**

   - Verify domain services use repository interfaces (no direct DB access).
   - Verify file-based repository implementations functional.

8. **Observation Architecture Validation**

   - Upload document via MCP `upload_file` action.
   - Verify observations created for each entity.
   - Verify reducer computes snapshots with provenance.
   - Verify multiple observations about same entity merge correctly.
   - Query entity snapshot via `get_entity_snapshot` MCP action.
   - Trace field provenance via `get_field_provenance` MCP action.

9. **Multi-Source Entity Resolution Validation**

   - Upload two documents about same entity from different sources.
   - Verify observations created for each.
   - Verify snapshot correctly merges observations.
   - Verify provenance traces to both documents.

10. **Relationship Types Validation**
    - Create typed relationships (PART_OF, CORRECTS, etc.) via MCP.
    - Verify graph traversal queries work.
    - Verify relationship metadata preserved.

The detailed test specifications for these flows live in `docs/releases/in_progress/v0.1.0/integration_tests.md`.

---

### 5. Deployment and Rollout Strategy

- **Deployment Target**: Production (neotoma.io)
  - All releases deploy to production at neotoma.io
  - Deploy MCP server to neotoma.io
  - MCP endpoints accessible via MCP protocol
- **Marketing Strategy**: Not Marketed
  - No pre-launch marketing activities
  - No post-launch marketing activities
  - No user acquisition campaigns
  - No announcement or promotion
  - Release deployed silently to production
- **Rollback Plan**: Revert code changes and redeploy to neotoma.io

---

### 6. Post-Release Validation

- Validate core capabilities via MCP integration:
  - Cursor integration tested (upload_file, retrieve_records)
  - ChatGPT integration tested (store_record, retrieve_records)
  - Entity resolution validated
  - Event generation validated
  - Graph integrity validated
  - Search determinism validated

---

### 7. Success Criteria

**Internal Release is Complete When:**

1. ✅ All core MCP actions functional (using event-sourcing)
2. ✅ File upload → extraction → observation creation → reducer execution → graph insertion working end-to-end
3. ✅ Entity resolution validated (canonical IDs)
4. ✅ Event generation validated (timeline events)
5. ✅ Graph integrity validated (0 orphans, 0 cycles)
6. ✅ Search deterministic (same query → same order)
7. ✅ **Event-sourcing foundation operational** (events emitted, reducers applied, historical replay functional)
8. ✅ **Repository abstractions in place** (domain logic isolated from storage)
9. ✅ **Observation layer operational** (observations created, snapshots computed, provenance tracked)
10. ✅ **4-layer model functional** (Document → Entity → Observation → Snapshot)
11. ✅ **Reducer determinism validated** (same observations → same snapshot)
12. ✅ **Relationship types operational** (PART_OF, CORRECTS, etc.)
13. ✅ Cursor integration tested (upload_file, retrieve_records, get_entity_snapshot)
14. ✅ ChatGPT integration tested (store_record, retrieve_records, get_entity_snapshot)
15. ✅ All critical path tests passing (100% coverage)
16. ✅ Determinism validated (100 runs, same input → same output)

---

### 8. Status

- **Current Status**: `planning`
- **Release Type**: Not Marketed
- **Deployment**: Production (neotoma.io)
- **Owner**: Mark Hendrickson
- **Notes**:
  - Not marketed release - deploys to production without marketing activities
  - All releases deploy to production at neotoma.io
  - No UI or multi-user infrastructure required.
  - Focus on MCP-only validation of core Truth Layer capabilities.
  - Type detection analytics implemented for schema expansion insights (see `type_detection_analytics.md`).
  - Observation architecture builds on event-sourcing foundation (FU-050 through FU-054).
  - Four-layer truth model (Document → Entity → Observation → Snapshot) enables multi-source entity resolution and full provenance tracking.

---

### 9. Related Documentation

- `type_detection_analytics.md` — Type detection analytics strategy (forward-compatible with E2EE)
- `integration_tests.md` — Cross-FU integration test specifications
- `execution_schedule.md` — Detailed batch execution plan
- `manifest.yaml` — Feature Unit manifest and dependencies
- `fu_spec_status.md` — Feature Unit specification status (which FUs have standalone specs)

---

### 10. Feature Unit Specifications

**Specification Sources:**

- **Standalone Specs:** FU-050 through FU-054 have standalone spec files in `docs/feature_units/completed/FU-XXX/`
- **MVP_FEATURE_UNITS.md:** All other FUs have specifications in `docs/specs/MVP_FEATURE_UNITS.md`

**See:** `fu_spec_status.md` for complete status of all FUs.

---
