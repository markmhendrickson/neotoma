# Security Review — v0.21.4

**Range:** `v0.21.2..HEAD` (5 commits: `caa30f8c9`, `4aba1397c`, `88712d97d`, `9a21de393`, `d43bfc1c5`)
**Classifier verdict:** `sensitive=true`
**Sign-off:** `yes`

## Gate results

- **G1 `security:classify-diff`:** `sensitive=true`. Concerns flagged: `openapi-security` (`openapi.yaml`), `protected-routes-manifest` (`scripts/security/protected_routes_manifest.json`), `security-gates` (same manifest file), `auth-middleware` (`src/actions.ts`). Unlike the v0.21.2 review, this is not a file-identity false positive — `src/actions.ts` genuinely changed the Ed25519 bearer auth middleware and the `getAuthenticatedUserId` fail-closed tail. See "Alternate-path auth" below.
- **G2 `security:lint`:** 0 errors, 125 warnings across 397 files. All warnings are pre-existing baseline noise (`unauth-public-route` on routes correctly covered by `protected_routes_manifest.json` but not statically detectable by the linter's pattern match, plus 2 long-standing `local-dev-user-widening` warnings in `src/services/sandbox_mode.ts` unrelated to this diff). None introduced by this range.
- **G3 manifest + auth matrix:** `security:manifest:check` reports `protected_routes_manifest.json: in sync with openapi.yaml (118 routes)` — the two new `/.well-known/*` discovery routes were added and the manifest regenerated in the same change (`caa30f8c9`). `test:security:auth-matrix`: 18 passed / 1 skipped, unchanged from baseline.
- **G4 this file.**

## Adversarial review

### Alternate-path auth / isLocalRequest / proxy trust

The Ed25519 bearer path in the global auth middleware (`app.use(async (req, res, next) => { ... })` around line 4018) is directly rewritten by `d43bfc1c5`. Pre-fix, the middleware accepted a request as Ed25519-authenticated whenever `registered && isBearerTokenValid(bearerToken)` — and `ensurePublicKeyRegistered` **auto-registers any syntactically valid 32-byte token**, so `registered` means "well-formed," not "known." Signature verification was conditional: `if (signature && req.body)` — a request with no signature skipped verification entirely and was still treated as authenticated. `getAuthenticatedUserId`'s trailing fallback then trusted a caller-supplied `user_id` for any Bearer request, on the stated assumption that "token validation happens in middleware." That assumption was false for unsigned forged keys, so the caller's own claimed identity became the effective authorization.

Post-fix, the middleware condition is `registered && isBearerTokenValid(bearerToken) && registeredUserId && ed25519Signature` — all four must hold, and a missing signature now takes the reject branch (`sendError(403, "AUTH_INVALID")` is only reached with a *present but invalid* signature; a request with a *missing* signature falls through the `if` entirely to the session-token branch, which fails for a non-JWT token). `registeredUserId` is resolved via `getUserIdFromBearerToken`, which returns `undefined` for a bare auto-registered key that was never explicitly provisioned with a user, so an anonymous forged key cannot satisfy the condition regardless of signature. The principal is stamped via `stampUserPrincipal(req, registeredUserId)` — a fixed value from the registration record, not from any caller-supplied parameter. `getAuthenticatedUserId`'s tail no longer returns `providedUserId` under any circumstance; it throws `Not authenticated - no resolved principal for request` whenever no principal was stamped by the middleware. This is the correct fail-closed shape: authorization now depends exclusively on what the middleware verified, never on what the caller claims.

`isLocalRequest`, `forwardedForValues`, `isProductionEnvironment` are untouched by this range (`grep` confirms no diff hits in `src/actions.ts` for those symbols outside the two well-known-route registrations, which read `req.header("x-forwarded-proto")`/`x-forwarded-host` only to construct an informational `base` URL string for the discovery response body — not for any trust decision).

### Proxy trust / local-dev widening

No changes to `src/services/sandbox_mode.ts`, `src/services/local_auth.ts`, or `LOCAL_DEV_USER_ID` handling in this range (confirmed via `git diff v0.21.2..HEAD -- src/services/sandbox_mode.ts src/services/local_auth.ts`, which is empty). The two pre-existing `local-dev-user-widening` lint warnings are unchanged.

### Unauth public route / guest-access widening

Two new unauthenticated Express routes were added: `GET /.well-known/oauth-protected-resource/mcp` and `GET /.well-known/openid-configuration`. Both are RFC-mandated public bootstrap documents (RFC 9728 §3, RFC 8414-adjacent) that MUST be reachable without credentials by design — their entire purpose is telling an unauthenticated client where to obtain credentials. Both are registered in `openapi.yaml` with `security: []` and regenerated into `protected_routes_manifest.json` (118 routes, in sync per G3). This is a **narrowing** of an over-broad auth gate (removing a 401 that created a self-referential deadlock), not a widening of guest write/read access to user-owned data — neither route touches the entity/observation/relationship store.

The SQL-injection fix's 400 response (`handleApiError`'s new `InvalidSnapshotFieldError` branch) explicitly does **not** echo the caller-supplied field string back in the response body (only a generic constraint description), avoiding a reflected-input surface even though the input itself was already rejected.

