# Agent onboarding confirmation

## Purpose

This document defines the complete agent-driven onboarding flow for Neotoma. The canonical written source for the sequence is [`install.md`](../../install.md); this document expands how activation should work once the user has been evaluated and installed, or when they are already installed and moving straight into activation.

The central success criterion is that the user sees a reconstructed timeline from their own data, with every event traced to a specific source, and thinks: "This system understood which parts of my local context matter and reconstructed something useful almost immediately."

## Target outcome

- 5-15 files ingested
- 1-3 entities formed
- 1 timeline reconstructed with provenance
- 1 query answered with source references
- 1 correction mechanism demonstrated
- Relevant current-tool configuration completed after activation
- Total time: 3-5 minutes

## Canonical funnel

The outer onboarding funnel is:

**evaluation → installation → activation → tooling config**

Branch rules:
- If the user is already installed, skip installation and move straight to activation.
- If likely first data to store was already identified during evaluation, do not repeat that discovery unnecessarily.
- If the current tool is constrained, say so and recommend a better-supported primary environment when needed.

## Activation sequence

This document focuses on the activation phase. Activation is the point where the user sees their first successful Neotoma-backed workflow from their own data.

### Activation entry conditions

Before starting activation:

1. The user has either completed installation or has confirmed that Neotoma is already installed.
2. The agent knows the user's current tool and likely tool constraints.
3. The agent either already identified likely first data to store during evaluation or is about to do so now.

### Stage 1: Preference selection

At the start of activation, the agent asks what data types matter most to the user. This shapes the discovery scan.

**Preference categories:**
- Project files (contracts, proposals, briefs, specs)
- Chat transcripts (AI conversations, Slack, Discord, messaging exports)
- Meeting notes and transcripts
- Notes and journals (Obsidian, markdown, dated files)
- Code and development context (git history, READMEs, configs)
- Email exports
- Financial documents (invoices, receipts, statements)
- Custom paths (user-specified folders)

**Onboarding modes** (user selects one):

| Mode | Description | Best for |
| --- | --- | --- |
| **Quick win** | Scan recent/high-signal work folders, suggest 5-20 files, aim for one timeline | First-time users, low commitment |
| **Guided** | User points at one folder or project, deeper analysis there | Users with a specific project in mind |
| **Power user** | Rule-based ingestion from multiple folders, full scoring output | Technical users who want full control |

Store the selected preferences as a `user_preference` entity in Neotoma so future discovery respects them.

### Stage 2: Discovery

The agent scans shallowly based on the selected preferences and mode. It applies the file ranking heuristic from `docs/foundation/file_ranking_heuristic.md`.

**Scan approach:**
- Read top-level folders, recent files, filenames, and metadata
- Use small content excerpts only when needed to confirm entity density
- Apply positive and negative signal scoring
- Group results into domain clusters by folder structure and entity co-occurrence

**Output format** -- the agent presents domains, not file counts:

```
Detected 3 likely high-value domains:

1. Acme project (~/Documents/Clients/Acme/) -- 4 files
   Contracts, meeting notes, proposal revisions

2. Zurich insurance (~/Notes/Insurance/) -- 3 files
   Policy documents, renewal correspondence

3. Neotoma docs (~/repos/neotoma/docs/) -- 6 files
   Architecture docs, release notes, specs
```

**For chat transcript discovery**, the agent also checks for:
- ChatGPT export files (conversations.json or similar)
- Slack export directories
- Claude conversation exports
- Meeting transcript files (.vtt, .txt, .md with timestamps)

If transcripts are found, the agent explains their special value: "Chat transcripts encode decision flow, commitments, and entity references with timestamps. They are one of the best sources for timeline reconstruction."

### Stage 3: Explain and propose

For each recommended domain or file cluster, the agent shows:
- **Why it was selected** -- which signals triggered (repeated entities, version markers, date patterns, recent modification)
- **What state it may contain** -- types of entities likely present (clients, contracts, decisions)
- **What entity/timeline value it could unlock** -- the reconstruction potential

