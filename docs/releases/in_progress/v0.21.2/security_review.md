# Security Review — v0.21.2

**Range:** `v0.21.0..HEAD` (7 commits)
**Classifier verdict:** `sensitive=true` (flagged by `src/actions.ts` change under the `auth-middleware` concern id — see note below)
**Sign-off:** `yes`

## Gate results

- **G1 `security:classify-diff`:** `sensitive=true`. Flag reason: `src/actions.ts` is in the concern's file allowlist (`auth-middleware — Express auth middleware and isLocalRequest helper, the v0.11.1 bypass surface`). The classifier flags on file identity, not diff content, so any touch to `src/actions.ts` trips this regardless of what changed. See "Alternate-path auth" below for the actual diff review.
- **G2 `security:lint`:** 0 errors, 125 warnings across 397 files. All warnings are pre-existing baseline noise (`unauth-public-route` on routes that are correctly covered by `protected_routes_manifest.json` but not statically detectable as such by the linter's pattern match, plus 2 long-standing `local-dev-user-widening` warnings in `src/services/sandbox_mode.ts` that predate this range). None introduced by this diff.
- **G3 manifest + auth matrix:** `security:manifest:check` reports `protected_routes_manifest.json: in sync with openapi.yaml (116 routes)` — no drift, no route added or removed this release. `test:security:auth-matrix`: 18 passed / 1 skipped, matching the v0.21.1 baseline exactly.
- **G4 this file.**

## Adversarial review

### Alternate-path auth / isLocalRequest / proxy trust

The only change to `src/actions.ts` in this range is (a) a call to seed the new `agent_session`/`session_transcript` schemas at boot, inside the existing seeding try/catch block, and (b) `beforeExit`/`exit`/signal-handler diagnostics registered at the very end of the file, gated behind the existing `isMainModule` autostart guard. Neither touches `isLocalRequest`, `forwardedForValues`, `isProductionEnvironment`, route registration, or any auth/session-resolution code path. `grep` for `isLocalRequest`, `getAuthenticatedUserId`, `req.socket.remoteAddress`, `X-Forwarded-For` against the diff returns no hits outside pre-existing usage. No regression class.

### Proxy trust / local-dev widening

No changes to `src/services/sandbox_mode.ts`, `src/services/local_auth.ts`, or `LOCAL_DEV_USER_ID` handling in this range. The two `local-dev-user-widening` lint warnings are pre-existing and unchanged by this diff (confirmed via `git diff v0.21.0..HEAD -- src/services/sandbox_mode.ts`, which shows no changes).

### Unauth public route / guest-access widening

`security:manifest:check` confirms `protected_routes_manifest.json` is in sync with `openapi.yaml` at 116 routes — this release adds zero new Express routes, so there is no new unauth-route surface to review. The `update_schema_incremental` metadata-preservation fix changes what `guest_access_policy` value survives a schema update; the fix is preserve-only (defaults to carrying forward the prior policy instead of resetting it to `{}`), which *tightens* effective guest-access enforcement rather than widening it — the pre-fix behavior was the actual widening bug (#1977), silently downgrading a type to the `closed` default. No new guest-write or guest-read path is introduced.

### AAuth downgrade / session-portability entities

`agent_session` and `session_transcript` are new boot-seeded entity types (`src/services/sessions/seed_schema.ts`), following the same seeder pattern as `issue`/`plan`/`skill`. Both are seeded with standard canonical-name-field dedupe (`(harness, native_session_id)` and `content_hash` respectively) and no elevated or bypassed access-control declaration — they resolve through the same `getAuthenticatedUserId`-scoped store/retrieve paths as every other entity type. No new anonymous-write surface: `--import-transcripts --apply` is a CLI-driven, user-authenticated flow, not a new unauth HTTP route.

### Deployment-config changes (fly.toml)

`[[http_service.checks]]` and `[[restart]] policy = 'always'` are Fly platform configuration, not application code — they affect machine restart/routing behavior on the hosted deployment only. `policy = 'always'` restarts on every process exit including signals; this does not create a DoS amplification path (Fly rate-limits restarts internally) and does not change what code runs or what it's authorized to do. No auth-relevant surface.

## Suggested negative tests

- None required for this release. No new route, no new auth code path, no widened guest-access default. The existing `auth_topology_matrix.test.ts` (18/18 passing) already covers the topology surface this release could plausibly have touched and did not.

## Residual risk

- **#2094 (recurring clean exit) root cause is still unknown.** This release ships two independent mitigations (`policy = 'always'` restart, `beforeExit` diagnostics) but not a fix. Residual risk is operational (availability), not a security vulnerability — mitigated to a ~2.3s worst-case cold start per the commit's verification, down from 33-45s.
- **#1977 remaining scope** (`register_schema` parity, response-visible `access_policy`/`warnings[]`, cross-surface parity tests) is explicitly not closed by this release; tracked in #2069. Anyone relying on those unshipped guarantees should wait for #2069.

## Verdict

**yes** — no security-sensitive application-code path was touched by this range. The `sensitive=true` classifier result is a file-identity false positive (any edit to `src/actions.ts`, however unrelated, trips the `auth-middleware` concern); the actual diff content is boot-time schema seeding and process-exit diagnostics. All quantitative gates (G2 lint, G3 manifest + auth matrix) pass clean against baseline.
