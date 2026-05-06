import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreateIssue = vi.fn();
const mockAddIssueComment = vi.fn();
const mockSubmitIssueToRemote = vi.fn();
const mockAddMessageToRemote = vi.fn();
const mockStore = vi.fn();
const mockRetrieveEntityByIdentifier = vi.fn();
const mockRetrieveRelatedEntities = vi.fn();
const mockSyncIssueIfStale = vi.fn();

const { mockLoadIssuesConfig } = vi.hoisted(() => ({
  mockLoadIssuesConfig: vi.fn(),
}));

const defaultIssuesConfig = {
  target_url: "https://neotoma.example.com",
  repo: "test/repo",
  github_auth: "gh_cli" as const,
  reporting_mode: "proactive" as const,
  sync_staleness_ms: 300000,
  configured_at: "2026-01-01T00:00:00Z",
};

vi.mock("./github_client.js", () => ({
  createIssue: (...args: unknown[]) => mockCreateIssue(...args),
  addIssueComment: (...args: unknown[]) => mockAddIssueComment(...args),
  mergeNeotomaToolingIssueLabels: (labels?: string[]) => [
    "neotoma",
    ...(labels ?? []).filter((label) => label !== "neotoma"),
  ],
}));

vi.mock("./neotoma_client.js", () => ({
  submitIssueToRemote: (...args: unknown[]) => mockSubmitIssueToRemote(...args),
  addMessageToRemote: (...args: unknown[]) => mockAddMessageToRemote(...args),
}));

vi.mock("./config.js", () => ({
  loadIssuesConfig: (...args: unknown[]) => mockLoadIssuesConfig(...args),
}));

vi.mock("./sync.js", () => ({
  syncIssueIfStale: (...args: unknown[]) => mockSyncIssueIfStale(...args),
}));

import { submitIssue, addIssueMessage, getIssueStatus } from "./issue_operations.js";
import type { Operations } from "../../core/operations.js";

function createMockOps(): Operations {
  return {
    store: mockStore.mockResolvedValue({
      structured: {
        entities: [
          { entity_id: "local-issue-1" },
          { entity_id: "local-conv-1" },
          { entity_id: "local-msg-1" },
        ],
      },
    }),
    storeStructured: mockStore,
    storeUnstructured: mockStore,
    retrieveEntities: vi.fn(),
    retrieveEntityByIdentifier: mockRetrieveEntityByIdentifier,
    retrieveEntitySnapshot: vi.fn(),
    listTimelineEvents: vi.fn(),
    retrieveRelatedEntities: mockRetrieveRelatedEntities,
    createRelationship: vi.fn(),
    createRelationships: vi.fn(),
  } as unknown as Operations;
}

