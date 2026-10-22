## Summary

This release adds instance-level data policy — an instance can now declare what kinds of data it is for and enforce that server-side on every write — fixes a security bug where a misconfigured shared-graph binding silently collapsed every signed-in user onto the anonymous identity, and fixes two smaller correctness bugs (remote issue-report provenance fields, a stale Fly app name that could silently retarget a manual deploy).

## What changed for npm package users

**New CLI command: `neotoma instance-policy`.**

- `neotoma instance-policy show` — prints the instance's configured data policy, or reports that none is configured.
- `neotoma instance-policy set --file <path>` — creates or updates the policy from a JSON file. Flags: `--enforce` (set enforcement to `enforced`, rejecting violating writes), `--advisory` (set enforcement to `advisory`, declare only), `--dry-run` (show what would be written without writing it). `--enforce` and `--advisory` are mutually exclusive.

No other CLI-surface changes.

## API surface & contracts

**New endpoint: `GET /instance-policy`**, added to `openapi.yaml` with generated types, a `contract_mappings.ts` row, an MCP tool, and a security-manifest entry (`requires_auth: true`). Writes to the policy go through the existing `store`/`correct` entity path (the policy is an `instance_policy` entity, following the precedent already used for `standing_rule`), not a dedicated write endpoint. This is additive — no existing endpoint, field, or MCP tool changed shape.

`npm run openapi:bc-diff` against `v0.21.5`: **no breaking changes detected**; one non-breaking addition (`added-operation GET /instance-policy`). Reconciled against this supplement — the only surface change is the new read endpoint.

## Behavior changes

**Instance data policy (declared + enforced).** An instance can now declare which entity types and sensitivity classes it is willing to hold, and that declaration is both advertised to connecting agents (via client instructions at connect time) and enforced server-side on every structured `store`/`correct` call (an `entities` array), on all three of those write paths (REST, CLI, and MCP — the MCP core bypasses the shared write helper and required a separate enforcement point, now covered). **Raw/reference file storage (uploads with no `entities` array) is not covered by this enforcement** — see Security hardening below.

This is **not a breaking change**. An instance with no policy configured behaves exactly as before. A configured policy defaults to `enforcement: "advisory"` (declare only, do not reject); an operator must explicitly set `--enforce` to have violating writes rejected. No release flips this default. A legacy-payload fixture (`tests/contract/legacy_payloads/`) pins the current default behavior — storing a `payment_profile` (the canonical "should be denied under enforcement" example) still succeeds by default.

When enforcement does reject a write, nothing partially persists — the whole request is rejected and every violating entity is enumerated in the response, so one round trip surfaces all problems. The denial response never echoes back any fragment of the rejected payload — only schema-declared field names and configured policy values.

**Shared-graph binding no longer accepts the nil UUID.** `NEOTOMA_SHARED_GRAPH_USER_ID` previously accepted any syntactically valid UUID, including `00000000-0000-0000-0000-000000000000` — the conventional "no user" / anonymous sentinel. An instance configured with the nil UUID bound every signed-in user to that same anonymous identity: a user who completed sign-in correctly was told by their agent that they were anonymous, and every per-user mechanism (notably standing-rule injection) silently resolved to the nil principal instead of that user's own configuration. This is now rejected and falls back to isolated per-email behavior, the same as an already-malformed value. A warning logs once per sign-in when the variable is set but rejected, so the failure mode is diagnosable instead of presenting as an empty team graph.

**`submit_issue` remote path now forwards reporter provenance fields.** `reporter_git_sha`, `reporter_app_version`, `reporter_git_ref`, `reporter_channel`, and `reporter_ci_run_id` were accepted and validated locally but silently dropped when `submit_issue` forwarded the request to a remote Neotoma instance, causing every remote submission with those fields present to be rejected with `ERR_REPORTER_ENVIRONMENT_REQUIRED`. The remote leg now forwards all five fields. No contract change — these fields were already part of the validated `submit_issue` request shape.

**Known follow-up, not fixed in this release:** `add_issue_message`'s remote leg (`addMessageToRemote`) has the identical gap — its params carry no `reporter_*` fields, so reporter provenance on public-thread messages is silently dropped on that remote hop the same way `submit_issue` was before this fix. An earlier draft of this supplement and `docs/subsystems/issues.md` incorrectly claimed this fix already "matches `add_issue_message`'s existing forwarding" — that claim was verified false during release preparation and corrected in both places. Tracked as a follow-up issue, not addressed here.