### AAuth downgrade / session-portability entities

Not applicable — no session-portability or AAuth-tier code touched in this range.

### SQL injection / query construction (new category for this release)

`isValidSnapshotFieldName` (`src/services/entity_queries.ts`) is the source-level gate: a bare-identifier regex (`^[A-Za-z_][A-Za-z0-9_]*$` per the 400 response detail) applied to both `snapshot_filters` keys and `sort_by` fields before any SQL is constructed. `normalizeColumnName` (`src/repositories/sqlite/local_db_adapter.ts`) is the independent backstop inside the SQLite adapter itself — verified via the regression test to still correctly rewrite legitimate `snapshot->>field` projections into `json_extract(...)` while throwing on every tested injection shape (`CASE WHEN`, correlated subquery, comment-truncation, `DROP TABLE`, bare `1=1`, empty string, whitespace, unrecognized `->>` variant). Two independent layers were required because the vulnerability was precisely a single point of unvalidated string interpolation reaching SQL — a second caller that bypassed `entity_queries.ts` in the future would still be caught by the adapter-level check.

### Deployment-config changes (fly.toml family)

No `fly.*.toml` changes in this range beyond `fly.operator.toml`, which was reviewed and shipped in the prior (v0.21.3) cycle. Not re-reviewed here; no changes since.

## Suggested negative tests

- Covered by the two new regression suites (`ed25519_forged_key_auth_bypass.test.ts`, `sort_by_sql_injection.test.ts`), both verified by their authors to fail against the pre-fix code.
- Not added, flagged as a gap: an end-to-end HTTP-level test (real `fetch()` against a booted app, mirroring `wellknown_discovery_unauthenticated.test.ts`'s pattern) that sends an unsigned 32-byte Bearer token with an attacker-chosen `user_id` and asserts the actual HTTP response is 401/403, not just that the underlying function throws. The current `ed25519_forged_key_auth_bypass.test.ts` drives `getAuthenticatedUserId` directly with request stubs, which correctly isolates the fixed invariant but does not exercise the full middleware chain end to end. Residual risk: low — the middleware-level condition change (`registered && ... && registeredUserId && ed25519Signature`) is straightforward boolean logic with no additional indirection between it and the HTTP response, and `auth_topology_matrix.test.ts` (18/19 passing) already exercises the broader topology. Recommend adding the end-to-end variant in a follow-up, non-blocking for this release.

## Residual risk

- **GHSA-33x4-v5cf-2hfj and GHSA-8f95-jfm5-jjmr are not yet visible via the GitHub API under this agent's token** (`gh api repos/markmhendrickson/neotoma/security-advisories/<id>` returns 404 for both). This may be a token-scope limitation (`read:org` missing) rather than the advisories not existing — PR #2129's description states they were filed. This MUST be verified with an authenticated maintainer session before or immediately after the tag, and the GHSAs published per the release skill's Step 5.2 (advisory publication happens after the tag ships, never before). Flagging here so the gap is not silently missed at publish time.
- **End-to-end HTTP-level regression test for the Ed25519 bypass is not yet written** (see Suggested negative tests above). Non-blocking; the existing direct-function test plus the unaffected topology matrix provide adequate coverage for this release.
- Everything else in this range (OAuth discovery, homepage stats, fly.operator.toml) was already reviewed and shipped in the v0.21.3 preparation cycle; not re-litigated here.

## Verdict

**yes** — both vulnerabilities are fixed with fail-closed logic verified by regression tests that fail against the pre-fix code, the fix pattern is the correct one (never trust caller-supplied identity; validate query field names as identifiers at two independent layers), and no new privilege-widening surface was introduced. The two residual items above (GHSA visibility confirmation, end-to-end HTTP test) are tracked but do not block this release.
