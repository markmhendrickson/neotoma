## Release v1.0.0 — Value Discovery Plan
### Purpose
This document defines the value discovery activities for v1.0.0, focused on validating that AI-Native Individual Operators need a way to give AI tools (Claude/ChatGPT) access to their personal data context via MCP.
**Related Documents:**
- `discovery_plan.md` — Discovery overview and coordination
- `usability_discovery_plan.md` — Usability discovery activities
- `business_viability_discovery_plan.md` — Business viability discovery activities
- `participant_recruitment_log.md` — Participant tracking
### 1. Hypothesis and Assumptions
**Hypothesis:** "AI-Native Individual Operators need a way to give AI tools (Claude/ChatGPT) access to their personal data context via MCP"
**Assumptions:**
- Users want to query their personal data via AI interfaces (not just search documents)
- Current workarounds (copy-paste, manual preparation) are painful
- Users value deterministic, structured data access for AI over semantic search
- MCP (Model Context Protocol) is the right interface for AI-native workflows
- Problem exists: AI tools lack access to personal data context, forcing manual workarounds
### 2. Discovery Method
**Approach**: Hybrid (async screening survey + live interviews + optional async validation)
**Why Hybrid:**
- Async screening survey: Quickly identify promising participants from large pool (40-50 responses)
- Live interviews: Deep discovery using Mom Test to validate problem and solution (high-fidelity)
- Optional async validation: Validate findings at scale after hypothesis formed
### 3. Async Screening Survey
#### 3.1 Purpose and Timing
- **Purpose**: Identify promising participants from large pool quickly
- **Timing**: Week -8 (before interviews start)
- **Target**: 40-50 responses, 20-25 willing to interview
- **Selection**: Choose 17-18 to schedule (accounting for no-shows)
#### 3.1a When Survey is Used vs. Direct Outreach
**Survey Path (Community Posts, Broad Outreach):**
- Indie Hackers community posts
- Reddit/Discord community posts
- Hacker News posts
- Twitter/X public posts (not DMs)
- **Workflow**: Post → Survey link → Responses → Select → Schedule interviews
**Direct Outreach Path (Personalized Outreach):**
- LinkedIn personalized messages
- Twitter/X DMs (personalized)
- Email (personalized)
- Existing network
- **Workflow**: Personalized message → Calendar link → Schedule interview directly
**Decision Criteria:**
- **Use Survey**: Broad community posts, public outreach, when you can't personalize
- **Use Direct Outreach**: When you can personalize, have specific lead, or from existing network
**Important**: For direct outreach, subscription detection relies on:
1. Bio/post mentions (detected by lead sourcing tools)
2. Proxy indicators (usage frequency, feature mentions)
3. Direct ask in interview (if unclear)
For survey path, subscription detection uses self-reported survey data (most reliable).
#### 3.2 Survey Questions
**ICP Qualification:**
- "How often do you use Claude or ChatGPT?" (Daily/Weekly/Monthly/Never)
- "What type of work do you do?" (Open text)
- "How long have you been using AI tools regularly?" (Months/years)
**Enhanced ICP Qualification (For AI-Native Operators):**
- "Which AI tools do you currently pay for?" (Multiple choice: ChatGPT Plus/Pro, Claude Pro, Cursor, Raycast, Other, None) — **Primary subscription detection method**
- "How much do you spend per month on AI tools?" ($0/$10-20/$20-50/$50+)
- "How often do you use Cursor or Raycast?" (Daily/Weekly/Monthly/Never)
- "Do you participate in AI tool communities?" (Reddit, Discord, Twitter/X, None)
- "Do you follow AI tool creators on social media?" (Yes/No)
- "Have you set up any integrations with AI tools?" (MCP servers, API integrations, Other, None)
**Note on Subscription Detection**:
**For Survey Path (Community Posts):**
- **Primary method**: Self-reported in screening survey (most reliable)
- Survey responses provide subscription data before scheduling
**For Direct Outreach Path (Personalized Messages):**
- **Primary method**: Bio/post mentions detected by lead sourcing tools (high confidence if detected)
- **Secondary method**: Proxy indicators (high usage frequency, feature mentions) — inferred but not definitive
- **Fallback**: Ask directly in interview if subscription status unclear
**Recommendation**: For direct outreach leads with unclear subscription status, include a brief screening question in calendar confirmation: "Quick question: Which AI tools do you currently pay for? (ChatGPT Plus/Pro, Claude Pro, Cursor, None) — helps us prepare for our chat."
**Enhanced ICP Qualification (For Knowledge Workers):**
- "What is your exact job title?" (Open text)
- "What type of organization do you work for?" (Consulting firm, Research institution, Law firm, Corporate, Other)
- "What tools do you use for research/document management?" (Zotero, Mendeley, Legal research platforms, Other, None)
- "How many documents do you typically work with per week?" (1-10/11-50/51-100/100+)
- "Do you need to synthesize information across multiple documents?" (Yes/No)
- "How long are your typical research cycles?" (Days/Weeks/Months)
**Past Behavior Facts:**
- "In the last 30 days, how many times did you copy-paste a document into Claude/ChatGPT?" (0/1-5/6-10/10+)
- "Do you currently have a process for giving AI tools access to your personal data? If yes, describe briefly." (Open text)
- "What tools do you currently use to manage your documents/data?" (Multiple choice + other)
**Commitment Signals:**
- "How much time per week do you spend preparing data to give to AI tools?" (0 min/1-15 min/15-30 min/30-60 min/1+ hours)
- "Have you paid for any tools that help you work with AI or access your data? If yes, what and how much?" (Open text)
**Recruitment:**
- "Would you be open to a 30-45 minute conversation about your AI workflows? We're not selling anything, just researching." (Yes/No)
- "If yes, what's your email or preferred contact method?" (Open text)
#### 3.3 Selection Criteria
Prioritize participants who:
**For AI-Native Operators:**
- ✅ Paid AI tool subscription (ChatGPT Plus/Pro, Claude Pro, Cursor) — **High Priority**
- ✅ Daily AI tool usage
- ✅ Spend 15+ min/week preparing data
- ✅ Community engagement (posts, follows AI creators)
- ✅ Has integrations or mentions MCP
**For Knowledge Workers:**
- ✅ Specific job title match (Analyst, Researcher, Consultant, Lawyer, Strategist) — **High Priority**
- ✅ Works at relevant company type (consulting, research, law firm)
- ✅ Uses research/document management tools (Zotero, Mendeley, legal research)
- ✅ Needs cross-document synthesis
- ✅ Works with multiple documents per week (11+)
**Minimum Threshold:**
- Must meet at least 3 criteria from above
- Must have at least one "high priority" signal (paid subscription OR specific job title)
- Must have commitment signal (paid tools OR time spent preparing data)
**See `discovery_filtering_criteria.md` for complete filtering criteria and scoring system.**
#### 3.4 Success Criteria
- 40-50 survey responses
- 20-25 express willingness to interview
- Select 17-18 to schedule (accounting for no-shows)
### 4. Live Interviews
#### 4.1 Purpose and Timing
- **Purpose**: Deep discovery using Mom Test to validate problem and solution
- **Timing**: Week -8 to Week -6
- **Why Live Required**:
  - Must probe past behavior: "Tell me about the last time..." requires follow-up questions
  - Detect commitment signals: Time spent, money spent, emotional intensity need conversation to validate
  - Avoid false positives: People are polite on surveys, need conversation to filter vague enthusiasm
  - Dynamic question flow: Pivot based on responses, test solution only if problem validated