Example:

```
Acme project (~/Documents/Clients/Acme/)

Why selected: Contains repeated references to "Acme Corp" across 4 files,
multiple dated revisions (proposal_v1.md, proposal_v2.md), and a meeting
note with date stamps. Cross-referenceable artifacts.

Likely state: 1 client entity, 1-2 contract/proposal entities, 3-4 dated events

Timeline potential: Can reconstruct proposal evolution and client relationship
history from January through March 2026.
```

### Stage 4: Scoped confirmation

The user confirms at a granular level. This is not all-or-nothing.

**Options per cluster:**
- Ingest entire folder
- Ingest selected files only
- Skip this cluster
- Inspect more (agent shows additional file details)

**Before ingestion**, show the expected reconstruction preview:

```
Expected output from Acme project:
- 1 client entity (Acme Corp)
- 1 contract entity (Integration Contract)
- 4 dated events (proposal drafts, meeting, confirmation)
- 4 linked sources
```

This sets expectations and builds trust before any data is stored.

### Stage 5: Ingest and reconstruct

Ingest the confirmed files using the existing store infrastructure:
- Use `store --file-path` for each file (unstructured path with interpretation)
- Or `store --json` with extracted entities (structured path)
- Create relationships between entities (PART_OF, REFERS_TO, EMBEDS)

The first ingest aims at one compelling timeline: one client relationship, one contract evolution, or one project history. Do not try to prove the entire platform on first run.

### Stage 6: Installation aha -- timeline and provenance reconstruction

This is the pivotal moment. The agent produces a reconstructed timeline with full provenance.

**What the agent does:**
1. After ingestion completes, automatically reconstruct the strongest timeline available from the ingested entities
2. Select the entity with the richest temporal depth (most dated events, most source cross-references)
3. Render the timeline with provenance inline

**Required output structure:**

```
[Entity name] -- Timeline reconstructed from [N] sources

[Date] -- [Event description]
  Source: [filename], [location]

[Date] -- [Event description]
  Source: [filename], [location]

[Date] -- [Event description]
  Source: [filename], [location]

[N] entities detected | [N] events | [N] linked sources
Entities: [entity name (type), ...]
```

**Concrete example:**

```
Acme Corp relationship -- Timeline reconstructed from 4 sources

Jan 10 -- Initial proposal drafted
  Source: ~/Documents/Clients/Acme/proposal_v1.md

Feb 12 -- Pricing discussion in team meeting
  Source: ~/Meetings/2026-02-12 Acme renewal.md

Feb 15 -- Revised proposal with updated scope
  Source: ~/Documents/Clients/Acme/proposal_v2.md

Feb 18 -- Client confirmed revised terms
  Source: ~/Documents/Clients/Acme/contract_amendment.pdf

3 entities detected | 4 events | 4 linked sources
Entities: Acme Corp (client), Integration Contract (contract), Revised Proposal (document)
```

**What makes this the aha:**
- Every event traces to a specific file the user recognizes
- The timeline reveals temporal structure the user may not have noticed
- It demonstrates that Neotoma understood which files matter and why
- It is concrete and verifiable
- It is not "Imported 4 files" -- it is "Reconstructed a relationship history from 4 files"

**Immediately after the timeline, offer one strong follow-up query:**
- "What commitments appear in the Acme relationship?"
- "How did the contract terms evolve between versions?"
- "What changed with Acme over the last 90 days?"

The query must be specific to the reconstructed entity. The answer must reference the same provenance chain.

**Then surface 2-4 leveraged next actions** (see Stage 3c in the plan):
1. "Because the [Entity] timeline exists, you can now ask: What commitments appear in the [Entity] relationship?"
2. "Track how [specific entity] changes over time as new sources appear"
3. "This timeline uses N sources. You could extend it by adding [suggested source type]"
4. "Watch [specific folder] for new revisions to keep this timeline current"

