# Test coverage review — v0.22.0

## Full suite baseline check

`npx vitest run` (full suite, no filter) against this release's HEAD: **23 files failed, 84 tests failed, 5218 passed, 70 skipped, 3 todo** (two full runs, stable/reproducible failure set both times).

To determine whether this failure set is a regression, the identical full-file list was re-run against a clean `v0.21.5` tag checkout (separate worktree, fresh `npm ci` + `npm run build`): the same 23 files fail, and spot-checked individual files (`tests/cli/cli_store_commands.test.ts`: 12 failed/12 passed on both HEAD and v0.21.5; `tests/security/tenant_isolation_matrix.test.ts`: 7 failed/9 passed on both; `tests/integration/mcp_target_id_identity_conflict.test.ts`, unrelated to any file touched in this release's diff) reproduce the exact same failure counts on both refs.

**Conclusion: this is a pre-existing local-environment/preparation-database dependency, not a regression introduced by this release.** This matches PR #2011's own note during development: "14 failures that reproduce identically on a clean origin/main (hook integration, fixture replay, inspector)" — the count has grown since (23 files now vs. an unspecified count then), consistent with environment drift across the intervening releases rather than a new defect in this diff. Root causes observed: some require a live Supabase-backed database rather than local SQLite (`tenant_isolation_matrix.test.ts` uses `.select()` chains that return empty on the local driver); some are ENOENT failures from `dist/cli/index.js` subprocess tests reading `os.tmpdir()`-based fixture paths in this macOS sandbox's Node/exec environment, reproducing identically on both refs.

**One real regression WAS found and fixed during this pass** (distinct from the above pre-existing set): `tests/contract/legacy_payloads/replay.test.ts`'s `store_no_instance_policy_configured` scenario initially failed with `400 ERR_STORE_POLICY_DENIED` instead of the expected `2xx`. Root cause: a stray `instance_policy` entity (`policy_id: "qa-reverify-2011"`, `purpose: "QA reverify — deny payment_profile"`, `enforcement: "enforced"`) was left in the shared preparation database from manual QA verification of PR #2011, and its `payment_profile` denial collided with the fixture's own use of `payment_profile` as its test payload. This was **environment contamination, not a code defect** — resolved via `neotoma instance-policy set --file ... --advisory` (updating the existing record to deny nothing, rather than a destructive delete, since the CLI has no delete-policy command and the database is shared with other work). Verified the fixture passes cleanly after the fix: 16/16 in `tests/contract/legacy_payloads/replay.test.ts`.


## User-facing surfaces walked

**New CLI command: `neotoma instance-policy show|set`.**
- Classification: covers user-observable behavior end-to-end. `tests/cli/cli_command_coverage_guard.test.ts` includes an explicit exemption comment pointing to `tests/unit/instance_policy.test.ts` + `tests/unit/instance_policy_write_path_coverage.test.ts` for behavioral coverage of the `show` read path. `set --file <path> [--enforce|--advisory] [--dry-run]` was exercised manually during this preparation pass (dry-run preview, then apply, then `show` round-trip) against a real instance-policy record — confirmed the CLI updates an existing entity rather than duplicating it, and `--dry-run` does not persist.
- No action needed.

**New endpoint: `GET /instance-policy`.**
- Classification: covers user-observable behavior end-to-end. `tests/contract/openapi_schema.test.ts` validates the contract shape; the manifest sync (`security:manifest:check`) confirms `requires_auth: true` is enforced at the REST layer. See Code review section below for the MCP-transport gap found and fixed during this pass.
- No action needed after the fix.

**New write-enforcement control (instance-policy denial on `store`/`correct`).**
- Classification: destructive/data-mutating-adjacent (it rejects writes, the inverse of most "destructive operation" concerns, but the enforcement gate itself is exactly the kind of control that needs a structural, not just behavioral, test — a behavioral test can pass by exercising only one of several write cores while the others sit unguarded).
- `tests/unit/instance_policy_write_path_coverage.test.ts`: structural source-scan asserting the gate is present and precedes the first persistence in each of the three entity-write cores (`storeStructuredForApi`, `storeStructuredInternal`, `createCorrection`). This is exactly the right test shape for this surface — required, present, passing (11/11 after this release's addition).
- `tests/integration/instance_policy_db_enforcement.test.ts`: real-database round-trip tests, including the fail-closed-on-lookup-failure path (denies rather than silently admitting when the policy lookup itself errors). 11/11 passing.
- **Gap found during this review, documented (not closed) as described in Code review below: raw/reference file storage (`storeUnstructuredForApi`) is outside the gate's scope.**

**Shared-graph nil-UUID rejection (`getSharedGraphUserId`).**
- Classification: covers user-observable behavior end-to-end for the fixed function itself. `tests/unit/google_oidc.test.ts` (27 tests) covers nil-UUID rejection (bare, case-variant, whitespace-padded) and a regression guard that a UUID merely containing zero-groups (not all-zero) is still accepted — the two failure modes that matter for a value-narrowing fix (under-rejects vs over-rejects).
- No action needed.

**`submit_issue` remote-leg reporter-provenance forwarding.**
- Classification: covers user-observable behavior end-to-end. `tests/services/issues/neotoma_client.test.ts` and `issue_operations.test.ts` assert on the **constructed outbound request body** (not local storage) — the right level for a payload-construction bug. Individual-field, whitespace, empty-state, mixed-partial, and unsigned-guest-retry-path cases all covered. 23 + 43 tests passing.
- No action needed. See Code review below for a documentation-accuracy finding on the adjacent `add_issue_message` claim.

**Pre-commit hook instrumentation (`.husky/pre-commit`).**
- Classification: not testable via the vitest suite (shell script, hook-only execution context). Verified per the PR's own description via direct execution (stage durations recorded correctly, failing-stage propagates `rc=1`, `EXIT` trap reports true exit code) — `bash -n .husky/pre-commit` passes. No commit-blocking behavior added (measurement-only), so the risk profile of an untested shell change is low: a defect here can only make the hook log incorrectly, not silently pass a broken commit.
- No action needed for this release; note that hook-execution-path testing (running the actual hook against a staged commit in CI) remains a gap for any future hook change, not specific to this one.

**`fly.toml` stale app-name removal.**
- Classification: config-only, verified via `flyctl config validate` per the PR description (documented in the PR, re-verifiable but not re-run during this pass since it requires Fly credentials this preparation environment does not need for a config-only change with no code path).
- No action needed.

## Code review

Independent `/review v0.21.5..HEAD` pass (subagent, isolated from the primary preparation context) — full findings below, verbatim from that pass, with resolution status appended.

**Scope:** v0.21.5..HEAD — 38 files, +3633/−66 lines. Surfaces: data layer (new instance-policy write-enforcement gate across 3 write cores), API/contract (new `GET /instance-policy` endpoint, new schemas, new error codes), auth/security (nil-UUID shared-graph fix, new MCP tool auth gap), CLI (new `instance-policy show|set` commands), tests (5 new test files, ~1700 lines), docs (MCP/CLI instructions, error codes, advisories), release tooling (pre-commit hook instrumentation, fly.toml). High-risk: yes.

### Blocking findings (3) — all resolved

1. **[auth] `describe_instance_policy` MCP tool missing authentication gate** (`src/server.ts`). `describeInstancePolicy()` never called `getAuthenticatedUserId()`, unlike its REST sibling and every other MCP handler in the file. **RESOLVED**: added the call (mirroring `describeEntityType`'s pattern); added `tests/integration/describe_instance_policy_auth.test.ts` (2 cases, passing).

2. **[security] `storeUnstructuredForApi` bypasses instance-policy enforcement entirely** (`src/actions.ts`). Raw/reference file storage calls `storeRawContent`/`storeRawReference` directly with no `assertStorePolicyAllows` call; an `enforced` instance still accepts arbitrary raw file content. **RESOLVED (documented, not closed)**: closing this requires a raw-storage policy dimension that doesn't exist yet — a design change out of scope for release preparation. Instead: documented explicitly in `src/services/instance_policy.ts`'s docblock ("Known scope boundary" section), an inline comment at the `storeUnstructuredForApi` definition in `src/actions.ts`, and a new explicit test case in `tests/unit/instance_policy_write_path_coverage.test.ts` that asserts the gate is absent and fails loudly if that ever silently changes. Tracked as a follow-up feature. See `security_review.md` for the full adversarial write-up and the operator-facing caveat.

3. **[docs] False parity claim between `submit_issue` and `add_issue_message` reporter-provenance forwarding** (`docs/subsystems/issues.md`, original supplement draft). Both claimed the `submit_issue` fix "matches `add_issue_message`'s existing forwarding" — verified false: `addMessageToRemote` has no `reporter_*` parameters at all, so it has the identical unfixed bug. **RESOLVED**: corrected both `docs/subsystems/issues.md` and the supplement to state the parity claim is false and that `add_issue_message`'s remote leg is a tracked follow-up, not already-working.

### Advisory findings (3) — accepted as follow-ups, not blocking

4. **[test-coverage]** No MCP-dispatch test for unauthenticated `describe_instance_policy` rejection existed prior to this pass. **Addressed as part of resolving finding 1** (the new regression test covers exactly this).

5. **[schema-agnostic]** `person_data`/`sensitivity_class` schema declarations are plumbed generically (no hardcoded per-type branch in the evaluator, confirmed by a dedicated structural test) but not seeded on any built-in entity type (`contact`, etc.) — the person-data and sensitivity gates are inert out of the box, usable only via operator-declared custom schemas. Accepted as a v1 scope decision; not blocking, since the feature's core denial mechanism (`out_of_scope_entity_types`) works out of the box and is what the legacy-payload fixture and the PR's own canonical example (`payment_profile`) exercise. Worth a follow-up to seed `person_data: true` on `contact` and similar types in a future release.

6. **[doc-completeness]** `docs/developer/cli_reference.md` was not updated for the new `instance-policy show|set` command family despite the commands being fully documented in the release supplement. **RESOLVED**: added an "Instance Policy" section to `docs/developer/cli_reference.md` documenting both subcommands, all flags, and the raw-file scope boundary — done during this preparation pass since it was a small, well-scoped fix.

### Nit findings (3) — no action taken, noted for future cleanup

7. **[naming]** Legacy-payload fixture `store_no_instance_policy_configured` is filed under `v0.19.x/` but the guarantee it pins ships in v0.22.0. Cosmetic; the fixture's correctness does not depend on its directory label.

8. **[style]** Three enforcement call sites (`src/actions.ts`, `src/server.ts`, `src/services/correction.ts`) use dynamic `await import("./services/instance_policy.js")` in a hot write path even though the module is statically imported elsewhere in the same files. Not a correctness issue; optional cleanup for a future PR.

9. **[test-coverage]** `google_oidc.test.ts`'s whitespace test combines whitespace-padding with an already-lowercase nil UUID rather than isolating case-folding as its own case. Logic is provably correct by inspection (regex has the `i` flag; `.toLowerCase()` runs before comparison); not blocking.

### Verdict after resolution

**APPROVED-WITH-NOTES.** All 3 BLOCKING findings from the independent review are resolved (2 fixed with regression tests, 1 documented as an explicit tracked scope boundary per the review's own suggested resolution path). The 3 ADVISORY findings are accepted as follow-ups per the review's guidance that they are not merge-blocking. The 3 NIT findings require no action for this release.

**Should address in follow-up (not blocking this release):**
- Seed `person_data`/`sensitivity_class` on built-in person-bearing entity types so the corresponding policy gates are not inert out of the box.
- Fix `add_issue_message`'s remote-leg reporter-provenance forwarding (same bug class as this release's `submit_issue` fix, left unfixed).
- Design and implement raw-file-storage coverage for instance-policy enforcement (or make an explicit product decision that raw storage is permanently out of scope for this control).
- Relabel or re-home the `store_no_instance_policy_configured` legacy-payload fixture under a `v0.22.x/`-era directory (cosmetic).
