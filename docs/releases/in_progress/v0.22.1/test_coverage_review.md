# Test coverage review — v0.22.1

Scope: `v0.22.0..HEAD` (1 commit, 4 files, +117/−45 lines).

## Surfaces

The only user-facing surface in this release is a **destructive/security-behavior change**: `validateSessionToken` now rejects bearers it previously (unsafely) accepted.

| Surface | Classification | Evidence |
|---|---|---|
| `validateSessionToken` fail-closed behavior change (`src/services/mcp_auth.ts`) | Covers user-observable behavior end-to-end | `src/services/__tests__/mcp_oauth.test.ts`: "rejects a forged unsigned JWT bearer instead of trusting its claims" (forged victim `user_id`, forged arbitrary `user_id`, non-JWT bearer — all assert `rejects.toThrow("Invalid session token")` against the real `validateSessionToken` export, not a mock) and "still accepts a valid, live connection access token after the fail-closed fix" (real OAuth flow: `createLocalAuthorizationRequest` → `completeLocalAuthorization` → `getTokenResponseForConnection` → `validateSessionToken`, asserting `userId`/`email` match). This is a genuine round-trip test against the real code path, not a helper-only test. |
| Error-message wording change (`"Invalid local session token"` → `"Invalid session token"`) | Covers user-observable behavior end-to-end | `tests/services/mcp_auth.test.ts` updated with a tolerant regex covering both old and new wording, plus its own forged-JWT case. |
| `capability_manifest.json` `describe_instance_policy` entry | No test needed (static data fix, unrelated to auth) | Verified via `npm run security:manifest:check` style consistency; this is a manifest-drift fix, not new behavior. |

No BLOCKING gaps. This is one of the cleaner test-coverage stories a security fix can have — the PR ships the exact adversarial test cases (forged `alg:none` JWT naming a real victim, forged JWT naming an arbitrary/nonexistent user, non-JWT random bearer) alongside a positive control (valid token still works), which is the complete test matrix for a fail-closed auth fix.

## Code review

Reviewed `v0.22.0..HEAD` per `/review` skill.

**Scope:** 4 files, +117/−45 lines. Surfaces: auth, tests. High-risk: yes (session-token validation).

**Findings:** none blocking, none advisory, none nit. This diff:
- Removes an authentication bypass rather than introducing new surface.
- Does not touch State Layer boundaries, schema-agnostic design, determinism, or immutability invariants (no entity/observation/reducer/timeline code touched).
- Does not introduce new routes, new proxy-trust logic, or new local-dev shortcuts.
- Ships adversarial regression tests in the same commit covering the exact exploit shape plus a non-regression (valid-token) control.
- Has no OpenAPI/contract/CLI surface (verified: `npm run openapi:bc-diff` reports no breaking changes).

--- Review Summary ---
Base..Head: v0.22.0..HEAD
Files reviewed: 4
Blocking: 0
Advisory: 0
Nit: 0

Verdict: APPROVED
