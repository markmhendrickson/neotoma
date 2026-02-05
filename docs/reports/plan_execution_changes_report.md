# Plan execution changes report
## Scope
This report lists code, test, and documentation changes produced by executing the MCP CLI action item plans. It does not define new requirements or replace source specifications.

## Purpose
Provide a single, deterministic record of all changes made during plan execution.

## Invariants
1. Truth Layer boundaries remain unchanged.
2. All changes preserve deterministic behavior.
3. Error responses use structured ErrorEnvelope formats.
4. Documentation updates follow Neotoma documentation standards.

## Definitions
- **Plan execution**: The set of changes made while implementing plan files for the MCP CLI action items.
- **Mapped tool**: An MCP tool with a corresponding OpenAPI operation mapping.
- **MCP only tool**: An MCP tool without an OpenAPI mapping.

## Data models
No new data models were introduced. Existing sources, observations, entities, snapshots, and timeline events remain unchanged.

## Flows
Changes were applied in this order:
1. Contract and schema alignment for MCP tools and OpenAPI.
2. CLI execution parity for MCP only tools.
3. Error envelope standardization and error code updates.
4. Deterministic fixture replay tests and expected outputs.
5. Documentation updates and new reports.

## Diagrams
No new diagrams were added in this report.

## Changes by plan
### Plan 1: OpenAPI as single contract source
- Added OpenAPI schema loader and resolver in `src/shared/openapi_schema.ts`.
- MCP tool input schemas now derive from OpenAPI for mapped tools in `src/server.ts`.
- Added contract test `tests/contract/openapi_schema.test.ts`.
- Updated `docs/specs/MCP_SPEC.md` to clarify OpenAPI as schema authority.

### Plan 2: 1:1 mapping coverage
- Added `MCP_TOOL_TO_CLI_COMMAND` mapping for MCP only tools in `src/shared/contract_mappings.ts`.
- Extended contract tests to require CLI command coverage for MCP only tools in `tests/contract/contract_mapping.test.ts`.

### Plan 3: CLI equivalents logged
- `buildCliEquivalentInvocation` now emits CLI for mapped tools and MCP only tools, including args redaction.
- Added `neotoma mcp-only` CLI command to execute MCP handlers locally, requires `--user-id`.

### Plan 6: Error taxonomy and envelopes
- Standardized REST error responses to ErrorEnvelope format in `src/actions.ts`.
- Added `RESOURCE_NOT_FOUND` to `docs/reference/error_codes.md`.
- Extended `docs/subsystems/errors.md` with validation and resource errors.

### Plan 7: Fixture replay graphs
- Added deterministic reducer replay test `tests/fixtures/replay_graph.test.ts`.
- Added expected snapshot fixture `tests/fixtures/expected/contact_snapshot.json`.

### Plan 8: CLI reference executor
- Introduced `NeotomaServer.executeToolForCli` for local execution.
- CLI `mcp-only` command now routes to MCP handlers directly.

### Plan 9: MCP tools atomic
- Added `store_structured` and `store_unstructured` MCP tools.
- Updated tool descriptions in `docs/developer/mcp/tool_descriptions.yaml`.
- Updated `docs/specs/MCP_SPEC.md` to note atomic alternatives.

### Plan 10: Canonical walkthrough
- Added `docs/developer/canonical_walkthrough.md`.
- Updated `docs/context/index_rules.mdc` to include the new developer doc.

### Plan 11: Fixtures expected outputs
- Added `tests/fixtures/expected/transaction_snapshot.json`.
- Expanded `tests/fixtures/replay_graph.test.ts` to include transaction replay.
- Updated `tests/fixtures/README.md`.

### Plan 12: Failure gallery
- Added `docs/reports/failure_gallery.md`.
- Updated `docs/context/index_rules.mdc` to include reports section.
- Added `docs/reports/*.md` to `docs/doc_dependencies.yaml`.

## Examples
Example error envelope used in REST responses:
```json
{
  "error_code": "RESOURCE_NOT_FOUND",
  "message": "Source not found",
  "details": {
    "resource": "source",
    "id": "src_missing"
  },
  "timestamp": "2024-01-10T00:00:00.000Z"
}
```

## Testing requirements
1. `npm test` for unit and contract tests.
2. `npm run test:unit` for deterministic snapshot replay tests.
3. `node scripts/validate-doc-dependencies.js docs/reports/plan_execution_changes_report.md`.

## Agent Instructions
### When to Load This Document
Load when summarizing or auditing the MCP CLI action item plan execution changes.

### Required Co-Loaded Documents
- `docs/NEOTOMA_MANIFEST.md`
- `docs/conventions/documentation_standards.md`
- `docs/private/governance/00_GENERATION.md`

### Constraints Agents Must Enforce
1. Report updates must remain deterministic and factual.
2. No new requirements are introduced in this report.
3. Links and references must remain valid.

### Forbidden Patterns
- Introducing new requirements in a report
- Omitting required report sections
- Including PII in examples

### Validation Checklist
- [ ] Required sections present
- [ ] Examples deterministic
- [ ] No PII or secrets
- [ ] References are valid
