---
name: analyze
description: Analyze Project
---

<!-- Source: foundation/agent_instructions/cursor_commands/analyze.md -->

# Analyze Project

Analyze any project (URL or term) from both competitive and partnership perspectives relative to the current repository.

## Command

```
analyze <url_or_term>
```

## Input

**Accepts:**
- Full URL (e.g., `analyze https://memorae.ai`)
- Domain name (e.g., `analyze memorae.ai`)
- Search term (e.g., `analyze "memory layer productivity"`)

**Examples:**
- `analyze memorae.ai`
- `analyze https://memorae.ai`
- `analyze "memory layer productivity tool"`

---

## Workflow Overview

This command performs systematic analysis following the framework defined in `foundation/strategy/project_assessment_framework.md`. The analysis type depends on the resource:

**For Products/Projects:**
1. Discover current repo context by loading foundational documents
2. Research target project via browser tools
3. Generate competitive analysis using standardized template
4. Generate partnership analysis using standardized template
5. Save both analyses to private docs submodule
6. Present summary to user

**For Content/Thought Leadership (Articles, Research, etc.):**
1. Discover current repo context by loading foundational documents
2. Research target resource via browser tools
3. Generate holistic relevance analysis using relevance template
4. Extract insights applicable to current repo
5. Save analysis to private docs submodule
6. Present summary to user

**Output:**
- Products/Projects:
  - Competitive analysis: `docs/private/competitive/[target_name]_competitive_analysis.md`
  - Partnership analysis: `docs/private/partnerships/[target_name]_partnership_analysis.md`
- Content/Thought Leadership:
  - Relevance analysis: `docs/private/insights/[target_name]_relevance_analysis.md`

---

## Execution Instructions

### Step 1: Discover Current Repo Context (REQUIRED FIRST)

**Objective:** Dynamically discover the current repository's identity and positioning

**Actions:**

1. **Check for foundational documents:**
   ```
   - Check: docs/foundation/core_identity.md
   - Check: docs/foundation/product_positioning.md
   - Check: docs/foundation/problem_statement.md
   - Check: docs/foundation/philosophy.md
   ```

2. **Extract repo identity:**
   - Read document titles (e.g., "Neotoma Core Identity" → repo name is "Neotoma")
   - Extract from first paragraph or explicit identity statements
   - Extract core value proposition
   - Extract defensible differentiators (if documented)
   - Extract target users
   - Extract core principles

3. **Handle missing docs:**
   - If NO foundational docs found: Warn user, proceed with generic analysis
   - If PARTIAL docs found: Use what's available, note gaps in analysis
   - If ALL docs found: Proceed with full context-aware analysis

4. **Store discovered context:**
   - Repo name: [Extracted name]
   - Positioning: [Core value proposition]
   - Differentiators: [List of defensible differentiators]
   - Target users: [User segments]
   - Principles: [Core principles]

**Critical:** ALL subsequent analysis will be relative to this discovered context.

---

### Step 2: Research Target Resource

**Objective:** Gather comprehensive information about the target and determine resource type

**Actions:**

1. **Navigate to target:**
   - **If URL format:** Navigate directly using browser tools
   - **If search term:** Use web search, navigate to top relevant result
   - Take screenshot and capture snapshot (if accessible)

2. **Determine resource type:**
   - **Product/Project:** Has features, pricing, business model, target users (e.g., SaaS app, platform, tool)
   - **Content/Thought Leadership:** Article, blog post, research paper, video, podcast, tweet thread, analysis
   - **Hybrid:** Product with significant thought leadership content (analyze as both)

3. **If Product/Project:** Proceed to Steps 3-4 (Competitive & Partnership Analysis)
4. **If Content/Thought Leadership:** Proceed to Step 3a (Relevance Analysis)

2. **Extract basic information:**
   
   **For Products/Projects:**
   - Project name
   - Tagline/positioning statement
   - Core value proposition
   - Key features (list 5-10 main features)
   - Pricing model (if visible on site)
   - Target users (if stated or inferable from content)
   - User count or social proof (if available)
   
   **For Content/Thought Leadership:**
   - Title/headline
   - Author/creator and credentials
   - Publication date
   - Main themes and topics
   - Key arguments or insights
   - Engagement metrics (views, likes, shares)
   - Format (article, video, podcast, etc.)

3. **Analyze technology stack:**
   - Check network requests for stack indicators:
     - Frontend frameworks (React, Vue, Next.js, etc.)
     - Backend indicators (API patterns, headers)
     - Third-party services (analytics, CDN, payments)
   - Document identified technologies

4. **Document business model:**
   - Pricing: Free / Freemium / Paid / Enterprise
   - Pricing tiers (if available)
   - Revenue model: Subscription / One-time / Usage-based
   - Business stage: MVP / Growth / Mature

