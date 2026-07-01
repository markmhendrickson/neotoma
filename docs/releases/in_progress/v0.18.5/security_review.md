# Security review — v0.18.5

Manual adversarial security review. The diff classifier flagged this release sensitive because it adds an opt-in relaxation of cross-origin framing and fetch. This review records the adversarial pass and the verdict. The supplement's `Security hardening` section links it.

## Scope

- Base ref: `v0.18.4`
- Head ref: `HEAD`
- Diff classifier: **sensitive** (`sensitive=true`) — reason: `auth-middleware: src/actions.ts` (the embed middleware lives there; it relaxes framing/CORS, which is genuinely security-relevant).
- Protected routes manifest: 115 routes, **unchanged** (the change adds no routes, only response headers).
- Changed files: 9 (2 embed source, 1 config, 1 design doc, 2 test, 1 generated catalog, 2 skill docs).

## Adversarial review prompt

Treat the diff as if you were an attacker. For each concern, name a concrete request that exercises the failure mode, then confirm the gate catches it.

1. **Default posture.** With no allowlist configured, does anything change vs. today's locked-down `'self'`/`SAMEORIGIN`?
2. **Framing relaxation scope.** Can a non-allowlisted origin frame `/embed/graph`? Can an allowlisted origin frame anything beyond `/embed/*`?
3. **CORS wildcard / credentials.** Does the CORS ever emit `Access-Control-Allow-Origin: *` or `Access-Control-Allow-Credentials: true`?
4. **Origin spoofing.** Can a forged `Origin` header not on the allowlist obtain CORS?
5. **Write reachability.** Can a browser on an allowlisted origin reach `/store`, `/correct`, or any write endpoint cross-origin?
6. **Preflight-before-auth.** The OPTIONS preflight is answered before the auth stack. Does that leak anything or bypass auth on the actual data request?
7. **Config injection.** Can a malformed `NEOTOMA_EMBED_ALLOWED_ORIGINS` value widen the surface (path-bearing entry, `null`, wildcard)?

## Findings

1. **Secure by default (concern 1).** `parseAllowedEmbedOrigins(process.env[…])` yields `[]` when unset/empty; the middleware's first line is `if (embedAllowedOrigins.length === 0) return next();`. No config → inert → byte-identical to prior behavior. Confirmed by `test:security:auth-matrix` (18 pass / 1 skipped, unchanged) and the manifest check (115 routes unchanged). No default-posture change.

2. **Framing relaxation is bounded (concern 2).** The `frame-ancestors` rewrite is applied only on `isEmbedShellPath(reqPath)` (`/embed` or `/embed/*`), and the emitted directive is `frame-ancestors 'self' <configured origins>` — it lists only the configured allowlist, so emitting it grants nothing beyond the allowlist. A non-allowlisted origin trying to frame `/embed/graph` is refused by the browser against that CSP. A non-`/embed` path never has its `X-Frame-Options`/CSP touched. Concern 2 closed. (Test: "non-embed paths keep the locked-down X-Frame-Options".)

3. **No wildcard, no credentials (concern 3).** `embedCorsHeaders(origin)` sets `Access-Control-Allow-Origin: <exact canonical origin>`, never `*`, and emits no `Access-Control-Allow-Credentials` header at all. Methods are limited to `POST, OPTIONS`. (Test: preflight asserts `access-control-allow-credentials` is null and the origin is echoed exactly.)

4. **Origin spoofing gets nothing (concern 4).** CORS headers are set only when `isOriginAllowed(requestOrigin, embedAllowedOrigins)` is true; that canonicalizes the request Origin and checks membership. A forged Origin not on the allowlist receives no CORS. `"null"`/opaque origins are explicitly rejected. (Test: "a NON-allowlisted origin gets NO embed CORS".)

5. **Write path unreachable cross-origin (concern 5).** CORS is gated on `isEmbedReadEndpoint(reqPath)`, whose set is exactly `/entities/query` + `/retrieve_graph_neighborhood`. No write endpoint is ever in that set, so `/store`,`/correct`,`/submit` receive no `Access-Control-Allow-Origin` even from an allowlisted origin — the browser blocks the cross-origin write. (Test: "write endpoints never get embed CORS even from an allowlisted origin".) This is the browser-enforced equivalent of the evaluator's default-deny POST allowlist.

6. **Preflight-before-auth is correct (concern 6).** The middleware answers `OPTIONS` with `204` before the auth stack, as browsers require (preflight must not need a bearer). This leaks nothing: the preflight response carries only CORS headers, no data. The *actual* data `POST` still flows through the unchanged auth stack after this middleware calls `next()` — so server-side authorization on `/entities/query` and `/retrieve_graph_neighborhood` is unchanged. CORS is an additional browser-side gate, not a replacement for auth.

7. **Config injection resisted (concern 7).** `parseAllowedEmbedOrigins` validates each entry with the URL parser, requires `http:`/`https:`, rejects any entry with a path/query/fragment, reduces to canonical `origin`, and de-duplicates. A wildcard, a path-bearing entry, or a malformed value is dropped, not honored. There is no way to express `*` as an allowed origin.

- **G2 security:lint:** 0 errors, 125 warnings (all pre-existing; none in the changed lines).
- **G3 security:manifest:check + test:security:auth-matrix:** both passed (115 routes in sync; 18 passed / 1 skipped).

## Suggested negative tests

The added `embed_cross_origin_http.test.ts` already encodes the key negatives (non-allowlisted origin gets no CORS; write endpoints get no CORS; non-embed paths stay locked down; secure-by-default). No additional negative test is required for this diff.

## Residual risks

- The relaxation is real but opt-in and bounded: an operator who configures `NEOTOMA_EMBED_ALLOWED_ORIGINS` is explicitly allowing those origins to frame the graph and read via the two endpoints. That is the intended capability. Operators should set the allowlist to exactly the host origins they trust and no broader. Documented in `.env.example` and `docs/subsystems/inspector_embed_cross_origin.md`.
- A self-contained Neotoma-minted short-TTL embed token is deferred; the current model reuses existing read-only guest/access machinery. This does not widen the surface — it is a usability follow-up, not a security gap.

## Sign-off

| Reviewer | Verdict | Date |
|----------|---------|------|
| ateles-agent (manual) | yes | 2026-06-30 |

Verdict `yes` — opt-in, secure-by-default, bounded to configured origins and the two read endpoints; no wildcard/credentialed CORS; write path unreachable cross-origin; server-side auth unchanged. No block.

## Diff appendix

- `src/services/embed_cross_origin.ts`
- `src/actions.ts`
- `.env.example`
- `docs/subsystems/inspector_embed_cross_origin.md`
- `tests/integration/embed_cross_origin_http.test.ts`
- `tests/services/embed_cross_origin.test.ts`
- `docs/testing/automated_test_catalog.md`
