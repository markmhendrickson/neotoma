import { describe, expect, it } from "vitest";

import {
  extractBreakingExcerpt,
  npmPackageVersionUrl,
  parseGithubRepoFromNpmMetadata,
} from "./release_notes_enrichment.js";

describe("npmPackageVersionUrl", () => {
  it("builds npmjs version URL", () => {
    expect(npmPackageVersionUrl("neotoma", "0.11.0")).toBe(
      "https://www.npmjs.com/package/neotoma/v/0.11.0"
    );
  });
});

describe("parseGithubRepoFromNpmMetadata", () => {
  it("parses git+https URL", () => {
    expect(parseGithubRepoFromNpmMetadata("git+https://github.com/foo/bar.git")).toEqual({
      owner: "foo",
      repo: "bar",
    });
  });
  it("parses object url", () => {
    expect(
      parseGithubRepoFromNpmMetadata({ type: "git", url: "https://github.com/acme/pkg" })
    ).toEqual({ owner: "acme", repo: "pkg" });
  });
  it("returns null for non-github", () => {
    expect(parseGithubRepoFromNpmMetadata("https://gitlab.com/a/b")).toBeNull();
  });
});

describe("extractBreakingExcerpt", () => {
  it("extracts section after breaking heading", () => {
    const md = "# X\n\n## Breaking changes\n\nDo not use foo.\n\n## Other\n\nHi";
    const ex = extractBreakingExcerpt(md);
    expect(ex).toContain("Do not use foo");
    expect(ex).not.toContain("## Other");
  });
});
