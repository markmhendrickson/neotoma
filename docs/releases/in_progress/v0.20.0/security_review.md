# Security review — v0.20.0

Manually completed for `/release` Step 3.5 (Security review lane); the supplement's `Security hardening` section links this file.

## Scope

- Base ref: `v0.19.0`
- Head ref: `HEAD` (`release/v0.20.0`, commit `383cb2bc0` + version bump)
- Diff classifier (`npm run security:classify-diff --base v0.19.0 --head HEAD --json`): **sensitive=true**
- Changed files: 38
- Protected routes manifest: in sync with `openapi.yaml` (116 routes) — no new routes added by this release.

### Concerns flagged by `classify_diff.js`

- **openapi-security** — OpenAPI security blocks, protected /sources, /inspector, /me.
  - `openapi.yaml`
- **auth-middleware** — Express auth middleware and `isLocalRequest` helper (the v0.11.1 bypass surface).
  - `src/actions.ts`

## Adversarial review prompt

Treat the diff as if you were an attacker. For every concern below, propose at least one *concrete* request or code path that exercises the failure mode, then either confirm the gate would catch it or describe the missing test.

1. **Alternate-path auth.** Can an unauthenticated external caller reach a privileged path through an alternate channel?
2. **Proxy trust.** Does any new code trust `X-Forwarded-For`, `Forwarded`, `Host`, or `req.socket.remoteAddress` outside the canonical helpers?
3. **Local-dev widening.** Does any new path reference `LOCAL_DEV_USER_ID` or a similar escape hatch?
4. **Unauth public route.** For every new Express route, confirm it is in `protected_routes_manifest.json` or in the runtime allow-list with a stated reason.
5. **Guest-access policy widening.** Does the diff change `assertGuestWriteAllowed`, `routeAcceptsGuestPrincipal`, or any guest-token issuer?
6. **AAuth / agent identity downgrade.** Does the diff make it easier to satisfy auth without a verified `aa-agent+jwt`?

## Findings

The full `src/actions.ts` diff (`git diff v0.19.0 HEAD -- src/actions.ts`) was read in its entirety. The change set is query/pagination plumbing and a schema-identity field, not an auth-logic change.

1. **Alternate-path auth — no new routes.** Both endpoints touched by this diff (`GET /entities` / `POST /entities/query` and `POST /update_schema_incremental`) are pre-existing, already-declared, already-protected routes. The diff adds request/response fields (`cursor`, `next_cursor`, `canonical_name_fields`) to their existing handlers; it registers zero new `app.get`/`app.post` calls. `npm run security:manifest:check` confirms `protected_routes_manifest.json` is unchanged and in sync (116 routes, same count as v0.19.0). **No finding.**

2. **Proxy trust.** No reads of `X-Forwarded-For`, `Forwarded`, `Host`, or `req.socket.remoteAddress` appear in this diff. `isLocalRequest` / `forwardedForValues` are untouched; the auth-topology matrix (`tests/security/auth_topology_matrix.test.ts`) still shows the XFF-untrusted-IP rejection path firing during this run. **No finding.**

3. **Local-dev widening.** `LOCAL_DEV_USER_ID` does not appear in this diff. `security:lint`'s two `local-dev-user-widening` warnings (`src/services/sandbox_mode.ts:128,245`) are pre-existing and outside the file set touched by this release (`sandbox_mode.ts` is unchanged since v0.19.0). **No finding.**

4. **Unauth public route.** `security:lint`'s `unauth-public-route` warnings all point at routes registered before this diff (`/update_schema_incremental` itself is one of them, but the route registration line is unchanged — only the request-destructuring and response-echo lines inside the existing handler changed). No new `app.get`/`app.post` call was added anywhere in the diff. **No finding.**

5. **Guest-access policy widening.** `assertGuestWriteAllowed` and `routeAcceptsGuestPrincipal` do not appear in this diff. **No finding.**

6. **AAuth / agent identity downgrade.** No changes to AAuth admission, tier checks, or `getAAuthAdmissionFromRequest`. The one new import in `actions.ts` (`CursorError` from `./services/entity_cursor.js`) is wired only into `handleApiError` to map a pagination-validation error to a 4xx envelope — it does not touch identity or admission logic. **No finding.**

