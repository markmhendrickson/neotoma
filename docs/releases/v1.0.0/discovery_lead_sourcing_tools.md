## Release v1.0.0 — Discovery Lead Sourcing Tools
### Purpose
This document defines tools for sourcing discovery participants from LinkedIn Sales Navigator, Twitter/X, Indie Hackers, GitHub, Reddit/Discord, and other platforms. These tools enable efficient ICP filtering and participant identification for discovery activities.
**Related Documents:**
- `discovery_plan.md` — Discovery overview and coordination
- `participant_recruitment_log.md` — Participant tracking
- `value_discovery_plan.md` — Value discovery activities
- `cross_platform_signal_detection.md` — Strategy for detecting signals across target platform and linked platforms
### 1. Overview
**Goal**: Automate and streamline discovery participant sourcing across multiple platforms with ICP filtering capabilities.
**Timeline**: Build before Week -8 (discovery start)
**Tools Required**:
- LinkedIn Sales Navigator export tool (for finding new leads)
- LinkedIn Connections export tool (for exporting your existing connections)
- Twitter/X search and filtering tool
- Indie Hackers API/search tool
- GitHub user search tool
- Reddit/Discord search tool
- Unified export format (CSV/JSON)
### 2. Platform-Specific Tools
#### 2.1 LinkedIn Sales Navigator Tool
**Purpose**: Export and filter leads from Sales Navigator with ICP criteria
**Capabilities**:
- Connect to Sales Navigator API (or manual export workflow)
- Filter by:
  - Job title keywords ("founder", "indie hacker", "AI engineer", "product manager")
  - Industry
  - Company size (1-10 employees for indie hackers)
  - Keywords in profile/headline
  - Location
- Extract linked profiles: Twitter/X, GitHub, personal website (if linked in LinkedIn profile)
- Cross-platform signal detection: Check LinkedIn posts + linked platform posts (Twitter/X, GitHub)
- Export filtered results to CSV
- Limit: 500-1,000 contacts per export (Sales Navigator native limit)
**Signal Detection Strategy**:
1. **Primary**: Check LinkedIn posts (target platform)
   - Search recent LinkedIn posts for subscription mentions, AI tool usage
   - Check LinkedIn activity feed for AI-related content
   - Most relevant to LinkedIn outreach context
2. **Secondary**: Check linked platforms (if available)
   - Extract Twitter/X handle from LinkedIn profile (if linked)
   - Extract GitHub username from LinkedIn profile (if linked)
   - Check Twitter/X posts for subscription mentions, AI tool usage
   - Check GitHub activity for AI-related projects
   - Enriches signal detection with cross-platform data
