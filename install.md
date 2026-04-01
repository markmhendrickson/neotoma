# Agent Installation Instructions

This file is the canonical source for the full agent-driven onboarding sequence: evaluation, installation, activation, and tooling configuration. Short stable URL for site snippets: `install.md` at repo root.

## Design principle

The canonical onboarding sequence is:

**evaluation → installation → activation → tooling config**

The activation phase follows:

**discover → propose → preview → ingest → reconstruct → query → correct**

Not:
- install first without checking fit or tool constraints
- scan everything → ingest everything → hope value appears
- configure every integration before the user has seen first value

The agent optimizes for reaching the Installation Aha: a reconstructed timeline from the user's own files, with every event traced to a specific source. The first visible post-ingest output is never a file count -- it is a timeline with provenance.

## Workflow

### Phase 1: Evaluation

Start by deciding whether Neotoma is a fit and what the first successful path should be.

1. Assess fit from available context before asking broad questions.
2. Determine the user's current tool and environment constraints:
   - local agent environment vs hosted chat product
   - MCP support level
   - whether the current tool can support robust Neotoma usage
3. Identify the likely first data to store if the user proceeds.
4. Determine whether the user is already installed:
   - if no, proceed to installation after confirmation
   - if yes, skip directly to activation
5. If the current tool is constrained, say so explicitly and recommend the best-supported path.

**Tooling guidance during evaluation:**
- **ChatGPT hosted**: If the user lacks the plan/features for strong MCP support, recommend more robust options such as Cursor, Claude, Claude Code, or Codex for primary Neotoma usage.
- **ChatGPT with suitable support**: Plan for either remote MCP or a Custom GPT, depending on the user's account and preference.
- **Claude**: Plan for Project-based usage plus connector configuration and project instructions.
- **Local tools** (Cursor, Claude Code, Codex, OpenClaw): prioritize local install and activation first; after activation, offer help configuring additional remote access points if useful.

Data evaluation can happen here before installation if the user already has enough context available in the current tool. If not, perform that evaluation during activation after installation. Do not ingest anything before explicit confirmation.

### Phase 2: Installation

If the user is not already installed:

1. Install Neotoma with `npm install -g neotoma`.
2. Initialize Neotoma with `neotoma init`.
3. Report what changed after install/init (data directory, env, MCP config, CLI instructions).

If the user is already installed:

1. Verify that Neotoma is available in the current environment.
2. Confirm whether install/init needs to be repaired or updated.
3. Skip reinstallation unless needed.

### Phase 3: Activation

Activation is the first successful Neotoma-backed workflow: the user sees value from their own data and can continue with structure, provenance, and correction. If data evaluation was not completed during Phase 1, begin by determining what should be stored first.

#### Activation step 1: Preference selection

Ask the user which data types matter most. This shapes all subsequent discovery.

**Preference categories:**
- Project files (contracts, proposals, briefs, specs)
- Chat transcripts (AI conversations, Slack, Discord, messaging exports)
- Meeting notes and transcripts
- Notes and journals (Obsidian, markdown, dated files)
- Code and development context (git history, READMEs, configs)
- Email exports
- Financial documents (invoices, receipts, statements)
- Custom paths (user-specified folders)

**Offer three onboarding modes:**

| Mode | Behavior | Best for |
| --- | --- | --- |
| Quick win | Scan recent/high-signal work folders, suggest 5-20 files, aim for one timeline | First-time users, low commitment |
| Guided | User points at one folder or project, deeper analysis there | Users with a specific project in mind |
| Power user | Rule-based ingestion from multiple folders, full scoring output | Technical users who want control |

Store selected preferences as a `user_preference` entity in Neotoma.

#### Activation step 2: Discovery

Scan shallowly based on preferences and mode. Apply the file ranking heuristic from [`docs/foundation/file_ranking_heuristic.md`](docs/foundation/file_ranking_heuristic.md).

**Scan approach:**
- Read top-level folders, recent files, filenames, and metadata
- Use small content excerpts only when needed to confirm entity density
- Group results into domain clusters by folder structure and entity co-occurrence
- Check for chat transcript exports (ChatGPT JSON, Slack exports, Claude history, meeting transcripts)

**Output in terms of domains, not file counts:**

```
Detected 3 likely high-value domains:
1. Acme project (~/Documents/Clients/Acme/) -- 4 files
2. Zurich insurance (~/Notes/Insurance/) -- 3 files
3. Neotoma docs (~/repos/neotoma/docs/) -- 6 files
```

