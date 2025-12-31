## Release v1.0.0 — Execution Schedule
**Note:** This schedule assumes discovery is complete (Week -8 to -5) and go decision made. For discovery planning, see `discovery_plan.md` and related discovery documents.
**Estimation Methodology:** See `docs/conventions/estimation_methodology.md` for velocity-based estimation approach. Estimates revised Dec 11, 2025 based on v0.1.0 actual velocity (26 FUs in 2-3 days).
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
### Suggested Parallelization
**Assumptions:**
- All timeline estimates assume Cursor agent execution (not human developers)
- Cloud agents execute in parallel via Cursor Background Agents API (see `docs/feature_units/standards/multi_agent_orchestration.md`)
- Execution limits: `max_parallel_fus: 3`, `max_high_risk_in_parallel: 1`
**With Cloud Agent Parallelization (max 3 agents):**
**Estimation Methodology:** Based on v0.1.0 actual velocity (26 FUs completed in 2-3 days = ~8-13 FUs/day). Estimates account for existing foundation and agent parallelization.
**Note:** FU-100, FU-101, FU-102, FU-103, FU-105 are already complete from v0.1.0. Only FU-300, FU-700, and FU-701 require new work.
- **Phase 1 (Batch 0)** — Estimated: 1 day
  - Cloud Agents: `FU-100` ✅ (already complete), `FU-300` (0.5 days design system polish), `FU-700` (0.5-1 day auth UI) in parallel
  - **Bottleneck**: FU-700 (longest in batch)
  - **Timeline**: Day 0-1
  - **Note**: FU-100 already complete from v0.1.0 (rule-based extraction implemented)
- **Phase 2 (Batch 1)** — Estimated: 0 days
  - Cloud Agents: `FU-101` ✅ (already complete), `FU-102` ✅ (already complete)
  - **Timeline**: Day 0 (no work needed)
  - **Note**: Both FUs already complete from v0.1.0
- **Phase 3 (Batch 2)** — Estimated: 0 days
  - Sequential: `FU-103` ✅ (already complete)
  - **Timeline**: Day 0 (no work needed)
  - **Note**: FU-103 already complete from v0.1.0
- **Phase 4 (Batch 3)** — Estimated: 1-2 days
  - Cloud Agents: `FU-105` ✅ (already complete), `FU-701` (1-2 days RLS implementation) in parallel
  - **Bottleneck**: FU-701 (only work item in batch)
  - **Timeline**: Day 1-2
  - **Note**: FU-105 already complete from v0.1.0. FU-701 requires migration, RLS policies, service updates, and MCP action updates.
**Total Estimated Development Time**: 2-3 days (with cloud agent parallelization)
**Rationale:** v0.1.0 demonstrated 26 FUs in 2-3 days. v1.0.0 requires only 3 new FUs (FU-300 polish, FU-700 auth UI, FU-701 RLS), with remaining FUs already complete.
**Overall Timeline** (as of December 12, 2025):
**Parallel Pre-Development Phase (3-4 weeks):**
- **Week 0** (Dec 12-19, 2025): Build discovery lead sourcing tools, configure API credentials, begin discovery recruitment
- **Week 1-4** (Dec 19, 2025 - Jan 9, 2026): **Discovery AND Pre-launch marketing in parallel** (3-4 weeks)
  
  **Discovery Activities (parallel):**
  - Week 1 (Dec 19-26): Execute lead sourcing tools, launch screening survey, begin recruitment
  - Week 1-3 (Dec 19 - Jan 2): Value discovery interviews (13 participants)
  - Week 2-3 (Dec 26 - Jan 2): Usability discovery testing (8 participants)
  - Week 3-4 (Jan 2-9): Business viability discovery interviews (8 participants)
  
  **Pre-Launch Marketing Activities (parallel):**
  - Week 1-4 (Dec 19 - Jan 9): Waitlist building campaigns (Twitter, email, community, content)
  - Week 2-4 (Dec 26 - Jan 9): Early access beta signups (invite discovery participants + waitlist top users)
  - Week 3-4 (Jan 2-9): Content teasers (blog posts, demo videos, Twitter threads)
  - Week 3-4 (Jan 2-9): Feature teaser emails to existing users (if any)
- **Week 5** (Jan 9-16, 2026): Discovery synthesis + Marketing finalization (1 week)
  - Discovery synthesis, go/no-go decision, scope refinement
  - Marketing metrics review, waitlist quality assessment
  - Finalize pre-launch marketing materials
**Development Phase (1-2 weeks):**
- **Week 6** (Jan 16-23, 2026): Development execution (2-3 days with cloud agents) + Cross-release integration testing (3-5 days)
- **Week 7** (Jan 23-30, 2026): Pre-release sign-off, staging deployment, production deployment (Day 0, adjustable based on testing)
**Post-Launch Phase:**
- **Week 7-11** (Jan 30 - Feb 27, 2026): Post-launch marketing and validation (4 weeks)
**Target Ship Date**: January 23-30, 2026 (Week 7, adjustable based on discovery findings and testing)
**Note:** Discovery and pre-launch marketing run in parallel (Week 1-4), reducing total pre-development time from 5-6 weeks to 4-5 weeks. Development starts immediately after both complete (Week 6).
### Checkpoints
- **Checkpoint 0 (Planning)**: This schedule is generated and approved before execution.
- **Checkpoint 1 (Mid-Release Review)**:
  - Configured after **Batch 1** (see `manifest.yaml`).
  - Occurs once `FU-100`, `FU-101`, and `FU-102` complete and initial integration tests pass.
- **Checkpoint 2 (Pre-Release Sign-Off)**:
  - After all batches complete and full integration suite passes.
### Integration Tests per Batch (High-Level)
- **After Batch 0** (Day 1):
  - Basic ingestion smoke tests (FU-100) ✅:
    - Already validated in v0.1.0
  - Visual/UI-level checks for design system (FU-300):
    - Component rendering tests
    - Responsive layout validation
  - Basic auth flow tests (sign up / login) for FU-700:
    - Signup flow
    - Login flow
    - Password reset flow
  **Continuous Discovery**: 2-3 user interviews on upload experience
- **After Batch 1** (Day 0):
  - Ingestion → extraction → entity resolution → event generation path ✅:
    - Already validated in v0.1.0 (IT-001 through IT-011 passing)
  **Mid-Release Checkpoint (Checkpoint 1)**: Review progress, validate integration
  **Continuous Discovery**: Prototype testing with 3-5 users on entity/event views
- **After Batch 2** (Day 0):
  - Graph integrity ✅:
    - Already validated in v0.1.0 (IT-004 passing, 0 orphans/cycles)
  **Continuous Discovery**: 2-3 user interviews on timeline/graph views
- **After Batch 3** (Day 2-3):
  - End-to-end flows:
    - Upload → extraction → graph → search → UI → MCP ✅ (validated in v0.1.0)
    - Multi-user flows with RLS enforced (new for v1.0.0)
    - All IT-001 through IT-005 from `integration_tests.md` ✅ (IT-001 through IT-011 already passing)
  **Continuous Discovery**: Beta testing with discovery participants
See `integration_tests.md` for detailed test definitions.
