/**
 * Inspector bulk close / remove must follow the row's own repo (#2536): a row mirrored from an
 * allowlisted repo closes that repo's issue, a row from a repo that is not permitted is closed
 * locally only, and a legacy row with no stored repo keeps using the configured repo. None of
 * them may ever close the same-numbered issue in a different repo.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCloseIssue, mockLoadIssuesConfig, mockSoftDelete, mockStoreStructured, snapshots } =
  vi.hoisted(() => ({
    mockCloseIssue: vi.fn(),
    mockLoadIssuesConfig: vi.fn(),
    mockSoftDelete: vi.fn(),
    mockStoreStructured: vi.fn(),
    snapshots: new Map<string, Record<string, unknown>>(),
  }));

vi.mock("./github_client.js", () => ({
  closeIssue: (...args: unknown[]) => mockCloseIssue(...args),
}));
vi.mock("./config.js", () => ({
  loadIssuesConfig: (...args: unknown[]) => mockLoadIssuesConfig(...args),
}));
vi.mock("../deletion.js", () => ({
  softDeleteEntity: (...args: unknown[]) => mockSoftDelete(...args),
}));
vi.mock("../../actions.js", () => ({
  storeStructuredForApi: (...args: unknown[]) => mockStoreStructured(...args),
}));
vi.mock("../../db.js", () => ({
  db: {
    from: (table: string) => {
      let entityId = "";
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (col: string, val: string) => {
        if (col === "id" || col === "entity_id") entityId = val;
        return chain;
      };
      chain.maybeSingle = async () => {
        if (table === "entities") {
          return { data: { id: entityId, entity_type: "issue" }, error: null };
        }
        return { data: { snapshot: snapshots.get(entityId) }, error: null };
      };
      return chain;
    },
  },
}));

import { bulkCloseIssues, bulkRemoveIssues } from "./inspector_bulk.js";

const OTHER = "acme/widgets";

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "Mirrored issue",
    status: "open",
    labels: [],
    github_number: 7,
    repo: OTHER,
    visibility: "public",
    author: "someone",
    created_at: "2026-05-01T00:00:00Z",
    closed_at: null,
    ...overrides,
  };
}

function useConfig(allowed: string[]): void {
  mockLoadIssuesConfig.mockResolvedValue({ repo: "test/repo", allowed_repos: allowed });
}

describe("inspector bulk close / remove follow the row's repo (#2536)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snapshots.clear();
    mockCloseIssue.mockResolvedValue({});
    mockStoreStructured.mockResolvedValue({});
    mockSoftDelete.mockResolvedValue({ success: true });
  });

  describe.each([
    ["bulkCloseIssues", bulkCloseIssues],
    ["bulkRemoveIssues", bulkRemoveIssues],
  ] as const)("%s", (_name, run) => {
    it("closes the GitHub issue in an allowlisted other repo, not the configured repo", async () => {
      useConfig([OTHER]);
      snapshots.set("ent-other", row());

      const { results } = await run("user-1", ["ent-other"]);

      expect(mockCloseIssue).toHaveBeenCalledTimes(1);
      expect(mockCloseIssue).toHaveBeenCalledWith(7, { repo: OTHER });
      expect(results[0]).toMatchObject({ ok: true, github_closed: true });
    });

    it("makes no GitHub call for a repo that is not permitted, and still acts locally", async () => {
      useConfig([]);
      snapshots.set("ent-blocked", row());

      const { results } = await run("user-1", ["ent-blocked"]);

      expect(mockCloseIssue).not.toHaveBeenCalled();
      expect(results[0]).toMatchObject({ ok: true, github_closed: false });
    });

    it("keeps using the configured repo for a legacy row with no stored repo", async () => {
      useConfig([OTHER]);
      snapshots.set("ent-legacy", row({ repo: undefined }));

      const { results } = await run("user-1", ["ent-legacy"]);

      expect(mockCloseIssue).toHaveBeenCalledWith(7, { repo: "test/repo" });
      expect(results[0]).toMatchObject({ ok: true, github_closed: true });
    });

    it("makes no GitHub call for a local-only row with no github_number", async () => {
      useConfig([OTHER]);
      snapshots.set("ent-local", row({ github_number: 0 }));

      const { results } = await run("user-1", ["ent-local"]);

      expect(mockCloseIssue).not.toHaveBeenCalled();
      expect(results[0]).toMatchObject({ ok: true, github_closed: false });
    });
  });

  it("bulk close persists the closed status locally for a row that is not permitted", async () => {
    useConfig([]);
    snapshots.set("ent-blocked", row());

    await bulkCloseIssues("user-1", ["ent-blocked"]);

    const stored = mockStoreStructured.mock.calls[0]?.[0] as {
      entities: Array<Record<string, unknown>>;
    };
    expect(stored.entities[0]).toMatchObject({ status: "closed", repo: OTHER, github_number: 7 });
  });

  it("bulk remove soft-deletes a row that is not permitted without a GitHub call", async () => {
    useConfig([]);
    snapshots.set("ent-blocked", row());

    await bulkRemoveIssues("user-1", ["ent-blocked"]);

    expect(mockSoftDelete).toHaveBeenCalledTimes(1);
    expect(mockCloseIssue).not.toHaveBeenCalled();
  });
});
