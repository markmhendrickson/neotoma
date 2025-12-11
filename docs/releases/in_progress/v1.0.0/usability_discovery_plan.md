## Release v1.0.0 — Usability Discovery Plan

_(Usability Discovery: Prototype User Testing)_

---

### Purpose

This document defines the usability discovery activities for v1.0.0, focused on validating that users can complete the upload → extraction → MCP query workflow without guidance and understand how to ask AI questions about their personal data.

**Related Documents:**
- `discovery_plan.md` — Discovery overview and coordination
- `value_discovery_plan.md` — Value discovery activities
- `business_viability_discovery_plan.md` — Business viability discovery activities
- `participant_recruitment_log.md` — Participant tracking

---

### 1. Hypothesis and Assumptions

**Hypothesis:** "Users can complete upload → extraction → MCP query workflow without guidance, and understand how to ask AI questions about their personal data"

**Assumptions:**
- Upload UI is discoverable and intuitive
- Users understand that uploaded documents become queryable via MCP
- Users can successfully query their data via Claude/ChatGPT after setup
- MCP setup/connection process is clear
- Users understand what questions they can ask AI about their data

---

### 2. Discovery Method

**Method**: Prototype user testing (live, requires observation and think-aloud protocol)

**Why Live Required:**
- Must observe user behavior: Can't see confusion or errors in async survey
- Think-aloud protocol: Users narrate actions, revealing mental model and confusion points
- Dynamic probing: Ask follow-up questions based on observed behavior
- Task completion requires observation: See where users get stuck

---

### 3. Participants

- **AI-Native Individual Operators**: 5 participants
  - Recruitment: Subset from value discovery participants (those who validate problem and express interest)
- **High-Context Knowledge Workers**: 3 participants
  - Recruitment: Subset from value discovery participants

**Total**: 8 participants

---

### 4. Prototype Requirements

- Clickable prototype (fully interactive)
- Core workflows: Upload, view extracted data, MCP query simulation
- Use existing design system
- Mock MCP query interface (or actual Claude/ChatGPT with MCP connection)
- No backend needed (except MCP simulation)

---

### 5. Test Format

- **Duration**: 45-60 minutes per session
- **Protocol**: Think-aloud (users narrate actions)
- **Recording**: Screen and audio recording
- **Approach**: Task-based testing (give users goals, observe)

---

### 6. Testing Scenarios

#### Scenario 1: Upload and View Extracted Data

**Duration**: 10 min

**Description**: "Imagine you just signed up for Neotoma. You want to upload a contract PDF so that Claude can answer questions about it later. Please do that and see what information Neotoma extracted."

**Observe:**
- Can user find upload UI?
- Can user complete upload?
- Does user understand what was extracted?
- Does user understand this data is now queryable by AI?

**Success**: User completes upload, views extracted data, understands it's AI-accessible

---

#### Scenario 2: Query Personal Data via AI (MCP Simulation)

**Duration**: 15 min

**Description**: "Now you want to ask Claude a question about your uploaded contract. Try asking: 'What's the contract value?' or 'When does this contract expire?' (We'll simulate MCP query or use actual Claude with MCP connection)"

**Observe:**
- Can user understand how to query via AI? (MCP concept)
- Can user successfully ask questions?
- Does user understand AI is accessing their uploaded data?
- Are the AI answers clear and helpful?
- Time to successful query

**Success**: User successfully queries personal data via AI within reasonable time, understands MCP workflow

---

#### Scenario 3: Ask Multiple Questions Across Documents

**Duration**: 10 min

**Description**: "You've uploaded multiple documents (contract, receipt, travel booking). Try asking Claude: 'Show me all my travel bookings next month' or 'What companies have I interacted with?'"

**Observe:**
- Can user ask cross-document questions?
- Does user understand AI can query multiple documents?
- Are answers accurate and helpful?

**Success**: User successfully asks cross-document questions, AI provides useful answers

---

#### Scenario 4: Timeline Discovery

**Duration**: 10 min

**Description**: "Neotoma also creates a timeline view of events from your documents. Can you find the timeline and see your documents organized chronologically?"

**Observe:**
- Can user find timeline view?
- Does user understand timeline organization?
- Does user see value in chronological view?

**Success**: User navigates to timeline and understands chronological organization

---

#### Scenario 5: Post-Test Questions

**Duration**: 10 min

**Description**: Gather overall usability feedback

**Questions:**
1. "Overall, how easy was this to use? (1-5 scale)"
2. "Does the MCP query workflow make sense to you?"
3. "What was confusing about querying your data via AI?"
4. "What worked well?"
5. "Would you use this? Why or why not?"
6. "What questions would you want to ask AI about your personal data?"

---

### 7. Success Criteria

- ≥80% complete Scenario 1 (Upload) without help
- ≥70% complete Scenario 2 (MCP Query) successfully within reasonable time
- ≥65% successfully ask cross-document questions (Scenario 3)
- ≥70% navigate to timeline (Scenario 4) without prompting
- ≥70% understand that uploaded data becomes queryable via AI
- System Usability Scale (SUS) score ≥70
- ≤2 critical usability blockers identified

---

### 8. Timeline

**Timeline**: Week -7 to Week -6

**Schedule:**
- Week -7: Prepare prototype, schedule participants (subset from value discovery)
- Week -7 to -6: Conduct usability testing sessions (8 participants)
- Week -6: Synthesize findings

---

### 9. Deliverable

**Deliverable**: `usability_discovery_report.md`

Includes:
- Task completion rates for each scenario
- Usability issues identified (critical blockers, minor friction)
- SUS score and analysis
- User mental model insights
- Recommendations for UI improvements
- Comparison against success criteria

---

### 10. Related Documents

- `discovery_plan.md` — Discovery overview and coordination
- `value_discovery_plan.md` — Value discovery activities
- `business_viability_discovery_plan.md` — Business viability discovery activities
- `participant_recruitment_log.md` — Participant tracking
- `docs/feature_units/standards/discovery_process.md` — Discovery process standard




