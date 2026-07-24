Neotoma v0.19.0 adds hosted, multi-person graphs — Google sign-in with an email allowlist, an optional shared graph, and company-aware contact resolution — alongside identifier-resolution fixes that matter once an instance holds thousands of entities.

## Highlights

- **A team can now sign in to one hosted Neotoma with Google.** `GET /mcp/oauth/google/start` admits anyone whose Google-verified email is listed in the new `NEOTOMA_APPROVED_EMAILS` allowlist, with no private key or bearer token to distribute.
- **An allowlisted team can share a single populated graph.** Setting `NEOTOMA_SHARED_GRAPH_USER_ID` to a UUID binds every approved signer to that one `user_id` instead of an isolated per-email graph — the hosted leads-graph shape. Unset means unchanged, isolated behavior.
- **Look up who you know at a company in one call.** The new `query_contacts_at_company` MCP tool and `POST /query_contacts_at_company` endpoint resolve a company by name or domain and return the contacts linked to it.
- **Email and phone lookups now find the entity on large instances.** `retrieve_entity_by_identifier` and `identify_entity_by_signals` gained a server-side exact pass, so an exact match no longer depends on the row happening to fall inside a 500-row in-memory window.
- **Employment history stops accumulating stale edges.** When a contact's organization changes, the previous auto-linked `works_at` relationship is retracted instead of left alongside the new one.

## What changed for npm package users

The package gains the Google OAuth sign-in path and the `query_contacts_at_company` surface described above. Nothing in the CLI's existing command set changes shape, and no flags were removed or renamed.

New environment variables, all optional and all defaulting to prior behavior when unset:

| Variable | Effect |
|---|---|
| `NEOTOMA_GOOGLE_CLIENT_ID` | Google OAuth client id. Required to enable Google sign-in. |
| `NEOTOMA_GOOGLE_CLIENT_SECRET` | Google OAuth client secret for the authorization-code exchange. |
| `NEOTOMA_APPROVED_EMAILS` | CSV allowlist of emails permitted to sign in. Required to enable Google sign-in. |
| `NEOTOMA_SHARED_GRAPH_USER_ID` | When a valid UUID, binds all approved signers to this single `user_id`. Unset → isolated per-email graphs. |

Google sign-in is **fail-closed**: both `NEOTOMA_GOOGLE_CLIENT_ID` and `NEOTOMA_APPROVED_EMAILS` must be set, or the routes return 404 and the surface does not exist. A default install is unaffected by this release's auth work.

## API surface & contracts

`openapi.yaml` is **additive only** for this release — 122 insertions, zero deletions:

- **New:** `POST /query_contacts_at_company`. Accepts a company name or domain plus optional match-mode (`exact_normalized`, `fuzzy_match`); returns matched contacts. Declared with `additionalProperties: false` on the new request schema — this is a new endpoint's own contract, not a tightening of an existing one.
- **New MCP tool:** `query_contacts_at_company` in `src/tool_definitions.ts`.

No request field was removed, renamed, promoted to required, or narrowed on any pre-existing operation. All 148 contract tests pass, including the legacy-payload fixtures under `tests/contract/legacy_payloads/`, which were not modified.

## Behavior changes

