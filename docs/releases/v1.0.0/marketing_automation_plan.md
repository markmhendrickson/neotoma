## Release v1.0.0 — Marketing Automation Plan
### Purpose
This document defines the marketing automation system for v1.0.0 that automatically creates content from release data, posts to social media platforms, and measures performance.
**Related Documents:**
- `marketing_plan.md` — Marketing overview and coordination
- `pre_launch_marketing_plan.md` — Pre-launch marketing activities
- `post_launch_marketing_plan.md` — Post-launch marketing activities
- `marketing_metrics_plan.md` — Metrics and tracking
### 1. Automation Overview
- **Status**: Not implemented (planned for MVP automation via agents)
- **Strategy**: Agent-based automation for content generation, scheduling, and publishing using AI agents via MCP or direct API integration
- **Integration**: Agents access Neotoma's marketing data via MCP, generate content, schedule posts, and publish to social platforms
- **Meta-Use Case**: Using Neotoma's own MCP integration to automate Neotoma's marketing workflow
### 2. Components
#### 2.1 Agent-Based Content Generation
**Purpose**: Use AI agents (via MCP or direct API) to automatically generate marketing content from release data and marketing plans.
**Agent Architecture**:
1. **Content Generation Agent** (Claude/ChatGPT via MCP or direct API)
   - Reads marketing schedule from `pre_launch_marketing_plan.md` and `post_launch_marketing_plan.md`
   - Reads release data from `release_report.md`, `manifest.yaml`, `status.md`
   - Generates content drafts based on templates and schedule
   - Outputs platform-specific formats
2. **Content Review Agent** (Optional human-in-the-loop)
   - Reviews generated content for quality and compliance
   - Approves or requests revisions
   - Ensures brand voice consistency
3. **Scheduling Agent**
   - Reads marketing schedule and timing requirements
   - Schedules posts for optimal times per platform
   - Manages timezone-aware scheduling
**Inputs**:
- `release_report.md` — Batch completion, feature units, metrics
- `manifest.yaml` — Release metadata, feature units, dependencies
- `status.md` — Release status, checkpoints, decision log
- `marketing_plan.md` — Platform priorities, messaging, timelines
- `pre_launch_marketing_plan.md` — Weekly content schedule, thread topics
- `post_launch_marketing_plan.md` — Launch sequence, post-launch schedule
**Outputs**:
- Twitter threads (platform-specific format, 5-7 tweets)
- LinkedIn posts (professional format, 300-500 words)
- Blog posts (long-form content, 1500-2500 words)
- Product Hunt descriptions (launch format)
- Hacker News "Show HN" posts (technical format)
- Indie Hackers build-in-public posts
**Agent Instructions**:
- Follow brand voice guidelines (technical, authentic, privacy-first)
- Lead with defensible differentiators (privacy-first, deterministic, cross-platform)
- Use templates from `marketing_plan.md` Section 2.6
- Maintain consistency across platforms
- Include relevant CTAs (waitlist links, signup links)
- Add UTM parameters for tracking
**Content Templates**:
- Launch announcement template
- Feature highlight template
- Metrics showcase template
- Technical deep-dive template
- Build-in-public update template
- Problem/solution thread template
**Service Location**: `src/services/marketing_automation.ts` (agent orchestration) + MCP integration
#### 2.2 Social Media Posting Clients
**Purpose**: Post generated content to target social media platforms.
**Platforms**:
1. **Twitter/X**
   - API: Twitter API v2
   - Client: Extend `src/integrations/providers/x.ts` with write capabilities
   - OAuth: Required (read-only currently, need write permissions)
   - Format: Threads, single posts, media attachments
2. **LinkedIn**
   - API: LinkedIn API
   - Client: `src/integrations/providers/linkedin.ts` (new)
   - OAuth: Required
   - Format: Professional posts, articles
3. **Product Hunt**
   - API: Product Hunt API
   - Client: `src/integrations/providers/product_hunt.ts` (new)
   - OAuth: Required
   - Format: Launch submissions, updates
4. **Hacker News**
   - API: Hacker News API
   - Client: `src/integrations/providers/hacker_news.ts` (new)
   - OAuth: Not required (public API)
   - Format: "Show HN" posts
5. **Indie Hackers**
   - API: Indie Hackers API (if available) or manual posting
   - Client: Manual or API wrapper
   - Format: Build-in-public posts
