## Release v1.0.0 — Marketing Plan

_(Pre-Launch and Post-Launch Marketing Strategy — Overview and Coordination Document)_

---

### Purpose

This document provides the overview and coordination framework for v1.0.0 marketing activities. Detailed marketing activities are decomposed into separate topic-specific documents:

- `pre_launch_marketing_plan.md` — Pre-launch user acquisition and activities
- `post_launch_marketing_plan.md` — Post-launch user acquisition and reengagement
- `marketing_segments_plan.md` — User segment definitions and targeting
- `marketing_metrics_plan.md` — Metrics, tracking, and efficacy comparison framework

**Related Documents:**

- `release_plan.md` — Release overview and scope
- `discovery_plan.md` — Discovery activities

---

### 1. Marketing Overview

- **Strategy**: Hybrid (pre-launch + post-launch)
- **Owner**: Mark Hendrickson
- **Status**: Not started
- **Budget**: $0 (organic only for MVP)

---

### 2. Marketing Activities Summary

#### 2.1 Pre-Launch Marketing

**See `pre_launch_marketing_plan.md` for complete details.**

- **Timeline**: Week -4 to Week 0
- **Tactics**: Waitlist building, early access beta, content teasers, competitor follower outreach
- **Target Segments**: AI-Native Individual Operators, High-Context Knowledge Workers
- **Success Criteria**: ≥100 waitlist signups, ≥25 beta participants, ≥70% beta activation rate, ≥10 waitlist signups from competitor outreach

#### 2.2 Post-Launch Marketing

**See `post_launch_marketing_plan.md` for complete details.**

- **Timeline**: Day 0 to Week 4
- **Tactics**: Launch announcement, waitlist conversion, organic growth, partnership outreach, competitor follower outreach
- **Reengagement**: Onboarding nudges, usage tips campaign
- **Success Criteria**: ≥50 signups Day 1, ≥200 signups Week 1, ≥40% waitlist conversion rate, ≥20 organic signups from competitor outreach

#### 2.3 User Segments

**See `marketing_segments_plan.md` for complete details.**

- **Acquisition Targets**: AI-Native Individual Operators (P0), High-Context Knowledge Workers (P1)
- **Reengagement Targets**: signed_up_no_upload, uploaded_no_timeline, uploaded_no_mcp, activated_users

#### 2.4 Metrics and Tracking

**See `marketing_metrics_plan.md` for complete details.**

- **Acquisition Metrics**: Waitlist signups, conversion rates, organic signups, channel performance
- **Reengagement Metrics**: Nudge response rates, activation rates, feature adoption
- **Efficacy Comparison**: Pre vs post-launch comparison framework

#### 2.5 Platform Prioritization

**Platform Selection Rationale:**

Platforms prioritized based on target segment alignment, engagement potential, and organic reach:

**P0 (Primary Platforms):**

1. **Twitter/X** — Highest concentration of AI-Native Individual Operators (P0 segment); supports technical threads, demos, build-in-public content
2. **Indie Hackers** — Strong overlap with AI-Native Operators and founders; build-in-public community; early adopter focus
3. **Product Hunt** — Launch day visibility; targets early adopters; high conversion potential
4. **Hacker News** — Technical audience (developers, knowledge workers); "Show HN" format fits product demos

**P1 (Secondary Platforms):** 5. **LinkedIn** — Targets High-Context Knowledge Workers (P1 segment); professional use cases and case studies 6. **Reddit** — AI tool communities (r/ChatGPT, r/ClaudeAI, r/Cursor); community engagement 7. **Discord** — AI tool Discord servers; community engagement

**P2 (Tertiary Platforms):** 8. **GitHub** — Developer audience; MCP integration visibility 9. **Blog/Content Marketing** — SEO and thought leadership; technical deep-dives 10. **Email** — Waitlist conversion; reengagement campaigns

