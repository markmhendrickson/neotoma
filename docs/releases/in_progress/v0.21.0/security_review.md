# Security review — v0.21.0

Manual adversarial review. The diff classifier reports `sensitive=true` for this release (driven by a path-match on `src/actions.ts`), and three of its four notable changes touch security- or integrity-relevant surfaces (client-side auth-token handling, filesystem writes from graph-supplied data, and a data-clobbering bug in schema seeding), so this review checks the classifier's verdict rather than only recording it.

## Scope

- Base ref: `v0.20.0`
- Head ref: `HEAD`
- Diff classifier: `sensitive=true` (`npm run security:classify-diff -- --base v0.20.0 --head HEAD --json`). Single concern reported: `auth-middleware` matching `src/actions.ts`. This is a **path-match false positive for the auth-middleware heuristic**, not a genuine auth-path change — the only hunk added to `src/actions.ts` is a ~35-line boot-time hook (`seedSchemaRegistryIfEmpty()`) inserted into `startHTTPServer()`, alongside the file's existing per-service seeders (issue schema, plan schema, skill schema, subscription schema). It contains no route registration, no middleware, no `isLocalRequest`/`forwardedForValues`/`isProductionEnvironment` logic, and no `LOCAL_DEV_USER_ID` reference. Confirmed via `grep -n "seedSchemaRegistryIfEmpty" src/actions.ts`: both matches are the import and the call site inside the try/catch block, not inside any route handler or auth-decision function.
- Protected routes manifest: 116 routes, **unchanged** (`security:manifest:check` — in sync).
- `security:lint` (G2): 0 errors, 125 warnings — identical count to the pre-existing baseline (all on `src/actions.ts` unauth-route matches and `sandbox_mode.ts` `LOCAL_DEV_USER_ID` references that predate this diff); no new warnings introduced by the schema-seeding hunk.
- `openapi.yaml`: unchanged. No new MCP tools, no new Express routes.
- Changed files of security interest: `src/cli/instance_scripts.ts` (new — script attachment hash-pin + filesystem write), `src/cli/instance_skills.ts` (new — skill materialization + harness symlinking), `inspector/src/api/client.ts` + `inspector/src/lib/oauth_signin.ts` (OAuth token persistence/refresh), `.github/workflows/deploy-client-instance.yml` (deploy credential scoping), `src/services/schema_registry_bootstrap.ts` (new — boot-time schema seeding), `scripts/initialize-schemas.ts` + `src/seed_schemas_entry.ts` (rewritten seeding safety logic), `src/actions.ts` (boot-hook insertion only, see above).

## Adversarial review prompt

1. **Path traversal via graph-supplied filename.** Can a malicious or compromised skill row's `file_asset.original_filename` cause a write outside the intended scripts directory?
2. **Hash-pin bypass.** Can a script's bytes be written or executed-by-reference without its SHA-256 matching the value recorded on the graph, or can a rejected/blocked script be smuggled in via the approvals manifest?
3. **Consent-scope creep.** Can approving one script's hash implicitly approve a different script (key collision), or can a changed hash silently reuse a stale approval?
4. **OAuth refresh-token handling.** Is the refresh token ever logged, sent somewhere other than the token endpoint, or exposed to a wider storage/JS surface than the existing access token was?
5. **Refresh-token replay / exhaustion.** Since refresh tokens here are one-time-use, can concurrent requests from the same session cause a lost-update / self-inflicted logout?
6. **Dead or revoked refresh token.** Does a rejected refresh loop, or does it fail closed to a clean sign-in state?
7. **Deploy-token scoping.** Does the new client-instance deploy token widen access beyond the client app's own org, or leak into a workflow log?
8. **Schema-seeding data integrity.** Can boot-time or deploy-time schema seeding overwrite, deactivate, or silently revert an operator's deliberately-registered custom schema for an entity type?
9. **Schema-seeding concurrency / boot-safety.** Can a briefly-unavailable database or a race between concurrently-booting instances crash startup or leave the registry in an inconsistent state?
10. **`--force` blast radius.** Does the `--force` escape hatch on `initialize-schemas.ts` do anything beyond what its documentation states, or is it reachable from a non-explicit code path?

## Findings

