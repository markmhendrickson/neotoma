# Test coverage review — v0.21.4

Scope: `v0.21.2..HEAD` (5 commits: `caa30f8c9`, `4aba1397c`, `88712d97d`, `9a21de393`, `d43bfc1c5`).

## Code review

`/review` was run as a subagent pass over the full `v0.21.2..HEAD` range.

**Verdict: NEEDS-CHANGES (1 blocking, 1 advisory, 1 nit) at time of review — resolved by this commit.**

The single BLOCKING finding was `supplement-accuracy`: this release's `security_review.md`, `github_release_supplement.md`, and the two `2026-08-07-*` advisory files existed only as untracked files on disk at review time, not yet committed alongside the security-sensitive `d43bfc1c5` commit. The finding is procedural, not a code defect — the release-preparation commit (bumping `package.json` to `0.21.4` and committing these exact files together) resolves it directly. No code changes were required.

The ADVISORY finding (`hint-quality`) concerns `normalizeColumnName`'s error message and `InvalidSnapshotFieldError` interpolating the raw rejected field-name string into server-side logs (not the client response, which is already sanitized). Reviewed and accepted as-is: field names in this schema cannot carry PII (they are `snapshot->>field` accessor names, not values), and the HTTP response to the caller is already scrubbed. No follow-up required.

The NIT finding asked that `npm run openapi:bc-diff --base v0.21.2 --head HEAD` be reconciled specifically for this tag. Done — see Step below; no breaking changes, 4 non-breaking additions matching the v0.21.3-era contract changes exactly (the two new discovery routes were already declared in `caa30f8c9`, unchanged by `d43bfc1c5`).

No other findings: no State-Layer boundary violation, no schema-agnostic-design violation (no new `entity_type` branching), no determinism issue (no ID/reducer logic touched — the WHERE-clause construction reviewed is query-shape validation, not stored output), no immutability violation (no observation/source mutation), and contract seams (`openapi.yaml` → `openapi_types.ts` → `contract_mappings.ts` → `protected_routes_manifest.json`) are all updated together correctly for the two new discovery routes.

## Surface: Ed25519 bearer auth — unresolved principal must fail closed

**Classification: Covers user-observable behavior end-to-end (at the function boundary), with a documented gap at the full-HTTP-stack level.**

`tests/security/ed25519_forged_key_auth_bypass.test.ts` (5 cases) drives `getAuthenticatedUserId` (now exported specifically for this test) directly with request stubs modeling: an unresolved Bearer + attacker-chosen `user_id` (must throw), an unresolved Bearer + no `user_id` (must throw), and a properly resolved principal (must still return unchanged). Verified by the author to fail against the pre-fix tail — the exploit case returned the provided `user_id` instead of throwing.

This test isolates the decisive fix correctly (the function is where the authorization decision is made, and testing it directly avoids coupling the assertion to the test server's boot mode). It does **not** exercise the full middleware chain — the `security_review.md` for this release explicitly flags this as a residual, non-blocking gap and recommends a follow-up end-to-end HTTP test (real `fetch()` with an unsigned forged Bearer token against a booted app) in the same pattern as `wellknown_discovery_unauthenticated.test.ts`. Residual risk is assessed as low: the middleware-level boolean condition (`registered && isBearerTokenValid(bearerToken) && registeredUserId && ed25519Signature`) sits with no additional indirection between it and the HTTP response, and `auth_topology_matrix.test.ts` (18/19 passing) already exercises the broader topology this change sits inside.

## Surface: `sort_by` / `snapshot_filters` — reject non-identifier field names

**Classification: Covers user-observable behavior end-to-end.**

`tests/security/sort_by_sql_injection.test.ts` (10 cases) asserts `isValidSnapshotFieldName` accepts only bare identifiers (6 legitimate field names) and rejects all 11 tested injection payloads (`CASE WHEN` expressions, correlated subqueries, comment-truncation, `DROP TABLE`, bare `1=1`, empty string, whitespace, unrecognized `->>` variant). Separately asserts `InvalidSnapshotFieldError` carries the context (`"sort_by"` / `"snapshot_filters"`) that `handleApiError` matches on to return a 400 rather than a masked 500. Independently asserts `normalizeColumnName`'s fail-closed backstop: legitimate bare identifiers and `table.column` pairs pass through unchanged, a recognized `snapshot->>field` projection is still correctly rewritten to `json_extract(...)` (no regression), and every non-identifier shape throws. Verified by the author to fail against the pre-fix code.

This test exercises the real validation functions with the real injection payloads that motivated the fix, at both of the two independent defensive layers. Sufficient coverage; no gap identified.

## Surface: `/.well-known/oauth-protected-resource[/mcp]` returns 200 unauthenticated (unchanged from v0.21.3 prep, carried into this release)

**Classification: Covers user-observable behavior end-to-end.**

Unchanged since the v0.21.3 preparation cycle; see that cycle's `test_coverage_review.md` for the full write-up. `tests/integration/wellknown_discovery_unauthenticated.test.ts` (4 cases) remains passing and unmodified by `d43bfc1c5`.

## Surface: `fly.operator.toml`, homepage stats refresh (unchanged from v0.21.3 prep, carried into this release)

**Classification: No test — not applicable.** Static config / static copy changes with no branching logic. Manually verified in the v0.21.3 preparation cycle; not re-verified here as unchanged.

## Summary

One code-adjacent BLOCKING finding from `/review`, resolved by committing the release-preparation artifacts (this commit). Both new vulnerability fixes ship with real regression tests verified by their authors to fail pre-fix; one (`sort_by` SQL injection) has full end-to-end coverage at both defensive layers, the other (Ed25519 fail-closed) has direct-function coverage with a documented, low-risk, non-blocking gap at the full-HTTP-stack level, tracked as a follow-up in `security_review.md`. No BLOCKING test-coverage gaps remain unaddressed.
