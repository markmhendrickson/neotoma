## Release v1.0.0 — Status

---

### 1. Summary

- **Release ID**: `v1.0.0`
- **Name**: MVP
- **Status**: `planning` <!-- planning | in_progress | ready_for_deployment | deployed | completed -->
- **Release Type**: Marketed
- **Deployment**: Production (neotoma.io)
- **Owner**: Mark Hendrickson
- **Target Date**: 2026-01-23 (revised Dec 12, 2025: discovery + marketing parallel starting Dec 12, then 2-3 days development)
- **Marketing**: Yes (hybrid: pre-launch + post-launch)

### 1.1 Time Tracking

- **Development Start Date**: _[To be recorded when status changes to `in_progress`]_
- **Development Finish Date**: _[To be recorded when status changes to `ready_for_deployment`]_
- **Deployment Date**: _[To be recorded when status changes to `deployed`]_
- **Completion Date**: _[To be recorded when status changes to `completed`]_
- **Estimated Development Time**: 2-3 days (from `execution_schedule.md`)
- **Actual Development Time**: _[Calculated: Development Finish Date - Development Start Date]_
- **Estimation Accuracy**: _[Calculated: (Actual / Estimated) × 100%]_

---

### 2. Batch Progress

| Batch ID | Feature Units          | Status      | Notes                                    |
| -------- | ---------------------- | ----------- | ---------------------------------------- |
| 0        | FU-100, FU-300, FU-700 | not_started | FU-100 ✅ complete from v0.1.0          |
| 1        | FU-101, FU-102         | not_started | ✅ Complete from v0.1.0                  |
| 2        | FU-103                 | not_started | ✅ Complete from v0.1.0                  |
| 3        | FU-105, FU-701         | not_started | FU-105 ✅ complete from v0.1.0          |

---

### 3. Feature Unit Status

| FU ID  | Name                           | Status      | Notes                                    |
| ------ | ------------------------------ | ----------- | ---------------------------------------- |
| FU-100 | File Analysis Service Update   | ✅ Complete | Complete from v0.1.0 (rule-based extraction) |
| FU-101 | Entity Resolution Service      | ✅ Complete | Complete from v0.1.0 (with DB persistence) |
| FU-102 | Event Generation Service       | ✅ Complete | Complete from v0.1.0 (with DB persistence) |
| FU-103 | Graph Builder Service          | ✅ Complete | Complete from v0.1.0 (with integrity checks) |
| FU-105 | Search Service (Deterministic) | ✅ Complete | Complete from v0.1.0                     |
| FU-300 | Design System Implementation   | not_started | Foundation exists, needs polish (~0.5 days) |
| FU-700 | Authentication UI              | not_started | Supabase Auth integrated, UI needed (~0.5-1 day) |
| FU-701 | RLS Implementation             | not_started | Migration + policies + service updates (~1-2 days) |

_(Statuses mirror individual FU manifests / implementation reality; update as work proceeds.)_

---

### 4. Checkpoints

- **Checkpoint 0 — Release Planning**: `completed`
  - `release_plan.md` and `manifest.yaml` created.
  - Execution schedule defined in `execution_schedule.md`.
- **Checkpoint 1 — Mid-Release Review**: `pending`
  - Configured after Batch 1.
- **Checkpoint 2 — Pre-Release Sign-Off**: `pending`

---

### 5. Integration Test Status

| Test ID | Name                                  | Status  | Notes |
| ------- | ------------------------------------- | ------- | ----- |
| IT-001  | Financial Statement Ingestion Flow    | not_run |       |
| IT-002  | CSV/Spreadsheet Ingestion Flow        | not_run |       |
| IT-003  | Multi-Event Document to Timeline Flow | not_run |       |
| IT-004  | Auth + RLS Isolation Flow             | not_run |       |
| IT-005  | MCP AI Access Flow                    | not_run |       |

---

### 6. Decision Log

_(Timestamped record of scope changes, FU deferrals, priority shifts, and other mid-course corrections)_

| Date       | Decision                                                     | Rationale                                          |
| ---------- | ------------------------------------------------------------ | -------------------------------------------------- |
| 2025-02-10 | Release workflow pattern defined                             | Standardize multi-FU orchestration                 |
| 2025-02-10 | MVP specs remain in `docs/specs/`, referenced not duplicated | Avoid duplication, maintain single source of truth |
| 2025-12-11 | Revised v1.0.0 estimates based on v0.1.0 velocity            | v0.1.0 completed 26 FUs in 2-3 days; v1.0.0 requires only 3 new FUs |
| 2025-12-11 | Updated target date from Feb 24 to Jan 20                    | Reflects realistic 2-3 day development timeline   |

---

### 7. Release Planning Completeness

**Required Planning Documents:**

