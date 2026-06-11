# PR Review Reading List

This document is the authoritative reading list for the automated Claude PR reviewer. It tells the reviewer which docs to read and when.

## Always read

These three docs are the invariant kernel — load on every PR regardless of what changed.

| Doc | What it enforces |
|-----|-----------------|
| `docs/NEOTOMA_MANIFEST.md` | Root invariants: State Layer, determinism, immutability, schema-first, no PII, no synthetic data |
| `docs/foundation/layered_architecture.md` | State Layer / Operational Layer boundaries; forbidden cross-layer logic |
| `docs/architecture/change_guardrails_rules.mdc` | Cross-cutting change constraints; touchpoint matrix; pre-PR checklist |

All other docs are conditional — load only when the diff touches the listed paths (see below). The previous "always read" list was too broad: loading `core_identity`, `philosophy`, `schema_agnostic_design_rules`, `determinism`, `errors`, and `threat_model` on every PR consumed 6+ turns before any diff was read, causing reviews that touch `server.ts`/`actions.ts` to run out of budget at Phase 1.

## Read when these paths changed

Load only when the diff touches the listed files or directories.

### Data layer

| Changed path | Read |
|---|---|
| `src/reducers/` | `docs/subsystems/reducer.md` |
| `src/services/ingestion*`, `src/services/store*` | `docs/subsystems/ingestion/ingestion.md`, `docs/architecture/idempotence_pattern.md` |
| `src/services/observation*`, `src/services/sources*` | `docs/subsystems/sources.md`, `docs/subsystems/observation_architecture.md` |
| `src/services/interpretation*` | `docs/subsystems/interpretations.md` |
| `src/services/relationships*` | `docs/subsystems/relationships.md` |
| `src/services/entity*`, `src/services/schema_registry*` | `docs/foundation/entity_resolution.md`, `docs/subsystems/schema_registry.md`, `docs/subsystems/schema.md`, `docs/architecture/schema_compatibility_policy.md` |
| `src/services/entity_merge*` | `docs/subsystems/entity_merge.md` |
| `src/services/timeline*`, `src/services/events*` | `docs/foundation/timeline_events.md`, `docs/subsystems/timeline_events.md`, `docs/subsystems/events.md` |
| `src/services/deletion*` | `docs/subsystems/deletion.md` |
| `src/services/peer*` | `docs/subsystems/peer_sync.md` |
| `src/services/search*` | `docs/subsystems/search/search.md` |

### API and contract surfaces

| Changed path | Read |
|---|---|
| `openapi.yaml`, `src/shared/contract*`, `src/shared/openapi*` | `docs/architecture/openapi_contract_flow.md` |
| `src/tool_definitions.ts`, `src/server.ts`, `docs/developer/mcp/` | `docs/developer/mcp/instructions.md`, `docs/developer/agent_instructions_sync_rules.mdc` |
| `src/cli/` | `docs/developer/cli_reference.md` |
| `src/cli/entities*` (import/export), bulk-import or export-path changes | `docs/developer/exit_rebuild_test.md` |
| Error response shapes | `docs/reference/error_codes.md` |

### Auth and security

| Changed path | Read |
|---|---|
| `src/actions.ts`, `src/services/local_auth*`, `src/middleware/` | `docs/subsystems/auth.md`, `docs/security/threat_model.md`, `docs/security/advisories/2026-05-11-inspector-auth-bypass.md` |
| `src/services/root_landing/` | `docs/security/threat_model.md` |
| Guest access, public routes | `docs/subsystems/guest_access_policy.md` |

### Consistency and architecture

| Changed path | Read |
|---|---|
| Subsystem consistency model changes | `docs/architecture/consistency.md` |
| New call to `registry.register()` (new entity type registered, not just schema field addition) | `docs/subsystems/record_types.md`, `docs/foundation/data_models.md` |
| Any `if (entityType`, `switch (entity_type`, or hardcoded entity-type list in diff | `docs/foundation/schema_agnostic_design_rules.md` |
| Any new error code, tightened validation, or changed error response shape | `docs/subsystems/errors.md` |
| `Math.random`, `Date.now` in non-observability code paths; new sort/grouping in stored-output path | `docs/architecture/determinism.md` |
| Any change to stored fields, observation shape, or entity snapshot output | `docs/foundation/core_identity.md`, `docs/foundation/philosophy.md` |
| Any auth/security-adjacent change (`src/actions.ts`, `src/server.ts`, middleware, root_landing) | `docs/security/threat_model.md` |
| Naming of new fields, parameters, or error codes | `docs/vocabulary/canonical_terms.md` |

### Observability

| Changed path | Read |
|---|---|
| Logging, metrics, tracing | `docs/observability/logging.md`, `docs/observability/metrics_standard.md`, `docs/subsystems/privacy.md` |

### Testing

| Changed path | Read |
|---|---|
| `tests/` | `docs/testing/testing_standard.md`, `docs/testing/fixtures_standard.md` |
| New test files added or removed | `docs/testing/test_catalog_maintenance_rules.mdc` |

### Release and process

| Changed path | Read |
|---|---|
| `docs/releases/`, `CHANGELOG*`, version bumps | `docs/developer/github_release_process.md` |
| `package.json` scripts | `docs/developer/package_scripts.md`, `docs/developer/npm_scripts.md` |
| Feature unit specs or manifests | `docs/feature_units/standards/error_protocol.md` |

## Never read (not relevant to code review)

The following are explicitly out of scope for automated PR review:

- `docs/private/` — confidential
- `docs/icp/`, `docs/use_cases/` — product/market positioning
- `docs/legal/` — legal
- `docs/ui/design_system/` — visual design (no code invariants)
- `docs/releases/` — historical release records
- `docs/reports/`, `docs/proposals/`, `docs/plans/` — research and planning artefacts
- `docs/site/` — site infrastructure
- `docs/assets/` — images
