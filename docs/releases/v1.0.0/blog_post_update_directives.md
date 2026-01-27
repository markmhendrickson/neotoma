# Blog Post Content Update Directives for Agents

## Purpose
This document provides directives for agents updating blog post content in markdown format, specifically for build-in-public content during the dogfooding-first approach.

## Scope
This document covers:
- Markdown formatting standards for blog posts
- Build-in-public content style requirements
- Tone and voice guidelines
- Content structure requirements
- What to include/exclude in updates

This document does NOT cover:
- Social media content (see `pre_launch_marketing_plan.md`)
- Documentation standards (see `docs/conventions/documentation_standards_rules.mdc`)
- Code conventions (see `docs/conventions/code_conventions_rules.mdc`)

## Related Documents
- `pre_launch_marketing_plan.md` — Build-in-public content strategy
- `docs/conventions/documentation_standards_rules.mdc` — Documentation standards
- `.cursor/rules/content_style_enforcement.mdc` — Content style enforcement rules

## 1. Build-in-Public Content Requirements

### 1.1 Tone and Voice
**MUST use first-person perspective:**
- ✅ "I'm building Neotoma for my ateles integration"
- ✅ "I'm learning that..."
- ✅ "Here's what I'm discovering..."
- ❌ "Neotoma is a..." (third-person product description)
- ❌ "You can use Neotoma to..." (second-person marketing)

**MUST be authentic and personal:**
- Share real learnings from building
- Be honest about challenges
- Show progress, not perfection
- No marketing hype or corporate speak

### 1.2 Content Focus
**MUST focus on:**
- Technical learnings (determinism, MCP integration, entity resolution)
- Architectural decisions (why specific choices were made)
- Building experience (ateles integration, real use cases)
- Problem-solving (how challenges were addressed)

**MUST NOT include:**
- Waitlist signup links
- Beta invitations
- Product marketing CTAs
- Promotional language
- "Getting started" sections (product is not ready for external users)

### 1.3 Defensible Differentiators
**MUST lead with defensible differentiators when relevant:**
- Privacy-first (user-controlled, no provider access)
- Deterministic (same input → same output)
- Cross-platform (MCP integration, works with ChatGPT, Claude, Cursor)

**MUST contextualize features as enabled by differentiators:**
- Entity resolution → enabled by deterministic extraction
- Timelines → enabled by privacy-first architecture
- MCP integration → enabled by cross-platform design

## 2. Markdown Formatting Standards

### 2.1 Headers
**Structure:**
```markdown
# Main Title (H1, only one per post)

## Section Header (H2, major sections)

### Subsection Header (H3, subsections within H2)

#### Minor Header (H4, rarely needed)
```

**Requirements:**
- Use H1 for post title only
- Use H2 for major sections (Introduction, Body sections, Conclusion)
- Use H3 for subsections within major sections
- Never skip header levels (H1 → H2 → H3, not H1 → H3)
- Use descriptive, action-oriented headers

### 2.2 Paragraphs and Line Breaks
**Requirements:**
- Single line break between paragraphs
- Double line break before headers
- No trailing spaces
- Maximum line length: 100 characters (soft wrap, not hard breaks)

**Example:**
```markdown
This is paragraph one. It explains the first concept.

This is paragraph two. It continues the explanation.

## Next Section

This paragraph starts a new section.
```

### 2.3 Lists
**Bullet Lists:**
```markdown
- First item
- Second item
- Third item
```

**Numbered Lists:**
```markdown
1. First step
2. Second step
3. Third step
```

**Nested Lists:**
```markdown
- Main item
  - Sub-item one
  - Sub-item two
- Another main item
```

**Requirements:**
- Use bullet lists for unordered items
- Use numbered lists for sequential steps
- Indent nested items with 2 spaces
- No trailing punctuation on list items (unless complete sentences)

### 2.4 Code Blocks
**Inline Code:**
```markdown
Use `code` for inline code references like `entity_id` or `MCP`.
```

**Code Blocks:**
````markdown
```typescript
function generateEntityId(entityType: string, name: string): string {
  // Implementation
}
```
````

**Requirements:**
- Use backticks for inline code
- Use triple backticks with language identifier for code blocks
- Include language identifier (typescript, sql, bash, etc.)
- Keep code blocks focused and relevant

### 2.5 Links
**Format:**
```markdown
[Link text](https://example.com)
[Internal link](../path/to/file.md)
[Link with title](https://example.com "Title text")
```

**Requirements:**
- Use descriptive link text (not "click here" or "this")
- Use relative paths for internal links
- Include title attribute for external links when helpful
- No UTM parameters for build-in-public content (no marketing tracking)

### 2.6 Emphasis
**Bold:**
```markdown
**Important concept** or **key term**
```

**Italic:**
```markdown
*Emphasis* or *term definition*
```

**Requirements:**
- Use bold sparingly for key concepts or terms
- Use italic for emphasis or term definitions
- Don't overuse emphasis (reduces impact)

### 2.7 Blockquotes
**Format:**
```markdown
> This is a blockquote.
> It can span multiple lines.
```

