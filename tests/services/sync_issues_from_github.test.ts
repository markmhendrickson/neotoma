import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Operations, StoreInput, StoreResult } from "../../src/core/operations.js";
import type { GitHubComment, GitHubIssue } from "../../src/services/issues/types.js";

const mockListIssues = vi.fn();
const mockListIssueComments = vi.fn();
const mockCreateIssue = vi.fn();
const mockGetIssue = vi.fn();

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
  getIssue: (...args: unknown[]) => mockGetIssue(...args),
}));

vi.mock("../../src/services/issues/redaction_guard.js", () => ({
  runRedactionGuard: (input: { title: string; body: string; mode: string }) => ({
    title: `[redacted] ${input.title}`,
    body: `[redacted] ${input.body}`,
    redacted: false,
  }),
}));

import {
  syncIssueIfStale,
  syncIssuesFromGitHub,
} from "../../src/services/issues/sync_issues_from_github.js";

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

    expect(mockListIssues).toHaveBeenCalledWith(
      {
        state: "all",
        labels: ["bug"],
        since: "2026-05-01T00:00:00Z",
        per_page: 100,
      },
      { repo: "test/repo" }
    );
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
        "issue-comment-sync-test/repo-1-101-2026-05-01T00:00:00Z-m2",
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

  it("gives a comment a fresh key when its issue's updated_at changes", async () => {
    // The comment store re-stores the issue entity (deterministic, tracks
    // issue.updated_at). When the issue changes, the comment payload changes
    // too, so its key must include issue.updated_at — otherwise the new content
    // collides with the stale row under a comment.id-only key. This accumulated
    // in production once the swarm started bumping issue.updated_at.
    const { ops, seenIdempotencyKeys } = createOps();
    mockListIssueComments.mockResolvedValue([comment(101)]);

    mockListIssues.mockResolvedValueOnce([
      { ...issue(1), updated_at: "2026-05-01T00:00:00Z" },
    ]);
    await syncIssuesFromGitHub(ops);
    mockListIssues.mockResolvedValueOnce([
      { ...issue(1, "Edited"), updated_at: "2026-05-02T12:00:00Z" },
    ]);
    await syncIssuesFromGitHub(ops);

    expect(
      seenIdempotencyKeys.has("issue-comment-sync-test/repo-1-101-2026-05-01T00:00:00Z-m2")
    ).toBe(true);
    expect(
      seenIdempotencyKeys.has("issue-comment-sync-test/repo-1-101-2026-05-02T12:00:00Z-m2")
    ).toBe(true);
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
        }),
        { repo: "test/repo" }
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
        }),
        { repo: "test/repo" }
      );
    });
  });
  describe("repo argument, dry run and push opt-in (#2536)", () => {
    const publicUnpushed = {
      entity_id: "ent-local-1",
      snapshot: {
        visibility: "public",
        github_number: null,
        title: "Local only",
        body: "Never pushed",
        labels: [],
      },
    };

    /** A local mirror of `repo#number`, last synced at `lastSyncedAt`. */
    function mirrored(repo: string, number: number, lastSyncedAt: string) {
      return {
        entity_id: `ent-mirror-${repo}-${number}`,
        snapshot: {
          visibility: "public",
          repo,
          github_number: number,
          title: `Issue ${number}`,
          last_synced_at: lastSyncedAt,
        },
      };
    }

    beforeEach(() => {
      mockLoadIssuesConfig.mockResolvedValue({
        repo: "test/repo",
        allowed_repos: ["acme/widgets"],
        sync_staleness_ms: 300_000,
      });
      mockListIssues.mockResolvedValue([]);
      mockCreateIssue.mockResolvedValue({
        number: 77,
        html_url: "https://github.com/other/repo/issues/77",
        created_at: "2026-06-09T00:00:00Z",
      });
    });

    describe("repo validation", () => {
      it.each([
        "notaslug",
        "a/b/c",
        "owner/",
        "/name",
        "owner/..",
        "owner/.",
        "own er/name",
        "owner/na?me",
        "owner/na#me",
        "https://github.com/owner/name",
        "-owner/name",
        "owner-/name",
        "",
      ])("rejects malformed repo %j before any GitHub call or write", async (bad) => {
        const { ops, store } = createOps();
        await expect(syncIssuesFromGitHub(ops, { repo: bad })).rejects.toThrow(/owner\/name/);
        expect(mockListIssues).not.toHaveBeenCalled();
        expect(mockCreateIssue).not.toHaveBeenCalled();
        expect(store).not.toHaveBeenCalled();
        expect(ops.correct).not.toHaveBeenCalled();
        expect(ops.retrieveEntities).not.toHaveBeenCalled();
      });

      it("accepts a well-formed repo and targets it on every GitHub call and stored key", async () => {
        const { ops, store, seenIdempotencyKeys } = createOps();
        mockListIssues.mockResolvedValue([issue(5)]);
        mockListIssueComments.mockResolvedValue([comment(501)]);

        const result = await syncIssuesFromGitHub(ops, { repo: "acme/widgets" });

        expect(result.repo).toBe("acme/widgets");
        expect(mockListIssues).toHaveBeenCalledWith(expect.anything(), { repo: "acme/widgets" });
        expect(mockListIssueComments).toHaveBeenCalledWith(5, undefined, { repo: "acme/widgets" });
        expect(store).toHaveBeenCalledTimes(2);
        expect(seenIdempotencyKeys).toEqual(
          new Set([
            "issue-sync-acme/widgets-5-2026-05-01T00:00:00Z-m2",
            "issue-comment-sync-acme/widgets-5-501-2026-05-01T00:00:00Z-m2",
          ])
        );
        const issueEntity = store.mock.calls[0]?.[0]?.entities?.[0] as Record<string, unknown>;
        expect(issueEntity.repo).toBe("acme/widgets");
      });

      it("falls back to the configured default repo when repo is omitted", async () => {
        const { ops } = createOps();
        const result = await syncIssuesFromGitHub(ops);
        expect(result.repo).toBe("test/repo");
        expect(mockListIssues).toHaveBeenCalledWith(expect.anything(), { repo: "test/repo" });
      });
    });

    describe("push default", () => {
      it("does NOT push for a repo that differs from the configured default", async () => {
        const { ops } = createOps();
        (ops.retrieveEntities as ReturnType<typeof vi.fn>).mockResolvedValue({
          entities: [publicUnpushed],
        });

        const result = await syncIssuesFromGitHub(ops, { repo: "acme/widgets" });

        expect(result.push_enabled).toBe(false);
        expect(result.issues_pushed).toBe(0);
        expect(mockCreateIssue).not.toHaveBeenCalled();
        expect(ops.correct).not.toHaveBeenCalled();
        // The pull leg still ran against the requested repo.
        expect(mockListIssues).toHaveBeenCalledTimes(1);
      });

      it("treats the default repo case-insensitively (still pushes by default)", async () => {
        const { ops } = createOps();
        (ops.retrieveEntities as ReturnType<typeof vi.fn>).mockResolvedValue({
          entities: [publicUnpushed],
        });

        const result = await syncIssuesFromGitHub(ops, { repo: "Test/Repo" });

        expect(result.push_enabled).toBe(true);
        expect(result.issues_pushed).toBe(1);
      });

      it("keeps the historical push-on default for the configured default repo", async () => {
        const { ops } = createOps();
        (ops.retrieveEntities as ReturnType<typeof vi.fn>).mockResolvedValue({
          entities: [publicUnpushed],
        });

        const result = await syncIssuesFromGitHub(ops);

        expect(result.push_enabled).toBe(true);
        expect(result.issues_pushed).toBe(1);
        expect(mockCreateIssue).toHaveBeenCalledTimes(1);
      });

      it("pushes to a non-default repo only with explicit push: true, and binds repo on write-back", async () => {
        const { ops } = createOps();
        (ops.retrieveEntities as ReturnType<typeof vi.fn>).mockResolvedValue({
          entities: [publicUnpushed],
        });

        const result = await syncIssuesFromGitHub(ops, { repo: "acme/widgets", push: true });

        expect(result.push_enabled).toBe(true);
        expect(result.issues_pushed).toBe(1);
        expect(mockCreateIssue).toHaveBeenCalledWith(expect.anything(), { repo: "acme/widgets" });
        const byField = Object.fromEntries(
          (ops.correct as ReturnType<typeof vi.fn>).mock.calls.map((c) => [
            (c[0] as { field: string }).field,
            (c[0] as { value: unknown }).value,
          ])
        );
        expect(byField.repo).toBe("acme/widgets");
        expect(byField.github_number).toBe(77);
      });

      it("honours an explicit push: false even for the default repo", async () => {
        const { ops } = createOps();
        (ops.retrieveEntities as ReturnType<typeof vi.fn>).mockResolvedValue({
          entities: [publicUnpushed],
        });

        const result = await syncIssuesFromGitHub(ops, { push: false });

        expect(result.push_enabled).toBe(false);
        expect(mockCreateIssue).not.toHaveBeenCalled();
        expect(ops.retrieveEntities).not.toHaveBeenCalled();
      });
    });

    describe("dry run (commit: false)", () => {
      it("writes nothing: no store, no correct, no GitHub create", async () => {
        const { ops, store } = createOps();
        mockListIssues.mockResolvedValue([issue(1), issue(2)]);
        mockListIssueComments.mockResolvedValue([comment(101)]);
        (ops.retrieveEntities as ReturnType<typeof vi.fn>).mockResolvedValue({
          entities: [publicUnpushed],
        });

        const result = await syncIssuesFromGitHub(ops, { commit: false });

        expect(result.dry_run).toBe(true);
        expect(store).not.toHaveBeenCalled();
        expect(ops.correct).not.toHaveBeenCalled();
        expect(mockCreateIssue).not.toHaveBeenCalled();
        expect(result.issues_synced).toBe(0);
        expect(result.messages_synced).toBe(0);
        expect(result.issues_pushed).toBe(0);
      });

      it("reports what would be created, updated, left unchanged and pushed", async () => {
        const { ops, store } = createOps();
        mockListIssues.mockResolvedValue([
          issue(1), // no local mirror -> create
          { ...issue(2), updated_at: "2026-05-09T00:00:00Z" }, // local behind -> update
          issue(3), // local current -> unchanged
        ]);
        mockListIssueComments.mockResolvedValue([comment(1), comment(2)]);
        (ops.retrieveEntities as ReturnType<typeof vi.fn>).mockResolvedValue({
          entities: [
            mirrored("test/repo", 2, "2026-05-01T00:00:00Z"),
            mirrored("test/repo", 3, "2026-05-01T00:00:00Z"),
            // Same number in a different repo must not be mistaken for a mirror.
            mirrored("other/repo", 1, "2026-05-01T00:00:00Z"),
            publicUnpushed,
          ],
        });

        const result = await syncIssuesFromGitHub(ops, { commit: false });

        expect(result.plan).toEqual({
          issues_to_create: [{ github_number: 1, title: "Issue 1" }],
          issues_to_update: [{ github_number: 2, title: "Issue 2" }],
          issues_unchanged: 1,
          messages_to_sync: 6,
          issues_to_push: [{ entity_id: "ent-local-1", title: "Local only" }],
          warnings: [],
        });
        expect(result.push_enabled).toBe(true);
        expect(store).not.toHaveBeenCalled();
      });

      it("combines with repo: previews a non-default repo, push off, still writes nothing", async () => {
        const { ops, store } = createOps();
        mockListIssues.mockResolvedValue([issue(9)]);
        (ops.retrieveEntities as ReturnType<typeof vi.fn>).mockResolvedValue({
          entities: [publicUnpushed],
        });

        const result = await syncIssuesFromGitHub(ops, { repo: "acme/widgets", commit: false });

        expect(result.repo).toBe("acme/widgets");
        expect(result.push_enabled).toBe(false);
        expect(result.plan?.issues_to_create).toEqual([{ github_number: 9, title: "Issue 9" }]);
        expect(result.plan?.issues_to_push).toEqual([]);
        expect(store).not.toHaveBeenCalled();
        expect(mockCreateIssue).not.toHaveBeenCalled();
      });

      it("previews the push for a non-default repo when push: true is passed", async () => {
        const { ops } = createOps();
        (ops.retrieveEntities as ReturnType<typeof vi.fn>).mockResolvedValue({
          entities: [publicUnpushed],
        });

        const result = await syncIssuesFromGitHub(ops, {
          repo: "acme/widgets",
          push: true,
          commit: false,
        });

        expect(result.plan?.issues_to_push).toEqual([
          { entity_id: "ent-local-1", title: "Local only" },
        ]);
        expect(mockCreateIssue).not.toHaveBeenCalled();
        expect(ops.correct).not.toHaveBeenCalled();
      });

      it("a normal (commit-by-default) run has no plan and dry_run false", async () => {
        const { ops } = createOps();
        const result = await syncIssuesFromGitHub(ops);
        expect(result.dry_run).toBe(false);
        expect(result.plan).toBeUndefined();
      });
    });
  });

  describe("repo allowlist (#2536)", () => {
    const mirroredOther = {
      entity_id: "ent-local-1",
      snapshot: { visibility: "public", github_number: null, title: "Local only", body: "b" },
    };

    function expectNoAccess(ops: Operations, store: ReturnType<typeof createOps>["store"]) {
      expect(mockListIssues).not.toHaveBeenCalled();
      expect(mockListIssueComments).not.toHaveBeenCalled();
      expect(mockCreateIssue).not.toHaveBeenCalled();
      expect(mockGetIssue).not.toHaveBeenCalled();
      expect(store).not.toHaveBeenCalled();
      expect(ops.correct).not.toHaveBeenCalled();
      expect(ops.retrieveEntities).not.toHaveBeenCalled();
    }

    beforeEach(() => {
      mockListIssues.mockResolvedValue([issue(1)]);
      mockListIssueComments.mockResolvedValue([]);
      mockCreateIssue.mockResolvedValue({
        number: 9,
        html_url: "https://github.com/acme/widgets/issues/9",
        created_at: "2026-06-09T00:00:00Z",
      });
    });

    it.each([
      ["pull", {}],
      ["push", { push: true }],
      ["dry run", { commit: false }],
      ["dry run with push", { commit: false, push: true }],
    ])("rejects a repo that is not on the allowlist for %s before any access", async (_n, extra) => {
      mockLoadIssuesConfig.mockResolvedValue({
        repo: "test/repo",
        allowed_repos: ["acme/widgets"],
        sync_staleness_ms: 300_000,
      });
      const { ops, store } = createOps();
      (ops.retrieveEntities as ReturnType<typeof vi.fn>).mockResolvedValue({
        entities: [mirroredOther],
      });

      await expect(
        syncIssuesFromGitHub(ops, { repo: "other/private-thing", ...extra })
      ).rejects.toMatchObject({ code: "ERR_ISSUE_REPO_NOT_ALLOWED", status: 403 });
      expectNoAccess(ops, store);
    });

    it("gives the same rejection text for any repo outside the list and never echoes it", async () => {
      const { ops } = createOps();
      const messages: string[] = [];
      for (const repo of ["other/exists", "other/does-not-exist-anywhere"]) {
        try {
          await syncIssuesFromGitHub(ops, { repo });
        } catch (err) {
          messages.push((err as Error).message);
        }
      }
      expect(messages).toHaveLength(2);
      expect(messages[0]).toBe(messages[1]);
      expect(messages[0]).not.toContain("other/");
      expect(messages[0]).toContain("not enabled for issue sync");
    });

    it("lets a listed repo proceed", async () => {
      mockLoadIssuesConfig.mockResolvedValue({
        repo: "test/repo",
        allowed_repos: ["acme/widgets"],
        sync_staleness_ms: 300_000,
      });
      const { ops, store } = createOps();
      const result = await syncIssuesFromGitHub(ops, { repo: "acme/widgets" });
      expect(result.repo).toBe("acme/widgets");
      expect(mockListIssues).toHaveBeenCalledWith(expect.anything(), { repo: "acme/widgets" });
      expect(store).toHaveBeenCalled();
    });

    it("always allows the configured repo, with the list unset, empty or elsewhere", async () => {
      for (const allowed of [undefined, [], ["acme/widgets"]]) {
        vi.clearAllMocks();
        mockListIssues.mockResolvedValue([]);
        mockLoadIssuesConfig.mockResolvedValue({
          repo: "test/repo",
          ...(allowed ? { allowed_repos: allowed } : {}),
          sync_staleness_ms: 300_000,
        });
        const { ops } = createOps();
        const result = await syncIssuesFromGitHub(ops, { repo: "test/repo" });
        expect(result.repo).toBe("test/repo");
        expect(mockListIssues).toHaveBeenCalledTimes(1);
      }
    });

    it("treats an unset or empty list as the configured repo only (fail closed)", async () => {
      for (const allowed of [undefined, []]) {
        vi.clearAllMocks();
        mockLoadIssuesConfig.mockResolvedValue({
          repo: "test/repo",
          ...(allowed ? { allowed_repos: allowed } : {}),
          sync_staleness_ms: 300_000,
        });
        const { ops, store } = createOps();
        await expect(syncIssuesFromGitHub(ops, { repo: "acme/widgets" })).rejects.toMatchObject({
          code: "ERR_ISSUE_REPO_NOT_ALLOWED",
        });
        expectNoAccess(ops, store);
      }
    });

    it("matches case-insensitively in both directions", async () => {
      mockLoadIssuesConfig.mockResolvedValue({
        repo: "Test/Repo",
        allowed_repos: ["Acme/Widgets"],
        sync_staleness_ms: 300_000,
      });
      mockListIssues.mockResolvedValue([]);
      const { ops } = createOps();
      await expect(syncIssuesFromGitHub(ops, { repo: "acme/widgets" })).resolves.toMatchObject({
        repo: "acme/widgets",
      });
      await expect(syncIssuesFromGitHub(ops, { repo: "TEST/REPO" })).resolves.toMatchObject({
        repo: "TEST/REPO",
      });
    });

    it("does not treat a wildcard as a match", async () => {
      mockLoadIssuesConfig.mockResolvedValue({
        repo: "test/repo",
        allowed_repos: ["acme/*"],
        sync_staleness_ms: 300_000,
      });
      const { ops, store } = createOps();
      await expect(syncIssuesFromGitHub(ops, { repo: "acme/widgets" })).rejects.toMatchObject({
        code: "ERR_ISSUE_REPO_NOT_ALLOWED",
      });
      expectNoAccess(ops, store);
    });
  });

  describe("syncIssueIfStale repo argument (#2536)", () => {
    beforeEach(() => {
      mockLoadIssuesConfig.mockResolvedValue({
        repo: "test/repo",
        allowed_repos: ["acme/widgets"],
        sync_staleness_ms: 300_000,
      });
      mockGetIssue.mockResolvedValue(issue(7));
      mockListIssueComments.mockResolvedValue([comment(701)]);
    });

    it("reads the issue and its comments from the given repo and stores them under it", async () => {
      const { ops, store, seenIdempotencyKeys } = createOps();

      const synced = await syncIssueIfStale(ops, 7, null, "acme/widgets");

      expect(synced).toBe(true);
      expect(mockGetIssue).toHaveBeenCalledWith(7, { repo: "acme/widgets" });
      expect(mockListIssueComments).toHaveBeenCalledWith(7, undefined, { repo: "acme/widgets" });
      const issueEntity = store.mock.calls[0]?.[0]?.entities?.[0] as Record<string, unknown>;
      expect(issueEntity.repo).toBe("acme/widgets");
      expect([...seenIdempotencyKeys].every((k) => k.includes("acme/widgets"))).toBe(true);
    });

    it("defaults to the configured repo when no repo is given", async () => {
      const { ops } = createOps();
      await syncIssueIfStale(ops, 7, null);
      expect(mockGetIssue).toHaveBeenCalledWith(7, { repo: "test/repo" });
    });

    it("rejects a repo outside the allowlist before any GitHub request", async () => {
      const { ops, store } = createOps();
      await expect(syncIssueIfStale(ops, 7, null, "other/repo")).rejects.toMatchObject({
        code: "ERR_ISSUE_REPO_NOT_ALLOWED",
      });
      expect(mockGetIssue).not.toHaveBeenCalled();
      expect(mockListIssueComments).not.toHaveBeenCalled();
      expect(store).not.toHaveBeenCalled();
    });
  });
});
