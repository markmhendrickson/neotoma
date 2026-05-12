import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Operations, StoreInput, StoreResult } from "../../src/core/operations.js";

const mockCreateIssue = vi.fn();
const mockSubmitIssueToRemote = vi.fn();
const mockAddMessageToRemote = vi.fn();
const mockFetchRemoteIssueThread = vi.fn();
const mockSyncIssueIfStale = vi.fn();

const { mockLoadIssuesConfig } = vi.hoisted(() => ({
  mockLoadIssuesConfig: vi.fn(),
}));

vi.mock("../../src/services/issues/config.js", () => ({
  loadIssuesConfig: (...args: unknown[]) => mockLoadIssuesConfig(...args),
}));

vi.mock("../../src/services/issues/github_client.js", () => ({
  createIssue: (...args: unknown[]) => mockCreateIssue(...args),
  addIssueComment: vi.fn(),
  mergeNeotomaToolingIssueLabels: (labels?: string[]) => [
    "neotoma",
    ...(labels ?? []).filter((label) => label !== "neotoma"),
  ],
}));

vi.mock("../../src/services/issues/neotoma_client.js", () => ({
  addMessageToRemote: (...args: unknown[]) => mockAddMessageToRemote(...args),
  fetchRemoteIssueThread: (...args: unknown[]) => mockFetchRemoteIssueThread(...args),
  submitIssueToRemote: (...args: unknown[]) => mockSubmitIssueToRemote(...args),
}));

vi.mock("../../src/services/issues/sync_issues_from_github.js", () => ({
  syncIssueIfStale: (...args: unknown[]) => mockSyncIssueIfStale(...args),
}));

import { submitIssue } from "../../src/services/issues/issue_operations.js";

function createOps() {
  const store = vi.fn(async (input: StoreInput): Promise<StoreResult> => ({
    structured: {
      entities: (input.entities ?? []).map((entity, index) => ({
        entity_id: ["issue-1", "conversation-1", "message-1"][index] ?? `${entity.entity_type}-${index}`,
        entity_type: entity.entity_type,
      })),
    },
  }));

  return {
    store,
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
  };
}

describe("entity submission GitHub handler coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadIssuesConfig.mockResolvedValue({
      target_url: "",
      repo: "test/repo",
      github_auth: "gh_cli",
      reporting_mode: "consent",
      sync_staleness_ms: 300_000,
      configured_at: "2026-01-01T00:00:00Z",
      author_alias: null,
    });
    mockFetchRemoteIssueThread.mockResolvedValue(null);
  });

  it.todo("routes generic entity_submission external_mirrors provider=github through a dedicated GitHub mirror handler");

  it("creates a GitHub issue with the expected public submission shape", async () => {
    const { ops } = createOps();
    mockCreateIssue.mockResolvedValue({
      number: 42,
      html_url: "https://github.com/test/repo/issues/42",
      user: { login: "octocat", id: 1, type: "User" },
      created_at: "2026-05-01T00:00:00Z",
    });

    await submitIssue(ops, {
      title: "Public Bug",
      body: "Something broke",
      labels: ["bug"],
      visibility: "public",
      reporter_app_version: "0.12.0-test",
    });

    expect(mockCreateIssue).toHaveBeenCalledWith({
      title: "Public Bug",
      body: "Something broke",
      labels: ["neotoma", "bug"],
    });
  });

  it("stores github_number and github_url after a successful GitHub create", async () => {
    const { ops, store } = createOps();
    mockCreateIssue.mockResolvedValue({
      number: 42,
      html_url: "https://github.com/test/repo/issues/42",
      user: { login: "octocat", id: 1, type: "User" },
      created_at: "2026-05-01T00:00:00Z",
    });

    const result = await submitIssue(ops, {
      title: "Public Bug",
      body: "Something broke",
      labels: ["bug"],
      visibility: "public",
      reporter_app_version: "0.12.0-test",
    });

    const storeInput = store.mock.calls[0]?.[0] as StoreInput;
    expect(storeInput.entities?.[0]).toMatchObject({
      entity_type: "issue",
      github_number: 42,
      github_url: "https://github.com/test/repo/issues/42",
      repo: "test/repo",
      sync_pending: true,
    });
    expect(result).toMatchObject({
      issue_number: 42,
      github_url: "https://github.com/test/repo/issues/42",
      pushed_to_github: true,
    });
  });

  it("surfaces GitHub create failures as mirror guidance while storing a local submission", async () => {
    const { ops, store } = createOps();
    mockCreateIssue.mockRejectedValue(new Error("GitHub API 500 Server Error"));

    const result = await submitIssue(ops, {
      title: "Public Bug",
      body: "Something broke",
      labels: ["bug"],
      visibility: "public",
      reporter_app_version: "0.12.0-test",
    });

    expect(store).toHaveBeenCalled();
    expect(result.pushed_to_github).toBe(false);
    expect(result.github_mirror_guidance).toContain("without a GitHub mirror");
    expect(result.github_mirror_guidance).toContain("GitHub API 500 Server Error");
  });
});
