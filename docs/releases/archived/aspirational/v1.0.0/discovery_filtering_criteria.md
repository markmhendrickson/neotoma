## Discovery Participant Filtering Criteria
### Purpose
This document defines granular filtering criteria to ensure proper ICP matching for discovery participants. These criteria are derived from `docs/specs/ICP_PROFILES.md` and should be applied during lead sourcing and participant selection.
### AI-Native Individual Operators — Enhanced Filtering
**Current Basic Filters:**
- Job title keywords: `founder`, `indie hacker`, `AI engineer`
- Bio keywords: `building with AI`, `Claude user`, `indie hacker`
**Enhanced Filters to Add:**
#### 1. Paid AI Tool Subscriptions (Strong Signal)
**Detection Methods:**
**Direct Mentions (Detectable):**
- Bio mentions: "ChatGPT Plus user", "Claude Pro subscriber", "Cursor Pro"
- Post mentions: "I pay for ChatGPT Plus", "subscribed to Claude Pro"
- Profile descriptions: Mentions of paid subscriptions
**Proxy Indicators (Inferable):**
- **High usage frequency**: Daily usage patterns suggest paid access (free tiers have rate limits)
- **Feature usage signals**: Mentions of features only available in paid tiers
  - ChatGPT Plus: GPT-4 access, plugins, browsing
  - Claude Pro: Claude 3 Opus, higher rate limits
  - Cursor: Pro features, AI completions
