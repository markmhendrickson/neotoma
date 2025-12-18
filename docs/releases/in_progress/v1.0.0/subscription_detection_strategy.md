## Subscription Detection Strategy

_(How to identify paid AI tool subscribers for discovery participant filtering)_

---

### Problem

We need to identify users who pay for AI tools (ChatGPT Plus/Pro, Claude Pro, Cursor, Raycast) to prioritize high-commitment participants. However, subscription status is not directly observable through public APIs or profiles.

---

### Detection Methods (Ranked by Reliability)

#### 1. Self-Reported (Primary — Most Reliable)

**Method**: Screening survey question

**Question**: "Which AI tools do you currently pay for?" (Multiple choice: ChatGPT Plus/Pro, Claude Pro, Cursor, Raycast, Other, None)

**Reliability**: ⭐⭐⭐⭐⭐ (100% accurate if answered honestly)

**Advantages**:

- Most accurate
- Direct from user
- No inference needed

**Limitations**:

- Requires user to complete survey
- Some users may not answer honestly (social desirability bias)
- Only available after initial outreach

**When to Use**: Primary method in screening survey (Week -8)

---

#### 2. Direct Mentions (Secondary — High Confidence)

**Method**: Search bios, posts, profile descriptions for subscription mentions

**Detectable Signals**:

- Bio mentions: "ChatGPT Plus user", "Claude Pro subscriber", "Cursor Pro"
- Post mentions: "I pay for ChatGPT Plus", "subscribed to Claude Pro"
- Profile descriptions: Mentions of paid subscriptions

**Filter Keywords**:

- `ChatGPT Plus`, `ChatGPT Pro`, `Claude Pro`, `Cursor Pro`, `Raycast Pro`
- `paid for ChatGPT`, `paid for Claude`, `subscribed to Cursor`
- `ChatGPT subscriber`, `Claude subscriber`

**Reliability**: ⭐⭐⭐⭐ (80-90% accurate — assumes users mention subscriptions)

**Advantages**:

- Detectable before outreach
- Can filter leads proactively
- Public signal

**Limitations**:

- Not all subscribers mention it publicly
- Some mentions may be aspirational ("want ChatGPT Plus")
- Requires parsing text (may have false positives)

**When to Use**: Lead sourcing tools (Week -10 to -9), initial filtering

**Implementation**: Add to Twitter/X, LinkedIn, GitHub search tools

---

#### 3. Proxy Indicators (Tertiary — Supporting Evidence)

**Method**: Infer paid access from usage patterns and feature mentions

**Detectable Signals**:

**Usage Frequency**:

- Daily usage patterns suggest paid access (free tiers have rate limits)
- High engagement with AI tools (posts, comments, shares)

**Feature Mentions**:

- ChatGPT Plus: Mentions of GPT-4, plugins, browsing, code interpreter
- Claude Pro: Mentions of Claude 3 Opus, higher rate limits, longer context
- Cursor: Mentions of AI completions, Pro features, code generation
- Raycast: Mentions of AI features, Pro features

**Activity Patterns**:

- GitHub activity for Cursor users (Cursor integrates with GitHub)
- High post frequency in AI tool communities (suggests heavy usage)
- Multiple AI tool mentions (suggests paid access to multiple tools)

**Reliability**: ⭐⭐⭐ (60-70% accurate — inference, not definitive)

**Advantages**:

- Detectable from public activity
- Can identify heavy users even without explicit mentions

**Limitations**:

- Not definitive (free users can also be heavy users)
- Requires inference logic
- May have false positives/negatives

**When to Use**: Supporting evidence, scoring boost, not primary filter

**Implementation**: Scoring algorithm in unified lead manager

---

#### 4. Direct Ask in Interview (Fallback)

**Method**: Ask directly during interview if subscription status unclear

**Question**: "Which AI tools do you currently pay for? This helps us understand your workflow."

**Reliability**: ⭐⭐⭐⭐⭐ (100% accurate if answered honestly)

**Advantages**:

- Most accurate
- Can clarify ambiguous signals
- Natural conversation flow

**Limitations**:

- Only available after interview scheduled
- Requires interview time

**When to Use**: Fallback if subscription status unclear from other methods

---

