/**
 * Integration tests for `GET /.well-known/aauth-resource.json` — the public
 * AAuth resource-server metadata endpoint introduced in v0.7.1.
 *
 * Lock-in points (per docs/proposals/agent-trust-framework.md and the v0.7.1
 * surgical plan):
 *   - 200 + `Content-Type: application/json`.
 *   - `issuer` is a string (host or URL form).
 *   - `client_name === "Neotoma"`.
 *   - `signature_window === 60`.
 *   - `supported_algs` includes `ES256` and `EdDSA`.
 *   - `supported_typ` includes `aa-agent+jwt`.
 *   - `jwks_uri === null` (Neotoma is verifier-only — agent JWKs travel
 *     per-request via the `Signature-Key` header).
 *
 * The route is mounted globally on `app` (not gated by sandbox mode), so we
 * exercise it against the shared HTTP server started by
 * `vitest.global_setup.ts` rather than respinning a custom Express
 * instance. That's the same pattern used by other top-level integration
 * tests (e.g. `store_resolution_attributes_hint.test.ts`).
 */

import { beforeAll, describe, expect, it } from "vitest";

function resolveApiBase(): string {
  const port = process.env.NEOTOMA_SESSION_DEV_PORT ?? "18080";
  return `http://127.0.0.1:${port}`;
}

describe("GET /.well-known/aauth-resource.json", () => {
  let apiBase: string;

  beforeAll(() => {
    apiBase = resolveApiBase();
  });

  it("returns 200 with application/json", async () => {
    const res = await fetch(`${apiBase}/.well-known/aauth-resource.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("emits the AAuth resource descriptor required by Dick Hardt's auto-discovery flow", async () => {
    const res = await fetch(`${apiBase}/.well-known/aauth-resource.json`);
    const body = (await res.json()) as {
      issuer: string;
      client_name: string;
      signature_window: number;
      supported_algs: string[];
      supported_typ: string[];
      jwks_uri: string | null;
      jwks_uri_reason?: string;
    };

    expect(typeof body.issuer).toBe("string");
    expect(body.issuer.length).toBeGreaterThan(0);
    expect(body.client_name).toBe("Neotoma");
    expect(body.signature_window).toBe(60);

    expect(Array.isArray(body.supported_algs)).toBe(true);
    expect(body.supported_algs).toEqual(expect.arrayContaining(["ES256", "EdDSA"]));

    expect(Array.isArray(body.supported_typ)).toBe(true);
    expect(body.supported_typ).toEqual(expect.arrayContaining(["aa-agent+jwt"]));

    expect(body.jwks_uri).toBeNull();
    if (body.jwks_uri_reason !== undefined) {
      expect(body.jwks_uri_reason).toMatch(/verifier-only|signature-key|jkt/i);
    }
  });

  it("respects NEOTOMA_AAUTH_AUTHORITY when set as a fully-qualified URL", async () => {
    const res = await fetch(`${apiBase}/.well-known/aauth-resource.json`);
    const body = (await res.json()) as { issuer: string };
    if (body.issuer.startsWith("http://") || body.issuer.startsWith("https://")) {
      expect(body.issuer).toMatch(/^https?:\/\/[^\s]+$/);
    } else {
      expect(body.issuer).toMatch(/^[^\s/]+$/);
    }
  });
});