## Docs site & CI / tooling

- `fly.toml` no longer declares `app = 'neotoma-sandbox'`. The public sandbox has never deployed from this file (it uses the self-contained `fly.sandbox.toml`), and no automated workflow references `fly.toml` — the stale declaration only affected manual deploys, where it silently retargeted the sandbox app on any `flyctl deploy -c fly.toml` invocation that omitted `--app`. A manual deploy without an explicit `--app` now fails loudly instead of silently succeeding against the wrong app.
- Pre-commit hook now records per-stage timing and a bypass ledger. Every stage runs through a `timed_stage` wrapper that logs wall-clock duration and exit code (including on failure, via an `EXIT` trap), and `SKIP_TESTS=1` / `NEOTOMA_SKIP_TESTS=1` bypasses now append an auditable ledger line (with an optional, never-required `SKIP_TESTS_REASON`). No stage was removed, no new threshold blocks a commit — this is measurement only, logged to a gitignored `.git/neotoma-hook-timings.log` by default. Answers "is the hook getting slower, and how often is it skipped" with data instead of transcript archaeology.
- `docs/security/advisories/README.md`: the three previously-`(draft)` advisory rows (GHSA-qp63-9r52-4q25, GHSA-33x4-v5cf-2hfj, GHSA-8f95-jfm5-jjmr) are now linked to their published GHSAs. Docs-only; no disclosure impact (all three were already public).
- `docs/testing/automated_test_catalog.md` regenerated.

## Internal changes

`src/services/instance_policy.ts` is new (739 lines) — the policy evaluator, config CRUD, and enforcement gate shared by all three write cores. Which entity types are person-data, and which fields are sensitivity-classed, comes from new `person_data` / `sensitivity_class` schema declarations (`schema_registry.ts` / `schema_definitions.ts`), not a per-type branch in the evaluator — a structural test (`tests/unit/instance_policy.test.ts`) asserts no `entityType === "…"` branch exists.

A structural regression test, `tests/unit/instance_policy_write_path_coverage.test.ts`, asserts that every entity write path calls the enforcement gate and that the gate runs *before* the first persistence in each core (source row, observations, or raw insert). This test caught a real ordering bug during development — the gate initially ran after `storeRawContent`, which would have left an orphaned `sources` row behind for a request whose response said "rejected, 0 persisted." The same file also encodes the raw-file scope exception (see Security hardening below) as an explicit, asserted case rather than a silent gap.

Enforcement is instance-wide, not per-user: one policy governs every write regardless of caller, since the question being asked is "may this instance hold this kind of data," not "may this caller write this." The read path takes no caller-supplied identifier, so no request can address another instance's scope; `tests/security/tenant_isolation_matrix.test.ts` gained rows asserting this.

## Fixes

