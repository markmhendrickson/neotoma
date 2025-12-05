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

- **Phase 1 (Batch 0)**:
  - Lane A: `FU-100`
  - Lane B: `FU-300`
  - Lane C: `FU-700`
- **Phase 2 (Batch 1)**:
  - Lane A: `FU-101`
  - Lane B: `FU-102`
- **Phase 3 (Batch 2)**:
  - Lane A/B: `FU-103`
- **Phase 4 (Batch 3)**:
  - Lane A: `FU-105`
  - Lane B: `FU-701`

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

- **After Batch 0**:

  - Basic ingestion smoke tests (FU-100).
  - Visual/UI-level checks for design system (FU-300).
  - Basic auth flow tests (sign up / login) for FU-700.

- **After Batch 1**:

  - Ingestion → extraction → entity resolution → event generation path:
    - Upload financial statements and CSVs.
    - Verify entities and events created and linked correctly.

- **After Batch 2**:

  - Graph integrity:
    - 0 orphans, 0 cycles.
    - Transactional insert behavior under failure scenarios.

- **After Batch 3**:
  - End-to-end flows:
    - Upload → extraction → graph → search → UI → MCP.
    - Multi-user flows with RLS enforced.

See `integration_tests.md` for detailed test definitions.


