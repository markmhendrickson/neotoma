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
- `execution_schedule.md` — FU execution plan with batches and dependencies
- `manifest.yaml` — FU list, dependencies, schedule, release type
- `status.md` — Live status tracking and decision log

---

### 1. Release Overview

- **Release ID**: `v1.0.0`
- **Name**: MVP
- **Release Type**: Marketed (public launch with marketing activities)
- **Goal**: Ship the first production-capable Neotoma Truth Layer with structured personal data memory (dual-path ingestion), entity resolution, timelines, cross-platform MCP access, and minimal UI to support Tier 1 ICP workflows.
- **Priority**: P0 (critical)
- **Target Ship Date**: 2026-01-23 (revised Dec 12, 2025: discovery + marketing in parallel starting Dec 12, then 2-3 days development)
- **Discovery Required**: Yes (pre-release discovery + continuous discovery)
- **Marketing Required**: Yes (hybrid: pre-launch + post-launch)
- **Deployment**: Production (neotoma.io)
- **Owner**: Mark Hendrickson

**Competitive Context:** Model/OS providers (OpenAI ChatGPT, Anthropic Claude, Google Gemini, Microsoft Copilot) have already implemented conversation-only native memory (2024-2025) and are actively developing structured memory capabilities (2025-2026). Startups (Supermemory.ai) offer MCP-integrated adaptive graph-based memory.

**Neotoma's Defensible Differentiation:** MVP must validate three defensible architectural choices that competitors cannot pursue due to structural constraints:

1. **Privacy-first architecture** (user-controlled vs. provider-controlled) — Competitors won't pursue due to business model conflicts
2. **Deterministic extraction** (vs. ML-based probabilistic) — Competitors won't pursue due to architectural constraints
3. **Cross-platform access** (vs. platform lock-in) — Competitors won't pursue due to platform lock-in revenue models

**Feature Capabilities:** Entity resolution, timelines, dual-path ingestion are valuable but not defensible alone (competitors developing similar). MVP must combine defensible differentiators with feature capabilities.

**Strategic Positioning:** See [`docs/private/competitive/defensible_differentiation_framework.md`](../../private/competitive/defensible_differentiation_framework.md) for detailed competitive analysis.

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
- `FU-101`: Entity Resolution Service (MVP-critical competitive differentiator)
- `FU-102`: Event Generation Service (MVP-critical competitive differentiator: timelines)
- `FU-103`: Graph Builder Service
- `FU-105`: Search Service (deterministic ranking)
- `FU-300`: Design System Implementation (core UI foundation)
- `FU-700`: Authentication UI (Supabase Auth integration)
- `FU-701`: RLS Implementation (row-level security; MVP-critical for privacy/control positioning)
- `FU-710`: Spec Compliance Automation (multi-agent, multi-model spec-compliance checks and reports for marketed/high-risk releases)

**Note:** FU-101 (Entity Resolution) and FU-102 (Timelines) are MVP-critical competitive differentiators. Provider memory (ChatGPT, Claude, Gemini) doesn't offer entity resolution or timelines across personal data. These features validate Neotoma's defensible positioning.

These may be extended with additional P1/P2 FUs if explicitly added later.

#### 2.2 Explicitly Excluded (Post-MVP)

- LLM extraction (any Truth Layer extraction using LLMs)
- Semantic search (vector similarity, hybrid search)
- Plaid integration and other financial provider syncs
- X (Twitter) and Instagram integrations
- Real-time collaboration
- `FU-106`: Chat Transcript to JSON CLI Tool (moved to Not Marketed Release v0.4.0, pre-MVP)
- `FU-307`: Chat/AI Panel (excluded per architectural decision; see `docs/architecture/conversational_ux_architecture.md` and `architectural_impact_chat_ui.md`)

**Note:** Neotoma adopts MCP-first conversational architecture. All conversational interactions are externalized to MCP-compatible agents (ChatGPT, Cursor, Claude). Internal chat UI violates architectural decision and is excluded.

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

Pre-release discovery is **required** for MVP (marketed release).

**Overview and Coordination:**

- **Discovery Plan**: See `discovery_plan.md` (overview and coordination)
- **Timeline**: 3-4 weeks before development (Week -8 to Week -5)
- **Activities**: Async screening survey, live interviews (value, usability, business viability), feasibility validation
- **Success Criteria**: See `discovery_plan.md` and detailed discovery plan documents
- **Continuous Discovery**: Weekly user interviews throughout development (2-3 participants per week)

**Lead Sourcing and Filtering:**

- **Lead Sourcing Tools**: See `discovery_lead_sourcing_tools.md` — Automated tools for sourcing participants from LinkedIn Sales Navigator, Twitter/X, Indie Hackers, GitHub, Reddit/Discord
- **Filtering Criteria**: See `discovery_filtering_criteria.md` — Enhanced ICP matching criteria (paid subscriptions, specific job titles, tool usage, activity signals)
- **Filtering Keywords**: See `discovery_filtering_keywords.md` — Complete keyword reference for all platforms
- **Subscription Detection**: See `subscription_detection_strategy.md` — Multi-method approach for detecting paid AI tool subscriptions
- **Cross-Platform Signals**: See `cross_platform_signal_detection.md` — Strategy for detecting signals across target platform and linked platforms
- **Timeline**: Tools built Week -10 to -9, used Week -8 for recruitment
- **Agent-Driven**: Tools can be executed autonomously by Cursor agents after API credential setup

