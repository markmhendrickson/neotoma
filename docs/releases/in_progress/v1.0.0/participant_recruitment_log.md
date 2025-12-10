## Release v1.0.0 — Participant Recruitment Log

_(Track outreach, responses, and interview scheduling for discovery activities)_

---

### Purpose

Track participant recruitment progress for all discovery activities (value discovery, usability discovery, business viability discovery).

**Recruitment Targets:**

- **Value Discovery**: 13 participants (8 AI-Native Operators + 5 Knowledge Workers)
- **Usability Discovery**: 8 participants (5 AI-Native Operators + 3 Knowledge Workers) — subset from value discovery
- **Business Viability Discovery**: 8 participants (AI-Native Operators) — subset from value discovery

**Outreach Strategy:**

- Target 20-30% response rate (send 3-4x more invites than needed)
- Expect 20-30% no-show rate (schedule 20-30% more than needed)
- Maintain backup list for each segment

---

### Recruitment Channels

**AI-Native Individual Operators:**

- Twitter/X DMs and replies (use `scripts/discovery/twitter_search.js`)
- Indie Hackers community posts (use `scripts/discovery/indie_hackers_search.js`)
- Hacker News (Who's Hiring, Show HN)
- AI tool communities (r/ChatGPT, r/ClaudeAI, Discord servers) (use `scripts/discovery/reddit_discord_search.js`)
- GitHub (active AI tool users) (use `scripts/discovery/github_search.js`)
- Existing network

**High-Context Knowledge Workers:**

- LinkedIn (targeted outreach by role) (use `scripts/discovery/linkedin_sales_navigator_export.js`)
- Productivity communities (Reddit, Discord)
- Professional forums
- Existing network

**Lead Sourcing Tools:**

- See `discovery_lead_sourcing_tools.md` for automated tools for sourcing and filtering participants
- Use `scripts/discovery/unified_lead_manager.js` to combine leads from all platforms
- Import unified leads using `scripts/discovery/import_to_recruitment_log.js`

---

### Value Discovery Participants

**Target**: 13 participants (8 AI-Native Operators + 5 Knowledge Workers)

**Outreach Plan**:

- **Survey Path**: 40-50 survey responses → 20-25 willing to interview → Schedule 17-18 interviews
- **Direct Outreach Path**: 40-50 personalized messages → 20-25 responses → Schedule 17-18 interviews directly
- **Mixed Approach**: Use survey for community posts, direct outreach for personalized leads
- Account for 20-30% no-show rate in both paths

| #   | Name | Segment            | Contact Method | Outreach Date | Response | Scheduled Date | Interview Status | Notes |
| --- | ---- | ------------------ | -------------- | ------------- | -------- | -------------- | ---------------- | ----- |
| 1   |      | AI-Native Operator |                |               |          |                |                  |       |
| 2   |      | AI-Native Operator |                |               |          |                |                  |       |
| 3   |      | AI-Native Operator |                |               |          |                |                  |       |
| 4   |      | AI-Native Operator |                |               |          |                |                  |       |
| 5   |      | AI-Native Operator |                |               |          |                |                  |       |
| 6   |      | AI-Native Operator |                |               |          |                |                  |       |
| 7   |      | AI-Native Operator |                |               |          |                |                  |       |
| 8   |      | AI-Native Operator |                |               |          |                |                  |       |
| 9   |      | Knowledge Worker   |                |               |          |                |                  |       |
| 10  |      | Knowledge Worker   |                |               |          |                |                  |       |
| 11  |      | Knowledge Worker   |                |               |          |                |                  |       |
| 12  |      | Knowledge Worker   |                |               |          |                |                  |       |
| 13  |      | Knowledge Worker   |                |               |          |                |                  |       |

**Backup Candidates:**

| #   | Name | Segment | Contact Method | Status | Notes |
| --- | ---- | ------- | -------------- | ------ | ----- |
|     |      |         |                |        |       |

**Recruitment Metrics:**

- Messages sent: 0 / 50
- Responses received: 0 / 20-25
- Interviews scheduled: 0 / 17-18
- Interviews completed: 0 / 13
- No-shows: 0
- Response rate: 0% (target: 20-30%)
- Show-up rate: 0% (target: 70-80%)
- Gift cards sent: 0 / 13
- A/B test variants: [Track which templates/channels perform best]

---

### Usability Discovery Participants

**Target**: 8 participants (5 AI-Native Operators + 3 Knowledge Workers)

**Source**: Subset from value discovery participants (those who validate problem and express interest)

**Outreach Plan**: Invite 8-10 from value discovery pool to get 8 confirmed participants

| #   | Name | Segment            | Source (Value Discovery) | Scheduled Date | Interview Status | Notes |
| --- | ---- | ------------------ | ------------------------ | -------------- | ---------------- | ----- |
| 1   |      | AI-Native Operator | Value Discovery #X       |                |                  |       |
| 2   |      | AI-Native Operator | Value Discovery #X       |                |                  |       |
| 3   |      | AI-Native Operator | Value Discovery #X       |                |                  |       |
| 4   |      | AI-Native Operator | Value Discovery #X       |                |                  |       |
| 5   |      | AI-Native Operator | Value Discovery #X       |                |                  |       |
| 6   |      | Knowledge Worker   | Value Discovery #X       |                |                  |       |
| 7   |      | Knowledge Worker   | Value Discovery #X       |                |                  |       |
| 8   |      | Knowledge Worker   | Value Discovery #X       |                |                  |       |

**Recruitment Metrics:**

- Invites sent: 0 / 8-10
- Confirmed: 0 / 8
- Completed: 0 / 8
- No-shows: 0

---

### Business Viability Discovery Participants

**Target**: 8 participants (AI-Native Operators)

**Source**: Subset from value discovery participants (those expressing high interest AND commitment signals AND actual AI usage patterns)

**Outreach Plan**: Invite 12-15 from value discovery pool to get 8 confirmed participants

| #   | Name | Segment            | Source (Value Discovery) | Commitment Signals Found | Scheduled Date | Interview Status | Notes |
| --- | ---- | ------------------ | ------------------------ | ------------------------ | -------------- | ---------------- | ----- |
| 1   |      | AI-Native Operator | Value Discovery #X       |                          |                |                  |       |
| 2   |      | AI-Native Operator | Value Discovery #X       |                          |                |                  |       |
| 3   |      | AI-Native Operator | Value Discovery #X       |                          |                |                  |       |
| 4   |      | AI-Native Operator | Value Discovery #X       |                          |                |                  |       |
| 5   |      | AI-Native Operator | Value Discovery #X       |                          |                |                  |       |
| 6   |      | AI-Native Operator | Value Discovery #X       |                          |                |                  |       |
| 7   |      | AI-Native Operator | Value Discovery #X       |                          |                |                  |       |
| 8   |      | AI-Native Operator | Value Discovery #X       |                          |                |                  |       |

**Recruitment Metrics:**

- Invites sent: 0 / 12-15
- Confirmed: 0 / 8
- Completed: 0 / 8
- No-shows: 0

---

### Early Access Incentive Strategy

**When to Offer Early Access:**

**❌ DO NOT mention in initial outreach (Value Discovery):**

- Avoids biasing problem discovery phase
- Prevents attracting people who want free access vs. people with real pain
- Maintains "no sales pitch" positioning for unbiased feedback
- Follows Mom Test principle: separate problem discovery from solution

**✅ Offer AFTER interview (Value Discovery):**

- Mention in closing: "As a thank you, I'd love to give you early access when we launch"
- Framed as appreciation, not incentive
- Doesn't bias problem validation phase
- Natural fit for participants who validated problem

**✅ Can mention in outreach (Usability/Business Viability Discovery):**

- Solution already validated in value discovery
- Early access is natural incentive for prototype testing
- Participants already know about solution from value discovery
- Example: "Would you be open to testing a prototype? Early access included."

**✅ Explicit incentive (Beta Testing):**

- Week 11-12 beta testing explicitly offers early access
- Participants already validated problem + solution
- Full product access in exchange for feedback

**Recommendation**: Don't mention early access in initial value discovery outreach. Offer it after the interview as appreciation. For usability/business viability discovery, early access can be mentioned since solution is already validated.

---

### Response Rate Improvement Strategies

**Target Response Rate**: 20-30% (industry benchmark: 10-15% for cold outreach)

**Strategies to Improve Response Rates:**

1. **Personalization** (Critical)

   - Reference specific content: "I saw your post about [topic]..."
   - Mention mutual connections: "I noticed you follow [mutual]..."
   - Acknowledge their work: "Your project [name] caught my attention..."
   - Explain why them specifically: "Your experience with [specific thing] makes you perfect for this"

2. **Low Commitment Framing**

   - Emphasize "quick chat" (30 min vs 45 min)
   - "No preparation needed"
   - "Just curious about your experience"
   - "Totally casual conversation"

3. **Social Proof** (Without Biasing)

   - "I'm talking to a few other AI-native operators about this"
   - "Similar to conversations I've had with [role/type]"
   - Avoid: "Everyone loves this" (creates bias)

4. **Appropriate Incentives** (Non-Biasing)

   **Recommendation: Default with Optional Choice**

   - **Primary**: Gift card ($25-50 Amazon/Starbucks) — default, mentioned upfront
   - **Alternative options**: Mention casually as "or" alternatives (don't require choice upfront)
     - "Happy to send a $25 gift card, or donate to a charity of your choice if you prefer"
     - "Or happy to give you public recognition if that's more valuable"
   - **Why default + optional choice**:
     - Reduces cognitive load (no decision paralysis)
     - Faster response (default is clear)
     - Shows flexibility without friction
     - Research shows default + optional choice > requiring choice upfront
   - **When to offer choice**: After they agree to interview (in calendar confirmation), not in initial outreach
   - ❌ Early access (biases problem discovery — offer after interview)
   - ❌ Product discounts (biases problem discovery)

   **Best Practice**: Default to gift card in initial outreach. After they schedule, offer: "Happy to send a $25 gift card — or if you prefer, I can donate to a charity of your choice instead."

5. **Timing Optimization**

   - Email: 4-8 AM (42.7% open rate)
   - Twitter/X DM: Tuesday-Thursday, 9-11 AM or 2-4 PM
   - LinkedIn: Tuesday-Thursday, 8-10 AM
   - Avoid: Monday mornings, Friday afternoons, weekends

6. **Follow-Up Sequence**

   - Day 3: Brief reminder (if no response)
   - Day 7: Second follow-up with additional context
   - Day 14: Final follow-up (then move to backup list)
   - Each follow-up adds value (new angle, updated context)

7. **Community Positioning** (For Indie Hackers, Twitter/X)

   - Frame as "helping build something for the community"
   - "Your insights will help shape this tool"
   - "Building in public" positioning
   - Share learnings back to community

8. **Clear Value Proposition** (For Them)

   - "Help shape a tool you might actually use"
   - "Your experience matters — we're building this based on real workflows"
   - "Quick way to influence product direction"
   - Avoid: "Help me" — frame as mutual benefit

9. **Scheduling Convenience**

   - Provide calendar link (Calendly/Cal.com)
   - Offer multiple time slots
   - Time zone clarity
   - "Pick whatever works for you"

10. **Subject Line Optimization** (Email/LinkedIn)
    - Personal: "Quick question about your AI workflow?"
    - Curiosity: "How do you handle [specific thing]?"
    - Community: "Building something for AI-native operators"
    - Avoid: Generic "Research interview request"

**A/B Testing Recommendations:**

- Test personalized vs. generic messages
- Test with vs. without gift card mention
- Test different subject lines
- Test timing (morning vs. afternoon)
- Track which channels perform best

---

### Outreach Templates

#### Twitter/X DM Template (Value Discovery)

**Version A: Personalized (Recommended)**

```
Hi [Name],

I saw your post about [specific topic/project]. I'm building a tool for AI-native workflows and would love to learn about how you currently work with Claude/ChatGPT and personal data.

Quick 30-min chat? No prep needed — just curious about your experience. Happy to send a $25 gift card as thanks for your time (or donate to a charity of your choice if you prefer).

[Calendar link]

Thanks!
[Your name]
```

**Note**: Default to gift card, mention alternative casually. Don't require choice upfront.

**Version B: Community-Focused**

```
Hi [Name],

Building something for AI-native operators and talking to a few folks about their workflows. Your experience with [specific thing] caught my attention.

Would you be open to a quick 30-min chat? Totally casual — just learning how people handle personal data with AI tools. $25 gift card as thanks (or charity donation if you prefer).

[Calendar link]

Thanks!
[Your name]
```

**Note**: Default to gift card, mention alternative casually.

**Note**:

- Personalize with specific reference to their content/work
- Mention gift card upfront (neutral incentive, doesn't bias problem discovery)
- Keep it casual and low-commitment
- Do NOT mention early access in initial outreach

#### LinkedIn Outreach Template (Value Discovery)

**Version A: Personalized (Recommended)**

```
Subject: Quick question about your AI workflow?

Hi [Name],

I noticed you're [role/context] and saw [specific detail from profile/post]. I'm researching how professionals use AI tools (Claude/ChatGPT) with their personal data — contracts, receipts, research docs, etc.

Would you have 30 minutes for a quick conversation? No prep needed — just curious about your experience. Happy to send a $25 gift card as thanks (or donate to a charity of your choice if you prefer).

[Calendar link] — pick whatever works for you.

Thanks,
[Your name]
```

**Note**: Default to gift card, mention alternative casually.

**Version B: Mutual Connection**

```
Subject: [Mutual Connection] suggested I reach out

Hi [Name],

[Mutual Connection] mentioned you might be interested in sharing your experience with AI workflows. I'm researching how professionals use Claude/ChatGPT with personal data.

Quick 30-min chat? No sales pitch — just learning. $25 gift card as thanks.

[Calendar link]

Thanks,
[Your name]
```

**Note**:

- Personalize with specific detail from their profile
- Mention gift card upfront
- Provide calendar link for convenience
- Do NOT mention early access in initial outreach

#### Indie Hackers / Community Post Template (Value Discovery)

**Version A: Community-Focused (Recommended)**

```
Subject: Research: How do you give AI tools access to your personal data?

Building something for AI-native workflows and need to understand how people currently handle personal data with AI tools.

Looking for 5-8 people to chat for 30 min about:
- How you currently use Claude/ChatGPT with personal data
- Pain points with current workflows
- What would make this better

Your insights will help shape this tool. Happy to send a $25 gift card as thanks (or donate to a charity of your choice if you prefer).

If interested, reply here or DM me. No sales pitch, just research. Building in public, so I'll share learnings back to the community.

[Calendar link]

Thanks!
```

**Note**: Default to gift card, mention alternative casually.

**Version B: Direct Ask**

```
Subject: Quick research chat? ($25 gift card)

Building a tool for AI-native workflows and talking to a few folks about their AI + personal data workflows.

Quick 30-min chat? No prep needed — just curious about your experience. $25 gift card as thanks.

[Calendar link]

DM me if interested!

Thanks!
```

**Note**:

- Frame as community benefit ("help shape this tool")
- Mention gift card or charity donation option
- "Building in public" positioning
- Do NOT mention early access in initial outreach

#### Email Template (Value Discovery)

**Version A: Personalized (Recommended)**

```
Subject: Quick question about your AI workflow?

Hi [Name],

I noticed [specific detail from their work/profile]. I'm researching how [ICP segment] use AI tools (Claude/ChatGPT) with their personal data and your experience caught my attention.

Would you be open to a quick 30-minute conversation? No prep needed — just curious about your workflow.

What we'll discuss:
- How you currently use AI with your personal data (contracts, receipts, research, etc.)
- Pain points and workarounds
- What would improve your workflow

Happy to send a $25 gift card as thanks (or donate to a charity of your choice if you prefer).

[Calendar link] — pick whatever works for you, or suggest a time.

Thanks,
[Your name]
```

**Note**: Default to gift card, mention alternative casually.

**Version B: Mutual Connection**

```
Subject: [Mutual Connection] suggested I reach out

Hi [Name],

[Mutual Connection] mentioned you might be interested in sharing your experience with AI workflows. I'm researching how professionals use Claude/ChatGPT with personal data.

Quick 30-min chat? No sales pitch — just learning. $25 gift card as thanks.

[Calendar link]

Thanks,
[Your name]
```

**Note**:

- Personalize with specific detail
- Mention gift card upfront
- Provide calendar link
- Send between 4-8 AM for best open rates
- Do NOT mention early access in initial outreach

---

#### Usability Discovery Outreach Template

**Use for participants from value discovery who validated problem:**

```
Subject: Test our prototype? (Early access included)

Hi [Name],

Thanks again for the great conversation about your AI workflows. We've built a prototype and would love your feedback.

Would you be open to a 45-60 minute session where you test the prototype? Early access to the full product included as a thank you.

[Schedule link]

Thanks!
[Your name]
```

**Note**: Early access can be mentioned here since solution is already validated.

---

### Follow-Up Sequence

**Initial Outreach**: Day 0

**Follow-Up 1** (Day 3 if no response):

```
Hi [Name],

Just following up on my message about AI workflows. Still interested in a quick 30-min chat?

[Calendar link] — $25 gift card as thanks.

If not interested, no worries — just let me know!

Thanks,
[Your name]
```

**Follow-Up 2** (Day 7 if no response):

```
Hi [Name],

One more quick note — I'm wrapping up research this week and would love to include your perspective.

Quick 30-min chat? [Calendar link] — $25 gift card as thanks.

If timing doesn't work, happy to find another time.

Thanks,
[Your name]
```

**Follow-Up 3** (Day 14 if no response):

```
Hi [Name],

Last note — wrapping up research interviews this week. If you're interested in a quick chat, [calendar link]. If not, no worries!

Thanks either way,
[Your name]
```

**After Follow-Up 3**: Mark as "no response" and move to backup list

---

### Scheduling and Reminders

**Scheduling Tool**: Calendly/Cal.com (automated, syncs with calendar)

**Reminder Schedule**:

- 24 hours before: Send calendar reminder with link and gift card reminder
- 1 hour before: Send quick reminder with link
- Include time zone in all communications

**Calendar Confirmation Message** (After they schedule):

**Version A: Direct Outreach (Include Brief Screening)**

```
Hi [Name],

Thanks for scheduling! Looking forward to our chat on [date/time].

Quick question to help us prepare: Which AI tools do you currently pay for? (ChatGPT Plus/Pro, Claude Pro, Cursor, None) — helps us understand your workflow.

Also, happy to send a $25 gift card as thanks for your time — or if you prefer, I can donate to a charity of your choice instead. Just let me know your preference (or I'll default to the gift card).

See you [date/time]!

[Your name]
```

**Version B: Survey Path (No Screening Needed)**

```
Hi [Name],

Thanks for scheduling! Looking forward to our chat on [date/time].

Happy to send a $25 gift card as thanks for your time — or if you prefer, I can donate to a charity of your choice instead. Just let me know your preference (or I'll default to the gift card).

See you [date/time]!

[Your name]
```

**Why offer choice in confirmation, not initial outreach:**

**Why include screening question in direct outreach confirmation:**

- Direct outreach leads didn't go through survey (no self-reported subscription data)
- Brief question in confirmation captures subscription status before interview
- Helps prepare for interview and prioritize high-commitment participants
- Low friction (one question, optional)

- They've already committed (reduces decision paralysis)
- Shows flexibility and respect
- Doesn't add friction to initial response
- Most will default to gift card anyway

**No-Show Follow-up**:

- Send 1 friendly follow-up offering to reschedule (if valuable participant)
- Offer alternative times
- Mark as backup if they decline reschedule
- Still send gift card if they reschedule and complete interview

---

### Status

- **Current Status**: Not started
- **Recruitment Start Date**: TBD
- **Target Completion Date**: TBD (before discovery interviews begin)
- **Owner**: Mark Hendrickson
