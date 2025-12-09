## Release v1.0.0 — MVP

_(Deterministic Truth Layer MVP Release Plan — Overview and Coordination Document)_

---

### Purpose

This document provides the overview and coordination framework for v1.0.0. Detailed specifications are decomposed into separate topic-specific documents:

- `acceptance_criteria.md` — Release-level acceptance criteria (product, technical, business)
- `pre_mortem.md` — Failure mode analysis and mitigation strategies
- `deployment_strategy.md` — Staging-first deployment and rollback procedures
- `monitoring_plan.md` — Post-release monitoring, metrics, and alerting
- `integration_tests.md` — Cross-FU integration test specifications
- `discovery_plan.yaml` — Pre-release discovery activities and hypotheses
- `marketing_plan.yaml` — Pre-launch and post-launch marketing strategy
- `execution_schedule.md` — FU execution plan with batches and dependencies
- `manifest.yaml` — FU list, dependencies, schedule, release type
- `status.md` — Live status tracking and decision log

---

### 1. Release Overview

- **Release ID**: `v1.0.0`
- **Name**: MVP
- **Release Type**: External (public launch with marketing)
- **Goal**: Ship the first production-capable Neotoma Truth Layer with deterministic ingestion, extraction, entity resolution, event generation, memory graph, MCP access, and minimal UI to support Tier 1 ICP workflows.
- **Priority**: P0 (critical)
- **Target Ship Date**: 2025-03-01 (tentative)
- **Discovery Required**: Yes (pre-release discovery + continuous discovery)
- **Marketing Required**: Yes (hybrid: pre-launch + post-launch)
- **Owner**: Mark Hendrickson

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
- `FU-106`: Chat Transcript to JSON CLI Tool (moved to Internal Release v0.2.0, pre-MVP)

These are documented as post-MVP features and **MUST NOT** block v1.0.0.

---

### 3. Release-Level Acceptance Criteria

**See `acceptance_criteria.md` for complete acceptance criteria.**

**Summary:**

- **Product**: Core workflow functional, UI surfaces usable, empty/error states present
- **Technical**: Deterministic ingestion/OCR, no LLM extraction, graph integrity (0 orphans/cycles), deterministic search, 100% test coverage on critical path
- **Business**: DAU ≥ 10 at launch, ≥ 100 records ingested in first week, metrics instrumentation in place

---

### 4. Cross-FU Integration Scenarios

**See `integration_tests.md` for complete integration test specifications.**

**Summary of Integration Scenarios:**

1. Financial Document Ingestion Flow
2. CSV/Spreadsheet Ingestion Flow
3. Multi-Event Document Flow
4. Auth + RLS Flow
5. MCP AI Access Flow

All scenarios must pass end-to-end before v1.0.0 is approved for deployment.

---

### 5. Pre-Mortem: Failure Mode Analysis

**See `pre_mortem.md` for complete failure mode analysis.**

**Summary of Identified Failure Modes:**

1. **RLS Implementation Issues** (Probability: Low, Impact: Medium)
2. **Graph Integrity Regressions** (Probability: Medium, Impact: High)
3. **MVP Date Slips by 2+ Weeks** (Probability: High, Impact: Medium)
4. **OCR Determinism Fails** (Probability: Low, Impact: Critical)
5. **Discovery Reveals Low Willingness-to-Pay** (Probability: Medium, Impact: High)

Each failure mode includes early warning signals, mitigation strategies, and rollback plans. Pre-mortem reviewed at Checkpoint 0.5, Checkpoint 1, and Checkpoint 2.

---

### 6. Deployment and Rollback Strategy

**See `deployment_strategy.md` for complete deployment and rollback procedures.**

**Summary:**

- **Strategy**: Staging-first deployment (deploy to staging, validate, then deploy to production)
- **Staging**: T-3 days, full integration test suite, performance benchmarks, manual testing
- **Production**: Day 0, smoke tests, metrics validation, 1-hour monitoring window
- **Rollback**: Triggered by critical errors, data integrity issues, performance degradation; < 15 minutes target restore time

---

### 7. Post-Release Monitoring and Observability

**See `monitoring_plan.md` for complete monitoring infrastructure, metrics, and alerting configuration.**