Also gather candidate data from existing context and available sources per the original migration strategy (see [Migration from existing tools](#migration-from-existing-tools) below).

#### Activation step 3: Explain and propose

For each recommendation, show:
- **Why it was selected** -- which signals triggered (repeated entities, version markers, recent modification)
- **What state it may contain** -- types of entities likely present
- **What entity/timeline value it could unlock** -- reconstruction potential

Example:
```
Acme project (~/Documents/Clients/Acme/)
Why selected: Contains repeated references to "Acme Corp" across 4 files,
multiple dated revisions (proposal_v1.md, proposal_v2.md), and a meeting note.
Likely state: 1 client entity, 1-2 contract entities, 3-4 dated events.
Timeline potential: Can reconstruct proposal evolution and client relationship.
```

#### Activation step 4: Scoped confirmation

Let the user confirm at a granular level:
- Ingest entire folder
- Ingest selected files only
- Skip this cluster
- Inspect more (show additional file details)

**Before ingestion, show the expected reconstruction preview:**
```
Expected output: 1 client entity, 1 contract entity, 4 dated events, 3 linked sources
```

Also present migration candidates from platform memory and other context sources (see below) in the same preview, with provenance marking stored vs new.

Ask for explicit confirmation. After asking, pause and wait for user response. Do not store data or proceed until the user explicitly confirms.

#### Activation step 5: Ingest and reconstruct

Ingest confirmed files and store approved migration candidates. The first ingest aims at one compelling timeline -- one client relationship, one contract evolution, or one project history.

Save only approved items. Mark onboarding complete after storage.

#### Activation step 6: Installation aha -- timeline and provenance reconstruction

After ingestion, automatically reconstruct the strongest timeline from the ingested entities. Select the entity with the richest temporal depth and render the timeline with provenance inline.

**Required output format:**
```
[Entity name] -- Timeline reconstructed from [N] sources

[Date] -- [Event description]
  Source: [filename], [location]

[N] entities detected | [N] events | [N] linked sources
```

Immediately after the timeline, offer one strong follow-up query specific to the reconstructed entity:
- "What commitments appear in the [Entity] relationship?"
- "How did the terms evolve between versions?"
- "What changed with [Entity] over the last 90 days?"

Then surface 2-4 leveraged next actions personalized to the user's data:
1. Deeper queries against the timeline
2. Track how the entity evolves as new sources appear
3. Expand the timeline by adding suggested source types
4. Watch a folder for new revisions

See [`docs/developer/agent_onboarding_confirmation.md`](docs/developer/agent_onboarding_confirmation.md) for the complete aha specification with examples and anti-patterns.

#### Activation step 7: Correction

Demonstrate correction immediately after the aha timeline:
- "Is this timeline accurate? Should any events be adjusted or sources excluded?"
- Support: wrong entity merge, wrong date, wrong source linkage, file exclusion
- The correction prompt must reference the specific reconstruction just shown

### Phase 4: Tooling config

After the user has reached activation, configure the current tool for the most robust ongoing Neotoma usage.

1. Configure the integration that matches the tool the user is currently in.
2. Prefer the strongest persistent instruction/configuration surface available in that tool.
3. If the user started in a local environment, offer to help configure additional remote or hosted access points after activation.
4. If the user started in a constrained hosted tool, recommend a better-supported primary environment if that will materially improve Neotoma usage.

**Examples:**
- **ChatGPT**: prefer a Custom GPT or remote MCP path when supported.
- **Claude**: create or use a Project, connect Neotoma, and add routing instructions.
- **Cursor / Claude Code / Codex / OpenClaw**: complete local MCP wiring first, then offer additional remote access points where relevant.

## Migration from existing tools

The installing agent is itself the migration tool. Because it runs inside the user's current platform, it has access to whatever that platform exposes. Migration candidates are gathered during Stage 3 (Discovery) and presented alongside file discovery results in Stage 5 (Scoped confirmation).

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

### Chat transcripts and conversation history

Chat transcripts are one of the highest-value ingestion sources. See [`docs/developer/transcript_ingestion.md`](docs/developer/transcript_ingestion.md) for the full guide.

If the user has exported conversation history or shares a link:

- **ChatGPT shared links:** Use the ChatGPT scraper MCP if available (`scrape_chatgpt_conversation`). It extracts structured conversation data from share URLs.
- **ChatGPT JSON export:** If the user has a data export (Settings > Data controls > Export), parse the conversations JSON. Extract entities (people, tasks, decisions, commitments) from message content.
- **Slack/Discord exports:** Parse channel export directories. Extract messages with timestamps, authors, entity references.
- **Meeting transcripts:** Parse VTT, SRT, TXT, or markdown transcripts with speaker labels and timestamps.
- **Other conversation exports:** Accept any JSON, Markdown, or text transcript. Extract entities from content and map to schema types.

When suggesting transcript import, explain the benefit:
```
Chat transcripts encode decisions, commitments, and project discussions with
timestamps. Importing them allows Neotoma to reconstruct project evolution,
client commitments, and design decisions.
```

### Project configuration (`.cursor/`, `.claude/`, `.codex/`)

Project config directories reveal stable context about the user's tools and workflows:

- **`.cursor/memory/`** — Codebase metadata. Parse and map to `codebase_entity` or equivalent types.
- **`.cursor/rules/`, `.claude/rules/`** — Agent instructions. These encode user preferences and conventions.
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

- Do not run full-disk scans or deep directory crawls by default. Discovery is always shallow-first, user-scoped.
- Do not ingest files silently. Every file requires preview and explicit consent.
- Do not output file counts as the primary result. Output domains, entities, and timelines.
- Do not save any previewed data before explicit user confirmation.
- After presenting the preview, do not proceed with additional actions until the user explicitly confirms what to save.
- Keep confirmation-first behavior scoped to first-run onboarding only.
- Migration from platform memory is best-effort. Platform memory is opaque and may be incomplete — make this clear in the preview.
- Provenance must be shown for every stored entity. Every fact traces back to its source.

## Standing instruction handoff

The bootstrap, discovery, and reconstruction guidance should also live in standing agent instructions so agents can use it in any context, not only first-run onboarding:

- `docs/developer/cli_agent_instructions.md`
- `docs/developer/mcp/instructions.md`

## Related

- [`docs/foundation/what_to_store.md`](docs/foundation/what_to_store.md) — canonical definition of what data is worth storing
- [`docs/foundation/file_ranking_heuristic.md`](docs/foundation/file_ranking_heuristic.md) — file scoring model for discovery
- [`docs/developer/agent_onboarding_confirmation.md`](docs/developer/agent_onboarding_confirmation.md) — detailed stage-by-stage onboarding with aha specification
- [`docs/developer/transcript_ingestion.md`](docs/developer/transcript_ingestion.md) — chat transcript import guide

## Scope

- This document is the first-run onboarding flow (evaluation, installation, activation, tooling config). It is agent-facing and intended for direct linking from site snippets.
