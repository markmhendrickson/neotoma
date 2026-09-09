# MCP session token validation trusted an unverified JWT's own claims (v0.22.1 fix)

- **Date disclosed:** 2026-08-26
- **GHSA:** _draft; publish after tag per release process_
- **CVE:** _not requested_
- **Severity:** High — a remote caller could authenticate as any user without a valid session.
- **Affected:** all versions carrying this fallback in `validateSessionToken` prior to `0.22.1`.
- **Fixed in:** `0.22.1`
- **Reporter:** internal security review.
- **CWEs:** [CWE-287](https://cwe.mitre.org/data/definitions/287.html) (Improper Authentication), [CWE-347](https://cwe.mitre.org/data/definitions/347.html) (Improper Verification of Cryptographic Signature).

## Summary

`validateSessionToken` (`src/services/mcp_auth.ts`) looked up the bearer token against `mcp_oauth_connections`. When no row matched, it fell back to decoding the bearer as an **unverified** JWT via a local `decodeJWTUnverified` helper and trusted the token's own `sub` (and `email`) claims as the authenticated identity — no signature, issuer, or expiry check. The accompanying comment described this as "local-only compatibility," but the fallback carried no local-only gate, so it ran for any caller, local or remote.

## Impact

A caller who could construct a syntactically valid but unsigned JWT (`{alg:"none"}` header, arbitrary payload, no verifiable signature) and present it as a `Bearer` token that matched no live OAuth connection was authenticated as the `sub` named in that token's own payload — including a specific victim's `user_id`, which is derivable as `sha256(email)`. Net effect: full authentication bypass on the MCP session-token path, independent of any real OAuth grant.

## Root cause

The fallback branch in `validateSessionToken` assumed that any bearer reaching this point without a matching connection row was a legitimate but differently-issued local token, and decoded-and-trusted it rather than rejecting it. This is the same regression class as the Ed25519 bearer path fixed in `0.21.4` (`2026-08-07-ed25519-bearer-forged-key-auth-bypass`): an unresolved bearer must fail closed, not fall through to trusting caller-supplied claims.

## Fix

`validateSessionToken` now fails closed: a bearer that resolves to no live `mcp_oauth_connections` row throws `Invalid session token`, unconditionally. The unused `decodeJWTUnverified` helper was removed so the unverified-decode code path no longer exists to regress into.

Regression tests (`src/services/__tests__/mcp_oauth.test.ts`, `tests/services/mcp_auth.test.ts`) assert:

- A forged `alg:none` JWT naming a real victim user's `user_id` is rejected.
- A forged `alg:none` JWT naming an arbitrary/nonexistent `user_id` is rejected.
- A random non-JWT bearer is rejected.
- A legitimate, live OAuth connection token still authenticates correctly (no over-correction).

## Operator action

- Upgrade to `>= 0.22.1`.
- No data migration required.
- If an instance was reachable by untrusted callers prior to `0.22.1` with the MCP session-token path enabled, review any authentication logs for bearer tokens with a `{alg:"none"}` or otherwise unverifiable header shape.

## Detection

`src/services/__tests__/mcp_oauth.test.ts` and `tests/services/mcp_auth.test.ts` detect regressions of this class going forward.

## Gates that catch this regression class going forward

- **G3b auth topology matrix** (`tests/security/auth_topology_matrix.test.ts`) — asserts protected routes reject unauthenticated/unresolved callers.
- **Regression tests above** — directly assert the fail-closed behavior for unresolved bearers on the MCP session-token path.
- **Change guardrails rule MUST 5** — authorization must go through a resolved principal; caller-supplied claims are never trusted directly for access control.

## Timeline

| Date | Event |
|------|-------|
| 2026-08-26 | Vulnerability identified during internal security review |
| 2026-08-26 | Fix PR #2232 merged |
| 2026-08-26 | v0.22.1 supplement prepared |
| TBD | v0.22.1 tagged and released |
| TBD | GHSA published |
