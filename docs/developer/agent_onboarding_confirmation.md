---
title: Agent onboarding confirmation
summary: "This document defines the complete agent-driven onboarding flow for Neotoma. The canonical written source for the sequence is [`install.md`](../../install.md); this document expands how activation should work once the user has been evalu..."
---

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

### Stage 0: Context detection

Before preference selection, detect what kind of directory Neotoma is being installed into. Do not default to personal-file ingestion without checking.

**Detection:**
- List direct subdirectories of the install directory and check for `.git/` in each; also check whether the install directory itself is a git repository.
- Note personal-file signals at the same level (folders of notes, contracts, invoices, transcripts, financial documents).

**Surface the findings:**

```
I see N git repositories here: <list>
I also see <personal-file signals, if any>
```

**Ask explicitly:**

```
Is this primarily:
(a) a developer/projects directory (repos for code projects),
(b) a personal-data directory (notes, clients, documents),
(c) a mix?
```

**Branch on the answer:**

- **Personal** -- continue to Stage 1 (preference selection → discovery → preview → ingest → aha).
- **Developer** -- switch to the [developer / repo-integration branch](#activation-branch-developer--repo-integration). That branch produces a written integration plan, not an ingest.
- **Mixed** -- start with the developer / repo-integration branch; after the plan is delivered, offer to continue with the personal-data branch.

Store the user's context choice as a `user_preference` entity so later sessions default correctly. Do not ingest files at this stage.

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

### Stage 4: Preview contract

Before any ingest in the personal or mixed branch, the agent MUST produce a preview. This applies to every activation ingest, including single-file and single-transcript cases. Count-only summaries are forbidden as the first post-action output.

**The preview MUST contain:**

1. **Candidates** -- every file, transcript, or migration item proposed for storage, with its source path and a short content excerpt where useful. Include platform-memory and other context-source candidates here too, with provenance marking stored vs new.
2. **Why each was selected** -- the specific signals that triggered it (repeated entity names, dated revisions, recent modification, sender/recipient, transcript structure). One reason per candidate.
3. **Expected reconstruction**:
   ```
   Expected output from Acme project:
   - 1 client entity (Acme Corp)
   - 1 contract entity (Integration Contract)
   - 4 dated events (proposal drafts, meeting, confirmation)
   - 4 linked sources
   ```
4. **Explicit confirmation prompt** with scoped options:
   - Ingest entire folder
   - Ingest selected files only
   - Skip this cluster
   - Inspect more (agent shows additional file details)

After asking, pause and wait for the user's response. Do not store any data before receiving explicit confirmation.

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

### Activation branch: developer / repo integration

Entered from Stage 0 when the user identifies the install directory as developer-oriented (or mixed). The output of this branch is a **written integration plan document**, not an ingest. Do not store entities, do not watch folders, do not call `store --file-path` in this branch.

#### Step B1: Repo inventory

For each detected git repository, gather lightweight signals from cheap reads (no deep content scans):

- Recent commit activity -- last commit timestamp (for example `git log -1 --format=%ci`)
- README presence and primary language (by file extension heuristics)
- AI-agent configuration present: `.cursor/rules/`, `.claude/`, `AGENTS.md`, `.codex/`
- Docs footprint: `docs/`, `specs/`, `ADR/`, design-doc folder
- Approximate activity scale: commit count in the last 90 days; multi-author if available

Present the inventory as a compact list.

#### Step B2: Rank and recommend

Score repos for "likely benefit from Neotoma as a memory substrate." Higher score when:

- Long decision history (many commits, many PRs/issues, long-lived branches)
- Existing AI-agent configuration indicates recurring agent sessions that lose context across runs
- Rich documentation (specs, ADRs, design docs) with cross-references
- Multi-author activity (coordination cost)
- Signals of recurring context loss: repeated "why did we do X" style issues, stale TODOs, investigation threads across files

Present the top 3-5 repos. For each, include a one-paragraph rationale grounded in the signals above.

#### Step B3: Explain the integration

For the recommended repos collectively, explain:

- **What Neotoma would persist per repo**: decisions and their rationale, open threads, entity relationships between PRs/issues/people, cross-session agent context.
- **What pain it solves**: agent context loss across sessions, rediscovery of past decisions, drift between docs and code, orphaned investigation threads.
- **What is out of scope**: code indexing for search, runtime memory, autonomous agent execution. Neotoma is the State Layer only.

#### Step B4: Offer plan drafting

Ask: "Which repo should I draft a full Neotoma integration plan for?"

After the user picks one, produce a written integration plan covering:

- **Scope**: which docs, configs, and history segments to treat as ingestible source (for example `docs/`, `specs/`, `ADR/`, selected commit ranges, open issues/PRs).
- **Per-repo agent instructions**: proposed edits to `.cursor/rules/`, `AGENTS.md`, and `.claude/rules/` that point contributors at Neotoma for memory operations.
- **MCP wiring**: guidance for contributors to configure the Neotoma MCP server locally (or CLI as fallback).
- **Expected aha**: a timeline or decision graph reconstructible from the proposed scope once ingested.
- **Next steps**: an explicit checklist for the user to execute when ready. This branch does not execute those steps.

**Example developer-branch aha (produced later, after the user acts on the plan):**

```
neotoma repo integration -- Decision timeline reconstructed from 6 sources

Oct 12 2025 -- Adopted State/Strategy/Execution layer split
  Source: docs/foundation/layered_architecture.md, initial commit

Nov 02 2025 -- Chose hash-based deterministic entity IDs
  Source: docs/architecture/determinism.md, ADR-003

Dec 18 2025 -- Added agent-driven onboarding funnel
  Source: install.md, commit 3a1b2c4

Jan 09 2026 -- Added preview-before-store guardrail
  Source: docs/developer/agent_onboarding_confirmation.md, commit 9f2e3d5

4 entities detected | 6 events | 6 linked sources
Entities: Neotoma architecture (project), layered_architecture (doc), determinism ADR (decision), onboarding funnel (feature)
```

End the activation flow after delivering the plan. Do not ingest as a "natural next step"; any ingest requires a fresh, explicit request from the user that re-enters the personal or mixed branch.

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
- Do not skip Stage 0 (context detection). Always check whether the install directory is developer-oriented before defaulting to personal-file ingestion.
- The developer / repo-integration branch must not ingest files or store entities. Its output is a written integration plan only. Any ingest requires a separate, explicit user request that re-enters the personal or mixed branch.
- The preview contract (Stage 4) is mandatory even for single-file or single-transcript ingests. Count-only summaries are forbidden as the first post-action output.

## Related documents

- [`install.md`](../../install.md) -- canonical agent install workflow
- [`docs/foundation/file_ranking_heuristic.md`](../foundation/file_ranking_heuristic.md) -- file scoring model
- [`docs/foundation/what_to_store.md`](../foundation/what_to_store.md) -- storage decision rubric
- [`docs/developer/transcript_ingestion.md`](transcript_ingestion.md) -- chat transcript import guide
- [`docs/developer/mcp/instructions.md`](mcp/instructions.md) -- MCP interaction instructions
