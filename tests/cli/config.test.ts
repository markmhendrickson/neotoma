import { describe, expect, it } from "vitest";

import {
  DEFAULT_BASE_URL,
  baseUrlFromOption,
  isTokenExpired,
} from "../../src/cli/config.js";

describe("cli config helpers", () => {
  it("prefers explicit baseUrl option", () => {
    expect(baseUrlFromOption("http://example.com", {})).toBe("http://example.com");
  });

  it("falls back to config base_url", () => {
    expect(baseUrlFromOption(undefined, { base_url: "http://config.test" })).toBe(
      "http://config.test"
    );
  });

  it("falls back to default base URL", () => {
    expect(baseUrlFromOption(undefined, {})).toBe(DEFAULT_BASE_URL);
  });

  it("treats missing expires_at as expired", () => {
    expect(isTokenExpired({})).toBe(true);
  });

  it("detects expired tokens", () => {
    expect(isTokenExpired({ expires_at: "2000-01-01T00:00:00Z" })).toBe(true);
  });

  it("detects valid tokens", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isTokenExpired({ expires_at: future })).toBe(false);
  });
});