- **GitHub activity**: Cursor users often have GitHub activity patterns
- **Community engagement**: Paid users more likely to be active in communities
**Self-Reported (Not Detectable):**
- Payment history (not accessible)
- Subscription status API (not publicly available)
- Account verification (requires user access)
**Filter Keywords:**
- Bio/Post mentions: `ChatGPT Plus`, `ChatGPT Pro`, `Claude Pro`, `Cursor Pro`, `Raycast Pro`
- Payment mentions: `paid for ChatGPT`, `paid for Claude`, `subscribed to Cursor`, `ChatGPT subscriber`
- Feature mentions: `GPT-4`, `Claude Opus`, `Cursor AI`, `Raycast AI` (suggests paid access)
**Scoring Weight**: High (strong commitment signal)
**Detection Strategy:**
1. **Primary**: Self-reported in screening survey (most reliable)
2. **Secondary**: Direct mentions in bios/posts (high confidence)
3. **Tertiary**: Proxy indicators (usage frequency + feature mentions = inferred paid access)
4. **Fallback**: Ask directly in interview if not detected
**Note**: Most reliable detection is self-reported in screening survey. Public signals (bio mentions, posts) are secondary. Proxy indicators (usage patterns) are supporting evidence but not definitive.
#### 2. Activity Signals (Medium Signal)
- **Posts in AI tool communities**: Reddit (r/ChatGPT, r/ClaudeAI, r/Cursor), Discord servers
- **Follows AI tool creators**: @anthropicai, @openai, @cursor, @raycast
- **Engages with AI tool content**: Likes, retweets, comments on AI tool posts
**Filter Keywords:**
- Reddit: `r/ChatGPT`, `r/ClaudeAI`, `r/Cursor`
- Twitter follows: `anthropicai`, `openai`, `cursor`, `raycast`
- Engagement: Check for likes/retweets on AI tool posts
**Scoring Weight**: Medium
#### 3. Proxy Indicators (Medium Signal)
- **GitHub profile with AI-related projects**: Repositories with AI topics, automation projects
- **Product Hunt early adopter badge**: Check Product Hunt profile
- **Indie Hackers member**: Active member with AI-related posts
- **MCP/server content**: Posts about MCP, server integrations
**Filter Keywords:**
- GitHub topics: `AI`, `automation`, `productivity`, `mcp`, `model-context-protocol`
- Product Hunt: Check for early adopter badge, AI tool launches
- Indie Hackers: Check for AI-related posts, projects
**Scoring Weight**: Medium
#### 4. Behavior Signals (High Signal)
- **Uses AI tools daily**: Check for daily mentions, workflows
- **Mentions AI tools in social profiles**: Bio mentions ChatGPT, Claude, Cursor
- **Has AI tool integrations**: Mentions integrations, automations
**Filter Keywords:**
- Bio mentions: `ChatGPT`, `Claude`, `Cursor`, `Raycast`, `AI tools`
- Integration mentions: `MCP`, `API integration`, `automation`, `workflow`
**Scoring Weight**: High
#### 5. Content Consumption (Low Signal)
- **Engages with AI tool comparison content**: Likes/comments on comparison posts
- **AI productivity content**: Follows productivity + AI accounts
- **MCP/server content**: Engages with MCP-related content
**Scoring Weight**: Low (supporting signal)
### High-Context Knowledge Workers — Enhanced Filtering
**Current Basic Filters:**
- Job title keywords: `product manager`
- LinkedIn: Role-based filtering
**Enhanced Filters to Add:**
#### 1. Specific Job Titles (High Signal)
- **Analyst**: `Analyst`, `Business Analyst`, `Data Analyst`, `Research Analyst`
- **Researcher**: `Researcher`, `Research Scientist`, `Research Analyst`, `Policy Analyst`
- **Consultant**: `Consultant`, `Management Consultant`, `Strategy Consultant`
- **Lawyer**: `Lawyer`, `Attorney`, `Legal Counsel`, `Paralegal`
- **Strategist**: `Strategist`, `Business Strategist`, `Strategy Consultant`
**Filter Keywords:**
- `Analyst`, `Researcher`, `Consultant`, `Lawyer`, `Attorney`, `Strategist`, `Research Scientist`, `Policy Analyst`
**Scoring Weight**: High
#### 2. Company Type (Medium Signal)
- **Consulting firms**: McKinsey, BCG, Deloitte, Accenture, boutique consultancies
- **Research institutions**: Universities, think tanks, research labs
- **Law firms**: Law firms of any size
- **Strategy firms**: Strategy consulting, corporate strategy teams
**Filter Keywords:**
- Company names: Check for consulting firms, research institutions, law firms
- Company keywords: `Consulting`, `Research`, `Law Firm`, `Think Tank`, `University`
**Scoring Weight**: Medium
#### 3. Tool Usage (Medium Signal)
- **Research tools**: Zotero, Mendeley, EndNote
- **Legal research platforms**: Westlaw, LexisNexis, Bloomberg Law
- **Consulting software**: Consulting-specific tools
**Filter Keywords:**
- `Zotero`, `Mendeley`, `EndNote`, `Westlaw`, `LexisNexis`, `Bloomberg Law`
- Mentions of research tools, legal research, consulting software
**Scoring Weight**: Medium
#### 4. Activity Signals (Medium Signal)
- **Posts about research methodology**: Research process, document management
- **Document management content**: Information synthesis, knowledge management
- **Information synthesis**: Cross-document reasoning, research workflows
**Filter Keywords:**
- `research methodology`, `document management`, `information synthesis`, `knowledge management`, `cross-document`
**Scoring Weight**: Medium
#### 5. Proxy Indicators (Low Signal)
- **Publications**: Research papers, articles
- **Conference presentations**: Professional conferences
- **Professional certifications**: Relevant certifications
**Scoring Weight**: Low (supporting signal)
### Enhanced Screening Survey Questions
**Add to Current Survey:**
#### For AI-Native Operators:
1. **Paid Subscriptions:**
   - "Which AI tools do you currently pay for?" (Multiple choice: ChatGPT Plus/Pro, Claude Pro, Cursor, Raycast, Other)
   - "How much do you spend per month on AI tools?" ($0/$10-20/$20-50/$50+)
2. **Tool Usage Frequency:**
   - "How often do you use ChatGPT/Claude?" (Daily/Weekly/Monthly)
   - "How often do you use Cursor or Raycast?" (Daily/Weekly/Monthly/Never)
3. **Community Engagement:**
   - "Do you participate in AI tool communities?" (Reddit, Discord, Twitter/X, None)
   - "Do you follow AI tool creators on social media?" (Yes/No)
