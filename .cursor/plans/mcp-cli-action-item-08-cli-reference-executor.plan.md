# Action item 8 plan: CLI as reference executor

## Context summary
MCP and REST are the primary execution paths. There is no CLI wrapper that uses the same service layer as the reference executor.

## Key problems solved
- Execution logic is duplicated across MCP and REST.
- CLI is not a reference path for fidelity checks.

## Key solutions implemented
- Add a CLI module that calls the same service layer as MCP and REST.
- Use CLI outputs as the reference for parity and replay tests.

## Plan
1. Identify shared service entry points used by MCP and REST.
2. Create CLI commands that call those service entry points directly.
3. Refactor MCP and REST to share that service layer where needed.
4. Add tests that compare CLI and MCP outputs for the same inputs.