**OAuth Token Management**:
- Secure credential storage
- Token refresh handling
- Multi-account support (if needed)
#### 2.3 Agent-Based Marketing Automation Workflow
**Purpose**: Use agents to orchestrate content generation, scheduling, and posting based on marketing schedule and release lifecycle events.
**Agent Workflow**:
1. **Schedule Reading Agent**
   - Reads `pre_launch_marketing_plan.md` weekly schedule
   - Identifies upcoming content needs (Twitter threads, blog posts, LinkedIn posts)
   - Creates content generation tasks for each scheduled item
2. **Content Generation Agent** (Claude/ChatGPT via MCP)
   - Receives content task (e.g., "Week -4 Monday: Launch waitlist announcement thread")
   - Reads relevant release data and marketing context
   - Generates content draft following templates and brand guidelines
   - Outputs formatted content (Twitter thread, blog post, etc.)
3. **Content Review Agent** (Optional)
   - Reviews generated content
   - Checks for brand voice consistency
   - Validates CTAs and links
   - Approves or requests revisions
4. **Scheduling Agent**
   - Reads optimal posting times from marketing plan
   - Schedules approved content for specific times
   - Manages timezone-aware scheduling (PST)
   - Queues content for publishing
5. **Publishing Agent**
   - Publishes scheduled content to target platforms
   - Handles platform-specific formatting
   - Manages OAuth tokens and API calls
   - Tracks publishing success/failures
**Integration Points**:
- Release orchestrator completion hooks
- Release status transition triggers
- Marketing schedule from `pre_launch_marketing_plan.md` and `post_launch_marketing_plan.md`
- Weekly/daily cron triggers for scheduled content
**Automated Triggers**:
**Pre-Launch** (Week -4 to Week 0):
- **Weekly**: Agent reads schedule, generates content for upcoming week
- **Week -4 Monday**: Generate waitlist announcement thread → Schedule for Monday 8am PST
- **Week -4 Wednesday**: Generate technical thread → Schedule for Wednesday 8am PST
- **Week -4 Friday**: Generate build-in-public update → Schedule for Friday 8am PST
- **Week -3**: Generate blog post drafts → Schedule for review and publishing
- **Week -2**: Generate beta launch content → Schedule for beta launch day
- **Week 0**: Generate launch prep content → Schedule for launch week
**Post-Launch**:
- **Day 0**: Agent generates launch announcement content → Schedules per launch sequence
- **Day 1-7**: Agent generates waitlist conversion content → Schedules email sends
- **Weekly**: Agent generates organic growth content → Schedules weekly posts
**Scheduling**:
- Launch day sequence per `post_launch_marketing_plan.md` timeline
- Timezone-aware scheduling (PST)
- Platform-specific optimal posting times:
  - Twitter/X: 8am PST (Monday, Wednesday, Friday)
  - LinkedIn: 9am PST (Monday, Thursday)
  - Blog posts: 12pm PST (publish day)
  - Indie Hackers: Monday 8am PST
#### 2.4 Performance Measurement
**Purpose**: Track engagement metrics and link to signup analytics.
**Metrics Tracked**:
- Engagement rate (likes, retweets, shares, comments)
- Click-through rate (CTR)
- Signup conversion rate (via UTM tracking)
- Platform-specific metrics (Product Hunt upvotes, HN points)
**UTM Parameters**:
- Source: Platform name (twitter, product_hunt, hacker_news, etc.)
- Medium: organic, social, referral
- Campaign: launch_announcement, waitlist_building, organic_growth
**Reporting**:
- Real-time metrics dashboard
- Marketing performance reports (`marketing_performance_report.md`)
- Comparison: Pre vs post-launch metrics
- Channel performance analysis
**Integration**:
- Signup analytics (link UTM parameters to signups)
- Usage analytics (link signups to activation)
- Marketing metrics plan alignment
### 3. Implementation Plan
#### Phase 1: Agent-Based Content Generation (MVP)
**Timeline**: Week -4 to Week 0 (Pre-launch)
**Tasks**:
1. **Set up Agent Access**
   - Configure Claude/ChatGPT access via MCP or direct API
   - Create agent instructions for content generation
   - Set up content templates and brand guidelines
2. **Create Marketing Data Access**
   - Expose marketing schedule via MCP tools or structured data
   - Create `marketing_schedule.json` from `pre_launch_marketing_plan.md`
   - Expose release data (`release_report.md`, `manifest.yaml`) via MCP
3. **Agent Content Generation**
   - Use agent to generate content drafts based on schedule
   - Follow templates and brand guidelines
   - Output platform-specific formats
