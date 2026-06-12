# Security review — v0.15.1

Manually completed (provider `none`) for the #1576 `audit_undeclared_fragments` addition. This file is the gate artifact for `/release` Step 3.5 (Security review lane); the supplement's `Security hardening` section links it.

## Scope

- Base ref: `main`
- Head ref: `HEAD` (PR #1646, branch `fix/1576-raw-fragments-audit`)
- Diff classifier: **sensitive**
- Provider: `none` (manual completion).
- Protected routes manifest: 110 routes, in sync with `openapi.yaml` (`security:manifest:check` green).

### Concerns flagged by `classify_diff.js`

- **unauth-public-route / auth-middleware** — a new Express route registration appears in `src/actions.ts` (`app.post("/audit_undeclared_fragments", …)`), which trips the `src/actions.ts`-in-diff heuristic (the v0.11.1 bypass surface).
  - `src/actions.ts`

## Adversarial review prompt

Treat the diff as if you were an attacker. For every concern below, propose at least one *concrete* request or code path that exercises the failure mode, then either confirm the gate would catch it or describe the missing test.

1. **Alternate-path auth.** Can an unauthenticated external caller reach a privileged path through an alternate channel?
2. **Proxy trust.** Does any new code trust `X-Forwarded-For`, `Forwarded`, `Host`, or `req.socket.remoteAddress` outside the canonical helpers?
3. **Local-dev widening.** Does any new path reference `LOCAL_DEV_USER_ID`, `assertExplicitlyTrusted`, `NEOTOMA_TRUST_PROD_LOOPBACK`, or a `dev` / `sandbox` env shortcut?
4. **Unauth public route.** For every new Express route, confirm it is in `protected_routes_manifest.json` (auth-required) or the runtime allow-list with a stated `reason`.
5. **Guest-access policy widening.** Does the diff change `assertGuestWriteAllowed`, `routeAcceptsGuestPrincipal`, or any guest-token issuer?
6. **Tenant isolation.** Does the new read path scope to the authenticated user, or can a caller read another user's data?

## Findings

**1. Alternate-path auth** — The single new route, `POST /audit_undeclared_fragments`, resolves its principal exclusively through `getAuthenticatedUserId(req, parsed.data.user_id)` — the same canonical helper every other user-scoped endpoint uses. No sandbox shortcut, OAuth callback, session-token reuse, or re-mounted page is introduced. **No finding.**

**2. Proxy trust** — The diff adds no reference to `X-Forwarded-For`, `Forwarded`, `Host`, `req.socket.remoteAddress`, `forwardedForValues`, or `isLocalRequest`. The handler reads only `req.body`. **No finding.**

**3. Local-dev widening** — No reference to `LOCAL_DEV_USER_ID`, `assertExplicitlyTrusted`, `NEOTOMA_TRUST_PROD_LOOPBACK`, or any dev/sandbox env shortcut in the new code. **No finding.**

**4. Unauth public route** — The new route is registered in `protected_routes_manifest.json` with `requires_auth: true`, `sandbox_allowed: "none"`, and `expected_no_auth_status: [401]`. `npm run security:manifest:write` was run and `npm run security:manifest:check` confirms the manifest is in sync (110 routes). **No finding.**

**5. Guest-access policy widening** — No change to `assertGuestWriteAllowed`, `routeAcceptsGuestPrincipal`, or any guest-token issuer. The new endpoint is auth-required and read-only; it writes nothing. **No finding.**

**6. Tenant isolation** — `SchemaRecommendationService.auditUndeclaredFragments` scopes its `raw_fragments` query to the resolved `user_id`, mirroring the existing `analyzeRawFragments` user-scoping (a provided default UUID OR null matches legacy null-owned rows; a real user id matches only that user via `.eq("user_id", userId)`). A caller cannot read another user's stranded fragments. The audit is read-only and has no write or deletion path. **No finding.**

## Negative tests

- The new integration tests (`tests/integration/schema_recommendation_integration.test.ts` § `auditUndeclaredFragments`) cover the default-UUID and null-`user_id` scoping paths.
- **Cross-user isolation is now asserted** in `tests/security/tenant_isolation_matrix.test.ts` § `/audit_undeclared_fragments` (3 rows): user A sees their own undeclared fragment, user A does NOT see user B's fragment or B's entity_type, and scoping to user B's entity_type while authenticated as user A returns an empty audit. This closes the gap the review flagged against change_guardrails MUST 5.

## Residual risks

- None introduced. The endpoint is an auth-required, read-only audit over the caller's own `raw_fragments`; it adds no write, deletion, mutation, or cross-tenant read surface.

## Sign-off

| Reviewer | Verdict | Date |
|----------|---------|------|
| gryllus-agent (Claude Opus 4.8) | with-caveats | 2026-06-12 |

**Caveats:** The `sensitive=true` classification fired solely on `src/actions.ts` being in the diff (the v0.11.1 bypass-surface heuristic). The actual change is one new auth-required, read-only route that resolves identity through `getAuthenticatedUserId` and scopes reads to the caller's own data. Adversarial walkthrough of all six axes confirms no auth or tenant-isolation regression. The cross-user tenant-isolation test is a low-urgency future hardening opportunity.

Verdict `yes` or `with-caveats` is required to advance past `/release` Step 3.5.

## Diff appendix

- `openapi.yaml`
- `src/actions.ts`
- `src/cli/index.ts`
- `src/server.ts`
- `src/shared/action_schemas.ts`
- `src/shared/contract_mappings.ts`
- `src/shared/openapi_types.ts`
- `src/services/schema_recommendation.ts`
- `src/tool_definitions.ts`
- `scripts/security/protected_routes_manifest.json`
- `tests/integration/schema_recommendation_integration.test.ts`
- `docs/releases/in_progress/v0.15.1/github_release_supplement.md`