#### 4.2 Participants
- **AI-Native Individual Operators**: 8 participants
  - Source: Selected from screening survey based on commitment signals
- **High-Context Knowledge Workers**: 5 participants
  - Source: Selected from screening survey based on commitment signals
#### 4.3 Interview Structure
**Duration**: 30-45 minutes per interview
**Format**: Structured interview with recording permission
**Sections:**
##### Section 1: Opening (5 min)
- Introduce yourself and Neotoma
- Explain purpose: Understand how you use AI tools with your personal data
- Request permission to record
- **Important**: Do NOT mention solution yet. Focus on current AI workflow.
##### Section 2: Problem Discovery (20 min) — Mom Test Questions Only
**Goal**: Validate problem exists: AI tools lack access to personal data context, forcing painful workarounds
**Questions:**
1. "Tell me about the last time you asked Claude/ChatGPT about your personal data — like a contract, receipt, financial record, or travel booking. Walk me through exactly what happened step-by-step."
   - Follow-ups:
     - What question were you trying to answer?
     - What data did you need the AI to know?
     - How did you give the AI access to that data? (copy-paste? upload file? describe manually?)
     - How long did it take to prepare the data?
     - What was frustrating about the process?
2. "Show me or walk me through the last time you wanted an AI to answer a question about your personal information but it couldn't because it didn't have access. What did you do?"
   - Follow-ups:
     - What question were you trying to ask?
     - What did you do instead? (manually search, copy-paste, give up?)
     - What was the impact of not being able to ask AI directly?
     - How often does this happen?