| Document                               | Status      | Notes                                                                                      |
| -------------------------------------- | ----------- | ------------------------------------------------------------------------------------------ |
| `release_plan.md`                      | ✅ Complete | Overview and coordination                                                                  |
| `manifest.yaml`                        | ✅ Complete | FU metadata, dependencies, schedule                                                        |
| `execution_schedule.md`                | ✅ Complete | Timeline estimates added                                                                   |
| `integration_tests.md`                 | ✅ Complete | Test specs defined                                                                         |
| `acceptance_criteria.md`               | ✅ Complete | Release-level acceptance criteria                                                          |
| `pre_mortem.md`                        | ✅ Complete | Failure mode analysis                                                                      |
| `deployment_strategy.md`               | ✅ Complete | Deployment and rollback procedures                                                         |
| `monitoring_plan.md`                   | ✅ Complete | Post-release monitoring and observability                                                  |
| `discovery_plan.md`                    | ✅ Complete | Discovery overview and coordination                                                        |
| `discovery_lead_sourcing_tools.md`     | ✅ Complete | Tools for sourcing participants from multiple platforms                                    |
| `discovery_filtering_criteria.md`      | ✅ Complete | Enhanced ICP matching criteria and scoring system                                          |
| `discovery_filtering_keywords.md`      | ✅ Complete | Complete keyword reference for all platforms                                               |
| `subscription_detection_strategy.md`   | ✅ Complete | Multi-method subscription detection strategy                                               |
| `cross_platform_signal_detection.md`   | ✅ Complete | Cross-platform signal detection strategy                                                   |
| `discovery_checklist.md`               | ✅ Complete | Complete checklist of all discovery needs                                                  |
| `value_discovery_plan.md`              | ✅ Complete | Value discovery details (enhanced screening questions)                                     |
| `usability_discovery_plan.md`          | ✅ Complete | Usability discovery details                                                                |
| `business_viability_discovery_plan.md` | ✅ Complete | Business viability discovery details                                                       |
| `feasibility_validation_plan.md`       | ✅ Complete | Feasibility validation details                                                             |
| `continuous_discovery_plan.md`         | ✅ Complete | Continuous discovery details                                                               |
| `participant_recruitment_log.md`       | ✅ Complete | Recruitment tracking (response rate strategies, early access strategy, outreach templates) |
| `marketing_plan.md`                    | ✅ Complete | Marketing overview and coordination                                                        |
| `pre_launch_marketing_plan.md`         | ✅ Complete | Pre-launch marketing details                                                               |
| `post_launch_marketing_plan.md`        | ✅ Complete | Post-launch marketing details                                                              |
| `marketing_segments_plan.md`           | ✅ Complete | Marketing segment definitions                                                              |
| `marketing_metrics_plan.md`            | ✅ Complete | Marketing metrics and tracking                                                             |
| `continuous_discovery_log.md`          | ✅ Complete | Template created                                                                           |

**Planning Status:** ✅ All required documents complete

**Discovery Infrastructure Status:**

- ✅ Lead sourcing tools documented (`discovery_lead_sourcing_tools.md`)
- ✅ Filtering criteria defined (`discovery_filtering_criteria.md`)
- ✅ Filtering keywords cataloged (`discovery_filtering_keywords.md`)
- ✅ Subscription detection strategy defined (`subscription_detection_strategy.md`)
- ✅ Cross-platform signal detection strategy defined (`cross_platform_signal_detection.md`)
- ✅ Response rate optimization strategies documented (`participant_recruitment_log.md`)
- ✅ Early access incentive strategy defined (`participant_recruitment_log.md`)

**Next Checkpoint:** Checkpoint 0.5 — Pre-Release Discovery + Pre-Launch Marketing (Week -8 to -5, parallel execution)

**Pre-Discovery Tasks (Week -10 to -9):**

- Build discovery lead sourcing tools (LinkedIn, Twitter/X, Indie Hackers, GitHub, Reddit/Discord)
- Configure API credentials for agent-driven execution
- Review filtering criteria and keywords

**Parallel Execution Strategy:**

- **Discovery** (Week -8 to -5): Value, usability, and business viability interviews
- **Pre-Launch Marketing** (Week -8 to -5, parallel): Waitlist building, early access beta, content teasers
- **Synthesis** (Week -5 to -4): Discovery synthesis + marketing finalization
- **Development** (Week 0): Starts immediately after both complete (2-3 days)

---

### 8. Notes

- Release workflow pattern defined in `docs/feature_units/standards/release_workflow.md`.
- Discovery process defined in `docs/feature_units/standards/discovery_process.md`.
- MVP specs remain in `docs/specs/` and are referenced, not duplicated.
- This status file is the **single source of truth** for v1.0.0 release progress.
- All planning documents now complete and ready for discovery phase.
