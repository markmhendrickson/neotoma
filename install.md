# Agent Installation Instructions

This file is the canonical source for the full agent-driven onboarding sequence: evaluation, installation, activation, and tooling configuration. Short stable URL for site snippets: `install.md` at repo root.

## Design principle

The canonical onboarding sequence is:

**evaluation → installation → activation → tooling config**

The activation phase follows:

**detect context → discover → propose → preview → ingest → reconstruct → query → correct**

Not:
- install first without checking fit or tool constraints
- scan everything → ingest everything → hope value appears
- configure every integration before the user has seen first value
- assume the install directory is a personal-data directory when it may be a developer/projects directory

The agent optimizes for reaching the Installation Aha: a reconstructed timeline from the user's own files, with every event traced to a specific source. The first visible post-ingest output is never a file count -- it is a timeline with provenance.

When the install directory is developer-oriented (multiple git repositories present), activation may branch from "detect context" into a [repo-integration path](#activation-branch-developer--repo-integration) that outputs a written integration plan instead of proceeding to ingest.

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
- **Cursor / Claude Code / Codex**: prioritize local install and activation first; after activation, offer help configuring additional remote access points if useful.
- **OpenClaw**: prioritize the native plugin install path first (`openclaw plugins install clawhub:neotoma`). Use manual MCP wiring only as fallback when the plugin path is unavailable or unsuitable.

Data evaluation can happen here before installation if the user already has enough context available in the current tool. If not, perform that evaluation during activation after installation. Do not ingest anything before explicit confirmation.

### Phase 2: Installation

The installation phase is optimized for agent harnesses with directory-scoped
permissions. The agent MUST use the canonical `neotoma` commands below and MUST
NOT improvise shell introspection (`python3 -c`, `grep -r`, `ls`, `cat`, `jq`,
`find`, `which`, `node -e`). Each such command typically triggers a separate
permission prompt; the canonical commands collapse the entire flow into two
approvals: `neotoma *` (wildcard) and a one-time `npm install -g neotoma`.

**Step 2.1 — Permissions pre-flight**

Neotoma needs one wildcard allow entry so subsequent commands run without
per-command prompts.

For **allowlist-capable harnesses** (`claude-code`, `cursor`, `codex`): run
`neotoma preflight --tool <current_tool> --apply` to write the entry directly.
If the user prefers to apply it manually, run
`neotoma preflight --tool <current_tool>` (no `--apply`) to print a single
copy-paste block.

Harness file locations for manual reference:
- Claude Code: `.claude/settings.local.json` (project) or `~/.claude/settings.json` (user)
- Cursor: `.cursor/allowlist.json` (project)
- Codex: `~/.codex/config.toml` (user)

For **MCP-only harnesses** (`claude-desktop`, `openclaw`, `windsurf`, `continue`,
`vscode`): these harnesses have no writable command allowlist. Skip this step —
`neotoma setup` in Step 2.4 configures the MCP server entry, which is the only
permission surface these harnesses expose.

The `preflight` command is idempotent — re-running it after the entry is already
present reports `already_ok: true` and makes no changes. Note that Step 2.4
(`neotoma setup`) also writes the same allowlist entries, so this step is only
strictly necessary when the allowlist must be in place before
`npm install -g neotoma` runs (i.e. when `neotoma` is not yet on PATH).

If `neotoma` is not yet on PATH, skip this step; the install step (Step 2.2)
will place the binary, then return here.

**Step 2.2 — Install the binary (if needed)**

If the user is not already installed:

- OpenClaw: `openclaw plugins install clawhub:neotoma`
- All other harnesses: `npm install -g neotoma` (global install is required so
  the binary resolves on the agent's PATH without per-repo `npx` prompts; an
  opt-in local-install path is documented at the bottom of this file)

**Step 2.3 — Inspect state with a single call**

Run `neotoma doctor --json`. This returns a consolidated snapshot covering:

- install state (installed, version, `path_fix_hint` when PATH is wrong)
- data/init state (config_dir, data_dir, db_exists, initialized)
- API runtime state (running, env, port)
- detected MCP server configs per harness
- CLI instruction files per harness (project + user scope)
- permission-file status per harness
- `current_tool_hint` and `suggested_next_step`

Do NOT run shell introspection commands to recover any of this state. Every
field above is available from `doctor --json`.

**Step 2.4 — Apply the full setup in one call**

Run `neotoma setup --tool <current_tool> --yes`. This composes:

- `neotoma init --yes --idempotent` (safe to re-run; no-op when already initialized)
- MCP configuration for the current tool
- CLI instructions installation for the current tool
- permission-file patches (merge-preserving; adds `neotoma *` wildcard and
  `npm install -g neotoma` allow entries)

Use `--dry-run` first if the harness is strict; `--json` returns a structured
report of every step, including changed files.

For the full flag surface (`--install-scope` for MCP + CLI instruction files,
permission `--scope`, `--mcp-transport`, `--rewrite-neotoma-mcp`,
`--skip-hooks`, `--all-harnesses`, `--dry-run`, and `--skip-permissions`), see
[`docs/developer/cli_reference.md#harness-setup`](docs/developer/cli_reference.md#harness-setup).
The default MCP transport is **B**: local stdio for normal npm onboarding, with
transport **A** available when you want signed HTTP `/mcp` proxy entries and
the API is already running.

**Step 2.5 — Verify install (grep for canonical confirmation line)**

After `neotoma setup` completes, two plain-text lines appear on stdout:

1. `Neotoma installed at <path> (resolved via <manager>; v<version>; data_dir=<dir>; mcp=<transport>)` — grep for `Neotoma installed at` to confirm success.
2. `Transport: local stdio MCP (no network egress). ...` — answers the privacy/transport question.

If the first line is absent (for example, after a standalone `npm install -g neotoma` without running setup), run `neotoma setup --tool <current_tool> --yes` to produce it. If the binary is not on PATH, check `neotoma doctor --json` → `.neotoma.path_fix_hint` and surface that hint to the user before retrying.

**If the user is already installed**

Run `neotoma doctor --json` to verify, then `neotoma setup --tool <tool> --yes`
(idempotent) to bring any missing pieces into compliance. Do not improvise
shell introspection to confirm state.

**Forbidden during installation**

- Do NOT run `python3 -c`, `grep -r`, `ls`, `cat`, `jq`, `find`, `which`, `node -e`
  to introspect Neotoma state. Use `neotoma doctor --json`.
- Do NOT run arbitrary `npm run <script>` from the user's repositories during
  install-first onboarding. The only approved npm command is `npm install -g neotoma`.
- Do NOT `open` URLs, documentation, or application packages on the user's
  machine to verify state.

### Available skills

After install and setup, skills provide guided activation workflows. Each skill handles a specific data import pattern. Ask your agent to run any skill by name, or run `ensure-neotoma` to bootstrap everything.

| Skill | Description |
|-------|-------------|
| `ensure-neotoma` | Install Neotoma, configure MCP, verify connectivity. Prereq for all others. |
| `remember-email` | Import emails, extract contacts, tasks, events, transactions. |
| `remember-conversations` | Import ChatGPT/Claude/Slack exports, reconstruct timeline. |
| `remember-meetings` | Ingest transcripts, extract decisions and action items. |
| `remember-finances` | Import statements, receipts, invoices. |
| `remember-contacts` | Consolidate contacts from multiple sources. |
| `remember-calendar` | Import calendar events and commitments. |
| `remember-codebase` | Developer repo integration and MCP wiring. |
| `store-data` | Generic: persist any structured data. |
| `query-memory` | Generic: retrieve from memory. |

Skills ship with the npm package and are installed by `neotoma setup`. [Full catalog →](https://neotoma.io/skills)

### Phase 3: Activation

Activation is the first successful Neotoma-backed workflow: the user sees value from their own data and can continue with structure, provenance, and correction. If data evaluation was not completed during Phase 1, begin by determining what should be stored first.

#### Activation step 0: Context detection

Before preference selection, detect what kind of directory Neotoma is being installed into. Do not default to personal-file ingestion without checking.

**Detection:**
- List direct subdirectories of the install directory and check for `.git/` in each; also check whether the install directory itself is a git repository.
- Note lightweight personal-file signals at the same level: folders of notes, contracts, invoices, transcripts, or financial documents.

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
- **Personal** → continue to Activation step 1 below (preference selection → discovery → preview → ingest → aha).
- **Developer** → switch to the [Developer / repo-integration branch](#activation-branch-developer--repo-integration). That branch outputs a written integration plan, not an ingest.
- **Mixed** → start with the developer / repo-integration branch; after the plan is delivered, offer to continue with the personal-data branch as a separate step.

Store the user's context choice as a `user_preference` entity so later sessions can default correctly. Do not ingest files at this step.

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

**Harness transcript detection (always run as part of discovery):**

`neotoma discover` automatically checks well-known harness transcript paths alongside the regular file scan. You can also run it explicitly:

```bash
neotoma discover --harness-transcripts
```

This checks for existing AI harness chat history at the following locations:
- **Claude Code** — `~/.claude/projects/**/*.jsonl`
- **Codex** — `~/.codex/archived_sessions/*.jsonl`
- **Cursor** — `~/.cursor/chats/*/store.db` (per-workspace SQLite) and `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` (global SQLite)

Example output when harness transcripts are found:

```
Harness transcripts detected:
  claude-code: 424 files (2024-01 → 2026-05), ~/.claude/projects/
  cursor:      3 dbs (via store.db + state.vscdb), ~/.cursor/chats/
  codex:       11 files (2026-03 → 2026-05), ~/.codex/archived_sessions/

Use `neotoma ingest-transcript --harness <name>` to preview and import.
```

**Previewing and importing harness transcripts:**

Use `--preview` to inspect transcripts before storing:

```bash
neotoma ingest-transcript --harness claude-code --limit 5 --preview
neotoma ingest-transcript --harness codex --preview
neotoma ingest-transcript --harness cursor --limit 20 --preview
```

**Consent requirement:** Follow the same preview contract as all other activation ingests (step 4 below). Show the candidate list and confirm with the user before any bulk import. Pass `observation_source: import` when storing.

**Idempotency:** Conversations already imported (matched by `conversation_id`) are skipped automatically.

**Including harness transcripts in the step 3 proposal:** If harness transcripts are detected, include them as a separate cluster in the step 3 proposal alongside file discovery results.

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

#### Activation step 4: Preview contract

Before any ingest in the personal or mixed branch, the agent MUST produce a preview. This applies to every activation ingest, including single-file and single-transcript cases. Count-only summaries (e.g. "stored 12 entities") are forbidden as the first post-action output.

**The preview MUST contain:**

1. **Candidates** -- every file, transcript, or migration item proposed for storage, with its source path and a short content excerpt where useful. Include platform-memory and other context-source candidates here too, with provenance marking stored vs new.
2. **Why each was selected** -- the specific signals that triggered it (repeated entity names, dated revisions, recent modification, sender/recipient, transcript structure). One reason per candidate.
3. **Expected reconstruction** -- entity types, event counts, and the timeline or relationships the agent expects to emerge.
   ```
   Expected output: 1 client entity, 1 contract entity, 4 dated events, 3 linked sources
   ```
4. **Explicit confirmation prompt** with scoped options:
   - Ingest entire folder
   - Ingest selected files only
   - Skip this cluster
   - Inspect more (show additional file details)

After asking, pause and wait for user response. Do not store any data before receiving explicit confirmation.

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

#### Activation step 6.5: Offer lifecycle hooks (opt-in)

After the first-Aha timeline -- and only then -- propose installing Neotoma's lifecycle hooks for the current harness. Hooks layer on top of the MCP integration the user just saw working: they capture session/prompt/tool-use events even when the agent does not explicitly call MCP, and they hydrate context with retrieved memories at prompt time. They are **offered**, never installed by default, because they change runtime behavior and require a second round of user consent.

**Read `doctor.hooks` first.** Do not improvise detection or ask the user to look for config files.

- If `doctor.hooks.eligible_for_offer === false`, skip this step entirely. Do not mention hooks. Eligibility is false when the current tool is not hook-capable (e.g. `claude-desktop`, `openclaw`), when Neotoma hooks are already installed for this tool, or when MCP is not yet configured.
- If `doctor.hooks.installed[<tool>].other_hook_plugins` is non-empty, surface that list to the user and require explicit acknowledgment before proceeding. The offer must name the other plugin(s) and state that installing Neotoma hooks will add entries alongside them rather than replace them.

**Proposal template:**

```
The timeline you just saw came from MCP calls the agent made while working with
your data. Neotoma can also capture these events via lifecycle hooks in
<tool>, so memories are persisted even on turns where MCP is not called and
retrieved memories are injected into your prompts automatically.

Install Neotoma hooks for <tool> now?
(y)es -- run `neotoma hooks install --tool <tool> --yes`
(n)o  -- I will decide later
(l)ater -- remind me next session
```

**Handling the response:**

| Answer | Action |
| --- | --- |
| `yes` | Run `neotoma hooks install --tool <tool> --yes`. Treat a non-zero exit code as a failure and surface the installer's message verbatim. |
| `no`   | Store a `user_preference` entity with `{ hooks: "declined", tool: "<tool>" }`. Do not offer again in future activation flows unless the user asks. |
| `later` | Store a reminder-style entity (e.g. `task` with a `remind_at` of the next session) so the next activation surfaces the proposal once more. |

**Harness coverage at time of activation.** The CLI can only delegate to an installer script for harnesses whose hook package ships with a Node-resolvable `scripts/install.mjs`: `cursor` and `codex` today. For `claude-code`, `opencode`, and `claude-agent-sdk`, `neotoma hooks install --tool <tool>` prints a copy-paste snippet the user (or agent) applies manually. If the current tool falls in the snippet-only group, surface the snippet inline and ask the user to confirm they have applied it before moving on.

See [`docs/integrations/hooks/README.md`](docs/integrations/hooks/README.md) for the per-harness guides and [`.cursor/plans/activation-hooks-opt-in_98c72335.plan.md`](.cursor/plans/activation-hooks-opt-in_98c72335.plan.md) for the rationale behind keeping hooks out of `neotoma setup`.

**Forbidden during activation**

- Do NOT run `neotoma hooks install` without an explicit "yes" from the user in the same session. Silent installs, "I'll set this up while you review the timeline" phrasing, or bundling hook installs into the Installation-aha step are all forbidden.
- Do NOT proceed with `neotoma hooks install --tool <tool>` when `doctor.hooks.installed[<tool>].other_hook_plugins` is non-empty unless the user has explicitly acknowledged those plugins by name. `--force` is reserved for that acknowledgment path.
- Do NOT skip `neotoma doctor --json` before offering hooks. Eligibility, installed-state, and other-plugin detection all come from that single snapshot; improvised detection is forbidden.
- Do NOT offer hooks when `doctor.hooks.eligible_for_offer === false`. That value already encodes "supported harness, not installed yet, MCP configured" -- do not second-guess it.

#### Activation step 6.6: Offer markdown mirror (opt-in)

After the hooks offer -- whether the user accepted, declined, or deferred -- propose enabling the canonical markdown mirror. The mirror is a deterministic filesystem view of the same entities, relationships, sources, timeline events, and schemas the user just saw reconstructed: one `.md` per record, regenerated on write, so standard UNIX tools (`cat`, `grep`, `less`, `tree`) work against the knowledge graph without going through the API. It is **offered**, never enabled by default, because it writes files into the data directory and may add noise to an enclosing git repository.

**Read `doctor.mirror` first.** Do not improvise detection or ask the user to look for config files.

- If `doctor.mirror.eligible_for_offer === false`, skip this step entirely. Do not mention the mirror. Eligibility is false when the mirror is already enabled, or when the user previously declined the offer.
- `doctor.mirror.inside_git_repo` and `doctor.mirror.gitignored` drive the gitignore sub-prompt (below).

**Proposal template:**

```
The timeline you just saw lives in SQLite. Neotoma can also mirror it to
markdown files on disk -- one .md per entity/relationship/source/timeline
day/schema -- regenerated on write so you can `cat`, `grep`, and `less`
the knowledge graph with standard tools. SQLite stays the only source of
truth; mirror files are read-only and safe to delete.

Enable the markdown mirror at <resolved_path>?
(y)es -- run `neotoma mirror enable --yes`
(n)o  -- I will decide later
(l)ater -- remind me next session
```

**Handling the response:**

| Answer | Action |
| --- | --- |
| `yes` | Run `neotoma mirror enable --yes` (and optionally `--gitignore`, see sub-prompt). Treat a non-zero exit code as a failure and surface the CLI's message verbatim. |
| `no`   | Store a `user_preference` entity with `{ mirror: "declined" }`. Do not offer again in future activation flows unless the user asks. |
| `later` | Store a reminder-style entity (e.g. `task` with a `remind_at` of the next session) so the next activation surfaces the proposal once more. |

**Gitignore sub-prompt.** When `doctor.mirror.inside_git_repo === true` AND `doctor.mirror.gitignored === false` AND the user answered `yes` to the mirror offer, follow up with:

```
The mirror path at <resolved_path> sits inside the git repo at
<git_repo_root>. Add it to <git_repo_root>/.gitignore so the generated
markdown does not show up in `git status`?
(y)es -- run `neotoma mirror gitignore --yes`
(n)o  -- leave .gitignore alone
```

If the user answers yes, run `neotoma mirror enable --yes --gitignore` (or `neotoma mirror gitignore --yes` if mirror was enabled on a previous turn). The helper is idempotent: repeated runs are no-ops. Skip the sub-prompt entirely when `inside_git_repo` is false.

See [`docs/subsystems/markdown_mirror.md`](docs/subsystems/markdown_mirror.md) for the mirror layout, determinism guarantees, and optional git-backed history.

**Forbidden during activation**

- Do NOT run `neotoma mirror enable` without an explicit "yes" from the user in the same session. Silent enables or bundling the mirror into the Installation-aha step are both forbidden.
- Do NOT run `neotoma mirror gitignore` without the explicit sub-prompt "yes". The helper only writes to the enclosing git repo of the resolved mirror path; it never prompts for a path, and the agent MUST not pass one.
- Do NOT skip `neotoma doctor --json` before offering the mirror. Eligibility, `inside_git_repo`, and `gitignored` all come from that single snapshot.
- Do NOT offer the mirror when `doctor.mirror.eligible_for_offer === false`.

#### Activation step 7: Correction

Demonstrate correction immediately after the aha timeline:
- "Is this timeline accurate? Should any events be adjusted or sources excluded?"
- Support: wrong entity merge, wrong date, wrong source linkage, file exclusion
- The correction prompt must reference the specific reconstruction just shown

#### Activation branch: developer / repo integration

Entered from Activation step 0 when the user identifies the install directory as developer-oriented (or mixed). The output of this branch is a **written integration plan document**, not an ingest. Do not store entities, do not watch folders, do not call `store --file-path` during this branch.

##### Step B1: Repo inventory

For each detected git repository, gather lightweight signals from cheap reads (no deep content scans):

- Recent commit activity -- last commit timestamp (e.g. `git log -1 --format=%ci`)
- README presence and primary language (by file extension heuristics)
- AI-agent configuration present: `.cursor/rules/`, `.claude/`, `AGENTS.md`, `.codex/`
- Docs footprint: `docs/`, `specs/`, `ADR/`, design-doc folder
- Approximate activity scale: commit count in last 90 days; multi-author if available

Present the inventory as a compact list.

##### Step B2: Rank and recommend

Score repos for "likely benefit from Neotoma as a memory substrate." Higher score when:

- Long decision history (many commits, many PRs/issues, long-lived branches)
- Existing AI-agent configuration indicates recurring agent sessions that lose context across runs
- Rich documentation (specs, ADRs, design docs) with cross-references
- Multi-author activity (coordination cost)
- Signals of recurring context loss: repeated "why did we do X" style issues, stale TODOs, investigation threads across files

Present the top 3-5 repos. For each, include a one-paragraph rationale grounded in the signals above.

##### Step B3: Explain the integration

For the recommended repos collectively, explain:

- **What Neotoma would persist per repo**: decisions and their rationale, open threads, entity relationships between PRs/issues/people, cross-session agent context.
- **What pain it solves**: agent context loss across sessions, rediscovery of past decisions, drift between docs and code, orphaned investigation threads.
- **What is out of scope**: code indexing for search, runtime memory, autonomous agent execution. Neotoma is the State Layer only (see [`docs/foundation/layered_architecture.md`](docs/foundation/layered_architecture.md)).

##### Step B4: Offer plan drafting

Ask:
```
Which repo should I draft a full Neotoma integration plan for?
```

After the user picks one, produce a written integration plan covering:

- **Scope**: which docs, configs, and history segments to treat as ingestible source (for example `docs/`, `specs/`, `ADR/`, selected commit ranges, open issues/PRs).
- **Per-repo agent instructions**: proposed edits to `.cursor/rules/`, `AGENTS.md`, and `.claude/rules/` that point contributors at Neotoma for memory operations. Reference the existing `neotoma_cli.mdc` pattern.
- **MCP wiring**: guidance for contributors to configure the Neotoma MCP server locally (or CLI as fallback).
- **Expected aha**: a timeline or decision graph reconstructible from the proposed scope once ingested.
- **Next steps**: an explicit checklist for the user to execute when ready. This branch does not execute those steps.

End the activation flow after delivering the plan. Do not ingest as a "natural next step"; any ingest requires a fresh, explicit request from the user that re-enters the personal or mixed branch.

### Phase 4: Tooling config

After activation, confirm the current tool is configured for robust ongoing
usage. If `neotoma setup` was run in Phase 2, most of this is already in place.

1. Run `neotoma doctor --json` once more. If `suggested_next_step` is `ready`,
   stop. If it is `configure-mcp`, `configure-cli-instructions`, or
   `configure-permissions`, re-run `neotoma setup --tool <tool> --yes` to
   close the gap. Do NOT grep, `ls`, or `cat` config files to verify state.
2. When reading the content of a specific config or instruction file is
   needed, use `neotoma mcp guide --json` and `neotoma cli guide --json`
   to print authoritative content. Do NOT search for "where the content is
   defined" across the codebase.
3. If the user started in a local environment, offer to help configure
   additional remote or hosted access points after activation.
4. If the user started in a constrained hosted tool, recommend a
   better-supported primary environment if that will materially improve Neotoma usage.

**Examples:**
- **ChatGPT**: prefer a Custom GPT or remote MCP path when supported.
- **Claude Desktop**: create or use a Project, connect Neotoma, and add routing instructions.
- **Cursor / Claude Code / Codex**: `neotoma setup --tool <tool> --yes` already
  writes MCP + CLI instructions + permissions; re-run with `--scope both` when
  the user wants user-level coverage in addition to the project scope.
- **OpenClaw**: prefer the native plugin install and configuration path first;
  fall back to manual MCP wiring only when necessary. `neotoma setup --tool openclaw`
  intentionally skips permission-file writes because the plugin manages consent.

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

**Activation-time integration friction (user-gated, never agent-initiated):**

Some integrations require user action the agent cannot complete. Treat each of
these as a single, user-gated step. Do not retry, do not improvise a
work-around, do not chain multiple of them together in one turn.

- **OAuth reconnect** (Gmail, Google Calendar, Slack, GitHub, etc.): if an MCP
  tool call returns an auth or token-expired error, stop, tell the user the
  exact provider and tool, and ask them to reconnect in their MCP client. Do
  not re-invoke the tool on your own after the error.
- **Project / repo discovery**: when the developer / repo-integration branch
  needs to pick a repo, ask once with the candidate list and wait. Do not
  scan filesystems outside the directories the user confirmed.
- **Credential entry**: never ask the agent or user to paste credentials into
  chat or into a `neotoma` command. Direct them to their MCP client's
  credential UI or to 1Password / environment variables.
- **Billing / quota prompts** (OpenAI, Anthropic, Google, etc.): surface the
  exact provider error, link the user to the provider dashboard, and stop.

Each of these is a single user-gated step. The agent's role is to surface the
blocker with provenance, not to drive around it.

### Cross-platform migration

When Neotoma is already configured in one tool and the user is adding another:

- Neotoma's state is already available via MCP or CLI. No migration needed — the new tool reads the same state layer.
- This is Neotoma's core cross-platform value: memory stored via Claude is immediately available in Cursor, Codex, or any other MCP client.

## Permissions

Directory-scoped agent harnesses (Claude Code, Cursor, Codex) prompt for
approval on every command. The onboarding flow is designed to succeed with
only two approvals:

1. `Bash(neotoma:*)` / `neotoma *` wildcard
2. A one-time `npm install -g neotoma`

Run `neotoma preflight --tool <harness> --apply` at the start of the install
flow to write the allowlist entry directly, or `neotoma preflight --tool <harness>`
(no `--apply`) to print a copy-paste block for manual application. Either path
ensures the agent never needs individual approvals for `neotoma init`,
`neotoma doctor`, `neotoma setup`, `neotoma mcp …`, or any other `neotoma`
subcommand.

If a permission prompt appears for anything other than those two items, stop
and ask the user to widen the allowlist rather than improvising an alternative
command. Do NOT fall back to shell introspection (`python3 -c`, `grep -r`,
`ls`, `cat`, `jq`, `find`, `which`, `node -e`, arbitrary `npm run <script>`,
`open`).

## Guardrails

- Do not run full-disk scans or deep directory crawls by default. Discovery is always shallow-first, user-scoped.
- Do not ingest files silently. Every file requires preview and explicit consent.
- Do not output file counts as the primary result. Output domains, entities, and timelines.
- Do not save any previewed data before explicit user confirmation.
- After presenting the preview, do not proceed with additional actions until the user explicitly confirms what to save.
- Keep confirmation-first behavior scoped to first-run onboarding only.
- Migration from platform memory is best-effort. Platform memory is opaque and may be incomplete -- make this clear in the preview.
- Provenance must be shown for every stored entity. Every fact traces back to its source.
- Do not skip Activation step 0 (context detection). Always check whether the install directory is developer-oriented before defaulting to personal-file ingestion.
- The developer / repo-integration branch must not ingest files or store entities. Its output is a written integration plan only. Any ingest requires a separate, explicit user request that re-enters the personal or mixed branch.
- The preview contract (Activation step 4) is mandatory even for single-file or single-transcript ingests. Count-only summaries are forbidden as the first post-action output.
- Do not improvise shell introspection in place of `neotoma doctor --json`,
  `neotoma mcp guide --json`, or `neotoma cli guide --json`.
  Every fact these commands surface is authoritative; searching for "where X is
  defined" in the codebase is a permission-prompt anti-pattern.
- Do not run arbitrary `npm run <script>` in the user's repositories during
  install-first onboarding. The only approved npm command is
  `npm install -g neotoma`.

## Opt-in local install

The default for agent-led installation is `npm install -g neotoma` because a
global install guarantees the binary resolves on PATH for any agent harness
without triggering path-variance prompts (`npx`, `./node_modules/.bin`, per-repo
installs). Only offer the local install path when the user explicitly asks:

```
npm install neotoma       # local to the current directory
npx neotoma doctor        # then prefix all commands with npx
```

Local installs often require additional allowlist entries (`npx:*`) and
repeated re-approval in each project, which defeats the purpose of this
guide. Document the trade-off clearly if the user insists.

## Production deployment (headless / systemd)

For always-on API servers (remote hosts, shared team deployments, kiosks),
`neotoma api start` should run under a supervisor rather than a user shell.
This section documents the reference `systemd` unit and the production-mode
selection rules the CLI follows.

### Why `--env prod` matters

`neotoma api start --env prod` selects:

- The production data directory (`~/.config/neotoma/prod` by default, or
  `NEOTOMA_DATA_DIR` when set).
- The production port band and key file (kept distinct from `dev` so a
  development server and production server can coexist on the same host).
- Release-compiled artifacts from `dist/` (via `node dist/actions.js`) when
  running from an **installed** package. On a source checkout (git clone),
  the CLI uses the `dev:server:prod` watcher path so contributors can iterate
  against the production data dir without changing the product CLI command.

### Reference `systemd` unit

Install the npm package globally on the server (`npm install -g neotoma`),
provision a service user, then drop this unit at
`/etc/systemd/system/neotoma-api.service`:

```ini
[Unit]
Description=Neotoma API server (prod)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=neotoma
Group=neotoma
Environment=NEOTOMA_DATA_DIR=/var/lib/neotoma/prod
Environment=NEOTOMA_HTTP_PORT=3080
ExecStart=/usr/bin/env neotoma api start --env prod --port 3080 --host 127.0.0.1
Restart=on-failure
RestartSec=5s
# Lock the service down; widen only if your integration needs it.
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ReadWritePaths=/var/lib/neotoma/prod
ProtectHome=yes

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now neotoma-api
sudo journalctl -u neotoma-api -f
```

### Health check and smoke test

Once the unit is active, verify the server is reachable:

```bash
curl -sS http://127.0.0.1:3080/health | jq .
neotoma --base-url http://127.0.0.1:3080 doctor
```

For remote callers, front the service with a reverse proxy (nginx, Caddy,
cloud load balancer) that terminates TLS and forwards to the loopback
listener. Remote CLIs must pass `--base-url https://your.host` and will
automatically upload source artifacts via `file_content` instead of
`file_path` (see `docs/developer/cli_reference.md` §Ingest).

### Production runbook cross-links

- Deployment runbook: [`docs/operations/runbook.md`](docs/operations/runbook.md)
- CLI reference (including ingest auto-upload and size cap): [`docs/developer/cli_reference.md`](docs/developer/cli_reference.md)
- Environment conventions and env-var naming: [`docs/developer/environment/ENV_VAR_NAMING_STRATEGY.md`](docs/developer/environment/ENV_VAR_NAMING_STRATEGY.md)

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