1. **Path traversal is closed (concern 1).** `sanitizeScriptFilename()` (`src/cli/instance_scripts.ts`) rejects — never rewrites — any filename that is empty, contains a null byte, contains `\` (explicitly, since POSIX `basename()` does not treat backslash as a separator and would otherwise pass `..\\evil.py` through unmodified), contains `/`, or is `.`/`..`; it then re-checks `basename(filename) === filename` as defense-in-depth. An independent containment assertion (`resolve(outPath)` must stay under `resolve(scriptsDir)`) runs before every write as a backstop even if sanitization were weakened later. 7 traversal fixtures in `tests/cli/instance_scripts.test.ts` (`../` escape, absolute path, null byte, `.`/`..`, empty filename, backslash traversal, embedded separator) assert both refusal and that nothing is written outside the sandbox. Concern 1 closed.

2. **Hash verification is unconditional (concern 2).** `computeContentHash(bytes)` is compared against `attachment.content_hash` after download; a mismatch returns `hash_mismatch` and the function returns before any write — there is no `--approve-scripts` path that bypasses this check, since approval only pins a filename→hash pair as *trusted*, it does not substitute for the actual downloaded-bytes hash check. A rejected filename (`rejected_filename` outcome) is returned before hash checking or approval-key derivation, so a traversal attempt can never reach the approvals manifest. Concern 2 closed.

3. **No key-collision or stale-approval path (concern 3).** The approval key (`approvalKey(instanceHost, skillDirName, safeFilename)`) is derived from the *sanitized* filename plus the instance host and skill directory, not from any attacker-influenced free-text field beyond the filename itself (already sanitized). A changed hash for the same key is a distinct condition (`blocked_hash_changed`) surfaced with **both** the previously-approved hash and the new hash in the CLI output, requiring an explicit re-approval — it does not silently fall through to the old approval. Concern 3 closed.

4. **Refresh token storage matches existing access-token pattern (concern 4).** `setAuthSession()` persists the refresh token to the same scoped `localStorage` mechanism already used for the access token (`getScopedStorageKey`, unchanged from prior releases) — no new storage surface, no logging of the token value anywhere in the diff (`grep` of the diff hunks shows no `console.log`/`console.error` including token bundle contents). The refresh POST goes only to `${base}/mcp/oauth/token`, the same origin/endpoint already used for the initial code exchange. Concern 4 closed; risk profile is unchanged from the existing access-token-in-localStorage design (a pre-existing, accepted risk for this browser-based tool, not introduced here).

5. **Single-flight guard prevents refresh-token exhaustion (concern 5).** `ensureRefreshed()` coalesces concurrent callers onto one shared `refreshInFlight` promise; a burst of concurrent 401s (the stated motivating case — several home-screen calls firing at once) triggers exactly one `POST /mcp/oauth/token`, not one per caller. The retry path in `request<T>` also carries an `isRetry` guard preventing infinite retry loops on a persistent 401. Concern 5 closed. (Test: "concurrent-401 coalescing" in `token_refresh.test.ts`.)

6. **Dead refresh token fails closed (concern 6).** A non-OK response from the refresh endpoint calls `clearAuthToken()` (which now also clears the refresh token and expiry, not just the access token) and returns `false`; the caller's original 401 then surfaces as a normal auth error, presenting a clean sign-in rather than looping. (Test: "dead-refresh-clears-session".) Concern 6 closed.

7. **Deploy token is scoped, not logged (concern 7).** `.github/workflows/deploy-client-instance.yml` reads `CLIENT_INSTANCE_FLY_TOKEN` from repo secrets (never printed; GitHub Actions redacts secret values from logs by default) and falls back to `FLY_API_TOKEN` only when the client-scoped one is unset — the fallback is strictly narrower-or-equal in blast radius (same token already used for the sandbox), not an escalation. This is an operational/CI credential-scoping fix, not a new capability; it corrects an `unauthorized` failure, it does not grant new access. Concern 7 closed.

8. **Custom-schema clobbering is fixed, and was real (concern 8).** Read `src/services/schema_registry_bootstrap.ts`, `scripts/initialize-schemas.ts`, and `src/seed_schemas_entry.ts` in full. All three now call `loadGlobalSchema(entity_type)` (the ACTIVE global row) and skip outright — no `register()`, no `activate()`, no field merge — whenever a row exists, regardless of its `schema_version` string. The commit message documents the pre-fix behavior was verified end-to-end against a real SQLite DB (an active `contact` v99.0-operator-custom was deactivated and the built-in v1.1 reactivated by the old logic); I independently confirmed the new skip-if-active logic in all three files via direct code read (no `activate()` call reachable on any path where `loadGlobalSchema` returns non-null) and ran the regression suite myself (`tests/services/schema_registry_bootstrap.test.ts`, 5/5 passing, including "does NOT overwrite or deactivate a CUSTOM operator schema sharing the built-in's version string" and "preserves a custom schema that carries a DIFFERENT version string"). Concern 8 closed.

9. **Boot-safety and concurrency are handled (concern 9).** `seedSchemaRegistryIfEmpty()` is called inside a try/catch in `startHTTPServer()` (`src/actions.ts`); a thrown error is caught and logged as a warning, never rethrown, so a briefly-unavailable DB cannot fail boot. Concurrent registration races are caught by `isDuplicateRegistrationError()` matching `duplicate key` / `unique constraint` / `already exists` and recorded as `preserved`, not retried with an `activate()` call that could contend with whichever instance won the race. Verified via `tests/integration/seed_then_works_at_e2e.test.ts` (2/2 passing) exercising a real store-and-link path against a real SQLite DB, and `tests/services/deploy_seed_wiring.test.ts` (3/3 passing) asserting the deploy-command wiring itself. Concern 9 closed.

10. **`--force` is scoped to an explicit, non-automated CLI invocation (concern 10).** `--force` exists only in `scripts/initialize-schemas.ts` (a manually-invoked `tsx` script, not called from `startHTTPServer()`, `seed_schemas_entry.ts`, or any Fly `release_command`). It is read once from `process.argv` at the bottom of the file and threaded through as an explicit boolean parameter — no environment variable equivalent, no default-true path, and the doc comment above the flag states the hazard (`WARNING: this override the skip-if-present guard and will deactivate an operator-registered custom schema`). Concern 10 closed; the flag is a deliberate, documented, manually-invoked escape hatch, not a silent widening.

Additional checks:
- **G1 security:classify-diff:** `sensitive=true`, single concern `auth-middleware` on `src/actions.ts`. Investigated and confirmed a path-match false positive — see Scope section above.
- **G2 security:lint:** 0 errors, 125 warnings (pre-existing baseline; none newly introduced in changed lines — all warnings are on `src/actions.ts` unauth-route matches and `sandbox_mode.ts` `LOCAL_DEV_USER_ID` references that predate this diff).
- **G3 security:manifest:check + test:security:auth-matrix:** manifest in sync (116 routes, no change); auth matrix 18 passed / 1 skipped, unchanged from baseline.
- **Full targeted test run:** `tests/services/schema_registry_bootstrap.test.ts`, `tests/integration/seed_then_works_at_e2e.test.ts`, `tests/services/deploy_seed_wiring.test.ts` — 10/10 passing, run directly in this review (not just read).
- **`npm run type-check`:** clean. **`npm run format:check`:** clean. **`npm run validate:test-catalog`:** up to date.

## Suggested negative tests

Already covered by the diff's own test additions — no gap identified requiring a new negative test:
- Path traversal: 7 fixtures in `instance_scripts.test.ts` (see Finding 1).
- Hash mismatch with `--approve-scripts` present: asserted to still refuse (Finding 2).
- `--json` mode previously exited 0 on a hash mismatch/rejected filename; fixed and covered by `skills_sync_instance_cli.test.ts` (this was found and fixed within the PR's own commit history, not deferred).
- Custom-schema preservation at the same version string and at a different version string: both covered in `schema_registry_bootstrap.test.ts` (see Finding 8).
- Fresh-instance negative control (unseeded → no `works_at` edge, reproducing the original #1968 symptom) and positive (seeded → edge fires): both covered in `seed_then_works_at_e2e.test.ts` (see Finding 9).
- Deploy-config regression guard (the exact artifacts whose `release_command` silently disappeared in the original regression) covered in `deploy_seed_wiring.test.ts` (see Finding 9).

## Residual risks

- The instance-skills/instance-scripts materialization is opt-in (`--include-instance-skills` / `--include-instance-scripts`) and off by default; an operator who enables it is trusting the connected instance's graph content, consistent with the existing trust model for any MCP-connected instance. The hash-pin consent step is the intended control for the one add'l risk this introduces (arbitrary file content landing in `~/.neotoma/instance-skills/`), and it is enforced unconditionally (Finding 2).
- No script execution is introduced by this release — materialization only downloads, verifies, and writes files; the design note in the supplement is accurate (no eval/spawn of graph content).
- OAuth refresh tokens in browser `localStorage` remain vulnerable to XSS-driven exfiltration in principle, same as the access token was before this change; this diff does not change that risk boundary, it only prevents unnecessary re-authentication.
- The schema-seeding fix is additive/preserve-only by design; there is no residual clobbering path in the reviewed code. The one residual is operational, not code: an operator running `initialize-schemas.ts --force` deliberately opts into overwriting a custom schema, which is documented, intentional, and outside the automated deploy paths.

## Sign-off

| Reviewer | Verdict | Date |
|----------|---------|------|
| Phoenicurus (release-prep agent, manual adversarial pass) | yes | 2026-07-28 |

Verdict `yes` — path traversal closed with defense-in-depth, hash verification is unconditional, consent-scope changes are explicit and surfaced (not silent), OAuth refresh follows the existing storage pattern with a single-flight guard and fail-closed behavior on a dead token, the deploy-token change narrows/corrects scope rather than widening it, and the schema-seeding safety fix closes a real data-clobbering bug with all three seeding paths independently verified plus a passing regression suite (10/10, run directly, not just read). The `sensitive=true` classifier flip was investigated and confirmed to be a path-match false positive on a non-auth boot hook, not a genuine auth-surface change. No block.
