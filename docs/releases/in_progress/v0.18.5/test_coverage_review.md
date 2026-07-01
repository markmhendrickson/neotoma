# Test coverage review — v0.18.5

## Scope

Release diff: `v0.18.4..HEAD`. One feature (official cross-origin Inspector embed mode, PR #1861) plus two skill-doc updates (`/status`, `/end` whole-session coverage) that carry no runtime behavior.

## Code review

The feature is an opt-in, config-gated middleware plus a pure helper module. It adds response headers on existing routes; it adds no routes, no request/response body changes, no schema changes, no migrations. The security-sensitive surface (CORS + frame-ancestors relaxation) is covered by the security review; this review covers behavioral test adequacy.

Verdict: **ADVISORY only** — no BLOCKING gaps. The feature ships with effect-level HTTP tests that assert the observable outcome on the real Express app, plus unit tests on the brittle header-manipulation helpers.

## Surface coverage

### `src/services/embed_cross_origin.ts` — pure helpers

- **Change:** origin-allowlist parsing/canonicalization, `frame-ancestors` directive build + CSP rewrite, scoped CORS header construction, read-endpoint + embed-shell-path matching.
- **Classification:** pure logic; the provably-brittle header manipulation.
- **Coverage:** `tests/services/embed_cross_origin.test.ts` — 21 unit assertions covering allowlist parsing (valid/invalid/path-bearing/duplicate/empty), origin matching (canonical, `null`, opaque), `frame-ancestors` build + rewrite (present/absent directive), and the CORS header shape. All pass.

### `src/actions.ts` — opt-in middleware

- **Change:** wires the helpers into an Express middleware after Helmet, before global `cors()` and the auth stack; secure-by-default early-return when no allowlist.
- **Classification:** user-observable HTTP behavior; security-sensitive.
- **Coverage:** `tests/integration/embed_cross_origin_http.test.ts` — 6 HTTP effect assertions against the real app: (1) allowlisted origin gets `frame-ancestors` + its origin, X-Frame-Options dropped; (2) non-embed paths keep locked-down X-Frame-Options (secure-by-default); (3) CORS preflight on `/entities/query` answered with scoped CORS, no credentials; (4) same for `/retrieve_graph_neighborhood`; (5) non-allowlisted origin gets no CORS; (6) write endpoints get no CORS even from an allowlisted origin. These assert the EFFECT, not just that config is accepted — the exact discipline required by the fixed-means-effect policy. All pass. Ran in the PR-gating `contract_parity` and `baseline` lanes.

## Surfaces that do NOT apply to this release

- Destructive / data-mutating operations: none.
- External file-shape parsers: none.
- New CLI commands or flags: none.
- New HTTP/MCP routes: none (headers only; manifest unchanged at 115 routes).
- Migrations: none.
- Skill-doc changes (`/status`, `/end`): documentation only, no runtime code.

## Verdict

No BLOCKING coverage gaps. The feature has both unit coverage on the brittle helpers and end-to-end HTTP coverage asserting the observable security-relevant effects, including the negative cases (non-allowlisted origin, write endpoints, non-embed paths). Release may proceed.
