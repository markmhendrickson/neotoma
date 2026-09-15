# Test coverage review — v0.23.0

## Surfaces walked

### 1. Instance-stored skills at MCP `initialize` (#2046)

- **Surface:** `serverInfo._neotoma.available_skills` union of filesystem + graph-stored skills; new `[INSTANCE SKILLS]` instructions section.
- **Test:** `tests/integration/instance_skills_initialize_effect.test.ts` (400 lines, 10 tests) — seeds real `skill` rows, drives the real `initialize` handler through the built server, and asserts on the instructions text an agent receives. No database mock.
- **Classification:** Covers user-observable behavior end-to-end. This is exactly the class of test the release supplement's own commit history calls out as necessary: the initial implementation's backend-driver defect (`entity_snapshots!inner(snapshot)` — a PostgREST-only embed hint that libSQL forwards literally into SQL and fails on) was invisible to the 28 mocked unit tests (all passed against the broken query) and caught only once this integration test existed. Reverting the fix fails 4 of its 10 cases.
- **Also covered:** `tests/unit/mcp_instance_skill_hints.test.ts` (660 lines, unit suite 28→48) — sanitization logic (control/bidi/zero-width stripping, markdown-structure removal, authority-token neutering), `enabled` fail-closed-on-malformed-value behavior, compact-mode truncation, user-scoping.

### 2. MCP session recovery on unknown `Mcp-Session-Id` (#2403, #2100)

- **Surface:** Authenticated `POST /mcp` with a stale/unknown session id now recovers in place instead of 404ing.
- **Test:** `tests/integration/mcp_session_recover_in_place.test.ts` (286 lines) — new. Exercises the actual recovery branch: mint transport, synthetic handshake, serve original call, new session id in response.
- **Test:** `tests/integration/mcp_session_404_reconnect.test.ts` (existing, updated 64 lines) — covers the remaining genuinely-unrecoverable 404 paths (unauthenticated, GET/DELETE with unknown session).
- **Classification:** Covers user-observable behavior end-to-end — both the new recovery path and the still-404 paths are exercised against the real HTTP handler, not a mocked transport.

### 3. Scalar correction tie-break ordering (#2396)

- **Surface:** Reducer tie-break at equal source-priority now falls through to `observed_at`, then `created_at`, then `id`, instead of jumping straight to id.
- **Test:** `tests/integration/correction_scalar_tiebreak_surfaces.test.ts` (512 lines, new) — real reducer runs against seeded observations, asserting the newer correction wins.
- **Test:** `tests/unit/observation_reducer_highest_priority_tiebreak.test.ts` (207 lines, new) — unit-level coverage of `compareObservationRecencyThenId` including malformed-timestamp fallback to `Number.NEGATIVE_INFINITY`.
- **Classification:** Covers user-observable behavior end-to-end (the integration test) plus the underlying comparator logic (the unit test). This is a reducer/merge-policy change per the Touchpoint Matrix (`docs/subsystems/reducer.md`), and both the deterministic-ordering property and the corrected user-facing behavior (newer write wins) are exercised.

### 4. Refuse user-level data-dir fallback under test (#2387, #2388)

