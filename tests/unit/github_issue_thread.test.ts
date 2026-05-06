import { describe, expect, it } from "vitest";

import { githubIssueThreadConversationId } from "../../src/services/issues/github_issue_thread.js";

describe("githubIssueThreadConversationId", () => {
  it("returns stable id for owner/repo and positive number", () => {
    expect(githubIssueThreadConversationId("acme/widgets", 42)).toBe(
      "github_issue_thread:acme/widgets#42",
    );
  });

  it("trims repo", () => {
    expect(githubIssueThreadConversationId("  acme/widgets  ", 1)).toBe(
      "github_issue_thread:acme/widgets#1",
    );
  });

  it("returns undefined for non-positive issue number", () => {
    expect(githubIssueThreadConversationId("acme/widgets", 0)).toBeUndefined();
    expect(githubIssueThreadConversationId("acme/widgets", -1)).toBeUndefined();
  });

  it("returns undefined for empty repo", () => {
    expect(githubIssueThreadConversationId("", 1)).toBeUndefined();
    expect(githubIssueThreadConversationId("   ", 1)).toBeUndefined();
  });
});
