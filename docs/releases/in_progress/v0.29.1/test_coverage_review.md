# Test coverage review — v0.29.1

Range: `v0.29.0..dea3208bc915c5d59c5123ca81d6872a44c5fcb2` — 6 non-merge commits (#2837, #2838, #2839, #2840, #2841, #2842); 50 files, +5082/−212. Release-branch commits on top change only the version, release docs, the version lines in `README.md` and `docs/known_limitations.md`, and the regenerated test catalog (see `security_review.md`, Scope). For the named tests, the `describe`/`it` titles were checked against each claim below. The supplement's Breaking changes section (CLI credentials with a key configured, guest submit identifiers) is covered below.

## Surfaces

### Background timer (#2837)

**Classification: covers user-observable behavior end-to-end.** `tests/unit/auto_enhancement_processor_single_timer.test.ts`: opening and closing several MCP sessions leaves exactly one interval; the queue is polled once per tick however many sessions were opened; start is idempotent and stop clears the shared timer.

### Schema lookup cache and registry index (#2838; data layer, CLI `storage merge-db`)

**Classification: covers user-observable behavior end-to-end.**

- `tests/unit/schema_registry_cache.test.ts`: repeat lookups served from memory; register, activate, deactivate, incremental and metadata updates visible at once; `listActiveSchemas` refreshed after a write; user-scoped schemas kept to their user; returned values are copies; a write inside a transaction is not served before COMMIT and the committed value survives a ROLLBACK; each guard (counter-stamp re-read, generation guard at fill and before use, stamp guard at fill, unsettled-write and schema-mutation reads, per-handle buckets, a failed write, a moved counter, an unavailable counter) and the `off` setting. On a fresh database it checks that the resolve index is created and chosen by SQLite for every active-schema lookup, and that the triggers advance the counter on insert, update and delete.
- `tests/unit/db_sqlite_gate_order.test.ts`: transaction settle effects run after COMMIT and after ROLLBACK, before the next queued transaction, and keep the gate released when an effect throws.
- `tests/cli/cli_infra_commands.test.ts`: `storage merge-db` on two `ensureSchema`-initialised files merges in safe mode with the target's counter moving forward, and `--mode keep-source` never moves it backwards.
- `tests/services/schema_registry_incremental.test.ts` (updated).

### Corrections and snapshots (#2839; data-mutating)

**Classification: covers user-observable behavior end-to-end.** `tests/unit/snapshot_incremental_correction.test.ts`: the persisted snapshot equals a full rebuild after every correction over randomized histories; no full reduction runs inside the write transaction for a long history; full rebuild (then certification) when no record is held, when an observation was added without a rebuild, when another writer replaced the stored snapshot, when a stored observation is not older than the correction, for a `merge_array_by_key` field, for reserved fields, after a same-version schema change, and after cryptographic erasure of the user's observations. `tests/integration/correction_incremental_snapshot_lifecycle_cutover.test.ts`: the same equality after the lifecycle cutover.

### CLI credentials with an AAuth key (#2840; new CLI flag, auth)

**Classification: covers user-observable behavior end-to-end.**

- `tests/cli/cli_aauth_bearer.test.ts` spawns the CLI: key with an environment or stored bearer sends the signature only; `--with-bearer` sends both; `NEOTOMA_CLI_AAUTH_DISABLE=1` with a key refuses before sending, and with `--with-bearer` sends the bearer unsigned; with no key the bearer is unchanged.
- `tests/cli/cli_aauth_local_transport.test.ts`: the local API child receives the signature and no bearer; `--with-bearer` reaches the child; the disable variable refuses; with no key the bearer reaches the child unsigned.
- `tests/cli/cli_aauth_raw_fetch.test.ts`: `edit` (read and `batch_correct` write), `request --operation eventsStream`, `request --guest-access-token`, `auth status` and the `auth login` already-signed-in check, each with and without a key, `--with-bearer` and a disable variable.
- `tests/unit/api_client_aauth_bearer.test.ts`: the API client and `resolveCliRequestAuth` paths, the `NODE_ENV=test` rule, and a decision table for `decideCliCredentials` that checks over every input that a configured key never goes out beside a bearer unless requested, and that `keypairMatters` agrees with the decision. `tests/cli/api_client_offline_fallback.test.ts` and `src/services/issues/neotoma_client.test.ts` (updated).

### Guest issue submit (#2841; HTTP, previously accepted input now refused)

**Classification: covers user-observable behavior end-to-end.** `tests/security/guest_issue_submit_token_scope.test.ts` pins the exact refusal (status, code, hint and `details.extra`), the absence of a token in the body and of any write, for the storage owner's `github_number` and `local_issue_id` with no credential, `access_token` and Bearer; a synced issue's `github_number` with a fresh `local_issue_id`; a thread without its issue; another guest's identifiers; an exact repeat; and a repeated forwarded submit through `submitIssueToRemote`. It also checks that `submit_issue`'s own flow is accepted. `tests/security/guest_issue_submit_attribution.test.ts` pins which account a guest submit is stored under. No legacy payload flips: the outcome needs stored state, and `tests/contract/legacy_payloads/CHANGES.md` records that under `v0.29.1`.

### Guest reads of merged entities (#2842; auth, HTTP)

**Classification: covers user-observable behavior end-to-end.** `tests/security/guest_relationship_expansion.test.ts` and `tests/security/guest_token_signed_identity.test.ts`: across the policy modes, without a token and with a token that does not name it, a merged entity is answered as absent on every route and never as its merge target; a merged entity the token does not name gets the same `403` as a live one; the expansion bound counts uncovered candidates and expands only covered ones.

### Docs

Not code. Not applicable, except for the Code review findings below.

## Local execution (worktree of `release/v0.29.1`, code at `dea3208bc`)

- `npm run build:server` (includes `tsc`): passed. `npm run type-check`: passed. `npm run lint`: 0 errors, 339 warnings. `npm run validate:test-catalog`: failed on `dea3208bc` (see Code review), passes after regeneration on the release branch.
- `npm run openapi:bc-diff -- --base v0.29.0 --head HEAD`: no breaking changes detected. The two behavior changes the tool cannot see are named in the supplement's Breaking changes section.
- Security lane: see `security_review.md` (classifier `sensitive=true`; static rules 0 errors, 138 warnings; manifest in sync, 127 routes; auth matrix 18 passed, 1 skipped).
- Contract tests, `npx vitest run tests/contract/`: 30 files, 344 tests passed. Legacy payload replay and the README, site-claim and docs-build tests after the version bump (`tests/unit/llms_txt_claims.test.ts`, `tests/unit/site_served_claims.test.ts`, `tests/unit/bundled_docs_nav.test.ts`, `tests/unit/docs_viewer_build.test.ts`, `tests/contract/legacy_payloads/replay.test.ts`): 142 passed.
- The 17 test files named under Surfaces, run together: 436 of 437 passed. `tests/integration/correction_incremental_snapshot_lifecycle_cutover.test.ts` timed out under that parallel load and passed when run on its own.
- Full root suite, `npx vitest run` after `npm run build:server` and building `packages/client`, `packages/agent` and `packages/cursor-hooks` as CI does, on a fresh test database: **9522 tests, 9461 passed, 23 failed, 35 skipped, 3 todo** (771 files: 761 passed, 6 failed, 4 skipped). Run against the local in-process test server only, with `NEOTOMA_ENV` and `NEOTOMA_FORCE_MODE` unset. The failures:
  - `tests/integration/entity_lifecycle_executor_program.test.ts`: 16 failures, `environment_mismatch`, and `tests/integration/mcp_entity_variations.test.ts` ("should filter by user_id: null") and `tests/integration/mcp_store_variations.test.ts` ("should store entities with optional user_id as null"): 1 failure each. These are the 18 environment-related failures recorded in the v0.29.0 and v0.28.0 reviews; the executor refuses to run when a `.env*` file exists at the checkout root, and the worktree setup copies one in. That file was neither read nor removed.
  - `tests/integration/empty_registry_builtin_repair_e2e.test.ts`: 4 failures in its REST and CLI parity cases. They fail the same way on a clean `v0.29.0` build when the file is the first to run on a fresh test database, and pass when it runs on a database other tests have used. Not changed by this range.
  - `tests/cli/backup_verify.test.ts` (one case timed out at 60 s) and `tests/integration/correction_incremental_snapshot_lifecycle_cutover.test.ts` (setup failed after the lifecycle executor cases ran on the shared test database): both pass when run on their own.
- An earlier full run reused a local test database on which the lifecycle cutover was already recorded by previous runs; it reported 130 failures, almost all `EntityLifecycleAcquisitionError` in reducer and store tests. With a fresh test database those files pass (26 of them rerun together: 524 of 526 passed, the 2 failures being the MCP cases above). The local test database persists across runs under `.vitest/`; CI starts from a fresh one.
- CI on the release-candidate head is reported by the PR's own checks.
- Not run locally: the frontend Vitest suite, Playwright specs, agentic evals and replay scenarios, the Python SDK, the contract lane's benchmark and the nightly remote integration job.

## Code review

`/review v0.29.0..HEAD`, run by the release-prep agent over the full source diff (`src/`, `openapi.yaml`, `vitest.global_setup.ts`, docs) and the test files named above. Findings use the skill's format; its middle tier is labelled NON-BLOCKING here.

```
[BLOCKING] doc-completeness — RESOLVED on the release branch
File: docs/testing/automated_test_catalog.md
Rule: generated catalog in sync with the test tree (npm run validate:test-catalog)
Finding: On dea3208bc the catalog check fails: six test files added in this range (three under tests/unit, three under tests/cli) are not listed, and the summary counts are stale.
Fix: Regenerated with npm run generate:test-catalog; the check passes on the release branch.

[NON-BLOCKING] discoverability
File: docs/subsystems/errors.md, docs/reference/error_codes.md
Rule: Phase 5c, error code registry
Finding: ERR_ISSUE_IDENTITY_IN_USE is declared in openapi.yaml, docs/subsystems/issues.md and the issue-reporting site page, but not in either error code registry.
Fix: Follow-up: add the code with status 400, retry guidance (follow details.hint) and causes.

[NON-BLOCKING] doc-completeness
File: docs/subsystems/aauth_cli_attestation.md
Rule: Phase 5c, subsystem doc silent on changed behavior
Finding: The CLI credential rule (signature only with a key configured, --with-bearer, refusal under a disable variable) is documented in docs/developer/cli_reference.md and docs/developer/cli_agent_instructions.md, but the CLI AAuth subsystem doc does not mention it. Nothing there contradicts the new behavior.
Fix: Follow-up: add a short section that links the cli_reference entry.

[NIT] observability
File: src/services/snapshot_incremental.ts
Rule: Phase 5b
Finding: Which path a correction took (incremental or full rebuild, and the reason) is counted only in the in-process snapshotIncrementalStats object, with no log line or metric.
Fix: No change needed for this release; the result is the same snapshot either way.
```

Checklist (Phase 4): 1 ✓ (`openapi.yaml` edited and `src/shared/openapi_types.ts` regenerated for #2841); 2 — N/A (no new `operationId`, MCP tool or CLI command); 3 ✓ (`tests/contract/` passes, 30 files); 4 — N/A (no new top-level command; `--with-bearer` is a global flag); 5 ✓ (the credential rule is CLI-only and is stated in `cli_agent_instructions.md`; no MCP behavior changed); 6 ✓ (`--with-bearer` is deliberately flag-only, with no environment form, and is listed in the `cli_reference.md` global options); 7 ✓ (`NEOTOMA_SCHEMA_REGISTRY_CACHE` and `NEOTOMA_SCHEMA_REGISTRY_CACHE_CHECK_MS` are `NEOTOMA_`-prefixed server settings read at lookup time); 8 ✓ (`ERR_ISSUE_IDENTITY_IN_USE` carries `hint` and `details.extra`); 9 ✓ (#2841 refuses previously accepted input with a structured hint; no single-request fixture can express it, which `CHANGES.md` records under `v0.29.1`); 10 ✓ (`openapi:bc-diff` reports none; both behavior changes are named in Breaking changes); 11 ✓ (legacy payload replay passes); 12 — N/A; 13 — N/A (no new response field); 14 ✓; 15 ✓ (no per-type branches; the incremental path declines by merge strategy, not by entity type); 16 ✓ (the incremental snapshot equals a full rebuild, checked over randomized histories); 17 ✓ (#2841 runs before the store and keeps its idempotency key); 18 ✓ (new log lines carry no user data); 19 ✓ (new files are `snake_case`); 20 ✓ (`security_review.md`); 21 ✓ (no route added; manifest in sync); 22 ✓ (no new proxy-header or socket-address reads); 23 ✓ (see Surfaces; the new CLI flag is exercised by spawning the CLI); 24 — N/A (no new npm script); 25 ✓ (the certificate and cache maps are not iterated into stored or returned output).

Architecture (Phase 5): no strategy or orchestration added to the state layer; no new `switch (entity_type)`; no `UPDATE` on `observations` or `sources` (the correction path skips a redundant snapshot build, and the erasure path's existing in-place update is unchanged); no new `Math.random()` or `Date.now()` in ID derivation (`Date.now()` in the schema cache times counter re-reads only).

```
--- Review Summary ---
Base..Head: v0.29.0..HEAD (code at dea3208bc)
Files reviewed: 50
Blocking: 1 (resolved on the release branch)
Non-blocking: 2 (follow-ups)
Nit: 1

Verdict: APPROVED-WITH-NOTES

Should address in follow-up:
- Register ERR_ISSUE_IDENTITY_IN_USE in docs/subsystems/errors.md and docs/reference/error_codes.md
- Describe the CLI credential rule in docs/subsystems/aauth_cli_attestation.md
```

## Verdict

**with-caveats.** No surface is classified BLOCKING after the resolution above: every substantive change has a test that exercises user-observable behavior. Caveats: frontend and Playwright suites were not run locally, CI on the release-candidate head is reported by the PR's checks, and the local full-suite failures are the pre-existing, environment-related set plus three files that pass on their own or fail identically on `v0.29.0`.