- **Identifier resolution (#1982).** `retrieveEntityByIdentifierWithFallback` — behind `retrieve_entity_by_identifier` and `identify_entity_by_signals` — previously scanned an unordered, in-memory 500-row window of snapshot fields. On instances with thousands of entities, an exact email or phone match whose row sat outside that window was never examined and the lookup returned nothing. A server-side exact pass now runs first. Callers that had worked around this with client-side scanning can drop the workaround.
- **`works_at` retraction (#1970).** Changing a contact's organization now retracts the prior auto-linked `works_at` edge. Consumers that read all `works_at` edges to reconstruct employment history will see one current edge where they previously saw an accumulation; the retraction is recorded rather than hard-deleted.
- **MCP session errors (#1926).** An unknown streamable-HTTP session id now returns **404**, not 503. Clients treating 503 as retryable-with-backoff and 404 as reconnect-now will now reconnect promptly instead of retrying a session that no longer exists.
- **Idle deployments (#2002).** The Fly deployment keeps one machine running so MCP sessions survive idle periods rather than being severed by a scale-to-zero.

## Docs site & CI / tooling

- New runbook for per-client Fly.io instance deployment (#1978).
- Real client and person names scrubbed from public docs (#1925).

## Internal changes

Company resolution gained a dedicated service with its own test suite. The inspector picked up content-negotiation and API adjustments supporting the hosted deployment. Test additions across the release total roughly 3,400 lines, including new suites for company resolution, auto-link retraction, entity-identifier handling, MCP session reconnect, Google OIDC verification, and Google identity resolution.

## Fixes

- Resolve identifiers by email/phone at scale via a server-side exact pass (#1982, closes #1981).
- Retract stale auto-linked `works_at` edges when an organization changes (#1970).
- Return 404 rather than 503 on an unknown streamable-HTTP MCP session (#1926).
- Keep one machine running so MCP sessions survive idle (#2002).

## Tests and validation

- **Contract:** 148/148 passing, legacy-payload fixtures unchanged.
- **Security auth matrix:** 18 passing, 1 skipped.
- **Google OIDC:** 26 unit tests covering wrong issuer, wrong audience, expired token, tampered signature, unverified email, non-allowlisted email, single-use nonce, and fail-safe handling of a malformed shared-graph UUID.
- **Protected-routes manifest:** in sync with `openapi.yaml` across 116 routes.

## Breaking changes

No breaking changes. The OpenAPI diff is additive only; no validation was tightened, no field was removed or promoted to required, and no enum, range, or pattern was narrowed. Per `docs/developer/github_release_process.md`, a tightening would have mandated a minor bump — this release takes the minor bump for the new hosted-graph capability, not for a tightening.

## Security hardening

This release is **security-sensitive** (`npm run security:classify-diff` → `sensitive=true`, 5 concerns: `openapi-security`, `protected-routes-manifest`, `security-gates`, `auth-middleware`, `inspector-mount`). Full review: [`security_review.md`](security_review.md). No advisory under `docs/security/advisories/` was opened or is referenced by this release.

**New authentication surface — Google OAuth sign-in (#1924).** Two new unauthenticated routes, `GET /mcp/oauth/google/start` and `GET /mcp/oauth/google/callback`, form the pre-auth sign-in entry point. Identity is resolved only after `verifyGoogleIdToken` validates the id_token's signature against Google's live JWKS plus issuer, audience, expiry, `email_verified`, and allowlist membership. The nonce is single-use and the post-sign-in redirect is normalized to an internal `/mcp/oauth/*` path, so the callback cannot be used as an open redirect. **Operator action:** none required — the surface returns 404 unless you deliberately set both `NEOTOMA_GOOGLE_CLIENT_ID` and `NEOTOMA_APPROVED_EMAILS`.

**Shared-graph blast radius — read this before setting `NEOTOMA_SHARED_GRAPH_USER_ID`.** When that variable is set, **every** allowlisted Google-verified email is admitted to the *same* graph with full read and write access. There is no per-entity or per-type scoping for these principals: adding an address to `NEOTOMA_APPROVED_EMAILS` grants that person everything in the shared graph, not a subset. Leave it unset (the default) to keep each signer on an isolated per-email graph. A malformed UUID fail-safes to `null` rather than binding to an unintended id. **Operator action:** treat `NEOTOMA_APPROVED_EMAILS` as a full-access grant list whenever the shared graph is enabled, and review it on the same cadence as any other access list.

**Known gate-coverage gap (tracked for v0.19.1).** The two new OAuth routes are not declared in `openapi.yaml`, so they are absent from the auto-derived `protected_routes_manifest.json` and are not exercised by the G3 auth matrix. `security:manifest:check` reports "in sync" because it can only check declared routes. Exposure is bounded — the routes are fail-closed by env and their verification logic carries 26 passing adversarial unit tests — but the gate's green status should not be read as covering them. The follow-up patch will declare both paths and add a route-level assertion that each returns 404 when the Google env vars are unset.

**Allowlist rotation is process, not code.** Removing an email from `NEOTOMA_APPROVED_EMAILS` blocks future sign-ins but does not invalidate an already-issued OAuth key-session cookie; session lifetime governs the revocation lag. **Operator action:** when revoking access urgently, restart the server to clear live sessions rather than relying on the allowlist edit alone.

**Gate results:** G1 `classify-diff` — sensitive=true. G2 `security:lint` — 0 errors, 125 warnings (pre-existing baseline: unauth-public-route annotations on long-standing routes and two `LOCAL_DEV_USER_ID` references in `sandbox_mode.ts`; none introduced by this release). G3 `security:manifest:check` — in sync, 116 routes; `test:security:auth-matrix` — 18 passed, 1 skipped. G4 `security:ai-review` — review filed, verdict `with-caveats`.
