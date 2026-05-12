# Issues transport full parity (MCP, CLI, HTTP)

**Status:** Implemented in-repo (HTTP routes, CLI refactor, `contract_mappings` + OpenAPI, docs, contract tests).

## Goal

Align **submit**, **thread append**, **status**, and **mirror sync** so MCP, first-class HTTP routes, and `neotoma issues …` all call the same orchestration in [`src/services/issues/issue_operations.ts`](../../src/services/issues/issue_operations.ts) and [`sync_issues_from_github.ts`](../../src/services/issues/sync_issues_from_github.ts), with traceability via [`src/shared/contract_mappings.ts`](../../src/shared/contract_mappings.ts) and OpenAPI.

## Phases (execution order)

1. **HTTP** — Add `POST /issues/submit`, `POST /issues/status`, `POST /issues/sync` (+ `/api/issues/*` aliases) in [`src/actions.ts`](../../src/actions.ts); Zod request schemas in [`src/shared/action_schemas.ts`](../../src/shared/action_schemas.ts); document in [`openapi.yaml`](../../openapi.yaml); run `npm run openapi:generate`.
2. **Contract + CLI** — Extend [`contract_mappings.ts`](../../src/shared/contract_mappings.ts) (`MCP_TOOL_TO_OPERATION_ID`, `OPENAPI_OPERATION_MAPPINGS`); refactor [`src/cli/issues.ts`](../../src/cli/issues.ts) to use the new routes; add `neotoma issues status`; adjust `issues message` to support `--entity-id` or positional GitHub number.
3. **Docs** — Update [`docs/subsystems/issues.md`](../../docs/subsystems/issues.md) and [`docs/developer/cli_reference.md`](../../docs/developer/cli_reference.md) transport sections.
4. **Tests** — Extend [`tests/contract/contract_mcp_cli_parity.test.ts`](../../tests/contract/contract_mcp_cli_parity.test.ts) operation-mapped tool list for issue tools; verify [`tests/contract/contract_mapping.test.ts`](../../tests/contract/contract_mapping.test.ts) passes.

## Definition of done

- No duplicate GitHub + `/store` assembly in CLI for create, message, or sync.
- OpenAPI `operationId`s exist for submit/status/sync; `issuesAddMessage` lists `mcpTool: add_issue_message` and `adapter: both`.
- `docs/subsystems/issues.md` no longer describes submit/status/sync as MCP-only for HTTP.

## Non-goals (this pass)

- `neotoma issues list` remains GitHub-forward (no MCP twin).
- Bulk Inspector routes unchanged.
