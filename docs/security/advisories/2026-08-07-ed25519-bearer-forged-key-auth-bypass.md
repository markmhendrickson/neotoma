# Ed25519 bearer auth: unresolved principal returned caller-supplied user_id (v0.21.4 fix)

- **Date disclosed:** 2026-08-07
- **GHSA:** GHSA-33x4-v5cf-2hfj (draft; publish after tag per release process)
- **CVE:** _not requested_
- **Severity:** High — an anonymous caller could read and write the entire graph for any user.
- **Affected:** all versions carrying the Ed25519 bearer auth path prior to `0.21.4`.
- **Fixed in:** `0.21.4`
- **Reporter:** internal security review.
- **CWEs:** [CWE-287](https://cwe.mitre.org/data/definitions/287.html) (Improper Authentication), [CWE-306](https://cwe.mitre.org/data/definitions/306.html) (Missing Authentication for Critical Function).

## Summary

`getAuthenticatedUserId` had a fallback tail: when a request carried a `Bearer` header but resolved to no authenticated principal (the middleware never stamped `authenticatedUserId` on the request), the function trusted the caller-supplied `user_id` body/query parameter instead of failing. The comment at the call site read "token validation happens in middleware" — but the middleware auto-registered any 32-byte token as a new Ed25519 key and only verified the request signature `if (signature ...)`, so a request with a syntactically valid but unsigned 32-byte token was accepted at the middleware layer without ever stamping a principal, then trusted downstream.

## Impact

An anonymous caller could:

1. Send any 32-byte value as a `Bearer` token (no valid signature required — the check was conditional on a signature being present at all).
2. Supply `user_id: "00000000-0000-0000-0000-000000000000"` (the well-known `LOCAL_DEV_USER_ID`) or any other user's UUID in the request body/query.
3. Have `getAuthenticatedUserId` return that supplied `user_id` as if it were authenticated, because the function's fallback path did not check whether the Bearer request had actually resolved to a principal.

Net effect: full read/write access to any user's data via the REST API, without a valid signature, key registration, or session.

## Root cause

`getAuthenticatedUserId` (`src/actions.ts`) ended with:

```
if (!headerAuth.startsWith("Bearer ")) throw ...;
if (!providedUserId) throw ...;
return providedUserId; // trusted the caller
```

This assumed "if we got here with a Bearer header, middleware already validated it." That assumption did not hold: the middleware's Ed25519 verification was conditional (`if (signature ...)`), so an unsigned forged key passed through without ever setting `req.authenticatedUserId`. The trailing fallback then handed authorization to the caller's own claimed identity — the definition of "authentication is not authorization," except here authentication itself never happened.

## Fix

`getAuthenticatedUserId` now fails closed on the exact condition that was previously trusted: a Bearer request that reaches the tail of the function with no resolved `authenticatedUserId` throws `Not authenticated`, regardless of whether a `user_id` was supplied. The function is exported (`export async function getAuthenticatedUserId`) so the regression test can drive it directly with request stubs modeling both the pre-fix and post-fix paths, independent of the test server's boot mode.

Regression test: `tests/security/ed25519_forged_key_auth_bypass.test.ts` — asserts the unresolved-Bearer-plus-provided-`user_id` case throws, the unresolved-Bearer-with-no-`user_id` case throws, and a properly resolved principal is still returned unchanged. Verified to fail against the pre-fix code path (the exploit case returned the provided `user_id` instead of throwing).

## Operator action

- Upgrade to `>= 0.21.4`.
- No data migration required.
- If a deployment was internet-reachable prior to `0.21.4` with the REST Ed25519 bearer path enabled, review access logs for anomalous `Bearer` tokens (32 bytes, no corresponding registered key history) paired with `user_id` values that do not match the token's actual owner.

## Detection

`tests/security/ed25519_forged_key_auth_bypass.test.ts` and the broader `tests/security/auth_topology_matrix.test.ts` suite detect regressions of this class going forward.

## Gates that catch this regression class going forward

- **G3 auth topology matrix** (`tests/security/auth_topology_matrix.test.ts`) — asserts protected routes reject unauthenticated/unresolved callers.
- **Change guardrails rule MUST 5** — authorization must go through `getAuthenticatedUserId`; body/query `user_id` is never trusted directly for access control.

## Timeline

| Date | Event |
|------|-------|
| 2026-08-07 | Vulnerability identified during internal security review |
| 2026-08-07 | Fix PR #2129 merged |
| 2026-08-07 | v0.21.4 supplement prepared |
| TBD | v0.21.4 tagged and released |
| TBD | GHSA published |
