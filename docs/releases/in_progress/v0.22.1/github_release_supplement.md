This release closes an authentication bypass on the MCP session-token path: a bearer token that matched no live OAuth connection could still authenticate as any user by presenting a forged, unsigned JWT naming that user's `user_id`.

## Highlights

- **Closes an MCP session-token authentication bypass.** `validateSessionToken` no longer falls back to decoding an unverified JWT and trusting its own claims when a bearer matches no live `mcp_oauth_connections` row — it now fails closed with `Invalid session token`, matching the fail-closed pattern already applied to the Ed25519 bearer path in `0.21.4`.

## Security hardening

This release is security-sensitive. `npm run security:classify-diff` reported `sensitive=false` for the raw diff heuristics, but the change is a direct fix for a confirmed authentication bypass and is treated as security-sensitive for release purposes.

- **Auth bypass on MCP session-token bearer resolution.** `src/services/mcp_auth.ts`'s `validateSessionToken` fell back to an unverified JWT decode (`decodeJWTUnverified`) when a bearer matched no live OAuth connection, trusting the token's own `sub`/`email` claims with no signature, issuer, or expiry check. A caller who presented `Bearer <base64url({alg:"none"})>.<base64url({sub:"<any user_id>"})>.x` was authenticated as that user — verified end-to-end pre-fix (200 from `/me` and `/entities`; 401 post-fix). `user_id` is derivable as `sha256(email)`, so a specific victim could be targeted directly.
  - **Fix:** the fallback is removed; an unresolved bearer now throws unconditionally. The now-unused `decodeJWTUnverified` helper was deleted.
  - **Regression class:** identical shape to the Ed25519 bearer path hardened in `0.21.4` (`docs/security/advisories/2026-08-07-ed25519-bearer-forged-key-auth-bypass.md`) — a bearer that fails to resolve to a live principal must be rejected, never mapped to caller-supplied claims.
  - **Gate:** new regression tests in `src/services/__tests__/mcp_oauth.test.ts` and `tests/services/mcp_auth.test.ts` assert forged `alg:none` JWTs (both a real victim's `user_id` and an arbitrary one) and non-JWT bearers are all rejected, while a legitimate live-connection token still authenticates correctly. `npm run test:security:auth-matrix` (G3b) passes clean (18/19, 1 skipped/pre-existing).
  - **Advisory:** `docs/security/advisories/2026-08-26-jwt-bearer-unverified-fallback-auth-bypass.md` (GHSA to be published after this tag ships, per release process).
  - **Operator action:** upgrade to `>= 0.22.1`. No data migration required. If your instance was reachable by untrusted callers prior to `0.22.1` with the MCP session-token path enabled, review authentication logs for bearer tokens with an `{alg:"none"}` or otherwise unverifiable JWT header shape.
- Full adversarial walkthrough: `docs/releases/in_progress/v0.22.1/security_review.md` (sign-off: `yes`).
- Deployed-probe report: `docs/releases/in_progress/v0.22.1/post_deploy_security_probes.md` (written after sandbox deployment in Step 5 of `/release`; not yet available during prepare).

## What changed for npm package users

**Runtime / data layer**

- `neotoma api start` and any MCP server instance now rejects session-token bearers that do not resolve to a live OAuth connection, instead of accepting a forged unverified JWT as a fallback. This affects only requests that were already exploiting the bug; legitimate OAuth-issued tokens are unaffected.

**Shipped artifacts**

- `src/shared/capability_manifest.json` regenerated to add the previously-missing `describe_instance_policy` entry (added in `v0.22.0`, present in source, absent from the committed manifest — pre-existing drift unrelated to the auth fix, fixed here so the capability-manifest gate passes).

## API surface & contracts

- No OpenAPI schema changes. `npm run openapi:bc-diff` against `v0.22.0` reports no breaking changes.
- No new or changed MCP tools.

## Behavior changes

- A bearer token that does not match a live `mcp_oauth_connections` row now always returns `Invalid session token` (401-equivalent at the MCP auth layer). Previously, a bearer shaped like an unsigned JWT could be accepted and impersonate the `sub` it named. Any caller depending on the old (vulnerable) fallback behavior — there is no legitimate use case for this — will now be rejected and must obtain a real OAuth-issued token.

## Internal changes

- Removed the unused `decodeJWTUnverified` helper and its now-dead `logger` import from `src/services/mcp_auth.ts`.
- Regenerated `src/shared/capability_manifest.json` to fix pre-existing drift (see above), unblocking the capability-manifest CI gate independently of the auth fix.
- Broadened the error-message assertion in `tests/services/mcp_auth.test.ts` from the old `"Invalid local session token"` wording to a tolerant regex covering both old and new (`"Invalid session token"`) wording, and added a forged-JWT rejection case.

## Fixes

- Fixed the MCP session-token authentication bypass described above (#2232).

## Tests and validation

- `src/services/__tests__/mcp_oauth.test.ts` and `tests/services/mcp_auth.test.ts`: 45/45 passed, including 3 new regression tests (forged victim JWT, forged arbitrary JWT, non-JWT bearer — all rejected; valid live token still accepted).
- `npm run test:security:auth-matrix` (G3b): 18 passed, 1 skipped (pre-existing), 0 failed.
- `npm run security:lint` (G2): 0 errors, 126 warnings (all pre-existing, unrelated to this diff — route-manifest and sandbox-mode patterns).
- `npm run security:manifest:check` (G3a): in sync (119 routes).
- `npm run openapi:bc-diff`: no breaking changes detected against `v0.22.0`.
- Full `/review` pass over `v0.22.0..HEAD`: see `docs/releases/in_progress/v0.22.1/test_coverage_review.md`.

## Breaking changes

No breaking changes.
