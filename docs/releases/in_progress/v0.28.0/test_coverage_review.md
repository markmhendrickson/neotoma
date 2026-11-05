# Test coverage review — v0.28.0

Range: `v0.27.0..HEAD` (4 commits, 35 files, +2780/−211). Test bodies were read, not just file names.

## Surfaces

### Compare-only guards in `correctTransaction` (data-mutating, MCP + HTTP + CLI)

**Classification: covers user-observable behavior end-to-end.**

- Service: `src/services/correction_transaction.test.ts`. Covers guarded apply without a guard observation, stale-guard refusal before any writer correction or notification, fail-closed for absent, cross-tenant, wrong-type, undeclared and malformed guards, and a writer pinned to a retired field.
- HTTP and CLI: `tests/cli/request_atomic_transaction.test.ts` spawns `neotoma request --operation correctTransaction`. Covers acceptance through MCP, stale refusal over HTTP and MCP, and rollback of MCP writers behind a guard.
- MCP transport: `tests/integration/correction_transaction_mcp_transport.test.ts` (`POST /mcp` `tools/call`). Covers writing only the writer, replay without growth, stale-guard rejection, refusal of a foreign guard, and rollback then replay. Added to the CI atomic lane.
- Replay eval: `atomic_correction_compare_only_guard` scenario, fixture and cassette.
- PR #2668 reports the pre-fix test failing on the old 1–50 validation and a guard-skipping mutation making the eval fail, so the tests can go red.

### Atomic schema metadata updates (data-mutating)

**Classification: covers user-observable behavior end-to-end (native SQLite).**

- `tests/services/schema_registry_atomic.test.ts` (8 cases). Covers preservation across repeated additions, no committed dual-active or zero-active interval, serialization of concurrent callers, exact-row activation despite a same-version inactive row, rollback on activation or deactivation failure with no effects, scope isolation, and effects after commit.
- `tests/services/schema_registry_incremental.test.ts` and the metadata-preservation test were updated for the transactional path.

### 404 "Go home" label contrast (UI)

**Classification: covered.** `playwright/tests/not-found.spec.ts` asserts label contrast in both themes and is wired into `test:e2e:graph-render`.

### Docs and advisory

Not code. Not applicable.

## Local execution on release head (`1e5205cb8`)

- `npm run type-check`: passed.
- Targeted suites (correction transaction service, schema registry atomic and incremental, CLI atomic request, MCP transport, `tests/contract/`, tenant isolation matrix): 403 passed, 1 failed.
  - Failure: `tests/contract/store_plan_mode_response_schema.test.ts` › reference unstructured (`source_storage:reference`) returned 400 locally. Neither the test nor the `/store` reference path changes in this range, and the CI test lanes pass on the same head. This is classified as a local-environment result, not a release regression.
- `npm run test:security:auth-matrix`: 18 passed, 1 skipped.
- `npm run openapi:bc-diff -- --base v0.27.0`: no breaking changes.

## Code review

`/review v0.27.0..HEAD`. Scope: 35 files. Surfaces: data layer (correction transaction, schema registry), API contract (`openapi.yaml`), MCP and CLI agent instructions, docs, tests, CI, frontend. High-risk: data-mutating ops (yes).

Checklist highlights:

- 1 OpenAPI edited and types regenerated: ✓
- 2 contract mappings: N/A (no new operationId)
- 3 contract tests: ✓ in CI; locally 1 environment failure, described above
- 5 MCP and CLI instruction parity: ✓ (both mention compare-only guards)
- 9 and 13 tightening hint obligation: ✓ not triggered. The new "expected_snapshot fields must be declared" check rejects only requests that already failed, because the reducer projects only declared fields into snapshots (`src/reducers/observation_reducer.ts:288`). The error code changes from `CONFLICT` to `VALIDATION_ERROR`; this is named under Behavior changes in the supplement.
- 10 bc-diff reconciled: ✓; the supplement says `No breaking changes.`
- 16 and 25 determinism: ✓. Participants and changes are sorted before hashing (`localeCompare`, unchanged behavior).
- 17 idempotency and transactional writes: ✓. Guards are included in the idempotency hash; schema mutation is now transactional.
- 20 security gates: ✓ (see `security_review.md`)
- 23 user-facing coverage: ✓ (see the surfaces above)

Findings:

```
[ADVISORY] error-handling
File: src/services/schema_registry.ts (register → withSchemaMutation)
Rule: driver.ts nested transaction() unsupported
Finding: register/updateSchemaIncremental/activate now open db.transaction(). A caller that invokes them inside another db.transaction() callback gets the "Nested transaction() is not supported" error. No current caller does this: ensureSchemaForExtractedEntity is reached only from interpretation.ts, which runs outside any transaction, and its register call is wrapped in a try that returns null.
Fix: follow-up. Add a guard test, or route nested callers through the open transaction.

[ADVISORY] silent-behavior
File: src/services/schema_registry.ts (register deactivate)
Rule: Explicit over implicit
Finding: a failure to deactivate the prior active schema now throws, where it used to log a warning. This is fail-closed and correct, and it is now listed in the supplement's Behavior changes.
Fix: none required.

[ADVISORY] test-coverage
File: tests/ (agent grants × guard type)
Rule: auth negative test
Finding: no test asserts capability_denied when an agent has `correct` on the writer's type but not on the guard's type. The enforcement is shared code over all participant types.
Fix: follow-up test.

[NIT] ci
File: .github/workflows (Remote integration nightly)
Finding: the nightly fails on main with "dist/ is missing" every night since at least 2026-11-02, before this range. It does not affect this release's code.
Fix: add a build step to the nightly workflow (separate issue).
```

```
--- Review Summary ---
Base..Head: v0.27.0..1e5205cb8
Files reviewed: 35
Blocking: 0
Advisory: 3
Nit: 1

Verdict: APPROVED-WITH-NOTES

Should address in follow-up:
- Nested-transaction guard test for schema mutations
- Agent-grant negative test for guard participant types
- Remote integration nightly build step
```