3. "Tell me about a specific time when you needed Claude/ChatGPT to understand something about your personal data — maybe a contract detail, financial transaction, or travel booking. What happened?"
   - Follow-ups:
     - What information did the AI need to know?
     - How did you try to communicate it to the AI?
     - Did it work? What was the problem?
     - What did you do instead?
4. "Walk me through how you currently give AI tools access to your personal data when you need them to answer questions about it."
   - Follow-ups:
     - Do you copy-paste documents into chat?
     - Do you upload files? What format?
     - Do you manually type out the information?
     - What's the most frustrating part of this process?
     - How much time does it take to prepare data before asking AI?
5. "Have you tried any tools or solutions that let AI access your personal data automatically? What did you try?"
   - Follow-ups:
     - What tools or approaches did you experiment with?
     - What happened when you tried them?
     - Why did you stop using them? (or continue using them?)
     - What was missing or frustrating?
6. "Tell me about your experience with MCP (Model Context Protocol) servers, if any. Have you tried connecting Claude/ChatGPT to external data sources?"
   - Follow-ups:
     - Have you heard of MCP?
     - Have you used any MCP servers? Which ones?
     - What worked well? What didn't?
     - What kind of data would you want to connect via MCP?
**Commitment Signal Questions:**
- How much time do you spend per week preparing data to give to AI tools? (copy-pasting, uploading, describing)
- Have you built any custom solutions or workarounds for giving AI access to your data?
- What happens if you need AI to answer a question about your data but you can't access the document easily? (reputation risk, time lost)
- What have you paid for tools that help AI access personal data? (subscriptions, APIs, custom solutions)
- How often do you wish Claude/ChatGPT could just 'know' your personal data without you having to paste it?
**Look For:**
- Time spent (preparing data, copy-pasting, manual work)
- Money spent (tools, APIs, custom solutions)
- Reputation risk (can't answer questions quickly, wrong answers from incomplete context)
- Emotional intensity (frustration with manual workarounds)
- Workarounds built (custom scripts, manual processes)
##### Section 3: Value Proposition Testing (15 min) — Only If Problem Validated
**Precondition**: Only proceed if problem exists (AI lacks personal data access, workarounds painful), and commitment signals present
**Questions:**
1. "We're thinking about solving this by giving Claude/ChatGPT access to your personal documents via MCP — so you could ask questions like 'What's in my contract with Acme Corp?' or 'Show me all my travel bookings next month' without copy-pasting. Does this address what you described?"
   - Follow-ups:
     - Does this match the problem you just told me about?
     - What questions do you have?
     - What's missing?
     - Would this change how you use AI with your personal data?
2. "Here's how we're thinking about it: You upload your documents (contracts, receipts, travel bookings), we extract structured data deterministically (no AI guessing), and then Claude/ChatGPT can query that data via MCP. Walk me through how you'd use this."
   - Follow-ups:
     - What would you do first after uploading documents?
     - What questions would you ask the AI?
     - Can you see yourself using this regularly?
     - What would make you stop using it?
3. "Tell me about the last time you noticed inconsistent or wrong answers from AI because it lacked your personal data context. What happened?"
   - Follow-ups:
     - What question were you asking?
     - What went wrong?
     - How did you discover the AI was wrong or missing context?
     - Would deterministic, structured data have helped?
4. "Walk me through a typical workflow: When you need to ask AI about your personal data, what do you do today? How would this change with MCP access?"
   - Follow-ups:
     - Current workflow: [what they described]
     - New workflow: Upload once, query forever
     - What would you gain? (time, accuracy, convenience)
     - What concerns do you have?
**Commitment Signal Questions:**
- If this existed today, would you switch from your current workaround (copy-paste, manual prep)?
- Would you recommend this to a colleague? What would you say?
- What would need to be true for you to use this regularly?
- What personal data questions do you wish you could ask AI but currently can't?
##### Section 4: Closing (5 min)
- "Anything else you'd like to share about how you use AI with your personal data?"
- "Can we follow up in 2 weeks to show you a prototype?"
- **Early Access Offer** (optional, after problem validated): "As a thank you for your time, I'd love to give you early access when we launch. Would that be helpful?"
### 5. Mom Test Principles
**Methodology**: The Mom Test (https://www.momtestbook.com)
**Question Framing**: Focus on past behavior and concrete examples of AI interactions with personal data, not hypotheticals
**Bias Avoidance:**
- Separate problem discovery from solution validation
- Ask about last time, specific examples, concrete AI workflows
- Look for commitment signals: time spent preparing data, money spent on workarounds, tools built
- Avoid leading questions and solution pitches during problem discovery
- Don't ask "Would you use this?" — ask about past AI interactions instead
**Commitment Signals:**
- Time spent preparing data for AI ("I spend 30 min per week copy-pasting...")
- Money spent on workarounds ("I pay for API access...", "I hired someone to...")
- Custom solutions built ("I wrote a script to...", "I built a workflow to...")
- Reputation risk ("If I can't answer quickly, client gets frustrated")
- Emotional intensity ("This drives me crazy every time I need to paste documents")
**Red Flags:**
- Vague enthusiasm without commitment signals ("Sounds interesting")
- Hypothetical interest without past behavior evidence ("I would definitely use this")
- Solution-focused responses before problem validated ("Yes, I need this")
- Agreement without evidence ("This could be useful")
- No actual AI usage patterns described
### 6. Post-Interview Notes
Capture:
- Problem validated? (yes/no, with evidence - actual AI usage patterns described)
- Commitment signals found? (time preparing data, money spent, workarounds built)
- Solution addresses problem? (if tested - does MCP access solve their workflow?)
- Interest in solution? (if tested - would they use this?)
- Red flags? (vague interest, no commitment signals, no actual AI usage)
### 7. Optional Async Validation
**Purpose**: Validate interview findings at scale (100-200 responses)
**Timing**: Week -6 to Week -5 (after interviews complete)
**When to Use**: After hypothesis formed from live interviews
**Questions Focus**: Test validated hypothesis, gather quantitative data
**Note**: Do NOT use to replace interview insights — only to validate that findings apply at scale
### 8. Success Criteria
- Screening survey: 40-50 responses, 20-25 willing to interview
- Live interviews: ≥70% validate problem exists (struggle to give AI tools access to personal data context)
- Live interviews: ≥60% express interest in MCP-based solution (only after problem validated)
- Live interviews: ≥50% care about deterministic, structured data access (vs semantic search)
- Live interviews: ≥60% see value in "upload once, query forever" workflow
- Live interviews: Commitment signals present in ≥70% of interviews (time preparing data, money spent, workarounds built)
- Optional validation: Survey confirms interview findings at scale (if conducted)
### 9. Deliverable
**Deliverable**: `value_discovery_report.md`
Includes:
- Synthesis of all interview findings
- Problem validation results
- Solution interest results
- Commitment signal analysis
- Red flags identified
- Comparison against success criteria
### 10. Related Documents
- `discovery_plan.md` — Discovery overview and coordination
- `usability_discovery_plan.md` — Usability discovery activities
- `business_viability_discovery_plan.md` — Business viability discovery activities
- `participant_recruitment_log.md` — Participant tracking
- `docs/feature_units/standards/discovery_process.md` — Discovery process standard
