# Test coverage review — v0.20.0

`/release` Step 3.6, run against `v0.19.0..HEAD` (38 files, +3078/−154 lines).

## Code review

Ran the full `/review` checklist (Phases 1-6) directly against the diff rather than delegating to a subagent, since the release-preparation agent already had complete context on all 5 commits from Step 1-2.

**Scope:** 5 commits — keyset cursor pagination (#1943/#1946), `canonical_name_fields` schema re-key (#2018/#2020), CI npm-publish workflow (#2015/#2017), CI client-instance deploy workflow (#2012), capability-manifest regeneration (#2023). Surfaces: data layer (entity queries, SQLite index), API/contract (`openapi.yaml`, MCP tool defs, CLI), docs (MCP + CLI agent instructions, errors.md), CI/tooling. High-risk surfaces present: none (no destructive ops, no new auth logic, no new Express routes).

**Pre-PR checklist (`change_guardrails_rules.md`), items evaluated:**

1. ✓ `openapi.yaml` edited; fields match `src/tool_definitions.ts` / `src/shared/openapi_types.ts` (regenerated, no drift per `security:manifest:check` and prior `npm run openapi:generate` in the source commits).
2. — N/A. No new `operationId`, MCP tool, or CLI command — only new fields/flags on existing surfaces.
3. ✓ `npm test -- tests/contract/` — 160/160 passed.
4. — N/A. No new top-level CLI commands (only a new flag on existing `entities list` / `schemas update`). `cli_command_coverage_guard.test.ts` passes (1/1).
5. ✓ MCP ↔ CLI parity confirmed by reading both `docs/developer/mcp/instructions.md` and `docs/developer/cli_agent_instructions.md` diffs — both got the "Deep pagination" rule with cross-references to each other; `tool_definitions.ts` and CLI `--help` text both describe `canonical_name_fields`.
6. — N/A. No new runtime overrides / env vars.
7. — N/A.
8. ✓ New error codes (`CURSOR_OFFSET_CONFLICT`, `INVALID_CURSOR`, `ERR_CURSOR_COMBINATION`) all documented in `docs/subsystems/errors.md` with structured `hint` fields, not concatenated into `message`. Verified `firstIssueHint()` in `src/actions.ts` lifts `details.issues[].params.hint` to flat `details.hint`.
9. ✓ The `offset > 2000` tightening has a structured hint (verified: `entities_query_deep_offset.outcome.yaml` asserts `hint_match: "cursor"`) and a legacy-payload fixture (`tests/contract/legacy_payloads/v0.18.x/entities_query_deep_offset.*`), flipped to `rejected`. `CHANGES.md` updated.
10. ✓ `npm run openapi:bc-diff --base v0.19.0 --head HEAD` reviewed: 0 breaking, 14 additive fields. Reconciled in the supplement's Breaking changes section.
11. ✓ `tests/contract/legacy_payloads/replay.test.ts` — 15/15 passed.
12. — N/A. No new top-level request bodies.
13. ✓ New response fields (`next_cursor`, `canonical_name_fields`, `success`, `entity_type`, etc. on `update_schema_incremental`) declared in `openapi.yaml` and populated on all code paths (verified by reading `src/actions.ts`'s `runEntitiesQuery` and the `/update_schema_incremental` handler).
14. ✓ Supplement at `docs/releases/in_progress/v0.20.0/github_release_supplement.md`; no historical supplement under `docs/releases/completed/` touched.
15. ✓ Re-read `schema_agnostic_design_rules.md`. `determineChangeType`'s new `identity_rule_changed` branch and `updateSchemaIncremental`'s `canonical_name_fields` handling are both schema-driven (work identically for any `entity_type`), no per-type branch introduced.
16. ✓ Determinism: `entity_cursor.ts` encode/decode is pure content-based base64url JSON, no `Date.now()`/`Math.random()`. Keyset seek is `id > :cursor` / `id < :cursor`, a stable comparator.
17. — N/A. No new mutating/ingestion write path; `update_schema_incremental` already honored `idempotency_key` pre-release (unchanged).
18. ✓ No new PII in logs. `entity_cursor.ts` / `entity_query_limits.ts` have zero `console.*` calls; `CursorError.toErrorEnvelope()` returns only `{code, message, hint}` — no entity data.
19. — N/A. No file renames.
20. ✓ Security gates: `classify-diff` sensitive=true (file-identity trigger); `security:lint` 0 errors; `security:manifest:check` in sync (116 routes, unchanged); `test:security:auth-matrix` 18/18 passed. `security_review.md` filled with sign-off `yes`.
21. — N/A. Zero new Express routes registered (confirmed: no new `app.get`/`app.post` calls in the `src/actions.ts` diff).
22. ✓ No bare `req.socket.remoteAddress` / XFF / Host reads in this diff.
23. **User-facing-surface coverage** (the hard one) — see below.
24. — N/A. No new/renamed npm scripts.
25. ✓ No `Object.keys()`/`Map`/`Set` iteration without `sort()` introduced in any stored/returned/ID-input code path in this diff.

**Item 23 — user-facing-surface coverage, verified by reading test bodies, not just file names:**

- **New CLI flags (`--cursor` on `entities list`, `--canonical-name-fields` on `schemas update`):** `tests/cli/cli_cursor_offset_conflict.test.ts` and `tests/cli/cli_schema_commands.test.ts` invoke the actual CLI command and assert on user-observable output (exit behavior, `--json` error shape), not just a helper function. Verified by reading: the offset/cursor conflict test asserts the `CliHintError` with `code: "CURSOR_OFFSET_CONFLICT"` is thrown when both flags are supplied, matching the `getOptionValueSource("offset") === "cli"` detection logic read directly in `src/cli/index.ts`.
- **Cursor pagination (data-layer + API + MCP + CLI):** `tests/integration/entity_queries_cursor.test.ts` (703 lines) — read directly, confirms pages tile the full result set with no gaps/duplicates and match legacy offset paging on the same fixture data; `INVALID_CURSOR` is asserted over a real HTTP request and a real MCP client/transport pair (not a mocked error object).
- **`canonical_name_fields` re-key (schema-mutation surface — closest thing to "destructive" in this release):** Verified real round-trip coverage, not a helper-only test:
  - `tests/services/schema_registry_incremental.test.ts` drives `service.updateSchemaIncremental()` through the mocked-db harness end to end (not just the Zod schema), asserting on the exact payload handed to the DB `insert` call. Directly read the two edge-case tests that matter most: (a) `canonical_name_fields: []` on a schema without `identity_opt_out` is **rejected** (R2 invariant enforced via `validateSchemaDefinition`, confirmed by tracing `updateSchemaIncremental` → `register()` → `this.validateSchemaDefinition()` at line 909); (b) the same clear **succeeds** when `identity_opt_out` is present. Both directions tested, not just the happy path.
  - `tests/contract/update_schema_incremental_canonical_parity_2018.test.ts` — cross-surface parity (MCP tool schema, HTTP/OpenAPI schema, CLI flag) all accept/reject the same shapes.
  - `reducer_config` preservation across the re-key is asserted directly (`inserted.reducer_config.merge_policies.email` etc.), the specific safety property the commit message claims.
- **New SQLite index (`idx_observations_entity_id`):** Not a standalone migration test, but exercised indirectly by `tests/integration/entity_queries_cursor.test.ts` and the existing entity-query integration suite running against a real SQLite file (not an in-memory stub) — the index is `CREATE INDEX IF NOT EXISTS`, additive and idempotent, matching the existing `ensureSchema` pattern for every other index in that function.
- **New CI workflows (`npm-publish.yml`, `deploy-client-instance.yml`):** No automated test exercises these (workflow YAML isn't unit-testable in this repo's test harness). This is the one surface in the release with no automated coverage. Classified below.

## Surface coverage classification

| Surface | Classification | Note |
|---|---|---|
| Cursor pagination (REST/MCP/CLI) | Covers user-observable behavior end-to-end | `entity_queries_cursor.test.ts`, real HTTP + MCP transport |
| `--cursor`/`--offset` CLI conflict | Covers user-observable behavior end-to-end | `cli_cursor_offset_conflict.test.ts` |
| `canonical_name_fields` re-key (all 3 surfaces) | Covers user-observable behavior end-to-end | Service-level + contract + parity tests, both accept and reject paths |
| `offset` deprecation/bounding | Covers user-observable behavior end-to-end | Legacy-payload fixture + replay test |
| New SQLite index | Covered indirectly (integration suite runs against real SQLite) | No dedicated migration test, but additive/idempotent DDL — low risk |
| `npm-publish.yml` CI workflow | **No automated test** | See below |
| `deploy-client-instance.yml` CI workflow | **No automated test** | See below |

## BLOCKING findings

None.

## Non-blocking notes

- **CI workflow files have no automated test coverage.** This is inherent to the surface (GitHub Actions YAML isn't exercised by this repo's Vitest harness) rather than a gap the release introduced carelessly. Both workflows were manually reasoned through in the security review (secrets sourced only from `secrets.*` context, fail-closed/no-op guards, idempotent version-match check). Not a release blocker — this class of surface has never had automated coverage in this repo and deferring a CI-testing-framework decision to this release would be out of scope.
- **New SQLite index has no dedicated migration/idempotency test.** Low risk: it follows the exact `CREATE INDEX IF NOT EXISTS` pattern already used for every other index in `ensureSchema`, and is exercised indirectly by every integration test that touches entity queries. Not blocking.

## Verdict

**APPROVED.** Zero blocking findings. All user-facing surfaces (cursor pagination across REST/MCP/CLI, the `canonical_name_fields` re-key across all three surfaces including both the reject and accept paths of the R2 identity invariant, and the `offset` deprecation/tightening) have real end-to-end test coverage verified by reading test bodies, not just confirming file existence. `openapi:bc-diff` confirms zero breaking changes. Security review lane passed clean. The only uncovered surfaces (2 new CI workflow files) are outside this repo's test harness by nature, not a coverage gap introduced by insufficient care.
