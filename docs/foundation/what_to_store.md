# What to store in Neotoma

## Principle

Neotoma stores any structured fact that benefits from deterministic state evolution, versioning, and provenance. The deciding question is not "is this personal data?" but **"does this fact benefit from being versioned, auditable, and reproducible?"**

If an agent or user would later need to recall a fact, verify when it changed, trace why a decision was made, or reconstruct state at a point in time — it belongs in Neotoma.

## What to store

### Tier 1 — High-value facts (store proactively)

| Category | Examples |
| --- | --- |
| **People and relationships** | Contacts, companies, organizations, role connections |
| **Commitments and tasks** | Obligations, action items, deadlines, promises made |
| **Events and decisions** | Meetings, milestones, choices with rationale |
| **Financial facts** | Transactions, invoices, receipts, contracts, payments owed |

### Tier 2 — Contextual facts (store when encountered)

| Category | Examples |
| --- | --- |
| **Preferences and standards** | User preferences, conventions, style guides, stated constraints |
| **Project context** | Codebase entities, architectural decisions, release metadata, config |
| **Documents and artifacts** | Uploaded files with extracted structure, reports, specifications |

### Tier 3 — Derived context (store when useful)

| Category | Examples |
| --- | --- |
| **Conversations** | Agent interactions with provenance (persisted per-turn) |
| **Session state** | Active environment, running tools, current working context |
| **External data** | Records pulled from email, calendar, web, APIs, other MCPs |

## Concrete examples by priority tier

These before/after examples show what storage looks like in practice. "Before" is what happens without Neotoma; "After" is what happens with it.

### Priority 1 — Entry point (first session)

**Contacts from a conversation:**
- Before: You mention "Clayton from Acme" in a chat. Next session, the agent has no idea who Clayton is. You re-explain.
- After: Agent stores `{ entity_type: "contact", name: "Clayton", company: "Acme", canonical_name: "Clayton" }` with a REFERS_TO link to the conversation. Next session, agent retrieves Clayton's full context instantly.

**Task from a commitment:**
- Before: You say "I need to follow up with Sarah about the contract by Friday." The commitment exists only in that chat session.
- After: Agent stores `{ entity_type: "task", title: "Follow up with Sarah about contract", due_date: "2026-04-04", status: "open" }` with a REFERS_TO to Sarah's contact entity. Task persists across sessions and tools.

**Decision with rationale:**
- Before: You and your agent decide to use PostgreSQL instead of MySQL for a project. Three weeks later, neither of you remembers why.
- After: Agent stores `{ entity_type: "decision_note", title: "Use PostgreSQL over MySQL", rationale: "Better JSON support, existing team expertise", context: "Project X database selection" }`. The rationale is versioned and traceable.

### Priority 2 — Personal domains (first week)

**Financial transaction:**
- Before: You import a bank statement. The data lives in the CSV file. No entity resolution, no timeline, no cross-referencing with contacts or tasks.
- After: Agent stores each transaction with entity resolution: `{ entity_type: "transaction", merchant: "Starbucks", amount: -5.40, date: "2026-03-28" }`. "Starbucks" resolves to the same entity across all statements. You can query total spend by merchant over time.

**Meeting from calendar:**
- Before: Calendar events are siloed in Google Calendar. Your agent has no access to meeting context from last week.
- After: Agent stores `{ entity_type: "event", title: "Q2 Planning with Nick", date: "2026-03-25", attendees: ["Nick Talwar", "Matt Kirk"] }` with REFERS_TO links to contact entities. When preparing for the next meeting, agent retrieves prior meeting context automatically.

### Priority 3 — OS maturation (weeks 2-4)

**Content pipeline state:**
- Before: You have a blog post draft in one tool, publishing notes in another, and social distribution plans in a third. You are the human index.
- After: Agent stores `{ entity_type: "blog_post", title: "How I built a personal agentic OS", status: "draft", published_date: null }` and updates the observation as the post progresses through editing, review, and publication. Full timeline of state changes is queryable.

**Agent session context:**
- Before: Every new coding session starts from scratch. The agent does not know which files were changed yesterday or what decisions were made.
- After: Agent stores `{ entity_type: "architectural_decision", title: "Use event sourcing for audit trail", codebase: "neotoma", rationale: "Enables temporal queries and replay" }`. Next session, the agent retrieves relevant architectural context for the current work.

### Priority 4 — Organic growth

**Dispute tracking:**
- Before: You have an ongoing billing dispute with a vendor. Details are scattered across emails, chat messages, and phone call notes. Reconstructing the timeline requires manual archaeology.
- After: Agent stores each interaction as an observation on the dispute entity. `{ entity_type: "dispute", vendor: "Acme Billing", status: "open", amount_disputed: 250.00 }` with observations for each touchpoint. The full timeline is queryable: "What did we know about this dispute on March 15?"

