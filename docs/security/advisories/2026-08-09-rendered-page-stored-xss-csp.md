# Stored XSS in rendered_page HTML route via author-supplied html_body (v0.21.5 fix)

- **Date disclosed:** 2026-08-09
- **GHSA:** GHSA-qp63-9r52-4q25 (draft; publish after tag per release process)
- **CVE:** _not requested_
- **Severity:** High — persistent script execution in the rendered-page origin, reachable by unauthenticated guest-link viewers.
- **Affected:** all versions serving `GET /entities/:id/html` for `rendered_page` entities prior to `0.21.5`.
- **Fixed in:** `0.21.5`
- **Reporter:** internal security review.
- **CWEs:** [CWE-79](https://cwe.mitre.org/data/definitions/79.html) (Cross-Site Scripting).

## Summary

`GET /entities/:id/html` renders a `rendered_page` entity's `html_body` field verbatim into the response body (`src/actions.ts`, via `renderRenderedPageHtml`). `html_body` is author-supplied free text, set via the `publish_rendered_page` MCP tool or any `store`/`correct` call against a `rendered_page` entity. The route inherited the server's global Content-Security-Policy, which allows `'unsafe-inline'` scripts for the authenticated app shell. Because the route set no response-specific CSP of its own, a `<script>` tag embedded in `html_body` executed in the page's origin when the page was viewed.

The route is reachable by two principal kinds: authenticated users (scoped via `.eq("user_id", userId)`) and guest principals carrying a scoped `access_token` query parameter (via `resolveGuestScopedEntityAccess`) — rendered pages are designed to be shareable via guest links. Both paths were equally affected: an attacker who could get a `rendered_page` entity stored with a crafted `html_body` could achieve persistent XSS against any viewer of that page's URL, including anonymous guest-link viewers who never authenticated.

## Impact

An attacker able to store a `rendered_page` entity with a crafted `html_body` (via `publish_rendered_page` or `store`/`correct`) could:

- Execute arbitrary JavaScript in the origin of any visitor to that page's URL, authenticated or guest-linked.
- Exfiltrate session state, guest `access_token` values reachable from the page context, or any data the origin can read.
- Persist the payload indefinitely, since `rendered_page` content is stored data, not a one-time render.

## Root cause

`src/actions.ts`'s `GET /entities/:id/html` handler set `Content-Type: text/html` and sent the rendered HTML without ever overriding the global CSP, which the server sets elsewhere for the authenticated app shell and permits `'unsafe-inline'` script execution. Rendered pages are static content — they never need to run script — but the route did not express that constraint at the response-header layer, so it silently inherited a policy designed for a different surface.

## Fix

Defense in depth at the response-header layer, scoped to this one route:

1. **Route-local CSP override** (`src/actions.ts`): `GET /entities/:id/html` now sets its own `Content-Security-Policy` header — `default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-same-origin` — which blocks all script execution (inline and external) regardless of `html_body` contents, independent of the global CSP used by other authenticated routes. `style-src 'unsafe-inline'` is retained because the page template itself uses an inline `<style>` block; this does not permit script execution.
2. **`X-Content-Type-Options: nosniff`** on the same response, closing the MIME-sniffing variant of the same class.

The fix applies unconditionally after both the authenticated-user and guest-token branches resolve, so it covers both viewing paths identically.

Regression test: `tests/security/rendered_page_csp.test.ts` — stores a `rendered_page` entity with an `html_body` containing an inline `<script>` payload, requests `GET /entities/:id/html`, and asserts both `Content-Security-Policy: script-src 'none'` and `X-Content-Type-Options: nosniff` are present on the live response (not just the source string).

## Operator action

- Upgrade to `>= 0.21.5`.
- No data migration required. Existing `rendered_page` entities with previously-stored `html_body` values are automatically protected on next view, since the mitigation is a response-header change, not a data transform.
- If a `rendered_page` entity is suspected to have been created with a malicious `html_body` prior to upgrading, review it via `retrieve_entity_snapshot` and correct or delete it; the stored content itself is not sanitized by this fix (the fix prevents execution, not storage, per Neotoma's immutable-observation model — corrections create new observations rather than mutating the stored `html_body`).

## Detection

`tests/security/rendered_page_csp.test.ts` detects regressions of this class going forward.

## Gates that catch this regression class going forward

- **Route-local CSP override on `GET /entities/:id/html`** — any future change to this route inherits the strict policy unless explicitly removed, which would be visible in code review and caught by the regression test.
- **`tests/security/rendered_page_csp.test.ts`** — asserts runtime response headers, not just the source string, so a regression that reintroduces the global (unsafe-inline) CSP on this route fails the test immediately.

## Timeline

| Date | Event |
|------|-------|
| 2026-08-09 | Vulnerability identified during internal security review |
| 2026-08-09 | Fix merged to `main` via PR #2139 |
| 2026-08-09 | Local advisory doc filed during v0.21.5 release preparation |
| _pending_ | GHSA-qp63-9r52-4q25 filed and published (requires repository security-advisory admin scope; not available to the automation account preparing this release — requires operator action) |
