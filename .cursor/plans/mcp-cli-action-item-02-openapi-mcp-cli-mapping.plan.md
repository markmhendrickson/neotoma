# Action item 2 plan: enforce 1 to 1 mapping

## Context summary
`src/shared/contract_mappings.ts` maps OpenAPI operations. MCP only tools bypass mapping. The report requires 1 to 1 coverage between OpenAPI operations and MCP tools or CLI commands.

## Key problems solved
- MCP only tools have no contract mapping.
- Parity tests do not cover all MCP tools.

## Key solutions implemented
- Require every MCP tool to map to an OpenAPI operation or CLI command.
- Add parity tests that enforce coverage.

## Plan
1. Inventory MCP tools in `src/server.ts`. Classify each tool as OpenAPI mapped, CLI mapped, or MCP only.
2. For each MCP only tool, add an OpenAPI operation or a CLI command that maps to it.
3. Update `src/shared/contract_mappings.ts` with all new mappings.
4. Expand contract mapping tests in `tests/contract/` to fail on unmapped MCP tools.
