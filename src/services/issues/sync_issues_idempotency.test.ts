import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression coverage for the issues-sync ERR_IDEMPOTENCY_MISMATCH failure:
// the pull leg keyed each issue store on a CONSTANT `issue-sync-<repo>-<number>`
// while the stored entity content (title/body/state/labels) drifted as the
// GitHub issue was edited. Neotoma enforces "same idempotency_key => identical
// content", so every post-edit sync was rejected and the run reported
// "Synced 0 issues". The key now folds in a content digest: stable when the
// issue is unchanged (idempotent no-op), new when the content drifts.

const mockCreateIssue = vi.fn();
const mockListIssues = vi.fn();
const mockListIssueComments = vi.fn();

const { mockLoadIssuesConfig } = vi.hoisted(() => ({
  mockLoadIssuesConfig: vi.fn(),
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
  listIssues: (...args: unknown[]) => mockListIssues(...args),
  listIssueComments: (...args: unknown[]) => mockListIssueComments(...args),
  addIssueComment: vi.fn(),
  mergeNeotomaToolingIssueLabels: (labels?: string[]) => [
    "neotoma",
    ...(labels ?? []).filter((label) => label !== "neotoma"),
  ],
}));

vi.mock("./config.js", () => ({
  loadIssuesConfig: (...args: unknown[]) => mockLoadIssuesConfig(...args),
}));

vi.mock("./redaction_guard.js", () => ({
  runRedactionGuard: ({ title, body }: { title: string; body: string }) => ({ title, body }),
}));

import { syncIssuesFromGitHub } from "./sync_issues_from_github.js";
import type { Operations } from "../../core/operations.js";

function makeGithubIssue(over: Partial<Record<string, unknown>> = {}) {
  return {
    number: 1619,
    html_url: "https://github.com/test/repo/issues/1619",
    title: "Original title",
    body: "Original body",
    state: "open",
    labels: [{ name: "bug" }],
    user: { login: "octocat", id: 1, type: "User" },
    created_at: "2026-06-01T00:00:00Z",
    closed_at: null,
    updated_at: "2026-06-01T00:00:00Z",
    ...over,
  };
}

function makeOps(store: ReturnType<typeof vi.fn>): Operations {
  return {
    store,
    correct: vi.fn(async () => ({ ok: true })),
    // Push leg finds nothing local; we only exercise the pull leg here.
    retrieveEntities: vi.fn(async () => ({ entities: [] })),
    executeTool: vi.fn(async () => ({})),
  } as unknown as Operations;
}

function issueStoreKeys(store: ReturnType<typeof vi.fn>): string[] {
  return store.mock.calls
    .map((c) => (c[0] as { idempotency_key?: string }).idempotency_key ?? "")
    .filter((k) => k.startsWith("issue-sync-"));
}

describe("issues-sync pull leg idempotency key (ERR_IDEMPOTENCY_MISMATCH)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadIssuesConfig.mockResolvedValue(defaultIssuesConfig);
    mockListIssueComments.mockResolvedValue([]);
  });

  it("includes the repo and issue number in the sync key", async () => {
    mockListIssues.mockResolvedValue([makeGithubIssue()]);
    const store = vi.fn(async () => ({ entities: [] }));
    await syncIssuesFromGitHub(makeOps(store), {});

    const keys = issueStoreKeys(store);
    expect(keys.length).toBe(1);
    expect(keys[0]).toMatch(/^issue-sync-test\/repo-1619-/);
  });

  it("keeps the SAME key when the issue content is unchanged (idempotent re-sync)", async () => {
    const store = vi.fn(async () => ({ entities: [] }));

    mockListIssues.mockResolvedValue([makeGithubIssue()]);
    await syncIssuesFromGitHub(makeOps(store), {});
    const firstKey = issueStoreKeys(store)[0];

    store.mockClear();
    mockListIssues.mockResolvedValue([makeGithubIssue()]);
    await syncIssuesFromGitHub(makeOps(store), {});
    const secondKey = issueStoreKeys(store)[0];

    expect(secondKey).toBe(firstKey);
  });

  it("changes the key when title/body/state/labels drift (so the update lands)", async () => {
    const store = vi.fn(async () => ({ entities: [] }));

    mockListIssues.mockResolvedValue([makeGithubIssue()]);
    await syncIssuesFromGitHub(makeOps(store), {});
    const baseKey = issueStoreKeys(store)[0];

    const variants = [
      { title: "Edited title" },
      { body: "Edited body" },
      { state: "closed", closed_at: "2026-06-10T00:00:00Z" },
      { labels: [{ name: "bug" }, { name: "priority/high" }] },
    ];

    for (const over of variants) {
      store.mockClear();
      mockListIssues.mockResolvedValue([makeGithubIssue(over)]);
      await syncIssuesFromGitHub(makeOps(store), {});
      const variantKey = issueStoreKeys(store)[0];
      expect(variantKey).not.toBe(baseKey);
    }
  });

  it("is insensitive to label ordering (same labels, different order => same key)", async () => {
    const store = vi.fn(async () => ({ entities: [] }));

    mockListIssues.mockResolvedValue([
      makeGithubIssue({ labels: [{ name: "bug" }, { name: "neotoma" }] }),
    ]);
    await syncIssuesFromGitHub(makeOps(store), {});
    const keyA = issueStoreKeys(store)[0];

    store.mockClear();
    mockListIssues.mockResolvedValue([
      makeGithubIssue({ labels: [{ name: "neotoma" }, { name: "bug" }] }),
    ]);
    await syncIssuesFromGitHub(makeOps(store), {});
    const keyB = issueStoreKeys(store)[0];

    expect(keyB).toBe(keyA);
  });
});