**Launch Focus:** Twitter/X, Indie Hackers, Product Hunt, Hacker News for Day 0 launch. Add LinkedIn and Reddit/Discord for sustained Week 1-4 growth.

#### 2.6 Personal vs. Company Accounts Strategy

**Strategy**: Dual-account approach — personal accounts for authenticity and building in public, company accounts for brand consistency and official announcements.

**Personal Accounts (Primary for MVP):**

**Why Personal Accounts Matter:**

- **Authenticity**: Solo founder personal accounts have higher trust and engagement
- **Existing Network**: Personal accounts already have followers/connections
- **Building in Public**: Personal accounts better suited for transparent development updates
- **Early Stage**: Company accounts have no followers yet; personal accounts have established presence
- **Community Building**: Personal accounts enable authentic community engagement

**Personal Account Usage:**

1. **Twitter/X** — Use personal account (@markymark)

   - Build-in-public updates
   - Technical threads and demos
   - Community engagement
   - Competitor follower outreach
   - Link to Neotoma in bio/pinned tweet

2. **LinkedIn** — Use personal account (Mark Hendrickson)

   - Professional use cases and case studies
   - Thought leadership content
   - Link to company page
   - Share company page posts

3. **Indie Hackers** — Use personal account

   - Build-in-public updates
   - Product development journey
   - Community engagement

4. **Hacker News** — Use personal account

   - "Show HN" posts
   - Technical discussions
   - Community engagement

5. **Product Hunt** — Use personal maker account
   - Launch day product submission
   - Maker reputation building

**Company Accounts (Secondary for MVP):**

**Why Company Accounts Matter:**

- **Brand Consistency**: Official Neotoma presence
- **SEO**: Company accounts improve search visibility
- **Professional Credibility**: Official company presence for enterprise/partnership discussions
- **Future Scaling**: Foundation for team expansion

**Company Account Usage:**

1. **Twitter/X** — Register `@neotomaio` or `@useneotoma` (when available)

   - Official announcements
   - Retweet/share personal account content
   - Link to personal account
   - Defer active use until post-MVP (focus on personal account for MVP)

2. **LinkedIn** — Create `/company/neotoma` company page

   - Official company presence
   - Link from personal profile
   - Share company updates
   - Professional credibility

3. **Other Platforms** — Register company handles but defer active use
   - Instagram, Facebook, Reddit (reserve handles, defer active use)
   - Focus on personal accounts for MVP

**MVP Strategy (v1.0.0):**

- **Primary**: Personal accounts (Twitter/X, LinkedIn, Indie Hackers, Hacker News, Product Hunt)
- **Secondary**: Company accounts (register handles, create company page, link from personal accounts)
- **Post-MVP**: Shift to company accounts as primary as brand recognition grows

**Action Items:**

- [ ] Ensure personal Twitter/X account bio mentions Neotoma
- [ ] Pin Neotoma-related tweet to personal Twitter/X profile
- [ ] Link Neotoma website in personal LinkedIn profile
- [ ] Create LinkedIn company page and link from personal profile
- [ ] Register company Twitter/X handle (`@neotomaio` or `@useneotoma`) but defer active use
- [ ] Use personal accounts for all MVP marketing activities

#### 2.7 Marketing Automation

**Automation Strategy:**

Automated marketing system that creates content from release data, posts to social platforms, and measures performance.

**Components:**

1. **Content Generation Service**

   - Extracts key metrics from `release_report.md` (batch completion, feature units, metrics)
   - Generates platform-specific formats (Twitter threads, LinkedIn posts, etc.)
   - Uses release manifest, status, and marketing plan data
   - LLM-based content generation with templates

2. **Social Media Posting Clients**

   - Extends `src/integrations/providers/x.ts` with write capabilities (Twitter API v2 posting)
   - Adds LinkedIn, Product Hunt, Hacker News APIs
   - OAuth token management for posting accounts (personal accounts for MVP)
   - Platform-specific formatting and scheduling

