# Test coverage review — v0.29.0

Range: `v0.28.0..1f95f4d8566383d00034f98a501fe32cc30736d7` — 20 non-merge commits (including #2815 and its revert #2817, which cancel out) plus the merge of the v0.28.0 release branch; 132 files, +11447/−740. Release-branch commits on top change only the version, release docs, version lines, two operations and subsystem docs, the legacy-payload log headings and one README claim pattern in `tests/unit/llms_txt_claims.test.ts` (see `security_review.md`, Scope). For the named tests, the `describe`/`it` titles were checked against each claim below. The supplement's Breaking changes section (pattern limits, guest-link codes, OpenAPI diff entries) is covered below.

## Surfaces

### Guest-token checks on guest-readable routes (#2829; auth, HTTP)

**Classification: covers user-observable behavior end-to-end.**

- `tests/security/guest_token_entity_binding.test.ts`, for each policy mode: a token accepted only for its own entity, expired, over-age and revoked tokens refused, later records (corrections) that narrow but never extend a token, an unreadable record, deleted, merged and split token entities, an unparseable creation time, a storage error answered as a server error, a token sent as Bearer, the issue-submitter rule, owner resolution, and the stable `401`/`403` codes on every subscription and event route.
- `tests/security/guest_token_signed_identity.test.ts` (token alongside a signed identity), `tests/integration/guest_invalid_bearer_routes.test.ts` (an invalid Bearer gets `401 GUEST_TOKEN_INVALID` on guest-accepting routes and `AUTH_INVALID` on a route that does not accept guest tokens), `tests/integration/guest_subscription_owner_scope.test.ts` and `tests/integration/guest_token_isolation.test.ts` (updated expectations), `src/services/guest_access_token.test.ts`, `tests/unit/publish_rendered_page_description_parity.test.ts`.

### Share-link precedence under a closed type policy (#1952; auth, HTTP)

**Classification: covers user-observable behavior end-to-end.**

- `tests/integration/guest_token_precedence_over_type_policy.test.ts`: under a closed policy, a minted share URL returns the rendered page; a token for another entity, an expired, malformed or revoked token, and no credentials are refused; the JSON entity route opens only the named page; relationships, observations, merged and deleted entities, writes and issue routes keep their policy-governed paths. A dedicated step in the CI contract lane runs it, since `tests/integration` is outside `test:unit`. `src/services/access_policy.test.ts` covers the new hint text.

### Related-entity expansion for guest callers (#2833; auth, HTTP)

**Classification: covers user-observable behavior end-to-end.**

- `tests/security/guest_relationship_expansion.test.ts`, for each policy mode: a token-only guest sees no content of a linked entity the token does not cover (including under an open policy on the linked type), sees a covered related entity, does not see a covered entity that was deleted, and gets unexpanded entries for a merged related entity and for a token with no resolvable grant; submitter-scoped related issues follow their own read rule; the owner keeps full expansion; and at most the documented number of related entities is evaluated, in ascending id order.

### Admitted agents reading entity details (#2835; auth, HTTP)

**Classification: covers user-observable behavior end-to-end.**

- `tests/integration/aauth_admitted_entity_detail_read.test.ts`: a signed agent with an active grant reads `GET /entities/:id`, `/observations`, `/relationships` and `/html` as the grant owner; an admitted agent presenting a guest token is judged by the token; a signed agent with no matching grant is refused as a guest; an admitted agent cannot read another user's entity.

### Pattern limits in schema constraints (#2822, #2828; schema writes, store path, MCP, HTTP)

**Classification: covers user-observable behavior end-to-end.**

- `tests/security/schema_pattern_bounds.test.ts`: refused shapes, the length cap and refusal codes with a remedy, per-condition and per-schema count caps, the load-time syntax-only check, the rendered-page rule cap, subject and evaluation-time bounds, and field-constraint evaluation that fails closed on a stored pattern the rules refuse. #2828 extended the same file with counted-quantifier parsing tests.
- `tests/services/schema_stored_pattern_load.test.ts`: a stored schema holding a pattern the registration rules refuse still loads, conditional stores keep working with the pattern failing closed, `register_schema` (MCP and HTTP) and `update_schema_incremental` refuse such patterns, and store requests against stored patterns that run past the time limit.
- Legacy payloads `v0.28.x/register_schema_repeated_group_pattern` and `v0.28.x/register_schema_counted_quantifier_pattern` (replay passes), with entries in `tests/contract/legacy_payloads/CHANGES.md`.
- `src/services/rendered_page/publish_conformance_policy.test.ts`: rule count and budget on rendered-page conformance.

### Store completion and write ordering (#2824; data-mutating)

**Classification: covers user-observable behavior end-to-end.**

- `tests/contract/store_marker_unconfirmed.test.ts`: a normal store carries none of the new fields; a forced marker failure still succeeds, names the commit and offers one replay; with an interpretation the note promises no replay and a replay is refused.
- `tests/services/store_worker_backend_gate_contention.test.ts` (every store under gate contention on the worker backend returns success, a complete marker and a non-empty snapshot), `tests/unit/db_sqlite_gate_order.test.ts` (on SQLite, a write issued before a rolled-back transaction is not undone by it), `tests/unit/db_worker_file_database.test.ts`, and `tests/unit/store_write_completion.test.ts` for the response fragment.

### Substrate events (#2826)

**Classification: covers user-observable behavior end-to-end.** `tests/services/store_entity_created_emission.test.ts`: the helper emits `entity.created` for a new entity with no snapshot and `entity.updated` without `fields_changed` for an existing one; REST and MCP store emit one `entity.created` on a normal store and `entity.updated` when the snapshot computation fails for an existing entity; interpretation runs emit one `entity.created`, including when two rows resolve to the same new entity; a REST write to a merged-away id emits no entity event.

### Reader pool and gate (#2814, #2818; data layer)

**Classification: covered.** `tests/unit/db_worker_file_database.test.ts` (reads off the gate, retry gate wait, saturation diagnostics, retirement cap, terminate only after drain) and `tests/unit/reader_pool_midcall_timeout.test.ts` with `tests/helpers/reader_pool_midcall_timeout_child.ts` (child-process regression for repeated timeouts during large reads).

### Indexes (#2806, #2819; schema)

**Classification: covered.** `tests/unit/entities_user_type_index.test.ts` asserts query plans from the real builder SQL; `tests/integration/idempotency_key_lookup_index.test.ts` asserts `SEARCH USING INDEX` for both idempotency lookups.

### Deploy classification and test isolation (#2830, #2832, #2823, #2831; CI and test tooling)

**Classification: covered.** `tests/unit/classify_deploy_changes.test.ts`, `tests/unit/deploy_image_input_contract.test.ts`, `tests/contract/deploy_workflow_config.test.ts`, `tests/cli/cli_local_target_guard.test.ts`, `tests/cli/cli_local_target_coverage_guard.test.ts`, `tests/contract/git_env_isolation.test.ts`.

### Site illustrations and package metadata (#2820, #2825, #2827)

**Classification: not covered by new tests; static assets and metadata only.** The site export and frontend CI jobs passed on `1f95f4d85`.

### Docs

Not code. Not applicable, except for the Code review findings below.

## Local execution (worktree of `release/v0.29.0`, code at `1f95f4d85`)

- `npm run build:server` (includes `tsc`): passed. `npm run type-check`: passed. `npm run lint`: 0 errors, 338 warnings. `npm run validate:test-catalog`: up to date.
- `npm run openapi:bc-diff -- --base v0.28.0 --head HEAD`: five `removed-response-status` entries and four non-breaking additions; all five are named in the supplement's Breaking changes section (the `401` responses moved to a shared reference that the tool does not resolve).
- Security lane: see `security_review.md` (classifier `sensitive=true`; static rules 0 errors, 138 warnings; manifest in sync, 127 routes; auth matrix 18 passed, 1 skipped).
- Full root suite, `npx vitest run` after `npm run build:server` and building `packages/client`, `packages/agent` and `packages/cursor-hooks` as CI does: **9292 tests, 9237 passed, 18 failed, 34 skipped, 3 todo** (761 files: 754 passed, 3 failed, 4 skipped). Run against the local in-process test server only, with `NEOTOMA_ENV` and `NEOTOMA_FORCE_MODE` unset. The run overlapped the version-bump edits, so the tests those edits affect were re-run on the final head: `tests/unit/llms_txt_claims.test.ts`, the legacy-payload replay, `tests/unit/site_served_claims.test.ts`, `tests/unit/bundled_docs_nav.test.ts` and `tests/unit/docs_viewer_build.test.ts` (142 passed).
- The 18 failures are the same 18 recorded in the v0.28.0 review, where they also failed identically on a clean `v0.27.0` worktree:
  - `tests/integration/entity_lifecycle_executor_program.test.ts`: 16 failures, `environment_mismatch`. The executor refuses to run when a `.env*` file exists at the checkout root, and the worktree setup copies one in. That file was neither read nor removed.
  - `tests/integration/mcp_entity_variations.test.ts` ("should filter by user_id: null") and `tests/integration/mcp_store_variations.test.ts` ("should store entities with optional user_id as null"): 1 failure each (`EntityLifecycleAcquisitionError`).
  - Not re-run on `v0.28.0` for this review; none of the three files, nor the code they exercise for these cases, is changed by this range.
- CI: run 43536753035 on `main` at `1f95f4d85` passed all ten jobs (baseline, contract parity, security gates, frontend, site export, graph-render smoke, agentic evals, replay scenarios, combined evals, Python SDK). CI on the release-candidate head is the PR's own checks.
- Not run locally: the frontend Vitest suite, Playwright specs, agentic evals and replay scenarios, the Python SDK, the contract lane's benchmark and the nightly remote integration job. Those ran in CI on `1f95f4d85`.

## Code review

`/review v0.28.0..HEAD`, run by the release-prep agent over the full source diff (`src/`, `scripts/`, workflows, `openapi.yaml`, docs) and the test files named above. Findings use the skill's format; its middle tier is labelled NON-BLOCKING here.

```
[BLOCKING] doc-completeness — RESOLVED on the release branch
File: docs/operations/configuration.md (NEOTOMA_DB_STATEMENT_TIMEOUT_MS row)
Rule: Phase 5c, doc contradicts code
Finding: The row said a timed-out reader is terminated and respawns; since #2818 the caller is released, the reader is retired and shut down only after its statement returns. NEOTOMA_DB_MAX_RETIRED_WORKERS was undocumented and NEOTOMA_DB_ORPHAN_GRACE_MS had changed meaning.
Fix: Row rewritten; rows added for NEOTOMA_DB_MAX_RETIRED_WORKERS and NEOTOMA_DB_ORPHAN_GRACE_MS.

[BLOCKING] supplement-accuracy — RESOLVED in the supplement
File: docs/releases/in_progress/v0.29.0/github_release_supplement.md
Rule: Checklist 10, openapi:bc-diff entries named in Breaking changes
Finding: openapi:bc-diff reports five removed-response-status entries (401 on the subscription routes and /events/stream).
Fix: Named in Breaking changes with the explanation that each 401 moved to the shared GuestTokenInvalid reference and the only caller-visible change is the GUEST_TOKEN_INVALID code.

[NON-BLOCKING] doc-completeness — RESOLVED on the release branch
File: docs/subsystems/guest_access_policy.md
Rule: Phase 5c, subsystem doc silent on changed behavior
Finding: The policy-mode table read as the whole story for guest reads; it did not describe token precedence on the share-link routes, the token check on other routes, the expansion rule or admitted-agent entity reads.
Fix: Added a "Guest tokens" section.

[NON-BLOCKING] discoverability
File: docs/reference/error_codes.md
Rule: Phase 5c, error code registry
Finding: GUEST_TOKEN_INVALID and GUEST_TOKEN_SCOPE are registered in docs/subsystems/errors.md and openapi.yaml but not in docs/reference/error_codes.md.
Fix: Follow-up: add both codes with status, retry eligibility and causes.

[NON-BLOCKING] contract (tooling)
File: scripts/openapi_bc_diff.js:147
Rule: Checklist 10
Finding: collectResponseShape does not resolve a response-level $ref (components/responses), so moving an inline response to a shared one reports it as removed.
Fix: Follow-up: resolve response $ref before comparing status sets.

[NON-BLOCKING] silent-behavior / observability
File: src/repositories/sqlite/sqlite_client.ts (entities indexes)
Rule: Phase 5b
Finding: The two idempotency-key indexes log a start and end line when first built; the four new entities indexes are built silently at first start, which can delay writes on a large database with no log line.
Fix: Follow-up: build the entities indexes through createIndexLogged as well. The supplement states the one-time build.

[NIT] performance
File: src/actions.ts (relatedEntitiesReadableByGuest)
Rule: Phase 5
Finding: Up to 50 related entities are decided sequentially per guest request, each with several reads.
Fix: Bounded by GUEST_EXPANSION_MAX_RELATED_ENTITIES; no change needed for this release.
```

Checklist (Phase 4): 1 ✓ (types regenerated; CI sync step passed); 2 ✓ (`getEntityHtml` mapped); 3 ✓ (contract lane green); 4 — N/A (no new CLI command); 5 ✓ (MCP and CLI instruction text updated together); 6 — N/A; 7 ✓ (`NEOTOMA_DB_MAX_RETIRED_WORKERS` is `NEOTOMA_`-prefixed, read at pool construction); 8 ✓ (pattern refusals carry `hint` and `details.refusal`); 9 ✓ (two legacy fixtures and `CHANGES.md` entries); 10 ✓ (after the resolution above); 11 ✓ (replay passes); 12 — N/A (no new top-level request body); 13 ✓ (three optional store response fields declared and set on HTTP and MCP paths); 14 ✓; 15 ✓ (no per-type branches; `issue` submitter rule is pre-existing and moved into `checkGuestTokenForEntity`); 16 ✓ (expansion candidates sorted by id); 17 ✓ (unconfirmed marker keeps same-key replay idempotent); 18 ✓ (new log lines carry ids, codes and SQL text heads only; pattern logs omit the pattern); 19 — N/A; 20 ✓ (`security_review.md`); 21 ✓ (manifest regenerated, one added auth-required entry); 22 ✓ (no new proxy-header or socket-address reads); 23 ✓ (see Surfaces); 24 — N/A (no new npm script); 25 ✓.

Architecture (Phase 5): no strategy or orchestration added to the state layer; no new `switch (entity_type)`; no `UPDATE` on `observations` or `sources`; no new `Math.random()` or `Date.now()` in ID derivation. Portability: the deploy workflow and `.husky/pre-commit` changes contain no machine-specific paths.

```
--- Review Summary ---
Base..Head: v0.28.0..HEAD (code at 1f95f4d85)
Files reviewed: 132
Blocking: 2 (both resolved on the release branch)
Non-blocking: 4 (1 resolved; 3 follow-ups)
Nit: 1

Verdict: APPROVED-WITH-NOTES

Should address in follow-up:
- Register GUEST_TOKEN_INVALID and GUEST_TOKEN_SCOPE in docs/reference/error_codes.md
- Resolve response-level $ref in scripts/openapi_bc_diff.js
- Log the entities index builds at first start
```

## Verdict

**with-caveats.** No surface is classified BLOCKING after the two resolutions above: every substantive change has a test that exercises user-observable behavior, except the static site assets and package metadata. Caveats: frontend and Playwright suites were not run locally (they passed in CI on `1f95f4d85`), CI on the release-candidate head is reported by the PR's checks, and the 18 local failures are the pre-existing, environment-related set recorded in the v0.28.0 review.
