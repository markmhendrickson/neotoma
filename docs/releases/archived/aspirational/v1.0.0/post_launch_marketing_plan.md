## Release v1.0.0 — Post-Launch Marketing Plan

### Purpose
This document defines post-preview marketing activities for v1.0.0, deferred until after developer preview validation and stabilization. Marketing activities proceed only if dogfooding and external feedback are sufficient, otherwise discovery is scheduled first.

**Related Documents:**
- `marketing_plan.md` — Marketing overview and coordination
- `pre_launch_marketing_plan.md` — Build-in-public content plan (during build phase)
- `marketing_segments_plan.md` — User segment definitions
- `marketing_metrics_plan.md` — Metrics and tracking
- `marketing_dogfooding_analysis.md` — Analysis of pre-launch marketing for dogfooding-first approach
- `visibility_timing_analysis.md` — Visibility timing risk and build-in-public strategy
- `approach_comparison.md` — Discovery-first vs. dogfooding-first comparative analysis

### 1. Post-Launch Overview
- **Timeline**: Deferred until after developer preview validation and stabilization
- **Conditional**: Proceed if dogfooding and external feedback are sufficient, otherwise schedule discovery
- **Strategy**: Organic only (no paid acquisition for MVP)
- **Goals**: Maximize signups, build waitlist, build organic growth, reengage users
- **Prerequisite**: Product must work for ateles integration and preview signals must be strong
### 2. Launch Announcement (Post-Preview Stabilization)

#### 2.1 Timeline and Channels
- **Timeline**: After preview stabilization and any required discovery
- **Conditional**: Only if preview signals are sufficient
- **Channels**: Product Hunt, Hacker News, Twitter, Indie Hacker, Email, Blog
- **Platform Priority**: P0 platforms (Twitter, Indie Hackers, Product Hunt, Hacker News) prioritized for launch day maximum reach

#### 2.2 Launch Sequence (Post-Preview)
- **00:01 PST**: Product Hunt launch — **Use personal maker account**
- **06:00 PST**: Hacker News Show HN post — **Use personal account**
- **08:00 PST**: Twitter announcement thread — **Use personal account**
- **09:00 PST**: Email to waitlist (convert to signups) — **If waitlist exists**
- **10:00 PST**: Indie Hacker launch post — **Use personal account**
- **12:00 PST**: Blog post announcement
- **Throughout day**: Engage with comments, respond to questions — **Use personal accounts**
- **Note**: All social media activities use personal accounts (see `marketing_plan.md` Section 2.6 for personal vs. company account strategy)
#### 2.3 Goals
- New signups
- Press coverage
- Viral growth
- Community engagement
#### 2.4 Metrics
| Metric               | Target                      | Tracking                        |
| -------------------- | --------------------------- | ------------------------------- |
| Day 1 signups        | 50 (conservative for day 1) | Signup analytics by channel     |
| Product Hunt upvotes | 100                         | Product Hunt dashboard          |
| Hacker News points   | 50 (modest goal)            | HN thread score                 |
| Press mentions       | 2 (blogs, newsletters)      | Manual tracking + Google Alerts |
| Social shares        | 100                         | Twitter shares, retweets        |
### 3. Waitlist Building and Conversion (Post-Preview)

#### 3.1 Timeline and Target
- **Timeline**: After preview stabilization and any required discovery
- **Conditional**: Only if preview signals are sufficient
- **Target**: Build waitlist, then convert (targets TBD after dogfooding validation)

#### 3.2 Waitlist Building (Post-Preview)
- **After preview stabilization**: Launch waitlist (now that product is validated)
- **Channels**: Twitter, LinkedIn, blog, Indie Hackers, Hacker News
- **Message**: "I've been dogfooding Neotoma in my ateles integration. It works. Here's what I built..."

#### 3.3 Email Sequence (Post-Dogfooding)
- **Day 0**: Launch announcement + signup link + early adopter pricing
- **Day 3**: Feature deep-dive (privacy-first architecture, deterministic extraction, cross-platform MCP access)
- **Day 7**: Dogfooding insights + defensible differentiators recap + last call for early adopter pricing
#### 3.3 Goals
- Waitlist to signup conversion
- Activation (signup → first upload)
#### 3.4 Metrics
| Metric                   | Target                       | Tracking                               |
| ------------------------ | ---------------------------- | -------------------------------------- |
| Waitlist conversion rate | 40% (waitlist → signup)      | Email opens, clicks, signups by source |
| Waitlist activation rate | 60% (signups → first upload) | Usage analytics                        |
### 4. Organic Growth (Post-Preview)

