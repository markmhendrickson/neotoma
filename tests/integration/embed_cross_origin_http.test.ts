/**
 * Integration: official cross-origin Inspector-embed mode over real HTTP.
 *
 * Asserts the EFFECT (not just the pure helpers): with
 * NEOTOMA_EMBED_ALLOWED_ORIGINS configured, an allowlisted host gets
 * `frame-ancestors <origin>` + relaxed XFO on the embed shell and scoped CORS
 * on the two read endpoints; a NON-allowlisted origin stays locked down; and
 * the write endpoints never get embed CORS.
 *
 * The allowlist is read at module load, so we set the env var BEFORE importing
 * the Express app (dynamic import after resetModules) and tear it down after.
 */

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const ALLOWED = "https://hub.opschudding.app";
const DENIED = "https://evil.example";

describe("official cross-origin embed mode (allowlist configured)", () => {
  let httpServer: Server;
  let base = "";
  const prevEnv = process.env.NEOTOMA_EMBED_ALLOWED_ORIGINS;

  beforeAll(async () => {
    process.env.NEOTOMA_EMBED_ALLOWED_ORIGINS = ALLOWED;
    vi.resetModules();
    const { app } = await import("../../src/actions.js");
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(0, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
    const addr = httpServer.address() as AddressInfo;
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    if (prevEnv === undefined) delete process.env.NEOTOMA_EMBED_ALLOWED_ORIGINS;
    else process.env.NEOTOMA_EMBED_ALLOWED_ORIGINS = prevEnv;
    vi.resetModules();
    if (httpServer) {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it("embed shell gets frame-ancestors with the allowlisted origin and drops X-Frame-Options", async () => {
    const res = await fetch(`${base}/embed/graph`, { headers: { Accept: "text/html" } });
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("frame-ancestors");
    expect(csp).toContain(ALLOWED);
    expect(csp).toContain("'self'");
    expect(res.headers.get("x-frame-options")).toBeNull();
  });

  it("non-embed paths keep the locked-down X-Frame-Options (secure by default)", async () => {
    const res = await fetch(`${base}/`, { headers: { Accept: "text/html" } });
    // Helmet's frameguard default stays on for non-embed responses.
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    const csp = res.headers.get("content-security-policy") ?? "";
    // frame-ancestors, if present, must NOT carry the embed origin here.
    expect(csp).not.toContain(ALLOWED);
  });

  it("CORS preflight from an allowlisted origin on /entities/query is answered with scoped CORS", async () => {
    const res = await fetch(`${base}/entities/query`, {
      method: "OPTIONS",
      headers: {
        Origin: ALLOWED,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,authorization",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(ALLOWED);
    expect(res.headers.get("access-control-allow-methods") ?? "").toContain("POST");
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("CORS preflight from an allowlisted origin on /retrieve_graph_neighborhood is answered", async () => {
    const res = await fetch(`${base}/retrieve_graph_neighborhood`, {
      method: "OPTIONS",
      headers: { Origin: ALLOWED, "Access-Control-Request-Method": "POST" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(ALLOWED);
  });

  it("a NON-allowlisted origin gets NO embed CORS on the read endpoints", async () => {
    const res = await fetch(`${base}/entities/query`, {
      method: "OPTIONS",
      headers: { Origin: DENIED, "Access-Control-Request-Method": "POST" },
    });
    // Our embed middleware does not echo the denied origin.
    expect(res.headers.get("access-control-allow-origin")).not.toBe(DENIED);
  });

  it("write endpoints never get embed CORS even from an allowlisted origin", async () => {
    const res = await fetch(`${base}/store`, {
      method: "OPTIONS",
      headers: { Origin: ALLOWED, "Access-Control-Request-Method": "POST" },
    });
    // /store is not an embed read endpoint, so the embed middleware never
    // echoes the origin. (The global cors() only echoes the configured
    // NEOTOMA_FRONTEND_URL, which is not ALLOWED here.)
    expect(res.headers.get("access-control-allow-origin")).not.toBe(ALLOWED);
  });
});
