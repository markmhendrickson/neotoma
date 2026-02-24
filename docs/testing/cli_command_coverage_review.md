# CLI Command Coverage Review

**Last updated:** 2025-02-20  
**Status:** All session commands have behavioral coverage or explicit help-only classification.

## Purpose

This document summarizes Neotoma CLI commands and their automated test coverage. It supports maintenance of the CLI test suite and ensures new commands get appropriate coverage.

## Scope

- **Session commands:** Top-level commands (and their subcommands) exposed to the interactive `neotoma>` prompt
- **Behavioral tests:** Tests that invoke commands and assert on output or exit codes (not only help text)
- **Coverage guard:** `tests/cli/cli_command_coverage_guard.test.ts` enforces that every session command is either covered or explicitly classified as help-only

## Command Inventory and Coverage

### Commands with Behavioral Coverage

| Command | Test File(s) | Notes |
|--------|---------------|-------|
| **api** | `cli_api_commands.test.ts`, `cli_infra_commands.test.ts` | status, start, stop, processes, logs with `--json` or validation |
| **auth** | `cli_auth_commands.test.ts`, `cli_admin_commands.test.ts`, `cli_infra_commands.test.ts` | status, logout, mcp-token, login (help), whoami |
| **backup** | `cli_infra_commands.test.ts` | create, restore (help / guidance) |
| **cli-instructions** | `cli_mcp_commands.test.ts` | config, check with `--json` |
| **corrections** | `cli_correction_commands.test.ts` | create, reinterpret, output formats, DB verification |
| **dev** | `cli_infra_commands.test.ts` | dev list, dev run (behavioral) |
| **entities** | `cli_entity_commands.test.ts`, `cli_entity_subcommands.test.ts`, `cli_smoke.test.ts` | list, get, search, related, neighborhood, delete, restore |
| **init** | `cli_infra_commands.test.ts` | init success |
| **interpretations** | `cli_correction_commands.test.ts` | reinterpret |
| **logs** | `cli_api_commands.test.ts`, `cli_infra_commands.test.ts` | api logs, logs tail |
| **mcp** | `cli_mcp_commands.test.ts`, `cli_infra_commands.test.ts` | config, check |
| **observations** | `cli_observation_commands.test.ts` | list, get, filters, pagination, exit codes |
| **options** | `cli_infra_commands.test.ts` | options JSON output |
| **relationships** | `cli_relationship_commands.test.ts` | create, list, get, delete, restore, get-snapshot |
| **schemas** | `cli_schema_commands.test.ts` | list, get, analyze, recommend, update, register |
| **servers** | `cli_infra_commands.test.ts` | servers guidance |
| **snapshots** | `cli_admin_commands.test.ts` | check, request (incl. `--dry-run`) |
| **sources** | `cli_source_commands.test.ts` | list, get, filters, pagination |
| **stats** | `cli_stats_commands.test.ts` | entities (JSON and human-readable) |
| **storage** | `cli_infra_commands.test.ts` | info with `--json` |
| **store** | `cli_store_commands.test.ts` | store, store-structured, store-unstructured with various options |
| **store-structured** | `cli_store_commands.test.ts` | entity creation via `--json` |
| **store-unstructured** | `cli_store_commands.test.ts` | file upload via `--file-path` |
| **timeline** | `cli_timeline_commands.test.ts` | list, get, filters, date range, pagination |
| **upload** | `cli_store_commands.test.ts` | `upload <path>` with `--json` |

### Help-Only (Intentional)

| Command | Rationale |
|---------|-----------|
| **watch** | Long-running interactive stream; hard to test deterministically |
| **request** | Generic operation dispatcher with broad input surface |

### Integration Tests (CLI → MCP/API → DB)

| Test File | Commands Exercised | Purpose |
|-----------|--------------------|---------|
| `cli_to_mcp_entities.test.ts` | entities list, entities get, entities search | CLI ↔ MCP entity parity |
| `cli_to_mcp_relationships.test.ts` | relationships create, list | CLI ↔ MCP relationship parity |
| `cli_to_mcp_schemas.test.ts` | schemas list, schemas get | CLI ↔ MCP schema parity |
| `cli_to_mcp_store.test.ts` | store, store-structured | CLI ↔ MCP store parity |
| `cli_to_mcp_stats_snapshots.test.ts` | stats entities, snapshots request | CLI stats/snapshots and DB consistency |

## CLI Test Suite Summary

- **CLI test files:** 22 (including smoke, config, coverage guard)
- **CLI tests:** 269 passed, 2 skipped
- **Coverage guard:** Passes; no uncovered session commands

### Test Files by Domain

| Domain | Test File | Focus |
|--------|-----------|-------|
| Admin | `cli_admin_commands.test.ts` | auth whoami, snapshots check, snapshots request |
| API | `cli_api_commands.test.ts` | api status, start, stop, processes, logs |
| Auth | `cli_auth_commands.test.ts` | auth status, logout, mcp-token, login |
| Entities | `cli_entity_commands.test.ts`, `cli_entity_subcommands.test.ts` | list, get, search, related, neighborhood, delete, restore |
| Infra | `cli_infra_commands.test.ts` | auth, mcp, storage, backup, logs, api, init, servers, options, dev |
| MCP | `cli_mcp_commands.test.ts` | mcp config/check, cli-instructions config/check |
| Observations | `cli_observation_commands.test.ts` | list, get, filters |
| Query | `cli_query_commands.test.ts` | entities, sources, timeline, relationships (list/get patterns) |
| Relationships | `cli_relationship_commands.test.ts` | create, list, get, delete, restore, get-snapshot |
| Schemas | `cli_schema_commands.test.ts` | list, get, analyze, recommend, update, register |
| Sources | `cli_source_commands.test.ts` | list, get |
| Stats | `cli_stats_commands.test.ts` | stats entities |
| Store | `cli_store_commands.test.ts` | store, store-structured, store-unstructured, upload |
| Timeline | `cli_timeline_commands.test.ts` | list, get |
| Corrections | `cli_correction_commands.test.ts` | corrections create, interpretations reinterpret |
| Coverage | `cli_command_coverage_guard.test.ts` | Enforces covered/help-only for all session commands |

## Coverage Guard

The guard in `cli_command_coverage_guard.test.ts`:

1. Reads `getSessionCommandNames()` (top-level session commands)
2. Checks each against `coveredBehavioral` or `helpOnlyWithRationale`
3. Fails if any command is neither covered nor explicitly help-only

**Adding a new command:** Update `coveredBehavioral` when adding behavioral tests, or `helpOnlyWithRationale` (with rationale) when a command is intentionally help-only.

## Skipped Tests

- **store with --interpret true:** Requires OpenAI quota; skipped unless real key and quota available
- One other skip in CLI suite (see `npm test -- tests/cli` output)

## Remaining Gaps (Low Priority)

- **watch:** Long-running; no automated behavioral test. Manual verification recommended.
- **request:** Broad input surface; help-only acceptable.
- **OAuth flows (auth login):** Interactive; covered by manual checklist and integration tests when auth provider is configured.
- **backup create/restore:** Smoke/help coverage only; full E2E backup/restore is manual.

## Running CLI Tests

```bash
npm test -- tests/cli
```

Integration tests that exercise CLI paths:

```bash
npm run test:integration -- tests/integration/cli_to_mcp_*.test.ts
```

## Related Documents

- `docs/testing/automated_test_catalog.md` — Test file inventory
- `docs/developer/cli_reference.md` — CLI command reference
- `docs/testing/integration_test_quality_rules.mdc` — Integration test quality rules
