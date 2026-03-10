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

Data enters Neotoma from multiple sources. The decision heuristic above applies regardless of origin.

| Source | Examples |
| --- | --- |
| **Platform memory** | Facts that Claude, ChatGPT, Gemini, or Copilot already remember about the user — preferences, people, commitments. Opaque and non-exportable, but the agent can self-reflect and structure what it sees. |
| **Claude Memory tool** | Client-side [Memory tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool) files under `/memories` (or the app-mapped path). List and read those files; extract entities or ingest with provenance "from Claude Memory tool". |
| **Conversation history** | ChatGPT exports, shared conversation links, transcript files. Entities extracted from message content. |
| **Session context** | Current conversation, open files, git state, prior in-session messages. The richest passive source during install. |
| **Project configuration** | `.cursor/memory/`, `.cursor/rules/`, `git config`, `package.json` — stable context about the user's tools and workflows. |
| **File-based knowledge** | Markdown notes, JSON stores, Obsidian vaults, exported CSVs (LinkedIn, etc.). |
| **External tools** | Email, calendar, web search, and other MCPs. Records pulled and stored per the store-first rule. |
| **Direct input** | Facts the user states in conversation — commitments, preferences, corrections. |

During first-run onboarding, the installing agent uses these sources to bootstrap Neotoma with existing knowledge rather than starting from an empty state. See [`install.md`](../../install.md#migration-from-existing-tools) for the full migration strategy per system type.

## Framing

Neotoma is not limited to "personal data." It is a deterministic state layer for any data that agents and users interact with — personal records, professional context, project metadata, external facts, and third-party data the user chooses to track. The common thread is that the data benefits from the guarantees Neotoma provides: versioning, provenance, schema constraints, and reproducible state evolution.

## Related documents

- [Core identity](core_identity.md) — what Neotoma is and is not
- [Philosophy](philosophy.md) — architectural invariants and principles
- [MCP instructions](../developer/mcp/instructions.md) — agent storage behavior
- [Install workflow](../../install.md) — first-run onboarding flow
