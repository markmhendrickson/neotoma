import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import {
  collectHookWorkspaceContext,
  conversationContextFields,
  isLocalRepoBuild,
  resetLocalRepoBuildCache,
  turnContextFields,
} from "../../packages/cursor-hooks/hooks/_common.js";

describe("cursor hook workspace context", () => {
  it("collects bounded conversation and turn context from hook payloads", () => {
    const context = collectHookWorkspaceContext({
      cwd: "/tmp/plain-workspace",
      repository_root: "/tmp/plain-workspace",
      repository_remote: "https://secret-token@github.com/acme/neotoma.git",
      git_branch: "main",
      active_file_refs: ["src/server.ts", "src/server.ts", "README.md"],
    });

    expect(conversationContextFields(context)).toMatchObject({
      client_name: "Cursor",
      harness: "cursor-hook",
      workspace_kind: "git_repository",
      repository_name: "plain-workspace",
      repository_root: "/tmp/plain-workspace",
      repository_remote: "https://<redacted>@github.com/acme/neotoma.git",
      scope_summary: "Cursor session in git repository plain-workspace.",
    });
    expect(turnContextFields(context)).toEqual({
      workingDirectory: "/tmp/plain-workspace",
      gitBranch: "main",
      activeFileRefs: ["src/server.ts", "README.md"],
      contextSource: "cursor-hook",
    });
  });

  it("detects a Neotoma source checkout from nested hook cwd", () => {
    const previousCwd = process.cwd();
    const previousBaseUrl = process.env.NEOTOMA_BASE_URL;
    const previousLocalBuild = process.env.NEOTOMA_LOCAL_BUILD;
    const root = mkdtempSync(join(tmpdir(), "neotoma-hook-source-"));
    const nested = join(root, "packages", "cursor-hooks");

    try {
      mkdirSync(nested, { recursive: true });
      writeFileSync(join(root, "package.json"), JSON.stringify({ name: "neotoma" }));
      process.chdir(nested);
      process.env.NEOTOMA_BASE_URL = "http://127.0.0.1:3080";
      delete process.env.NEOTOMA_LOCAL_BUILD;
      resetLocalRepoBuildCache();

      expect(isLocalRepoBuild()).toBe(true);
    } finally {
      process.chdir(previousCwd);
      if (previousBaseUrl === undefined) delete process.env.NEOTOMA_BASE_URL;
      else process.env.NEOTOMA_BASE_URL = previousBaseUrl;
      if (previousLocalBuild === undefined) delete process.env.NEOTOMA_LOCAL_BUILD;
      else process.env.NEOTOMA_LOCAL_BUILD = previousLocalBuild;
      resetLocalRepoBuildCache();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
