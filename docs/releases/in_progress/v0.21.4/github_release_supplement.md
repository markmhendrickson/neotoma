## Summary

This release closes two high-severity authentication and injection vulnerabilities discovered in internal security review, fixes a self-referential OAuth discovery deadlock that blocked first-time MCP login for hosted instances, refreshes the homepage's live usage stats, and adds a Fly deploy config that stops operator-instance deploys from silently reverting VM sizing.

## What changed for npm package users

No CLI or package-artifact changes in this release.

## API surface & contracts

**`GET /.well-known/oauth-protected-resource` and `GET /.well-known/oauth-protected-resource/mcp` now return 200 unauthenticated (previously 401).** RFC 9728 §3 requires this document to be reachable without credentials — its entire purpose is to tell a caller with no credentials where to get them. The previous 401 response named itself as the place to find auth metadata, so a client 401'd at `/mcp` followed the `WWW-Authenticate` header back to a document that also 401'd, and the login flow never started. The `/mcp`-suffixed path (RFC 9728 §3.1's resource-appended form) is now registered alongside the bare path, since Express did not match it against the bare route.

**`GET /.well-known/openid-configuration` now returns an explicit 404** instead of falling through to the catch-all auth guard's 401. This server does not implement OIDC discovery; the previous implicit 401 reproduced the same discovery dead-end on a sibling path. This is a deliberate 404, not a synthetic 200 — advertising a discovery contract this server does not implement would create a different failure mode.

**Response schema addition:** the `200` body for `GET /.well-known/oauth-protected-resource` now includes a `resource` field (required by RFC 9728 §3, resolving to `${base}/mcp`) alongside the existing `authorization_servers`.

The `X-Connection-Id`-based invalid-token check is unchanged — that guard protects a caller holding a stale credential, which is a different case from a caller with no credentials at all.

No other request/response contract changes in this release.

## Behavior changes

Any MCP client or integration that previously worked around the discovery deadlock (for example, by skipping discovery and relying on anonymous writes) can remove that workaround. Discovery now completes as the RFC specifies.

An anonymous caller can no longer obtain read/write access to any user's data by presenting an unsigned Ed25519 bearer token — see Security hardening below.

## Docs site & CI / tooling

- REST API docs gain a discovery-bootstrap section: the 4-request sequence, a curl table of expected statuses, and an explicit note that a 200 with no credential at step 2 is required behavior, not a bug.
- MCP docs and the changelog note the 401→200 behavior change for integrators who built workarounds.
- `fly.operator.toml` added: a per-target Fly deploy config for operator-run instances, mirroring the existing `fly.sandbox.toml` pattern. Declares explicit VM sizing (2 CPU / 4096MB) and `restart.policy = 'always'` so a deploy no longer silently reverts an instance that was manually scaled up to address query stalls. No app name, region, or hostname is hardcoded — both are supplied at deploy time, consistent with keeping deployment targets out of the public repo.
- Homepage "How it's used" proof strip and founder blockquote refreshed against live prod counts (contacts, tasks, conversations, agent messages, entity types), each rounded down below the live figure so the "+" claim holds as the graph grows. Applied to both `en` and `es` locales.

## Internal changes

None beyond the above.

## Fixes

- **OAuth discovery deadlock** (#2049, #2050): first-time MCP login against a hosted instance could never complete discovery, because the protected-resource metadata endpoint required the very credential it exists to help a client obtain. Found via a partner's agent hitting first-time login against a live hosted instance.
- **Stale homepage stats** (#2107): the public proof strip understated live usage by up to 10x on some metrics; corrected against a live prod snapshot taken 2026-08-05.
- **Ed25519 bearer auth fail-open on unresolved principal** (advisory `2026-08-07-ed25519-bearer-forged-key-auth-bypass`): `getAuthenticatedUserId` trusted a caller-supplied `user_id` for any Bearer request that resolved to no authenticated principal. See Security hardening below.
- **`sort_by` / `snapshot_filters` ORDER BY SQL injection** (advisory `2026-08-07-sort-by-order-by-sql-injection`): caller-supplied snapshot field names were spliced unvalidated into generated SQL. See Security hardening below.

## Tests and validation

- New integration test `tests/integration/wellknown_discovery_unauthenticated.test.ts` (4 cases): boots a real app instance and issues real unauthenticated HTTP requests (no `Authorization`, no `X-Connection-Id`) against all four discovery-adjacent routes, asserting on actual response status and body content (not just "not 401"). Verified to fail when the fix is reverted.
- New regression test `tests/security/ed25519_forged_key_auth_bypass.test.ts` (5 cases): drives `getAuthenticatedUserId` directly with request stubs modeling an unresolved Bearer principal, asserting the function throws rather than trusting a caller-supplied `user_id`. Verified to fail against the pre-fix tail.
- New regression test `tests/security/sort_by_sql_injection.test.ts` (10 cases): asserts `isValidSnapshotFieldName` rejects 11 distinct injection payloads and accepts only bare identifiers; asserts `normalizeColumnName`'s fail-closed backstop throws on any non-identifier column shape while still rewriting legitimate `->>` projections.
- `security:manifest:check` confirms `protected_routes_manifest.json` stays in sync with `openapi.yaml` (118 routes, no drift).
- `tests/security/auth_topology_matrix.test.ts`: 18/19 passing (1 skipped by design), confirming the broader auth topology is unaffected.
- `fly.operator.toml` verified end to end against a live operator instance: deployed v0.21.2, machine held 2 CPU / 4096MB with `restart.policy = 'always'` across the deploy, health check 0.28-0.41s afterward, data intact.
- Homepage stats change verified via `npm run build:ui`; all five refreshed values and the corrected "over a year" copy confirmed present in the built bundle.
- `npm run openapi:bc-diff` against `v0.21.2`: no breaking changes, 4 non-breaking additions (the two new discovery operations and two new response fields).

## Security hardening

Classified `sensitive=true` by `npm run security:classify-diff` (OpenAPI security-block changes, protected-routes-manifest changes, and `src/actions.ts` auth-middleware and route-registration changes touched). Full adversarial review recorded in [`docs/releases/in_progress/v0.21.4/security_review.md`](./security_review.md).

Two vulnerabilities are fixed in this release, both found in internal security review and both fixed with an accompanying regression test verified to fail pre-fix:

- **[Ed25519 bearer auth: unresolved principal returned caller-supplied `user_id`](../../../security/advisories/2026-08-07-ed25519-bearer-forged-key-auth-bypass.md)** (GHSA-33x4-v5cf-2hfj, draft) — High severity. `getAuthenticatedUserId`'s fallback tail trusted a caller-supplied `user_id` for any Bearer request that resolved to no authenticated principal, because the Ed25519 verification middleware only checked a signature `if (signature ...)`. An unsigned, forged 32-byte token combined with an attacker-chosen `user_id` in the request body granted full read/write access to that user's graph. Fixed: the function now fails closed (`Not authenticated`) whenever a Bearer request reaches the tail with no resolved principal, regardless of whether `user_id` was supplied.
- **[`sort_by` / `snapshot_filters` ORDER BY SQL injection](../../../security/advisories/2026-08-07-sort-by-order-by-sql-injection.md)** (GHSA-8f95-jfm5-jjmr, draft) — High severity. Caller-supplied `sort_by=snapshot.<field>` and `snapshot_filters` keys were spliced unvalidated into a `snapshot->>${field}` SQL projection and interpolated raw into generated SQL, allowing `(CASE WHEN ...)` conditional expressions and correlated subqueries to execute inside an `ORDER BY` clause, and potentially bypassing per-row user scoping on shared backends. Fixed with two layers: a new `isValidSnapshotFieldName` bare-identifier validator at the query-construction source, and a fail-closed backstop in the SQLite adapter's `normalizeColumnName` that now throws on any column argument that is not a bare identifier, `table.column` pair, or recognized `->>` projection.

Both GHSAs are drafted and will be published after this tag ships, per the GHSA-first disclosure flow (`docs/security/advisories/README.md` § Filing flow). `security:lint` reports 0 errors (only pre-existing allow-listed warnings); `security:manifest:check` and `test:security:auth-matrix` both pass (18/19, 1 skipped by design).

Separately, the OAuth discovery change *removes* an over-broad auth gate on RFC-mandated public bootstrap documents rather than widening any privileged surface — no advisory filed for that change, it is a discovery-bootstrap availability fix, not an authorization bypass on a privileged path.

## Breaking changes

No breaking changes.
