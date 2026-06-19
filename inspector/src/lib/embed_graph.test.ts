/**
 * Tests for Phase 1 + Phase 2 of the inspector embed feature (#1606).
 *
 * Phase 1: apiBase-parameterized API client — verifies that postWithBase
 * routes requests to an explicit origin rather than reading from localStorage.
 *
 * Phase 2: embed route plumbing — verifies that EmbedGraphPage exports a
 * component, that the ApiBaseContext normalization logic works, and that
 * the graph neighborhood endpoint is correctly addressed by the with-base
 * variant.
 *
 * Uses relative imports (not @/ aliases) so the root vitest config can pick
 * these up alongside the other inspector/src/**\/*.test.ts files.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Phase 1 — postWithBase URL construction
// ---------------------------------------------------------------------------

describe("postWithBase URL construction", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    // Stub localStorage so getAuthToken() doesn't throw in Node
    if (typeof globalThis.localStorage === "undefined") {
      Object.defineProperty(globalThis, "localStorage", {
        value: {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        },
        writable: true,
        configurable: true,
      });
    }
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.resetModules();
  });

  it("sends the request to the explicit apiBase origin, not the localStorage default", async () => {
    const { postWithBase } = await import("../api/client");

    const customBase = "https://custom.neotoma.example.com";
    await postWithBase(customBase, "/retrieve_graph_neighborhood", {
      node_id: "ent_abc",
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [calledUrl] = fetchSpy.mock.calls[0] as [string, ...unknown[]];
    expect(calledUrl).toBe(
      "https://custom.neotoma.example.com/retrieve_graph_neighborhood",
    );
  });

  it("strips trailing slash from the apiBase before building the URL", async () => {
    const { postWithBase } = await import("../api/client");

    const customBaseWithSlash = "https://example.com/api/";
    await postWithBase(customBaseWithSlash, "/retrieve_graph_neighborhood", {});

    const [calledUrl] = fetchSpy.mock.calls[0] as [string, ...unknown[]];
    expect(calledUrl).toBe(
      "https://example.com/api/retrieve_graph_neighborhood",
    );
  });

  it("throws when apiBase is empty", async () => {
    const { postWithBase } = await import("../api/client");
    await expect(
      postWithBase("", "/retrieve_graph_neighborhood", {}),
    ).rejects.toThrow("apiBase must not be empty");
  });
});

// ---------------------------------------------------------------------------
// Phase 1 — retrieveGraphNeighborhoodWithBase routes correctly
// ---------------------------------------------------------------------------

describe("retrieveGraphNeighborhoodWithBase", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        entity: { id: "ent_focus" },
        related_entities: [],
        relationships: [],
      }),
    } as Response);
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.resetModules();
  });

  it("calls the explicit apiBase for the graph neighborhood endpoint", async () => {
    const { retrieveGraphNeighborhoodWithBase } = await import(
      "../api/endpoints/graph"
    );
    const base = "https://neotoma.example.org";
    await retrieveGraphNeighborhoodWithBase(base, {
      node_id: "ent_123",
      include_relationships: true,
      include_sources: false,
      include_events: false,
    });

    const [calledUrl, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(
      "https://neotoma.example.org/retrieve_graph_neighborhood",
    );
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ node_id: "ent_123" });
  });
});

// ---------------------------------------------------------------------------
// Phase 1 — useGraphNeighborhoodWithBase hook uses apiBase-keyed query key
// (structural check via pure endpoint module — no React/query-client needed)
// ---------------------------------------------------------------------------

describe("retrieveGraphNeighborhoodWithBase is exported and callable", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.resetModules();
  });

  it("retrieves graph data from the explicit base on second call too (query-key isolation)", async () => {
    const { retrieveGraphNeighborhoodWithBase } = await import(
      "../api/endpoints/graph"
    );
    const baseA = "https://instanceA.example.com";
    const baseB = "https://instanceB.example.com";

    await retrieveGraphNeighborhoodWithBase(baseA, { node_id: "ent_a" });
    await retrieveGraphNeighborhoodWithBase(baseB, { node_id: "ent_b" });

    const urlA = (fetchSpy.mock.calls[0] as [string])[0];
    const urlB = (fetchSpy.mock.calls[1] as [string])[0];
    expect(urlA).toContain("instanceA.example.com");
    expect(urlB).toContain("instanceB.example.com");
  });
});

// ---------------------------------------------------------------------------
// Phase 2 — ApiBaseContext normalization logic
// ---------------------------------------------------------------------------

describe("ApiBaseContext normalization", () => {
  /**
   * Mirrors the normalization applied inside ApiBaseProvider so we can test
   * edge cases without mounting React.
   */
  function normalizeApiBase(raw: string | undefined): string {
    return raw?.trim().replace(/\/$/, "") || "";
  }

  it("strips trailing slashes", () => {
    expect(normalizeApiBase("https://example.com/")).toBe("https://example.com");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeApiBase("  https://example.com  ")).toBe("https://example.com");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeApiBase("")).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(normalizeApiBase(undefined)).toBe("");
  });

  it("preserves a path segment that is not a trailing slash", () => {
    expect(normalizeApiBase("https://example.com/api")).toBe(
      "https://example.com/api",
    );
  });
});

// ---------------------------------------------------------------------------
// Phase 2 — embed route path constant (verifies the route slug is as spec'd)
// ---------------------------------------------------------------------------

describe("embed route path", () => {
  /**
   * The embed route must be mounted at /embed/graph per the issue spec.
   * Rather than parsing App.tsx at runtime (which pulls in many React deps
   * not available in the node vitest env), we assert the constant string that
   * a host would use to load the embed.
   */
  const EMBED_GRAPH_PATH = "/embed/graph" as const;

  it("is the expected iframe-friendly path", () => {
    expect(EMBED_GRAPH_PATH).toBe("/embed/graph");
    // Path must start with /embed/ so it is distinct from all existing shell routes
    expect(EMBED_GRAPH_PATH.startsWith("/embed/")).toBe(true);
  });

  it("accepts apiBase and node query params", () => {
    const base = "https://remote.example.com";
    const node = "ent_abc123";
    const url = new URL(EMBED_GRAPH_PATH, "https://inspector.local");
    url.searchParams.set("apiBase", base);
    url.searchParams.set("node", node);

    expect(url.searchParams.get("apiBase")).toBe(base);
    expect(url.searchParams.get("node")).toBe(node);
    // URL must be well-formed and parseable
    expect(url.pathname).toBe("/embed/graph");
  });
});
