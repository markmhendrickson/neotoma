---
name: analyze
description: Analyze codebase or context per foundation analyze command.
triggers:
  - analyze
  - /analyze
---

# Analyze Project

Analyze any project (URL or term) from both competitive and partnership perspectives relative to **all** repositories (comparative analysis across your repos). Load repo list from the truth layer (per `neotoma_parquet_migration_rules.mdc`).

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
1. Load all repos from truth layer (per `neotoma_parquet_migration_rules.mdc`)
2. Discover repo context for current repo and all repos in the loaded list
3. Research target project via web scraper MCP (if ChatGPT/Twitter URL) or browser tools
4. Generate competitive analysis using standardized template (compare target vs. each repo)
5. Generate partnership analysis using standardized template (compare target vs. each repo)
6. Save both analyses to private docs submodule
7. Present summary to user (including comparative summary across repos)

**For Content/Thought Leadership (Articles, Research, etc.):**
1. Load all repos from truth layer (per `neotoma_parquet_migration_rules.mdc`)
2. Discover repo context for current repo and all repos in the loaded list
3. Research target resource via web scraper MCP (if ChatGPT/Twitter URL) or browser tools
4. Generate holistic relevance analysis using relevance template (applicable to each repo)
5. Save analysis to private docs submodule
6. Present summary to user (including relevance to each repo where applicable)

**Output:**
- Products/Projects:
  - Competitive analysis: `docs/private/competitive/[target_name]_competitive_analysis.md`
  - Partnership analysis: `docs/private/partnerships/[target_name]_partnership_analysis.md`
- Content/Thought Leadership:
  - Relevance analysis: `docs/private/insights/[target_name]_relevance_analysis.md`

---

## Execution Instructions

### Step 1a: Load All Repos from Truth Layer (REQUIRED FIRST)

**Objective:** Load the list of all repositories so analysis is comparative across all your repos.

**Actions:**

1. **Load repo list from truth layer** (per `neotoma_parquet_migration_rules.mdc`). For repositories: Neotoma first, then Parquet with `data_type="repositories"`. If still no records: run `execution/scripts/sync_repos_to_parquet.py` with `DATA_DIR` set, then query again; or warn that comparison will use only the current repo.

2. **Store repo list and paths:**
   - For each record: `name`, `path`, `parent_dir`, `core_identity_path`, `product_positioning_path`, `problem_statement_path`, `philosophy_path`.
   - Use these paths when discovering context in Step 1b.

**Critical:** All subsequent discovery and comparison MUST use this repo list.

---

### Step 1b: Discover Repo Context for Current and All Repos (REQUIRED)

**Objective:** Dynamically discover identity and positioning for the current repository and for every repo in the loaded list (so analysis is comparative).

**Actions:**

1. **For the current repo (workspace):**
   - Check: `docs/foundation/core_identity.md`, `docs/foundation/product_positioning.md`, `docs/foundation/problem_statement.md`, `docs/foundation/philosophy.md`.
   - Extract repo identity, positioning, differentiators, target users, principles.
   - Store under a key for the current repo name.

2. **For each other repo in the loaded list:**
   - Use `path` (or foundation doc paths) from the repos record. Read each repo's foundational documents from the paths in the record (e.g. `core_identity_path`, `philosophy_path`) when those files exist.
   - Extract same elements (identity, positioning, differentiators, target users, principles).
   - Store under a key for that repo's `name`.

3. **Handle missing docs:**
   - If a repo has NO foundational docs: Note "No foundation docs" for that repo; comparisons will be partial.
   - If PARTIAL docs found: Use what's available, note gaps.
   - If ALL docs found for a repo: Proceed with full context for that repo.

4. **Store discovered context keyed by repo name:**
   - For each repo: Repo name, Positioning, Differentiators, Target users, Principles.
   - Keep current repo's context clearly identified for summary output.

**Critical:** ALL subsequent analysis will compare the target against every repo's discovered context (comparative analysis across all repos).

---

### Step 2: Research Target Resource

**Objective:** Gather comprehensive information about the target and determine resource type

**Actions:**

1. **Check if URL is supported by web scraper:**
   - **ChatGPT URLs:** `https://chatgpt.com/share/...` or `https://chatgpt.com/c/...`
   - **Twitter/X URLs:** `https://twitter.com/.../status/...` or `https://x.com/.../status/...`
   - **If supported:** Use web scraper MCP tools (see Step 1a below)
   - **If not supported:** Use browser tools (see Step 1b below)

1a. **If web scraper supported URL:**
   - **Use `scrape_content` MCP tool** with the URL
   - **Parameters:**
     - `url`: The target URL
     - `method`: "auto" (default, tries methods in order)
   - **Extract content from response:**
     - For ChatGPT: Parse conversation messages from scraped JSON
     - For Twitter/X: Parse tweet content, author, engagement metrics
     - Extract title, content, metadata, engagement metrics
   - **Store scraped content path** for reference
   - **Proceed to resource type determination** (Step 2 below)

