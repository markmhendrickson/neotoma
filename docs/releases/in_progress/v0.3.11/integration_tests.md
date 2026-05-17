---
title: "Release v0.3.11 — Integration Tests"
summary: "- [ ] `npm run build:server` - [ ] IT-001 through IT-005 pass - [ ] IT-006 executed and reviewed - [ ] Any failing non-release-critical tests triaged with explicit decision log entry"
---

# Release v0.3.11 — Integration Tests

## Test Catalog

### IT-001: MCP/REST Identifier Parity
- **Goal**: Same identifier query returns equivalent entity IDs across MCP and REST.
- **Command**:
```bash
npm test -- tests/integration/retrieval_transport_reliability.test.ts
```
- **Pass condition**: parity assertion test passes.

### IT-002: Retrieval User Isolation
- **Goal**: Retrieval endpoints do not leak other-user entities/relationships.
- **Command**:
```bash
npm test -- tests/integration/retrieval_transport_reliability.test.ts tests/integration/mcp_retrieval_reliability.test.ts
```
- **Pass condition**: isolation assertions pass in MCP and REST tests.

### IT-003: Observations Pagination Total Semantics
- **Goal**: `list_observations` `total` is independent of current page size.
- **Command**:
```bash
npm test -- tests/integration/mcp_retrieval_reliability.test.ts
```
- **Pass condition**: test proves `limit=1` page while `total>=2`.

### IT-004: CLI Store-Turn Atomicity and Replay Safety
- **Goal**: `store-turn` supports idempotent replay and default turn-key behavior.
- **Command**:
```bash
npm test -- tests/cli/cli_store_commands.test.ts
```
- **Pass condition**: `store-turn` idempotency/default tests pass.

### IT-005: Retrieval Core Regression Pack
- **Goal**: Ensure retrieval/embedding behavior remains stable after reliability changes.
- **Command**:
```bash
npm test -- tests/cli/cli_entity_subcommands.test.ts tests/integration/entity_identifier_handler.test.ts src/services/__tests__/entity_semantic_search.test.ts src/services/__tests__/local_entity_embedding.test.ts
```
- **Pass condition**: all tests pass.

### IT-006: Broad Integration Safety Net
- **Goal**: Validate no broad integration breakage from outstanding changes.
- **Command**:
```bash
npm run test:integration
```
- **Pass condition**: integration suite completes successfully (or known exclusions documented).

## Pre-Deployment Checklist

- [ ] `npm run build:server`
- [ ] IT-001 through IT-005 pass
- [ ] IT-006 executed and reviewed
- [ ] Any failing non-release-critical tests triaged with explicit decision log entry
