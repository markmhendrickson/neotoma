import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../shared/api_client.js", () => ({
  createApiClient: vi.fn(() => ({
    POST: vi.fn().mockResolvedValue({
      data: {
        entity_ids: ["issue-entity-1", "conversation-entity-1", "message-entity-1"],
        issue_entity_id: "issue-entity-1",
        conversation_id: "conversation-entity-1",
        guest_access_token: "test-access-token-123",
      },
    }),
    GET: vi.fn().mockResolvedValue({
      data: { entity_id: "issue-entity-1", snapshot: { status: "open" } },
    }),
  })),
}));

vi.mock("./config.js", () => ({
  loadIssuesConfig: vi.fn().mockResolvedValue({
    target_url: "https://neotoma.example.com",
    repo: "test/repo",
    github_auth: "gh_cli",
    reporting_mode: "consent",
    sync_staleness_ms: 300000,
    configured_at: "2026-01-01T00:00:00Z",
    author_alias: null,
  }),
}));

import { submitIssueToRemote, addMessageToRemote, getRemoteIssueStatus } from "./neotoma_client.js";
import { createApiClient } from "../../shared/api_client.js";

type MockIssueApiClient = {
  POST: {
    mock: {
      calls: Array<[
        string,
        { body: Record<string, unknown> },
      ]>;
    };
  };
};

describe("Neotoma Issue Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEOTOMA_CLI_AAUTH_DISABLE;
  });

  describe("submitIssueToRemote", () => {
    it("submits an issue and returns entity IDs", async () => {
      const result = await submitIssueToRemote({
        title: "Test Issue",
        body: "Test body",
        labels: ["bug"],
        visibility: "public",
        githubUrl: "https://github.com/test/repo/issues/1",
        githubNumber: 1,
      });

      expect(result.issue_entity_id).toBe("issue-entity-1");
      expect(result.conversation_id).toBe("conversation-entity-1");
      expect(result.access_token).toBe("test-access-token-123");
      expect(createApiClient).toHaveBeenCalledWith({
        baseUrl: "https://neotoma.example.com",
        signWithCliAAuth: true,
      });
    });

    it("passes signWithCliAAuth false when NEOTOMA_CLI_AAUTH_DISABLE=1", async () => {
      process.env.NEOTOMA_CLI_AAUTH_DISABLE = "1";
      await submitIssueToRemote({
        title: "Private Issue",
        body: "Private body",
        visibility: "private",
      });
      expect(createApiClient).toHaveBeenCalledWith({
        baseUrl: "https://neotoma.example.com",
        signWithCliAAuth: false,
      });
    });

    it("includes github_url in the payload when provided", async () => {
      await submitIssueToRemote({
        title: "Public Issue",
        body: "Body",
        visibility: "public",
        githubUrl: "https://github.com/test/repo/issues/42",
        githubNumber: 42,
      });

      const mockClient = vi.mocked(createApiClient).mock.results[0]?.value as unknown as MockIssueApiClient;
      expect(mockClient.POST).toBeDefined();
    });

    it("adds deterministic identity fields for private local submissions", async () => {
      await submitIssueToRemote({
        title: "Private Issue",
        body: "Private body",
        visibility: "private",
      });

      const mockClient = vi.mocked(createApiClient).mock.results[0]?.value as unknown as MockIssueApiClient;
      const [path, request] = mockClient.POST.mock.calls[0];

      expect(path).toBe("/issues/submit");
      expect(request.body.github_number).toBeUndefined();
      expect(String(request.body.local_issue_id)).toMatch(/^local:test\/repo:/);
    });

    it("returns guest token from the guest issue submit endpoint", async () => {
      const post = vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            entity_ids: ["issue-entity-1", "conversation-entity-1", "message-entity-1"],
            issue_entity_id: "issue-entity-1",
            conversation_id: "conversation-entity-1",
            guest_access_token: "test-access-token-123",
          },
        });
      vi.mocked(createApiClient).mockReturnValueOnce({
        POST: post,
        GET: vi.fn(),
      } as unknown as ReturnType<typeof createApiClient>);

      const result = await submitIssueToRemote({
        title: "Public Issue",
        body: "Body",
        visibility: "public",
        githubUrl: "https://github.com/test/repo/issues/42",
        githubNumber: 42,
        author: "octocat",
        authorGithubId: 1,
        authorGithubType: "User",
      });

      expect(result.issue_entity_id).toBe("issue-entity-1");
      expect(result.access_token).toBe("test-access-token-123");
      expect(post.mock.calls).toHaveLength(1);
      expect(post.mock.calls[0][0]).toBe("/issues/submit");
    });
  });

  describe("addMessageToRemote", () => {
    it("posts a message to the remote conversation", async () => {
      const result = await addMessageToRemote({
        githubIssueNumber: 1,
        body: "Follow-up message",
      });

      expect(result.message_entity_id).toBeDefined();
    });

    it("uses guest issue message endpoint when a token is available", async () => {
      const result = await addMessageToRemote({
        issue_entity_id: "issue-entity-1",
        guest_access_token: "test-token",
        body: "Token follow-up",
      });

      const mockClient = vi.mocked(createApiClient).mock.results[0]?.value as unknown as MockIssueApiClient;
      expect(mockClient.POST.mock.calls[0][0]).toBe("/issues/add_message");
      expect(mockClient.POST.mock.calls[0][1].body).toMatchObject({
        entity_id: "issue-entity-1",
        body: "Token follow-up",
        guest_access_token: "test-token",
      });
      expect(result.message_entity_id).toBeDefined();
    });
  });

  describe("getRemoteIssueStatus", () => {
    it("retrieves issue status from remote", async () => {
      const result = await getRemoteIssueStatus({
        issueEntityId: "issue-entity-1",
        accessToken: "test-token",
      });

      expect(result).toBeDefined();
    });
  });
});
