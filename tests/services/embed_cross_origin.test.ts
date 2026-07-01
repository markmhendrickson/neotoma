/**
 * Unit coverage for the official cross-origin embed helpers.
 *
 * These are the provably-brittle header/allowlist functions that let an
 * allowlisted host frame `/embed/graph` and call the two read endpoints
 * cross-origin without a reverse proxy. Secure-by-default is asserted
 * explicitly: an empty allowlist makes every function inert.
 */

import { describe, it, expect } from "vitest";
import {
  EMBED_READ_ENDPOINTS,
  applyFrameAncestorsToCsp,
  buildFrameAncestorsDirective,
  embedCorsHeaders,
  isEmbedReadEndpoint,
  isEmbedShellPath,
  isOriginAllowed,
  parseAllowedEmbedOrigins,
} from "../../src/services/embed_cross_origin.js";

describe("parseAllowedEmbedOrigins", () => {
  it("returns [] for unset/empty (secure by default)", () => {
    expect(parseAllowedEmbedOrigins(undefined)).toEqual([]);
    expect(parseAllowedEmbedOrigins(null)).toEqual([]);
    expect(parseAllowedEmbedOrigins("")).toEqual([]);
    expect(parseAllowedEmbedOrigins("   ")).toEqual([]);
  });

  it("parses and canonicalizes a comma-separated list", () => {
    expect(parseAllowedEmbedOrigins("https://hub.opschudding.app, https://a.example:8443")).toEqual(
      ["https://hub.opschudding.app", "https://a.example:8443"]
    );
  });

  it("normalizes a trailing slash to the bare origin", () => {
    expect(parseAllowedEmbedOrigins("https://hub.example/")).toEqual(["https://hub.example"]);
  });

  it("drops entries with a path, query, or fragment", () => {
    expect(parseAllowedEmbedOrigins("https://hub.example/embed")).toEqual([]);
    expect(parseAllowedEmbedOrigins("https://hub.example/?x=1")).toEqual([]);
    expect(parseAllowedEmbedOrigins("https://hub.example/#f")).toEqual([]);
  });

  it("drops non-http(s) and unparseable entries", () => {
    expect(parseAllowedEmbedOrigins("ftp://hub.example, file:///x, not a url")).toEqual([]);
  });

  it("de-duplicates while preserving order", () => {
    expect(
      parseAllowedEmbedOrigins("https://a.example, https://b.example, https://a.example")
    ).toEqual(["https://a.example", "https://b.example"]);
  });
});

describe("isOriginAllowed", () => {
  const allow = ["https://hub.example", "https://a.example:8443"];

  it("matches an allowlisted origin", () => {
    expect(isOriginAllowed("https://hub.example", allow)).toBe(true);
    expect(isOriginAllowed("https://a.example:8443", allow)).toBe(true);
  });

  it("rejects a non-allowlisted origin", () => {
    expect(isOriginAllowed("https://evil.example", allow)).toBe(false);
    expect(isOriginAllowed("http://hub.example", allow)).toBe(false); // scheme differs
    expect(isOriginAllowed("https://a.example", allow)).toBe(false); // port differs
  });

  it("rejects null/opaque/empty origins", () => {
    expect(isOriginAllowed(null, allow)).toBe(false);
    expect(isOriginAllowed(undefined, allow)).toBe(false);
    expect(isOriginAllowed("null", allow)).toBe(false);
    expect(isOriginAllowed("not-a-url", allow)).toBe(false);
  });

  it("never allows when the allowlist is empty (secure by default)", () => {
    expect(isOriginAllowed("https://hub.example", [])).toBe(false);
  });
});

describe("isEmbedReadEndpoint / EMBED_READ_ENDPOINTS", () => {
  it("matches exactly the two blessed read endpoints", () => {
    expect(isEmbedReadEndpoint("/entities/query")).toBe(true);
    expect(isEmbedReadEndpoint("/retrieve_graph_neighborhood")).toBe(true);
  });

  it("never matches a write endpoint", () => {
    for (const w of ["/store", "/correct", "/submit", "/entities", "/observations/create"]) {
      expect(isEmbedReadEndpoint(w)).toBe(false);
    }
  });

  it("exposes exactly two endpoints", () => {
    expect([...EMBED_READ_ENDPOINTS]).toEqual(["/entities/query", "/retrieve_graph_neighborhood"]);
  });
});

describe("isEmbedShellPath", () => {
  it("matches /embed and /embed/*", () => {
    expect(isEmbedShellPath("/embed")).toBe(true);
    expect(isEmbedShellPath("/embed/graph")).toBe(true);
    expect(isEmbedShellPath("/embed/graph/anything")).toBe(true);
  });

  it("does not match non-embed paths", () => {
    expect(isEmbedShellPath("/")).toBe(false);
    expect(isEmbedShellPath("/embedded")).toBe(false);
    expect(isEmbedShellPath("/entities/query")).toBe(false);
  });
});

describe("buildFrameAncestorsDirective", () => {
  it("returns null for an empty allowlist (secure by default)", () => {
    expect(buildFrameAncestorsDirective([])).toBeNull();
  });

  it("always leads with 'self' then the allowlisted origins", () => {
    expect(buildFrameAncestorsDirective(["https://hub.example"])).toBe(
      "frame-ancestors 'self' https://hub.example"
    );
  });
});

describe("applyFrameAncestorsToCsp", () => {
  it("returns the CSP unchanged when the allowlist is empty", () => {
    const csp = "default-src 'self'; frame-ancestors 'self'";
    expect(applyFrameAncestorsToCsp(csp, [])).toBe(csp);
  });

  it("rewrites an existing frame-ancestors directive to include the origins", () => {
    const csp = "default-src 'self';frame-ancestors 'self';img-src 'self' data:";
    const out = applyFrameAncestorsToCsp(csp, ["https://hub.example"]);
    expect(out).toContain("frame-ancestors 'self' https://hub.example");
    expect(out).toContain("default-src 'self'");
    expect(out).toContain("img-src 'self' data:");
    // The original bare `frame-ancestors 'self'` must be gone.
    expect(out).not.toMatch(/frame-ancestors 'self'(;|$)/);
  });

  it("injects frame-ancestors when the CSP lacks it", () => {
    const out = applyFrameAncestorsToCsp("default-src 'self'", ["https://hub.example"]);
    expect(out).toContain("default-src 'self'");
    expect(out).toContain("frame-ancestors 'self' https://hub.example");
  });
});

describe("embedCorsHeaders", () => {
  it("echoes the exact origin, never a wildcard, and does not enable credentials", () => {
    const h = embedCorsHeaders("https://hub.example");
    expect(h["Access-Control-Allow-Origin"]).toBe("https://hub.example");
    expect(h["Access-Control-Allow-Origin"]).not.toBe("*");
    expect(h["Vary"]).toBe("Origin");
    expect(h["Access-Control-Allow-Methods"]).toBe("POST, OPTIONS");
    expect(h["Access-Control-Allow-Headers"]).toContain("Content-Type");
    expect(h["Access-Control-Allow-Headers"]).toContain("Authorization");
    expect(h).not.toHaveProperty("Access-Control-Allow-Credentials");
  });
});
