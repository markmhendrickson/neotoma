## Release v1.0.0 — Execution Schedule

_(Generated from FU dependencies; follows `release_workflow.md` pattern)_

---

### Batches Overview

Batching is derived from the dependency graph in `manifest.yaml`. All FUs in the same batch can execute **in parallel**; batches must execute **in order**.

#### Batch 0 — No Dependencies

- **Feature Units**:
  - `FU-100` — File Analysis Service Update
  - `FU-300` — Design System Implementation
  - `FU-700` — Authentication UI
- **Depends On**: _none_
- **Notes**:
  - FU-100 is critical-path for ingestion/extraction.
  - FU-300 and FU-700 can proceed independently in parallel.

#### Batch 1 — Depend on FU-100

- **Feature Units**:
  - `FU-101` — Entity Resolution Service
  - `FU-102` — Event Generation Service
- **Depends On**:
  - `FU-100`
- **Notes**:
  - Both require extraction outputs from FU-100.
  - Can execute in parallel once FU-100 is complete.

#### Batch 2 — Depend on FU-101 + FU-102

- **Feature Units**:
  - `FU-103` — Graph Builder Service
- **Depends On**:
  - `FU-101`
  - `FU-102`
- **Notes**:
  - Consolidates Records, Entities, and Events into transactional graph inserts.

#### Batch 3 — Depend on FU-103 and/or FU-700

- **Feature Units**:
  - `FU-105` — Search Service (Deterministic Ranking)
  - `FU-701` — RLS Implementation
- **Depends On**:
  - `FU-103` (for `FU-105`)
  - `FU-700` (for `FU-701`)
- **Notes**:
  - `FU-105` must see stable graph; `FU-701` secures data once auth exists.

---

### Suggested Parallelization

Assuming 2–3 active dev/agent lanes, suggested parallelization:

- **Phase 1 (Batch 0)** — Estimated: 2-3 weeks
  - Lane A: `FU-100` (File Analysis Service Update) — 1-2 weeks
  - Lane B: `FU-300` (Design System Implementation) — 2-3 weeks
  - Lane C: `FU-700` (Authentication UI) — 1 week
  - **Bottleneck**: FU-300 (longest in batch)
  - **Timeline**: Week 0-3

- **Phase 2 (Batch 1)** — Estimated: 2-3 weeks
  - Lane A: `FU-101` (Entity Resolution Service) — 2 weeks
  - Lane B: `FU-102` (Event Generation Service) — 2-3 weeks
  - **Bottleneck**: FU-102 (longest in batch)
  - **Timeline**: Week 3-6

- **Phase 3 (Batch 2)** — Estimated: 2-3 weeks
  - Lane A/B: `FU-103` (Graph Builder Service) — 2-3 weeks
  - **Timeline**: Week 6-9

- **Phase 4 (Batch 3)** — Estimated: 2 weeks
  - Lane A: `FU-105` (Search Service) — 1-2 weeks
  - Lane B: `FU-701` (RLS Implementation) — 1-2 weeks
  - **Timeline**: Week 9-11

**Total Estimated Development Time**: 11-14 weeks (assumes 2-3 weeks per batch)

**Overall Timeline**:
- **Week -8 to -5**: Pre-release discovery (3-4 weeks)
- **Week -5 to -1**: Discovery synthesis, go/no-go decision, scope refinement (1 week)
- **Week -4 to 0**: Pre-launch marketing activities (overlaps with Week -5 to -1)
- **Week 0 to 11**: Development execution (11-14 weeks)
- **Week 11 to 12**: Cross-release integration testing (1 week)
- **Week 12**: Pre-release sign-off, staging deployment, pre-launch marketing finalization
- **Week 13**: Production deployment (Day 0)
- **Week 13 to 17**: Post-launch marketing and validation (4 weeks)

**Target Ship Date**: Week 13 from development start = 2025-03-01 (adjustable based on discovery findings)

---

### Checkpoints

- **Checkpoint 0 (Planning)**: This schedule is generated and approved before execution.
- **Checkpoint 1 (Mid-Release Review)**:
  - Configured after **Batch 1** (see `manifest.yaml`).
  - Occurs once `FU-100`, `FU-101`, and `FU-102` complete and initial integration tests pass.
- **Checkpoint 2 (Pre-Release Sign-Off)**:
  - After all batches complete and full integration suite passes.

---

### Integration Tests per Batch (High-Level)

- **After Batch 0** (Week 3):

  - Basic ingestion smoke tests (FU-100):
    - Upload PDF, CSV, image
    - Verify extraction produces valid JSON
    - Test determinism (3x upload → identical output)
  - Visual/UI-level checks for design system (FU-300):
    - Component rendering tests
    - Responsive layout validation
  - Basic auth flow tests (sign up / login) for FU-700:
    - Signup flow
    - Login flow
    - Password reset flow
  
  **Continuous Discovery**: 2-3 user interviews on upload experience

- **After Batch 1** (Week 6):

  - Ingestion → extraction → entity resolution → event generation path:
    - Upload financial statements and CSVs
    - Verify entities created and deduplicated correctly
    - Verify events created with correct timestamps and linkage
    - Test determinism across full pipeline
  
  **Mid-Release Checkpoint (Checkpoint 1)**: Review progress, validate integration
  
  **Continuous Discovery**: Prototype testing with 3-5 users on entity/event views

- **After Batch 2** (Week 9):

  - Graph integrity:
    - Verify 0 orphans after batch inserts
    - Verify 0 cycles after batch inserts
    - Test transactional insert behavior under failure scenarios
    - Test concurrent insert handling
  
  **Continuous Discovery**: 2-3 user interviews on timeline/graph views

- **After Batch 3** (Week 11):

  - End-to-end flows:
    - Upload → extraction → graph → search → UI → MCP
    - Multi-user flows with RLS enforced
    - All IT-001 through IT-005 from `integration_tests.md`
  
  **Continuous Discovery**: Beta testing with discovery participants (Week 11-12)

See `integration_tests.md` for detailed test definitions.




