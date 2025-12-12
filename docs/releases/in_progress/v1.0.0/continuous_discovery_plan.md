## Release v1.0.0 — Continuous Discovery Plan

_(Continuous Discovery During Development)_

---

### Purpose

This document defines the continuous discovery activities for v1.0.0 during development, focused on validating MCP workflow assumptions, gathering feedback on completed features, and testing AI query scenarios.

**Related Documents:**

- `discovery_plan.md` — Discovery overview and coordination
- `value_discovery_plan.md` — Value discovery activities
- `usability_discovery_plan.md` — Usability discovery activities
- `continuous_discovery_log.md` — Continuous discovery tracking template

---

### 1. Overview

**Enabled**: Yes

**Timeline**: Throughout development (Week 0 to Week 12)

**Purpose**: Validate assumptions continuously during development, gather feedback on completed features, test AI-native workflows with real users

---

### 2. Continuous Discovery Activities

#### Activity 1: Weekly User Interviews

**Frequency**: 1x per week

**Participants**: 2-3 ICP users per week (rotating from discovery participants)

**Duration**: 30 minutes per interview

**Focus**: Feedback on completed features, validate MCP workflow assumptions, test AI query scenarios

**Format**: Check-ins, show progress on MCP integration, gather feedback on AI-native workflows

**Why Live Required**: Need conversation to understand feedback context, probe issues, validate assumptions

**Topics to Cover:**

- Feedback on recently completed features
- Test MCP workflow with actual Claude/ChatGPT connection
- Validate AI query scenarios users want to try
- Identify blockers or confusion points
- Gather feature requests or improvements

---

#### Activity 2: Prototype Testing After UI FUs

**Frequency**: After FU-300, FU-700, and any other UI FUs

**Participants**: 3-5 users per test

**Focus**: Usability validation, MCP workflow completion, AI query understanding

**Format**: Show working prototype, test MCP connection, gather feedback on AI-native workflows

**Why Live Required**: Must observe user behavior, detect confusion, probe usability issues

**Testing Focus:**

- After FU-300 (Design System): Test UI components and design system usage
- After FU-700 (Authentication UI): Test signup/login flow
- After any UI changes: Test workflow completion, identify usability issues

---

#### Activity 3: Competitor User Discovery

**Frequency**: Week 2 to Week 10 (ongoing)

**Participants**: Competitor users identified through social media outreach (Supermemory.ai, Mem0, ChatGPT Memory users, etc.)

**Focus**: Understand competitor user pain points, validate Neotoma differentiation, identify switching motivations

**Format**:

- Social media engagement (Twitter, Reddit, Discord) to identify potential interview participants
- Short discovery interviews (15-20 minutes) with competitor users expressing dissatisfaction
- Validate Neotoma's differentiation (privacy, determinism, cross-platform, entity resolution)

**Why Live Required**: Need conversation to understand competitor limitations, validate differentiation, identify switching triggers

**Discovery Questions**:

- What limitations do you experience with [competitor]?
- What features are missing that you need?
- How important is privacy vs. convenience?
- Would cross-platform access (ChatGPT + Claude + Cursor) be valuable?
- What would make you switch to an alternative?

**Outreach Sources**:

- Twitter/X: Followers of Supermemory.ai, MemCP, MemMachine, OpenMemory, Mem0 MCP, Cognee, Roampal, Memara, and other MCP memory tool accounts
- Reddit: Users in r/ChatGPT, r/ClaudeAI, r/Cursor, r/MCP discussing memory limitations
- Discord: AI tool communities, MCP communities
- LinkedIn: Professionals discussing AI memory tools
- GitHub: Users of MCP memory tool repositories

**Goals**:

- Validate Neotoma differentiation resonates with competitor users
- Identify key switching triggers
- Build pipeline of potential early adopters
- Refine messaging based on competitor user feedback

---

#### Activity 4: Beta Testing (Private)

**Frequency**: Last 2 weeks before deployment (Week 11-12)

**Participants**: Discovery participants + early access signups + competitor users (from Activity 3)

**Focus**: End-to-end validation, MCP query testing with real Claude/ChatGPT, bug identification

**Format**: Full access to MVP, connect to Claude/ChatGPT, collect feedback, identify blockers

**Why Live Required**: Complex workflows need observation, bug reports need context, MCP setup needs guidance

**Beta Testing Goals:**

- End-to-end workflow validation
- Real-world usage scenarios
- Bug identification and prioritization
- Performance testing with real data volumes
- MCP connection setup and troubleshooting

---

### 3. Discovery Schedule

**Week 0-2 (Early Development):**

- Weekly interviews: Focus on design system, early UI feedback
- Prototype testing: After FU-300 (Design System)
- Competitor user discovery: Begin identifying competitor users on social media

**Week 3-6 (Core Features):**

- Weekly interviews: Focus on ingestion, extraction, entity resolution workflows
- Prototype testing: After FU-700 (Authentication UI)
- Test early MCP integration
- Competitor user discovery: Conduct interviews with competitor users, validate differentiation

**Week 7-10 (Integration & Polish):**

- Weekly interviews: Focus on complete workflows, MCP query scenarios
- Test full upload → extraction → MCP query flow
- Gather feedback on timeline view, search
- Competitor user discovery: Continue outreach, refine messaging based on feedback

**Week 11-12 (Beta Testing):**

- Beta testing with full access (includes competitor users from discovery)
- End-to-end validation
- Bug identification and fixes
- Performance testing

---

### 4. Tracking and Documentation

**Tracking Template**: `continuous_discovery_log.md`

**Capture for Each Session:**

- Date and participants
- Features tested or discussed
- Feedback received (positive and negative)
- Issues identified (blockers, confusion points)
- Action items for implementation
- Follow-up needed

**Weekly Synthesis:**

- Aggregate feedback from weekly interviews
- Identify patterns and common themes
- Prioritize issues and improvements
- Update implementation priorities if needed

---

### 5. Integration with Development

**Feedback Loop:**

1. Gather feedback in weekly interviews
2. Synthesize findings weekly
3. Update implementation priorities (if needed)
4. Implement high-priority fixes/improvements
5. Test improvements in next interview cycle

**Decision-Making:**

- Critical blockers: Fix immediately (may delay feature completion)
- Important improvements: Prioritize for current sprint
- Nice-to-have: Add to backlog for post-MVP

---

### 6. Success Criteria

**Continuous Discovery Success:**

- Weekly interviews conducted throughout development (12+ interviews)
- Competitor user discovery interviews (5+ competitor users interviewed)
- Prototype testing after each major UI FU
- Beta testing identifies critical bugs before launch
- Feedback incorporated into implementation (prioritized)
- MCP workflow validated with real users before launch
- Neotoma differentiation validated with competitor users

---

### 7. Deliverable

**Deliverable**: `continuous_discovery_log.md`

Includes:

- Weekly interview summaries
- Competitor user discovery interviews and findings
- Prototype testing results
- Beta testing findings
- Feedback synthesis and action items
- Issues tracked and resolved
- Competitor user pain points and switching triggers

---

### 8. Related Documents

- `discovery_plan.md` — Discovery overview and coordination
- `value_discovery_plan.md` — Value discovery activities
- `usability_discovery_plan.md` — Usability discovery activities
- `continuous_discovery_log.md` — Continuous discovery tracking template
- `release_plan.md` — Release overview and scope
- `status.md` — Release status tracking