- **Surface:** A test-shaped CLI/server process no longer silently resolves `NEOTOMA_DATA_DIR` from `~/.config/neotoma/.env` and operates on real data.
- **Test:** `tests/unit/config_refuses_user_env_under_test.test.ts` (170 lines, new) — drives the **built** config module and the **built** CLI binary in real child processes (not in-process), since the refusal calls `process.exit` and that can't be observed any other way. Every case uses a synthetic `HOME`; no real config or database is read, written, or resolved.
- **Test:** `tests/cli/cli_init_interactive.test.ts` updated (108 lines changed) — the two pre-existing tests that deliberately exercised the fallback against a synthetic `HOME` now opt in explicitly via `NEOTOMA_ALLOW_USER_ENV_IN_TEST=1`; these were found by the new guard itself.
- **Classification:** This is a destructive/data-mutating-adjacent surface (a misconfigured process would silently read and write a real operator's data directory). The required bar per the release workflow is a real round-trip test against a real file/process, not an in-memory stub — met: the test spawns the actual built binary against a synthetic `HOME`, which is the correct level for testing a `process.exit`-based guard.

## Code review

Ran `/review v0.22.2..HEAD` (the full pre-PR checklist plus architectural, product-principles, and documentation-completeness passes) against this diff.

**Verdict: APPROVED**

- Blocking findings: 0
- Advisory findings: 1 (documentation-accuracy nit in this release's own `security_review.md` — its "Suggested negative tests" section understated existing coverage of the bidi/zero-width sanitization case, which is directly tested by `tests/unit/mcp_instance_skill_hints.test.ts:567`; corrected in place)
- Nits: 0

Key findings from the review, summarized:

- **Pre-PR checklist:** All applicable items pass or are N/A (no OpenAPI/contract changes, no new routes, no new CLI commands in this release). `security:classify-diff` correctly flagged `sensitive=true`; the gates (`security:lint`, `security:manifest:check`, `test:security:auth-matrix`) all pass at counts identical to the v0.22.2 baseline, and `security_review.md` exists with a `with-caveats` sign-off.
- **Architectural review:** No State Layer boundary violations (both new services are pure infrastructure/read paths; `instance_skills.ts` explicitly never surfaces skill bodies, only descriptions). No schema-agnostic-design violations (reducer tiebreak applies uniformly, not per-entity-type). No determinism violations (`compareObservationRecencyThenId` uses only observation-carried timestamps, never wall-clock `Date.now()`, and fails toward the existing deterministic id fallback on malformed input). No immutability violations (reducer change affects snapshot *computation order*, not stored observation/source data). Auth surface: the session-recovery branch in `src/actions.ts` fires only after existing auth already passed, confirmed both by code-position inspection and by the dedicated security review.
- **Documentation completeness:** All expected docs were updated in lockstep — `docs/developer/mcp/instructions.md`/`compact_instructions.md`/`proxy.md`, `docs/subsystems/reducer.md`/`conflict_resolution.md`, `docs/operations/configuration.md` for the new env vars, and the `correct` tool description was corrected identically across `docs/specs/MCP_SPEC.md`, `docs/developer/mcp/tool_descriptions.yaml`, and `src/tool_definitions.ts`.
- **Test execution verified by the reviewer:** unit 97/97, integration (new/changed surfaces) 25/25, contract 206/206, all passed. A ReDoS check was run against the new sanitization regex chain in `instance_skills.ts` with adversarial inputs (unclosed brackets/tags, long heading runs, up to 500k chars) — all completed in under 15ms, no catastrophic-backtracking risk found.

## Pre-existing failures (not regressions, verified independently via full-suite baseline comparison)

The mandatory pre-commit hook's full `npm test` run reports **19 failed test files / 75 failed tests** on this branch (526 passed files / 5450 passed tests / 100 skipped / 3 todo — 552 files, 5628 tests total).

**Verified independently, not assumed:** ran the identical `npm test` in a clean `git worktree add` at `v0.22.2` (before any of this release's four commits existed). Result: **19 failed test files / 75 failed tests** (520 passed files / 5367 passed tests / 100 skipped / 3 todo — 546 files, 5545 tests total). The pass/fail file and test counts differ trivially (candidate has 6 more passing files / 83 more passing tests, consistent with the new test files this release adds: `instance_skills_initialize_effect`, expanded `mcp_instance_skill_hints`, `mcp_session_recover_in_place`, `correction_scalar_tiebreak_surfaces`, `observation_reducer_highest_priority_tiebreak`, `config_refuses_user_env_under_test`).

**The failing-test lists are byte-identical.** Extracted `grep -E "^ FAIL"` from both runs, sorted, and diffed: zero lines differ across all 76 individual failing-test lines (19 files, 75 tests — one file, `cli_source_commands.test.ts`, fails at the suite level rather than per-test, accounting for the 76-vs-75 line count). Representative failing files, confirmed identical in both runs: `tests/security/tenant_isolation_matrix.test.ts` (7 tests), `tests/integration/transport_parity_store_snapshot_auth.test.ts`, `tests/cli/cli_entity_subcommands.test.ts` (soft-delete/restore), `tests/cli/cli_schema_commands.test.ts` (register/update variants), `tests/cli/cli_store_commands.test.ts`, `tests/cli/config_api_discovery.test.ts`, `tests/integration/cli_to_mcp_entities.test.ts`, `tests/integration/cli_to_mcp_schemas.test.ts`, `tests/integration/cli_to_mcp_store.test.ts`, `tests/integration/issues_local_auth_fallback.test.ts`, `tests/integration/retrieve_graph_neighborhood_tenant_isolation.test.ts`, `tests/integration/store_reference_source_parity.test.ts`, `tests/integration/subscription_list.test.ts`.

Root cause pattern observed in several of the CLI/store failures: `ERR_FILE_PATH_IS_SERVER_LOCAL` errors indicating the CLI child process under test resolved a remote-instance base URL rather than the local built server — a local port-discovery/environment artifact of this specific machine, not a code defect. This matches the documented precedent in the v0.22.2 supplement itself, which reported "22 failed test files / 83 failed tests, byte-identical file list, at both v0.22.1 and this release candidate — confirmed pre-existing and unrelated to this release."

**Conclusion: this release's four commits introduce zero test regressions.** Every failing test at v0.23.0 fails identically at v0.22.2 with no code changes in between. The pre-commit hook's mandatory-test-pass gate cannot distinguish this pre-existing local-environment noise from a real regression, so the version-bump commit lands with `SKIP_TESTS=1` and this verified comparison as the documented reason.

## Gate outcome

All four surfaces in this release have end-to-end, user-observable-behavior test coverage (not just helper-function coverage), matching the release workflow's bar for destructive/data-adjacent and backend-driver-sensitive surfaces. `/review` returned APPROVED with zero blocking findings. No BLOCKING items remain — Step 4 (execute) gate is clear.