**Requirements:**
- Use for quotes, callouts, or important notes
- Keep blockquotes concise
- Use sparingly

### 2.8 Horizontal Rules
**Format:**
```markdown
---
```

**Requirements:**
- Use to separate major sections (rarely needed)
- Don't use for minor visual separation (use headers instead)

## 3. Content Structure Requirements

### 3.1 Standard Blog Post Structure
```markdown
# Post Title

Brief introduction paragraph (2-3 sentences). Sets context and hooks the reader.

## Section 1: Problem/Context

Content explaining the problem or context from building experience.

## Section 2: Technical Deep-Dive

Technical details, architectural decisions, implementation insights.

## Section 3: Learnings/Insights

What I'm learning from building, challenges faced, solutions discovered.

## Section 4: Conclusion

Brief summary of key points. No CTA, just sharing learnings.
```

### 3.2 Build-in-Public Specific Sections
**MUST include when relevant:**
- "How I'm approaching the build" (instead of "Getting started")
- "What I'm learning" (technical insights)
- "Challenges I'm facing" (honest about difficulties)
- "Architectural decisions" (why specific choices)

**MUST NOT include:**
- "Getting started" (product not ready for external users)
- "Sign up" or "Join waitlist" CTAs
- "Try it now" or "Get early access" sections
- Product feature lists (unless explaining technical decisions)

## 4. Style Requirements

### 4.1 Anti-AI Language Patterns
**MUST remove all AI-generated language patterns:**

**Generic AI Phrases:**
- ❌ "Furthermore", "Moreover", "In addition"
- ✅ Use direct statements without transition words

**Corporate Speak:**
- ❌ "leverage" → ✅ "use" or "draw on"
- ❌ "empower" → ✅ "enable" or "let"
- ❌ "cutting-edge" → ✅ specific technical terms
- ❌ "revolutionary", "game-changing", "seamless" → ✅ remove marketing hype
- ❌ "solution" → ✅ specific description
- ❌ "platform" → ✅ "tool" or "system" where appropriate

**Language Simplification:**
- ❌ "utilize" → ✅ "use"
- ❌ "facilitate" → ✅ "enable" or "help"
- ❌ "remembrances" → ✅ "memories"
- ❌ Passive voice → ✅ Active voice ("it was found" → "I found")

### 4.2 Punctuation Patterns
**MUST NOT use:**
- Em dashes (—) or en dashes (–)
- Excessive parentheticals
- Conversational transitions

**MUST use:**
- Commas for appositives and lists
- Periods to separate ideas
- Colons to introduce lists or explanations
- Standard hyphens (-) for compound words and ranges

### 4.3 Conversational Patterns
**MUST NOT use:**
- "Now, let's..."
- "So, you might..."
- "Interestingly..."
- "As you can see..."
- "Keep in mind that..."
- Soft questions ("Have you ever...?")

**MUST use:**
- Direct statements without transition words
- Start with the subject directly
- Simple, declarative sentences

### 4.4 Sentence Structure
**Requirements:**
- Short, clear sentences (average 15-20 words)
- One idea per sentence
- Active voice preferred
- Simple sentence structure

**Example:**
```markdown
❌ "Furthermore, by leveraging cutting-edge technology, we can facilitate seamless integration that empowers users to revolutionize their workflow."

✅ "I'm using deterministic extraction to ensure the same input always produces the same output. This creates a verifiable foundation that agents can depend on."
```

## 5. Content Update Process

### 5.1 When Updating Existing Posts
**MUST:**
1. Read the entire existing post first
2. Identify what needs updating (tone, content, structure)
3. Preserve valuable technical content
4. Update tone to first-person build-in-public perspective
5. Remove marketing CTAs and waitlist links
6. Add "How I'm approaching the build" section if missing
7. Update references to reflect dogfooding-first approach

**MUST NOT:**
- Completely rewrite without preserving valuable content
- Remove technical insights
- Add marketing language
- Change technical accuracy

### 5.2 Content Transformation Example
**Before (Product-focused, third-person):**
```markdown
## Getting Started

Neotoma is a privacy-first truth layer for AI memory. You can get started by:

1. Sign up for early access
2. Upload your first document
3. Connect via MCP

[Sign up for waitlist](https://neotoma.io/waitlist)
```

**After (Build-in-public, first-person):**
```markdown
## How I'm Approaching the Build

I'm building Neotoma for my ateles integration to replace the parquet MCP. Here's my approach:

1. Building MCP integration first to ensure cross-platform access works
2. Implementing deterministic extraction to ensure reproducibility
3. Testing with real data from ateles to validate the architecture

I'm dogfooding this in my own workflow before considering external users.
```

## 6. Specific Update Directives

### 6.1 Category Updates
**When updating post category:**
- Change from "product" to "technical" for build-in-public content
- Use "technical" for architectural deep-dives
- Use "product" only for post-dogfooding marketing content

