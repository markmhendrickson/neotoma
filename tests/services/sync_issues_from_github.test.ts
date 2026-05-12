import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Operations, StoreInput, StoreResult } from "../../src/core/operations.js";
import type { GitHubComment, GitHubIssue } from "../../src/services/issues/types.js";

const mockListIssues = vi.fn();
const mockListIssueComments = vi.fn();

const { mockLoadIssuesConfig } = vi.hoisted(() => ({
  mockLoadIssuesConfig: vi.fn(),
}));

vi.mock("../../src/services/issues/config.js", () => ({
  loadIssuesConfig: (...args: unknown[]) => mockLoadIssuesConfig(...args),
}));

vi.mock("../../src/services/issues/github_client.js", () => ({
  listIssues: (...args: unknown[]) => mockListIssues(...args),
  listIssueComments: (...args: unknown[]) => mockListIssueComments(...args),
}));

import { syncIssuesFromGitHub } from "../../src/services/issues/sync_issues_from_github.js";

function issue(number: number, title = `Issue ${number}`): GitHubIssue {
  return {
    number,
    title,
    body: `Body ${number}`,
    state: "open",
    labels: [{ name: "bug" }],
    html_url: `https://github.com/test/repo/issues/${number}`,
    user: { login: "octocat", id: number, type: "User" },
    created_at: "2026-05-01T00:00:00Z",
    closed_at: null,
    updated_at: "2026-05-01T00:00:00Z",
  };
}

function comment(id: number): GitHubComment {
  return {
    id,
    body: `Comment ${id}`,
    user: { login: "commenter", id, type: "User" },
    created_at: "2026-05-01T01:00:00Z",
    updated_at: "2026-05-01T01:00:00Z",
    html_url: `https://github.com/test/repo/issues/1#issuecomment-${id}`,
  };
}

function createOps() {
  const seenIdempotencyKeys = new Set<string>();
  const store = vi.fn(async (input: StoreInput): Promise<StoreResult> => {
    if (input.idempotency_key) {
      seenIdempotencyKeys.add(input.idempotency_key);
    }
    return {
      structured: {
        entities: (input.entities ?? []).map((entity, index) => ({
          entity_id: `${entity.entity_type}-${index}`,
          entity_type: entity.entity_type,
        })),
      },
    };
  });

  return {
    ops: {
      store,
      storeStructured: store,
      storeUnstructured: store,
      retrieveEntities: vi.fn(),
      retrieveEntityByIdentifier: vi.fn(),
      retrieveEntitySnapshot: vi.fn(),
      listObservations: vi.fn(),
      listTimelineEvents: vi.fn(),
      retrieveRelatedEntities: vi.fn(),
      createRelationship: vi.fn(),
      createRelationships: vi.fn(),
      correct: vi.fn(),
      listEntityTypes: vi.fn(),
      getEntityTypeCounts: vi.fn(),
      executeTool: vi.fn(),
      dispose: vi.fn(),
    } as unknown as Operations,
    store,
    seenIdempotencyKeys,
  };
}

describe("syncIssuesFromGitHub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadIssuesConfig.mockResolvedValue({
      repo: "test/repo",
      sync_staleness_ms: 300_000,
    });
    mockListIssueComments.mockResolvedValue([]);
  });

  it.todo("paginates GitHub issue lists until all pages have been consumed");

  it("syncs every issue returned by the GitHub list response and each issue comment", async () => {
    const { ops, store } = createOps();
    mockListIssues.mockResolvedValue([issue(1), issue(2)]);
    mockListIssueComments
      .mockResolvedValueOnce([comment(101), comment(102)])
      .mockResolvedValueOnce([comment(201)]);

    const result = await syncIssuesFromGitHub(ops, { state: "all", labels: ["bug"], since: "2026-05-01T00:00:00Z" });

    expect(mockListIssues).toHaveBeenCalledWith({
      state: "all",
      labels: ["bug"],
      since: "2026-05-01T00:00:00Z",
      per_page: 100,
    });
    expect(mockListIssueComments).toHaveBeenCalledTimes(2);
    expect(store).toHaveBeenCalledTimes(5);
    expect(result).toEqual({ issues_synced: 2, messages_synced: 3, errors: [] });
  });

  it("returns a recoverable error result when GitHub listing fails with a 5xx", async () => {
    const { ops, store } = createOps();
    mockListIssues.mockRejectedValue(new Error("GitHub API 503 Service Unavailable: try later"));

    const result = await syncIssuesFromGitHub(ops);

    expect(result.issues_synced).toBe(0);
    expect(result.messages_synced).toBe(0);
    expect(result.errors).toEqual([
      "Failed to list issues: GitHub API 503 Service Unavailable: try later",
    ]);
    expect(store).not.toHaveBeenCalled();
  });

  it("surfaces GitHub 4xx listing failures distinctly in the sync errors", async () => {
    const { ops } = createOps();
    mockListIssues.mockRejectedValue(new Error("GitHub API 401 Unauthorized: bad credentials"));

    const result = await syncIssuesFromGitHub(ops);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("401 Unauthorized");
    expect(result.errors[0]).toContain("bad credentials");
  });

  it("uses stable idempotency keys so repeated runs do not create distinct sync rows", async () => {
    const { ops, store, seenIdempotencyKeys } = createOps();
    mockListIssues.mockResolvedValue([issue(1)]);
    mockListIssueComments.mockResolvedValue([comment(101)]);

    await syncIssuesFromGitHub(ops);
    await syncIssuesFromGitHub(ops);

    expect(store).toHaveBeenCalledTimes(4);
    expect(seenIdempotencyKeys).toEqual(
      new Set([
        "issue-sync-test/repo-1",
        "issue-comment-sync-test/repo-1-101",
      ]),
    );
  });
});
