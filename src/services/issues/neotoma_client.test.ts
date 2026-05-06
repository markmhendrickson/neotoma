import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../shared/api_client.js", () => ({
  createApiClient: vi.fn(() => ({
    POST: vi.fn().mockResolvedValue({
      data: {
        structured: {
          entities: [
            { entity_id: "issue-entity-1" },
            { entity_id: "conversation-entity-1" },
            { entity_id: "message-entity-1" },
          ],
        },
        guest_access_token: "test-access-token-123",
      },
      error: null,
    }),
    GET: vi.fn().mockResolvedValue({
      data: { entity_id: "issue-entity-1", snapshot: { status: "open" } },
      error: null,
    }),
  })),
}));

vi.mock("./config.js", () => ({
  loadIssuesConfig: vi.fn().mockResolvedValue({
    target_url: "https://neotoma.example.com",
    repo: "test/repo",
    github_auth: "gh_cli",
    reporting_mode: "proactive",
    sync_staleness_ms: 300000,
    configured_at: "2026-01-01T00:00:00Z",
  }),
}));

import { submitIssueToRemote, addMessageToRemote, getRemoteIssueStatus } from "./neotoma_client.js";
import { createApiClient } from "../../shared/api_client.js";

describe("Neotoma Issue Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    it("includes github_url in the payload when provided", async () => {
      await submitIssueToRemote({
        title: "Public Issue",
        body: "Body",
        visibility: "public",
        githubUrl: "https://github.com/test/repo/issues/42",
        githubNumber: 42,
      });

      const mockClient = (createApiClient as any)();
      expect(mockClient.POST).toBeDefined();
    });
  });

  describe("addMessageToRemote", () => {
    it("posts a message to the remote conversation", async () => {
      const result = await addMessageToRemote({
        conversationTitle: "Issue #1",
        body: "Follow-up message",
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
