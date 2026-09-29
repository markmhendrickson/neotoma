/**
 * sync_issues handler pass-through and rejection, per surface (#2536).
 *
 * The contract test compares declared schema fields and the CLI test stops at the request
 * body, so neither notices a handler that validates `repo` / `push` / `commit` and then drops
 * them on the floor. That failure is severe: a `commit: false` dry run would perform a real
 * sync and a `repo` argument would silently mirror the default repo. These tests drive the
 * real REST handler (`POST /issues/sync`) and the real MCP handler (`sync_issues`) and assert
 * that the sync service receives the three fields exactly as sent, that a malformed `repo` is
 * rejected through each surface, and that a repo outside the allowlist is rejected through each
 * surface before any GitHub access.
 */

import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockSync, realSync, mockListIssues, mockListIssueComments, mockCreateIssue } = vi.hoisted(
  () => ({
    mockSync: vi.fn(),
    realSync: { fn: undefined as undefined | ((...args: unknown[]) => Promise<unknown>) },
    mockListIssues: vi.fn(),
    mockListIssueComments: vi.fn(),
    mockCreateIssue: vi.fn(),
  })
);

vi.mock("../../src/services/issues/sync_issues_from_github.js", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../src/services/issues/sync_issues_from_github.js")
  >();
  realSync.fn = actual.syncIssuesFromGitHub as unknown as (...args: unknown[]) => Promise<unknown>;
  return { ...actual, syncIssuesFromGitHub: (...args: unknown[]) => mockSync(...args) };
});

vi.mock("../../src/services/issues/github_client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/issues/github_client.js")>();
  return {
    ...actual,
    listIssues: (...args: unknown[]) => mockListIssues(...args),
    listIssueComments: (...args: unknown[]) => mockListIssueComments(...args),
    createIssue: (...args: unknown[]) => mockCreateIssue(...args),
  };
});

import { app } from "../../src/actions.js";
import { NeotomaServer } from "../../src/server.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";

const ENV_KEYS = ["HOME", "USERPROFILE", "NEOTOMA_ISSUES_REPO", "NEOTOMA_ISSUES_ALLOWED_REPOS"];
const savedEnv: Record<string, string | undefined> = {};
let tempHome: string;

const RESULT = {
  repo: "acme/widgets",
  dry_run: true,
  push_enabled: true,
  issues_synced: 0,
  messages_synced: 0,
  errors: [],
  issues_pushed: 0,
  push_errors: [],
};

