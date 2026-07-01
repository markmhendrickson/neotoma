# Official cross-origin Inspector-embed mode

Status: implemented (opt-in, secure-by-default) — Phase 1 (framing + CORS) landed;
read-only auth path documented, uses existing machinery.

## Problem

Neotoma serves a chrome-less graph viewer at the SPA route `/embed/graph`, meant
to be iframed by an external host (the "Inspector graph embed", #1606). But a
host on a **different origin** (e.g. Jeroen van 't Hoff's "The Hub" at
`https://hub.opschudding.app`) cannot frame it directly, because of four
locked-down defaults. Today the only way to embed is to stand up a **same-origin
reverse proxy** in the host app that strips/rewrites Neotoma's headers and
re-hosts the data path. That proxy is brittle (it pins Neotoma's exact CSP/HTML
shape) and duplicates auth. This mode makes the proxy unnecessary.

The four blockers, and what the host's proxy did about each:

| #   | Blocker (Neotoma default)                                                                                                              | Host proxy hack                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | `X-Frame-Options: SAMEORIGIN` + CSP `frame-ancestors 'self'` block cross-origin framing                                                | strip XFO, rewrite `frame-ancestors` (`rewriteCsp`)                                |
| 2   | Cross-origin client `fetch()` to the data path is blocked (same-origin assumption / no CORS; in the Hub's case also Cloudflare-Access) | same-origin proxy the data path + inject a token                                   |
| 3   | A leaked read token could otherwise hit write endpoints                                                                                | default-deny POST allowlist of the two read endpoints (`isAllowedEmbedPost`)       |
| 4   | Shell tags carry `crossorigin`; SPA reads its API base from `<meta name="neotoma-api-base">`                                           | strip `crossorigin`, rewrite the meta (`rewriteEmbedShellHtml`/`stripCrossorigin`) |

## Design

Everything below is **opt-in per configured host origin** and **secure by
default**: with no allowlist configured, every response is byte-identical to
today's `'self'`/`SAMEORIGIN`.

### 1. Host allowlist for framing (obviates hack #1)

New env config `NEOTOMA_EMBED_ALLOWED_ORIGINS` — a comma-separated list of
allowed embed host origins (scheme + host + optional port, no path), parsed and
canonicalized once at boot (`parseAllowedEmbedOrigins`). When non-empty, an
Express middleware (registered after Helmet, before the global `cors()` and the
auth stack) rewrites the response for embed shell paths (`/embed/*`):

- `Content-Security-Policy`: the `frame-ancestors` directive becomes
  `frame-ancestors 'self' <origins>` (Helmet's default `'self'` is rewritten
  in place; all other directives preserved). `'self'` is always kept first so
  same-origin framing still works.
- `X-Frame-Options`: **removed** on `/embed/*` responses (XFO has no allowlist
  form; leaving it would still block the frame). It stays `SAMEORIGIN`
  everywhere else.

Non-embed paths are never touched. Empty allowlist → middleware short-circuits.

### 2. Scoped CORS on the two read endpoints (obviates hack #2, framing side)

When the request `Origin` is allowlisted **and** the path is exactly one of the
two blessed read endpoints — `/entities/query` or `/retrieve_graph_neighborhood`
— the middleware emits scoped CORS:

- `Access-Control-Allow-Origin: <the exact allowlisted origin>` (never `*`),
- `Vary: Origin`,
- `Access-Control-Allow-Methods: POST, OPTIONS`,
- `Access-Control-Allow-Headers: Content-Type, Authorization`,
- `Access-Control-Max-Age: 600`,
- **no** `Access-Control-Allow-Credentials` — the embed authenticates with a
  bearer in `Authorization`, not a cross-site cookie, so credentialed CORS is
  deliberately off.

Preflight `OPTIONS` on those two paths from an allowlisted origin is answered
directly with `204`. CORS is scoped to **only** those two endpoints on the
embed path; write endpoints (`/store`, `/correct`, `/submit`, …) are never
CORS-enabled here — so a browser on an allowlisted origin can never reach them
cross-origin. This is the browser-enforced equivalent of the host's default-deny
POST allowlist (**hack #3** — see the auth section for the token half).

### 3. Read-only embed auth (obviates hacks #2 auth-half and #3)

**Decision: reuse existing machinery; do not invent a parallel HMAC token.**

The host's stateless HMAC token existed because its data path sat behind
Cloudflare Access on Bypass and needed _some_ app-level gate. Neotoma's own auth
stack already provides read-only, write-incapable options — so the official mode
routes embed data calls through the normal auth stack (unchanged) and relies on
one of:

- **`read_only` guest access policy** (`src/services/access_policy.ts`): the
  operator sets the graph-relevant entity types to `read_only`, so any guest
  (including an anonymous embed caller) can read but not write. This is the
  native, per-entity-type, write-incapable-by-construction control. The two
  read endpoints already resolve principals with `resolveRoutePrincipal(req,
["user","guest"])` semantics; `/store`,`/correct` do not accept the guest
  read principal for writes.
- **A read-only bearer** the operator provisions for the embed, if they prefer
  an explicit credential over open guest reads. The host injects it via the
  SPA's `Authorization` header (allowed by the CORS `Access-Control-Allow-Headers`
  above). Because CORS is scoped to the two read endpoints, a leaked bearer used
  from the browser cannot reach a write endpoint cross-origin.

Either way the embed data path is **write-incapable by construction** at the
CORS layer (only two read endpoints are reachable cross-origin) and at the auth
layer (`read_only` policy / a read bearer). No new token type, no new secret to
rotate, no parallel verification path.

> If a future requirement demands a _self-contained, host-scoped, short-TTL_
> read token minted by Neotoma (so the operator need not open guest reads at
> all), the recommended shape is to extend the existing `guest_access_token`
> service with an "embed scope" variant rather than a fresh HMAC — deferred
> until a concrete need appears, to avoid a second auth surface.

### 4. Documented shell / apiBase contract (obviates hack #4)

The blessed embed data contract and shell-injection points, versioned so the
host's `rewriteEmbedShellHtml`/`rewriteCsp` pins become unnecessary:

- **Shell**: `GET /embed/graph?apiBase=<url>&node=<id>`. The SPA reads its API
  base from `?apiBase=` (see `inspector/src/pages/embed_graph.tsx` +
  `contexts/api_base_context.tsx`) and, absent that, from
  `<meta name="neotoma-api-base" content="<origin>">` injected by
  `injectInspectorApiBaseMeta` (`src/services/inspector_mount.ts`). In official
  cross-origin mode the host sets `?apiBase=https://<neotoma-origin>` so the
  SPA's `fetch()` targets Neotoma directly (CORS-permitted per §2) — no proxy
  meta-rewrite needed.
- **Data contract** (the only two cross-origin read calls):
  - `POST /entities/query` — body per `EntitiesQuerySchema`; returns the entity
    list envelope. Used by the embed search field.
  - `POST /retrieve_graph_neighborhood` — body per
    `RetrieveGraphNeighborhoodSchema` (`node_id`, `node_type`,
    `include_relationships`, `include_sources`, `limit`, `offset`); returns the
    neighborhood (nodes + edges). Used by the graph render.
- **`crossorigin` on shell tags**: the host stripped `crossorigin` because its
  proxy served assets same-origin. In official mode the _host frames Neotoma
  directly_, so the shell + its `/assets/*` are served by Neotoma same-origin to
  the iframe document — `crossorigin` is correct as-is and needs no stripping.
  (This is why the mode frames `/embed/graph` directly rather than proxying: it
  removes the asset-origin mismatch that made `crossorigin` a problem.)

## Interface-consistency (Waxwing gate)

- **Config naming**: `NEOTOMA_EMBED_ALLOWED_ORIGINS` follows the existing
  `NEOTOMA_*` + comma-separated-list convention (cf. `NEOTOMA_CSP_CONNECT_SRC`).
  Documented in `.env.example` next to the CSP block.
- **Secure-by-default**: matches Neotoma's posture — unset = no behavior change.
- **No new route, tool, or response field**: this is response-header behavior on
  existing routes plus a new middleware, so `openapi.yaml`,
  `src/tool_definitions.ts`, and `src/shared/contract_mappings.ts` need no
  change (no new request/response schema, no new MCP/CLI action). The two read
  endpoints' request/response contracts are unchanged.
- **Error envelope**: unchanged (the middleware only adds headers / answers
  preflight; it never returns a Neotoma error body).

## Secure-by-default guarantees

- No allowlist → middleware is inert; framing stays `SAMEORIGIN`, CSP stays
  `frame-ancestors 'self'`, no CORS headers, byte-identical to today.
- Allowlist set → only the listed origins get `frame-ancestors`/relaxed XFO on
  `/embed/*` and CORS on the two read endpoints. Every other origin, path, and
  endpoint is unchanged.
- Write endpoints are never CORS-enabled by this mode.

## Files

- `src/services/embed_cross_origin.ts` — pure helpers (allowlist parse, origin
  match, CSP `frame-ancestors` rewrite, CORS headers).
- `src/actions.ts` — the opt-in middleware wiring (after Helmet, before `cors()`).
- `tests/services/embed_cross_origin.test.ts` — pure-helper unit coverage.
- `tests/integration/embed_cross_origin_http.test.ts` — HTTP effect tests
  (allowlisted vs. denied origin; shell framing; read vs. write endpoints).