4. **Content Review Workflow**
   - Human review of generated content (optional but recommended)
   - Approval/revision workflow
   - Store approved content for scheduling
**Dependencies**:
- Marketing schedule (`pre_launch_marketing_plan.md`)
- Release data (already exists)
- Agent access (Claude/ChatGPT access (MCP or API)
- Content templates and brand guidelines
**MVP Approach**: Manual agent interaction (use Claude/ChatGPT directly to generate content based on schedule)
#### Phase 2: Automated Scheduling and Publishing (Post-MVP)
**Timeline**: Post-MVP (v1.1+)
**Tasks**:
1. Create `src/services/marketing_automation.ts`
2. Implement automated scheduling agent
3. Implement publishing agent with platform APIs
4. Test end-to-end automation workflow
**Dependencies**:
- Phase 1 complete
- Platform API credentials
- OAuth token management
#### Phase 2: Social Media Posting Clients (Post-MVP)
**Timeline**: Post-MVP (v1.1+)
**Tasks**:
1. Extend `src/integrations/providers/x.ts` with write capabilities
2. Create LinkedIn provider client
3. Create Product Hunt provider client
4. Create Hacker News provider client
5. Implement OAuth token management
6. Test posting workflows
**Dependencies**:
- Platform API credentials
- OAuth app setup for each platform
- Token storage infrastructure
#### Phase 3: Performance Measurement Integration (Post-MVP)
**Timeline**: Post-MVP (v1.1+)
**Tasks**:
1. Implement engagement metrics collection
2. Integrate UTM tracking with signup analytics
3. Create marketing performance reports
4. Build metrics dashboard
**Dependencies**:
- Analytics infrastructure
- UTM parameter handling
- Reporting templates
#### Phase 4: Release Orchestrator Integration (Post-MVP)
**Timeline**: Post-MVP (v1.1+)
**Tasks**:
1. Add marketing automation hooks to release orchestrator
2. Implement trigger system for release lifecycle events
3. Integrate scheduled posting
4. Test end-to-end automation workflow
**Dependencies**:
- Phases 1-3 complete
- Release orchestrator hooks
- Scheduling infrastructure
### 4. Technical Requirements
#### 4.1 Infrastructure
- **LLM API**: For content generation (OpenAI, Anthropic, etc.)
- **OAuth Storage**: Secure credential storage (environment variables, secrets manager)
- **Scheduling**: Cron jobs or task queue for scheduled posting
- **Analytics**: Integration with signup and usage analytics
#### 4.2 API Credentials
**Required**:
- Twitter API v2 credentials (read + write)
- LinkedIn API credentials
- Product Hunt API credentials (if available)
- Hacker News API (public, no credentials needed)
**Setup**:
- OAuth app creation per platform
- Token refresh handling
- Multi-environment support (dev, staging, production)
#### 4.3 Error Handling
- Failed posting retry logic
- Content generation fallbacks
- Rate limiting handling
- Platform API error recovery
### 5. Success Criteria
**Automation Success**:
- Content generated automatically from release data
- Posts scheduled and published per timeline
- Performance metrics collected automatically
- UTM tracking links signups to marketing channels
**Quality Criteria**:
- Content quality matches manual creation
- Posting success rate ≥95%
- Metrics accuracy ≥98%
- Zero manual intervention required for standard workflow
### 6. Limitations and Manual Overrides
**Automation Limitations**:
- Complex messaging may require manual review
- Platform policy compliance (manual review recommended)
- Crisis communication (manual override required)
**Manual Override Points**:
- Content approval before posting (optional)
- Emergency stop mechanism
- Manual posting fallback
### 7. Related Documents
- `marketing_plan.md` — Marketing overview and coordination
- `pre_launch_marketing_plan.md` — Pre-launch marketing activities
- `post_launch_marketing_plan.md` — Post-launch marketing activities
- `marketing_metrics_plan.md` — Metrics and tracking
- `marketing_plan.md` — Marketing overview and coordination
### 8. Status
- **Current Status**: Not implemented (planned for post-MVP)
- **Owner**: Mark Hendrickson
- **Implementation Guide**: See `marketing_automation_implementation.md` for concrete implementation steps
- **Next Steps**:
  1. Complete MVP release (v1.0.0)
  2. Evaluate manual marketing performance
  3. Prioritize automation implementation (v1.1+)
  4. Begin Phase 1 implementation (see implementation guide)
