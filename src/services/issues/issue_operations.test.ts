import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreateIssue = vi.fn();
const mockAddIssueComment = vi.fn();
const mockSubmitIssueToRemote = vi.fn();
const mockAddMessageToRemote = vi.fn();
const mockStore = vi.fn();
const mockRetrieveEntityByIdentifier = vi.fn();
const mockRetrieveEntitySnapshot = vi.fn();
const mockRetrieveRelatedEntities = vi.fn();
const mockSyncIssueIfStale = vi.fn();

const { mockLoadIssuesConfig } = vi.hoisted(() => ({
  mockLoadIssuesConfig: vi.fn(),
}));

const { mockGenerateGuestAccessToken, mockHashGuestAccessToken } = vi.hoisted(() => ({
  mockGenerateGuestAccessToken: vi.fn(),
  mockHashGuestAccessToken: vi.fn(),
}));

const defaultIssuesConfig = {
  target_url: "https://neotoma.example.com",
  repo: "test/repo",
  github_auth: "gh_cli" as const,
  reporting_mode: "consent" as const,
  sync_staleness_ms: 300000,
  configured_at: "2026-01-01T00:00:00Z",
  author_alias: null,
};

vi.mock("./github_client.js", () => ({
  createIssue: (...args: unknown[]) => mockCreateIssue(...args),
  addIssueComment: (...args: unknown[]) => mockAddIssueComment(...args),
  mergeNeotomaToolingIssueLabels: (labels?: string[]) => [
    "neotoma",
    ...(labels ?? []).filter((label) => label !== "neotoma"),
  ],
}));

const mockFetchRemoteIssueThread = vi.fn();

vi.mock("./neotoma_client.js", () => ({
  submitIssueToRemote: (...args: unknown[]) => mockSubmitIssueToRemote(...args),
  addMessageToRemote: (...args: unknown[]) => mockAddMessageToRemote(...args),
  fetchRemoteIssueThread: (...args: unknown[]) => mockFetchRemoteIssueThread(...args),
}));

vi.mock("./config.js", () => ({
  loadIssuesConfig: (...args: unknown[]) => mockLoadIssuesConfig(...args),
}));

vi.mock("../guest_access_token.js", () => ({
  generateGuestAccessToken: (...args: unknown[]) => mockGenerateGuestAccessToken(...args),
  hashGuestAccessToken: (...args: unknown[]) => mockHashGuestAccessToken(...args),
}));

vi.mock("./sync_issues_from_github.js", () => ({
  syncIssueIfStale: (...args: unknown[]) => mockSyncIssueIfStale(...args),
}));

