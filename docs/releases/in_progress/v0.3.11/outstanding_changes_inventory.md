---
title: "Release v0.3.11 — Outstanding Changes Inventory"
summary: "- Snapshot command: `git status --porcelain=v1 --untracked-files=all` - Total outstanding paths: **556** - By status: - ` M`: **464** - `??`: **91** - ` D`: **1**"
---

# Release v0.3.11 — Outstanding Changes Inventory

## Inventory Snapshot

- Snapshot command: `git status --porcelain=v1 --untracked-files=all`
- Total outstanding paths: **556**
- By status:
  - ` M`: **464**
  - `??`: **91**
  - ` D`: **1**

## Top-Level Breakdown

- `site_pages`: 509
- `docs`: 10
- `tests`: 10
- `src`: 9
- `frontend`: 8
- `.cursor`: 3
- `.github`: 2
- `playwright`: 2
- `scripts`: 2
- `foundation`: 1

## Coverage Mapping (All Paths Accounted)

- **RS-001 Retrieval reliability and parity**
  - `src/shared/action_handlers/*`
  - `src/server.ts`
  - `src/actions.ts`
  - `src/services/entity_semantic_search.ts`
  - `src/services/local_entity_embedding.ts`
  - `tests/integration/*reliability*.test.ts`
  - `tests/integration/entity_identifier_handler.test.ts`
  - `tests/integration/lexical_search.test.ts`
  - `src/services/__tests__/*embedding*.test.ts`
- **RS-002 CLI compatibility and turn-store contract**
  - `src/cli/index.ts`
  - `tests/cli/cli_entity_subcommands.test.ts`
  - `tests/cli/cli_store_commands.test.ts`
  - `docs/developer/cli_reference.md`
  - `docs/developer/mcp/instructions.md`
  - `docs/developer/cli_agent_instructions.md`
- **RS-003 Docs/site/localization**
  - `site_pages/**` (including all locale and root generated pages)
  - `frontend/src/components/*`
  - `frontend/src/components/subpages/*`
  - `frontend/src/i18n/*`
  - `frontend/src/site/*`
  - `scripts/build_github_pages_site.tsx`
  - `scripts/validate_locale_parity.ts`
  - `docs/developer/mcp_overview.md`
  - `docs/private`
- **RS-004 CI/QA and workflow updates**
  - `.github/workflows/*`
  - `playwright/tests/*`
  - `tests/cli/cli_command_coverage_guard.test.ts`
  - `tests/cli/cli_infra_commands.test.ts`
  - `.cursor/skills/publish/SKILL.md`
  - `.cursor/skills/learn/SKILL.md`
  - `.cursor/plans/fix_lexical_retrieval_fallback_72f9b7f6.plan.md`
- **Release packaging/meta**
  - `docs/releases/in_progress/v0.3.11/*`
  - `foundation`

## Inclusion Assertion

All currently outstanding paths are represented in one of the release workstreams above. No top-level path group from the snapshot is left unmapped.