1b. **If not web scraper supported or search term:**
   - **If URL format:** Navigate directly using browser tools
   - **If search term:** Use web search, navigate to top relevant result
   - Take screenshot and capture snapshot (if accessible)

2. **Determine resource type:**
   - **Product/Project:** Has features, pricing, business model, target users (e.g., SaaS app, platform, tool)
   - **Content/Thought Leadership:** Article, blog post, research paper, video, podcast, tweet thread, analysis, ChatGPT conversation
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
   - Format (article, video, podcast, ChatGPT conversation, Twitter/X post, etc.)
   - **For scraped content:** Include message count (ChatGPT) or tweet details (Twitter/X)

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
   - Fill in repo context from Step 1b for **all** repos in the loaded list
   - Focus on extracting insights applicable to each repo; note which repos are most/least relevant

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
   - Fill in repo context from Step 1b for **all** repos in the loaded list
   - Make comparisons explicit for each repo: "[Target] vs. [Repo A]", "[Target] vs. [Repo B]", etc. Include a comparative summary across all repos.

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
   - Fill in repo context from Step 1b for **all** repos in the loaded list
   - Frame partnership for each repo: "[Target] partnership with [Repo A]", etc. Include comparative assessment across all repos.

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
⚠️ Warning: No foundational documents found in `docs/foundation/`.
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
⚠️ Warning: Private docs directory not found at `docs/private/`.

Output will be saved to:
- docs/competitive/[target_name]_competitive_analysis.md
- docs/partnerships/[target_name]_partnership_analysis.md

Recommendation: Set up private docs submodule.
See: foundation/README.md (Private Docs Submodule Setup)

Proceed? (yes/no)
```

### Scenario: Web Scraper MCP Not Available

**If web scraper URL is provided but MCP server is not configured:**

```
⚠️ Notice: Web scraper MCP server not configured for URL "[url]".

Falling back to browser tools for research.

To enable web scraper for ChatGPT/Twitter URLs:
1. Add web scraper submodule: git submodule add https://github.com/markmhendrickson/mcp-server-web-scraper.git mcp/web-scraper
2. Configure in .cursor/mcp.json (see Configuration section)

Proceeding with browser tools...
```

**If web scraper MCP tool fails:**

```
⚠️ Warning: Web scraper failed for URL "[url]".

Error: [error message]

Falling back to browser tools...

Proceeding with browser tools...
```

## Configuration

### MCP Server Configuration

**Web Scraper MCP Server Setup:**

The analyze command automatically uses the web scraper MCP server for ChatGPT and Twitter/X URLs when configured. To set up:

1. **Add web scraper as submodule** (if not already added):
   ```bash
   git submodule add https://github.com/markmhendrickson/mcp-server-web-scraper.git mcp/web-scraper
   git submodule update --init mcp/web-scraper
   ```

2. **Install dependencies:**
   ```bash
   cd mcp/web-scraper
   pip install -r requirements.txt
   playwright install chromium
   ```

3. **Configure in `.cursor/mcp.json`:**
   ```json
   {
     "mcpServers": {
       "web-scraper": {
         "command": "/absolute/path/to/mcp/web-scraper/run-web-scraper-mcp.sh",
         "cwd": "/absolute/path/to/mcp/web-scraper"
       }
     }
   }
   ```

4. **Optional: Configure Apify API token** (for Apify scraping method):
   - Set `APIFY_API_TOKEN` environment variable, or
   - Configure in 1Password (item "Apify", field "API token" in vault "Private")

**Supported URLs:**
- ChatGPT: `https://chatgpt.com/share/...` or `https://chatgpt.com/c/...`
- Twitter/X: `https://twitter.com/.../status/...` or `https://x.com/.../status/...`

**Note:** If web scraper MCP server is not configured, the command will fall back to browser tools for all URLs.

### Analysis Configuration

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
- **Comparative analysis:** All analysis is relative to **all** repos. Load repos from truth layer (per `neotoma_parquet_migration_rules.mdc`). Parquet fallback: `data_type="repositories"`; if empty, run `execution/scripts/sync_repos_to_parquet.py` (with `DATA_DIR` set).
- Output documents are confidential and stored in private docs submodule
- **Resource Type Detection:** Command automatically detects if resource is a product/project (competitive/partnership analysis) or content/thought leadership (relevance analysis)
- Templates ensure consistent, thorough analysis across all assessments
- For content/thought leadership, analysis focuses on extracting insights applicable to current repo rather than competitive positioning
- **Web Scraper Integration:** ChatGPT and Twitter/X URLs are automatically handled via web scraper MCP server when configured (see MCP configuration)
- **Browser Tools Fallback:** Non-scraper URLs and search terms use browser tools for research

