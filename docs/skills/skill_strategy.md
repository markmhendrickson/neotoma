# Skill strategy

Canonical reference for how Neotoma treats agent skills — naming, publishing, installation, site documentation, and governance.

## Goals

1. **Activation**: reduce time-to-value for new users by packaging complex workflows (install, configure MCP, import data, verify) into guided skill sequences with error handling.
2. **Distribution**: every published skill auto-indexes on [SkillHub](https://skills.palebluedot.live/) and similar catalogs, creating use-case-driven discovery that reaches users before they know what Neotoma is.
3. **Parity with CLI/MCP onboarding**: skills encode the same workflows described in `install.md` and agent instructions, but in a form agents can execute directly rather than interpreting prose.

## Two skill trees

| Tree | Location | Published in npm tarball | Audience | Examples |
|------|----------|--------------------------|----------|----------|
| **User-facing** | `skills/` (repo root) | Yes (`"files": ["skills"]` in `package.json`) | End users, SkillHub visitors | `remember-email`, `store-data`, `ensure-neotoma` |
| **Developer/maintainer** | `.cursor/skills/`, `.claude/skills/` | No | Repo contributors, release managers | `release`, `commit`, `debug`, `process-feedback` |

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

| Skill | Description | External tools |
|-------|-------------|----------------|
| `ensure-neotoma` | Install Neotoma, configure MCP, verify connectivity. Prereq for all Tier A skills. | Node.js / npm |
| `remember-email` | Configure email MCP, discover/preview emails, extract contacts, tasks, events, transactions | Gmail MCP, IMAP MCP |
| `remember-conversations` | Import ChatGPT JSON exports, Claude history, Slack archives, or scrape share URLs | ChatGPT JSON export, web-scraper MCP, file system |
| `store-data` | Generic "remember this" for any structured data | Neotoma MCP |
| `query-memory` | Generic "what do you know about X" retrieval | Neotoma MCP |

### Tier 2 — Use-case-specific

| Skill | Description | External tools |
|-------|-------------|----------------|
| `remember-meetings` | Ingest meeting transcripts (VTT/SRT/TXT), extract decisions, commitments, action items | Transcript files, Google Calendar MCP |
| `remember-finances` | Import bank statements (CSV/PDF), receipts (images), invoices | Plaid MCP, file system, vision |
| `remember-contacts` | Consolidate contacts from email, calendar, chat, vCards, LinkedIn exports | Gmail MCP, Google Contacts API, file system |
| `remember-calendar` | Configure calendar MCP, import events, extract scheduling commitments | Google Calendar MCP, ICS files |

### Tier 3 — Developer activation

| Skill | Description | External tools |
|-------|-------------|----------------|
| `remember-codebase` | Developer repo integration: inventory, ranking, integration plan, MCP wiring | Git, file system |
| `recover-sqlite-database` | Check SQLite integrity and run `.recover` when the DB is corrupt | sqlite3 CLI |

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

| Harness | Skill directory | Scope default |
|---------|----------------|---------------|
| Cursor | `.cursor/skills/` or `~/.cursor/skills/` | user |
| Claude Code | `.claude/skills/` | user |
| Codex | `.codex/skills/` | user |
| Windsurf | `.windsurf/skills/` | user |

## Use-case mapping

Vertical use cases documented in `docs/use_cases/` and on the site's `/use-cases` page map to activation skills:

| Use case | Primary skills |
|----------|---------------|
| Personal data | `remember-email`, `remember-finances`, `remember-contacts`, `remember-calendar` |
| Financial ops | `remember-finances` |
| CRM | `remember-email`, `remember-contacts` |
| Compliance | `remember-email`, `store-data` |
| Contracts | `store-data`, `query-memory` |

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

| Artifact | Location | Purpose |
|----------|----------|---------|
| This document | `docs/skills/skill_strategy.md` | Canonical strategy and governance |
| Skill catalog (site) | `frontend/src/site/skills_catalog.ts` | Data-driven hub and detail pages at `/skills` |
| Skill SKILL.md files | `skills/*/SKILL.md` | Agent-executable workflow (SkillHub indexes these) |
| Use-case docs | `docs/use_cases/*.md` | Markdown reference for site use-case cards and skill mapping |
| README | `README.md` | "Available skills" section for GitHub discovery |

## Governance

- **Ownership**: skill strategy changes go through the same review as agent instruction changes.
- **Breaking renames**: renaming a published skill folder breaks existing symlinks and SkillHub URLs. Announce in the release supplement's "Breaking changes" section and provide a migration note.
- **Sync with site**: marketing copy on `/skills` must stay aligned with this doc. When the site catalog diverges, update this doc first or in the same change.
- **Version**: skills ship with the main `neotoma` npm package. No separate versioning unless the skill set outgrows this (see open questions in the plan).
