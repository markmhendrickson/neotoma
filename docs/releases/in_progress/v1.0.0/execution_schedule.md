## Release v1.0.0 — Execution Schedule

_(Generated from FU dependencies; follows `release_workflow.md` pattern)_

**Note:** This schedule assumes discovery is complete (Week -8 to -5) and go decision made. For discovery planning, see `discovery_plan.md` and related discovery documents.

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

**Assumptions:**

- All timeline estimates assume Cursor agent execution (not human developers)
- Cloud agents execute in parallel via Cursor Background Agents API (see `docs/feature_units/standards/multi_agent_orchestration.md`)
- Execution limits: `max_parallel_fus: 3`, `max_high_risk_in_parallel: 1`

**With Cloud Agent Parallelization (max 3 agents):**

Estimates follow methodology from `docs/specs/MVP_FEATURE_UNITS.md`: spec (1-3h) + implementation (2-8h) + testing (1-4h) + docs (0.5-1h) + 20% review overhead

- **Phase 1 (Batch 0)** — Estimated: 1.5-2 weeks

  - Cloud Agents: `FU-100` (2.5 days), `FU-300` (1.5 weeks design system), `FU-700` (1 week auth UI) in parallel
  - **Bottleneck**: FU-300 (longest in batch)
  - **Timeline**: Week 0-2

- **Phase 2 (Batch 1)** — Estimated: 1 week

  - Cloud Agents: `FU-101` (1 day), `FU-102` (0.75 days) in parallel
  - **Bottleneck**: FU-101 (longest in batch)
  - **Timeline**: Week 2-3

- **Phase 3 (Batch 2)** — Estimated: 0.5 days

  - Sequential: `FU-103` (0.5 days)
  - **Timeline**: Week 3

- **Phase 4 (Batch 3)** — Estimated: 1 week
  - Cloud Agents: `FU-105` (0.5 days), `FU-701` (1 week RLS implementation) in parallel
  - **Bottleneck**: FU-701 (longest in batch)
  - **Timeline**: Week 3-4

**Total Estimated Development Time**: 3-4 weeks (with cloud agent parallelization, 25-35% reduction from sequential)

**Sequential Timeline (for comparison):** ~4-5 weeks

**Overall Timeline** (as of December 9, 2025):

- **Week -10 to -9** (Nov 25 - Dec 8, 2025): Build discovery lead sourcing tools, configure API credentials
- **Week -8 to -5** (Dec 9, 2025 - Jan 6, 2026): Pre-release discovery (3-4 weeks)
  - Week -8: Execute lead sourcing tools, launch screening survey, begin recruitment
  - Week -8 to -6: Value discovery interviews (13 participants)
  - Week -7 to -6: Usability discovery testing (8 participants)
  - Week -6 to -5: Business viability discovery interviews (8 participants)
- **Week -5 to -4** (Jan 6-13, 2026): Discovery synthesis, go/no-go decision, scope refinement (1 week)
- **Week -4 to 0** (Jan 6-13, 2026): Pre-launch marketing activities (overlaps with Week -5 to -4)
- **Week 0 to 4** (Jan 13 - Feb 10, 2026): Development execution (3-4 weeks with cloud agents)
- **Week 4 to 5** (Feb 10-17, 2026): Cross-release integration testing (1 week)
- **Week 5** (Feb 17, 2026): Pre-release sign-off, staging deployment, pre-launch marketing finalization
- **Week 6** (Feb 24, 2026): Production deployment (Day 0)
- **Week 6 to 10** (Feb 24 - Mar 24, 2026): Post-launch marketing and validation (4 weeks)

**Target Ship Date**: February 24, 2026 (Week 6 from development start, adjustable based on discovery findings)

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