#### 4.1 Timeline and Channels
- **Timeline**: After preview stabilization and any required discovery
- **Conditional**: Only if preview signals are sufficient
- **Channels**: Twitter, blog, community, word of mouth
- **Platform Priority**: P0 platforms (Twitter) for sustained engagement; P1 platforms (LinkedIn, Reddit, Discord) added for growth
#### 4.2 Activities
- **Weekly**: Twitter threads on use cases, tips, workflows — **Use personal account**
- **Weekly**: Blog post (tutorial, case study, or technical deep-dive)
- **Ongoing**: Engage with AI tool communities (Reddit, Discord, Indie Hackers) — **Use personal accounts**
- **Ongoing**: Respond to user feedback publicly (build in public) — **Use personal accounts**
- **Ongoing**: Competitor follower outreach (see Section 4.3) — **Use personal accounts**
- **Note**: All social media activities use personal accounts (see `marketing_plan.md` Section 2.6 for personal vs. company account strategy)
#### 4.3 Competitor Follower Outreach
**Timeline**: Week 1 to Week 4 (continued from pre-launch)
**Target Competitors**:
- Supermemory.ai (High risk - direct MCP competitor)
- MCP Memory Tools (MemCP, MemMachine, OpenMemory MCP, Mem0 MCP Server, Cognee, CoreMemory-MCP, In Memoria, Roampal, Memara - High risk - direct MCP competitors)
- AI Memory Tools (Mem0, LangChain Memory, Zep, LangMem - Medium-High risk)
- Model Provider Native Memory (OpenAI ChatGPT Memory, Anthropic Claude Memory, Google Gemini Personal Context - Very High risk)
**Platforms**: Twitter/X, LinkedIn, Reddit, Discord
**Activities**:
1. **Monitor Competitor Discussions**
   - Track competitor product updates, feature announcements
   - Identify users expressing dissatisfaction or limitations
   - Find users asking about alternatives or specific features
2. **Value-First Engagement**
   - Answer questions about AI memory challenges authentically
   - Share Neotoma content when directly relevant (privacy, determinism, cross-platform, entity resolution)
   - Provide comparisons when users explicitly ask about alternatives
   - Avoid promotional spam; focus on helpful contributions
3. **Conversion Tactics**
   - When users mention pain points Neotoma solves, offer to help
   - Share Neotoma launch announcement in relevant communities
   - Invite competitor users to try Neotoma for specific use cases
   - Offer migration guidance for users switching from competitors
**Goals**:
- Generate organic signups from competitor users
- Build awareness as viable alternative
- Capture users dissatisfied with competitor limitations
**Metrics**:
| Metric                          | Target | Tracking                                    |
| ------------------------------- | ------ | ------------------------------------------- |
| Competitor follower engagements | 100    | Manual tracking (comments, replies, shares) |
| Organic signups from outreach   | 20     | UTM tracking (competitor-outreach source)   |
| Community mentions              | 50     | Manual tracking (Discord, Reddit mentions)  |
#### 4.3 Goals
- Organic signups
- SEO traffic
- Community building
#### 4.4 Metrics
| Metric                      | Target                     | Tracking                                  |
| --------------------------- | -------------------------- | ----------------------------------------- |
| Organic signups             | 100 (Week 1-4 total)       | Signup analytics (non-paid sources)       |
| Content to signup rate      | 3% (blog/twitter → signup) | UTM tracking                              |
| Organic search traffic      | 500 (visits from Google)   | Google Analytics                          |
| Competitor outreach signups | 20 (from Section 4.3)      | UTM tracking (competitor-outreach source) |
### 5. Partnership Outreach (Post-Preview)

