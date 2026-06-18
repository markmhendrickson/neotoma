import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression coverage for #1610: the push leg must write github_number/url back
// onto the local issue entity using per-field `correct` calls (field + value +
// idempotency_key). The previous implementation passed a `corrections` map,
// which failed Zod validation at the tool boundary, so the local entity never
// recorded its github_number and every subsequent sync re-pushed it — creating
// duplicate GitHub issues.

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

// Redaction guard passes title/body through in tests.
vi.mock("./redaction_guard.js", () => ({
  runRedactionGuard: ({ title, body }: { title: string; body: string }) => ({ title, body }),
}));

import { syncIssuesFromGitHub } from "./sync_issues_from_github.js";
import type { Operations } from "../../core/operations.js";

function makeOps(correctImpl?: (input: unknown) => Promise<unknown>): {
  ops: Operations;
  correct: ReturnType<typeof vi.fn>;
} {
  const correct = vi.fn(correctImpl ?? (async () => ({ ok: true })));
  const ops = {
    correct,
    // Return one unsynced public issue with no github_number.
    retrieveEntities: vi.fn(async () => ({
      entities: [
        {
          entity_id: "ent_test_issue_1",
          snapshot: {
            visibility: "public",
            github_number: "",
            title: "Test issue title",
            body: "Test issue body",
            labels: ["bug"],
          },
        },
      ],
    })),
    executeTool: vi.fn(async () => ({})),
  } as unknown as Operations;
  return { ops, correct };
}

describe("sync_issues push leg write-back (#1610)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadIssuesConfig.mockResolvedValue(defaultIssuesConfig);
    mockCreateIssue.mockResolvedValue({
      number: 4242,
      html_url: "https://github.com/test/repo/issues/4242",
      created_at: "2026-06-09T00:00:00Z",
      title: "Test issue title",
      body: "Test issue body",
      state: "open",
      labels: [{ name: "bug" }],
      user: null,
      closed_at: null,
      updated_at: "2026-06-09T00:00:00Z",
    });
    // Pull leg returns nothing — we only exercise the push leg here.
    mockListIssues.mockResolvedValue([]);
    mockListIssueComments.mockResolvedValue([]);
  });

  it("writes github_number/url back via per-field correct() with idempotency keys", async () => {
    const { ops, correct } = makeOps();

    const result = await syncIssuesFromGitHub(ops, { push: true });

    expect(result.issues_pushed).toBe(1);
    expect(result.push_errors).toEqual([]);

    // One correct() call per write-back field — never a `corrections` map.
    const fields = correct.mock.calls.map((c) => (c[0] as { field: string }).field);
    expect(fields).toEqual(["github_number", "github_url", "sync_pending", "last_synced_at"]);

    for (const call of correct.mock.calls) {
      const arg = call[0] as Record<string, unknown>;
      expect(arg).not.toHaveProperty("corrections");
      expect(arg.entity_id).toBe("ent_test_issue_1");
      expect(arg.entity_type).toBe("issue");
      expect(typeof arg.field).toBe("string");
      expect(arg).toHaveProperty("value");
      // idempotency_key is required and unique per field.
      expect(typeof arg.idempotency_key).toBe("string");
      expect((arg.idempotency_key as string).length).toBeGreaterThan(0);
    }

    const githubNumberCall = correct.mock.calls.find(
      (c) => (c[0] as { field: string }).field === "github_number"
    )?.[0] as Record<string, unknown>;
    expect(githubNumberCall.value).toBe(4242);

    // last_synced_at is derived from the GitHub created_at (deterministic),
    // not wall-clock, so replays stay idempotent.
    const lastSyncedCall = correct.mock.calls.find(
      (c) => (c[0] as { field: string }).field === "last_synced_at"
    )?.[0] as Record<string, unknown>;
    expect(lastSyncedCall.value).toBe("2026-06-09T00:00:00Z");

    // Idempotency keys are unique across the four fields.
    const keys = correct.mock.calls.map(
      (c) => (c[0] as { idempotency_key: string }).idempotency_key
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("still counts the issue as pushed and records a per-field error when write-back fails", async () => {
    const { ops } = makeOps(async () => {
      throw new Error("simulated correct failure");
    });

    const result = await syncIssuesFromGitHub(ops, { push: true });

    // GitHub issue exists, so it counts as pushed despite the local failure.
    expect(result.issues_pushed).toBe(1);
    // One push_error per failing field (4 fields).
    expect(result.push_errors.length).toBe(4);
    expect(result.push_errors[0]).toContain("write-back failed");
  });
});
