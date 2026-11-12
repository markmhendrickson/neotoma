# Test coverage review — v0.28.0

Range: `v0.27.0..b5f59f795fac6fe68cc4e1d8444ea92933bff374` — 20 non-merge commits plus the merge of `origin/main` (`4667eac`) into `release/v0.28.0`; 101 files, +11556/−1131. Later release-branch commits change only files under `docs/releases/in_progress/v0.28.0/`. Test bodies were read for the named tests, not just file names. The supplement's Breaking changes section (reserved planning declaration shape) is covered below.

## Surfaces

### Exact-identity reads (new; HTTP, MCP, CLI, SDK; security-relevant)

**Classification: covers user-observable behavior end-to-end.**

- `tests/security/exact_identity_transport.test.ts`: two bearer users over REST `POST /entities/query`, MCP `retrieve_entities`, the generic CLI request (body and params forms) and the SDK clients. Covers owner isolation, forged body `user_id` refusal, malformed values, GET refusal, access-log and `console.warn` suppression, direct-SQLite returning `unproved`, and the worker-retirement case returning `unproved` on every transport.
- `tests/unit/services/bounded_identity_read.test.ts`: the pinned-view executor (candidate, history and fact caps, ambiguity, drift, converters).
- `tests/unit/db_worker_file_database.test.ts`: `withPinnedReadView` custody, SELECT-only guard, budget and retirement.
- Gaps (non-gating, filed): MCP log sinks, concurrent reads against a live pinned read. See the follow-up issues in `security_review.md`.

### Planning declarations and schema catalogs (new; schema writes, MCP, HTTP, CLI)

**Classification: covers user-observable behavior end-to-end.**

- `tests/services/schema_planning_declarations.test.ts`, `tests/integration/schema_planning_surface_parity.test.ts` (HTTP, MCP and built CLI `schemas update --planning` / `schemas list --summary`, declaration-only round trips and preservation), `tests/contract/schema_planning_registration_contract.test.ts` and the legacy payload `register_schema_invalid_planning` (the breaking change: `"planning": {"level": "high"}` now fails with `VALIDATION_INVALID_FORMAT` and the hint), `tests/unit/schema_incremental_metadata_preservation.test.ts`, `tests/security/schemas_per_type_scope_guard.test.ts`.

### Compare-only guards in `correctTransaction` (data-mutating; MCP, HTTP, CLI)

**Classification: covers user-observable behavior end-to-end.**

- `src/services/correction_transaction.test.ts`, `tests/cli/request_atomic_transaction.test.ts`, `tests/integration/correction_transaction_mcp_transport.test.ts`, `tests/integration/correct_http_mcp_parity.test.ts` (`entity_version`/`replayed` parity), and the `atomic_correction_compare_only_guard` replay eval with its fixture and cassette.
- Gap (non-gating, filed): no test asserts `capability_denied` when an agent holds `correct` on the writer's type but not the guard's type.

### Atomic schema metadata updates (data-mutating)

**Classification: covers user-observable behavior end-to-end (native SQLite).**

- `tests/services/schema_registry_atomic.test.ts`, `tests/services/schema_registry_incremental.test.ts`.

### Current-state reads and deep-offset paging (read paths; data-layer)

**Classification: covers user-observable behavior end-to-end, with two helpers covered only indirectly.**

- `tests/integration/current_state_reads.test.ts` (visibility from deciding rows, cutover and legacy modes, `/get_entity_snapshot` path, attached-authority checks), `tests/services/entity_population_certificate.test.ts`, `tests/integration/entity_read_contract.test.ts`, `tests/integration/entity_queries_deep_offset.test.ts`, and the `tests/performance/history_length_reads.bench.test.ts` benchmark (synthetic evidence; run by the CI contract lane with `RUN_BENCH=1`).
- Indirectly covered helper: `readCurrentEntityFragments` in `src/services/current_state_reads.ts` has no direct test; it is exercised only through the list, count and snapshot read suites above.
- Indirectly covered helper: `refusalDetail` in `src/cli/index.ts` has no direct unit test; it is exercised through its CLI effect in `tests/cli/relationships_create_refusal.test.ts`.

### Legacy MCP identifier lookup timing (diagnostic; opt-in)

**Classification: covered, with one negative gap.**

