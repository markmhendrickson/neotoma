import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A minimal in-memory localStorage — the client module only needs get/set/
// remove/clear. Avoids depending on a jsdom environment (which fails to load
// under this repo's ESM/symlink toolchain) for what is a tiny key-value store.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string): string | null {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.store.set(k, String(v));
  }
  removeItem(k: string): void {
    this.store.delete(k);
  }
  clear(): void {
    this.store.clear();
  }
}
vi.stubGlobal("localStorage", new MemoryStorage());

import {
  clearAuthToken,
  getAuthToken,
  getRefreshToken,
  getTokenExpiresAt,
  setApiUrl,
  setAuthSession,
} from "./client";

/**
 * #2005 — the Inspector obtained a refresh_token from /mcp/oauth/token but
 * discarded it, so a 1-hour access token hard-expired and signed the user out
 * with a valid refresh token unused. These tests exercise: (1) the session
 * bundle persists refresh_token + expiry, (2) a 401 transparently refreshes and
 * retries, (3) concurrent 401s coalesce onto one refresh, (4) a dead refresh
 * token clears the session instead of looping.
 */

const API_BASE = "https://instance.example";

function tokenResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Inspector OAuth token refresh (#2005)", () => {
  beforeEach(() => {
    localStorage.clear();
    setApiUrl(API_BASE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe("setAuthSession persistence", () => {
    it("stores the refresh token and a computed expiry", () => {
      setAuthSession({ access_token: "acc-1", refresh_token: "ref-1", expires_in: 3600 });
      expect(getAuthToken()).toBe("acc-1");
      expect(getRefreshToken()).toBe("ref-1");
      const exp = getTokenExpiresAt();
      expect(exp).not.toBeNull();
      // ~1 hour out, allowing a little slack for test wall-time.
      expect(exp! - Date.now()).toBeGreaterThan(3500 * 1000);
    });

    it("clears refresh state when a bundle has no refresh token (pasted bearer)", () => {
      setAuthSession({ access_token: "acc-1", refresh_token: "ref-1", expires_in: 3600 });
      setAuthSession({ access_token: "pasted-bearer" });
      expect(getAuthToken()).toBe("pasted-bearer");
      expect(getRefreshToken()).toBeNull();
      expect(getTokenExpiresAt()).toBeNull();
    });

    it("clearAuthToken purges access, refresh, and expiry", () => {
      setAuthSession({ access_token: "acc-1", refresh_token: "ref-1", expires_in: 3600 });
      clearAuthToken();
      expect(getAuthToken()).toBeNull();
      expect(getRefreshToken()).toBeNull();
      expect(getTokenExpiresAt()).toBeNull();
    });
  });

  describe("401 refresh-and-retry", () => {
    it("refreshes on a 401 and retries the original request transparently", async () => {
      const { get } = await import("./client");
      setAuthSession({ access_token: "stale", refresh_token: "ref-1", expires_in: 3600 });

      const fetchMock = vi
        .fn()
        // 1. original request with the stale token → 401
        .mockResolvedValueOnce(new Response("Invalid token", { status: 401 }))
        // 2. refresh exchange → new bundle
        .mockResolvedValueOnce(
          tokenResponse({ access_token: "fresh", refresh_token: "ref-2", expires_in: 3600 })
        )
        // 3. retried request with the fresh token → 200
        .mockResolvedValueOnce(tokenResponse({ total: 42 }));
      vi.stubGlobal("fetch", fetchMock);

      const result = await get<{ total: number }>("/totals");
      expect(result).toEqual({ total: 42 });
      expect(fetchMock).toHaveBeenCalledTimes(3);

      // The refresh call used grant_type=refresh_token with the stored token.
      const refreshBody = String(fetchMock.mock.calls[1]![1]!.body);
      expect(refreshBody).toContain("grant_type=refresh_token");
      expect(refreshBody).toContain("refresh_token=ref-1");

      // The rotated token replaced the old one, and the retry used the new access token.
      expect(getRefreshToken()).toBe("ref-2");
      const retryAuth = (fetchMock.mock.calls[2]![1]!.headers as Record<string, string>)[
        "Authorization"
      ];
      expect(retryAuth).toBe("Bearer fresh");
    });

    it("does not retry more than once — a persistent 401 surfaces the auth error", async () => {
      const { get } = await import("./client");
      setAuthSession({ access_token: "stale", refresh_token: "ref-1", expires_in: 3600 });

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response("Invalid token", { status: 401 })) // original
        .mockResolvedValueOnce(
          tokenResponse({ access_token: "fresh", refresh_token: "ref-2", expires_in: 3600 })
        ) // refresh ok
        .mockResolvedValueOnce(new Response("Invalid token", { status: 401 })); // retry still 401
      vi.stubGlobal("fetch", fetchMock);

      await expect(get("/totals")).rejects.toThrow(/session is no longer valid/i);
      // original + refresh + one retry = 3; no second retry loop.
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("clears the session when the refresh token itself is rejected", async () => {
      const { get } = await import("./client");
      setAuthSession({ access_token: "stale", refresh_token: "dead", expires_in: 3600 });

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response("Invalid token", { status: 401 })) // original
        .mockResolvedValueOnce(new Response("invalid_grant", { status: 400 })); // refresh rejected
      vi.stubGlobal("fetch", fetchMock);

      await expect(get("/totals")).rejects.toThrow();
      // Session cleared so the UI shows sign-in rather than looping on a dead token.
      expect(getAuthToken()).toBeNull();
      expect(getRefreshToken()).toBeNull();
    });

    it("coalesces concurrent 401s onto a single refresh exchange", async () => {
      const { get } = await import("./client");
      setAuthSession({ access_token: "stale", refresh_token: "ref-1", expires_in: 3600 });

      let refreshCalls = 0;
      const fetchMock = vi.fn((url: string, init?: RequestInit) => {
        const body = init?.body ? String(init.body) : "";
        if (body.includes("grant_type=refresh_token")) {
          refreshCalls += 1;
          return Promise.resolve(
            tokenResponse({ access_token: "fresh", refresh_token: "ref-2", expires_in: 3600 })
          );
        }
        const auth = (init?.headers as Record<string, string>)?.["Authorization"];
        // Stale token → 401; fresh token → 200.
        if (auth === "Bearer stale") {
          return Promise.resolve(new Response("Invalid token", { status: 401 }));
        }
        return Promise.resolve(tokenResponse({ ok: true }));
      });
      vi.stubGlobal("fetch", fetchMock);

      // Fire several requests at once, all starting with the stale token.
      await Promise.all([get("/a"), get("/b"), get("/c"), get("/d")]);
      // The one-time-use refresh token must be spent exactly once.
      expect(refreshCalls).toBe(1);
    });
  });
});
