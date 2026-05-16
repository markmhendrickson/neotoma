---
title: Github Release Supplement
summary: v0.11.0 is a release finalization for the unified store contract, interpretation provenance, MCP onboarding, Inspector feedback administration, and localized site expansion.
---

v0.11.0 is a release finalization for the unified store contract, interpretation provenance, MCP onboarding, Inspector feedback administration, and localized site expansion.

## Highlights

- **One canonical store surface.** MCP and HTTP writes now use the unified `store` operation for structured entities, file-backed sources, or both. Legacy `store_structured` and `store_unstructured` references should move to `store`.
- **Interpretation provenance is explicit.** Store requests can include an `interpretation` block, and agents can create interpretation runs for existing sources with `create_interpretation`.
- **Lower-friction MCP setup for npm users.** `neotoma mcp config` defaults to transport preset **B**, which uses local stdio for packaged installs and does not require a separate API process for the basic Cursor / Claude Code / Codex path.
- **Signed MCP proxy remains available.** Presets **A** and **D** keep the signed HTTP `/mcp` proxy path for AAuth attribution when the API is running.
- **Inspector feedback admin workflow.** Maintainers can unlock feedback-admin sessions from the CLI and triage/sync feedback from the Inspector.

## What changed for npm package users

**CLI (`neotoma`, `neotoma setup`, `neotoma mcp config`, …)**

- `neotoma setup --tool <tool> --yes` remains the recommended greenfield command. It runs idempotent init, MCP config, CLI instruction setup, hooks/plugins where supported, and permission-file patches.
- `neotoma mcp config` now defaults to transport preset **B**. Packaged npm installs launch Neotoma directly over stdio for local MCP clients; no `neotoma api start` is required for the default MCP path.
- `--mcp-transport a` remains available for signed AAuth HTTP `/mcp` proxy entries. Use it when the dev/prod API is already running and trusted attribution is more important than lowest setup friction.
- `--mcp-transport d` writes signed prod-parity entries where both MCP slots point at prod HTTP `/mcp`.
- `neotoma setup` documentation now lists every setup flag, including `--install-scope`, permission `--scope`, `--rewrite-neotoma-mcp`, `--skip-hooks`, `--all-harnesses`, `--dry-run`, and `--skip-permissions`.
- `neotoma processes` adds a development/ops helper for listing and terminating Neotoma-related local processes.
- `neotoma instructions print` and `/mcp-interaction-instructions` expose the shipped MCP interaction instructions without requiring agents to inspect repo files.

**Runtime / data layer**

- `POST /store` is the canonical operation for structured and file-backed writes.
- `POST /interpretations/create` creates interpretation rows for agent-extracted entities from an existing source.
- `store` requests can include `interpretation` provenance so observations link to both a source and interpretation run.
- Registered user schemas take precedence over built-in aliases before store/interpretation routing falls back to code-defined aliases.
- Raw-fragment entity resolution prefers explicit `entity_id`; source-only fragments resolve only when the source maps unambiguously to one entity.

**MCP tools**

- Added `create_interpretation`.
- Added `list_interpretations`.
- Removed canonical exposure of `store_structured` and `store_unstructured`; use `store`.
- Deprecated store aliases still map to `store` in internal contract mappings where compatibility is needed.

**Inspector**

- Added feedback admin unlock flow, including CLI challenge redemption and the Inspector `/feedback/admin-unlock` page.
- Added feedback admin API client surfaces and a store-sync/repair panel for feedback mirrors.

**Docs site and i18n**

- Added layered locale packs for global chrome, home/body content, subpages, FAQ, docs hub, and CLI demo scenarios.
- Updated site examples to use `store` instead of `store_structured`.
- Regenerated static `site_pages/` output is included in this release.

## API surface & contracts

