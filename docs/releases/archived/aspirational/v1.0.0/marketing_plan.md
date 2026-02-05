## Release v1.0.0 — Marketing Plan

### Purpose

This document provides the overview and coordination framework for v1.0.0 marketing activities. Detailed marketing activities are decomposed into separate topic-specific documents:

- `pre_launch_marketing_plan.md` — Pre-launch user acquisition and activities
- `post_launch_marketing_plan.md` — Post-launch user acquisition and reengagement
- `marketing_segments_plan.md` — User segment definitions and targeting
- `marketing_metrics_plan.md` — Metrics, tracking, and efficacy comparison framework
  **Related Documents:**
- `release_plan.md` — Release overview and scope
- `discovery_plan.md` — Discovery activities

### 1. Marketing Overview

- **Strategy**: Developer preview and dogfooding first, build in public during build, discovery deferred unless validation is insufficient
- **Approach**: Build in public content during build phase, release developer preview during dogfooding once core invariants are stable, defer discovery and broader marketing unless internal and external validation is weak
- **Owner**: Mark Hendrickson
- **Status**: Not started
- **Budget**: $0 (organic only for MVP)
- **Rationale**: Build for personal use (ateles integration) first, validate through real usage, add discovery later only if preview signals are insufficient
  **Related Documents:**
- `approach_comparison.md` — Discovery-first vs. dogfooding-first comparative analysis
- `marketing_dogfooding_analysis.md` — Pre-launch marketing analysis for dogfooding-first approach
- `visibility_timing_analysis.md` — Visibility timing risk and build-in-public strategy

### 2. Marketing Activities Summary

#### 2.1 Build-in-Public Content and Developer Preview (During Build Phase)

**See `pre_launch_marketing_plan.md` for complete details (reframed as build-in-public content plan).**

- **Timeline**: Week 0-12 (during build and dogfooding)
- **Tactics**: Technical threads, blog posts, progress updates, reactive content to industry announcements, community engagement
- **Developer Preview**: Release during dogfooding once core invariants are stable, no waitlist or beta promises
- **Target Segments**: AI-Native Individual Operators, High-Context Knowledge Workers, MCP ecosystem
- **Success Criteria**: Technical credibility, thought leadership positioning, community engagement, preview validation signals
- **No Waitlist/Beta**: Just sharing learnings and preview access, not marketing

#### 2.2 Post-Preview Marketing (Deferred)

**See `post_launch_marketing_plan.md` for complete details (updated for post-preview timeline).**

- **Timeline**: After developer preview validation and stabilization
- **Tactics**: Launch announcement, waitlist building, organic growth, partnership outreach (MCP directories, AI tool directories), competitor follower outreach
- **Reengagement**: Onboarding nudges, usage tips campaign
- **Success Criteria**: TBD after preview validation
- **Conditional**: Proceed if dogfooding and external feedback are sufficient, otherwise schedule discovery

#### 2.3 User Segments

**See `marketing_segments_plan.md` for complete details.**

- **Acquisition Targets**: AI-Native Individual Operators (P0), High-Context Knowledge Workers (P1)
- **Reengagement Targets**: signed_up_no_upload, uploaded_no_timeline, uploaded_no_mcp, activated_users

#### 2.4 Metrics and Tracking

**See `marketing_metrics_plan.md` for complete details.**

- **Preview Metrics**: Dependence signals, trust in explicit mutations, quality of external feedback
- **Acquisition Metrics**: Waitlist signups, conversion rates, organic signups, channel performance, post-preview only
- **Reengagement Metrics**: Nudge response rates, activation rates, feature adoption, post-preview only
- **Efficacy Comparison**: Preview signals versus post-preview metrics

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

### 3. Marketing Timeline

**Build Phase (Week 0-12):**

- **Build-in-Public Content** (ongoing, ~10-15 hours/month):
  - Technical threads on Twitter (weekly progress, learnings)
  - Blog posts (technical deep-dives, architectural decisions)
  - Indie Hackers progress updates (weekly)
  - Reactive content to industry announcements (2-3 hours per announcement)
  - Community engagement (MCP ecosystem, relevant discussions)
  - **No waitlist or beta**: Just sharing, not marketing
