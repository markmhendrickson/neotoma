Official cross-origin embed support for the Inspector graph: an allowlisted host can now iframe `/embed/graph` directly and let its browser fetch the two graph read endpoints cross-origin, without running a same-origin reverse proxy. Opt-in and secure-by-default.

## Highlights

- **Cross-origin Inspector graph embed, natively.** A new `NEOTOMA_EMBED_ALLOWED_ORIGINS` env config lists the host origins allowed to embed. For those origins only, Neotoma emits `Content-Security-Policy: frame-ancestors 'self' <origins>` and drops `X-Frame-Options` on the `/embed/*` shell, and answers scoped CORS on the two graph read endpoints. An embedding host no longer needs to reverse-proxy the shell, rewrite the CSP, strip `X-Frame-Options`, or re-host the data path. Implemented in `src/services/embed_cross_origin.ts` (pure helpers) + `src/actions.ts` (opt-in middleware).
- **Secure by default.** With `NEOTOMA_EMBED_ALLOWED_ORIGINS` unset or empty, the embed middleware is inert and every response is byte-identical to the prior locked-down `'self'` / `SAMEORIGIN` posture. Nothing changes for anyone who does not opt in.

## What changed for npm package users

**Runtime / config**

- New env var `NEOTOMA_EMBED_ALLOWED_ORIGINS` (comma-separated origins, scheme + host + optional port, no path). Invalid or path-bearing entries are dropped. Unset = today's behavior.
- When configured, two response behaviors change **only for allowlisted traffic**:
  1. `/embed/*` shell responses carry `frame-ancestors 'self' <origins>` and no `X-Frame-Options`, so an allowlisted host can frame them.
  2. The two graph read endpoints `POST /entities/query` and `POST /retrieve_graph_neighborhood` receive scoped CORS (exact-origin echo, never `*`, no credentials, `POST`/`OPTIONS` only) and preflight handling.
- Write endpoints (`/store`, `/correct`, `/submit`, …) are **never** CORS-enabled by this middleware, so a browser on an allowlisted origin can never reach them cross-origin.

**Shipped artifacts**

- `openapi.yaml` — unchanged; no new routes. The middleware only adds response headers on existing routes. Protected-routes manifest unchanged (115 routes).
- `dist/` — updated for the new service + middleware.

## API surface & contracts

No new routes and no request/response body changes. The change is purely additive response headers, gated on config + origin. `docs/subsystems/inspector_embed_cross_origin.md` documents the embed data contract (the two read endpoints, the `?apiBase=` shell parameter, the `<meta name="neotoma-api-base">` injection point) so embedding hosts can build against a stable, versioned contract.

## Behavior changes

- With an allowlist configured, allowlisted origins gain the two behaviors above. Everything else is unchanged. With no allowlist configured, there is no behavior change at all.

## Fixes / features

- **Official cross-origin Inspector embed mode** (PR #1861, epic #1606). Replaces the same-origin reverse-proxy pattern an external evaluator (Jeroen van 't Hoff, OPSCHUDDING) had built to embed the graph in his app. All four pieces of that proxy hack — `X-Frame-Options` strip, `frame-ancestors` rewrite, same-origin data proxy, and `crossorigin`/api-base shell rewrite — are obviated natively (the last because framing Neotoma directly serves its assets same-origin). Read-only embed auth reuses Neotoma's existing read-only guest/access machinery rather than a new token type.

## Tests and validation

- `tests/services/embed_cross_origin.test.ts` — 21 unit assertions on the pure helpers (origin allowlist parsing/canonicalization, `frame-ancestors` build/rewrite, scoped CORS header construction, read-endpoint + shell-path matching).
- `tests/integration/embed_cross_origin_http.test.ts` — 6 HTTP effect assertions against the real Express app: an allowlisted origin gets `frame-ancestors` + its origin and no `X-Frame-Options`; non-embed paths keep the locked-down `X-Frame-Options` (secure-by-default); CORS preflight from an allowlisted origin on both read endpoints is answered with scoped CORS and no credentials; a non-allowlisted origin gets no CORS; and write endpoints get no CORS even from an allowlisted origin.
- Ran in the PR-gating `contract_parity` and `baseline` lanes; both green on merge.
- Security gates: G1 (`security:classify-diff`) flagged `src/actions.ts` as auth-adjacent; manual adversarial review (see security_review.md) confirmed secure-by-default, no wildcard CORS, no credentialed CORS, and write endpoints unreachable cross-origin. G2 (`security:lint`) 0 errors. G3 (`security:manifest:check` 115 routes in sync + `test:security:auth-matrix` 18 passed / 1 skipped) passed.

## Security hardening

This release adds an **opt-in** relaxation of cross-origin framing and fetch for explicitly-allowlisted host origins. It is off by default and, when on, is bounded to the configured origins and the two read endpoints. See [docs/releases/in_progress/v0.18.5/security_review.md](security_review.md) — verdict: **yes** (secure-by-default; bounded relaxation; write path unreachable cross-origin).

## Breaking changes

None. No OpenAPI changes, no request-shape changes. Additive, config-gated response headers. Secure-by-default. Patch bump is correct per SemVer.
