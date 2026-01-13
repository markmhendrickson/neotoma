name: Fix Doc Inconsistencies
overview: Resolve documentation inconsistencies between v0.2.0 release plan and foundational docs by updating determinism doctrine, sources.md scope, observation_architecture provenance chain, and consolidating validation contract.
todos:
  - id: fix-determinism
    content: Remove LLM prohibition from determinism.md checklist and forbidden patterns
    status: completed
  - id: scope-sources
    content: Remove upload_queue, storage_usage, timeout handling from sources.md
    status: completed
  - id: update-provenance
    content: Update observation_architecture.md provenance chain to include InterpretationRun
    status: completed
  - id: add-validation
    content: Add consolidated ingestion validation contract section to sources.md
    status: completed
# Documentation Consistency Fixes
Align foundational docs with the streamlined v0.2.0 "Minimal Ingestion + Correction Loop" scope.
## 1. Fix Determinism Doctrine Contradictions
**File:** [`docs/architecture/determinism.md`](docs/architecture/determinism.md)
**Changes:**
- Remove "FORBIDDEN (in MVP)" from Section 2.6 (LLM Outputs) — replace with guidance that AI interpretation is allowed but bounded
- Update "Code Review Checklist" (Section 8) — remove "No LLM extraction in MVP (rule-based only)"
- Update "Forbidden Patterns" in Agent Instructions — remove "LLM-based extraction (MVP)"
- Add forward reference to Section 1.2-1.3 (the corrected determinism table and auditability section)
The existing table at lines 46-59 is correct; the issue is stale text in later sections.
## 2. Scope sources.md to v0.2.0 Minimal
**File:** [`docs/subsystems/sources.md`](docs/subsystems/sources.md)
**Changes:**
- Remove Section 7 (Upload Queue) entirely — add note that async retry is deferred to v0.3.0
- Simplify Section 6 (Quota Enforcement) — replace with "simple hard-coded limit" per v0.2.0 scope
- Remove `storage_usage` table schema (Section 6.3) — note deferred to v0.3.0
- Remove Section 3.4 (Timeout Handling) — note deferred to v0.3.0
- Update `interpretation_runs` schema (Section 3.1) — remove `timeout_at`, `heartbeat_at` columns
**Add "Deferred Features" section** listing what moves to v0.3.0:
- Upload queue + retry worker
- storage_usage table
- Timeout/heartbeat handling
- Strict quota enforcement
## 3. Update Observation Architecture Provenance
**File:** [`docs/subsystems/observation_architecture.md`](docs/subsystems/observation_architecture.md)
**Changes:**
- Update Section 1.1 model to show:
  ```
  Source → InterpretationRun (with config) → Observation → EntitySnapshot
  ```
- Update mermaid diagram to include InterpretationRun node
- Update Section 4.1 Provenance Chain to explicitly include interpretation_run
- Add reference to `sources.md` for interpretation config requirements
## 4. Add Ingestion Validation Contract Section
**File:** [`docs/subsystems/sources.md`](docs/subsystems/sources.md) (new Section 10)
**Add consolidated validation contract:**
- All AI-produced records MUST pass schema validation before observations are written
- Failure paths: reject with error code (not quarantine)
- Schema registry is single source of truth
- Unknown fields route to `raw_fragments` (not silently dropped)
- Provenance mandatory: `source_id` and `interpretation_run` enforced via FK + NOT NULL
This consolidates scattered validation requirements into one authoritative section.
## Files Changed
| File | Changes |
|------|---------|
| `docs/architecture/determinism.md` | Remove LLM prohibition from checklist/forbidden patterns |
| `docs/subsystems/sources.md` | Remove deferred features, add validation contract |
| `docs/subsystems/observation_architecture.md` | Update provenance chain to include InterpretationRun |