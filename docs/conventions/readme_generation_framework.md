# README Generation Framework
**Reference:** `README.md` — Project overview and entry point
## README Purpose and Audience
**Primary Audiences:**
1. **New developers** — Quick onboarding, setup, understanding what Neotoma is
2. **Potential users** — Understanding value proposition, capabilities, differentiation
3. **Contributors** — Development workflow, testing, architecture overview
4. **AI agents** — Quick reference for project scope and capabilities
**README Should:**
- Provide clear value proposition in first 100 words
- Enable quick setup and first run
- Link to comprehensive documentation
- Reflect current project status accurately
- Lead with confident, positive positioning (not defensive)
**README Should NOT:**
- Duplicate detailed technical documentation
- Include implementation specifics
- Be defensive or competitive-focused (comparisons are contextual, not primary)
- Exceed ~350 lines (maintain scannability)
## README Structure
### Required Sections (In Order)
1. **Title and Tagline** (1-2 lines)
   - Project name: "Neotoma — Truth Layer for AI Memory"
   - One-sentence description: deterministic truth layer that transforms fragmented personal data
2. **What It Does** (3-5 paragraphs)
   - Core value proposition
   - How it works (high-level workflow)
   - Key outcome: unified memory graph
3. **Neotoma's Structured Personal Data Memory** (Architectural Foundations)
   - Three architectural foundations (Privacy-First, Deterministic, Cross-Platform)
   - What these foundations enable (capabilities)
   - Confident, positive framing
4. **Problems Solved** (Table format)
   - Problem → Solution mapping
   - Focus on user value, not competitive positioning
5. **Who Neotoma Is For** (Target Users)
   - ICP profiles (AI-Native Operators, Knowledge Workers, Small Teams)
   - Why they choose Neotoma (benefits-focused)
6. **Comparison with Provider Memory** (Contextual, Not Defensive)
   - What Neotoma provides (positive framing)
   - Provider memory context (brief, factual)
   - Lead with capabilities, not limitations
7. **Core Workflow** (9-step process)
   - Ingestion → Extraction → Schema → Entity Resolution → Observations → Reducers → Events → Graph → AI Access
8. **Architecture** (High-level overview)
   - Five-layer architecture
   - Truth Layer positioning
   - Link to detailed architecture docs
9. **Releases** (All releases)
   - Current releases with status and links
   - Organized by release version
   - Include status, name, and brief description
10. **Quick Links** (Documentation navigation)
    - Getting Started
    - Documentation categories
    - Development resources
11. **Interactive Prototype** (Demo instructions)
    - Command to run prototype
    - Link to prototype docs
12. **Development** (Setup and workflow)
    - Prerequisites
    - Setup commands
    - Development servers
    - Testing commands
