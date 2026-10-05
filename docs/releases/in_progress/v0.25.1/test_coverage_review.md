# Test coverage review — v0.25.1

Range: `v0.25.0..HEAD` (558a9e36f, 381d7b891).

## Code review

Verdict: **APPROVE** (no BLOCKING findings). Walked the pre-PR checklist against the diff.

- ADVISORY (fixed in the RC commit): `tests/contract/legacy_payloads/CHANGES.md` labelled the new grant-tightening entry `## v0.25.0`, but v0.25.0 was already tagged. Heading changed to `## v0.25.1`.
- ADVISORY: `381d7b891` was committed with `--no-verify` after an unrelated `EADDRINUSE` on `graph_neighborhood_pagination.test.ts`. The targeted tests below were re-run in this lane and pass.
- Checks: OpenAPI-first (`AgentCapabilityEntry.relationship_types`, `RelationshipBatchErrorItem` declared; `openapi:bc-diff` clean); tightening obligation met (structured `hint`, fixture `legacy_relationship_grant_without_scope.json`, CHANGES.md line, supplement Breaking changes); authorization via shared module and `getAuthenticatedUserId`-scoped owner lookups; no nondeterminism added (lifecycle priority derived from stored observations); no schema-per-type branches; no PII in logs; no new routes.

## Surfaces

### Relationship-write grant enforcement (REST/MCP store, create_relationship(s), restore, delete, interpretations, schema auto-link)
Covers user-observable behavior end-to-end: `tests/integration/relationship_write_capability_surfaces.test.ts` (REST over HTTP with real middleware chain, MCP tool methods; asserts edge absent after refusal and present when allowed), `tests/contract/relationship_write_grant_contract.test.ts`, `tests/unit/agent_capabilities.test.ts`.

### Grant import and Inspector form (`agents grants import`, `relationship_types` input)
Covers behavior: `tests/unit/agents_grants_import.test.ts`, `tests/unit/inspector_agent_grant_capabilities.test.ts`, `tests/integration/agent_capabilities_store.test.ts`.

### Relationship delete / restore / delete-again ordering (#2570)
Covers behavior against a real DB: `tests/integration/relationship_liveness_pagination.test.ts`, `tests/services/relationship_type_registration.test.ts` (including concurrent same-edge writes).

## Result run in this lane

30 targeted files, 378 tests passed; `type-check` clean; `test:security:auth-matrix` 18 passed / 1 skipped. No BLOCKING gaps.
