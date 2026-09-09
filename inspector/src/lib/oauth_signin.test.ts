import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { getAuthToken, setApiUrl, setAuthSession } from "../api/client";
import { signOutOAuthSession } from "./oauth_signin";

const API_BASE = "https://instance.example";

/**
 * #2227 UX gate — effect-level: Sign out clears the Inspector auth bundle
 * only after a 2xx from POST /mcp/oauth/sign-out. A failed POST must leave
 * local auth intact so Settings does not falsely claim signed-out
 * (policy fixed_means_behavior_verified_not_contract_accepted).
 */
describe("signOutOAuthSession (#2227)", () => {
  beforeEach(() => {
    localStorage.clear();
    setApiUrl(API_BASE);
    setAuthSession({ access_token: "acc-1", refresh_token: "ref-1", expires_in: 3600 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("POSTs /mcp/oauth/sign-out with credentials and clears local auth on 2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await signOutOAuthSession();

    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/mcp/oauth/sign-out`, {
      method: "POST",
      credentials: "include",
    });
    expect(getAuthToken()).toBeNull();
  });

  it("leaves local auth intact and throws on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("upstream unavailable", { status: 503 }))
    );

    await expect(signOutOAuthSession()).rejects.toThrow(/Sign out failed|upstream unavailable/);
    expect(getAuthToken()).toBe("acc-1");
  });

  it("leaves local auth intact and throws on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to fetch")));

    await expect(signOutOAuthSession()).rejects.toThrow("Failed to fetch");
    expect(getAuthToken()).toBe("acc-1");
  });
});
