---
title: Github Release Supplement
summary: v0.9.1 is a narrow Claude Desktop MCP compatibility hotfix for local Neotoma MCP installs.
---

v0.9.1 is a narrow Claude Desktop MCP compatibility hotfix for local Neotoma MCP installs.

## Highlights

- **Claude Desktop can accept Neotoma's generated MCP server entries.** `neotoma mcp check` now uses `mcpsrv_neotoma_dev` and `mcpsrv_neotoma` in `claude_desktop_config.json`, matching Claude Desktop's server ID validation.
- **Embedded MCP UI metadata uses the standard Apps URI scheme.** The timeline widget is now advertised as `ui://neotoma/timeline_widget` while the server still accepts the legacy `neotoma://ui/timeline_widget` URI for compatibility.

## What changed for npm package users

**CLI (`neotoma mcp check`)**

- Claude Desktop config installs now write `mcpsrv_neotoma_dev` and `mcpsrv_neotoma` keys instead of `neotoma-dev` and `neotoma`.
- Existing Claude Desktop configs that still use `neotoma-dev` or `neotoma` are reported as repairable issues, and the fixer migrates those keys to the compliant `mcpsrv_*` IDs.
- `neotoma uninstall` recognizes the new Claude Desktop `mcpsrv_neotoma*` IDs when removing Neotoma MCP entries.

**Runtime / data layer**

- No storage, reducer, schema, or database behavior changed.

**Shipped artifacts**

- `dist/` output should include the new MCP Apps UI URI after `npm run build:server`.

## API surface & contracts

- OpenAPI is unchanged.
- MCP tool schemas are unchanged.
- The MCP resource list and static server card now advertise the timeline widget resource as `ui://neotoma/timeline_widget`.
- The MCP server continues to parse `neotoma://ui/timeline_widget` so older clients do not break.

## Behavior changes

- Claude Desktop users should no longer see server-ID validation failures caused by `neotoma` or `neotoma-dev` keys in generated MCP config.
- MCP Apps clients that expect `ui://<server>/<resource>` resource URIs now receive a compliant timeline widget URI.

## Docs site & CI / tooling

- Claude Desktop setup documentation now shows the `mcpsrv_*` keys and explains why they are required.
- ChatGPT Apps validation references now use `ui://neotoma/timeline_widget`.

## Internal changes

- Added focused tests for static server card UI metadata, MCP resource URI parsing, and Claude Desktop MCP config migration.

## Fixes

- Fixed Claude Desktop compatibility with generated local Neotoma MCP server IDs.
- Fixed MCP Apps UI resource URI advertising for the timeline widget.

## Tests and validation

- Focused validation should include:
  - `npx vitest run tests/unit/mcp_server_card.test.ts tests/unit/mcp_resource_uri.test.ts tests/cli/cli_mcp_commands.test.ts`
  - `npm run type-check`
  - `npm run build:server`
  - `npm run openapi:bc-diff`
  - `npm pack --dry-run`

## Breaking changes

No breaking changes.
