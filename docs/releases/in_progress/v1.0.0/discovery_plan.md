## Release v1.0.0 — Discovery Plan

_(Pre-Release Discovery Plan — Overview and Coordination Document)_

---

### Purpose

This document provides the overview and coordination framework for v1.0.0 pre-release discovery. Detailed discovery activities are decomposed into separate topic-specific documents:

- `value_discovery_plan.md` — Value discovery (problem and solution validation)
- `usability_discovery_plan.md` — Usability discovery (prototype user testing)
- `business_viability_discovery_plan.md` — Business viability discovery (pricing validation)
- `feasibility_validation_plan.md` — Feasibility validation (technical POC)
- `continuous_discovery_plan.md` — Continuous discovery during development
- `participant_recruitment_log.md` — Participant outreach and tracking

**Reference Standards:**

- `docs/feature_units/standards/discovery_process.md` — Discovery process standard
- `docs/feature_units/standards/release_workflow.md` — Release workflow (Step 0.5)

---

### 1. Discovery Overview

- **Enabled**: Yes (required for external release)
- **Timeline**: Week -8 to Week -5 (3-4 weeks before development starts)
- **Owner**: Mark Hendrickson
- **Status**: Not started
- **Approach**: Hybrid (async screening survey + live interviews + optional async validation)

---

### 2. Discovery Activities Summary

#### 2.1 Value Discovery

**See `value_discovery_plan.md` for complete details.**

- **Hypothesis**: AI-Native Individual Operators need a way to give AI tools (Claude/ChatGPT) access to their personal data context via MCP
- **Method**: Hybrid (async screening survey + live interviews using Mom Test methodology)
- **Participants**: 13 total (8 AI-Native Operators + 5 Knowledge Workers)
- **Timeline**: Week -8 to Week -6
- **Success Criteria**: ≥70% validate problem exists, ≥60% express interest in MCP solution

#### 2.2 Usability Discovery

**See `usability_discovery_plan.md` for complete details.**

- **Hypothesis**: Users can complete upload → extraction → MCP query workflow without guidance
- **Method**: Prototype user testing (live, requires observation and think-aloud protocol)
- **Participants**: 8 total (5 AI-Native Operators + 3 Knowledge Workers)
- **Timeline**: Week -7 to Week -6
- **Success Criteria**: ≥80% complete core workflows, SUS ≥70, ≥70% understand MCP workflow

#### 2.3 Business Viability Discovery

**See `business_viability_discovery_plan.md` for complete details.**

- **Hypothesis**: AI-Native Individual Operators will pay €25-€125/month for MVP
- **Method**: Willingness-to-pay interviews (live, Mom Test methodology)
- **Participants**: 8 (AI-Native Operators)
- **Timeline**: Week -6 to Week -5
- **Success Criteria**: ≥50% express willingness to pay ≥€25/month

#### 2.4 Feasibility Validation

**See `feasibility_validation_plan.md` for complete details.**

- **Hypothesis**: OCR determinism is achievable with pinned tesseract version
- **Method**: Technical proof of concept (no participants needed)
- **Timeline**: Week -8 to Week -7
- **Success Criteria**: 100% OCR reproducibility, MCP reliability ≥99.9%

#### 2.5 Continuous Discovery

**See `continuous_discovery_plan.md` for complete details.**

- **Timeline**: Throughout development (Week 0 to Week 12)
- **Activities**: Weekly user interviews, prototype testing after UI FUs, beta testing
- **Deliverable**: `continuous_discovery_log.md`

---

### 3. Discovery Synthesis and Go/No-Go Decision

**Timeline**: Week -5 to Week -4

**Activities:**

- Analyze all discovery findings
- Compare against success criteria
- Generate combined discovery report
- Make go/no-go decision
- Update Release plan based on learnings

**Go/No-Go Criteria:**

**Go (Proceed to Build):**