## What NOT to store

| Condition | Reason |
| --- | --- |
| **Ephemeral output** with no future recall value | No benefit from versioning or provenance |
| **Duplicate records** already in Neotoma | Deduplication via content hashing; check before storing |
| **Inferred or predicted data** | Neotoma stores facts, not guesses (see [Philosophy](philosophy.md) §5.6) |
| **Data the user hasn't provided or approved** | Explicit user control required (see [Philosophy](philosophy.md) §5.2) |
| **Credentials, secrets, API keys** | Security risk; these belong in secret managers, not state layers |

## Decision heuristic

When deciding whether to store something, apply this test:

1. **Recallability** — Would an agent or user need this fact again in a future session?
2. **Auditability** — Would someone need to know when this fact was recorded or how it changed?
3. **Reproducibility** — Would reconstructing state at a past point in time require this fact?
4. **Relationship value** — Does this fact connect to other entities in useful ways (people, tasks, events)?

If any answer is yes, store it. If all are no, skip it.

## Where data comes from

Data enters Neotoma from multiple sources. The decision heuristic above applies regardless of origin. Sources are ordered by typical signal density during onboarding discovery.

| Source | Examples | Signal density |
| --- | --- | --- |
| **Chat transcripts** | ChatGPT exports, Claude history, Slack/Discord exports, meeting transcripts. Encode decisions, commitments, causal sequences, and entity references with timestamps. See [`transcript_ingestion.md`](../developer/transcript_ingestion.md). | Very high |
| **Platform memory** | Facts that Claude, ChatGPT, Gemini, or Copilot already remember about the user — preferences, people, commitments. Opaque and non-exportable, but the agent can self-reflect and structure what it sees. | High |
| **Project documents** | Contracts, proposals, briefs, meeting notes, dated revision series. Rich in entities, version markers, and decision points. | High |
| **Claude Memory tool** | Client-side [Memory tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool) files under `/memories` (or the app-mapped path). List and read those files; extract entities or ingest with provenance "from Claude Memory tool". | Medium-High |
| **Session context** | Current conversation, open files, git state, prior in-session messages. The richest passive source during install. | Medium |
| **File-based knowledge** | Markdown notes, JSON stores, Obsidian vaults, exported CSVs (LinkedIn, etc.). | Medium |
| **Project configuration** | `.cursor/memory/`, `.cursor/rules/`, `git config`, `package.json` — stable context about the user's tools and workflows. | Medium |
| **Repository context** | Git history, ADRs, specs, `docs/`, `AGENTS.md`, issue/PR threads from a specific repo the user integrates Neotoma into as a memory substrate. Ingest only when the user confirms the developer / repo-integration branch of activation (see [`install.md`](../../install.md)). | High |
| **External tools** | Email, calendar, web search, and other MCPs. Records pulled and stored per the store-first rule. | Medium |
| **Direct input** | Facts the user states in conversation — commitments, preferences, corrections. | Varies |

During first-run onboarding, the installing agent uses these sources to bootstrap Neotoma with existing knowledge rather than starting from an empty state. The agent ranks candidates using the [file ranking heuristic](file_ranking_heuristic.md) to maximize signal density per file ingested. See [`install.md`](../../install.md) for the full onboarding workflow and migration strategy.

## Framing

Neotoma is not limited to "personal data." It is a deterministic state layer for any data that agents and users interact with — personal records, professional context, project metadata, external facts, and third-party data the user chooses to track. The common thread is that the data benefits from the guarantees Neotoma provides: versioning, provenance, schema constraints, and reproducible state evolution.

## File ranking for onboarding discovery

During onboarding, agents must decide which local files to propose for ingestion. The [file ranking heuristic](file_ranking_heuristic.md) provides a composite scoring model based on entity density, temporal density, relationship potential, recency, and user salience. Key signals include repeated named entities, date/version markers in filenames, decision-rich file types, and cross-format co-occurrence within folder subtrees.

The goal is to maximize the value of the first few files ingested, producing a timeline reconstruction (the Installation Aha) rather than a file count.

## Related documents

- [Core identity](core_identity.md) — what Neotoma is and is not
- [Philosophy](philosophy.md) — architectural invariants and principles
- [File ranking heuristic](file_ranking_heuristic.md) — composite scoring model for file discovery
- [MCP instructions](../developer/mcp/instructions.md) — agent storage behavior
- [Install workflow](../../install.md) — first-run onboarding flow
- [Agent onboarding confirmation](../developer/agent_onboarding_confirmation.md) — full stage-by-stage onboarding guide
- [Transcript ingestion](../developer/transcript_ingestion.md) — chat transcript import guide
