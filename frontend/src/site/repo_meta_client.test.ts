import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchGitHubStarsCount,
  fetchNpmLatestVersion,
  parseShieldsCountMessage,
} from "./repo_meta_client";

describe("parseShieldsCountMessage", () => {
  it("parses plain integers", () => {
    expect(parseShieldsCountMessage("9")).toBe(9);
    expect(parseShieldsCountMessage("1,234")).toBe(1234);
  });

  it("parses compact suffixes", () => {
    expect(parseShieldsCountMessage("1.2k")).toBe(1200);
    expect(parseShieldsCountMessage("3M")).toBe(3_000_000);
  });

  it("rejects invalid strings", () => {
    expect(() => parseShieldsCountMessage("")).toThrow();
    expect(() => parseShieldsCountMessage("n/a")).toThrow();
  });
});

describe("fetchNpmLatestVersion", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: "9.8.7" }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns version from npm latest document", async () => {
    await expect(fetchNpmLatestVersion("neotoma")).resolves.toBe("9.8.7");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("https://registry.npmjs.org/neotoma/latest");
  });

  it("throws on non-ok response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(fetchNpmLatestVersion("x")).rejects.toThrow("npm registry 500");
  });
});

describe("fetchGitHubStarsCount", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns count from shields message field", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: "42", value: "42" }),
    });
    await expect(fetchGitHubStarsCount("owner", "repo")).resolves.toBe(42);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "https://img.shields.io/github/stars/owner/repo.json"
    );
  });

  it("falls back to value field", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: "7" }),
    });
    await expect(fetchGitHubStarsCount("a", "b")).resolves.toBe(7);
  });

  it("throws on non-ok response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(fetchGitHubStarsCount("o", "r")).rejects.toThrow("shields.io 503");
  });
});
