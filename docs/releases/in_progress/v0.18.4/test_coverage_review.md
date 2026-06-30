# Test coverage review — v0.18.4

## Scope

Five external-evaluator fixes merged since v0.18.3: #1838 (source_priority escalation warning), #1839 (null-cleared-field warning), #1840 (dedup snapshot response), #1841 (observation_source enum parity + docs), #1842 (local issue-create auth fallback).

## Code review

Each fix was implemented against a confirmed root cause (reproduced with a failing test before fixing where behavior was in question), kept minimal, and reviewed against its scoped plan.

## Surface coverage

### `src/services/source_priority_warning.ts` + `src/actions.ts` + `src/server.ts` — SOURCE_PRIORITY_ESCALATION (#1838)
- `tests/unit/source_priority_ignored_warning.test.ts` — unit coverage of `buildSourcePriorityEscalationWarning` (fires on default-100 write to a `highest_priority` field; null otherwise).
- `tests/integration/store_source_priority_ignored_warning.test.ts` — escalation warning asserted on **both** the MCP (`src/server.ts`) and HTTP (`src/actions.ts`) store paths.
- Docs: `docs/subsystems/conflict_resolution.md` gains the default-100 footgun subsection.

### `src/services/null_cleared_field_warning.ts` + store paths — NULL_CLEARED_FIELD (#1839)
- `tests/unit/null_cleared_field_warning.test.ts` (9 cases) — warning helper.
- `tests/integration/store_null_cleared_field_warning.test.ts` — warning fires only when a winning `null` actually clears a prior non-null value. The helper requires the recomputed snapshot to be cleared, so the MCP path (which strips typed `null` to `raw_fragments` and retains the prior value) does not false-fire.

### `src/server.ts` — dedup snapshot response (#1840)
- `tests/integration/store_dedup_snapshot_after.test.ts` — stores an identical observation twice (shared content-derived idempotency key); asserts the 2nd response carries `deduplicated: true` and an `entity_snapshot_after` equal to `getEntitySnapshot`, with observation count staying at 1. Fails on the pre-fix tree, passes after.
- Regression: `fixture_mcp_store_replay` (34 tests) re-run green.

### `src/cli/index.ts` + `src/shared/action_schemas.ts` — observation_source enum (#1841)
- `tests/unit/cli_observation_source_flag.test.ts` (10 cases) — CLI accepts `sync`; invalid value's error includes the `data_source` migration hint.
- `contract_mcp_cli_parity.test.ts` re-run green (CLI↔API enum now aligned).
- Docs: CLI reference + onboarding migration subsection + this supplement's Breaking changes section.

### `src/actions.ts` — local issue-create auth fallback (#1842)
- `tests/integration/issues_local_auth_fallback.test.ts` (4 cases) — local POST `/issues/submit` with no auth creates an issue; **a remote request (untrusted XFF) with no Bearer still returns 401 AUTH_REQUIRED**; route allow-list unit coverage.
- `tests/integration/guest_invalid_bearer_routes.test.ts` re-run green (no regression on remote-auth rejection).
- Full `security_gates` (`security:lint` 0 errors incl. `local-dev-user-widening`, `security:manifest:check` in sync, `test:security:auth-matrix` 18 passed / 1 skipped) green.

## Surfaces that do NOT apply to this release

- No OpenAPI route/schema changes (enum was already declared; response additions are additive). No `openapi.yaml` regeneration required.
- No Inspector/frontend changes.
- No new env vars.
- No plugin/hook/SDK package changes.

## CI

All five PRs passed the `security_gates` and `baseline` (test-catalog validation) lanes before merge. `docs/testing/automated_test_catalog.md` regenerated and in sync.

## Verdict

**Sufficient.** Each fix has unit and/or integration coverage asserting both the new behavior and the absence of regression in the adjacent behavior (especially the #1842 remote-auth negative test and the #1839 no-false-warning guard). No coverage gaps block the release.
