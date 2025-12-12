## Marketing Agent Instructions

_(Instructions for AI Agents Generating Marketing Content)_

---

### Purpose

This document provides instructions for AI agents (Claude, ChatGPT) generating marketing content for Neotoma's pre-launch and post-launch marketing activities.

---

### 1. Brand Voice and Guidelines

**Voice**: Technical, authentic, privacy-first, build-in-public

**Tone**:

- Technical depth without jargon overload
- Authentic and honest about challenges
- Privacy-first positioning (user control, no provider access)
- Building in public transparency

**Key Messages**:

- Privacy-first architecture (user-controlled vs. provider-controlled)
- Deterministic extraction (reproducible vs. ML-based probabilistic)
- Cross-platform access (MCP integration, not platform-locked)
- Entity resolution and timelines (specialized features)

**Defensible Differentiators** (Lead with these):

1. Privacy-first architecture
2. Deterministic extraction
3. Cross-platform access

**Avoid**:

- Hype language
- Overpromising
- Generic marketing speak
- Feature-only positioning (without defensible differentiators)

---

### 2. Content Templates

#### 2.1 Twitter Thread Template

**Structure** (5-7 tweets):

1. **Hook Tweet**: Problem/insight that grabs attention

   - Example: "I've been building something to solve a problem I've had with AI tools..."

2. **Problem Expansion** (2-3 tweets):

   - Describe the problem in detail
   - Use concrete examples
   - Connect to reader's experience

3. **Solution Introduction** (1-2 tweets):

   - Introduce Neotoma as solution
   - Highlight key differentiators (privacy-first, deterministic, cross-platform)

4. **Technical Details** (1-2 tweets):

   - Architecture overview (Records → Entities → Events)
   - MCP integration
   - Entity resolution or timelines

5. **Call-to-Action** (1 tweet):

   - Waitlist link with UTM parameter: `?utm_source=twitter&utm_medium=social&utm_campaign=waitlist_building`
   - Or signup link: `?utm_source=twitter&utm_medium=social&utm_campaign=launch`

6. **Engagement Question** (1 tweet):
   - Ask question to encourage replies
   - Example: "What's your biggest challenge with AI memory?"

**Formatting**:

- Use line breaks for readability
- Include relevant emojis sparingly (1-2 per thread max)
- Keep tweets under character limit (280 chars)
- Number threads (1/7, 2/7, etc.)

#### 2.2 Blog Post Template

**Structure** (1500-2500 words):

1. **Introduction** (200-300 words):

   - Hook: Problem or insight
   - Personal story or context
   - Thesis statement

2. **Body Sections** (1000-1800 words):

   - Problem statement (if applicable)
   - Solution overview
   - Technical deep-dive
   - Use cases and examples
   - Defensible differentiators

3. **Conclusion** (200-300 words):
   - Recap key points
   - Call-to-action (waitlist or signup link with UTM)
   - Next steps

**Formatting**:

- Use headers (H2, H3) for structure
- Include code blocks for technical examples
- Add relevant links (internal and external)
- Include images/screenshots where relevant
- SEO optimization (target keywords, meta description)

**UTM Parameters**: `?utm_source=blog&utm_medium=content&utm_campaign=pre_launch`

#### 2.3 LinkedIn Post Template

**Structure** (300-500 words):

1. **Hook** (1-2 sentences):

   - Professional insight or question

2. **Body** (200-350 words):

   - Professional context
   - Problem/solution framing
   - Key differentiators
   - Use cases

3. **Call-to-Action** (1-2 sentences):
   - Link to waitlist or blog post
   - Professional CTA

**Formatting**:

