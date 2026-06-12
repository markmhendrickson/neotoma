import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Operations, StoreInput, StoreResult } from "../../src/core/operations.js";
import type { GitHubComment, GitHubIssue } from "../../src/services/issues/types.js";

const mockListIssues = vi.fn();
const mockListIssueComments = vi.fn();
const mockCreateIssue = vi.fn();

const { mockLoadIssuesConfig } = vi.hoisted(() => ({
  mockLoadIssuesConfig: vi.fn(),
}));

vi.mock("../../src/services/issues/config.js", () => ({
  loadIssuesConfig: (...args: unknown[]) => mockLoadIssuesConfig(...args),
}));

vi.mock("../../src/services/issues/github_client.js", () => ({
  listIssues: (...args: unknown[]) => mockListIssues(...args),
  listIssueComments: (...args: unknown[]) => mockListIssueComments(...args),
  createIssue: (...args: unknown[]) => mockCreateIssue(...args),
}));

vi.mock("../../src/services/issues/redaction_guard.js", () => ({
  runRedactionGuard: (input: { title: string; body: string; mode: string }) => ({
    title: `[redacted] ${input.title}`,
    body: `[redacted] ${input.body}`,
    redacted: false,
  }),
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

    const result = await syncIssuesFromGitHub(ops, {
      state: "all",
      labels: ["bug"],
      since: "2026-05-01T00:00:00Z",
    });

    expect(mockListIssues).toHaveBeenCalledWith({
      state: "all",
      labels: ["bug"],
      since: "2026-05-01T00:00:00Z",
      per_page: 100,
    });
    expect(mockListIssueComments).toHaveBeenCalledTimes(2);
    expect(store).toHaveBeenCalledTimes(5);
    expect(result).toMatchObject({ issues_synced: 2, messages_synced: 3, errors: [] });
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

    // The issue key includes updated_at so a changed issue gets a fresh key,
    // but an unchanged issue re-synced twice keeps the same key (dedup).
    expect(store).toHaveBeenCalledTimes(4);
    expect(seenIdempotencyKeys).toEqual(
      new Set([
        "issue-sync-test/repo-1-2026-05-01T00:00:00Z-m2",
        "issue-comment-sync-test/repo-1-101",
      ])
    );
  });

  it("gives a changed issue a fresh idempotency key (avoids ERR_IDEMPOTENCY_MISMATCH)", async () => {
    const { ops, seenIdempotencyKeys } = createOps();
    mockListIssueComments.mockResolvedValue([]);

    // Same issue number, different content + later updated_at (as GitHub returns
    // after an edit). The store must use a distinct key, or Neotoma rejects the
    // write as a mismatch and the issue never updates locally.
    const v1 = { ...issue(1, "Original title"), updated_at: "2026-05-01T00:00:00Z" };
    const v2 = { ...issue(1, "Edited title"), updated_at: "2026-05-02T12:00:00Z" };

    mockListIssues.mockResolvedValueOnce([v1]);
    await syncIssuesFromGitHub(ops);
    mockListIssues.mockResolvedValueOnce([v2]);
    await syncIssuesFromGitHub(ops);

    expect(seenIdempotencyKeys.has("issue-sync-test/repo-1-2026-05-01T00:00:00Z-m2")).toBe(true);
    expect(seenIdempotencyKeys.has("issue-sync-test/repo-1-2026-05-02T12:00:00Z-m2")).toBe(true);
  });

  it("re-stores an unchanged issue with a byte-identical payload (no wall-clock drift)", async () => {
    // The idempotency check hashes the FULL entity payload. A wall-clock
    // last_synced_at/data_source made the payload differ every run, so an
    // unchanged issue under its stable updated_at key tripped
    // ERR_IDEMPOTENCY_MISMATCH. Provenance is now derived from updated_at, so
    // two runs over identical GitHub data must produce identical store payloads.
    const { ops, store } = createOps();
    mockListIssues.mockResolvedValue([issue(1)]);
    mockListIssueComments.mockResolvedValue([]);

    await syncIssuesFromGitHub(ops);
    const firstPayload = JSON.stringify(store.mock.calls[0]?.[0]?.entities);

    store.mockClear();
    mockListIssues.mockResolvedValue([issue(1)]);
    await syncIssuesFromGitHub(ops);
    const secondPayload = JSON.stringify(store.mock.calls[0]?.[0]?.entities);

    expect(secondPayload).toBe(firstPayload);
    // And provenance reflects the issue's updated_at, not wall-clock.
    const issueEntity = store.mock.calls[0]?.[0]?.entities?.[0] as Record<string, unknown>;
    expect(issueEntity.last_synced_at).toBe("2026-05-01T00:00:00Z");
    expect(issueEntity.data_source).toContain("2026-05-01");
  });

  describe("push leg — local public issues without github_number", () => {
    function makeEntityList(
      entities: Array<{ entity_id: string; snapshot: Record<string, unknown> }>
    ) {
      return { entities };
    }

    beforeEach(() => {
      mockListIssues.mockResolvedValue([]);
      mockCreateIssue.mockResolvedValue({
        number: 42,
        html_url: "https://github.com/test/repo/issues/42",
        created_at: "2026-06-09T00:00:00Z",
      });
    });

    it("pushes a public issue with no github_number to GitHub and corrects the entity", async () => {
      const { ops } = createOps();
      (ops.retrieveEntities as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeEntityList([
          {
            entity_id: "ent-public-1",
            snapshot: {
              visibility: "public",
              github_number: null,
              title: "Public bug",
              body: "Details here",
              labels: ["bug"],
            },
          },
        ])
      );

      const result = await syncIssuesFromGitHub(ops);

      expect(mockCreateIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "[redacted] Public bug",
          body: "[redacted] Details here",
        })
      );
      // #1610: write-back uses per-field correct() calls (field + value +
      // idempotency_key), NOT a `corrections` map (which fails Zod validation
      // and caused duplicate GitHub issues on every sync).
      const correctCalls = (ops.correct as ReturnType<typeof vi.fn>).mock.calls.map(
        (c) => c[0] as Record<string, unknown>
      );
      for (const arg of correctCalls) {
        expect(arg).not.toHaveProperty("corrections");
        expect(arg.entity_id).toBe("ent-public-1");
        expect(arg.entity_type).toBe("issue");
        expect(typeof arg.field).toBe("string");
        expect(typeof arg.idempotency_key).toBe("string");
        expect((arg.idempotency_key as string).length).toBeGreaterThan(0);
      }
      const byField = Object.fromEntries(correctCalls.map((a) => [a.field, a.value]));
      expect(byField.github_number).toBe(42);
      expect(byField.github_url).toBe("https://github.com/test/repo/issues/42");
      expect(byField.sync_pending).toBe(false);
      expect(byField.last_synced_at).toBe("2026-06-09T00:00:00Z");

      expect(result.issues_pushed).toBe(1);
      expect(result.push_errors).toEqual([]);
    });

    it("skips private issues — does not push them to GitHub", async () => {
      const { ops } = createOps();
      (ops.retrieveEntities as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeEntityList([
          {
            entity_id: "ent-private-1",
            snapshot: {
              visibility: "private",
              github_number: null,
              title: "Private note",
              body: "Internal",
              labels: [],
            },
          },
        ])
      );

      const result = await syncIssuesFromGitHub(ops);

      expect(mockCreateIssue).not.toHaveBeenCalled();
      expect(result.issues_pushed).toBe(0);
    });

    it("skips issues that already have a numeric github_number", async () => {
      const { ops } = createOps();
      (ops.retrieveEntities as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeEntityList([
          {
            entity_id: "ent-synced-1",
            snapshot: {
              visibility: "public",
              github_number: 7,
              title: "Already filed",
              body: "Nothing to do",
              labels: [],
            },
          },
        ])
      );

      const result = await syncIssuesFromGitHub(ops);

      expect(mockCreateIssue).not.toHaveBeenCalled();
      expect(result.issues_pushed).toBe(0);
    });

    it("skips issues that already have a string github_number", async () => {
      const { ops } = createOps();
      (ops.retrieveEntities as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeEntityList([
          {
            entity_id: "ent-synced-str",
            snapshot: {
              visibility: "public",
              github_number: "12",
              title: "Already filed (string id)",
              body: "Nothing to do",
              labels: [],
            },
          },
        ])
      );

      const result = await syncIssuesFromGitHub(ops);

      expect(mockCreateIssue).not.toHaveBeenCalled();
      expect(result.issues_pushed).toBe(0);
    });

    it("accumulates push_errors without aborting the pull leg when createIssue throws", async () => {
      const { ops } = createOps();
      (ops.retrieveEntities as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeEntityList([
          {
            entity_id: "ent-fail-1",
            snapshot: {
              visibility: "public",
              github_number: null,
              title: "Failing push",
              body: "Details",
              labels: [],
            },
          },
        ])
      );
      mockCreateIssue.mockRejectedValue(new Error("GitHub 422 Unprocessable"));

      const result = await syncIssuesFromGitHub(ops);

      expect(result.issues_pushed).toBe(0);
      expect(result.push_errors).toHaveLength(1);
      expect(result.push_errors[0]).toContain("GitHub 422 Unprocessable");
      // Pull leg still runs (no errors from pull leg in this test)
      expect(result.errors).toEqual([]);
    });

    it("skips the entire push leg when push param is false", async () => {
      const { ops } = createOps();
      (ops.retrieveEntities as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeEntityList([
          {
            entity_id: "ent-skipped-1",
            snapshot: {
              visibility: "public",
              github_number: null,
              title: "Would be pushed",
              body: "Details",
              labels: [],
            },
          },
        ])
      );

      const result = await syncIssuesFromGitHub(ops, { push: false });

      expect(mockCreateIssue).not.toHaveBeenCalled();
      expect(ops.retrieveEntities).not.toHaveBeenCalled();
      expect(result.issues_pushed).toBe(0);
    });

    it("applies redaction via runRedactionGuard before sending to GitHub", async () => {
      const { ops } = createOps();
      (ops.retrieveEntities as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeEntityList([
          {
            entity_id: "ent-redact-1",
            snapshot: {
              visibility: "public",
              github_number: null,
              title: "Issue with PII name",
              body: "Contact me at private@example.com",
              labels: [],
            },
          },
        ])
      );

      await syncIssuesFromGitHub(ops);

      // Our mock prepends "[redacted] " to confirm runRedactionGuard was called
      expect(mockCreateIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "[redacted] Issue with PII name",
          body: "[redacted] Contact me at private@example.com",
        })
      );
    });
  });
});
