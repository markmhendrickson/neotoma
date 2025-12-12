## Discovery Planning Checklist

_(Complete checklist of all discovery needs for v1.0.0)_

---

### Purpose

This checklist ensures all discovery planning needs are documented and ready for execution. Use this to verify completeness before starting discovery activities.

---

### Week -10 to -9: Discovery Infrastructure Setup

**Lead Sourcing Tools:**

- [ ] Build LinkedIn Sales Navigator export tool (`scripts/discovery/linkedin_sales_navigator_export.js`)
- [ ] Build LinkedIn Connections export tool (`scripts/discovery/linkedin_connections_export.js`)
- [ ] Build Twitter/X search tool (`scripts/discovery/twitter_search.js`)
- [ ] Build Indie Hackers search tool (`scripts/discovery/indie_hackers_search.js`)
- [ ] Build GitHub user search tool (`scripts/discovery/github_search.js`)
- [ ] Build Reddit/Discord search tool (`scripts/discovery/reddit_discord_search.js`)
- [ ] Build unified lead manager (`scripts/discovery/unified_lead_manager.js`)
- [ ] Build recruitment log importer (`scripts/discovery/import_to_recruitment_log.js`)
- [ ] Create `.env.example` template for API credentials
- [ ] Create `scripts/discovery/README.md` with usage documentation
- [ ] Create `scripts/discovery/agent_instructions.md` for agent-driven execution

**API Credentials Setup:**

- [ ] Configure Twitter/X API credentials (if using API)
- [ ] Configure GitHub personal access token
- [ ] Set up LinkedIn Sales Navigator account (if using)
- [ ] Configure Reddit API credentials (if using API)
- [ ] Store credentials securely in `.env` (not committed)

**Cross-Platform Signal Detection:**

- [ ] Implement target platform post checking (LinkedIn, Twitter/X, GitHub)
- [ ] Implement linked platform extraction (Twitter/X handle, GitHub username from profiles)
- [ ] Implement linked platform post checking (cross-platform signals)
- [ ] Implement signal aggregation with weighting (target platform 1.0, linked platforms 0.6)

**Filtering Implementation:**

- [ ] Implement enhanced filtering criteria (see `discovery_filtering_criteria.md`)
- [ ] Load filtering keywords (see `discovery_filtering_keywords.md`)
- [ ] Implement subscription detection (multi-method: self-reported, bio mentions, proxy indicators)
- [ ] Implement ICP match scoring system

**Documentation:**

- [ ] Review `discovery_lead_sourcing_tools.md` for tool specifications
- [ ] Review `discovery_filtering_criteria.md` for filtering criteria
- [ ] Review `discovery_filtering_keywords.md` for keyword reference
- [ ] Review `subscription_detection_strategy.md` for detection methods
- [ ] Review `cross_platform_signal_detection.md` for signal detection strategy

---

### Week -8: Discovery Execution Setup

**Lead Generation:**

- [ ] Execute LinkedIn Sales Navigator tool (or manual export)
- [ ] Execute LinkedIn Connections export tool
- [ ] Execute Twitter/X search tool
- [ ] Execute Indie Hackers search tool
- [ ] Execute GitHub user search tool
- [ ] Execute Reddit/Discord search tool
- [ ] Run unified lead manager to combine and score leads
- [ ] Review unified lead list for quality
  - [ ] Verify ICP match scores are reasonable
  - [ ] Check for duplicate leads
  - [ ] Prioritize leads with subscription signals
- [ ] Import unified leads into participant recruitment log

**Screening Survey Setup:**

- [ ] Create screening survey (Survey Path)
- [ ] Include enhanced ICP qualification questions (see `value_discovery_plan.md`)
- [ ] Include subscription detection questions (primary method)
- [ ] Set up survey distribution (Indie Hackers, Reddit, Discord, Hacker News)
- [ ] Prepare survey response tracking

**Outreach Preparation:**

- [ ] Prepare personalized outreach templates (Direct Outreach Path)
- [ ] Review response rate optimization strategies (see `participant_recruitment_log.md`)
- [ ] Set up calendar scheduling tool (Calendly/Cal.com)
- [ ] Prepare gift card distribution process ($25-50 per participant)
- [ ] Review early access strategy (conditional offering)

**Feasibility Validation:**

- [ ] Set up test environment for OCR determinism testing
- [ ] Prepare test corpus (20+ representative documents)
- [ ] Begin OCR reproducibility tests
- [ ] Begin low-confidence flagging tests

---

### Week -8 to -6: Value Discovery

**Participant Recruitment:**

- [ ] Send 40-50 outreach messages (Survey Path + Direct Outreach Path)
- [ ] Track responses in `participant_recruitment_log.md`
- [ ] Schedule 17-18 interviews (accounting for no-shows)
- [ ] Send calendar confirmations with brief screening question (Direct Outreach Path)
- [ ] Send gift card reminders

**Value Discovery Interviews:**

- [ ] Conduct 13 interviews (8 AI-Native Operators + 5 Knowledge Workers)
- [ ] Follow Mom Test methodology (see `value_discovery_plan.md`)
- [ ] Validate problem exists (AI lacks personal data access)
- [ ] Test solution only if problem validated (MCP-based solution)
- [ ] Look for commitment signals (time, money, workarounds)
- [ ] Document findings in interview notes

**Feasibility Validation:**

