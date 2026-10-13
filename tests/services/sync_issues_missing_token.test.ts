import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Operations } from "../../src/core/operations.js";

// Uses the REAL github_client so the token-missing message under test is the one
// callers actually see. Only token resolution, config and the network are stubbed.
const { mockResolveToken, mockLoadIssuesConfig } = vi.hoisted(() => ({
  mockResolveToken: vi.fn(),
  mockLoadIssuesConfig: vi.fn(),
}));

vi.mock("../../src/services/issues/gh_auth.js", () => ({
  resolveGitHubToken: (...args: unknown[]) => mockResolveToken(...args),
}));

vi.mock("../../src/services/issues/config.js", () => ({
  loadIssuesConfig: (...args: unknown[]) => mockLoadIssuesConfig(...args),
}));

import { syncIssuesFromGitHub } from "../../src/services/issues/sync_issues_from_github.js";
import { missingGitHubTokenMessage } from "../../src/services/issues/github_client.js";

function createOps(): Operations {
  return {
    store: vi.fn(),
    correct: vi.fn(),
    retrieveEntities: vi.fn(async () => ({ entities: [] })),
  } as unknown as Operations;
}

describe("sync_issues with no GitHub token (#2536)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveToken.mockResolvedValue(null);
    mockLoadIssuesConfig.mockResolvedValue({
      repo: "test/repo",
      allowed_repos: ["acme/widgets"],
      sync_staleness_ms: 300_000,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network must not be reached without a token");
      })
    );
  });

  it("names the NEOTOMA_ISSUES_GITHUB_TOKEN setting and the repo in the sync error", async () => {
    const result = await syncIssuesFromGitHub(createOps(), { repo: "acme/widgets" });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("NEOTOMA_ISSUES_GITHUB_TOKEN");
    expect(result.errors[0]).toContain("acme/widgets");
    expect(result.errors[0]).toContain("server");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("names the setting for a dry run too", async () => {
    const result = await syncIssuesFromGitHub(createOps(), { commit: false });

    expect(result.dry_run).toBe(true);
    expect(result.errors[0]).toContain("NEOTOMA_ISSUES_GITHUB_TOKEN");
  });

  it("formats the message without a repo", () => {
    expect(missingGitHubTokenMessage()).toContain("NEOTOMA_ISSUES_GITHUB_TOKEN");
  });
});