**Participant Recruitment:**

- **Recruitment Log**: See `participant_recruitment_log.md` — Participant outreach and tracking
- **Outreach Strategy**: Two paths (Survey Path for community posts, Direct Outreach Path for personalized messages)
- **Response Rate Optimization**: Personalization, incentives (gift cards), timing optimization, follow-up sequences
- **Early Access Strategy**: Conditional offering (after interview for value discovery, can mention in usability/business viability discovery)

#### 8.2 Marketing Plan

Marketing is **required** for MVP (marketed release).

- **Marketing Plan**: See `marketing_plan.md` (overview and coordination)
- **Strategy**: Hybrid (pre-launch + post-launch)
- **Platform Prioritization**: P0 (Twitter, Indie Hackers, Product Hunt, Hacker News) for launch; P1 (LinkedIn, Reddit, Discord) for sustained growth
- **Automation**: Planned for post-MVP (see `marketing_automation_plan.md`)
- **Pre-Launch Activities** (Week -8 to -5, parallel with discovery): Waitlist building, early access beta, content teasers
- **Post-Launch Activities** (Day 0 to Week 4): Launch announcement, waitlist conversion, organic growth, partnership outreach
- **Budget**: $0 (organic only for MVP)
- **Detailed Plans**: See `pre_launch_marketing_plan.md`, `post_launch_marketing_plan.md`, `marketing_segments_plan.md`, `marketing_metrics_plan.md`, `marketing_automation_plan.md`

---

### 9. Status

**See `status.md` for live status tracking and decision log.**

**Current Status**: `planning`  
**Release Type**: Marketed  
**Deployment**: Production (neotoma.io)

**Next Steps**:

1. **Build Discovery Infrastructure** (Week -10 to -9):
   - Build discovery lead sourcing tools (see `discovery_lead_sourcing_tools.md`)
   - Configure API credentials for agent-driven execution
   - Review filtering criteria and keywords (see `discovery_filtering_criteria.md`, `discovery_filtering_keywords.md`)

2. **Week -8 Discovery Setup**:
   - Execute lead sourcing tools to generate qualified participant lists
   - Review and approve final lead list
   - Launch async screening survey (Survey Path)
   - Begin direct outreach (Direct Outreach Path)

3. **Conduct Pre-Release Discovery** (Week -8 to -5):
   - Value discovery interviews (13 participants)
   - Usability discovery testing (8 participants)
   - Business viability discovery interviews (8 participants)
   - Feasibility validation (technical POC)

4. **Discovery Synthesis** (Week -5 to -4):
   - Analyze all discovery findings
   - Make go/no-go decision
   - Update release plan based on learnings

5. **Complete Marketing Planning** (Week -5 to -4):
   - Review `marketing_plan.md` and detailed marketing plans

6. **Execute FU Batches** (Week 0+):
   - Begin development after go decision

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

**Discovery Overview:**

- `discovery_plan.md` — Discovery overview and coordination
- `discovery_checklist.md` — Complete checklist of all discovery needs

**Lead Sourcing and Filtering:**

- `discovery_lead_sourcing_tools.md` — Tools for sourcing discovery participants from multiple platforms (LinkedIn, Twitter/X, Indie Hackers, GitHub, Reddit/Discord)
- `discovery_filtering_criteria.md` — Enhanced ICP matching criteria (paid subscriptions, job titles, tool usage, activity signals)
- `discovery_filtering_keywords.md` — Complete keyword reference for all platforms
- `subscription_detection_strategy.md` — Multi-method approach for detecting paid AI tool subscriptions
- `cross_platform_signal_detection.md` — Strategy for detecting signals across target platform and linked platforms

**Discovery Activities:**

- `value_discovery_plan.md` — Value discovery details (problem and solution validation)
- `usability_discovery_plan.md` — Usability discovery details (prototype user testing)
- `business_viability_discovery_plan.md` — Business viability discovery details (pricing validation)
- `feasibility_validation_plan.md` — Feasibility validation details (technical POC)
- `continuous_discovery_plan.md` — Continuous discovery details (during development)

**Recruitment and Tracking:**

- `participant_recruitment_log.md` — Participant outreach and tracking (with response rate strategies, early access strategy)
- `continuous_discovery_log.md` — Continuous discovery during development
- `marketing_plan.md` — Marketing overview and coordination
- `pre_launch_marketing_plan.md` — Pre-launch marketing details
- `post_launch_marketing_plan.md` — Post-launch marketing details
- `marketing_segments_plan.md` — Marketing segment definitions
- `marketing_metrics_plan.md` — Marketing metrics and tracking
- `marketing_automation_plan.md` — Automated content generation, posting, and performance measurement

**Deployment and Operations:**

- `deployment_strategy.md` — Staging-first deployment and rollback procedures
- `monitoring_plan.md` — Post-release monitoring, metrics, and alerting

**Status Tracking:**

- `status.md` — Live status tracking and decision log

**Related Standards:**

- `docs/feature_units/standards/release_workflow.md` — Release workflow standard
- `docs/feature_units/standards/discovery_process.md` — Discovery process standard
