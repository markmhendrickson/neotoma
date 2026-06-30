# Security review — v0.18.3

Manual security review for the `/release` Security review lane. The diff classifier flagged this release as sensitive, so this review records the adversarial pass and the verdict. The supplement's `Security hardening` section links it.

## Scope

- Base ref: `v0.18.2`
- Head ref: `HEAD`
- Diff classifier: **sensitive** (`sensitive=true`) — sole reason: `src/actions.ts` matches the `auth-middleware` path heuristic. The store HTTP handler lives in this file; the diff adds no auth logic.
- Provider: manual review.
- Protected routes manifest: 115 routes, in sync with `openapi.yaml`.
- Changed files: 7 (2 source, 1 schema, 2 inspector, 1 test, 1 generated catalog).

## Adversarial review prompt

Treat the diff as if you were an attacker. For every concern below, propose at least one concrete request or code path that exercises the failure mode, then either confirm the gate would catch it or describe the missing test.

1. **Alternate-path auth.** Can an unauthenticated external caller reach a privileged path through an alternate channel?
2. **Proxy trust.** Does any new code trust `X-Forwarded-For`, `Forwarded`, `Host`, or `req.socket.remoteAddress` outside the canonical helpers?
3. **Local-dev widening.** Does any new path reference `LOCAL_DEV_USER_ID`, `assertExplicitlyTrusted`, `NEOTOMA_TRUST_PROD_LOOPBACK`, or a `dev`/`sandbox` shortcut?
4. **Unauth public route.** For every new Express route, confirm it is in `protected_routes_manifest.json` or the runtime allow-list.
5. **Guest-access policy widening.** Does the diff change `assertGuestWriteAllowed`, `routeAcceptsGuestPrincipal`, or any guest-token issuer?
6. **AAuth / agent identity downgrade.** Does the diff make it easier to satisfy auth without a verified `aa-agent+jwt`?
7. **Cross-user read via content-addressed id.** The new `createObservation` existence check looks up an observation by its content-addressed id. Can a caller use it to read or infer another user's observation?

## Findings

- **No new routes; manifest unchanged.** The diff registers no Express routes. `security:manifest:check` confirms the protected-routes manifest is in sync (115 routes). Concerns 1 and 4 do not apply.
- **No auth-logic change in `src/actions.ts`.** The change in `handleStorePost` branches on the existing `source_storage` request field to choose reference vs. inline file handling. It is reached only after `getAuthenticatedUserId(req, …)`, the same authentication boundary as before. No middleware, guest-policy, AAuth, or principal-resolution code is touched. Concerns 1, 5, and 6 do not apply.
- **No proxy-trust changes.** No new use of `X-Forwarded-For`, `Forwarded`, `Host`, or `req.socket.remoteAddress`. Concern 2 does not apply.
- **No local-dev widening.** No reference to `LOCAL_DEV_USER_ID`, `assertExplicitlyTrusted`, or `NEOTOMA_TRUST_PROD_LOOPBACK` in the changed files. Concern 3 does not apply.
- **Cross-user read is not possible (concern 7).** The new existence check in `createObservation` is `.eq("id", observationId).eq("user_id", params.user_id)`. It is scoped to the authenticated caller's `user_id`, so a same-content observation owned by another user is never returned. This is the same scoping the MCP store path already uses (`src/server.ts`), and its comment documents the intent: prevent a different user's same-content observation from masking the current user's write. The change brings the REST path to parity; it does not widen read scope. An attacker who guesses another user's content-addressed observation id still gets no row back, because the `user_id` filter excludes it.
- **Reference-mode file handling.** Reference mode resolves the supplied `file_path` to an absolute path and registers it via `storeRawReference`. Path resolution and the host-local reference model are unchanged from the MCP path shipped in #1775/#1830; this release only makes the REST route reach the same code. No new filesystem-traversal surface beyond what MCP reference storage already exposes.
- **G1 classify-diff:** `sensitive=true` (path heuristic on `src/actions.ts`; no auth change in fact).
- **G2 security:lint:** 0 errors, 125 warnings (all pre-existing; none in changed lines).
- **G3 security:manifest:check + test:security:auth-matrix:** both passed (115 routes in sync; 18 passed / 1 skipped).

## Suggested negative tests

- `tests/integration/http_store_reference_source.test.ts` covers the REST reference path for both shapes. The existing `tests/security/auth_topology_matrix.test.ts` continues to assert the store route's auth topology. No additional auth-adjacent negative test is required, because no auth path changed and the new query is user-scoped.

## Residual risks

- None. The diff makes an existing, already-authenticated REST route honor an existing request field, and adds a user-scoped idempotency guard mirroring the MCP path. No auth surface is widened.

## Sign-off

| Reviewer | Verdict | Date |
|----------|---------|------|
| ateles-agent (manual) | yes | 2026-06-30 |

Verdict `yes` — classifier-sensitive by file-path heuristic only; manual review confirms no authorization change and no cross-user read. No block.

## Diff appendix

- `src/actions.ts`
- `src/services/observation_storage.ts`
- `src/shared/action_schemas.ts`
- `inspector/src/hooks/use_graph.ts`
- `inspector/src/pages/embed_graph.tsx`
- `tests/integration/http_store_reference_source.test.ts`
- `docs/testing/automated_test_catalog.md`