- [ ] Complete OCR reproducibility tests (100 runs per document)
- [ ] Complete low-confidence flagging tests
- [ ] Complete schema detection accuracy tests
- [ ] Complete MCP query performance tests
- [ ] Document results in `feasibility_validation.md`

---

### Week -7 to -6: Usability Discovery

**Participant Selection:**

- [ ] Select 8 participants from value discovery (subset who validated problem)
- [ ] Invite to usability testing sessions
- [ ] Schedule 8 prototype testing sessions

**Prototype Testing:**

- [ ] Prepare clickable prototype (upload → extraction → MCP query)
- [ ] Conduct 8 usability testing sessions (think-aloud protocol)
- [ ] Test Scenario 1: Upload and view extracted data
- [ ] Test Scenario 2: Query personal data via AI (MCP simulation)
- [ ] Test Scenario 3: Ask multiple questions across documents
- [ ] Test Scenario 4: Timeline discovery
- [ ] Collect SUS scores
- [ ] Document usability issues and blockers

---

### Week -6 to -5: Business Viability Discovery

**Participant Selection:**

- [ ] Select 8 participants from value discovery (AI-Native Operators with high interest + commitment signals)
- [ ] Invite to pricing interviews
- [ ] Schedule 8 pricing interviews

**Pricing Interviews:**

- [ ] Conduct 8 willingness-to-pay interviews
- [ ] Follow Mom Test methodology (see `business_viability_discovery_plan.md`)
- [ ] Ask about past purchasing behavior (not hypotheticals)
- [ ] Test Van Westendorp Price Sensitivity Meter
- [ ] Identify value drivers for paying
- [ ] Document pricing findings

---

### Week -5 to -4: Discovery Synthesis

**Analysis:**

- [ ] Analyze value discovery findings
- [ ] Analyze usability discovery findings
- [ ] Analyze business viability discovery findings
- [ ] Analyze feasibility validation results
- [ ] Compare against success criteria (see `discovery_plan.md`)

**Reporting:**

- [ ] Generate `value_discovery_report.md`
- [ ] Generate `usability_discovery_report.md`
- [ ] Generate `business_viability_report.md`
- [ ] Generate `feasibility_validation.md`
- [ ] Generate `discovery_report.md` (combined synthesis)

**Go/No-Go Decision:**

- [ ] Review go/no-go criteria (see `discovery_plan.md`)
- [ ] Make go/no-go/pivot decision
- [ ] Update release plan based on learnings (if pivot)
- [ ] Document decision in `status.md`

---

### Continuous Discovery (Week 0 to Week 12)

**Weekly Interviews:**

- [ ] Schedule 2-3 user interviews per week
- [ ] Focus on feedback on completed features
- [ ] Test MCP workflow assumptions
- [ ] Document findings in `continuous_discovery_log.md`

**Prototype Testing:**

- [ ] Test after FU-300 (Design System)
- [ ] Test after FU-700 (Authentication UI)
- [ ] Test after any other UI FUs

**Beta Testing (Week 11-12):**

- [ ] Invite discovery participants + early access signups
- [ ] Provide full access to MVP
- [ ] Collect feedback and bug reports
- [ ] Test end-to-end workflows
- [ ] Validate MCP connection setup

---

### Key Documents Reference

**Lead Sourcing and Filtering:**

- `discovery_lead_sourcing_tools.md` — Tool specifications
- `discovery_filtering_criteria.md` — Enhanced ICP matching criteria
- `discovery_filtering_keywords.md` — Complete keyword reference
- `subscription_detection_strategy.md` — Subscription detection methods
- `cross_platform_signal_detection.md` — Cross-platform signal strategy

**Discovery Activities:**

- `value_discovery_plan.md` — Value discovery details
- `usability_discovery_plan.md` — Usability discovery details
- `business_viability_discovery_plan.md` — Business viability discovery details
- `feasibility_validation_plan.md` — Feasibility validation details
- `continuous_discovery_plan.md` — Continuous discovery details

**Recruitment:**

- `participant_recruitment_log.md` — Recruitment tracking and templates
- `discovery_plan.md` — Discovery overview and coordination

---

### Success Criteria Summary

**Value Discovery:**

- ≥70% validate problem exists
- ≥60% express interest in MCP solution
- ≥50% care about deterministic structured data access
- ≥60% see value in "upload once, query forever" workflow
- Commitment signals present in ≥70% of interviews

**Usability Discovery:**

- ≥80% complete upload without help
- ≥70% complete MCP query successfully
- ≥70% understand uploaded data becomes queryable via AI
- SUS score ≥70
- ≤2 critical usability blockers

**Business Viability:**

- ≥50% express willingness to pay ≥€25/month
- ≥30% express willingness to pay ≥€50/month
- Optimal price point within €25-€125 range
- ≥60% prefer monthly subscription

**Feasibility Validation:**

- 100% OCR reproducibility
- Low-confidence flagging accuracy ≥85%
- Schema detection accuracy >85%
- MCP reliability ≥99.9%
- Performance targets met (<5s P95 upload, <500ms P95 MCP query)

---

### Notes

- All discovery documents are complete and ready for execution
- Lead sourcing tools can be built Week -10 to -9 (2 weeks before discovery starts)
- Agent-driven execution supported after API credential setup
- Two recruitment paths: Survey Path (community posts) and Direct Outreach Path (personalized messages)
- Subscription detection uses multi-method approach (self-reported primary, bio mentions secondary, proxy indicators tertiary)