3. **Priority**: Target platform first, then enrich with linked platforms
   - LinkedIn posts are most relevant (you're reaching out on LinkedIn)
   - Linked platforms provide additional signals (people often post more on Twitter/X)
   - Use linked platforms to fill gaps if target platform has limited activity
**Output Format**:
```csv
name,headline,company,location,linkedin_url,email,twitter_handle,github_username,linkedin_signals,twitter_signals,github_signals,segment,icp_match_score
```
**Signal Fields**:
- `linkedin_signals`: Subscription mentions, AI tool usage found in LinkedIn posts
- `twitter_signals`: Subscription mentions, AI tool usage found in Twitter/X posts (if linked)
- `github_signals`: AI-related projects, activity patterns found in GitHub (if linked)
**Usage**:
```bash
scripts/discovery/linkedin_sales_navigator_export.js \
  --filters "job_title:founder|indie hacker,company_size:1-10" \
  --check-linked-platforms \
  --check-linkedin-posts \
  --check-twitter-posts \
  --check-github-activity \
  --output discovery_leads_linkedin.csv \
  --segment "AI-Native Operator"
```
**Cross-Platform Detection**:
- `--check-linked-platforms`: Extract Twitter/X, GitHub handles from LinkedIn profiles
- `--check-linkedin-posts`: Search LinkedIn posts for subscription/AI tool signals
- `--check-twitter-posts`: Search Twitter/X posts (if handle found) for additional signals
- `--check-github-activity`: Check GitHub activity (if username found) for AI projects
**Dependencies**:
- LinkedIn Sales Navigator subscription
- Sales Navigator API access (or manual export + parsing)
#### 2.1a LinkedIn Connections Export Tool
**Purpose**: Export and enrich data about your existing LinkedIn connections
**Capabilities**:
- Export your LinkedIn connections via LinkedIn's native export (Data Privacy settings)
- Parse LinkedIn connections CSV export
- Enrich with additional data:
  - Current headline, company, position (from LinkedIn export)
  - Location (if available in export)
  - Email address (if connection made it visible)
  - Date connected
  - Profile URL
- Filter connections by:
  - Job title keywords
  - Company name
  - Industry (if enriched via Sales Navigator)
  - Date connected (recent vs. old connections)
- Export enriched results to CSV
**LinkedIn Native Export Includes**:
- First Name, Last Name
- Email Address (if visible to connections)
- Company
- Position
- Date Connected
**Limitations**:
- LinkedIn export is limited to first-degree connections only
- Email addresses only included if connection made them visible
- No detailed profile data (skills, education, etc.) in native export
- Limited to what LinkedIn provides in Data Privacy export
**Enrichment Options**:
- Use Sales Navigator to enrich connections with additional data (if you have Sales Navigator)
- Cross-reference with other sources (Twitter/X, GitHub) if usernames available
- Manual enrichment for high-value connections
**Output Format**:
```csv
first_name,last_name,email,company,position,headline,location,linkedin_url,date_connected,segment,icp_match_score,notes
```
**Usage**:
```bash
# Step 1: Export from LinkedIn (manual)
# Go to LinkedIn Settings > Data Privacy > Get a copy of your data > Connections
# Step 2: Parse and enrich
scripts/discovery/linkedin_connections_export.js \
  --input ~/Downloads/Connections.csv \
  --enrich-with-sales-navigator \
  --filters "position:founder|indie hacker|AI engineer" \
  --output discovery_leads_connections.csv \
  --segment "AI-Native Operator"
```
**Dependencies**:
- LinkedIn account (free tier works)
- Manual export from LinkedIn Data Privacy settings
- Optional: Sales Navigator subscription for enrichment
**Use Cases**:
- Export existing connections for discovery participant recruitment
- Filter connections by ICP criteria
- Enrich connection data with Sales Navigator (if available)
- Identify connections who match ICP profiles
- Track which connections might be good discovery participants
**Note**: This is separate from Sales Navigator lead sourcing. Use this for your existing network, Sales Navigator for finding new leads.
#### 2.2 Twitter/X Search Tool
**Purpose**: Find users matching ICP criteria via Twitter/X search
**Capabilities**:
- Search by bio keywords ("building with AI", "Claude user", "indie hacker")
- Search for paid subscription mentions ("ChatGPT Plus", "Claude Pro", "Cursor Pro")
- Filter by engagement (follows AI tool accounts, posts about AI workflows)
- Extract profile data (name, bio, location, follower count)
- Extract linked profiles: LinkedIn, GitHub, personal website (if linked in Twitter/X bio)
- Cross-platform signal detection: Check Twitter/X posts + linked platform activity (LinkedIn, GitHub)
- Detect subscription signals: Bio mentions, post mentions, feature usage mentions
- Export to CSV
**Signal Detection Strategy**:
1. **Primary**: Check Twitter/X posts (target platform)
   - Search recent Twitter/X posts for subscription mentions, AI tool usage
   - Check Twitter/X activity feed for AI-related content
   - Most relevant to Twitter/X outreach context
2. **Secondary**: Check linked platforms (if available)
   - Extract LinkedIn profile URL from Twitter/X bio (if linked)
   - Extract GitHub username from Twitter/X bio (if linked)
   - Check LinkedIn posts for additional signals (if available)
   - Check GitHub activity for AI-related projects
   - Enriches signal detection with cross-platform data
3. **Priority**: Target platform first, then enrich with linked platforms
   - Twitter/X posts are most relevant (you're reaching out on Twitter/X)
   - Linked platforms provide additional signals (LinkedIn has professional context)
   - Use linked platforms to fill gaps if target platform has limited activity
**Note**: Paid subscription detection relies primarily on:
1. Self-reported data (screening survey) — most reliable
2. Bio/post mentions ("ChatGPT Plus user", "Claude Pro subscriber") — secondary
3. Proxy indicators (high usage frequency, feature mentions) — supporting evidence
4. Direct ask in interview if not detected — fallback
**Output Format**:
```csv
username,name,bio,location,follower_count,linkedin_url,github_username,twitter_signals,linkedin_signals,github_signals,engagement_signals,segment,icp_match_score
```
**Signal Fields**:
- `twitter_signals`: Subscription mentions, AI tool usage found in Twitter/X posts
- `linkedin_signals`: Subscription mentions, AI tool usage found in LinkedIn posts (if linked)
- `github_signals`: AI-related projects, activity patterns found in GitHub (if linked)
**Usage**:
```bash
scripts/discovery/twitter_search.js \
  --bio-keywords "building with AI|Claude user|indie hacker|ChatGPT Plus|Claude Pro|Cursor Pro" \
  --follows-accounts "anthropicai|openai" \
  --min-followers 100 \
  --subscription-signals "ChatGPT Plus|Claude Pro|Cursor Pro|paid for ChatGPT|subscribed to Claude" \
  --check-linked-platforms \
  --check-twitter-posts \
  --check-linkedin-posts \
  --check-github-activity \
  --output discovery_leads_twitter.csv \
  --segment "AI-Native Operator"
```
**Subscription Detection**:
- **Primary**: Searches Twitter/X bios and posts for subscription mentions
- **Secondary**: Checks linked LinkedIn profiles (if found in bio) for additional signals
- **Secondary**: Checks linked GitHub profiles (if found in bio) for AI project activity
- Flags profiles with subscription signals for priority scoring
- Combines signals from target platform + linked platforms for comprehensive detection
- Note: Most reliable detection is self-reported in screening survey
**Dependencies**:
- Twitter/X API access (or web scraping with rate limits)
- Account credentials
**Limitations**:
- Rate limits (varies by API tier)
- May require manual verification
#### 2.3 Indie Hackers Search Tool
**Purpose**: Find founders/builders from Indie Hackers community
**Capabilities**:
- Search Indie Hackers profiles by keywords
- Filter by activity (posts, comments about AI tools)
- Extract profile data (name, bio, projects, contact info)
- Export to CSV
**Output Format**:
```csv
username,name,bio,projects,contact_info,activity_signals,segment,icp_match_score
```
**Usage**:
```bash
scripts/discovery/indie_hackers_search.js \
  --keywords "AI|Claude|ChatGPT" \
  --min-posts 5 \
  --output discovery_leads_indiehackers.csv \
  --segment "AI-Native Operator"
```
**Dependencies**:
- Indie Hackers API (if available) or web scraping
- Account access
#### 2.4 GitHub User Search Tool
**Purpose**: Find developers with AI tool usage patterns
**Capabilities**:
- Search GitHub users by repository topics (AI, automation, productivity)
- Filter by activity patterns (recent commits, stars on AI repos)
- Extract profile data (name, bio, location, email if public)
- Export to CSV
**Output Format**:
```csv
username,name,bio,location,email,repo_topics,activity_signals,segment,icp_match_score
```
**Usage**:
```bash
scripts/discovery/github_search.js \
  --repo-topics "AI|automation|productivity" \
  --min-stars 10 \
  --min-recent-activity "2024-01-01" \
  --output discovery_leads_github.csv \
  --segment "AI-Native Operator"
```
**Dependencies**:
- GitHub API access (personal access token)
- Rate limits: 5,000 requests/hour (authenticated)
#### 2.5 Reddit/Discord Search Tool
**Purpose**: Find active users in AI tool communities
**Capabilities**:
- Search Reddit (r/ChatGPT, r/ClaudeAI) for active users
- Search Discord servers for members (if accessible)
- Extract profile data (username, activity level, contact if available)
- Export to CSV
**Output Format**:
```csv
username,platform,subreddit_or_server,activity_level,contact_info,segment,icp_match_score
```
**Usage**:
```bash
scripts/discovery/reddit_discord_search.js \
  --subreddits "ChatGPT|ClaudeAI" \
  --min-activity 10 \
  --output discovery_leads_reddit.csv \
  --segment "AI-Native Operator"
```
**Dependencies**:
- Reddit API access (or web scraping)
- Discord server access (if private)
**Limitations**:
- Reddit rate limits
- Discord requires server membership
### 3. Unified Lead Management Tool
**Purpose**: Combine leads from all platforms, deduplicate, and score ICP match
**Capabilities**:
- Merge CSV exports from all platforms
- Deduplicate by email/username/LinkedIn URL/Twitter handle
- Cross-platform signal aggregation:
  - Combine signals from target platform + linked platforms
  - Weight target platform signals higher than linked platform signals
  - Aggregate subscription mentions across all platforms
- Score ICP match based on:
  - Segment alignment (AI-Native Operator vs Knowledge Worker)
  - Profile keywords match (across all platforms)
  - Activity signals (target platform + linked platforms)
  - Engagement with AI tools (aggregated across platforms)
  - Subscription signals (target platform weighted higher, linked platforms supporting)
- Export unified list with rankings
- Filter by ICP match score threshold
**Cross-Platform Signal Weighting**:
- **Target Platform Signals**: Weight 1.0 (primary)
  - LinkedIn posts if LinkedIn outreach
  - Twitter/X posts if Twitter/X outreach
  - GitHub activity if GitHub outreach
- **Linked Platform Signals**: Weight 0.6 (secondary, supporting)
  - Twitter/X posts if LinkedIn outreach (linked from LinkedIn)
  - LinkedIn posts if Twitter/X outreach (linked from Twitter/X)
  - GitHub activity if LinkedIn/Twitter/X outreach (linked from profile)
**Rationale**: Target platform signals are most relevant to outreach context, but linked platforms provide valuable supporting evidence, especially when target platform has limited activity.
**Output Format**:
```csv
name,email,platform,segment,icp_match_score,profile_url,notes
```
**Usage**:
```bash
scripts/discovery/unified_lead_manager.js \
  --inputs discovery_leads_*.csv \
  --output discovery_leads_unified.csv \
  --min-score 0.7 \
  --dedupe-by email,linkedin_url,username
```
### 4. Integration with Participant Recruitment Log
**Purpose**: Import unified leads into participant recruitment tracking
**Capabilities**:
- Import unified CSV into `participant_recruitment_log.md` format
- Auto-populate tracking tables
- Generate outreach list with contact methods
- Track source platform for each lead
**Usage**:
```bash
scripts/discovery/import_to_recruitment_log.js \
  --input discovery_leads_unified.csv \
  --output docs/releases/v1.0.0/participant_recruitment_log.md \
  --segment "AI-Native Operator"
```
### 5. Agent-Driven Execution
**Capability**: These tools can be executed autonomously by Cursor agents with appropriate setup.
**Fully Agent-Driven (No Human Intervention)**:
- **Unified Lead Manager**: Merge, deduplicate, and score leads from CSV exports
- **Recruitment Log Importer**: Import unified CSV into participant recruitment log format
- **Filtering and Scoring Logic**: ICP match scoring, deduplication, ranking
- **CSV Processing**: Reading/writing CSV files, data transformation
**Partially Agent-Driven (Requires Human Setup)**:
- **LinkedIn Sales Navigator**: Requires manual export from Sales Navigator UI (no API), then agent can parse CSV
- **Twitter/X**: Requires API credentials setup (one-time), then agent can execute searches
- **GitHub**: Requires personal access token setup (one-time), then agent can execute searches
- **Indie Hackers**: Requires web scraping or API access setup, then agent can execute searches
- **Reddit/Discord**: Requires API credentials or access setup, then agent can execute searches
**Human-Required Steps**:
1. **Initial Setup** (One-time, Week -10):
   - Configure API credentials (Twitter/X, GitHub, Reddit) in environment variables
   - Set up LinkedIn Sales Navigator account (manual export workflow)
   - Grant Discord server access (if private servers)
   - Store credentials securely (`.env` file, not committed)
2. **LinkedIn Manual Export** (Per-execution):
   - Human exports filtered leads from Sales Navigator UI
   - Agent parses exported CSV file
3. **Review and Verification** (After agent execution):
   - Human reviews unified lead list for quality
   - Human verifies ICP match scores are reasonable
   - Human approves final participant list before outreach
**Agent Execution Pattern**:
```markdown
Agent Instructions:
1. Load discovery_lead_sourcing_tools.md specification
2. Check for API credentials in environment (TWITTER_API_KEY, GITHUB_TOKEN, etc.)
3. Execute platform-specific tools:
   - If LinkedIn: Wait for human to export CSV, then parse
   - If Twitter/X: Execute twitter_search.js with configured credentials
   - If GitHub: Execute github_search.js with configured token
   - If Indie Hackers: Execute indie_hackers_search.js
   - If Reddit/Discord: Execute reddit_discord_search.js
4. Execute unified_lead_manager.js to combine all CSV exports
5. Execute import_to_recruitment_log.js to populate tracking log
6. Report completion and summary statistics
```
**Agent Workflow Example**:
```bash
# Agent executes these commands autonomously (after credential setup)
node scripts/discovery/twitter_search.js \
  --bio-keywords "building with AI|Claude user" \
  --output discovery_leads_twitter.csv
node scripts/discovery/github_search.js \
  --repo-topics "AI|automation" \
  --output discovery_leads_github.csv
# Wait for human to export LinkedIn CSV, then:
node scripts/discovery/unified_lead_manager.js \
  --inputs discovery_leads_*.csv \
  --output discovery_leads_unified.csv \
  --min-score 0.7
node scripts/discovery/import_to_recruitment_log.js \
  --input discovery_leads_unified.csv \
  --output docs/releases/v1.0.0/participant_recruitment_log.md
```
**Benefits of Agent-Driven Execution**:
- **Automated Execution**: Agent can run tools on schedule or on-demand
- **Consistent Filtering**: ICP match scoring logic applied uniformly
- **Time Savings**: Reduces manual CSV processing and data entry
- **Reproducibility**: Same filters and scoring applied consistently
**Limitations**:
- **API Credentials**: Require human setup (security best practice)
- **LinkedIn Export**: Manual step required (Sales Navigator UI limitation)
- **Rate Limits**: Agent must respect platform rate limits (may require delays)
- **Quality Review**: Human should review final lead list before outreach
### 6. Implementation Approach
**Option A: Standalone CLI Tools (Recommended)**
- Build as Node.js scripts in `scripts/discovery/`
- No dependencies on Neotoma infrastructure
- Can be built before Week -8
- Simple, focused tools
- **Agent-executable**: Agents can run these scripts autonomously after credential setup
**Option B: Integrated Tool**
- Build as part of Neotoma codebase
- Requires Neotoma infrastructure
- More complex, but reusable
**Recommendation**: Option A (standalone CLI tools) — enables agent-driven execution while keeping tools simple and focused
### 7. Success Criteria
- **LinkedIn Sales Navigator**: Export 500-1,000 filtered leads matching ICP criteria
- **LinkedIn Connections**: Export and filter existing connections by ICP criteria (no limit, all first-degree connections)
- **Twitter/X**: Identify 50-100 users matching AI-Native Operator profile
- **Indie Hackers**: Identify 20-30 founders/builders with AI tool usage
- **GitHub**: Identify 30-50 developers with AI-related activity
- **Reddit/Discord**: Identify 20-30 active community members
- **Unified Export**: Generate ranked list of 100-200 qualified leads
- **Recruitment Efficiency**: Reduce manual sourcing time by 70%+
### 8. Timeline
**Build Timeline**: Week -10 to Week -9 (2 weeks before discovery starts)
- Week -10: Build LinkedIn Sales Navigator and Twitter/X tools
- Week -9: Build Indie Hackers, GitHub, Reddit/Discord tools + unified manager
- Week -9: Configure API credentials for agent-driven execution
- Week -8: Agent executes tools to generate qualified participant lists
- Week -8: Human reviews and approves final lead list before outreach
### 9. Deliverables
- `scripts/discovery/linkedin_sales_navigator_export.js` (for finding new leads)
- `scripts/discovery/linkedin_connections_export.js` (for exporting your existing connections)
- `scripts/discovery/twitter_search.js`
- `scripts/discovery/indie_hackers_search.js`
- `scripts/discovery/github_search.js`
- `scripts/discovery/reddit_discord_search.js`
- `scripts/discovery/unified_lead_manager.js`
- `scripts/discovery/import_to_recruitment_log.js`
- `scripts/discovery/README.md` (usage documentation)
- `.env.example` (template for API credentials)
- `scripts/discovery/agent_instructions.md` (instructions for agent-driven execution)
### 10. Related Documents
- `discovery_plan.md` — Discovery overview
- `participant_recruitment_log.md` — Participant tracking
- `value_discovery_plan.md` — Value discovery activities
- `docs/specs/ICP_PROFILES.md` — ICP profile definitions
