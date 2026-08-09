/**
 * Regression gate — Phase 2 stored XSS in publish_rendered_page.
 *
 * html_body is author-supplied and served verbatim by GET /entities/:id/html,
 * and the GLOBAL CSP allows 'unsafe-inline' scripts — so an injected <script>
 * in a rendered page (viewable unauthenticated via a guest access_token) would
 * execute in-origin. The fix serves this route with a strict per-route CSP
 * (script-src 'none' + sandbox), neutralizing script execution regardless of
 * html_body contents. This test locks that the route response carries the
 * strict policy.
 */
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("rendered_page /html strict CSP (Phase 2 stored-XSS mitigation)", () => {
  let server: ReturnType<import("express").Application["listen"]>;
  let baseUrl: string;
  let entityId: string | null = null;

  beforeAll(async () => {
    const { app } = await import("../../src/actions.js");
    server = app.listen(0);
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    // Seed a rendered_page containing a script payload.
    const res = await fetch(`${baseUrl}/store`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "csp-xss-test-seed",
        entities: [
          {
            entity_type: "rendered_page",
            canonical_name: "rendered_page:csp-xss-test",
            title: "CSP XSS Test",
            html_body: "<h1>content</h1><script>document.title='PWNED'</script>",
          },
        ],
      }),
    });
    if (res.ok) {
      const body = (await res.json()) as { entities?: Array<{ entity_id: string }> };
      entityId = body.entities?.[0]?.entity_id ?? null;
    }
  });

  afterAll(() => {
    server?.close();
  });

  it("serves the rendered page with a strict script-blocking CSP", async () => {
    // Seeding depends on local-dev auth mode. Fail loudly rather than
    // early-returning with zero assertions — a broken seed must not
    // silently greenwash this GHSA regression gate.
    expect(entityId, "seed /store call failed — see beforeAll for details").toBeTruthy();
    const res = await fetch(`${baseUrl}/entities/${entityId}/html`);
    expect(res.status).toBe(200);
    const csp = res.headers.get("content-security-policy") ?? "";
    // The strict route policy must block ALL script execution (inline + external).
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("sandbox");
    // The global 'unsafe-inline' script policy must NOT apply to this route.
    expect(csp).not.toContain("'unsafe-inline' https://cdn.jsdelivr.net");
    // MIME-sniffing hardening pairs with the strict CSP on this route.
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    // The page still renders its content (the script is served inert, not stripped).
    const html = await res.text();
    expect(html).toContain("<h1>content</h1>");
  });
});
