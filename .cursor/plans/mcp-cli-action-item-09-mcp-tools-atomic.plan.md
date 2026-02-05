# Action item 9 plan: keep MCP tools boring and atomic

## Context summary
MCP tools live in `src/server.ts`. Test failures show method name mismatches. Tool naming and boundaries need stabilization.

## Key problems solved
- Tool name instability breaks tests and clients.
- Tool boundaries are not enforced as atomic actions.

## Key solutions implemented
- Enforce stable naming and versioning rules.
- Add tests for tool name stability and atomic behavior.

## Plan
1. Define tool naming and versioning rules in docs and code.
2. Add a registry validation test that asserts stable tool names.
3. Split composite tools into atomic operations where needed.
4. Update docs that reference tool names to the canonical set.