describe("Issue Operations (Neotoma-canonical)", () => {
  let ops: Operations;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadIssuesConfig.mockResolvedValue({ ...defaultIssuesConfig });
    ops = createMockOps();
  });

  describe("submitIssue", () => {
    it("pushes public issues to GitHub first, then Neotoma", async () => {
      mockCreateIssue.mockResolvedValue({
        number: 42,
        html_url: "https://github.com/test/repo/issues/42",
        user: { login: "tester" },
        created_at: "2026-05-01T00:00:00Z",
      });
      mockSubmitIssueToRemote.mockResolvedValue({
        entity_ids: ["remote-issue-1", "remote-conv-1", "remote-msg-1"],
        issue_entity_id: "remote-issue-1",
        conversation_id: "remote-conv-1",
        access_token: "token-abc",
      });

      const result = await submitIssue(ops, {
        title: "Public Bug",
        body: "Something broke",
        labels: ["bug"],
        visibility: "public",
      });

      expect(mockCreateIssue).toHaveBeenCalledWith({
        title: "Public Bug",
        body: "Something broke",
        labels: ["neotoma", "bug"],
      });
      expect(mockSubmitIssueToRemote).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Public Bug",
          visibility: "public",
          githubUrl: "https://github.com/test/repo/issues/42",
          githubNumber: 42,
        }),
      );
      expect(result.pushed_to_github).toBe(true);
      expect(result.submitted_to_neotoma).toBe(true);
      expect(result.issue_number).toBe(42);
    });

    it("does NOT push private issues to GitHub", async () => {
      mockSubmitIssueToRemote.mockResolvedValue({
        entity_ids: ["remote-issue-1", "remote-conv-1"],
        issue_entity_id: "remote-issue-1",
        conversation_id: "remote-conv-1",
      });

      const result = await submitIssue(ops, {
        title: "Private Report",
        body: "Contains PII",
        visibility: "private",
      });

      expect(mockCreateIssue).not.toHaveBeenCalled();
      expect(mockSubmitIssueToRemote).toHaveBeenCalledWith(
        expect.objectContaining({ visibility: "private" }),
      );
      expect(result.pushed_to_github).toBe(false);
      expect(result.submitted_to_neotoma).toBe(true);
    });

    it("maps legacy 'advisory' to 'private'", async () => {
      mockSubmitIssueToRemote.mockResolvedValue({
        entity_ids: ["remote-issue-1"],
        issue_entity_id: "remote-issue-1",
        conversation_id: "remote-conv-1",
      });

      await submitIssue(ops, {
        title: "Advisory Test",
        body: "Legacy",
        visibility: "advisory",
      });

      expect(mockCreateIssue).not.toHaveBeenCalled();
      expect(mockSubmitIssueToRemote).toHaveBeenCalledWith(
        expect.objectContaining({ visibility: "private" }),
      );
    });

    it("continues locally when GitHub push fails", async () => {
      mockCreateIssue.mockRejectedValue(new Error("GitHub unavailable"));
      mockSubmitIssueToRemote.mockResolvedValue({
        entity_ids: ["remote-1"],
        issue_entity_id: "remote-1",
        conversation_id: "remote-conv-1",
      });

      const result = await submitIssue(ops, {
        title: "Resilient Issue",
        body: "Still submits to Neotoma",
        visibility: "public",
      });

      expect(result.pushed_to_github).toBe(false);
      expect(result.submitted_to_neotoma).toBe(true);
    });

    it("throws after local store when remote Neotoma fails (target URL configured)", async () => {
      mockCreateIssue.mockResolvedValue({
        number: 99,
        html_url: "https://github.com/test/repo/issues/99",
        user: { login: "user" },
        created_at: "2026-05-01T00:00:00Z",
      });
      mockSubmitIssueToRemote.mockRejectedValue(new Error("Network error"));

      await expect(
        submitIssue(ops, {
          title: "Partially Failed",
          body: "Body",
          visibility: "public",
        }),
      ).rejects.toThrow(/Failed to submit issue to Neotoma at https:\/\/neotoma\.example\.com/);

      expect(mockStore).toHaveBeenCalled();
    });

    it("does not require remote when issues.target_url is empty", async () => {
      mockLoadIssuesConfig.mockResolvedValue({
        ...defaultIssuesConfig,
        target_url: "",
      });
      mockCreateIssue.mockResolvedValue({
        number: 1,
        html_url: "https://github.com/test/repo/issues/1",
        user: { login: "user" },
        created_at: "2026-05-01T00:00:00Z",
      });

      const result = await submitIssue(ops, {
        title: "Local only",
        body: "Body",
        visibility: "public",
      });

      expect(mockSubmitIssueToRemote).not.toHaveBeenCalled();
      expect(result.submitted_to_neotoma).toBe(false);
      expect(result.pushed_to_github).toBe(true);
    });
  });

  describe("addIssueMessage", () => {
    it("submits message to remote Neotoma and GitHub", async () => {
      mockAddMessageToRemote.mockResolvedValue({ message_entity_id: "remote-msg-1" });
      mockAddIssueComment.mockResolvedValue({
        id: 456,
        body: "Comment",
        user: { login: "commenter" },
        created_at: "2026-05-01T10:00:00Z",
        updated_at: "2026-05-01T10:00:00Z",
        html_url: "https://github.com/test/repo/issues/1#issuecomment-456",
      });

      const result = await addIssueMessage(ops, {
        issue_number: 1,
        body: "Follow-up comment",
      });

      expect(result.submitted_to_neotoma).toBe(true);
      expect(result.pushed_to_github).toBe(true);
      expect(result.github_comment_id).toBe("456");
    });

    it("throws after local store when remote Neotoma fails", async () => {
      mockAddMessageToRemote.mockRejectedValue(new Error("ECONNREFUSED"));
      mockAddIssueComment.mockResolvedValue({
        id: 789,
        body: "Comment",
        user: { login: "commenter" },
        created_at: "2026-05-01T10:00:00Z",
        updated_at: "2026-05-01T10:00:00Z",
        html_url: "https://github.com/test/repo/issues/1#issuecomment-789",
      });

      await expect(
        addIssueMessage(ops, {
          issue_number: 1,
          body: "Follow-up",
        }),
      ).rejects.toThrow(/Failed to submit issue message to Neotoma at https:\/\/neotoma\.example\.com/);

      expect(mockStore).toHaveBeenCalled();
    });
  });

  describe("getIssueStatus", () => {
    it("retrieves local entity and related messages", async () => {
      mockRetrieveEntityByIdentifier.mockResolvedValue({
        entity_id: "local-issue-1",
        snapshot: {
          title: "Test Issue",
          status: "open",
          labels: ["bug"],
          github_url: "https://github.com/test/repo/issues/1",
          author: "tester",
          created_at: "2026-05-01T00:00:00Z",
          closed_at: null,
          last_synced_at: "2026-05-01T00:00:00Z",
        },
      });
      mockRetrieveRelatedEntities
        .mockResolvedValueOnce({
          entities: [
            { entity_id: "conv-1", entity_type: "conversation", snapshot: {} },
          ],
        })
        .mockResolvedValueOnce({
          entities: [
            {
              entity_type: "conversation_message",
              snapshot: {
                author: "tester",
                content: "First message",
                created_at: "2026-05-01T00:00:00Z",
              },
            },
          ],
        });
      mockSyncIssueIfStale.mockResolvedValue(false);

      const result = await getIssueStatus(ops, { issue_number: 1 });

      expect(result.title).toBe("Test Issue");
      expect(result.status).toBe("open");
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].author).toBe("tester");
    });
  });
});
