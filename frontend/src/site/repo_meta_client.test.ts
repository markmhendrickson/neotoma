import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchGitHubPublishedReleasesCount, fetchNpmLatestVersion } from "./repo_meta_client";

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

describe("fetchGitHubPublishedReleasesCount", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("counts non-draft releases on one page", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { draft: false },
        { draft: true },
        { draft: false },
      ],
    });
    await expect(
      fetchGitHubPublishedReleasesCount("owner", "repo")
    ).resolves.toBe(2);
  });

  it("paginates until a short page", async () => {
    const fullPage = Array.from({ length: 100 }, () => ({ draft: false }));
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => fullPage,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ draft: false }],
      });
    await expect(fetchGitHubPublishedReleasesCount("o", "r")).resolves.toBe(101);
  });
});
