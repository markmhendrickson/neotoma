---
title: "MCP and CLI action items fidelity report"
status: "report"
created_date: "2026-02-02"
related_proposal: "docs/proposals/mcp-cli-action-items.md"
---

# MCP and CLI action items fidelity report
## Scope
This report evaluates current codebase fidelity against the action items in `docs/proposals/mcp-cli-action-items.md`. It covers contract alignment, MCP tooling, CLI behavior, fixtures, and documentation artifacts. It does not implement changes or define a release plan.

## Purpose
Provide a factual assessment of where the codebase aligns with the proposal and where gaps remain. Each action item includes current evidence and required changes.

## Invariants
1. Truth Layer boundaries remain intact. No strategy or execution logic is introduced.
2. Determinism requirements remain enforced across ingestion, reducers, and tool calls.
3. MCP tooling remains schema bound and auditable.
4. Documentation must use active voice, short sentences, and no em dashes.

## Definitions
- **Fidelity**: The degree to which current code and docs meet the proposal action item intent.
- **Aligned**: Evidence exists in code or docs that meets the action item.
- **Partial**: Some components exist, but required alignment or enforcement is missing.
- **Gap**: No evidence of implementation or enforcement.

## Findings by action item

### 1. Treat OpenAPI and domain schemas as the single core
**Status**: Partial  
**Evidence**:
- OpenAPI exists in `openapi.yaml`.
- Contract mappings exist in `src/shared/contract_mappings.ts` with coverage for OpenAPI operationIds.
- Parity tests validate OpenAPI operation coverage in `tests/contract/contract_mapping.test.ts`.
**Gap**:
- MCP tool schemas remain defined outside OpenAPI in `src/server.ts` and `docs/specs/MCP_SPEC.md`.
**Required changes**:
- Derive MCP tool schemas from OpenAPI or generate OpenAPI from MCP schemas.

### 2. Enforce 1:1 mapping between OpenAPI operations and MCP tools or CLI commands
**Status**: Partial  
**Evidence**:
- Mapping registry exists in `src/shared/contract_mappings.ts`.
- Parity tests validate operation coverage in `tests/contract/contract_mapping.test.ts`.
**Gap**:
- MCP only tools still bypass OpenAPI mapping.
**Required changes**:
- Reduce the MCP only tool list by adding OpenAPI coverage or CLI mappings where possible.

### 3. Log CLI equivalent invocation for every MCP tool call
**Status**: Partial  
**Evidence**:
- MCP request handling logs CLI equivalents via `buildCliEquivalentInvocation()` in `src/server.ts`.
**Gap**:
- MCP only tools log a placeholder command.
**Required changes**:
- Add CLI equivalents for MCP only tools or expand OpenAPI coverage.

### 4. Define CLI output contract with `--json` and `--pretty`
**Status**: Aligned  
**Evidence**:
- CLI supports `--json` and `--pretty` in `src/cli/index.ts`.
- Output is produced through a single formatter in `src/cli/index.ts`.
**Gap**:
- None.
**Required changes**:
- None.

### 5. Require idempotency keys for ingestion and corrections
**Status**: Gap  
**Evidence**:
- Ingestion pipeline is documented in `docs/subsystems/ingestion/ingestion.md`.  
**Gap**:
- No idempotency key fields are visible in MCP or REST schemas in `src/actions.ts`.  
**Required changes**:
- Add idempotency fields to ingest and correct schemas and enforce them in handlers.

### 6. Enforce strict, machine checkable error taxonomy
**Status**: Partial  
**Evidence**:
- Error handling in `src/actions.ts` uses `handleApiError` and returns `{ error: message }`.  
**Gap**:
- Responses are string based and not aligned to `docs/subsystems/errors.md`.  
**Required changes**:
- Replace string errors with structured error envelopes and canonical error codes.