**Summary:**

- **Infrastructure**: Application metrics, database metrics, error tracking, uptime monitoring
- **Dashboards**: Main, Graph Integrity, Performance, User Metrics
- **Key Metrics**: Product (upload success rate, latency, DAU, activation), Technical (graph integrity, error rate), Business (signups, conversion, retention)
- **Alerting**: Critical alerts (immediate response), Warning alerts (monitor and address)
- **Schedule**: Daily (first 2 weeks), Weekly, Monthly reviews

---

### 8. Discovery and Marketing

#### 8.1 Discovery Plan

Pre-release discovery is **required** for MVP (external release).

- **Discovery Plan**: See `discovery_plan.md` (overview) and `discovery_plan.yaml` (metadata/summary)
- **Participant Recruitment**: See `participant_recruitment_log.md`
- **Timeline**: 3-4 weeks before development (Week -8 to Week -5)
- **Activities**: Async screening survey, live interviews (value, usability, business viability), feasibility validation
- **Success Criteria**: See `discovery_plan.md` and detailed discovery plan documents
- **Continuous Discovery**: Weekly user interviews throughout development (2-3 participants per week)

#### 8.2 Marketing Plan

Marketing is **required** for MVP (external release).

- **Marketing Plan**: See `marketing_plan.md` (overview) and `marketing_plan.yaml` (metadata/summary)
- **Strategy**: Hybrid (pre-launch + post-launch)
- **Pre-Launch Activities** (Week -4 to Week 0): Waitlist building, early access beta, content teasers
- **Post-Launch Activities** (Day 0 to Week 4): Launch announcement, waitlist conversion, organic growth, partnership outreach
- **Budget**: $0 (organic only for MVP)
- **Detailed Plans**: See `pre_launch_marketing_plan.md`, `post_launch_marketing_plan.md`, `marketing_segments_plan.md`, `marketing_metrics_plan.md`

---

### 9. Status

**See `status.md` for live status tracking and decision log.**

**Current Status**: `planning`

**Next Steps**:

1. Complete discovery planning (review `discovery_plan.md` and detailed discovery plan documents)
2. Complete marketing planning (review `marketing_plan.yaml`)
3. Conduct pre-release discovery (Checkpoint 0.5)
4. Execute FU batches (Step 1)

---

### 10. Document Index

This release plan coordinates the following topic-specific documents:

**Planning Documents:**

- `manifest.yaml` — FU list, dependencies, schedule, release type
- `execution_schedule.md` — FU execution plan with batches and dependencies
- `acceptance_criteria.md` — Release-level acceptance criteria
- `pre_mortem.md` — Failure mode analysis and mitigation strategies
- `integration_tests.md` — Cross-FU integration test specifications

**Discovery and Marketing:**

- `discovery_plan.md` — Discovery overview and coordination
- `discovery_plan.yaml` — Discovery metadata and summaries (for workflow automation)
- `value_discovery_plan.md` — Value discovery details
- `usability_discovery_plan.md` — Usability discovery details
- `business_viability_discovery_plan.md` — Business viability discovery details
- `feasibility_validation_plan.md` — Feasibility validation details
- `continuous_discovery_plan.md` — Continuous discovery details
- `participant_recruitment_log.md` — Participant outreach and tracking
- `continuous_discovery_log.md` — Continuous discovery during development
- `marketing_plan.md` — Marketing overview and coordination
- `marketing_plan.yaml` — Marketing metadata and summaries (for workflow automation)
- `pre_launch_marketing_plan.md` — Pre-launch marketing details
- `post_launch_marketing_plan.md` — Post-launch marketing details
- `marketing_segments_plan.md` — Marketing segment definitions
- `marketing_metrics_plan.md` — Marketing metrics and tracking

**Deployment and Operations:**

- `deployment_strategy.md` — Staging-first deployment and rollback procedures
- `monitoring_plan.md` — Post-release monitoring, metrics, and alerting

**Status Tracking:**

- `status.md` — Live status tracking and decision log

**Related Standards:**

- `docs/feature_units/standards/release_workflow.md` — Release workflow standard
- `docs/feature_units/standards/discovery_process.md` — Discovery process standard
