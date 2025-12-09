# Discovery Process

_(Validating Assumptions Before Building — Marty Cagan Discovery Principles)_

---

## Purpose

Defines the **Discovery Process** — a structured approach to validate product assumptions before committing to delivery. This process addresses Cagan's four product risks:

1. **Value Risk**: Will users buy or choose to use this?
2. **Usability Risk**: Can users figure out how to use this?
3. **Feasibility Risk**: Can our engineers build this?
4. **Business Viability Risk**: Will this solution work for our business?

Discovery happens **BEFORE delivery** (during Release Planning) and **DURING delivery** (continuous discovery) to ensure we build the right product.

---

## Scope

This document covers:

- Pre-release discovery (validate assumptions before building)
- Continuous discovery (validate during development)
- Discovery methods (interviews, prototype testing, hypothesis validation)
- Risk mitigation strategies (address Cagan's four risks)
- Integration with Release workflow

This process applies to **all releases**, with emphasis on comprehensive discovery for early releases (MVP, v1.1).

---

## Discovery Principles (Cagan)

### 1. Discovery Before Delivery

**Validate assumptions before building:**

- Test value propositions with real users
- Validate usability with prototypes
- Confirm business viability before committing resources
- Only build what's validated

### 2. Continuous Discovery

**Discovery doesn't stop after planning:**

- Weekly user interviews during development
- Prototype testing as features are built
- Rapid iteration based on feedback
- Validate assumptions continuously

### 3. Testable Hypotheses

**Make assumptions explicit and testable:**

- State hypotheses clearly
- Define success criteria upfront
- Test with real users
- Make go/no-go decisions based on evidence

### 4. Risk-First Approach

**Address highest risks first:**

- Value Risk: Test value propositions early
- Usability Risk: Prototype and user test
- Feasibility Risk: Technical proof of concept
- Business Viability Risk: Validate pricing, willingness to pay

---

## Discovery Methods: Async vs Live Interviews

### When to Use Each Method

**Live Interviews (Required for High-Fidelity Discovery):**

- **Problem Discovery**: Requires probing past behavior, detecting commitment signals, avoiding false positives
- **Solution Validation**: Needs conversation to test if solution addresses specific, validated pain points
- **Business Viability (Pricing)**: Requires probing past purchasing behavior, understanding value drivers
- **Complex Workflows**: Usability testing needs observation and think-aloud protocol

**Async Surveys/Questionnaires (Use for Screening and Validation):**

- **Participant Screening**: Identify promising candidates quickly before live interviews
- **Quantitative Validation**: Validate hypotheses at scale AFTER live interviews have formed them
- **Structured Data Collection**: Gather metrics that don't require probing (e.g., frequency of use)
- **Lower-Fidelity Questions**: Simple factual questions that don't need follow-up

**Hybrid Approach (Recommended):**

1. **Async Screening Survey** → Identify 40-50 promising participants from larger pool
2. **Live Interviews** → Deep discovery on 13-15 selected participants (high-fidelity problem/solution validation)
3. **Async Validation Survey** → Validate findings at scale (100-200 responses) after hypothesis formed

### Why Live Interviews Are Integral

**The Mom Test methodology requires conversation because:**

1. **Past Behavior Probing**: Surveys can't effectively probe "tell me about the last time..." questions. Live interviews allow:

   - Follow-up: "What happened step-by-step?"
   - Clarification: "Can you show me what you mean?"
   - Digging deeper: "How often does that happen?"

2. **Commitment Signal Detection**: Surveys miss commitment signals that reveal real pain:

   - **Time commitment**: "I spend 2 hours per week..." → Need to probe: "What do you do in those 2 hours? Show me."
   - **Money commitment**: "I pay €50/month..." → Need to probe: "What made you decide to pay? What were you solving?"
   - **Emotional intensity**: "This drives me crazy" → Need to observe tone, frustration level

3. **False Positive Filtering**: People are polite on surveys. Live interviews allow:

   - Detecting vague enthusiasm: "Sounds interesting" → Probe: "When did you last face this problem?"
   - Filtering hypothetical interest: "I would definitely use this" → Probe: "Show me what you currently do instead"
   - Avoiding solution bias: If they mention solution before problem validated, redirect conversation

4. **Dynamic Question Flow**: Based on responses, you need to:
   - Skip questions if problem already validated
   - Deep dive into unexpected pain points
   - Pivot if assumptions proven wrong
   - Test solution only if problem validated

**Surveys are vulnerable to:**

- Social desirability bias (people say what sounds good)
- Lack of context (can't probe unclear answers)
- Hypothesis confirmation bias (structured questions lead to expected answers)
- Missing commitment signals (hard to detect time/money/emotional investment)

## The Mom Test Methodology

_(Avoiding Biased Feedback — Rob Fitzpatrick's The Mom Test)_

**Reference:** [The Mom Test](https://www.momtestbook.com) — How to talk to customers and learn if your business is a good idea when everyone is lying to you.

**Critical**: The Mom Test requires **live conversation** to probe past behavior and detect commitment signals. Surveys cannot effectively implement Mom Test principles.

### Core Principles

**The Mom Test provides a framework for asking questions that reveal real behavior and pain points, avoiding false positives from people being polite:**

1. **Ask about past behavior, not hypotheticals**

   - Bad: "Would you use this?"
   - Good: "Tell me about the last time you [did related thing]"
   - People lie about hypotheticals but reveal truth through past behavior

2. **Focus on concrete examples**

   - Bad: "How do you manage documents?"
   - Good: "Walk me through the last time you needed to find a specific document"
   - Concrete examples reveal actual workflows and pain points

3. **Look for commitment signals**

   - Time spent on workarounds (indicates problem severity)
   - Money spent on alternatives (indicates willingness to pay)
   - Reputation risk from current solutions (indicates urgency)
   - These signals indicate real pain, not polite interest

4. **Avoid leading questions**

   - Don't pitch solution during problem discovery
   - Don't ask "Wouldn't it be great if..."
   - Don't ask "Do you think X would help?"
   - Leading questions bias responses toward false positives

5. **Separate problem from solution**

   - First: Validate problem exists and is painful (using Mom Test questions)
   - Then: Test solution (only if problem validated)
   - Mixing problem and solution validation biases both

### Common Biases to Avoid

**People lie to be polite, avoid conflict, or appear helpful. Watch for:**

- **Compliments**: "This sounds great!" (without commitment signals)
- **Hypothetical interest**: "I would definitely use this" (without past behavior evidence)
- **Solution-focused responses**: "Yes, I need this" (without problem validation first)
- **Vague enthusiasm**: "This could be useful" (without concrete examples)

### Question Framing Guidelines

**Past Behavior vs Hypothetical:**

- ✅ "Tell me about the last time you [specific problem]"
- ✅ "Walk me through how you currently [specific workflow]"
- ✅ "What happened when you tried to [specific action]?"
- ❌ "Would you use [solution]?"
- ❌ "How interested are you in [feature]?"
- ❌ "What would make this better?"

**Concrete Examples vs Generalities:**

- ✅ "Show me the last document you uploaded and how you searched it"
- ✅ "Tell me about a specific time when [problem] happened"
- ✅ "What did you do step-by-step when [situation]?"
- ❌ "How do you generally manage documents?"
- ❌ "What problems do you have?"
- ❌ "What features would you want?"

### Commitment Signals to Look For

**Real pain indicators (not just polite interest):**

1. **Time commitment**: How much time do they spend on workarounds?

   - "I spend 2 hours every week manually searching through documents"
   - "I've built custom scripts to solve this"

2. **Money commitment**: What have they paid for alternatives?

   - "I pay €50/month for [competitor tool]"
   - "I've hired contractors to build custom solutions"

3. **Reputation risk**: What happens if current solution fails?

   - "If I can't find this document, I lose the client"
   - "My boss gets frustrated when I can't find things quickly"

4. **Emotional intensity**: How frustrated are they?
   - "This drives me crazy every single day"
   - "I've given up trying to solve this"

**Red Flags (False Positives):**

- Vague interest without commitment signals
- Enthusiasm without concrete examples
- Agreement without past behavior evidence
- "Sounds interesting" without follow-up questions

### Interview Structure Guidelines

**To avoid bias, structure interviews as:**

1. **Problem Discovery (Mom Test questions only)**

   - Ask about past behavior and concrete examples
   - Look for commitment signals
   - Validate problem exists and is painful
   - Do NOT mention your solution

2. **Solution Validation (only if problem validated)**

   - Introduce solution after problem validated
   - Test if solution addresses validated pain points
   - Look for commitment signals (would they switch? pay? recommend?)

3. **Business Viability (only if problem + solution validated)**
   - Ask about past purchasing behavior
   - Test pricing with past behavior context
   - Look for commitment signals (budget allocation, switching costs)

### When to Introduce Solution

**Timing matters:**

- ❌ **Too early**: Introducing solution before problem validation biases problem discovery
- ✅ **Right time**: After validating problem exists and is painful
- ✅ **Right way**: "We're thinking about solving [validated problem] with [solution]. Does this address what you described?"

---

## Integration with Release Workflow

**Discovery is integrated into Release workflow as Step 0.5:**

```
Release Workflow:
  Step 0: Release Planning (includes discovery planning)
  Step 0.5: Pre-Release Discovery ← NEW
  Step 1: Execute FU Batches (with continuous discovery)
  Step 2-6: (existing workflow)
```

**Discovery Timeline:**

- **Pre-Release (Step 0.5):** Validate assumptions before building (1-3 weeks)
- **During Development (Step 1):** Continuous discovery (weekly interviews, prototype testing)
- **Post-Release (Step 6):** Validation confirms outcomes (existing validation process)

---

## Discovery Workflow

### Step 0.5: Pre-Release Discovery

**Trigger:** Release plan approved, before Step 1 (Execute FU Batches)

**Timeline:** 1-3 weeks (depending on Release scope and risk)

**Process:**

1. **Discovery Planning** (Day 1)

   - Identify assumptions and hypotheses
   - Define discovery activities
   - Recruit users for interviews/testing
   - Create discovery plan

2. **Value Discovery** (Week 1-2)

   - Conduct ICP interviews on assumptions
   - Test value propositions
   - Validate pain points and use cases
   - Synthesize findings

3. **Usability Discovery** (Week 1-2, parallel with Value Discovery)

   - Build clickable prototype
   - User test core workflows
   - Validate discoverability, understandability
   - Synthesize findings

4. **Business Viability Discovery** (Week 2)

   - Test pricing assumptions
   - Validate willingness to pay
   - Test business model assumptions
   - Synthesize findings

5. **Feasibility Validation** (Week 1-2, parallel)

   - Technical proof of concept (if high-risk)
   - Validate architectural assumptions
   - Test critical technical constraints

6. **Discovery Synthesis** (Week 2-3)
   - Analyze all discovery findings
   - Compare against success criteria
   - Make go/no-go decision
   - Update Release plan based on learnings

---

## Discovery Planning (Checkpoint 0.5)

### Identify Assumptions and Hypotheses

**For each Release, explicitly state:**

1. **Value Hypotheses:**

   - What problem are we solving?
   - Who has this problem?
   - How will users get value?
   - Example: "AI-Native Operators will find value in unified document search via MCP"

2. **Usability Hypotheses:**

   - Can users complete core workflows?
   - Is the UI discoverable?
   - Are interactions intuitive?
   - Example: "Users can complete upload → extraction → timeline workflow without guidance"

3. **Business Viability Hypotheses:**

   - Will users pay for this?
   - What price point?
   - What's the business model?
   - Example: "Tier 1 ICPs will pay €250-€1,250/month for Neotoma"

4. **Feasibility Assumptions:**
   - Can we build this technically?
   - Are there architectural constraints?
   - Example: "Rule-based extraction can achieve >85% schema detection accuracy"

### Define Discovery Activities

**For each hypothesis, define:**

- **Method**: Interview, prototype test, technical POC, pricing survey
- **Participants**: ICP segment, number of users
- **Timeline**: When discovery occurs
- **Success Criteria**: What signals validation

### Mom Test Guidelines for Discovery Planning

**When structuring discovery activities, apply Mom Test principles:**

1. **How to Structure Interviews to Avoid Bias:**

   - **Separate problem discovery from solution validation**: First validate problem exists, then test solution
   - **Use past behavior questions**: Ask about last time, specific examples, concrete workflows
   - **Look for commitment signals**: Time spent, money spent, workarounds built, reputation risk
   - **Avoid leading questions**: Don't pitch solution during problem discovery
   - **Don't ask hypotheticals**: Ask about past behavior, not future intentions

2. **When to Introduce Solution:**

   - ✅ **After problem validated**: Only introduce solution after confirming problem exists and is painful
   - ✅ **With commitment signals**: Only test solution if commitment signals present (time, money, reputation risk)
   - ❌ **Too early**: Don't mention solution during problem discovery (biases responses)
   - ❌ **Without validation**: Don't test solution if problem not validated

3. **How to Identify Commitment Signals vs Polite Interest:**

   **Commitment Signals (Real Pain):**

   - Time spent on workarounds ("I spend 2 hours per week...")
   - Money spent on alternatives ("I pay €50/month for...")
   - Workarounds built ("I've created custom scripts...")
   - Reputation risk ("If I can't find this, I lose the client")
   - Emotional intensity ("This drives me crazy every day")

   **Polite Interest (False Positives):**

   - Vague enthusiasm ("Sounds interesting")
   - Hypothetical interest ("I would definitely use this")
   - Agreement without evidence ("Yes, I need this")
   - No commitment signals ("This could be useful")

4. **Red Flags That Indicate False Positives:**

   - Enthusiasm without concrete examples
   - Agreement without past behavior evidence
   - Vague interest without commitment signals
   - "Sounds great" without follow-up questions
   - Solution-focused responses before problem validated
   - No time/money/reputation risk mentioned

**Example Discovery Plan:**

```yaml
discovery:
  value_discovery:
    hypothesis: "AI-Native Operators will find value in unified document search via MCP"
    method: "ICP interviews"
    participants:
      - segment: "AI-Native Individual Operators"
        count: 5
      - segment: "High-Context Knowledge Workers"
        count: 5
    timeline: "Week 1-2"
    success_criteria:
      - "≥70% validate problem exists"
      - "≥60% express interest in solution"
      - "≥50% see clear value proposition"
  usability_discovery:
    hypothesis: "Users can complete upload → extraction → timeline workflow without guidance"
    method: "Prototype user testing"
    participants:
      - segment: "AI-Native Individual Operators"
        count: 5
    timeline: "Week 2"
    success_criteria:
      - "≥80% complete workflow successfully"
      - "≥80% rate usability as acceptable (≥3/5)"
      - "≤2 critical usability blockers identified"
  business_viability_discovery:
    hypothesis: "Tier 1 ICPs will pay €250-€1,250/month for Neotoma"
    method: "Willingness-to-pay interviews"
    participants:
      - segment: "AI-Native Individual Operators"
        count: 5
      - segment: "AI-Native Founders"
        count: 3
    timeline: "Week 2"
    success_criteria:
      - "≥50% express willingness to pay"
      - "≥40% accept target price point (€250-€1,250/month)"
      - "Clear value drivers for paying identified"
  feasibility_validation:
    hypothesis: "Rule-based extraction can achieve >85% schema detection accuracy"
    method: "Technical proof of concept"
    timeline: "Week 1"
    success_criteria:
      - "POC achieves >85% accuracy on test set"
      - "Performance meets requirements (<5s P95)"
      - "No architectural blockers identified"
```

---

## Discovery Methods

### 1. Value Discovery: Hybrid Approach (Screening Survey + Live Interviews)

**Recommended Approach:**

- **Step 1 (Async)**: Screening survey to identify promising participants (40-50 responses → select 20-25 for interviews)
- **Step 2 (Live)**: Deep interviews on selected participants (13-15 interviews) using Mom Test methodology
- **Step 3 (Async, optional)**: Validation survey at scale (100-200 responses) to validate findings from interviews

#### Step 1: Async Screening Survey

**Purpose:** Quickly identify participants who match ICP profile and show potential commitment signals

**When to Use:** Before live interviews, to filter large candidate pool

**Survey Questions (Focus on Facts, Not Hypotheticals):**

1. **ICP Qualification:**

   - "How often do you use Claude or ChatGPT?" (Daily/Weekly/Monthly/Never)
   - "What type of work do you do?" (Open text)
   - "How long have you been using AI tools regularly?" (Months/years)

2. **Past Behavior (Factual, Not Hypothetical):**

   - "In the last 30 days, how many times did you copy-paste a document into Claude/ChatGPT to answer a question about it?" (0/1-5/6-10/10+)
   - "Do you currently have a process for giving AI tools access to your personal data? If yes, describe briefly." (Open text)
   - "What tools do you currently use to manage your documents/data?" (Multiple choice + other)

3. **Time/Money Commitment (Facts Only):**

   - "How much time per week do you spend preparing data to give to AI tools? (copy-pasting, uploading, describing)" (0 min/1-15 min/15-30 min/30-60 min/1+ hours)
   - "Have you paid for any tools that help you work with AI or access your data? If yes, what and how much?" (Open text)

4. **Recruitment:**
   - "Would you be open to a 30-45 minute conversation about your AI workflows? We're not selling anything, just researching." (Yes/No)
   - "If yes, what's your email or preferred contact method?" (Open text)

**Success Criteria:**

- 40-50 survey responses
- 20-25 express willingness to interview
- Select 17-18 to schedule (accounting for no-shows)
- Target: Participants who use AI daily/weekly AND spend time preparing data AND have paid for tools (commitment signals)

**Use This Survey To:**

- Filter out non-ICP candidates
- Identify commitment signals quickly
- Prioritize which participants to interview first
- **NOT to validate problem** (surveys can't effectively probe past behavior)

#### Step 2: Live Interviews (Required for Problem/Solution Validation)

**Purpose:** Deep discovery using Mom Test methodology to validate problem and solution

**Purpose:** Validate value propositions, pain points, use cases

**Process:**

1. **Select Participants from Screening Survey:**

   - Prioritize participants who:
     - Use AI tools daily/weekly
     - Spend time preparing data (15+ min/week)
     - Have paid for tools (commitment signal)
     - Match ICP segment profile
   - Target 17-18 scheduled interviews to get 13-15 completed (accounting for 20-30% no-show rate)

2. **Conduct Live Interviews:**

   - 30-45 minute structured interviews
   - Focus on problem validation (not solution)
   - Test value propositions
   - Understand current workarounds

3. **Interview Template:**

```markdown
# Release vX.Y.Z — Value Discovery Interview

**Target ICP:** [Segment]
**Duration:** 30-45 minutes
**Focus:** Validate problem and value proposition (using Mom Test methodology)

## Opening (5 min)

- Introduce yourself and Neotoma
- Explain purpose: Understand your workflow and pain points
- Request permission to record
- **Important:** Do NOT mention your solution yet. Focus on understanding their current situation.

## Problem Discovery (20 min) — Mom Test Questions Only

**Goal:** Validate problem exists and is painful using past behavior and concrete examples.

1. "Tell me about the last time you needed to find a specific document or piece of information."

   - Walk me through exactly what happened step-by-step
   - What document were you looking for?
   - Where did you start looking?
   - How long did it take?
   - What was frustrating about the process?

2. "Show me or describe the last document you uploaded. How did you search for it later?"

   - What did you do to find it?
   - Did you find it quickly or did it take time?
   - What happened when you couldn't find it?

3. "Tell me about a specific time when you couldn't find a document you needed."

   - What happened?
   - What did you do?
   - What was the impact? (time lost, deadline missed, etc.)
   - How often does this happen?

4. "Walk me through how you currently manage your uploaded documents and data."

   - Where do you store them?
   - How do you organize them?
   - What tools do you use?
   - What's the most frustrating part?

5. "What tools or solutions have you tried for document search or organization?"

   - What did you try?
   - What happened when you used them?
   - Why did you stop using them? (or continue using them?)
   - What did you pay for them?

6. **Commitment Signal Questions:**
   - "How much time do you spend per week searching for documents or information?"
   - "Have you built any custom solutions or workarounds for this?"
   - "What happens if you can't find a document you need?" (reputation risk)
   - "What have you paid for tools that solve similar problems?"

**Look for:** Time spent, money spent, workarounds built, emotional intensity, reputation risk

## Value Proposition Testing (15 min) — Only If Problem Validated

**Only proceed if:** Problem exists, is painful, and commitment signals present.

7. "We're thinking about solving [validated problem] with [solution]. Does this address what you described?"

   - Does this match the problem you just told me about?
   - What questions do you have?
   - What's missing?

8. "Here's how we're thinking about it: [value proposition]. Walk me through how you'd use this."

   - Can you see yourself using this?
   - What would you do first?
   - What would make you stop using it?

9. **Commitment Signal Questions:**
   - "If this existed today, would you switch from your current solution?"
   - "Would you recommend this to a colleague? What would you say?"
   - "What would need to be true for you to use this regularly?"

## Business Viability (10 min) — Only If Problem + Solution Validated

**Only proceed if:** Problem validated AND solution addresses it.

10. "What tools have you purchased to solve document search or organization problems?"

    - What did you pay?
    - What made you decide to pay?
    - What's your budget for productivity tools?

11. "Tell me about tools you've tried but didn't pay for. Why didn't you pay?"

    - What was missing?
    - What would have made you pay?

12. "If this solved [validated problem], how would you decide whether to pay for it?"
    - What features would be must-have?
    - What price would make sense?
    - How would you justify the cost?

## Closing (5 min)

13. "Anything else you'd like to share about this problem or how you currently solve it?"
14. "Can we follow up in 2 weeks to show you a prototype?"
15. Thank user

**Post-Interview Notes:**

- Problem validated? (yes/no, with evidence)
- Commitment signals found? (time, money, reputation risk)
- Solution addresses problem? (if tested)
- Willingness to pay? (if tested)
- Red flags? (vague interest, no commitment signals)
```

4. **Synthesize Findings:**

   - Aggregate responses per question
   - Identify patterns (common pain points, value themes)
   - Compare against success criteria
   - Generate value discovery report

5. **Optional: Async Validation Survey (After Hypothesis Formed):**

   - **Purpose:** Validate interview findings at scale (100-200 responses)
   - **When to Use:** After live interviews have validated problem and formed hypothesis
   - **Survey Focus:** Test validated hypothesis, not exploratory discovery
   - **Questions:**
     - "How often do you copy-paste documents into Claude/ChatGPT?" (validates problem frequency)
     - "How much time per week do you spend preparing data for AI?" (validates time commitment)
     - "If Claude could query your uploaded documents automatically, how would that change your workflow?" (tests solution concept)
   - **Use Results To:** Validate that interview findings apply at scale, not to replace interview insights

**Success Criteria:**

- ≥70% validate problem exists (from live interviews)
- ≥60% express interest in solution (from live interviews)
- ≥50% see clear value proposition (from live interviews)
- Optional: Validation survey confirms interview findings at scale

**Critical Note:** Async surveys can validate but cannot replace live interviews for problem discovery. Live interviews are required for high-fidelity discovery using Mom Test methodology.

---

### 2. Usability Discovery: Prototype User Testing

**Purpose:** Validate usability, discoverability, workflow completion

**Process:**

1. **Build Clickable Prototype:**

   - Focus on core workflows from Release
   - Fully interactive (no backend needed)
   - Use existing design system
   - Mock all API responses

2. **Recruit Participants:**

   - 5-8 users from target ICP segments
   - Mix of existing users and new participants

3. **Conduct User Tests:**

   - 45-60 minute sessions
   - Task-based testing (give users goals, observe)
   - Think-aloud protocol (users narrate actions)
   - Record screen and audio

4. **Test Scenarios:**

```markdown
# Release vX.Y.Z — Usability Test Scenarios

**Target ICP:** AI-Native Individual Operators
**Duration:** 45-60 minutes
**Focus:** Core workflow completion

## Scenario 1: First Upload (10 min)

"Imagine you just signed up for Neotoma. You want to upload a bank statement PDF to see what information Neotoma extracts. Please do that."

**Observe:**

- Can user find upload UI?
- Can user complete upload?
- Does user understand extraction results?
- Any confusion or errors?

## Scenario 2: Timeline Discovery (10 min)

"Now you want to see all your financial documents in chronological order. Please find that view."

**Observe:**

- Can user find timeline view?
- Does user understand timeline organization?
- Can user navigate timeline events?

## Scenario 3: Entity Exploration (10 min)

"Neotoma identified some companies in your documents. Can you find which documents mention 'Acme Corp'?"

**Observe:**

- Can user search for entities?
- Does user understand entity resolution?
- Is search discoverable?

## Scenario 4: AI Query (10 min)

"Now you want to ask Neotoma an AI question. Try asking: 'What are all my travel expenses this year?'"

**Observe:**

- Can user find AI query interface?
- Does user understand how to use it?
- Is the interaction intuitive?

## Post-Test Questions (10 min)

1. "Overall, how easy was this to use? (1-5 scale)"
2. "What was the hardest part?"
3. "What was confusing?"
4. "What worked well?"
5. "Would you use this? Why or why not?"
```

5. **Synthesize Findings:**
   - Identify usability issues (critical blockers, minor friction)
   - Measure task completion rates
   - Aggregate usability ratings
   - Generate usability discovery report

**Success Criteria:**

- ≥80% complete core workflows successfully
- ≥80% rate usability as acceptable (≥3/5)
- ≤2 critical usability blockers identified

---

### 3. Business Viability Discovery: Live Interviews Required

**Purpose:** Validate pricing assumptions, willingness to pay

**Why Live Interviews Are Required:**

- Need to probe past purchasing behavior (can't effectively do this in surveys)
- Must detect commitment signals (budget allocation, switching costs)
- Van Westendorp Price Sensitivity Meter requires conversation to contextualize responses
- Need to understand value drivers for paying (requires probing)

**Process:**

1. **Conduct Willingness-to-Pay Interviews (Live, Not Async):**

   - Part of value discovery interviews or separate sessions
   - Test pricing assumptions
   - Understand value drivers for paying

2. **Interview Questions:**

```markdown
# Pricing Validation Questions (Mom Test Methodology)

**Important:** Only ask these questions AFTER validating problem exists and solution addresses it.

## Past Purchasing Behavior (Start Here)

1. "Tell me about tools you've purchased to solve document search or organization problems."

   - What tools did you buy?
   - What did you pay for them?
   - What made you decide to pay?
   - Are you still using them? Why or why not?

2. "What tools have you tried but didn't pay for? Why didn't you pay?"

   - What was missing?
   - What would have made you pay?
   - What price would have changed your mind?

3. "Walk me through your current productivity tool stack."
   - What tools do you pay for?
   - What do you pay for each?
   - How do you decide what's worth paying for?
   - What's your monthly budget for productivity tools?

## Willingness to Pay (Based on Past Behavior)

4. "If this solved [validated problem], how would you decide whether to pay for it?"

   - What would need to be true?
   - What features would be must-have?
   - How would you justify the cost?

5. "Tell me about tools similar to this that you've evaluated."

   - What did you look at?
   - What did they cost?
   - Why didn't you buy them? (or why did you?)

6. **Van Westendorp Price Sensitivity Meter (with past behavior context):**
   - "Given that you pay €X for [similar tool], at what price would this be so expensive you wouldn't consider it?"
   - "At what price would you consider it expensive but still consider buying?"
   - "At what price would you consider it a bargain?"
   - "At what price would it be so cheap you'd question the quality?"

## Commitment Signals

7. "If this existed today at [price point], would you switch from [current solution]?"

   - What would make you switch?
   - What would prevent you from switching?
   - How long would you evaluate before deciding?

8. "What would make you cancel or stop using this?"
   - Deal-breakers
   - What would make you switch to a competitor?
   - What problems would cause you to leave?

**Look for:** Past purchasing behavior, budget allocation, switching costs, commitment signals
```

3. **Synthesize Findings:**
   - Aggregate willingness-to-pay responses
   - Identify price sensitivity
   - Understand value drivers
   - Generate business viability report

**Success Criteria:**

- ≥50% express willingness to pay
- ≥40% accept target price point
- Clear value drivers for paying identified

---

### 4. Feasibility Validation: Technical Proof of Concept

**Purpose:** Validate technical assumptions, architectural constraints

**Process:**

1. **Identify High-Risk Technical Assumptions:**

   - New technologies or approaches
   - Performance requirements
   - Architectural constraints

2. **Build Proof of Concept:**

   - Minimal implementation to test assumption
   - Focus on critical technical risks
   - Measure performance, accuracy

3. **Validate Against Requirements:**
   - Does POC meet performance targets?
   - Are there architectural blockers?
   - Can we scale this approach?

**Success Criteria:**

- POC meets technical requirements
- No architectural blockers
- Performance targets achievable

---

## Discovery Synthesis

### Analyze Findings

**For each discovery activity:**

1. **Aggregate Responses:**

   - Count responses per question
   - Identify patterns and themes
   - Note outliers and edge cases

2. **Compare Against Success Criteria:**

   - Did we meet thresholds?
   - Which hypotheses validated?
   - Which hypotheses failed?

3. **Identify Insights:**
   - Key learnings
   - Surprising findings
   - Actionable recommendations

### Make Go/No-Go Decision

**Decision Framework:**

- **Go (Proceed to Build):**

  - All critical hypotheses validated
  - Success criteria met
  - Clear path forward

- **Pivot (Adjust Scope):**

  - Some hypotheses validated, some failed
  - Adjust Release scope based on learnings
  - Re-run discovery on adjusted scope

- **No-Go (Cancel or Defer):**
  - Critical hypotheses failed
  - Fundamental assumptions invalid
  - Cancel Release or defer until assumptions change

### Update Release Plan

**Based on discovery findings:**

1. **Adjust Release Scope:**

   - Remove features that failed validation
   - Add features based on user feedback
   - Prioritize validated features

2. **Update Acceptance Criteria:**

   - Incorporate validated assumptions
   - Adjust metrics based on learnings
   - Set realistic success thresholds

3. **Refine Feature Units:**
   - Update FU specs based on usability findings
   - Prioritize usability improvements
   - Adjust implementation approach

---

## Continuous Discovery (During Development)

**Discovery doesn't stop after pre-release validation:**

### Weekly User Interviews

**During Step 1 (Execute FU Batches):**

- **Frequency:** Weekly or bi-weekly
- **Participants:** 2-3 users per week
- **Focus:** Validate features as they're built
- **Format:** 30-minute check-ins, show progress, gather feedback

### Prototype Testing During Development

**As features are built:**

- **Frequency:** After each major UI FU completes
- **Method:** Show working prototype, gather feedback
- **Participants:** 3-5 users
- **Focus:** Validate implementation matches usability findings

### Rapid Iteration

**Based on continuous feedback:**

- Make quick adjustments based on user feedback
- Don't wait for next release
- Prioritize critical usability fixes
- Update FU specs as needed

---

## Discovery Report Templates

### Value Discovery Report

```markdown
# Release vX.Y.Z — Value Discovery Report

**Discovery Window:** [dates]
**Interviews Conducted:** X interviews across Y ICP segments
**Report Generated:** [date]

## Results Summary

- **Problem Validation:** X/Y (Z%) validate problem exists ✅/❌
- **Interest in Solution:** X/Y (Z%) express interest ✅/❌
- **Value Proposition:** X/Y (Z%) see clear value ✅/❌
- **Overall Status:** ✅ VALIDATED / ⚠️ PARTIAL / ❌ FAILED

## Key Findings

### Problem Validation

- Common pain points: [list]
- Current workarounds: [list]
- Problem severity: [high/medium/low]

### Value Proposition

- What resonates: [list]
- What's missing: [list]
- Questions/concerns: [list]

### Recommendations

- [Actionable recommendations]

## Next Steps

- [Next discovery activities or proceed to build]
```

### Usability Discovery Report

```markdown
# Release vX.Y.Z — Usability Discovery Report

**Discovery Window:** [dates]
**Tests Conducted:** X user tests
**Report Generated:** [date]

## Results Summary

- **Workflow Completion:** X/Y (Z%) ✅/❌
- **Usability Rating:** X.X/5.0 average ✅/❌
- **Critical Blockers:** X identified
- **Overall Status:** ✅ VALIDATED / ⚠️ NEEDS IMPROVEMENT / ❌ FAILED

## Key Findings

### Task Completion

- [Task]: X/Y (Z%) completed successfully
- [Task]: X/Y (Z%) completed successfully

### Usability Issues

- **Critical Blockers:** [list]
- **Minor Friction:** [list]

### Recommendations

- [Actionable usability improvements]

## Next Steps

- [Usability fixes before build or during build]
```

### Business Viability Report

```markdown
# Release vX.Y.Z — Business Viability Discovery Report

**Discovery Window:** [dates]
**Interviews Conducted:** X interviews
**Report Generated:** [date]

## Results Summary

- **Willingness to Pay:** X/Y (Z%) ✅/❌
- **Price Point Acceptance:** X/Y (Z%) at target price ✅/❌
- **Value Drivers:** [list]
- **Overall Status:** ✅ VALIDATED / ⚠️ ADJUST PRICING / ❌ FAILED

## Key Findings

### Pricing

- Acceptable price range: €X - €Y/month
- Target price acceptance: X/Y (Z%)

### Value Drivers

- Must-have features: [list]
- Nice-to-have features: [list]

### Recommendations

- [Pricing strategy adjustments]

## Next Steps

- [Pricing decisions or further validation]
```

---

## File Structure

```
docs/releases/in_progress/vX.Y.Z/
  ├── release_plan.md
  ├── manifest.yaml
  ├── discovery_plan.yaml          # Discovery activities and hypotheses
  ├── discovery_report.md          # Combined discovery findings
  ├── value_discovery_report.md    # Value discovery findings
  ├── usability_discovery_report.md # Usability discovery findings
  ├── business_viability_report.md  # Business viability findings
  └── feasibility_validation.md     # Technical feasibility findings
```

---

## Agent Instructions

### When to Load This Document

Load when:

- Planning Release discovery activities (Step 0.5)
- Conducting discovery (interviews, prototype testing)
- Synthesizing discovery findings
- Making go/no-go decisions

### Required Co-Loaded Documents

- `docs/feature_units/standards/release_workflow.md` — Release workflow integration
- `docs/specs/ICP_PRIORITY_TIERS.md` — ICP segments for interviews
- `docs/specs/ICP_PROFILES.md` — Detailed ICP profiles

### Constraints Agents Must Enforce

1. **ALWAYS define discovery plan during Release planning**
2. **ALWAYS conduct discovery before building (Step 0.5)**
3. **ALWAYS make go/no-go decision based on discovery findings**
4. **ALWAYS update Release plan based on discovery learnings**
5. **NEVER skip discovery for production releases**

---

## Example: MVP Discovery Plan

```yaml
discovery:
  value_discovery:
    hypothesis: "AI-Native Operators will find value in unified document search via MCP"
    method: "ICP interviews"
    participants:
      - segment: "AI-Native Individual Operators"
        count: 5
      - segment: "High-Context Knowledge Workers"
        count: 5
    timeline: "Week 1-2"
    success_criteria:
      - "≥70% validate problem exists"
      - "≥60% express interest in solution"
  usability_discovery:
    hypothesis: "Users can complete upload → extraction → timeline workflow without guidance"
    method: "Prototype user testing"
    participants:
      - segment: "AI-Native Individual Operators"
        count: 5
    timeline: "Week 2"
    success_criteria:
      - "≥80% complete workflow successfully"
  business_viability_discovery:
    hypothesis: "Tier 1 ICPs will pay €250-€1,250/month for Neotoma"
    method: "Willingness-to-pay interviews"
    participants:
      - segment: "AI-Native Individual Operators"
        count: 5
    timeline: "Week 2"
    success_criteria:
      - "≥50% express willingness to pay"
```

---

**END OF DOCUMENT**
