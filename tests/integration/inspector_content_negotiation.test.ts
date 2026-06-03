/**
 * Integration tests for content-negotiation unification (plan
 * ent_1f176dbbe9a39e6bbad27f1f).
 *
 * Covers:
 *   - `acceptPrefersHtml` parser correctness across browser / agent / curl
 *     Accept-header shapes.
 *   - `isApiOnlyPath` deny-list for paths that MUST NOT serve the SPA shell.
 *   - End-to-end: a minimal Express app with the SPA fallback installed
 *     returns the SPA shell for HTML requests to non-API paths AND falls
 *     through (delivering the underlying handler or 404) for JSON requests.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { AddressInfo } from "node:net";
import path from "node:path";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import {
  acceptPrefersHtml,
  isApiOnlyPath,
  isEntityRenderedSurfacePath,
  installInspectorSpaFallback,
  installInspectorSpaShellEarly,
} from "../../src/services/inspector_mount.js";

type Server = ReturnType<express.Application["listen"]>;

function noopLogger() {
  return { info: () => {}, warn: () => {} };
}

// ---------------------------------------------------------------------------
// Unit-level: acceptPrefersHtml
// ---------------------------------------------------------------------------

describe("acceptPrefersHtml", () => {
  it("returns false for missing or empty Accept header (agent / curl default)", () => {
    expect(acceptPrefersHtml(undefined)).toBe(false);
    expect(acceptPrefersHtml("")).toBe(false);
    expect(acceptPrefersHtml("   ")).toBe(false);
  });

  it("returns false for wildcard-only Accept (curl / fetch default)", () => {
    expect(acceptPrefersHtml("*/*")).toBe(false);
  });

  it("returns false for application/json (typical API client)", () => {
    expect(acceptPrefersHtml("application/json")).toBe(false);
    expect(acceptPrefersHtml("application/json, text/plain, */*")).toBe(false);
  });

  it("returns true for Chrome-style browser Accept", () => {
    expect(
      acceptPrefersHtml(
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
      )
    ).toBe(true);
  });

  it("returns true for explicit text/html", () => {
    expect(acceptPrefersHtml("text/html")).toBe(true);
  });

  it("respects quality factors", () => {
    // Client says JSON > HTML; should NOT prefer HTML.
    expect(acceptPrefersHtml("application/json;q=1.0, text/html;q=0.5")).toBe(false);
    // Client says HTML > JSON; should prefer HTML.
    expect(acceptPrefersHtml("text/html;q=1.0, application/json;q=0.5")).toBe(true);
  });

  it("returns false for text/markdown only (markdown clients are not browsers)", () => {
    expect(acceptPrefersHtml("text/markdown")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unit-level: isApiOnlyPath
// ---------------------------------------------------------------------------

describe("isApiOnlyPath", () => {
  it("matches well-known prefix", () => {
    expect(isApiOnlyPath("/.well-known/oauth-authorization-server")).toBe(true);
  });

  it("matches /api prefix and exact match", () => {
    expect(isApiOnlyPath("/api/v1/entities")).toBe(true);
    expect(isApiOnlyPath("/api/anything")).toBe(true);
  });

  it("matches single-token exact paths", () => {
    expect(isApiOnlyPath("/me")).toBe(true);
    expect(isApiOnlyPath("/server-info")).toBe(true);
    expect(isApiOnlyPath("/health")).toBe(true);
    expect(isApiOnlyPath("/favicon.ico")).toBe(true);
    expect(isApiOnlyPath("/robots.txt")).toBe(true);
  });

  it("matches the OAuth / MCP / sandbox-session families", () => {
    expect(isApiOnlyPath("/mcp/oauth/authorize")).toBe(true);
    expect(isApiOnlyPath("/oauth/callback")).toBe(true);
    expect(isApiOnlyPath("/sandbox/session/reset")).toBe(true);
  });

  it("does NOT match Inspector-overlapping paths", () => {
    expect(isApiOnlyPath("/entities/foo")).toBe(false);
    expect(isApiOnlyPath("/relationships")).toBe(false);
    expect(isApiOnlyPath("/schemas")).toBe(false);
    expect(isApiOnlyPath("/sources/abc")).toBe(false);
    expect(isApiOnlyPath("/observations")).toBe(false);
    expect(isApiOnlyPath("/issues/123")).toBe(false);
    expect(isApiOnlyPath("/conversations")).toBe(false);
  });

  it("does NOT match the root /", () => {
    expect(isApiOnlyPath("/")).toBe(false);
  });

  it("does NOT confuse partial prefix matches", () => {
    // /meow should NOT match /me
    expect(isApiOnlyPath("/meow")).toBe(false);
    // /health-check should NOT match /health
    expect(isApiOnlyPath("/health-check")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unit-level: isEntityRenderedSurfacePath
// ---------------------------------------------------------------------------

describe("isEntityRenderedSurfacePath", () => {
  it("matches the entity rendered-page surfaces", () => {
    expect(isEntityRenderedSurfacePath("/entities/abc/html")).toBe(true);
    expect(isEntityRenderedSurfacePath("/entities/abc/markdown")).toBe(true);
    expect(isEntityRenderedSurfacePath("/entities/ent_123/html")).toBe(true);
  });

  it("does NOT match the SPA entity routes", () => {
    expect(isEntityRenderedSurfacePath("/entities")).toBe(false);
    expect(isEntityRenderedSurfacePath("/entities/abc")).toBe(false);
    expect(isEntityRenderedSurfacePath("/entities/abc/timeline")).toBe(false);
    expect(isEntityRenderedSurfacePath("/entities/abc/history")).toBe(false);
    // Nested segment beyond :id/html is not the rendered surface.
    expect(isEntityRenderedSurfacePath("/entities/abc/html/extra")).toBe(false);
  });

  it("is trailing-slash / double-slash safe", () => {
    expect(isEntityRenderedSurfacePath("/entities//abc/html")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: early SPA-shell handler (registered BEFORE data routes)
// ---------------------------------------------------------------------------

describe("installInspectorSpaShellEarly — end-to-end", () => {
  let server: Server | null = null;

  afterEach(() => {
    if (server) {
      server.close();
      server = null;
    }
  });

  function startApp(
    registerDataRoutes: (app: express.Application) => void
  ): Promise<{ baseUrl: string }> {
    return new Promise((resolve) => {
      const app = express();
      // Early shell handler runs BEFORE the data routes — this is the
      // inversion vs the late fallback: browser HTML requests to SPA client
      // routes get the shell before the JSON data route can answer.
      installInspectorSpaShellEarly(app, process.env, noopLogger());
      registerDataRoutes(app);
      app.use((_req, res) => {
        res.status(404).json({ error: "not_found_fallthrough" });
      });
      server = app.listen(0, () => {
        const addr = server!.address() as AddressInfo;
        resolve({ baseUrl: `http://127.0.0.1:${addr.port}` });
      });
    });
  }

  // A data route that always returns JSON, like the real /sources, /schemas, etc.
  function jsonDataRoutes(app: express.Application) {
    app.get("/sources", (_req, res) => res.json({ sources: [], total: 0 }));
    app.get("/entities/:id", (_req, res) => res.json({ entity_id: "stub" }));
    app.get("/entities/:id/html", (_req, res) =>
      res.type("text/html").send("<!DOCTYPE html><title>Published</title>PUBLISHED_PAGE")
    );
    app.get("/entities/:id/markdown", (_req, res) =>
      res.type("text/markdown").send("# Published markdown")
    );
  }

  it("serves the SPA shell to a browser navigating to /sources (before the JSON data route)", async () => {
    const { baseUrl } = await startApp(jsonDataRoutes);
    const res = await fetch(`${baseUrl}/sources`, {
      headers: { Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    expect(res.headers.get("vary")).toBe("Accept");
    expect(await res.text()).toMatch(/<html/i);
  });

  it("returns JSON from the data route for an API client (Accept: application/json)", async () => {
    const { baseUrl } = await startApp(jsonDataRoutes);
    const res = await fetch(`${baseUrl}/sources`, {
      headers: { Accept: "application/json" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(await res.json()).toEqual({ sources: [], total: 0 });
  });

  it("returns JSON for wildcard-only Accept (agent / curl default)", async () => {
    const { baseUrl } = await startApp(jsonDataRoutes);
    const res = await fetch(`${baseUrl}/sources`, { headers: { Accept: "*/*" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("does NOT shadow /entities/:id/html — published page reaches its handler even for Accept: text/html", async () => {
    const { baseUrl } = await startApp(jsonDataRoutes);
    const res = await fetch(`${baseUrl}/entities/abc/html`, {
      headers: { Accept: "text/html" },
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("PUBLISHED_PAGE");
  });

  it("does NOT shadow /entities/:id/markdown for Accept: text/html", async () => {
    const { baseUrl } = await startApp(jsonDataRoutes);
    const res = await fetch(`${baseUrl}/entities/abc/markdown`, {
      headers: { Accept: "text/html" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/markdown/);
  });

  it("serves the SPA shell for a browser GET to /entities/:id (the SPA detail route)", async () => {
    const { baseUrl } = await startApp(jsonDataRoutes);
    const res = await fetch(`${baseUrl}/entities/abc`, {
      headers: { Accept: "text/html" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: SPA fallback over HTTP
// ---------------------------------------------------------------------------

describe("installInspectorSpaFallback — end-to-end", () => {
  let server: Server | null = null;
  let tempDir: string | null = null;

  afterEach(() => {
    if (server) {
      server.close();
      server = null;
    }
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  function startApp(opts: {
    apiHandlers?: (app: express.Application) => void;
    overrideBundledDir?: string;
  }): Promise<{ baseUrl: string }> {
    return new Promise((resolve) => {
      const app = express();
      // Stand-in API handlers that the SPA fallback should NOT shadow.
      if (opts.apiHandlers) opts.apiHandlers(app);
      installInspectorSpaFallback(
        app,
        opts.overrideBundledDir
          ? ({
              ...process.env,
              NEOTOMA_INSPECTOR_STATIC_DIR: opts.overrideBundledDir,
            } as NodeJS.ProcessEnv)
          : process.env,
        noopLogger()
      );
      // Default 404 fallback so we can detect fall-through.
      app.use((_req, res) => {
        res.status(404).json({ error: "not_found_fallthrough" });
      });
      server = app.listen(0, () => {
        const addr = server!.address() as AddressInfo;
        resolve({ baseUrl: `http://127.0.0.1:${addr.port}` });
      });
    });
  }

  it("serves SPA shell for HTML request to a non-API unmatched path", async () => {
    const { baseUrl } = await startApp({});
    const res = await fetch(`${baseUrl}/entities/foo`, {
      headers: { Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    expect(res.headers.get("vary")).toBe("Accept");
    const body = await res.text();
    // Whatever the SPA shell contains, it must be HTML.
    expect(body).toMatch(/<html/i);
  });

  it("falls through for JSON request to an unmatched path (default 404 JSON)", async () => {
    const { baseUrl } = await startApp({});
    const res = await fetch(`${baseUrl}/entities/foo`, {
      headers: { Accept: "application/json" },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "not_found_fallthrough" });
  });

  it("falls through for HTML request to an API-only path (e.g. /me, /server-info)", async () => {
    const { baseUrl } = await startApp({
      apiHandlers: (app) => {
        // No /me handler registered; expect default 404 fall-through (not SPA).
      },
    });
    const res = await fetch(`${baseUrl}/me`, {
      headers: { Accept: "text/html" },
    });
    // Path is in the API-only deny-list → fallback does not serve SPA →
    // request falls through to default 404 JSON.
    expect(res.status).toBe(404);
    const ct = res.headers.get("content-type") ?? "";
    expect(ct.includes("application/json")).toBe(true);
  });

  it("does not shadow an upstream API handler that returns JSON for HTML accept", async () => {
    // Upstream handler at /entities/:id returns JSON regardless of Accept.
    // SPA fallback runs AFTER such handlers, so it should never be reached.
    const { baseUrl } = await startApp({
      apiHandlers: (app) => {
        app.get("/entities/:id", (_req, res) => {
          res.json({ entity_id: "stub" });
        });
      },
    });
    const res = await fetch(`${baseUrl}/entities/foo`, {
      headers: { Accept: "text/html" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(await res.json()).toEqual({ entity_id: "stub" });
  });

  it("does not dispatch on POST/PUT/DELETE (mutations always go through API)", async () => {
    const { baseUrl } = await startApp({});
    const res = await fetch(`${baseUrl}/entities/foo`, {
      method: "POST",
      headers: { Accept: "text/html", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "not_found_fallthrough" });
  });

  it("HEAD requests are dispatched to the SPA shell (same as GET)", async () => {
    const { baseUrl } = await startApp({});
    const res = await fetch(`${baseUrl}/entities/foo`, {
      method: "HEAD",
      headers: { Accept: "text/html" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
  });
});
