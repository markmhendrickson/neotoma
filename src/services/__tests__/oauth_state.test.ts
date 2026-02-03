import { describe, expect, it, afterEach, vi } from "vitest";
import { createOAuthState, consumeOAuthState } from "../oauth_state.js";

describe("oauth_state service", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates entries and consumes them once", () => {
    const { state, codeChallenge } = createOAuthState({
      provider: "example",
      bearerToken: "test-token",
    });

    expect(state).toBeTruthy();
    expect(codeChallenge).toMatch(/^[A-Za-z0-9\-_]+$/);

    const entry = consumeOAuthState(state);
    expect(entry).not.toBeNull();
    expect(entry?.provider).toBe("example");
    expect(entry?.bearerToken).toBe("test-token");

    const replay = consumeOAuthState(state);
    expect(replay).toBeNull();
  });

  it("expires states after ttl", () => {
    vi.useFakeTimers();

    const { state } = createOAuthState({
      provider: "example",
      bearerToken: "token",
    });

    vi.advanceTimersByTime(11 * 60 * 1000);

    const entry = consumeOAuthState(state);
    expect(entry).toBeNull();
  });
});
