# Release v0.3.11 — Execution Schedule

## Batch Plan

### Batch 0: Stabilize and Validate High-Risk Reliability Changes
- **Workstreams**: RS-001, RS-002
- **Focus**:
  - retrieval isolation/total correctness
  - MCP/REST parity
  - CLI compatibility and `store-turn` semantics
- **Commands**:
```bash
npm run build:server
npm test -- tests/cli/cli_store_commands.test.ts tests/integration/retrieval_transport_reliability.test.ts tests/integration/mcp_retrieval_reliability.test.ts
npm test -- tests/cli/cli_entity_subcommands.test.ts tests/integration/entity_identifier_handler.test.ts src/services/__tests__/entity_semantic_search.test.ts src/services/__tests__/local_entity_embedding.test.ts
```
- **Exit criteria**:
  - all targeted reliability tests pass
  - no unresolved TypeScript errors

### Batch 1: Consolidate Outstanding Docs/Site/Localization Changes
- **Workstreams**: RS-003
- **Focus**:
  - docs integrity
  - generated site consistency
  - localization parity confidence
- **Commands**:
```bash
npm run validate:locales
npm run build:pages:site
```
- **Exit criteria**:
  - no critical locale parity failures
  - site build completes

### Batch 2: Final Integration and Release Readiness
- **Workstreams**: RS-004 + cross-workstream validation
- **Commands**:
```bash
npm run test:integration
```
- **Exit criteria**:
  - integration suite passes, or deviations are explicitly logged and approved
  - release notes and commit set are prepared

## Sign-Off Gate

Release is ready when:
- Batch 0, 1, and 2 exit criteria are met
- rollback plan remains valid for the final commit set
- status tracker is updated to `ready_for_deployment`