5. **Identify positioning:**
   - Category (e.g., Productivity app, Developer tool, Memory system)
   - Key messaging (what they emphasize in hero section)
   - Stated differentiators (what makes them unique)
   - Competitive references (if they mention competitors)

6. **Research additional context (optional):**
   - Check for public documentation
   - Check for GitHub repository (if open source)
   - Check for pricing page
   - Check for about/team page

**Document all findings** for use in templates.

---

### Step 3a: Generate Relevance Analysis (For Content/Thought Leadership)

**Objective:** Create holistic relevance analysis document for non-product resources

**Actions:**

1. **Load template:**
   - Read `foundation/strategy/relevance_analysis_template.md`

2. **Fill out all sections:**
   - Use template structure exactly
   - Fill in resource info from Step 2
   - Fill in current repo info from Step 1
   - Focus on extracting insights applicable to current repo

3. **Key areas to analyze:**
   - **Relevance Summary:** Overall relevance and primary relevance areas
   - **Key Insights:** Extract 3-5 main insights with actionable implications
   - **Competitive Intelligence:** Any competitors or trends mentioned
   - **Technical Insights:** Technical concepts relevant to repo
   - **Strategic Implications:** Positioning validation, market direction, user needs
   - **Architectural Validation:** Whether resource validates/challenges defensible differentiators
   - **Actionable Recommendations:** Immediate actions, strategic considerations, research areas

4. **Generate filename:**
   - Extract name/title from resource
   - Sanitize: lowercase, underscores, no special chars
   - Example: "karpathy_2025_llm_review" from article title
   - Filename: `[target_name]_relevance_analysis.md`

5. **Save document:**
   - Create directory if needed: `docs/private/insights/`
   - Write complete analysis
   - Path: `docs/private/insights/[target_name]_relevance_analysis.md`

**Skip Steps 3-4 if resource is Content/Thought Leadership.**

---

### Step 3: Generate Competitive Analysis (For Products/Projects Only)

**Objective:** Create competitive assessment document

**Actions:**

1. **Load template:**
   - Read `foundation/strategy/competitive_analysis_template.md`

2. **Fill out all sections:**
   - Use template structure exactly
   - Fill in target info from Step 2
   - Fill in current repo info from Step 1
   - Make all comparisons explicit: "[Target] vs. [Current Repo Name]"

3. **Key assessments to make:**
   - **Competitive Dynamic:** Direct / Adjacent / Complementary / None
   - **Risk Level:** High / Medium / Low / None
   - **Feature Overlap:** High / Medium / Low / None
   - **Market Overlap:** Same / Adjacent / Different
   - **User Overlap:** Same / Adjacent / Different

4. **Special focus: Defensible Differentiation**
   - If current repo has documented defensible differentiators:
     - Evaluate whether target can pursue same differentiators
     - Identify structural barriers (or lack thereof)
     - Assess defensibility of your positioning

5. **Generate filename:**
   - Extract domain or term
   - Sanitize: lowercase, underscores, no special chars
   - Example: "memorae" from "memorae.ai"
   - Filename: `[target_name]_competitive_analysis.md`

6. **Save document:**
   - Create directory if needed: `docs/private/competitive/`
   - Write complete analysis
   - Path: `docs/private/competitive/[target_name]_competitive_analysis.md`

---

### Step 4: Generate Partnership Analysis

**Objective:** Create partnership assessment document

**Actions:**

1. **Load template:**
   - Read `foundation/strategy/partnership_analysis_template.md`

2. **Fill out all sections:**
   - Use template structure exactly
   - Fill in target info from Step 2
   - Fill in current repo info from Step 1
   - Frame as partnership opportunity: "[Target] partnership with [Current Repo]"

3. **Key assessments to make:**
   - **Partnership Value:** High / Moderate / Low / Not Viable
   - **Integration Feasibility:** High / Medium / Low / Not Feasible
   - **Complementary Value:** High / Medium / Low / None
   - **User Overlap:** High / Medium / Low / None
   - **Business Model Alignment:** Compatible / Neutral / Conflicting

4. **Integration scenarios (required):**
   - Document 3 specific integration scenarios
   - For each: description, implementation approach, effort, value
   - Recommend one scenario with rationale

5. **Risk assessment:**
   - Privacy risks and mitigations
   - Security risks and mitigations
   - Business risks and mitigations
   - Technical risks and mitigations
   - Conflicts with current repo principles

6. **Generate filename:**
   - Use same sanitized name from competitive analysis
   - Filename: `[target_name]_partnership_analysis.md`

7. **Save document:**
   - Create directory if needed: `docs/private/partnerships/`
   - Write complete analysis
   - Path: `docs/private/partnerships/[target_name]_partnership_analysis.md`

