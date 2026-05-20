import { describe, expect, it } from "vitest";

import { buildGithubMirrorGuidance } from "../../src/services/issues/issue_operations.js";

describe("buildGithubMirrorGuidance", () => {
  it("includes auth and update steps", () => {
    const g = buildGithubMirrorGuidance(
      new Error("No GitHub token available. Run `gh auth login` or set NEOTOMA_ISSUES_GITHUB_TOKEN."),
    );
    expect(g).toMatch(/NEOTOMA_ISSUES_GITHUB_TOKEN/);
    expect(g).toMatch(/gh auth login/);
    expect(g).toMatch(/github_number/);
    expect(g).toMatch(/github_url/);
    expect(g).toMatch(/Cause:/);
  });

  it("truncates long causes", () => {
    const long = "x".repeat(500);
    const g = buildGithubMirrorGuidance(new Error(long));
    expect(g.length).toBeLessThan(long.length + 400);
    expect(g).toMatch(/Cause: x+…/);
  });

  it("handles missing cause", () => {
    const g = buildGithubMirrorGuidance(undefined);
    expect(g).toMatch(/Cause: unknown error/);
  });
});