- Professional tone
- Use line breaks for readability
- Include relevant hashtags (#AI #MCP #Privacy #Tech)
- Link to blog post or waitlist

**UTM Parameters**: `?utm_source=linkedin&utm_medium=social&utm_campaign=pre_launch`

#### 2.4 Build-in-Public Update Template (Indie Hackers)

**Structure**:

1. **Week Progress** (100-200 words):

   - What you built this week
   - Key features completed
   - Screenshots/demos

2. **Challenges** (50-100 words):

   - Honest about difficulties
   - What you learned

3. **Metrics** (50-100 words):

   - Waitlist signups
   - Beta users
   - Other relevant metrics

4. **Next Steps** (50-100 words):
   - What's coming next
   - Launch timeline

**Formatting**:

- Honest and transparent
- Include screenshots
- Share metrics
- Engage with community

---

### 3. Content Generation Process

#### 3.1 Input Data

**Required Context**:

- Marketing schedule from `pre_launch_marketing_plan.md`
- Release data from `release_report.md`, `manifest.yaml`, `status.md`
- Brand guidelines (this document)
- Content templates (this document)

**Example Prompt Structure**:

```
Generate a Twitter thread for Week -4 Monday: Launch waitlist announcement thread.

Context:
- Marketing schedule: Week -4 Monday, 8am PST
- Content type: Twitter thread (5-7 tweets)
- Topic: Launch waitlist announcement
- Key messages: Privacy-first, deterministic, cross-platform MCP access
- CTA: Waitlist link with UTM parameter

Release data:
- [Include relevant release data]

Follow Twitter thread template from marketing_agent_instructions.md
```

#### 3.2 Generation Guidelines

**Do**:

- Follow templates exactly
- Include UTM parameters in all links
- Lead with defensible differentiators
- Use concrete examples
- Maintain brand voice consistency
- Include relevant technical details

**Don't**:

- Use hype language
- Overpromise features
- Skip UTM parameters
- Forget CTAs
- Use generic marketing speak
- Violate brand voice

#### 3.3 Review Checklist

**Before Publishing**:

- [ ] Follows template structure
- [ ] Includes UTM parameters
- [ ] Leads with defensible differentiators
- [ ] Maintains brand voice
- [ ] Includes relevant CTA
- [ ] No hype or overpromising
- [ ] Technical accuracy verified
- [ ] Links work correctly

---

### 4. Platform-Specific Guidelines

#### 4.1 Twitter/X (@markymark)

- Use personal account
- Thread format (5-7 tweets)
- Technical depth acceptable
- Build-in-public style
- Engagement-focused

#### 4.2 LinkedIn (Personal Account)

- Professional tone
- Thought leadership focus
- Use case examples
- Link to blog posts
- Professional hashtags

#### 4.3 Blog (Personal Website)

- Long-form content (1500-2500 words)
- SEO optimization
- Technical deep-dives
- Personal story integration
- Internal linking

#### 4.4 Indie Hackers

- Build-in-public style
- Honest about challenges
- Share metrics
- Community engagement
- Screenshots/demos

---

### 5. UTM Parameter Guidelines

**Format**: `?utm_source=PLATFORM&utm_medium=MEDIUM&utm_campaign=CAMPAIGN`

**Sources**:

- `twitter` (Twitter/X)
- `linkedin` (LinkedIn)
- `blog` (Blog posts)
- `indie_hackers` (Indie Hackers)
- `hacker_news` (Hacker News)

**Mediums**:

- `social` (Social media posts)
- `content` (Blog posts)
- `email` (Email campaigns)

**Campaigns**:

- `waitlist_building` (Pre-launch)
- `beta_launch` (Beta launch)
- `launch_announcement` (Launch day)
- `organic_growth` (Post-launch)

**Examples**:

- Twitter thread: `?utm_source=twitter&utm_medium=social&utm_campaign=waitlist_building`
- Blog post: `?utm_source=blog&utm_medium=content&utm_campaign=pre_launch`
- LinkedIn post: `?utm_source=linkedin&utm_medium=social&utm_campaign=pre_launch`

---

### 6. Related Documents

- `pre_launch_marketing_plan.md` — Marketing schedule and content topics
- `post_launch_marketing_plan.md` — Post-launch schedule and content topics
- `marketing_plan.md` — Overall marketing strategy and brand guidelines
- `marketing_automation_plan.md` — Automation architecture and workflow




