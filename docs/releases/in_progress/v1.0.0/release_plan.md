## Release v1.0.0 — MVP

_(Deterministic Truth Layer MVP Release Plan)_

---

### 1. Release Overview

- **Release ID**: `v1.0.0`
- **Name**: MVP
- **Goal**: Ship the first production-capable Neotoma Truth Layer with deterministic ingestion, extraction, entity resolution, event generation, memory graph, MCP access, and minimal UI to support Tier 1 ICP workflows.
- **Priority**: P0 (critical)
- **Target Ship Date**: 2025-03-01 (tentative)

#### 1.1 Canonical Specs (Authoritative Sources)

- **Manifest**: `docs/NEOTOMA_MANIFEST.md`
- **MVP Overview**: `docs/specs/MVP_OVERVIEW.md`
- **General Requirements** (ingestion + UI): `docs/specs/GENERAL_REQUIREMENTS.md`
- **MVP Feature Units**: `docs/specs/MVP_FEATURE_UNITS.md`
- **MVP Execution Plan**: `docs/specs/MVP_EXECUTION_PLAN.md`

This release plan **does not duplicate** those documents. It coordinates them into a concrete release.

---

### 2. Scope

#### 2.1 Included Feature Units (P0 Critical Path)

As of this plan, the following FUs are in scope for v1.0.0 (MVP), derived from `MVP_FEATURE_UNITS.md` and `MVP_EXECUTION_PLAN.md`:

- `FU-100`: File Analysis Service Update (remove LLM, add rule-based extraction)
- `FU-101`: Entity Resolution Service
- `FU-102`: Event Generation Service
- `FU-103`: Graph Builder Service
- `FU-105`: Search Service (deterministic ranking)
- `FU-300`: Design System Implementation (core UI foundation)
- `FU-700`: Authentication UI (Supabase Auth integration)
- `FU-701`: RLS Implementation (row-level security)

These may be extended with additional P1/P2 FUs if explicitly added later.

#### 2.2 Explicitly Excluded (Post-MVP)

- LLM extraction (any Truth Layer extraction using LLMs)
- Semantic search (vector similarity, hybrid search)
- Plaid integration and other financial provider syncs
- X (Twitter) and Instagram integrations
- Real-time collaboration

These are documented as post-MVP features and **MUST NOT** block v1.0.0.

---

### 3. Release-Level Acceptance Criteria

#### 3.1 Product

- Core workflow: **upload → ingestion → extraction → entity resolution → event generation → memory graph → timeline → AI query via MCP** is functional for Tier 1 ICPs.
- UI surfaces:
  - Records list and detail views functional and usable.
  - Timeline view present and correctly ordered.
  - Basic upload UI separated from chat and usable.
- Empty states and error states present and understandable for all main views.

#### 3.2 Technical

- Deterministic ingestion and extraction for all supported file types (PDF, JPG, PNG, text, CSV/spreadsheet) per `GENERAL_REQUIREMENTS.md`.
- Deterministic OCR per manifest and ingestion docs (same image → same text; version pinned; explicit low-confidence handling).
- No LLM extraction in Truth Layer (verified by FU-100.5 checks).
- Graph integrity: **0 orphans**, **0 cycles** in memory graph.
- Deterministic search ranking (same query + same DB state → same order).
- All P0 Feature Units listed above are `completed` with passing tests.
- 100% test coverage on critical path (ingestion, extraction, entity resolution, events, graph builder, search).

#### 3.3 Business

- DAU ≥ 10 at launch (pilot users).
- ≥ 100 records ingested in first week (across test + pilot tenants).
- Metrics instrumentation in place for:
  - Upload success rate
  - P95 upload latency
  - Orphan/cycle counts
  - Search latency

---

### 4. Cross-FU Integration Scenarios (High-Level)

These scenarios must pass end-to-end before v1.0.0 is approved:

1. **Financial Document Ingestion Flow**

   - Upload multi-page bank/credit statement PDF from `~/Desktop/imports/`.
   - System extracts transactions via rule-based extraction (FU-100).
   - Entities (vendors, accounts) are resolved deterministically (FU-101).
   - Events (transactions) generated and inserted into graph (FU-102, FU-103).
   - Transactions and statements appear in search and UI with deterministic ranking (FU-105, FU-300).

2. **CSV/Spreadsheet Ingestion Flow**

   - Upload CSV or XLSX (e.g., `capital-one-2025.csv`, `ibercaja-2025.xlsx`).
   - One file-level Record + one row-level Record per non-header row created per schema (FU-100).
   - Entities/events generated and linked correctly (FU-101, FU-102, FU-103).
   - Row-level records discoverable via search and visible in UI (FU-105, FU-300).

3. **Multi-Event Document Flow**

   - Upload multi-transaction PDF, or workout log.
   - Multiple Events/Records created per logical event, with proper linkage to file-level Record.
   - Timeline view shows correct ordering (FU-102, FU-103, FU-300).

4. **Auth + RLS Flow**

   - User A and User B sign up and log in via Supabase Auth UI (FU-700).
   - Each user uploads a document; neither can see the other’s records (FU-701).

5. **MCP AI Access Flow**
   - From a supported MCP client (e.g., ChatGPT/Claude), call store/retrieve actions.
   - Verify ingestion, retrieval, and search results match UI and DB.

The detailed test specifications for these flows live in `docs/releases/in_progress/v1.0.0/integration_tests.md`.

---

### 5. Deployment and Rollback Strategy

- **Deployment Strategy**: `staging_first`
  - Deploy to staging, run full integration and smoke tests.
  - If all pass, deploy to production.
- **Rollback Plan**:
  - Tag current production state before deploy.
  - On failure, revert application to previous tag and, if required, restore DB from last known-good snapshot.

---

### 6. Post-Release Monitoring

- Monitor:
  - Upload success rate (target ≥ 95%).
  - P95 upload latency (target < 5s).
  - Search latency (target < 500ms P95).
  - Graph integrity metrics (orphan/cycle counts).
  - DAU (target ≥ 10).
- Alerts configured for:
  - Upload success rate < 90%.
  - P95 upload latency > 8s.
  - Any orphan or cycle detected in graph.

---

### 7. Status

- **Current Status**: `planning`
- **Owner**: Mark Hendrickson
- **Notes**:
  - Release workflow standard defined in `docs/feature_units/standards/release_workflow.md`.
  - Next step: generate `manifest.yaml` and `execution_schedule.md` from current FU inventory.