3. **Marketing Automation Workflow**

   - Hooks into release orchestrator completion
   - Triggers on release status transitions (`ready_for_deployment` → `deployed`)
   - Schedules posts per `marketing_plan.md` timeline
   - Integrates with release orchestrator lifecycle

4. **Performance Measurement**
   - Tracks engagement metrics (likes, retweets, clicks, shares)
   - Links to signup analytics via UTM parameters
   - Generates marketing performance reports
   - Compares pre vs post-launch metrics

**Implementation:**

- **Service**: `src/services/marketing_automation.ts`
- **Integration**: Extends release orchestrator to trigger marketing automation on release completion
- **Metrics Collection**: Marketing metrics tracking integrated with analytics

**Automation Triggers:**

- **Pre-Launch**: Week -4 (waitlist building), Week -2 (beta launch), Week 0 (launch prep)
- **Post-Launch**: Day 0 (launch announcement), Day 1-7 (waitlist conversion), Week 1-4 (organic growth)

**Status**: Not implemented (planned for post-MVP automation)

---

### 3. Marketing Timeline

**Pre-Launch (Week -4 to Week 0):**

- Week -4: Begin waitlist building, start content creation
- Week -3: Continue waitlist building, publish first content pieces
- Week -2: Launch early access beta, continue content marketing
- Week -1: Continue beta testing, finalize launch materials
- Week 0: Final beta feedback, prepare launch announcement

**Post-Launch (Day 0 to Week 4):**

- Day 0: Launch announcement across all channels
- Day 1-7: Waitlist conversion campaigns, launch follow-up
- Week 2: Organic growth activities, partnership outreach begins
- Week 3-4: Continued organic growth, usage tips campaigns, reengagement

---

### 4. Budget

**Pre-Launch:**

- Total: $0 (organic only)
- Time investment: ~40 hours (content creation, community engagement)

**Post-Launch:**

- Total: $0 (organic only for MVP)
- Time investment: ~60 hours (launch activities, content, community)

**Note**: Paid acquisition deferred to post-MVP (v1.1+) after organic validation

---

### 5. Success Criteria

#### 5.1 Pre-Launch

- ≥100 waitlist signups
- ≥25 beta participants
- ≥70% beta activation rate
- ≥5 testimonials collected

#### 5.2 Post-Launch

- ≥50 signups Day 1
- ≥200 signups Week 1
- ≥40% waitlist conversion rate
- ≥100 organic signups (non-waitlist) Week 1-4
- ≥60% overall activation rate (signup → first upload)

---

### 6. Document Index

This marketing plan coordinates the following topic-specific documents:

**Marketing Activity Plans:**

- `pre_launch_marketing_plan.md` — Pre-launch user acquisition tactics and activities
- `post_launch_marketing_plan.md` — Post-launch user acquisition and reengagement tactics
- `marketing_segments_plan.md` — User segment definitions, targeting, and messaging
- `marketing_metrics_plan.md` — Metrics definitions, tracking, and efficacy comparison
- `marketing_automation_plan.md` — Automated content generation, posting, and performance measurement
- `marketing_automation_implementation.md` — Concrete implementation steps and code examples

**Metadata and Tracking:**

- Marketing reports (generated after marketing phases)

**Related Documents:**

- `release_plan.md` — Release overview and scope
- `discovery_plan.md` — Discovery activities

---

### 7. Status

- **Current Status**: Not started
- **Owner**: Mark Hendrickson
- **Next Steps**:
  1. Begin pre-launch marketing (Week -4)
  2. Launch waitlist building campaign
  3. Create pre-launch content
  4. Launch early access beta (Week -2)
  5. Prepare launch announcement materials
  6. Execute launch day activities (Day 0)
  7. Execute post-launch marketing campaigns (Week 1-4)
  8. Evaluate marketing performance for automation planning (post-MVP)
