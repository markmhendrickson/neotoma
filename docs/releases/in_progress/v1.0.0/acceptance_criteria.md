## Release v1.0.0 — Acceptance Criteria

_(Release-Level Acceptance Criteria for MVP)_

---

### Purpose

This document defines the release-level acceptance criteria that must be met before v1.0.0 can be approved for deployment. These criteria span product, technical, and business dimensions.

**Related Documents:**
- `release_plan.md` — Release overview and scope
- `integration_tests.md` — Detailed integration test specifications
- `status.md` — Current status and progress tracking

---

### 1. Product Acceptance Criteria

#### 1.1 Core Workflow

- Core workflow: **upload → ingestion → extraction → entity resolution → event generation → memory graph → timeline → AI query via MCP** is functional for Tier 1 ICPs.

#### 1.2 UI Surfaces

- Records list and detail views functional and usable.
- Timeline view present and correctly ordered.
- Basic upload UI separated from chat and usable.
- Empty states and error states present and understandable for all main views.

---

### 2. Technical Acceptance Criteria

| Criterion                                            | Test / Validation                                 | Metric / Query                                                                    |
| ---------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------- |
| Deterministic ingestion for all supported file types | `tests/integration/ingestion_determinism.test.ts` | Upload same file 3x → identical `properties` JSON                                 |
| Deterministic OCR (same image → same text)           | `tests/integration/ocr_determinism.test.ts`       | OCR same image 100x → 100% identical output                                       |
| No LLM extraction in Truth Layer                     | Code review + `tests/unit/file_analysis.test.ts`  | No OpenAI/Anthropic API calls in ingestion path                                   |
| Graph integrity: 0 orphans                           | `tests/integration/graph_integrity.test.ts`       | `SELECT COUNT(*) FROM events WHERE record_id NOT IN (SELECT id FROM records)` = 0 |
| Graph integrity: 0 cycles                            | `tests/integration/graph_integrity.test.ts`       | Cycle detection query returns 0                                                   |
| Deterministic search ranking                         | `tests/integration/search_determinism.test.ts`    | Same query + same DB state → identical result order                               |
| All P0 FUs completed with passing tests              | Manual verification + status.md                   | All FU-100, FU-101, FU-102, FU-103, FU-105, FU-300, FU-700, FU-701 = `completed`  |
| 100% test coverage on critical path                  | `npm run test:coverage -- --critical-path`        | `coverage.critical_path >= 100`                                                   |

---

### 3. Business Acceptance Criteria

#### 3.1 User Metrics

- DAU ≥ 10 at launch (pilot users).
- ≥ 100 records ingested in first week (across test + pilot tenants).

#### 3.2 Metrics Instrumentation

Metrics instrumentation in place for:

- Upload success rate
- P95 upload latency
- Orphan/cycle counts
- Search latency

---

### 4. Validation Approach

**Pre-Deployment Validation:**
- All technical acceptance criteria validated via automated test suite
- All integration scenarios pass (see `integration_tests.md`)
- Product acceptance criteria validated via manual testing
- Business acceptance criteria validated post-deployment (tracked in monitoring)

**Post-Deployment Validation:**
- Monitor business metrics for first week
- Compare against targets
- Document deviations in status updates

---

### 5. Sign-Off Criteria

Before deployment to production, the following must be true:

1. ✅ All technical acceptance criteria met (automated tests pass)
2. ✅ All integration scenarios pass (see `integration_tests.md`)
3. ✅ Product acceptance criteria validated (manual testing complete)
4. ✅ Monitoring and alerting configured (see `monitoring_plan.md`)
5. ✅ Deployment strategy approved (see `deployment_strategy.md`)
6. ✅ Pre-mortem reviewed (see `pre_mortem.md`)
7. ✅ Sign-off from owner (Mark Hendrickson)

---

### 6. Related Documents

- `release_plan.md` — Release overview and scope
- `integration_tests.md` — Detailed integration test specifications
- `deployment_strategy.md` — Deployment and rollback procedures
- `monitoring_plan.md` — Post-release monitoring and observability
- `status.md` — Current status and progress tracking