import {
  submitIssue,
  submitGuestIssue,
  addIssueMessage,
  getIssueStatus,
  resolveIssueRow,
} from "./issue_operations.js";
import type { Operations } from "../../core/operations.js";
import { IssueTransportError } from "./errors.js";
import { getRequestContext, runWithRequestContext } from "../request_context.js";

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
    retrieveEntitySnapshot: mockRetrieveEntitySnapshot,
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
    mockGenerateGuestAccessToken.mockResolvedValue("guest-token");
    mockHashGuestAccessToken.mockReturnValue("hashed-guest-token");
    mockFetchRemoteIssueThread.mockResolvedValue(null);
    ops = createMockOps();
    mockRetrieveEntitySnapshot.mockImplementation(async (input: { entity_id: string }) => ({
      entity_type: "issue",
      entity_id: input.entity_id,
      snapshot: {
        title: "Test Issue",
        status: "open",
        labels: ["bug"],
        github_number: 1,
        github_url: "https://github.com/test/repo/issues/1",
        author: "tester",
        created_at: "2026-05-01T00:00:00Z",
        closed_at: null,
        last_synced_at: "2026-05-01T00:00:00Z",
      },
    }));
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
        reporter_git_sha: "abc1234",
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
      expect(result.guest_access_token).toBe("token-abc");
    });

    it("does NOT push private issues to GitHub", async () => {
      mockSubmitIssueToRemote.mockResolvedValue({
        entity_ids: ["remote-issue-1", "remote-conv-1"],
        issue_entity_id: "remote-issue-1",
        conversation_id: "remote-conv-1",
        access_token: "private-token",
      });

      const result = await submitIssue(ops, {
        title: "Private Report",
        body: "Contains PII",
        visibility: "private",
        reporter_git_sha: "abc1234",
      });

      expect(mockCreateIssue).not.toHaveBeenCalled();
      expect(mockSubmitIssueToRemote).toHaveBeenCalledWith(
        expect.objectContaining({ visibility: "private" }),
      );
      const storeInput = mockStore.mock.calls[0]?.[0] as {
        entities: Array<Record<string, unknown>>;
      };
      const [issue, conversation, message] = storeInput.entities;
      expect(issue.github_number).toBeNull();
      expect(issue.local_issue_id).toMatch(/^local:test\/repo:/);
      expect(issue.author).toBe("local");
      expect(issue.guest_access_token).toBe("private-token");
      expect(conversation.conversation_id).toContain(String(issue.local_issue_id));
      expect(message.turn_key).toContain(String(issue.local_issue_id));
      expect(message.author).toBe("local");
      expect(message.github_comment_id).toBe(`local-issue-body-${issue.local_issue_id}`);
      expect(result.pushed_to_github).toBe(false);
      expect(result.submitted_to_neotoma).toBe(true);
      expect(result.guest_access_token).toBe("private-token");
    });

    it("uses configured author alias for private local issues", async () => {
      mockLoadIssuesConfig.mockResolvedValue({
        ...defaultIssuesConfig,
        author_alias: "cursor-agent-mark",
      });
      mockSubmitIssueToRemote.mockResolvedValue({
        entity_ids: ["remote-issue-1", "remote-conv-1"],
        issue_entity_id: "remote-issue-1",
        conversation_id: "remote-conv-1",
      });

      await submitIssue(ops, {
        title: "Private Report",
        body: "Contains PII",
        visibility: "private",
        reporter_git_sha: "abc1234",
      });

      expect(mockSubmitIssueToRemote).toHaveBeenCalledWith(
        expect.objectContaining({
          visibility: "private",
          author: "cursor-agent-mark",
        }),
      );
      const storeInput = mockStore.mock.calls[0]?.[0] as {
        entities: Array<Record<string, unknown>>;
      };
      const [issue, , message] = storeInput.entities;
      expect(issue.author).toBe("cursor-agent-mark");
      expect(message.author).toBe("cursor-agent-mark");
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
        reporter_app_version: "0.12.0",
      });

      expect(result.pushed_to_github).toBe(false);
      expect(result.submitted_to_neotoma).toBe(true);
    });

    it("returns success with remote_submission_error when remote Neotoma fails (target URL configured)", async () => {
      mockCreateIssue.mockResolvedValue({
        number: 99,
        html_url: "https://github.com/test/repo/issues/99",
        user: { login: "user" },
        created_at: "2026-05-01T00:00:00Z",
      });
      mockSubmitIssueToRemote.mockRejectedValue(new Error("Network error"));

      const result = await submitIssue(ops, {
        title: "Partially Failed",
        body: "Body",
        visibility: "public",
        reporter_app_version: "0.12.0",
      });

      expect(mockStore).toHaveBeenCalled();
      expect(result.submitted_to_neotoma).toBe(false);
      expect(result.remote_submission_error).toMatch(/Remote submission to .+ failed: Network error/);
      expect(result.entity_id).toBeTruthy();
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
        reporter_app_version: "0.12.0",
      });

      expect(mockSubmitIssueToRemote).not.toHaveBeenCalled();
      expect(result.submitted_to_neotoma).toBe(false);
      expect(result.pushed_to_github).toBe(true);
    });
  });

  describe("submitGuestIssue", () => {
    it("uses an internal store bypass for issue thread bookkeeping only", async () => {
      const previousIssuePolicy = process.env.NEOTOMA_ACCESS_POLICY_ISSUE;
      const previousConversationPolicy = process.env.NEOTOMA_ACCESS_POLICY_CONVERSATION_MESSAGE;
      process.env.NEOTOMA_ACCESS_POLICY_ISSUE = "submitter_scoped";
      process.env.NEOTOMA_ACCESS_POLICY_CONVERSATION_MESSAGE = "closed";
      let initialStoreBypass: boolean | undefined;
      let initialStoreThumbprint: string | undefined;
      mockStore.mockImplementation(async (input: { entities?: Array<Record<string, unknown>> }) => {
        if (input.entities?.some((entity) => entity.entity_type === "conversation_message")) {
          const ctx = getRequestContext();
          initialStoreBypass = ctx?.bypassGuestStoreAccessPolicy;
          initialStoreThumbprint = ctx?.agentIdentity?.thumbprint;
          return {
            structured: {
              entities: [
                { entity_id: "guest-issue-1" },
                { entity_id: "guest-conv-1" },
                { entity_id: "guest-msg-1" },
              ],
            },
          };
        }
        return {
          structured: {
            entities: [{ entity_id: "guest-issue-1" }],
          },
        };
      });

      try {
        const result = await runWithRequestContext(
          {
            agentIdentity: { thumbprint: "thumb-123", tier: "software" },
            aauthAdmission: { admitted: false, reason: "no_match" },
          },
          () =>
            submitGuestIssue(ops, {
              userId: "operator-user",
              title: "Guest issue",
              body: "Guest body",
              visibility: "private",
            }),
        );

        expect(initialStoreBypass).toBe(true);
        expect(initialStoreThumbprint).toBe("thumb-123");
        expect(mockGenerateGuestAccessToken).toHaveBeenCalledWith(
          expect.objectContaining({
            entityIds: ["guest-issue-1", "guest-conv-1"],
            userId: "operator-user",
            thumbprint: "thumb-123",
          }),
        );
        expect(result).toEqual(
          expect.objectContaining({
            issue_entity_id: "guest-issue-1",
            conversation_id: "guest-conv-1",
            guest_access_token: "guest-token",
          }),
        );
      } finally {
        if (previousIssuePolicy === undefined) {
          delete process.env.NEOTOMA_ACCESS_POLICY_ISSUE;
        } else {
          process.env.NEOTOMA_ACCESS_POLICY_ISSUE = previousIssuePolicy;
        }
        if (previousConversationPolicy === undefined) {
          delete process.env.NEOTOMA_ACCESS_POLICY_CONVERSATION_MESSAGE;
        } else {
          process.env.NEOTOMA_ACCESS_POLICY_CONVERSATION_MESSAGE = previousConversationPolicy;
        }
      }
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
      expect(result.remote_submission_error).toBeNull();
      expect(mockAddMessageToRemote).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "Follow-up comment",
          githubIssueNumber: 1,
          issue_entity_id: "local-issue-1",
        }),
      );
    });

    it("resolves by entity_id and submits to remote with that id", async () => {
      mockAddMessageToRemote.mockResolvedValue({ message_entity_id: "remote-msg-2" });
      mockAddIssueComment.mockResolvedValue({
        id: 100,
        body: "Comment",
        user: { login: "commenter" },
        created_at: "2026-05-01T10:00:00Z",
        updated_at: "2026-05-01T10:00:00Z",
        html_url: "https://github.com/test/repo/issues/2#issuecomment-100",
      });
      mockRetrieveEntitySnapshot.mockImplementation(async (input: { entity_id: string }) => ({
        entity_type: "issue",
        entity_id: input.entity_id,
        snapshot: {
          title: "From entity",
          status: "open",
          labels: [],
          github_number: 2,
          github_url: "https://github.com/test/repo/issues/2",
          author: "tester",
          created_at: "2026-05-01T00:00:00Z",
          closed_at: null,
          last_synced_at: "2026-05-01T00:00:00Z",
        },
      }));

      await addIssueMessage(ops, {
        entity_id: "ent-issue-special",
        body: "Via entity id",
      });

      expect(mockAddMessageToRemote).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "Via entity id",
          githubIssueNumber: 2,
          issue_entity_id: "ent-issue-special",
        }),
      );
    });

    it("does not store a duplicate local shadow message when remote private append succeeds", async () => {
      mockAddMessageToRemote.mockResolvedValue({ message_entity_id: "remote-msg-private" });
      mockRetrieveEntitySnapshot.mockResolvedValue({
        entity_type: "issue",
        entity_id: "ent-private-1",
        snapshot: {
          title: "Private issue",
          status: "open",
          labels: [],
          visibility: "private",
          local_issue_id: "local-private-1",
          remote_entity_id: "remote-private-1",
          remote_conversation_id: "conv-remote-private-1",
          guest_access_token: "guest-token",
          author: "tester",
          created_at: "2026-05-01T00:00:00Z",
          closed_at: null,
          last_synced_at: "2026-05-01T00:00:00Z",
        },
      });

      const result = await addIssueMessage(ops, {
        entity_id: "ent-private-1",
        body: "Private follow-up",
      });

      expect(mockAddMessageToRemote).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "Private follow-up",
          issue_entity_id: "remote-private-1",
          local_issue_id: "local-private-1",
          guest_access_token: "guest-token",
          remote_conversation_id: "conv-remote-private-1",
        }),
      );
      expect(mockAddIssueComment).not.toHaveBeenCalled();
      expect(mockStore).toHaveBeenCalledTimes(1);
      expect(mockStore).toHaveBeenCalledWith(
        expect.objectContaining({
          entities: [
            expect.objectContaining({
              entity_type: "issue",
              target_id: "ent-private-1",
              last_message_author: "remote",
            }),
          ],
        }),
      );
      expect(result).toEqual({
        github_comment_id: null,
        message_entity_id: "remote-msg-private",
        pushed_to_github: false,
        submitted_to_neotoma: true,
      });
    });

    it("returns partial success after local and GitHub side effects when remote Neotoma fails", async () => {
      mockAddMessageToRemote.mockRejectedValue(new Error("ECONNREFUSED"));
      mockAddIssueComment.mockResolvedValue({
        id: 789,
        body: "Comment",
        user: { login: "commenter" },
        created_at: "2026-05-01T10:00:00Z",
        updated_at: "2026-05-01T10:00:00Z",
        html_url: "https://github.com/test/repo/issues/1#issuecomment-789",
      });

      const result = await addIssueMessage(ops, {
        issue_number: 1,
        body: "Follow-up",
      });

      expect(mockStore).toHaveBeenCalled();
      expect(result.pushed_to_github).toBe(true);
      expect(result.github_comment_id).toBe("789");
      expect(result.submitted_to_neotoma).toBe(false);
      expect(result.remote_submission_error).toMatch(
        /Remote issue message submission to https:\/\/neotoma\.example\.com failed: ECONNREFUSED/,
      );
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

      expect(result.issue_entity_id).toBe("local-issue-1");
      expect(result.title).toBe("Test Issue");
      expect(result.status).toBe("open");
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].author).toBe("tester");
    });

    it("resolves by entity_id without retrieveEntityByIdentifier", async () => {
      mockRetrieveEntitySnapshot.mockImplementation(async (input: { entity_id: string }) => ({
        entity_type: "issue",
        entity_id: input.entity_id,
        snapshot: {
          title: "Direct",
          status: "open",
          labels: [],
          github_number: 5,
          github_url: "https://github.com/test/repo/issues/5",
          author: "u",
          created_at: "2026-05-01T00:00:00Z",
          closed_at: null,
          last_synced_at: "2026-05-01T00:00:00Z",
        },
      }));
      mockRetrieveRelatedEntities
        .mockResolvedValueOnce({
          entities: [{ entity_id: "conv-1", entity_type: "conversation", snapshot: {} }],
        })
        .mockResolvedValueOnce({
          entities: [
            {
              entity_type: "conversation_message",
              snapshot: {
                author: "u",
                content: "m",
                created_at: "2026-05-01T00:00:00Z",
              },
            },
          ],
        });
      mockSyncIssueIfStale.mockResolvedValue(false);

      const result = await getIssueStatus(ops, { entity_id: "ent-only-id" });

      expect(mockRetrieveEntityByIdentifier).not.toHaveBeenCalled();
      expect(result.issue_entity_id).toBe("ent-only-id");
      expect(result.issue_number).toBe(5);
    });

    it("uses conversation row `id` when `entity_id` is absent (retrieve_related_entities shape)", async () => {
      mockRetrieveEntitySnapshot.mockImplementation(async (input: { entity_id: string }) => ({
        entity_type: "issue",
        entity_id: input.entity_id,
        snapshot: {
          title: "Private",
          status: "open",
          labels: [],
          author: "local",
          created_at: "2026-05-01T00:00:00Z",
          closed_at: null,
          last_synced_at: "2026-05-01T00:00:00Z",
          local_issue_id: "local:x",
        },
      }));
      mockRetrieveRelatedEntities
        .mockResolvedValueOnce({
          entities: [
            {
              id: "conv-by-id-only",
              entity_type: "conversation",
              snapshot: { title: "Thread" },
            },
          ],
        })
        .mockResolvedValueOnce({
          entities: [
            {
              entity_type: "conversation_message",
              snapshot: {
                author: "local",
                content: "body",
                created_at: "2026-05-01T01:00:00Z",
              },
            },
          ],
        });
      mockSyncIssueIfStale.mockResolvedValue(false);

      const result = await getIssueStatus(ops, { entity_id: "ent-private" });

      expect(mockRetrieveRelatedEntities).toHaveBeenNthCalledWith(2, {
        entity_id: "conv-by-id-only",
        relationship_types: ["PART_OF"],
        direction: "inbound",
      });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].body).toBe("body");
    });

    it("merges messages across multiple linked conversations deterministically", async () => {
      mockRetrieveEntitySnapshot.mockImplementation(async (input: { entity_id: string }) => ({
        entity_type: "issue",
        entity_id: input.entity_id,
        snapshot: {
          title: "Private",
          status: "open",
          labels: [],
          author: "local",
          created_at: "2026-05-01T00:00:00Z",
          closed_at: null,
          last_synced_at: "2026-05-01T00:00:00Z",
          local_issue_id: "local:x",
        },
      }));
      mockRetrieveRelatedEntities
        .mockResolvedValueOnce({
          entities: [
            { entity_id: "conv-a", entity_type: "conversation", snapshot: { title: "Thread A" } },
            { entity_id: "conv-b", entity_type: "conversation", snapshot: { title: "Thread B" } },
          ],
        })
        .mockResolvedValueOnce({
          entities: [
            {
              entity_id: "msg-1",
              entity_type: "conversation_message",
              snapshot: {
                author: "local",
                content: "body",
                created_at: "2026-05-01T01:00:00Z",
                turn_key: "issue-body",
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          entities: [
            {
              entity_id: "msg-2",
              entity_type: "conversation_message",
              snapshot: {
                author: "Agent",
                content: "follow-up",
                created_at: "2026-05-01T02:00:00Z",
                turn_key: "issue-follow-up",
              },
            },
            {
              entity_id: "msg-3",
              entity_type: "conversation_message",
              snapshot: {
                author: "local",
                content: "body",
                created_at: "2026-05-01T01:00:00Z",
                turn_key: "issue-body",
              },
            },
          ],
        });
      mockSyncIssueIfStale.mockResolvedValue(false);

      const result = await getIssueStatus(ops, { entity_id: "ent-private" });

      expect(mockRetrieveRelatedEntities).toHaveBeenNthCalledWith(2, {
        entity_id: "conv-a",
        relationship_types: ["PART_OF"],
        direction: "inbound",
      });
      expect(mockRetrieveRelatedEntities).toHaveBeenNthCalledWith(3, {
        entity_id: "conv-b",
        relationship_types: ["PART_OF"],
        direction: "inbound",
      });
      expect(result.messages).toEqual([
        { author: "local", body: "body", created_at: "2026-05-01T01:00:00Z" },
        { author: "Agent", body: "follow-up", created_at: "2026-05-01T02:00:00Z" },
      ]);
    });

    it("prefers operator thread when shadow issue has remote_entity_id", async () => {
      mockFetchRemoteIssueThread.mockResolvedValue({
        issue_entity_id: "remote-canonical",
        issue_number: 0,
        title: "Remote title",
        status: "open",
        labels: ["a"],
        github_url: "",
        author: "maintainer",
        created_at: "2026-05-01T00:00:00Z",
        closed_at: null,
        messages: [
          { author: "maintainer", body: "from operator", created_at: "2026-05-01T02:00:00Z" },
        ],
      });
      mockRetrieveEntitySnapshot.mockImplementation(async (input: { entity_id: string }) => ({
        entity_type: "issue",
        entity_id: input.entity_id,
        snapshot: {
          title: "Stale local title",
          status: "open",
          labels: [],
          author: "local",
          created_at: "2026-05-01T00:00:00Z",
          closed_at: null,
          last_synced_at: "2026-05-01T00:00:00Z",
          remote_entity_id: "remote-canonical",
          guest_access_token: "guest-token",
        },
      }));
      mockSyncIssueIfStale.mockResolvedValue(false);

      const result = await getIssueStatus(ops, { entity_id: "local-shadow-1" });

      expect(mockFetchRemoteIssueThread).toHaveBeenCalledWith({
        issueEntityId: "remote-canonical",
        accessToken: "guest-token",
      });
      expect(result.issue_entity_id).toBe("local-shadow-1");
      expect(result.title).toBe("Remote title");
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].body).toBe("from operator");
    });

    it("merges local graph messages into an operator read-through response", async () => {
      mockFetchRemoteIssueThread.mockResolvedValue({
        issue_entity_id: "remote-canonical",
        issue_number: 0,
        title: "Remote title",
        status: "open",
        labels: ["a"],
        github_url: "",
        author: "maintainer",
        created_at: "2026-05-01T00:00:00Z",
        closed_at: null,
        messages: [
          { author: "local", body: "original body", created_at: "2026-05-01T01:00:00Z" },
        ],
      });
      mockRetrieveEntitySnapshot.mockImplementation(async (input: { entity_id: string }) => ({
        entity_type: "issue",
        entity_id: input.entity_id,
        snapshot: {
          title: "Local title",
          status: "open",
          labels: [],
          author: "local",
          created_at: "2026-05-01T00:00:00Z",
          closed_at: null,
          last_synced_at: "2026-05-01T00:00:00Z",
          remote_entity_id: "remote-canonical",
          guest_access_token: "guest-token",
        },
      }));
      mockRetrieveRelatedEntities
        .mockResolvedValueOnce({
          entities: [{ entity_id: "conv-local", entity_type: "conversation", snapshot: {} }],
        })
        .mockResolvedValueOnce({
          entities: [
            {
              entity_id: "msg-original",
              entity_type: "conversation_message",
              snapshot: {
                author: "local",
                content: "original body",
                created_at: "2026-05-01T01:00:00Z",
                turn_key: "issue-body",
              },
            },
            {
              entity_id: "msg-local-follow-up",
              entity_type: "conversation_message",
              snapshot: {
                author: "Agent",
                content: "local follow-up",
                created_at: "2026-05-01T02:00:00Z",
                turn_key: "issue-follow-up",
              },
            },
          ],
        });
      mockSyncIssueIfStale.mockResolvedValue(false);

      const result = await getIssueStatus(ops, { entity_id: "local-shadow-1" });

      expect(result.issue_entity_id).toBe("local-shadow-1");
      expect(result.title).toBe("Remote title");
      expect(result.messages).toEqual([
        { author: "local", body: "original body", created_at: "2026-05-01T01:00:00Z" },
        { author: "Agent", body: "local follow-up", created_at: "2026-05-01T02:00:00Z" },
      ]);
    });

    it("deduplicates mirrored public messages by body and second-level timestamp", async () => {
      mockFetchRemoteIssueThread.mockResolvedValue({
        issue_entity_id: "remote-canonical",
        issue_number: 46,
        title: "Remote title",
        status: "open",
        labels: ["a"],
        github_url: "https://github.com/test/repo/issues/46",
        author: "maintainer",
        created_at: "2026-05-01T00:00:00Z",
        closed_at: null,
        messages: [
          { author: "maintainer", body: "original body", created_at: "2026-05-01T01:00:00.098Z" },
          { author: "guest", body: "follow-up", created_at: "2026-05-01T02:00:00.269Z" },
        ],
      });
      mockRetrieveEntitySnapshot.mockImplementation(async (input: { entity_id: string }) => ({
        entity_type: "issue",
        entity_id: input.entity_id,
        snapshot: {
          title: "Local title",
          status: "open",
          labels: [],
          github_number: 46,
          github_url: "https://github.com/test/repo/issues/46",
          author: "local",
          created_at: "2026-05-01T00:00:00Z",
          closed_at: null,
          last_synced_at: "2026-05-01T00:00:00Z",
          remote_entity_id: "remote-canonical",
          guest_access_token: "guest-token",
        },
      }));
      mockRetrieveRelatedEntities
        .mockResolvedValueOnce({
          entities: [{ entity_id: "conv-local", entity_type: "conversation", snapshot: {} }],
        })
        .mockResolvedValueOnce({
          entities: [
            {
              entity_id: "msg-original",
              entity_type: "conversation_message",
              snapshot: {
                author: "maintainer",
                content: "original body",
                created_at: "2026-05-01T01:00:00Z",
                turn_key: "issue-body",
              },
            },
            {
              entity_id: "msg-follow-up",
              entity_type: "conversation_message",
              snapshot: {
                author: "maintainer",
                content: "follow-up",
                created_at: "2026-05-01T02:00:00Z",
                turn_key: "issue-follow-up",
              },
            },
          ],
        });
      mockSyncIssueIfStale.mockResolvedValue(false);

      const result = await getIssueStatus(ops, { entity_id: "local-shadow-1" });

      expect(result.messages).toEqual([
        { author: "maintainer", body: "original body", created_at: "2026-05-01T01:00:00.098Z" },
        { author: "maintainer", body: "follow-up", created_at: "2026-05-01T02:00:00Z" },
      ]);
    });

    it("throws when operator read-through fails for a mirrored issue", async () => {
      mockFetchRemoteIssueThread.mockRejectedValue(
        new IssueTransportError({
          code: "ERR_REMOTE_ISSUE_READ_FAILED",
          message: "Remote issue read-through failed for remote-canonical",
        }),
      );
      mockRetrieveEntitySnapshot.mockImplementation(async (input: { entity_id: string }) => ({
        entity_type: "issue",
        entity_id: input.entity_id,
        snapshot: {
          title: "Local title",
          status: "open",
          labels: [],
          author: "local",
          created_at: "2026-05-01T00:00:00Z",
          closed_at: null,
          last_synced_at: "2026-05-01T00:00:00Z",
          remote_entity_id: "remote-canonical",
          guest_access_token: "guest-token",
        },
      }));
      mockSyncIssueIfStale.mockResolvedValue(false);

      await expect(getIssueStatus(ops, { entity_id: "local-shadow-1" })).rejects.toMatchObject({
        name: "IssueTransportError",
        code: "ERR_REMOTE_ISSUE_READ_FAILED",
      });
    });

    it("fetches operator thread even when remote_entity_id matches local entity_id", async () => {
      mockFetchRemoteIssueThread.mockResolvedValue({
        issue_entity_id: "ent-same-id",
        issue_number: 0,
        title: "Operator title",
        status: "closed",
        labels: ["resolved"],
        github_url: "",
        author: "maintainer",
        created_at: "2026-05-01T00:00:00Z",
        closed_at: "2026-05-02T00:00:00Z",
        messages: [
          { author: "maintainer", body: "operator reply", created_at: "2026-05-01T03:00:00Z" },
        ],
      });
      mockRetrieveEntitySnapshot.mockImplementation(async (input: { entity_id: string }) => ({
        entity_type: "issue",
        entity_id: input.entity_id,
        snapshot: {
          title: "Stale local title",
          status: "open",
          labels: [],
          author: "local",
          created_at: "2026-05-01T00:00:00Z",
          closed_at: null,
          last_synced_at: "2026-05-01T00:00:00Z",
          remote_entity_id: "ent-same-id",
          guest_access_token: "guest-token",
        },
      }));
      mockSyncIssueIfStale.mockResolvedValue(false);

      const result = await getIssueStatus(ops, { entity_id: "ent-same-id" });

      expect(mockFetchRemoteIssueThread).toHaveBeenCalledWith({
        issueEntityId: "ent-same-id",
        accessToken: "guest-token",
      });
      expect(result.issue_entity_id).toBe("ent-same-id");
      expect(result.title).toBe("Operator title");
      expect(result.status).toBe("closed");
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].body).toBe("operator reply");
    });
  });

  describe("reporter environment + redaction (v0.12+)", () => {
    it("rejects submit_issue when both reporter_git_sha and reporter_app_version are missing", async () => {
      await expect(
        submitIssue(ops, {
          title: "No reporter env",
          body: "body",
          visibility: "public",
        }),
      ).rejects.toMatchObject({
        name: "IssueValidationError",
        code: "ERR_REPORTER_ENVIRONMENT_REQUIRED",
      });
      expect(mockCreateIssue).not.toHaveBeenCalled();
      expect(mockSubmitIssueToRemote).not.toHaveBeenCalled();
      expect(mockStore).not.toHaveBeenCalled();
    });

    it("accepts submit_issue with only reporter_git_sha", async () => {
      mockCreateIssue.mockResolvedValue({
        number: 5,
        html_url: "https://github.com/test/repo/issues/5",
        user: { login: "tester" },
        created_at: "2026-05-01T00:00:00Z",
      });
      mockSubmitIssueToRemote.mockResolvedValue({
        entity_ids: ["r1", "rc1"],
        issue_entity_id: "r1",
        conversation_id: "rc1",
      });

      await expect(
        submitIssue(ops, {
          title: "Has SHA only",
          body: "body",
          visibility: "public",
          reporter_git_sha: "deadbeef",
        }),
      ).resolves.toBeTruthy();
    });

    it("redacts public issue body before persisting", async () => {
      mockCreateIssue.mockResolvedValue({
        number: 7,
        html_url: "https://github.com/test/repo/issues/7",
        user: { login: "tester" },
        created_at: "2026-05-01T00:00:00Z",
      });
      mockSubmitIssueToRemote.mockResolvedValue({
        entity_ids: ["r1", "rc1"],
        issue_entity_id: "r1",
        conversation_id: "rc1",
      });

      await submitIssue(ops, {
        title: "Bug",
        body: "Reporter alice@example.com hit an error",
        visibility: "public",
        reporter_git_sha: "deadbeef",
      });

      const remoteCall = mockSubmitIssueToRemote.mock.calls[0]?.[0] as { body: string };
      expect(remoteCall.body).toMatch(/<EMAIL:[0-9a-f]{4}>/);
      expect(remoteCall.body).not.toContain("alice@example.com");
    });

    it("preserves ISO date fragments in public issue titles", async () => {
      mockCreateIssue.mockResolvedValue({
        number: 8,
        html_url: "https://github.com/test/repo/issues/8",
        user: { login: "tester" },
        created_at: "2026-05-01T00:00:00Z",
      });
      mockSubmitIssueToRemote.mockResolvedValue({
        entity_ids: ["r1", "rc1"],
        issue_entity_id: "r1",
        conversation_id: "rc1",
      });

      await submitIssue(ops, {
        title: "Public test via unsigned-dev 2026-05-12T07-10 flow3",
        body: "body",
        visibility: "public",
        reporter_git_sha: "deadbeef",
      });

      expect(mockCreateIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Public test via unsigned-dev 2026-05-12T07-10 flow3",
        }),
      );
      const remoteCall = mockSubmitIssueToRemote.mock.calls[0]?.[0] as { title: string };
      expect(remoteCall.title).toBe("Public test via unsigned-dev 2026-05-12T07-10 flow3");
      expect(remoteCall.title).not.toContain("<PHONE:");
    });

    it("does NOT redact private issue body", async () => {
      mockSubmitIssueToRemote.mockResolvedValue({
        entity_ids: ["r1", "rc1"],
        issue_entity_id: "r1",
        conversation_id: "rc1",
      });

      await submitIssue(ops, {
        title: "Private bug",
        body: "Reporter alice@example.com hit an error",
        visibility: "private",
        reporter_git_sha: "deadbeef",
      });

      const remoteCall = mockSubmitIssueToRemote.mock.calls[0]?.[0] as { body: string };
      expect(remoteCall.body).toContain("alice@example.com");
    });

    it("persists reporter env on conversation_message for addIssueMessage", async () => {
      mockAddMessageToRemote.mockResolvedValue({ message_entity_id: "remote-msg-1" });
      mockAddIssueComment.mockResolvedValue({
        id: 999,
        body: "x",
        user: { login: "u" },
        created_at: "2026-05-01T10:00:00Z",
        updated_at: "2026-05-01T10:00:00Z",
        html_url: "",
      });

      await addIssueMessage(ops, {
        issue_number: 1,
        body: "Tested against new build",
        reporter_git_sha: "feedface",
        reporter_app_version: "0.12.0",
      });

      const storeInput = mockStore.mock.calls[0]?.[0] as {
        entities: Array<Record<string, unknown>>;
      };
      const message = storeInput.entities.find((e) => e.entity_type === "conversation_message");
      expect(message).toBeDefined();
      expect(message?.reporter_git_sha).toBe("feedface");
      expect(message?.reporter_app_version).toBe("0.12.0");
    });
  });

  describe("resolveIssueRow", () => {
    beforeEach(() => {
      ops = createMockOps();
    });

    it("throws when issue_number conflicts with entity github_number", async () => {
      mockRetrieveEntitySnapshot.mockResolvedValue({
        entity_type: "issue",
        entity_id: "ent-x",
        snapshot: { github_number: 7, title: "t" },
      });
      await expect(resolveIssueRow(ops, { entity_id: "ent-x", issue_number: 99 })).rejects.toThrow(
        /does not match github_number/,
      );
    });
  });
});
