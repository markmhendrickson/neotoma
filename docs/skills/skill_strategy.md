# Skill strategy

Canonical reference for how Neotoma treats agent skills — naming, publishing, installation, site documentation, and governance.

## Goals

1. **Activation**: reduce time-to-value for new users by packaging complex workflows (install, configure MCP, import data, verify) into guided skill sequences with error handling.
2. **Distribution**: every published skill auto-indexes on [SkillHub](https://skills.palebluedot.live/) and similar catalogs, creating use-case-driven discovery that reaches users before they know what Neotoma is.
3. **Parity with CLI/MCP onboarding**: skills encode the same workflows described in `install.md` and agent instructions, but in a form agents can execute directly rather than interpreting prose.

## Two skill trees

| Tree                     | Location                             | Published in npm tarball                      | Audience                            | Examples                                         |
| ------------------------ | ------------------------------------ | --------------------------------------------- | ----------------------------------- | ------------------------------------------------ |
| **User-facing**          | `skills/` (repo root)                | Yes (`"files": ["skills"]` in `package.json`) | End users, SkillHub visitors        | `remember-email`, `store-data`, `ensure-neotoma` |
| **Developer/maintainer** | `.cursor/skills/`, `.claude/skills/` | No                                            | Repo contributors, release managers | `release`, `commit`, `debug`, `process-issues`   |

Developer skills are synced from the foundation submodule via `scripts/setup_cursor_from_foundation.sh` and are never included in the npm tarball. User-facing skills ship with the package and are installed into harnesses by `neotoma setup --skills`.

## Naming policy

### Tier A — Generic memory language (data-import and recall skills)

Use language that resonates with first-time users who do not yet know Neotoma:

- `remember-email` not `import-gmail-to-neotoma`
- `remember-conversations` not `import-chat-history`
- `remember-meetings` not `ingest-meeting-transcripts`
- `remember-finances` not `import-financial-docs`
- `store-data` and `query-memory` already follow this pattern

Triggers include both generic terms ("remember my emails") and Neotoma-specific terms ("import email to neotoma") for dual discoverability.

### Tier B — Neotoma-branded (bootstrap, ops, product-specific)

Skills that install or operate Neotoma use explicit product naming:

- `ensure-neotoma` — meta skill for install, MCP config, and verification
- `recover-sqlite-database` — troubleshooting for Neotoma's local database

## Skill catalog

### Tier 1 — Core activation

| Skill                    | Description                                                                                 | External tools                                    |
| ------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `ensure-neotoma`         | Install Neotoma, configure MCP, verify connectivity. Prereq for all Tier A skills.          | Node.js / npm                                     |
| `remember-email`         | Configure email MCP, discover/preview emails, extract contacts, tasks, events, transactions | Gmail MCP, IMAP MCP                               |
| `remember-conversations` | Import ChatGPT JSON exports, Claude history, Slack archives, or scrape share URLs           | ChatGPT JSON export, web-scraper MCP, file system |
| `store-data`             | Generic "remember this" for any structured data                                             | Neotoma MCP                                       |
| `query-memory`           | Generic "what do you know about X" retrieval                                                | Neotoma MCP                                       |

### Tier 2 — Use-case-specific

| Skill               | Description                                                                            | External tools                              |
| ------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------- |
| `remember-meetings` | Ingest meeting transcripts (VTT/SRT/TXT), extract decisions, commitments, action items | Transcript files, Google Calendar MCP       |
| `remember-finances` | Import bank statements (CSV/PDF), receipts (images), invoices                          | Plaid MCP, file system, vision              |
| `remember-contacts` | Consolidate contacts from email, calendar, chat, vCards, LinkedIn exports              | Gmail MCP, Google Contacts API, file system |
| `remember-calendar` | Configure calendar MCP, import events, extract scheduling commitments                  | Google Calendar MCP, ICS files              |

### Tier 3 — Developer activation

| Skill                     | Description                                                                  | External tools   |
| ------------------------- | ---------------------------------------------------------------------------- | ---------------- |
| `remember-codebase`       | Developer repo integration: inventory, ranking, integration plan, MCP wiring | Git, file system |
| `recover-sqlite-database` | Check SQLite integrity and run `.recover` when the DB is corrupt             | sqlite3 CLI      |

## Prerequisites

Every Tier A skill documents a Phase 0 that references `ensure-neotoma`:

> **Phase 0: Prerequisites** — Run the `ensure-neotoma` skill first if Neotoma is not yet installed or configured in your current harness.

This delegates all bootstrap logic to one place rather than duplicating install/MCP-config steps in each skill.

## Install and sync

### `neotoma setup --skills`

The `neotoma setup` command includes a `skills` step that installs published skills into the user's harness:

- **Source**: `skills/` directory from the installed npm package
- **Target**: harness skill directory (`.cursor/skills/`, `~/.cursor/skills/`, `.claude/skills/`, etc.), determined by `--tool` flag or `doctor.current_tool_hint`
- **Method**: symlink (copy fallback on Windows or restricted filesystems)
- **Idempotent**: skips if symlink already points to correct source; updates on version change
- **Step ID**: `"skills"` in `SetupReport.steps[]`
- **Flags**: `--skip-skills` to opt out; `--skills-scope project|user` for project-level vs user-level installation

### Harness matrix

| Harness     | Skill directory                          | Scope default |
| ----------- | ---------------------------------------- | ------------- |
| Cursor      | `.cursor/skills/` or `~/.cursor/skills/` | user          |
| Claude Code | `.claude/skills/`                        | user          |
| Codex       | `.codex/skills/`                         | user          |
| Windsurf    | `.windsurf/skills/`                      | user          |

## Instance skills and script attachments (#1950, #1951)

A **third**, opt-in source complements the two skill trees above: `enabled` `skill`
**rows** stored on the connected Neotoma instance (`src/services/skills/seed_schema.ts`).
These exist for collaborators who share a graph but not a codebase — the workflow that
consumes a shared entity (e.g. an ICP driving lead scoring) should be runnable by every
collaborator on that instance, not gated behind one contributor's harness config.

### Instance skills vs. package skills

|                              | Package skills (`skills/`)                            | Instance skills (`skill` rows)                  |
| ---------------------------- | ----------------------------------------------------- | ----------------------------------------------- |
| Audience                     | every adopter of the npm package                      | one instance's collaborators                    |
| Boundary test                | "would every adopter want this regardless of domain?" | encodes one instance's specifics                |
| Source of truth              | files shipped in the npm tarball                      | rows on the connected instance                  |
| Distribution                 | npm install + `neotoma setup --skills`                | `neotoma skills sync --include-instance-skills` |
| Precedence on name collision | **always wins**                                       | skipped + warned                                |

If an instance skill proves broadly useful, upstream it into `skills/` (see "Adding a new
skill" above) rather than letting every instance reinvent it locally.

### Opt-in flags on `neotoma skills sync`

- `--include-instance-skills` — fetch every `enabled` `skill` entity from the connected
  instance and materialize each as `<slug>/SKILL.md` under
  `~/.neotoma/instance-skills/<instance-host>/`, rendering frontmatter (name, description,
  triggers, `user_invocable`) from the row's fields plus a do-not-edit provenance header
  naming the source `entity_id` and instance. Materialized directories are then linked into
  every installed harness's skill directory using the same per-skill-symlink mechanism
  package skills use. Idempotent: re-running updates changed rows and prunes materialized
  directories whose row is gone or disabled — but only directories still carrying the
  provenance header, so a user-authored directory that happens to share a slug is never
  touched.
- `--include-instance-scripts` (implies `--include-instance-skills`) — additionally fetch
  script attachments: `file_asset` entities a skill row `EMBEDS` (source stored
  content-addressed via `raw_storage.ts`), verify each download's SHA-256 against the
  recorded `content_hash`, and write it to `<skill>/scripts/<original_filename>` — subject to
  the hash-pin consent gate below.
- `--approve` — record any new or changed instance-script hash as approved before writing it.

### Package wins on collision

An instance skill whose slug matches a package skill name is **never** written; it is
skipped and a warning is printed (`neotoma skills sync` output and JSON report). This keeps
the npm package's curated skill set authoritative regardless of what an instance stores.

### Hash-pin consent model (execution-consent contract)

Materializing a skill row's `content` means an agent _reads_ graph content — a page-scoped
concern already covered by the provenance header. Materializing a **script** attachment
means an agent may later _execute_ it, which is a different, higher-stakes trust boundary.
Neotoma resolves this the same way for every instance: the writer (whoever authored the
skill row) _proposes_; the local operator's explicit approval is the only thing that grants
materialization.

- `~/.neotoma/instance-skills/approvals.json` maps `<instance>/<skill>/<filename>` to an
  approved SHA-256 hash.
- A script whose hash is **not** in the manifest is not written unless the run passes
  `--approve` (which records the hash as approved).
- A script whose hash has **changed** since it was approved is not written; the run prints a
  warning naming the approved and new hashes and instructs the operator to re-run with
  `--approve` after reviewing the diff.
- A content-hash mismatch against the recorded `content_hash` (a data-integrity failure, not
  a consent decision) is refused unconditionally, `--approve` or not.

### Zero-dependency, single-file ceiling

Instance scripts are restricted to dependency-free, single-file artifacts — no lockfile
resolution, no `runtime_requirements` beyond an informational assertion (e.g. "python3
stdlib"). This keeps the review surface small enough to inspect at approval time. Anything
past that ceiling (multi-file projects, pinned dependencies, a CI/review workflow) belongs in
a git repository; instance scripts are for the "our export format is quirky" glue that every
collaborator on an instance needs but that is too specific to upstream into the package.

### The boundary test

Before adding a new skill or script, ask: **would every adopter want this regardless of
domain?** If yes, it belongs in the npm package's `skills/` tree. If it only makes sense
given this instance's data, vendors, or conventions, it belongs as an instance row.

## Use-case mapping

Vertical use cases documented in `docs/use_cases/` and on the site's `/use-cases` page map to activation skills:

| Use case      | Primary skills                                                                  |
| ------------- | ------------------------------------------------------------------------------- |
| Personal data | `remember-email`, `remember-finances`, `remember-contacts`, `remember-calendar` |
| Financial ops | `remember-finances`                                                             |
| CRM           | `remember-email`, `remember-contacts`                                           |
| Compliance    | `remember-email`, `store-data`                                                  |
| Contracts     | `store-data`, `query-memory`                                                    |

### Adding a new skill (checklist)

1. Create `skills/<skill-name>/SKILL.md` with frontmatter (name, description, triggers)
2. Include Phase 0 referencing `ensure-neotoma` if the skill needs Neotoma
3. Add the skill to the catalog table above
4. Add an entry to `frontend/src/site/skills_catalog.ts`
5. Verify `neotoma setup --skills` picks it up (the symlink covers the entire `skills/` directory)
6. Update this doc if the skill introduces a new external tool dependency

## External tooling

Skills may depend on optional external MCPs or CLIs (Gmail MCP, Google Calendar MCP, Plaid MCP, etc.). Skills must:

- Document the dependency as a prerequisite, not assume it is already configured
- Guide the user through OAuth or API-key setup when the MCP requires it
- Never pin unvetted third-party packages; reference by name and let the user's harness config provide the server
- Follow the depth-of-capture and provenance rules from agent instructions (`docs/developer/mcp/instructions.md`)

## Site and repo documentation

| Artifact             | Location                              | Purpose                                                      |
| -------------------- | ------------------------------------- | ------------------------------------------------------------ |
| This document        | `docs/skills/skill_strategy.md`       | Canonical strategy and governance                            |
| Skill catalog (site) | `frontend/src/site/skills_catalog.ts` | Data-driven hub and detail pages at `/skills`                |
| Skill SKILL.md files | `skills/*/SKILL.md`                   | Agent-executable workflow (SkillHub indexes these)           |
| Use-case docs        | `docs/use_cases/*.md`                 | Markdown reference for site use-case cards and skill mapping |
| README               | `README.md`                           | "Available skills" section for GitHub discovery              |

## Governance

- **Ownership**: skill strategy changes go through the same review as agent instruction changes.
- **Breaking renames**: renaming a published skill folder breaks existing symlinks and SkillHub URLs. Announce in the release supplement's "Breaking changes" section and provide a migration note.
- **Sync with site**: marketing copy on `/skills` must stay aligned with this doc. When the site catalog diverges, update this doc first or in the same change.
- **Version**: skills ship with the main `neotoma` npm package. No separate versioning unless the skill set outgrows this (see open questions in the plan).