### 7. Maintain replayable fixtures with expected extracted graphs
**Status**: Partial  
**Evidence**:
- Fixtures are consolidated in `tests/fixtures/` with extensive coverage in `tests/fixtures/README.md`.  
**Gap**:
- Expected extracted graph outputs are not centrally documented.  
**Required changes**:
- Add expected snapshot or graph outputs alongside fixtures to support deterministic replay checks.

### 8. Treat CLI as the reference executor
**Status**: Gap  
**Evidence**:
- MCP stdio server entrypoint is `src/index.ts`. HTTP transport is `src/actions.ts`.  
**Gap**:
- No dedicated CLI wrapper exists.  
**Required changes**:
- Create a CLI module that invokes the same service layer as MCP and REST, then treat it as the reference executor.

### 9. Keep MCP tools boring and atomic
**Status**: Partial  
**Evidence**:
- MCP tools are defined in `src/server.ts`.  
**Gap**:
- MCP test failures in `docs/reports/FAILING_TESTS_SUMMARY.md` show method name mismatches. This indicates tooling instability.  
**Required changes**:
- Stabilize method naming and enforce atomic tool boundaries before adding composites.

### 10. Publish canonical walkthrough: ingest, normalize, extract, query, replay
**Status**: Partial  
**Evidence**:
- Pipeline flow is documented in `docs/subsystems/ingestion/ingestion.md`.
- Step flows exist in `docs/releases/v0.2.0/integration_tests.md`.  
**Gap**:
- No standalone walkthrough doc that ties steps into a user facing guide.  
**Required changes**:
- Add a focused walkthrough in docs that links ingestion, query, and replay.

### 11. Maintain fixtures repository with sample documents and expected outputs
**Status**: Partial  
**Evidence**:
- Fixtures are in `tests/fixtures/`.  
**Gap**:
- Expected outputs are not centrally published.  
**Required changes**:
- Add expected outputs per fixture in a consistent structure.

### 12. Build failure gallery for determinism breaks and system responses
**Status**: Gap  
**Evidence**:
- Failure analyses exist in `docs/reports/` such as `FAILING_TESTS_SUMMARY.md`.  
**Gap**:
- No curated failure gallery doc that summarizes determinism issues and responses.  
**Required changes**:
- Create an index report that groups failure modes and links to existing analyses.

## Testing requirements
1. Add unit tests for idempotency key validation in ingestion and correction handlers.
2. Add MCP to OpenAPI parity tests that enforce 1:1 mapping.
3. Add CLI output contract tests for `--json` and `--pretty`.
4. Add fixture replay tests that compare expected snapshots to reducer outputs.

## Documentation requirements
1. Add or update documentation to describe contract authority and tool parity.
2. Add a canonical walkthrough doc.
3. Add a failure gallery report.
4. Add expected output documentation for fixtures.

## Open issues
No open issues at this time.

## Agent Instructions
### When to Load This Document
Load this document when evaluating MCP and CLI alignment, contract surface changes, or proposal fidelity.

### Required Co-Loaded Documents
- `docs/foundation/core_identity.md`
- `docs/architecture/determinism.md`
- `docs/specs/MCP_SPEC.md`
- `docs/subsystems/ingestion/ingestion.md`
- `docs/subsystems/errors.md`
- `docs/testing/fixtures_standard.md`
- `docs/conventions/documentation_standards_rules.mdc`
- `docs/conventions/writing_style_guide.md`

### Constraints Agents Must Enforce
1. Truth Layer boundaries remain intact.
2. Determinism requirements remain enforced.
3. MCP tool behavior remains schema bound.
4. Documentation uses active voice and short sentences.
5. No em dashes are used.

### Forbidden Patterns
- Introducing strategy or execution logic into Truth Layer code.
- Parsing non JSON CLI output in MCP tools.
- Returning free form string errors in MCP or REST.
- Introducing composite MCP tools without explicit contract justification.
- Omitting provenance or idempotency validation for ingestion.

### Validation Checklist
- [ ] Report includes required sections.
- [ ] No em dashes or en dashes used.
- [ ] Findings include evidence and required changes.
- [ ] References align with current code paths.