- Value discovery: ≥70% validate problem, ≥60% express interest in MCP solution
- Usability discovery: ≥70% complete core workflows, SUS ≥70, ≥70% understand MCP workflow
- Business viability: ≥50% willing to pay ≥€25/month
- Feasibility: 100% OCR reproducibility, MCP reliability ≥99.9%

**Pivot (Adjust Scope):**

- Some hypotheses validated, some failed
- Adjust Release scope based on learnings
- Examples: Value discovery passes but usability fails, business viability below threshold but strong interest

**No-Go (Cancel or Defer):**

- Critical hypotheses failed
- Examples: Value discovery fails (<60% validate problem), business viability fails (<40% willing to pay), feasibility validation fails

---

### 4. Discovery Timeline

**Week -8:**

- Participant recruitment begins (40-50 outreach messages)
- Feasibility validation starts (technical POC)
- Async screening survey launched

**Week -8 to -7:**

- Recruitment responses, scheduling, backup recruitment if needed
- Value discovery interviews begin (13 participants)
- Feasibility validation continues

**Week -7 to -6:**

- Value discovery interviews continue
- Usability discovery prototype testing (8 participants)

**Week -6 to -5:**

- Value discovery interviews complete
- Business viability discovery interviews (8 participants)

**Week -5 to -4:**

- Discovery synthesis and go/no-go decision

---

### 5. Participant Recruitment

**See `participant_recruitment_log.md` for tracking.**

**Recruitment Targets:**

- **Value Discovery**: 13 participants (8 AI-Native Operators + 5 Knowledge Workers)
- **Usability Discovery**: 8 participants (subset from value discovery)
- **Business Viability Discovery**: 8 participants (subset from value discovery)

**Recruitment Channels:**

- AI-Native Operators: Twitter/X, Indie Hackers, Hacker News, AI tool communities
- Knowledge Workers: LinkedIn, productivity communities, professional forums

**Outreach Strategy:**

- 40-50 survey responses to get 20-25 willing to interview
- Target 20-30% response rate, expect 20-30% no-shows
- Schedule 17-18 interviews to get 13 completed

---

### 6. Discovery Deliverables

- `value_discovery_report.md` — Value discovery findings and synthesis
- `usability_discovery_report.md` — Usability discovery findings and synthesis
- `business_viability_report.md` — Business viability discovery findings and synthesis
- `feasibility_validation.md` — Feasibility validation results
- `discovery_report.md` — Combined discovery findings (synthesis)
- `continuous_discovery_log.md` — Continuous discovery tracking throughout development
- `participant_recruitment_log.md` — Participant outreach and tracking

---

### 7. Document Index

This discovery plan coordinates the following topic-specific documents:

**Discovery Activity Plans:**

- `value_discovery_plan.md` — Value discovery activities and interview structure
- `usability_discovery_plan.md` — Usability discovery activities and test scenarios
- `business_viability_discovery_plan.md` — Business viability discovery activities and pricing interviews
- `feasibility_validation_plan.md` — Feasibility validation tests and success criteria
- `continuous_discovery_plan.md` — Continuous discovery activities during development

**Tracking and Reports:**

- `participant_recruitment_log.md` — Participant outreach and tracking
- `continuous_discovery_log.md` — Continuous discovery tracking template
- Discovery reports (generated after each discovery phase)

**Related Documents:**

- `release_plan.md` — Release overview and scope
- `docs/feature_units/standards/discovery_process.md` — Discovery process standard

---

### 8. Status

- **Current Status**: Not started
- **Owner**: Mark Hendrickson
- **Next Steps**:
  1. Launch async screening survey (Week -8)
  2. Begin participant recruitment outreach
  3. Start feasibility validation (technical POC)
  4. Conduct value discovery interviews (Week -8 to -6)
  5. Conduct usability discovery testing (Week -7 to -6)
  6. Conduct business viability discovery interviews (Week -6 to -5)
  7. Synthesize findings and make go/no-go decision (Week -5 to -4)