describe("sync_issues handler pass-through (#2536)", () => {
  let httpServer: ReturnType<typeof app.listen>;
  let baseUrl: string;
  let mcp: NeotomaServer;

  beforeAll(async () => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    tempHome = mkdtempSync(path.join(os.tmpdir(), "sync-issues-handlers-"));
    process.env.HOME = tempHome;
    process.env.USERPROFILE = tempHome;
    process.env.NEOTOMA_ISSUES_REPO = "test/repo";
    delete process.env.NEOTOMA_ISSUES_ALLOWED_REPOS;

    httpServer = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => httpServer.once("listening", () => resolve()));
    baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;

    mcp = new NeotomaServer();
    (mcp as unknown as Record<string, unknown>).authenticatedUserId = LOCAL_DEV_USER_ID;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    rmSync(tempHome, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockSync.mockResolvedValue(RESULT);
  });

  function expectNoGitHubAccess(): void {
    expect(mockListIssues).not.toHaveBeenCalled();
    expect(mockListIssueComments).not.toHaveBeenCalled();
    expect(mockCreateIssue).not.toHaveBeenCalled();
  }

  async function postSync(body: Record<string, unknown>): Promise<Response> {
    return fetch(`${baseUrl}/issues/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function callMcp(args: Record<string, unknown>): Promise<unknown> {
    const res = await mcp.executeToolForCli("sync_issues", args, LOCAL_DEV_USER_ID);
    return JSON.parse(res.content[0]!.text);
  }

  describe("REST POST /issues/sync", () => {
    it("hands repo, push and commit to the sync service exactly as sent", async () => {
      const res = await postSync({
        repo: "acme/widgets",
        push: true,
        commit: false,
        state: "open",
        labels: ["bug"],
        since: "2026-05-01T00:00:00Z",
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ repo: "acme/widgets", dry_run: true });
      expect(mockSync).toHaveBeenCalledTimes(1);
      expect(mockSync.mock.calls[0]?.[1]).toEqual({
        repo: "acme/widgets",
        push: true,
        commit: false,
        state: "open",
        labels: ["bug"],
        since: "2026-05-01T00:00:00Z",
      });
    });

    it("passes push:false through rather than dropping it, and leaves omitted fields undefined", async () => {
      await postSync({ push: false });
      const params = mockSync.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(params.push).toBe(false);
      expect(params.repo).toBeUndefined();
      expect(params.commit).toBeUndefined();
    });

    it.each(["notaslug", "a/b/c", "owner/..", "owner/na?me", "-owner/name", ""])(
      "rejects malformed repo %j with a 400 and never reaches the sync service",
      async (bad) => {
        const res = await postSync({ repo: bad });
        expect(res.status).toBe(400);
        const body = (await res.json()) as Record<string, unknown>;
        expect(JSON.stringify(body)).toContain("owner/name");
        expect(mockSync).not.toHaveBeenCalled();
        expectNoGitHubAccess();
      }
    );

    it("rejects a repo outside the allowlist with a 403 before any GitHub access", async () => {
      mockSync.mockImplementation((...args: unknown[]) => realSync.fn!(...args));

      const res = await postSync({ repo: "other/private-thing", commit: false });

      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toContain("ERR_ISSUE_REPO_NOT_ALLOWED");
      expect(text).toContain("not permitted");
      expect(text).not.toContain("other/private-thing");
      expectNoGitHubAccess();
    });
  });

  describe("MCP sync_issues", () => {
    it("hands repo, push and commit to the sync service exactly as sent", async () => {
      const out = await callMcp({
        repo: "acme/widgets",
        push: true,
        commit: false,
        state: "open",
        labels: ["bug"],
        since: "2026-05-01T00:00:00Z",
      });

      expect(out).toMatchObject({ repo: "acme/widgets", dry_run: true });
      expect(mockSync).toHaveBeenCalledTimes(1);
      expect(mockSync.mock.calls[0]?.[1]).toEqual({
        repo: "acme/widgets",
        push: true,
        commit: false,
        state: "open",
        labels: ["bug"],
        since: "2026-05-01T00:00:00Z",
      });
    });

    it("passes push:false through rather than dropping it, and leaves omitted fields undefined", async () => {
      await callMcp({ push: false });
      const params = mockSync.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(params.push).toBe(false);
      expect(params.repo).toBeUndefined();
      expect(params.commit).toBeUndefined();
    });

    it.each(["notaslug", "a/b/c", "owner/..", "owner/na?me", "-owner/name", ""])(
      "rejects malformed repo %j and never reaches the sync service",
      async (bad) => {
        await expect(callMcp({ repo: bad })).rejects.toThrow(/owner\/name/);
        expect(mockSync).not.toHaveBeenCalled();
        expectNoGitHubAccess();
      }
    );

    it("rejects a repo outside the allowlist as InvalidParams before any GitHub access", async () => {
      mockSync.mockImplementation((...args: unknown[]) => realSync.fn!(...args));

      const err = (await callMcp({ repo: "other/private-thing", commit: false }).catch(
        (e: unknown) => e
      )) as { code?: number; message?: string };

      expect(err.code).toBe(-32602); // ErrorCode.InvalidParams
      expect(err.message).toContain("not permitted");
      expect(err.message).not.toContain("other/private-thing");
      expectNoGitHubAccess();
    });
  });
});