- **Developer Preview Release** (during dogfooding):
  - Release developer preview once core invariants are stable
  - Document precision disclaimers and explicit mutation guarantees
    **Preview Validation Checkpoint (Week 8-12):**
- Assess: Does product work for ateles integration?
- Evaluate: Internal dependence and external feedback quality
- Decision: Stabilize and expand, or schedule discovery if signals are insufficient
  **Conditional Discovery (If Needed):**
- Conduct discovery only if preview validation is weak or ambiguous
- Validate market fit, pricing, competitive positioning with working product
  **Post-Preview Marketing (If Proceeding):**
- Launch waitlist after preview stabilization
- Launch announcement with developer preview framing
- Post-launch marketing campaigns (Week 1-4 after stabilization)

### 4. Budget

**Build Phase (Build-in-Public Content):**

- Total: $0 (organic only)
- Time investment: ~10-15 hours/month (technical content, community engagement)
- **Focus**: Thought leadership, not marketing
  **Post-Dogfooding Marketing (If Proceeding):**
- Total: $0 (organic only for MVP)
- Time investment: ~60 hours (launch activities, content, community)
- **Conditional**: Only if dogfooding validates product works
  **Note**: Paid acquisition deferred to post-MVP (v1.1+) after organic validation

### 5. Success Criteria

#### 5.1 Build Phase (Build-in-Public Content)

- Technical credibility established (thought leadership positioning)
- Community engagement (MCP ecosystem, relevant discussions)
- Visibility during industry announcements (reactive content gets 3-5x engagement)
- No premature commitments (no waitlist/beta expectations)

#### 5.2 Developer Preview Validation

- Product works for ateles integration (primary validation)
- Dependence signal: would loss of Neotoma materially disrupt work
- Trust signal: explicit mutations and provenance feel reliable
- External feedback quality: clear use cases and concrete issues, not volume
- Decision: Stabilize and expand, or schedule discovery if signals are insufficient

#### 5.3 Post-Preview Marketing (If Proceeding)

- TBD after preview validation
- Success criteria will be defined based on preview signals or discovery findings
- Typical targets: ≥50 signups Day 1, ≥200 signups Week 1, ≥40% waitlist conversion rate

### 6. Document Index

This marketing plan coordinates the following topic-specific documents:
**Marketing Activity Plans:**

- `pre_launch_marketing_plan.md` — Build-in-public content plan (during build phase, dogfooding-first approach)
- `post_launch_marketing_plan.md` — Post-launch user acquisition and reengagement tactics (deferred until after dogfooding)
- `marketing_segments_plan.md` — User segment definitions, targeting, and messaging
- `marketing_metrics_plan.md` — Metrics definitions, tracking, and efficacy comparison
- `marketing_automation_plan.md` — Automated content generation, posting, and performance measurement
- `marketing_automation_implementation.md` — Concrete implementation steps and code examples
  **Metadata and Tracking:**
- Marketing reports (generated after marketing phases)
  **Related Documents:**
- `release_plan.md` — Release overview and scope
- `discovery_plan.md` — Discovery activities

### 7. Status

- **Current Status**: Not started
- **Owner**: Mark Hendrickson
- **Approach**: Developer preview and dogfooding first, discovery deferred unless validation is insufficient
- **Next Steps**:
  1. Begin build-in-public content (Week 0-12, ongoing)
  2. Share technical learnings (determinism, MCP integration, entity resolution)
  3. Respond to industry announcements (reactive content, 2-3 hours per announcement)
  4. Engage with MCP ecosystem (community engagement, 2-3 hours/week)
  5. Dogfood Neotoma in ateles integration (validate through real usage)
  6. Release developer preview during dogfooding once core invariants are stable
  7. Preview validation checkpoint: assess dependence and external feedback quality
  8. If signals are weak: schedule discovery with working product
  9. If signals are strong: stabilize and proceed to post-preview marketing