**Anti-patterns to avoid:**
- "Imported 4 files successfully" -- no visible structure, no value demonstrated
- "Found 12 entities" -- counts without context
- Generic questions like "What would you like to know?" -- must be specific
- Timeline without source references -- loses provenance trust
- Showing all entities at once -- focus on the single strongest timeline first

### Stage 7: Correction

Demonstrate the correction mechanism immediately after the aha timeline.

**Prompt the user with a specific correction question:**
- "Is this timeline accurate? Should any events be adjusted or sources excluded?"
- "I grouped proposal_v1.md and proposal_v2.md under the same contract entity. Is that correct, or are these separate agreements?"

**Supported corrections:**
- Wrong entity merge -- split entities that were incorrectly grouped
- Wrong date -- correct a date extracted from a file
- Wrong source linkage -- reassign an observation to a different entity
- Exclusion -- remove a sensitive or irrelevant file from the reconstruction

This demonstrates that the user has full control over the state layer.

## Tooling config after activation

After the user has reached the Installation Aha, configure the tool they are using for the most robust ongoing Neotoma workflow.

- **ChatGPT**: prefer a Custom GPT or remote MCP path when supported; if hosted constraints are too limiting, recommend a better-supported primary environment.
- **Claude**: connect Neotoma, create or use a Project, and add project instructions.
- **Cursor / Claude Code / Codex / OpenClaw**: finish local MCP wiring first, then offer additional remote access points if helpful.

## Activation mechanisms (post-aha)

After the installation aha, agents can deepen engagement with these mechanisms. All build on the reconstructed timeline and maintain provenance in their output.

| Mechanism | Description | Example |
| --- | --- | --- |
| **Time-travel queries** | Extend the timeline backward or forward | "What changed with Acme over the last 90 days?" |
| **Decision extraction** | Surface commitments and promises from sources | "3 commitments detected: pricing revision, scope agreement, delivery date" |
| **Cross-source synthesis** | Connect the same entity across file types | "Acme pricing appears in meeting notes and ChatGPT export" |
| **Missing-context alerts** | Identify gaps in the timeline | "Contract references 'Jan 5 call' but no meeting notes from that date found" |
| **Project dossier** | Generate a structured entity profile | Entities, relationships, timeline, source inventory, gaps |

## Post-aha leverage suggestions

Triggered only after the user has seen the reconstructed timeline. Must reference specific entities by name.

1. **Deeper queries** -- "Because the [Entity] timeline exists, you can now ask: What commitments appear in the [Entity] relationship?"
2. **Track evolving entities** -- "Track how [specific entity] changes over time as new sources appear"
3. **Expand timeline** -- "This timeline uses N sources. You could extend it by adding [specific suggested source type]"
4. **Automate updates** -- "Watch [specific folder] for new revisions to keep this timeline current"

Phrased as capabilities unlocked by the structure that now exists, not as instructions.

## Guardrails

- No full-disk scan by default. Discovery is always shallow-first, user-scoped.
- No silent ingestion. Every file requires preview and explicit consent.
- No vague output. First visible output is domain/entity/timeline, never a file count.
- Provenance always shown. Every stored entity links back to source files.
- Correction always available. Entity merges, dates, linkages, and exclusions can be fixed.
- Preferences shape discovery. User-selected data types weight the scoring heuristic.

## Related documents

- [`install.md`](../../install.md) -- canonical agent install workflow
- [`docs/foundation/file_ranking_heuristic.md`](../foundation/file_ranking_heuristic.md) -- file scoring model
- [`docs/foundation/what_to_store.md`](../foundation/what_to_store.md) -- storage decision rubric
- [`docs/developer/transcript_ingestion.md`](transcript_ingestion.md) -- chat transcript import guide
- [`docs/developer/mcp/instructions.md`](mcp/instructions.md) -- MCP interaction instructions