- **Shared-graph binding silently collapses to the anonymous identity when configured with the nil UUID** (#2130): `NEOTOMA_SHARED_GRAPH_USER_ID` accepted `00000000-0000-0000-0000-000000000000` as a valid binding target. Now rejected and treated the same as a malformed value, with a once-per-sign-in warning log. See Behavior changes above.
- **`submit_issue` reporter-provenance fields dropped on the remote leg** (#2014): five reporter fields validated and stored locally were never copied into the outbound remote request body, causing spurious `ERR_REPORTER_ENVIRONMENT_REQUIRED` rejections on every remote submission that supplied them. See Behavior changes above.
- **Stale `app` declaration in `fly.toml` could silently retarget a manual sandbox deploy** (no issue filed; found during deploy-path review): removed the declaration so a manual `flyctl deploy -c fly.toml` without `--app` fails explicitly instead of deploying to the wrong Fly app. See Docs site & CI / tooling above.

## Tests and validation

- Instance data policy: 39 tests (31 in `tests/unit/instance_policy.test.ts`, 11 in `tests/integration/instance_policy_db_enforcement.test.ts`, 11 in `tests/unit/instance_policy_write_path_coverage.test.ts`, including the auth-gap regression test and the raw-file scope-boundary test added during this release's preparation). Tenant-isolation matrix: 18 passing, including 2 new rows. Legacy-payload replay (16/16, after clearing a stray QA policy record found in the shared preparation database — see below), contract tests (`tests/contract/openapi_schema.test.ts`), CLI coverage guard, security-manifest `--check`, type-check, and lint all clean.
- Shared-graph nil-UUID fix: 27 tests passing in `tests/unit/google_oidc.test.ts` (replaced the pre-existing test that used the nil UUID as its "valid" fixture, added nil-rejection coverage for bare/case/whitespace variants, and a regression guard that a UUID merely containing zero *groups* — not all-zero — is still accepted).
- `submit_issue` provenance fix: new tests in `src/services/issues/neotoma_client.test.ts` (primary repro, each of the 5 fields individually, whitespace-only handling, empty-state, mixed-partial forwarding, and the unsigned-guest retry path) and `src/services/issues/issue_operations.test.ts` (threading assertion). All 180 tests in `src/services/issues/` pass.
- `npm run openapi:bc-diff` against `v0.21.5`: additive-only (`/instance-policy` new).
- `npm run security:classify-diff`: full analysis and gate results recorded in `security_review.md`.
- `/review v0.21.5..HEAD`: findings recorded in `test_coverage_review.md`.
- Full suite (`npx vitest run`, no filter): 5218 passing, 23 files / 84 tests failing. Verified against a clean `v0.21.5` baseline checkout: the identical 23 files fail with the same counts on both refs — pre-existing local-environment dependency (Supabase-only test paths on local SQLite; `os.tmpdir()`-subprocess interaction in this sandbox), not a regression from this release. Full analysis in `test_coverage_review.md`.
- A stray QA-verification `instance_policy` record (left in the shared preparation database from PR #2011's manual QA, `enforcement: "enforced"` denying `payment_profile`) initially broke the `store_no_instance_policy_configured` legacy-payload fixture; this was environment contamination, not a code defect, and was cleared via `neotoma instance-policy set --advisory` during this preparation pass. See `test_coverage_review.md`.

## Security hardening

Classified `sensitive=true` by `npm run security:classify-diff` (OpenAPI security blocks, protected-routes manifest, and `src/actions.ts` auth-middleware file touched). Full adversarial review in [`docs/releases/in_progress/v0.22.0/security_review.md`](./security_review.md), covering the shared-graph nil-UUID fix and the new instance-policy write-enforcement surface. `security:lint`: 0 errors (126 warnings, +1 heuristic false-positive over the v0.21.5 baseline of 125 — the new `/instance-policy` route pattern-matches a generic "unauth route" rule despite carrying `requires_auth: true` in the manifest). `security:manifest:check`: in sync (119 routes). `test:security:auth-matrix`: 18 passed, 1 skipped.

An independent `/review` pass during preparation (Step 3.6) found and this pass resolved two real gaps beyond the standard adversarial checklist:

- **Fixed:** the `describe_instance_policy` MCP tool was missing the authentication check its REST sibling (`GET /instance-policy`) already had — an unauthenticated MCP session could read the instance's configured policy. Fixed by adding the same `getAuthenticatedUserId()` gate every other MCP tool handler uses, with a new regression test (`tests/integration/describe_instance_policy_auth.test.ts`).
- **Documented, not fixed:** raw/reference file storage (`storeUnstructuredForApi`) is not covered by instance-policy enforcement — an instance configured with `enforcement: "enforced"` still accepts arbitrary raw file uploads with zero policy evaluation. Closing this needs a new raw-storage policy dimension, out of scope for this release; it is now explicitly documented as a known, tracked scope boundary (code docblocks + an explicit test asserting the gap, so it cannot silently change) rather than a silent omission. **Operators relying on `enforcement: "enforced"` to fully gate what an instance holds should know this does not cover file uploads today.**

Sign-off: **with-caveats** (see `security_review.md` for the full reasoning).

## Breaking changes

No breaking changes. Instance data policy is opt-in and defaults to advisory-only enforcement when configured, and behaves exactly as before when not configured. The shared-graph nil-UUID fix changes behavior only for instances that were misconfigured with the nil UUID as their binding target — see the Deployment note in the PR (#2142) about migrating affected instances before upgrading.