### Detection Workflow

**Step 1: Lead Sourcing (Week -10 to -9)**

- Search for direct mentions in bios/posts (Method 2)
- Flag profiles with subscription signals
- Score leads with subscription signals higher

**Step 2: Screening Survey (Week -8) — Survey Path Only**

- **For Survey Path**: Ask directly: "Which AI tools do you currently pay for?" (Method 1)
- Primary detection method for survey path
- Most reliable data
- **For Direct Outreach Path**: Skip survey, use Methods 2-4 instead

**Step 3: Lead Scoring**

**For Survey Path:**

- Combine self-reported data (Method 1) with detected signals (Method 2)
- Add proxy indicators (Method 3) as supporting evidence
- Score leads: High (self-reported + mentions), Medium (mentions only), Low (proxy only)

**For Direct Outreach Path:**

- Use detected signals (Method 2) + proxy indicators (Method 3)
- Add brief screening question in calendar confirmation (Method 1, mini-survey)
- Score leads: High (mentions + high usage), Medium (mentions only), Low (proxy only)

**Step 4: Interview (Week -8 to -6)**

- If subscription status unclear, ask directly (Method 4)
- Verify self-reported data if needed

---

### Scoring System

**High Confidence (Score 0.9-1.0)**:

- Self-reported in survey (Method 1) ✅
- OR Direct mentions in bio/posts (Method 2) + High usage frequency (Method 3)

**Medium Confidence (Score 0.7-0.9)**:

- Direct mentions in bio/posts (Method 2) only
- OR High usage frequency + Feature mentions (Method 3)

**Low Confidence (Score 0.5-0.7)**:

- Proxy indicators only (Method 3)
- High usage frequency without explicit mentions

**Unknown (Score <0.5)**:

- No signals detected
- Ask directly in interview (Method 4)

---

### Implementation Recommendations

**For Lead Sourcing Tools**:

- Add subscription keyword search to Twitter/X, LinkedIn, GitHub tools
- Flag profiles with subscription mentions for priority scoring
- Note: This is supporting evidence, not definitive

**For Screening Survey** (Survey Path Only):

- Make subscription question required (primary detection method)
- Ask early in survey (after basic qualification)
- Use multiple choice for easy analysis

**For Direct Outreach** (Direct Outreach Path):

- Include brief screening question in calendar confirmation message
- "Quick question: Which AI tools do you currently pay for? (ChatGPT Plus/Pro, Claude Pro, Cursor, None)"
- Low friction (one question, optional but helpful)
- Captures subscription status before interview

**For Unified Lead Manager**:

- Combine self-reported data (from survey) with detected signals (from tools)
- Score leads: Self-reported > Mentions > Proxy indicators
- Flag leads with subscription signals for priority outreach

**For Interviews**:

- If subscription status unclear, ask directly
- Natural conversation flow: "Which AI tools do you pay for? This helps us understand your workflow."

---

### Limitations and Assumptions

**Limitations**:

- No public API for subscription status
- Self-reported data may have social desirability bias
- Proxy indicators are inference, not definitive
- Some users may not mention subscriptions publicly

**Assumptions**:

- Users who pay for tools are more likely to mention it (for Method 2)
- Heavy usage correlates with paid access (for Method 3)
- Self-reported data is accurate (for Method 1)

**Mitigation**:

- Use multiple detection methods (triangulation)
- Prioritize self-reported data (most reliable)
- Use proxy indicators as supporting evidence only
- Ask directly in interview if unclear

---

### Success Metrics

**Detection Rate**:

- Target: Identify 80%+ of paid subscribers through combined methods
- Self-reported (Method 1): Expected 70-80% of subscribers
- Direct mentions (Method 2): Expected 20-30% of subscribers
- Proxy indicators (Method 3): Supporting evidence for 40-50%

**Accuracy**:

- Self-reported: 95%+ accurate (if answered honestly)
- Direct mentions: 80-90% accurate (some false positives/negatives)
- Proxy indicators: 60-70% accurate (inference, not definitive)

**Priority Scoring**:

- Leads with subscription signals (any method) score 0.7+
- Leads with self-reported subscriptions score 0.9+
- Leads without signals score <0.5 (lower priority)