- `tests/integration/mcp_session_recover_in_place.test.ts` checks terminal timing against real response outcomes, including the slow and fast paths and the absence of the trace header on responses.
- Gap (non-gating, filed): no test sets the header name to a sensitive value such as `authorization` and asserts it is refused.

### DB reader-pool saturation warning (#2805, logging only)

**Classification: covered.** `tests/unit/db_worker_file_database.test.ts` exercises `summarizeQueuedStatements`.

### CLI setup and diagnostics

**Classification: covered.** `tests/cli/cli_doctor_setup.test.ts` and `tests/cli/cli_mcp_commands.test.ts` (transport summary built only from written entries, preset classification), `tests/unit/mcp_config_scan_user_paths.test.ts` (Claude Desktop label), `tests/cli/relationships_create_refusal.test.ts` (refusal code and message for single and batch writes).

### Packaged skills and instruction text

**Classification: covered at source and mirror level only.** `tests/cli/skills_mirror.test.ts`, `tests/unit/mcp_initialize_skills.test.ts`, `tests/unit/mcp_instruction_token_budget.test.ts`, `tests/unit/mcp_instructions_schema_scope_mismatch.test.ts`. These establish packaging and instruction content, not model adherence or live recovery behavior, as the supplement says.

### Frontend, docs site and CI

**Classification: covered by tests that this review did not run locally.**

- `frontend/src/components/MainApp.markdown-mirror.test.tsx` (localized legal Markdown routes), `playwright/tests/not-found.spec.ts` (404 label contrast, wired into `test:e2e:graph-render`), `tests/unit/bundled_docs_nav.test.ts`, `tests/unit/llms_txt_claims.test.ts`, `tests/unit/site_served_claims.test.ts`.
- The root Vitest configuration excludes `frontend/src/**` tests (the CI `frontend` job runs them), and Playwright specs need a browser lane. Neither was run here.

### Docs and advisory

Not code. Not applicable.

## Local execution (bound to head `b5f59f795fac6fe68cc4e1d8444ea92933bff374`)

- `npm run security:classify-diff`, `security:lint` (0 errors, 138 warnings), `security:manifest:check` (in sync, 126 routes) and `test:security:auth-matrix` (18 passed, 1 skipped): see `security_review.md`.
- Full root suite, `npx vitest run` after `npm run build:server` and building `packages/client`, `packages/agent` and `packages/cursor-hooks` as CI does: **8566 tests, 8511 passed, 18 failed, 34 skipped, 3 todo.** Run in a worktree of this head carrying only uncommitted edits under `docs/releases/in_progress/v0.28.0/`.
- The 18 failures are pre-existing, not new. Evidence: the same three files fail identically on a clean `v0.27.0` worktree (built and run the same way), and none of the three files, nor the code they exercise for these cases, is changed by this range for the failing assertions.
  - `tests/integration/entity_lifecycle_executor_program.test.ts`: 16 failures, all `environment_mismatch`. The executor refuses to run when a `.env*` file exists at the checkout root, and the worktree setup copies one in. 16 failed and 10 passed on both `v0.27.0` and this head. I could not remove that file to confirm the cause directly; the identical failures on `v0.27.0` are the evidence.
  - `tests/integration/mcp_entity_variations.test.ts` ("should filter by user_id: null") and `tests/integration/mcp_store_variations.test.ts` ("should store entities with optional user_id as null"): 1 failure each, identical on `v0.27.0`.
- Not run locally: the frontend Vitest suite, Playwright specs, agentic evals and replay scenarios, the Python SDK, the contract lane's benchmark, and the nightly remote integration job. CI results on the tested merge `6c523b79` (run 43173724960, all ten jobs) were reported in the approved preview and bind to that merge, not to this head; I did not verify CI on the current head.
- `/review v0.27.0..HEAD` (Step 3.6.0) was not run for this range. This file is a manual, test-body read, so the previous `/review` verdict, which covered 35 files at `1e5205cb8`, is withdrawn rather than carried forward.

## Verdict

**with-caveats.** No surface is classified BLOCKING: every substantive change has a test that exercises user-observable behavior, except the two indirectly covered helpers and the non-gating negative-test gaps filed as issues. Caveats: `/review` was not re-run, frontend and Playwright suites were not run locally, CI on the current head is unverified here, and 18 local failures are pre-existing and environmental or unrelated to this range. The operator should decide whether to require a `/review` pass and a CI check on the final head before execute.