### 6.2 Body Content Updates
**MUST include:**
- First-person perspective ("I'm building...", "I'm learning...")
- Ateles integration context (why you're building it)
- Technical learnings (determinism, MCP, entity resolution)
- Architectural decisions (why specific choices)
- Honest challenges (what's difficult)

**MUST NOT include:**
- Waitlist signup links
- Beta invitations
- "Getting started" sections
- Product feature lists (unless explaining technical decisions)
- Marketing CTAs

### 6.3 Section Replacements
**Replace "Getting started" with "How I'm approaching the build":**
- Focus on development strategy
- Explain dogfooding approach
- Share technical decisions
- No user-facing instructions

### 6.4 Tone Reframing
**Transform product descriptions to build-in-public:**
- "Neotoma does X" → "I'm building Neotoma to do X"
- "You can use Neotoma for Y" → "I'm using Neotoma for Y in my ateles integration"
- "Neotoma solves Z" → "I'm building Neotoma to solve Z"

## 7. Validation Checklist

Before finalizing any blog post update, verify:

- [ ] First-person perspective used throughout
- [ ] No waitlist/beta CTAs
- [ ] No "Getting started" sections (replaced with "How I'm approaching the build")
- [ ] Ateles integration context included
- [ ] Technical learnings shared
- [ ] No AI-generated language patterns
- [ ] No em dashes (—) or en dashes (–)
- [ ] No conversational transitions
- [ ] Markdown formatting correct (headers, lists, code blocks)
- [ ] Links are descriptive (not "click here")
- [ ] Content focuses on building experience, not product marketing
- [ ] Defensible differentiators contextualized (when relevant)
- [ ] Honest about challenges (not just successes)

## 8. Examples

### 8.1 Good Build-in-Public Content
```markdown
# Why I'm Building Neotoma: The Problem with AI Memory

I'm building Neotoma for my ateles integration to replace the parquet MCP. As I work through the architecture, I'm learning that AI memory needs a truth layer foundation.

## The Fragmentation Problem

If you rely on provider memory systems, you're building on sand. ChatGPT memory disappears when OpenAI resets your session. Claude memory is locked to Anthropic's platform.

I'm building Neotoma to solve this as a privacy-first, deterministic, cross-platform truth layer.

## How I'm Approaching the Build

1. **Building for ateles integration**: I'm building Neotoma to replace parquet MCP in my ateles project. This gives me a real use case to validate the architecture.

2. **MCP integration first**: I'm focusing on MCP integration patterns to ensure cross-platform access works correctly.

3. **Deterministic extraction**: I'm implementing rule-based extraction with deterministic hashing to ensure the same input always produces the same output.
```

### 8.2 Bad Build-in-Public Content (What to Avoid)
```markdown
# Neotoma: The Future of AI Memory

Neotoma is a revolutionary platform that empowers users to leverage cutting-edge technology for seamless AI memory management.

## Getting Started

You can get started with Neotoma by:

1. Sign up for early access
2. Upload your first document
3. Connect via MCP

[Sign up for waitlist](https://neotoma.io/waitlist)

Furthermore, Neotoma facilitates seamless integration that revolutionizes your workflow.
```

## Agent Instructions

### When to Load This Document
Load this document when:
- Updating existing blog post content
- Creating new build-in-public blog posts
- Transforming product-focused content to build-in-public content
- Reviewing blog post content for style compliance

### Required Co-Loaded Documents
- `docs/releases/v1.0.0/pre_launch_marketing_plan.md` — Build-in-public content strategy
- `.cursor/rules/content_style_enforcement.mdc` — Content style enforcement rules
- `docs/conventions/documentation_standards_rules.mdc` — Documentation standards (for markdown formatting)

### Constraints Agents Must Enforce
1. **First-person perspective**: All content MUST use "I'm building..." not "Neotoma is..."
2. **No marketing CTAs**: No waitlist links, beta invitations, or promotional language
3. **Build-in-public tone**: Authentic, personal, honest about challenges
4. **Markdown formatting**: Follow all formatting standards (headers, lists, code blocks)
5. **Anti-AI patterns**: Remove all AI-generated language patterns
6. **Ateles integration context**: Include why you're building (ateles integration)
7. **Technical focus**: Focus on learnings, not product features

### Forbidden Patterns
- Third-person product descriptions ("Neotoma is...")
- Marketing CTAs ("Sign up", "Join waitlist", "Get early access")
- "Getting started" sections (replace with "How I'm approaching the build")
- AI-generated language patterns ("Furthermore", "leverage", "empower")
- Em dashes (—) or en dashes (–)
- Conversational transitions ("Now, let's...", "So, you might...")
- Corporate speak ("solution", "platform", "cutting-edge")
- Soft questions ("Have you ever...?")

### Validation Checklist
- [ ] First-person perspective used throughout
- [ ] No waitlist/beta CTAs
- [ ] No "Getting started" sections
- [ ] Ateles integration context included
- [ ] Technical learnings shared
- [ ] No AI-generated language patterns
- [ ] No em dashes (—) or en dashes (–)
- [ ] Markdown formatting correct
- [ ] Content focuses on building experience
- [ ] Honest about challenges
