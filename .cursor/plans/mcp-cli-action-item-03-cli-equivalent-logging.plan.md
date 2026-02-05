# Action item 3 plan: log CLI equivalents for MCP

## Context summary
`buildCliEquivalentInvocation()` logs CLI commands for MCP tool calls, but MCP only tools log placeholders.

## Key problems solved
- CLI equivalent logs are incomplete.
- MCP only tools have no real command reference.

## Key solutions implemented
- Define CLI equivalents for every MCP tool.
- Log real commands for all MCP tool calls.

## Plan
1. Enumerate MCP only tools and define intended CLI commands for each.
2. Add CLI implementations or wrappers that call the same service layer as MCP.
3. Update `buildCliEquivalentInvocation()` to return a real command for every tool.
4. Add tests that fail if any CLI equivalent is a placeholder.
