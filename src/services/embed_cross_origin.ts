/**
 * Official cross-origin embed support for the Inspector graph.
 *
 * Background: Neotoma serves a chrome-less graph viewer at the SPA route
 * `/embed/graph`. Framing it from a different origin is blocked by two
 * defaults:
 *   1. Helmet's `frameguard` sends `X-Frame-Options: SAMEORIGIN`, and the CSP
 *      `frameSrc 'self'` / (host-level) `frame-ancestors 'self'` refuse
 *      cross-origin ancestors.
 *   2. The two read endpoints the embed calls (`/entities/query` and
 *      `/retrieve_graph_neighborhood`) assume same-origin and emit no CORS
 *      headers, so a cross-origin browser `fetch()` is blocked.
 *
 * Rather than force each embedding host to run a same-origin reverse proxy
 * that strips XFO, rewrites `frame-ancestors`, and re-hosts the data path
 * (the "Hub" pattern), Neotoma can natively opt-in per allowlisted host origin.
 *
 * SECURE BY DEFAULT: with no allowlist configured (`NEOTOMA_EMBED_ALLOWED_ORIGINS`
 * empty/unset), every function here is inert and response behavior is
 * byte-identical to today's locked-down `'self'` / `SAMEORIGIN`.
 *
 * This module is PURE (no IO) so the header-manipulation logic — the provably
 * brittle spot — is fully unit-testable. Express wiring lives in actions.ts.
 */

/** The env var holding the comma-separated allowlist of embed host origins. */
export const EMBED_ALLOWED_ORIGINS_ENV = "NEOTOMA_EMBED_ALLOWED_ORIGINS";

/**
 * The two — and only two — read POST endpoints the Inspector graph embed
 * calls. CORS is scoped to exactly these on the embed path; write endpoints
 * (`/store`, `/correct`, `/submit`, …) are never CORS-enabled, so a browser on
 * an allowlisted origin can never reach them cross-origin.
 */
export const EMBED_READ_ENDPOINTS: readonly string[] = [
  "/entities/query",
  "/retrieve_graph_neighborhood",
];

/**
 * Parse and normalize the configured embed origin allowlist.
 *
 * Accepts a comma-separated list of origins (scheme + host + optional port,
 * no path). Each entry is validated with the URL parser and reduced to its
 * canonical `origin` form (lowercased scheme/host, no trailing slash). Invalid
 * or path-bearing entries are dropped. Returns a de-duplicated, order-stable
 * array. An empty/unset value yields `[]` — the secure-by-default posture.
 */
export function parseAllowedEmbedOrigins(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    let origin: string;
    try {
      const u = new URL(trimmed);
      // Only http(s) origins are meaningful for browser framing/CORS.
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      // Reject entries that carry a path/query/fragment — an allowlist entry
      // must be a bare origin so it can be matched against a request Origin.
      if (u.pathname !== "/" || u.search || u.hash) continue;
      origin = u.origin;
    } catch {
      continue;
    }
    if (!seen.has(origin)) {
      seen.add(origin);
      out.push(origin);
    }
  }
  return out;
}

/**
 * Is `origin` (a raw `Origin` request-header value) present in the allowlist?
 * Comparison is on the canonical `origin` form. A null/empty/`"null"` origin
 * (opaque origin, e.g. a sandboxed iframe or a file:// document) is never
 * allowlisted.
 */
export function isOriginAllowed(origin: string | undefined | null, allowlist: string[]): boolean {
  if (!origin || origin === "null" || allowlist.length === 0) return false;
  let canonical: string;
  try {
    canonical = new URL(origin).origin;
  } catch {
    return false;
  }
  return allowlist.includes(canonical);
}

/**
 * Is `pathname` one of the two blessed embed read endpoints? Matches the exact
 * path only (query string is expected to be stripped by the caller).
 */
export function isEmbedReadEndpoint(pathname: string): boolean {
  return EMBED_READ_ENDPOINTS.includes(pathname);
}

/**
 * Is `pathname` an embed SPA shell/asset path that should receive relaxed
 * frame-ancestors when an allowlist is configured? Matches `/embed` and any
 * `/embed/...` sub-path (the graph shell + its embed-scoped routes). Static
 * assets are shared with the normal Inspector and are served same-origin, so
 * they need no framing relaxation themselves — only the top-level embed
 * document does.
 */
export function isEmbedShellPath(pathname: string): boolean {
  return pathname === "/embed" || pathname.startsWith("/embed/");
}

/**
 * Build the `Content-Security-Policy` `frame-ancestors` directive value for a
 * configured allowlist. Always includes `'self'` first so same-origin framing
 * (the current behavior) is preserved, then each allowlisted origin. Returns
 * the full directive string, e.g. `frame-ancestors 'self' https://hub.example`.
 *
 * Returns `null` when the allowlist is empty — signalling the caller to leave
 * the response untouched (secure-by-default).
 */
export function buildFrameAncestorsDirective(allowlist: string[]): string | null {
  if (allowlist.length === 0) return null;
  return ["frame-ancestors", "'self'", ...allowlist].join(" ");
}

/**
 * Rewrite (or inject) the `frame-ancestors` directive inside an existing CSP
 * header string, replacing any existing `frame-ancestors` with the allowlist
 * form. All other directives are preserved verbatim. When the allowlist is
 * empty the CSP is returned unchanged.
 *
 * This mirrors the host-side `rewriteCsp` helper the proxy used to run, but
 * now Neotoma emits the correct value itself.
 */
export function applyFrameAncestorsToCsp(csp: string, allowlist: string[]): string {
  const directive = buildFrameAncestorsDirective(allowlist);
  if (!directive) return csp;

  const directives = csp
    .split(";")
    .map((d) => d.trim())
    .filter((d) => d.length > 0);

  let found = false;
  const out = directives.map((d) => {
    if (/^frame-ancestors(\s|$)/i.test(d)) {
      found = true;
      return directive;
    }
    return d;
  });
  if (!found) out.push(directive);
  return out.join("; ");
}

/**
 * CORS headers to emit for an allowlisted embed read request. Scoped and
 * explicit: echoes the specific allowlisted origin (never `*`), advertises
 * `Vary: Origin` so caches don't cross-contaminate, allows only POST/OPTIONS
 * and the content-type + auth headers the embed needs. No
 * `Access-Control-Allow-Credentials` — the embed auth travels as a bearer in
 * the `Authorization` header, not as a cross-site cookie, so credentialed CORS
 * is deliberately not enabled.
 */
export function embedCorsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "600",
  };
}