#### 5.1 Timeline and Targets
- **Timeline**: After preview stabilization and any required discovery
- **Conditional**: Only if preview signals are sufficient
- **Targets**:
  - **MCP Directories** (Primary):
    - [Model Context Protocol Directory](https://model-context-protocol.com/) — Official MCP directory
    - [Open MCP Directory](https://www.openmcpdirectory.com/) — Comprehensive daily-updated listing
    - [MCP Store](https://www.mcpstore.site/) — Curated MCP servers and clients
    - [MCP Ecosystem Directory](https://mcpez.com/) — 11,790+ MCP servers repository
    - [MCP Index](https://mcpindex.net/) — Curated collection with real-time updates
    - [MCP Curator](https://www.mcpcurator.com/) — 846+ MCP tools organized by category
    - [MCP Directory](https://directorymcp.com/) — Centralized resource listing
    - [MCP Server Directory](https://www.mcpdirectory.info/) — Browse/search/filter platform
    - [MCP Server Directory](https://mcpserverdirectory.org/) — 2,500+ MCP resources
    - [FindMCPs](https://findmcps.com/) — Comprehensive discovery platform
  - **AI Tool Directories** (Secondary):
    - There's An AI For That
    - Future Tools
    - AI Tools
    - Product Hunt (already in launch sequence)
  - **Productivity Communities**:
    - Notion community
    - Obsidian community
    - Roam community
  - **Indie Hacker Resources**:
    - Indie hacker podcasts
    - Indie hacker newsletters
#### 5.2 Submission Strategy (Post-Preview)
**After preview stabilization**:
- Submit to MCP directories (now that product is validated)
- Update MCP directory listings with working product information
- Submit to AI tool directories (There's An AI For That, Future Tools, AI Tools)
- Submit to productivity communities (Notion, Obsidian, Roam)
- Reach out to indie hacker podcasts/newsletters
- Monitor directory referral traffic

**Week 13-14** (If proceeding):
- Follow up on pending directory submissions
- Continue monitoring directory performance
- Update directory listings with dogfooding insights/case studies
- Optimize directory listings based on performance data
- Build relationships with directory maintainers
#### 5.3 Goals
- Referral signups from directory listings
- Backlinks for SEO
- Directory visibility in MCP ecosystem
- Establish Neotoma as recognized MCP server
- Reach AI-Native Individual Operators discovering MCP tools
#### 5.4 Metrics
| Metric                     | Target | Tracking                              |
| -------------------------- | ------ | ------------------------------------- |
| MCP directory listings     | 10     | Manual tracking (all MCP directories) |
| AI tool directory listings | 3      | Manual tracking                       |
| Directory referral signups | 30     | Signup analytics (referral sources)   |
| Directory referral traffic | 500    | Website analytics (referral sources)  |
| Directory to signup rate   | 6%     | UTM tracking (directory source)       |
| Backlinks acquired         | 15     | Ahrefs or manual tracking             |
### 6. User Reengagement
#### 6.1 Onboarding Nudges
**Timeline**: Day 0 to Week 4
**Target Segments**: signed_up_no_upload, uploaded_no_timeline, uploaded_no_mcp
**Triggers and Messages:**
1. **signed_up_no_upload_3_days**
   - Message: "Ready to upload your first document? Start with a bank statement or receipt."
   - Channels: Email, in-app banner
2. **uploaded_no_timeline_7_days**
   - Message: "You've uploaded X documents. Check out your timeline view to see them chronologically."
   - Channels: Email, in-app prompt
3. **uploaded_no_mcp_14_days**
   - Message: "Unlock the full power of Neotoma: Query your documents via Claude or ChatGPT with MCP."
   - Channels: Email, in-app tutorial
**Goals**: Activation, feature discovery, habit formation
**Metrics:**
| Metric                   | Target                                    | Tracking                          |
| ------------------------ | ----------------------------------------- | --------------------------------- |
| Nudge response rate      | 15% (users who act on nudge)              | Email clicks, in-app interactions |
| Nudge to activation rate | 40% (responded users who complete action) | Usage analytics                   |
#### 6.2 Usage Tips Campaign
**Timeline**: Week 2 to Week 4
**Target Segment**: activated_users
**Email Series:**
- **Week 2**: Power user tips (keyboard shortcuts, bulk upload, CSV handling)
- **Week 3**: MCP setup walkthrough (step-by-step for Claude + ChatGPT)
- **Week 4**: Advanced workflows (multi-event documents, timeline filters)
**Goals**: Retention, advanced feature adoption, power user conversion
**Metrics:**
| Metric                  | Target                           | Tracking        |
| ----------------------- | -------------------------------- | --------------- |
| Email open rate         | 35%                              | Email analytics |
| Tip to feature adoption | 20% (users who try featured tip) | Usage analytics |
### 7. Success Criteria (Post-Preview)

**Prerequisite**: Product must work for ateles integration and preview signals must be strong

**Post-Preview Marketing** (If proceeding):
- Success criteria TBD after dogfooding validation
- Typical targets (to be confirmed):
  - ≥50 signups Day 1
  - ≥200 signups Week 1
  - ≥40% waitlist conversion rate (if waitlist exists)
  - ≥100 organic signups (non-waitlist) Week 1-4
  - ≥60% overall activation rate (signup → first upload)
  - ≥15% nudge response rate
  - ≥20% tip to feature adoption rate
### 8. Budget (Post-Dogfooding)

- **Total**: $0 (organic only for MVP)
- **Time Investment**: ~60 hours (launch activities, content, community)
- **Conditional**: Only if dogfooding validates product works
**Note**: Paid acquisition deferred to post-MVP (v1.1+) after organic validation
### 9. Related Documents
- `marketing_plan.md` — Marketing overview and coordination
- `pre_launch_marketing_plan.md` — Build-in-public content plan (during build phase)
- `marketing_segments_plan.md` — User segment definitions
- `marketing_metrics_plan.md` — Metrics and tracking
- `marketing_dogfooding_analysis.md` — Analysis of pre-launch marketing for dogfooding-first approach
- `visibility_timing_analysis.md` — Visibility timing risk and build-in-public strategy
- `approach_comparison.md` — Discovery-first vs. dogfooding-first comparative analysis