**New error-handling surface (non-auth, noted for completeness):** `firstIssueHint()` and the `CursorError` branch in `handleApiError` both return structured client-facing error detail (a `hint` string, or `error.toErrorEnvelope()`). Reviewed for information leakage: `CursorError.toErrorEnvelope()` (in `entity_cursor.ts`) returns only `{ code, message }` describing the cursor-validation failure (e.g. "cursor was minted under a different sort_order") — no internal identifiers, stack traces, or other users' data. `firstIssueHint` only ever surfaces the static hint string authored into the Zod issue at the tightening site (the `offset > 2000` message), never arbitrary request data. **No finding.**

## Suggested negative tests

Already covered by the existing suite (confirmed by reading, not just file-name matching):

- `INVALID_CURSOR` envelope asserted over a real HTTP request and a real MCP client/transport pair (per the commit's stated test coverage).
- Cursor-sort-mismatch rejection: a cursor minted under one `sort_order` is rejected if reused after the sort changes.
- `canonical_name_fields` rejecting a rule that references an unknown field (contract test).
- `offset` above 2000 rejected with a structured hint (legacy-payload fixture, per the errors.md tightening obligation).

No additional negative tests are recommended before this release; the diff does not introduce a new authorization decision point.

## Residual risks

- **Carried from v0.19.0, unrelated to this diff:** the two Google OAuth routes (`GET /mcp/oauth/google/start`, `GET /mcp/oauth/google/callback`) remain undeclared in `openapi.yaml` and therefore outside `protected_routes_manifest.json` / the auth-topology matrix's coverage. This release does not touch OAuth code and does not change that gap. Still tracked as a follow-up (originally flagged in the v0.19.0 security review).
- **`offset` deprecation is back-compat, not removal.** Existing callers below the 2000-row bound are unaffected; callers above it get a hint pointing at `cursor` rather than a silent behavior change. No residual risk beyond what's already documented in the supplement's Breaking changes section.

## Sign-off

| Reviewer | Verdict | Date |
|----------|---------|------|
| Phoenicurus (agent review, `/release` Step 3.5) | yes | 2026-07-27 |

**Rationale:** `security:classify-diff` reports `sensitive=true` because the diff touches `openapi.yaml` and `src/actions.ts` — both on the classifier's watch list by *file identity*, not because this diff contains an auth-logic change. Full read of every line touched in `src/actions.ts` and `openapi.yaml` confirms: zero new routes, zero new proxy-trust reads, zero changes to `LOCAL_DEV_USER_ID` / guest-access / AAuth admission. All changes are additive query/response fields and a schema-identity parameter, matching `openapi:bc-diff`'s "no breaking changes" finding. `security:lint` (0 errors), `security:manifest:check` (in sync, no route-count change), and `test:security:auth-matrix` (18/18 passed, 1 pre-existing skip) all pass clean.

Verdict `yes` or `with-caveats` is required to advance past `/release` Step 3.5; `block` keeps the release on the security review lane until findings are addressed.

## Diff appendix

Changed files (38 total) touching security-relevant surfaces:

- `openapi.yaml` — additive `cursor`/`next_cursor`/`canonical_name_fields` fields only (see Findings §4, §1)
- `src/actions.ts` — additive request/response field plumbing on two pre-existing routes; new `CursorError` → 4xx mapping in `handleApiError` (see Findings §6)
- `src/services/entity_cursor.ts` — new file, opaque cursor token + `CursorError` (no auth logic)
- `src/services/entity_queries.ts`, `src/services/entity_query_limits.ts` — pagination bound logic, no auth logic
- `src/services/schema_registry.ts` — `canonical_name_fields` plumbing through `updateSchemaIncremental` (see Findings §1, §4)
- `src/cli/index.ts` — new `--canonical-name-fields` CLI flag, forwards to existing authenticated HTTP call
- `src/shared/action_schemas.ts`, `src/shared/openapi_types.ts`, `src/tool_definitions.ts`, `src/shared/capability_manifest.json` — generated/contract surface, no auth logic
- `.github/workflows/npm-publish.yml`, `.github/workflows/deploy-client-instance.yml` — new CI workflows; both read secrets from repo-configured GitHub Actions secrets (`NPM_TOKEN`, `CLIENT_INSTANCE_APP`-scoped), no secret values or client-identifying strings committed to the workflow files themselves