---

### Step 5: Present Summary

**Objective:** Deliver concise summary to user

**Actions:**

1. **If Product/Project - Present competitive summary:**
   ```
   ## Competitive Analysis: [Target] vs. [Current Repo]
   
   **Overall Assessment:** [Direct / Adjacent / Complementary / None]
   **Risk Level:** [High / Medium / Low / None]
   
   **Key Insights:**
   - [Insight 1]
   - [Insight 2]
   - [Insight 3]
   
   **Strategic Recommendations:**
   - [Recommendation 1]
   - [Recommendation 2]
   
   **Full analysis:** `docs/private/competitive/[target_name]_competitive_analysis.md`
   ```

2. **If Product/Project - Present partnership summary:**
   ```
   ## Partnership Analysis: [Target] partnership with [Current Repo]
   
   **Overall Assessment:** [High / Moderate / Low / Not Viable]
   **Integration Feasibility:** [High / Medium / Low / Not Feasible]
   
   **Partnership Recommendation:** [Pursue / Explore / Monitor / Pass]
   
   **Key Opportunities:**
   - [Opportunity 1]
   - [Opportunity 2]
   
   **Next Steps:**
   - [Step 1]
   - [Step 2]
   
   **Full analysis:** `docs/private/partnerships/[target_name]_partnership_analysis.md`
   ```

3. **If Content/Thought Leadership - Present relevance summary:**
   ```
   ## Relevance Analysis: [Resource] relevance to [Current Repo]
   
   **Overall Relevance:** [High / Moderate / Low / Not Relevant]
   
   **Primary Relevance Areas:**
   - [Area 1]
   - [Area 2]
   - [Area 3]
   
   **Key Insights:**
   - [Insight 1]
   - [Insight 2]
   - [Insight 3]
   
   **Actionable Recommendations:**
   - [Recommendation 1]
   - [Recommendation 2]
   
   **Full analysis:** `docs/private/insights/[target_name]_relevance_analysis.md`
   ```

4. **Provide file paths:**
   - Link to generated document(s)
   - Note that all are in private docs submodule

---

## Error Handling

### Scenario: No Foundational Docs

**If no foundational docs exist:**

```
Analysis will proceed without repo-specific context.

Recommendation: Create foundational documents for better analysis:
- docs/foundation/core_identity.md
- docs/foundation/product_positioning.md
- docs/foundation/problem_statement.md

Proceed? (yes/no)
```

### Scenario: Invalid URL

**If URL cannot be accessed:**

```
❌ Error: Cannot access URL "[url]"

Options:
1. Try web search for "[term]"
2. Provide alternative URL
3. Cancel analysis

Enter choice (1/2/3):
```

### Scenario: No Private Docs Directory

**If `docs/private/` doesn't exist:**

```

Output will be saved to:
- docs/competitive/[target_name]_competitive_analysis.md
- docs/partnerships/[target_name]_partnership_analysis.md

Recommendation: Set up private docs submodule.
See: foundation/README.md (Private Docs Submodule Setup)

Proceed? (yes/no)
```

## Configuration

**Optional configuration in `foundation-config.yaml`:**

```yaml
strategy:
  competitive_analysis:
    enabled: true
    output_directory: "docs/private/competitive/"
  partnership_analysis:
    enabled: true
    output_directory: "docs/private/partnerships/"
  relevance_analysis:
    enabled: true
    output_directory: "docs/private/insights/"
  
private_docs:
  enabled: true
  repo_url: "https://github.com/user/private-docs.git"
  path: "docs/private"
```

If configuration doesn't exist, use defaults:
- Competitive output: `docs/private/competitive/`
- Partnership output: `docs/private/partnerships/`
- Relevance output: `docs/private/insights/`

---

## Related Documents

- `foundation/strategy/project_assessment_framework.md` - Complete assessment methodology
- `foundation/strategy/competitive_analysis_template.md` - Competitive analysis template (for products/projects)
- `foundation/strategy/partnership_analysis_template.md` - Partnership analysis template (for products/projects)
- `foundation/strategy/relevance_analysis_template.md` - Relevance analysis template (for content/thought leadership)
- `foundation/strategy/README.md` - Strategy evaluation framework overview

---

## Notes

- This command is generic and works for any repo using foundation as submodule
- All analysis is relative to dynamically discovered current repo context
- Output documents are confidential and stored in private docs submodule
- **Resource Type Detection:** Command automatically detects if resource is a product/project (competitive/partnership analysis) or content/thought leadership (relevance analysis)
- Templates ensure consistent, thorough analysis across all assessments
- For content/thought leadership, analysis focuses on extracting insights applicable to current repo rather than competitive positioning
- **X/Twitter URLs:** Handled via browser tools or MCP integration (set up separately as MCP if needed)