- `POST /store` operationId is now `store` (was `storeStructured`).
- `POST /store/unstructured` is removed. Send file-only or file+entity payloads to `POST /store` instead.
- Store request schemas include optional `interpretation` provenance.
- Store responses may include `interpretation_id` for observations produced through an interpretation run.
- Added schemas: `InterpretationConfig`, `StoreInterpretationInput`, `CreateInterpretationRequest`, and `CreateInterpretationResponse`.
- Added path: `POST /interpretations/create`.
- `listInterpretations` is now mapped as a CLI and MCP-backed operation.

## Behavior changes

- First-time npm onboarding through MCP favors direct local stdio by default (`b`) rather than signed HTTP proxy (`a`).
- Users who want signed AAuth MCP attribution must explicitly choose `--mcp-transport a` or `d` and run a reachable HTTP API.
- Site and agent-facing examples use `store` as the canonical tool name.
- Existing stored data is not migrated.

## Agent-facing instruction changes

- MCP and CLI instructions center the canonical `store` tool.
- Attachment/source-derived extraction guidance distinguishes ordinary chat-native stores from explicit interpretation provenance.
- Closing-store and display-rule requirements remain in force.
- Setup guidance points agents to `neotoma setup --tool <tool> --yes` and the read-only `mcp guide` / `cli guide` surfaces instead of ad hoc shell introspection.

## Plugin / hooks / SDK changes

- Cursor hook reminders and compliance detection now recognize canonical `store` calls and legacy store aliases.
- Cursor hook follow-up behavior can be disabled with `NEOTOMA_HOOK_COMPLIANCE_PASSES=off`.
- Claude Code / Codex hook packages and docs are refreshed for the unified store wording and setup command names.
- Client turn-report helpers are updated for the same display and storage conventions.

## Security hardening

- MCP proxy support enables stdio clients to send signed AAuth HTTP requests to `/mcp` when using transport presets **A** or **D**.
- Feedback admin sessions require hardware/software/operator-attested identity tiers and use short-lived httpOnly cookies.
- Protected agent capability examples now prefer `op: "store"`.

## Docs site & CI / tooling

- Developer docs document MCP transport presets A-D with **B** as the npm-friendly default.
- CLI reference documents the full `neotoma setup` flag surface and structured setup report.
- README and install docs align on `neotoma setup` as the default onboarding path.
- Static site export includes the regenerated localized pages.

## Internal changes

- MCP config generation routes entries through transport-aware builders.
- A local HTTP port file lets signed shims discover moved API ports after `pick-port` chooses a non-default port.
- Feedback admin session state is held in process memory; restarts require a new challenge.
- Inspector and root landing docs route through updated localized site data.

## Fixes

- Fixed schema alias precedence so registered schemas win before built-in aliases such as `organization` -> `company`.
- Fixed raw-fragment isolation when a source has observations for multiple entities.
- Fixed CLI MCP config naming for Claude Desktop `mcpsrv_*` server IDs.
- Fixed outdated site examples that taught `store_structured`.

## Tests and validation

- `npx tsc --noEmit`
- `npx vitest run tests/contract/ --reporter=verbose`
- `npx vitest run tests/cli/cli_command_coverage_guard.test.ts --reporter=verbose`
- `npm run openapi:bc-diff`
- `npm run build:server`
- `npm pack --dry-run`

## Breaking changes

- **`POST /store` operationId changed from `storeStructured` to `store`.** Codegen clients that referenced `operations.storeStructured` must switch to `operations.store`.
- **`POST /store/unstructured` was removed.** Use `POST /store` with `file_content` + `mime_type` or `file_path` for file-only writes.
- **MCP tools `store_structured` and `store_unstructured` are no longer canonical.** Agents and clients should call `store`.
- **CLI commands `neotoma store-structured` and `neotoma store-unstructured` are removed.** Use `neotoma store` with `--entities`, `--file`, or `--file-path`.
- **Default MCP transport changed from signed proxy preset A to local stdio preset B.** Users who require signed HTTP `/mcp` attribution must pass `--mcp-transport a` or `--mcp-transport d`.
