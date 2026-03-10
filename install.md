# Agent Installation Instructions

This file is the canonical source for agent installation and post-install workflow. Short stable URL for site snippets: `install.md` at repo root.

## Workflow

1. Install Neotoma with `npm install -g neotoma`.
2. Initialize Neotoma with `neotoma init`.
3. Report what changed after install/init.
4. If the user asks for agent/client integration setup after init, link the matching setup guide in `docs/developer/` (for example `mcp_cursor_setup.md`, `mcp_claude_code_setup.md`, `mcp_openclaw_setup.md`).
5. Gather candidate data from existing context and available sources. Store any structured fact that benefits from versioning, provenance, and reproducibility — not limited to personal data. See [`docs/foundation/what_to_store.md`](docs/foundation/what_to_store.md) for the full definition and decision heuristic.
   - **Migrate from platform memory:** If you are running inside a tool with native memory (Claude, ChatGPT, Gemini, Copilot), surface what that platform remembers about the user — preferences, facts, prior commitments, key entities. Structure each as a candidate entity. See [Migration from existing tools](#migration-from-existing-tools) below.
   - **Migrate from Claude Memory tool:** If the user has a directory used as the [Claude Memory tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool) backend (e.g. `/memories` or a path they provide), list and read files from it; extract entities or ingest files with provenance "from Claude Memory tool". See [Claude Memory tool](#claude-memory-tool-memories) below.
   - **Harvest current context:** current conversation, prior in-session messages, user identity hints, explicit commitments, and directly related file/message context (e.g. receipts, invoices, contacts, profile)
   - **Other data from the same context:** any additional entities already in context — e.g. third-party contacts (LinkedIn/export CSVs), saved chats or shares (ChatGPT, etc.), tweets or posts, imported documents or notes, project metadata, codebase context — so the user can choose to store those too
   - **Check active sources** if needed: git metadata (`git config`, `git log`, `git remote -v`), project metadata (`README`, `package.json`, selected config files, env var names only), configured MCP/tool outputs already available in-session
   - **Check existing Neotoma memory** (`retrieve_entities` or CLI list/search) to separate already-stored facts from new candidates
6. Map candidates to supported schema/entity types:
   - use canonical types where possible (for example: `contact`, `person`, `company`, `task`, `event`, `transaction`, `receipt`, `note`, `location`, `property`, `place`)
   - if type mapping is unclear, discover the closest match with schema search/list (`schemas list`, `schemas get`, or MCP equivalents) before inventing a type
   - if no close match exists, use a descriptive `entity_type` and include fields implied by the source data
7. Present a single preview list of all candidates with provenance:
   - one flat list, each row showing entity type, key fields, and source (for example: "from Claude memory", "from git config", "from package.json", "from current message", "from LinkedIn Connections.csv")
   - mark items already stored vs new candidates
   - where useful, indicate whether each candidate refers to the user or is other data (e.g. "third-party contact", "saved chat", "imported document") so the user can approve selectively
8. Ask for explicit confirmation (approve all / approve selected / edit / reject).
9. After asking for confirmation, pause and wait for the user response. Do not store data, run follow-up discovery, or proceed to additional actions until the user explicitly confirms.
10. Save only approved items.
11. Mark onboarding complete and continue with normal Neotoma behavior.

## Migration from existing tools

The installing agent is itself the migration tool. Because it runs inside the user's current platform, it has access to whatever that platform exposes. The strategy differs by system type:

### Platform memory (Claude, ChatGPT, Gemini, Copilot)

Platform memory is opaque and has no export API. But the installing agent can self-reflect:

- **What you have access to:** The platform's memory about the user — stored preferences, facts, commitments, key people, past conversation summaries. These are visible in your context or retrievable through the platform's memory features.
- **What to do:** Surface every distinct fact the platform remembers. Structure each as a candidate entity (person, task, preference, event, commitment, etc.). Include provenance: "from Claude memory", "from ChatGPT memory".
- **What to expect:** Platform memory is often sparse, imprecise, or stale. Treat it as seed data — valuable for bootstrapping but not authoritative. The user may want to correct, merge, or reject entries.

### Claude Memory tool (`/memories`)

When the user has been using the [Claude Memory tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool) (client-side file-based memory), their memory files live in the directory your application maps to `/memories`. That directory may be on disk (e.g. `./memories`, `~/.claude/memories`, or a path from env).

- **What to do:** If you have access to that directory (or the user provides the path), list files in it and read their contents. Memory tool files are often XML or text (e.g. `customer_service_guidelines.xml`, `notes.txt`, `preferences.txt`, `refactoring_progress.xml`). Extract structured entities from the contents, or ingest whole files with `store --file-path <path>` and provenance "from Claude Memory tool".
- **Provenance:** Tag each candidate with source e.g. "from Claude Memory tool (/memories/notes.txt)" so the user can approve selectively.
- **Format:** The Memory tool uses view/create/str_replace/insert/delete/rename on files under `/memories`; your migration path is read-only (list + read file contents, then structure and preview).

### Conversation history (ChatGPT exports, shared links)

If the user has exported conversation history or shares a link:

- **ChatGPT shared links:** Use the ChatGPT scraper MCP if available (`scrape_chatgpt_conversation`). It extracts structured conversation data from share URLs.
- **ChatGPT JSON export:** If the user has a data export (Settings > Data controls > Export), parse the conversations JSON. Extract entities (people, tasks, decisions, commitments) from message content.
- **Other conversation exports:** Accept any JSON, Markdown, or text transcript. Extract entities from content and map to schema types.

### Project configuration (`.cursor/`, `.claude/`, `.codex/`)

Project config directories reveal stable context about the user's tools and workflows:

- **`.cursor/memory/`** — Codebase metadata. Parse and map to `codebase_entity` or equivalent types. A migration path already exists (see `docs/releases/v0.2.3/schema_extensions/codebase_entity.md`).
- **`.cursor/rules/`, `.claude/rules/`** — Agent instructions. These encode user preferences and conventions — potentially worth storing as `preference` or `convention` entities.
- **`git config`** — User identity (name, email). Store as a `contact` entity for the user.

### File-based memory (Markdown, JSON, Obsidian, notes)

If the user points to personal knowledge files:

- Use `store --file-path <path>` for each file (unstructured path with interpretation).
- For structured JSON, use `store --json='[...]'` or `store --file <path>` (structured path).
- For bulk ingestion of a directory, process files sequentially and map each to entity types.

### External tool data (email, calendar, web via MCP)

If other MCP servers are configured (Gmail, Google Calendar, etc.):

- Pull relevant records via those MCPs.
- Extract and store entities per the store-first rule (people, events, tasks, notifications).
- Include provenance: "from Gmail", "from Google Calendar", etc.

### Cross-platform migration

When Neotoma is already configured in one tool and the user is adding another:

- Neotoma's state is already available via MCP or CLI. No migration needed — the new tool reads the same state layer.
- This is Neotoma's core cross-platform value: memory stored via Claude is immediately available in Cursor, Codex, or any other MCP client.

## Guardrails

- Do not run background scanning outside current context/tool outputs.
- Do not save any previewed data before explicit user confirmation.
- After presenting the preview, do not proceed with additional actions until the user explicitly confirms what to save.
- Keep confirmation-first behavior scoped to first-run onboarding only.
- Migration from platform memory is best-effort. Platform memory is opaque and may be incomplete — make this clear in the preview.

## Standing instruction handoff

The "bootstrap from existing context" and "data discovery preview" guidance should also live in standing agent instructions so agents can use it in any context, not only first-run onboarding:

- `docs/developer/cli_agent_instructions.md`
- `docs/developer/mcp/instructions.md`

## Related

- [`docs/foundation/what_to_store.md`](docs/foundation/what_to_store.md) — canonical definition of what data is worth storing in Neotoma

## Scope

- This document is the first-run onboarding flow (install, init, preview-before-save, guardrails). It is agent-facing and intended for direct linking from site snippets.