13. **Documentation Structure** (Complete map)
- Core Documentation (Foundation, Specs, Architecture, Subsystems, Feature Units, Releases)
- Developer Resources (Developer, Testing, Integrations, Infrastructure, Operations, Observability, API, Reference)
- Design & UI (UI, Prototypes)
- Additional Resources (Context, Conventions, Legal, Migration, Templates, Vocabulary)
- Primary entry point: Foundation rules in `.cursor/rules/`
14. **Core Principles** (12 principles)
- Deterministic, Schema-first, Explainable, Entity-unified, Timeline-aware, Cross-platform, Privacy-first, Immutable, Provenance, Dual-path ingestion, Four-layer model, Event-sourced
15. **Testing** (Testing approach)
- Test types and coverage
16. **License** (MIT)
## Content Guidelines
### Tone and Style
- **Confident and positive** — Lead with what Neotoma provides, not what competitors lack
- **Clear and direct** — Avoid jargon, use plain language where possible
- **Scannable** — Use headers, bullets, tables for quick navigation
- **Accurate** — Must match current documentation exactly
### Competitive Comparisons
- **Include but don't lead with** — Comparisons provide context, not primary positioning
- **Positive framing** — "Neotoma provides X" not "Providers don't provide X"
- **Factual and brief** — State capabilities, avoid defensive explanations
### Architectural Foundations
- **Lead with capabilities** — What these foundations enable
- **Avoid defensive language** — Don't explain why competitors can't pursue (that's internal strategy)
- **Confident positioning** — These are architectural choices, not defensive measures
### Feature Lists
- **MVP clearly separated** — What's available now vs. planned
- **User-focused** — Describe what users can do, not technical implementation
- **Accurate** — Must match current specs exactly
### Links and References
- **All links must work** — Verify relative paths
- **Link to comprehensive docs** — README is overview, not replacement
- **Organize by audience** — Getting Started vs. Deep Dives
## Information Sources
### Primary Sources (In Priority Order)
1. **`docs/foundation/core_identity.md`**
   - What Neotoma is/is not
   - Core responsibilities
   - Architectural choices
2. **`docs/foundation/product_positioning.md`**
   - Positioning and differentiation
   - Defensible differentiators
   - Feature capabilities
3. **`docs/foundation/problem_statement.md`**
   - Problems solved
   - User pain points
4. **`docs/specs/MVP_OVERVIEW.md`**
   - MVP capabilities
   - Feature lists
   - Architecture overview
5. **`docs/architecture/architecture.md`**
   - System architecture
   - Layer descriptions
6. **`docs/specs/ICP_PROFILES.md`**
   - Target user profiles
   - Use cases
7. **`docs/releases/in_progress/`**
   - Current release status
   - Active versions
   - Release names, status, and descriptions
8. **`package.json`**
   - Scripts and commands
   - Dependencies context
9. **Foundation rules in `.cursor/rules/`**
   - Documentation structure
   - Organization
### Secondary Sources
- `docs/foundation/philosophy.md` — Core principles (extracted for README)
- `docs/specs/MCP_SPEC.md` — MCP integration details
- `docs/testing/testing_standard.md` — Testing approach
**Note:** Integration providers are not listed in README; users are directed to `docs/integrations/` via Quick Links.
## Generation Process
### Step 1: Gather Information
1. Read primary source documents
2. Extract key information:
   - Value proposition
   - Architectural foundations
   - Problems solved
   - Target users
   - MVP features
   - Architecture overview
   - Development setup
   - Documentation structure
### Step 2: Structure Content
1. Follow required section order
2. Apply content guidelines (tone, style)
3. Ensure positive, confident framing
4. Verify accuracy against source docs
### Step 3: Generate README
1. Write each section following structure
2. Include all required sections
3. Maintain ~350 line target
4. Verify all links work
5. Check consistency with docs
### Step 4: Validate
1. **Accuracy check:**
   - Features match MVP_OVERVIEW.md
   - Architecture matches architecture.md
   - Principles match philosophy.md
   - Status matches releases/
2. **Link validation:**
   - All relative paths resolve
   - Documentation links correct
   - No broken references
3. **Tone check:**
   - Confident, not defensive
   - Positive framing throughout
   - Clear value proposition
4. **Completeness:**
   - All required sections present
   - Key information included
   - Nothing critical missing
## Update Triggers
**CRITICAL:** README must be **regenerated** (not patched) whenever documentation changes in materially affecting ways.
### Material Changes (Require Full Regeneration)
README must be regenerated when:
1. **Core identity changes** — `docs/foundation/core_identity.md` modified
2. **Product positioning changes** — `docs/foundation/product_positioning.md` modified
3. **MVP scope changes** — `docs/specs/MVP_OVERVIEW.md` modified
4. **Architecture changes** — `docs/architecture/architecture.md` modified
5. **New features added** — Feature specs updated
6. **Release status changes** — New releases or status updates
7. **Documentation structure changes** — New doc categories added
8. **Development workflow changes** — Setup or scripts modified
9. **Integration changes** — New providers added
10. **Philosophy/principles changes** — `docs/foundation/philosophy.md` modified
11. **Problem statement changes** — `docs/foundation/problem_statement.md` modified
12. **Target user changes** — `docs/specs/ICP_PROFILES.md` modified
13. **User explicitly requests** — "regenerate README" or similar
### What Constitutes "Materially Affecting"
A documentation change is "materially affecting" if it:
- Changes what Neotoma is or does (core identity)
- Changes how Neotoma is positioned or differentiated
- Adds or removes MVP features
- Changes architectural description or layer structure
- Modifies target users or use cases
- Updates core principles or philosophy
- Changes problems solved or value proposition
- Adds or removes integrations
- Updates release status or roadmap
- Reorganizes documentation structure significantly
**When in doubt, regenerate.** It's safer to regenerate than to patch and miss inconsistencies.
## Maintenance Rules
1. **Always regenerate for material changes** — When any trigger occurs, regenerate entire README from framework using primary sources
2. **Never patch incrementally** — Don't update individual sections; regenerate whole README to ensure consistency
3. **Verify against sources** — Check each section against primary sources after regeneration
4. **Maintain structure** — Keep required section order exactly as defined
5. **Preserve links** — Ensure all documentation links remain functional
6. **Update status** — Keep current release status accurate
7. **Check tone** — Ensure confident, positive positioning throughout
8. **Same tool call batch** — Regenerate README in same tool call batch as documentation changes
## Example: Section Generation
### "What It Does" Section
**Source:** `docs/foundation/core_identity.md`, `docs/foundation/product_positioning.md`
**Guidelines:**
- 3-5 paragraphs
- Lead with value proposition
- Explain dual-path ingestion
- Describe memory graph outcome
- Link to MCP access
**Generated Content:**
```
Neotoma builds persistent structured memory for AI agents through **dual-path ingestion**: upload documents (PDFs, images, receipts, contracts) that get automatically structured, or provide contextual information during agent conversations that gets remembered for future sessions. As you interact with ChatGPT, Claude, or Cursor, agents can both read your accumulated memory and write new structured data, creating an incremental knowledge base that grows more accurate and comprehensive over time.
The system transforms fragmented personal data into a unified memory graph—connecting people, companies, events, and relationships across all your data. Every fact traces back to its source, dates automatically create timelines, and entities are unified across all records so "Acme Corp" in one invoice matches "Acme Corp" in agent-created data, regardless of when you created them.
All memory is exposed to AI tools via Model Context Protocol (MCP), ensuring agents have structured, validated access to your truth layer. This enables agents to maintain context across sessions, answer questions about your personal data, and build on previous interactions—turning fragmented personal data into a persistent, queryable memory that scales with your agent usage.
```