4. **Integration Experience:**
   - "Have you set up any integrations with AI tools?" (MCP servers, API integrations, Other, None)
#### For Knowledge Workers:
1. **Job Title Specificity:**
   - "What is your exact job title?" (Open text)
   - "What type of organization do you work for?" (Consulting firm, Research institution, Law firm, Other)
2. **Tool Usage:**
   - "What tools do you use for research/document management?" (Zotero, Mendeley, Legal research platforms, Other)
   - "How many documents do you typically work with per week?" (1-10/11-50/51-100/100+)
3. **Workflow Characteristics:**
   - "Do you need to synthesize information across multiple documents?" (Yes/No)
   - "How long are your typical research cycles?" (Days/Weeks/Months)
### Scoring System for ICP Match
**High Priority (Score 0.8-1.0):**
- Paid AI tool subscription (ChatGPT Plus/Pro, Claude Pro) + Daily usage
- Specific job title match (Analyst, Researcher, Consultant, Lawyer) + Company type match
- Multiple strong signals (paid subscription + daily usage + community engagement)
**Medium Priority (Score 0.6-0.8):**
- Daily AI tool usage + Community engagement
- Job title match + Tool usage match (Zotero, Mendeley)
- Paid subscription + Weekly usage
**Low Priority (Score 0.4-0.6):**
- Weekly AI tool usage only
- Job title match only (no other signals)
- Community engagement only (no paid subscription)
**Exclude (Score <0.4):**
- Monthly or less frequent AI tool usage
- No commitment signals (no paid tools, no time spent)
- No ICP match (wrong segment entirely)
### Implementation in Lead Sourcing Tools
**Update Filter Keywords:**
#### LinkedIn Sales Navigator:
- Add job titles: `Analyst`, `Researcher`, `Consultant`, `Lawyer`, `Attorney`, `Strategist`
- Add company keywords: `Consulting`, `Research`, `Law Firm`, `Think Tank`
- Add headline keywords: `ChatGPT Plus`, `Claude Pro`, `Cursor`, `Raycast`
#### Twitter/X:
- Add bio keywords: `ChatGPT Plus`, `Claude Pro`, `Cursor`, `Raycast`, `MCP`
- Add follows accounts: `cursor`, `raycast` (in addition to anthropicai, openai)
- Check for engagement with AI tool posts
#### GitHub:
- Add repo topics: `mcp`, `model-context-protocol`, `cursor`, `raycast`
- Check for AI-related projects, automation projects
#### Indie Hackers:
- Add keywords: `MCP`, `Cursor`, `Raycast`, `ChatGPT Plus`, `Claude Pro`
- Check for AI tool integration posts
#### Reddit/Discord:
- Add subreddits: `r/Cursor` (if exists)
- Check for active participation in AI tool communities
### Selection Criteria Update
**Prioritize participants who:**
**For AI-Native Operators:**
1. ✅ Paid AI tool subscription (ChatGPT Plus/Pro, Claude Pro, Cursor)
2. ✅ Daily AI tool usage
3. ✅ Spend 15+ min/week preparing data
4. ✅ Community engagement (posts, follows AI creators)
5. ✅ Has integrations or mentions MCP
**For Knowledge Workers:**
1. ✅ Specific job title match (Analyst, Researcher, Consultant, Lawyer, Strategist)
2. ✅ Works at relevant company type (consulting, research, law firm)
3. ✅ Uses research/document management tools (Zotero, Mendeley, legal research)
4. ✅ Needs cross-document synthesis
5. ✅ Works with multiple documents per week (11+)
**Minimum Threshold:**
- Must meet at least 3 criteria from above
- Must have at least one "high priority" signal
- Must have commitment signal (paid tools OR time spent preparing data)
### Updated Filtering Keywords Reference
See `discovery_filtering_keywords.md` for complete keyword list, updated with:
- Paid subscription keywords
- Specific job titles for Knowledge Workers
- Company type keywords
- Tool usage keywords
- Activity signal keywords
