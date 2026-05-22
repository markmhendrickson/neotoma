/**
 * Unit tests for the optional git-backed mirror (Phase 3).
 *
 * Keeps DB usage to a minimum: we exercise `initMirrorRepo`, the commit
 * message builder (pure function), and a full-rebuild → commit roundtrip
 * against a tmp directory with git enabled via env vars.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { execSync } from "node:child_process";

import {
  buildCommitMessage,
  commitMirrorBatch,
  ensureInitialCommit,
  initMirrorRepo,
} from "./canonical_mirror_git.js";
import type { MirrorConfig } from "./canonical_mirror.js";

function gitAvailable(): boolean {
  try {
    execSync("git --version", { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

describe("canonical_mirror_git", () => {
  let tmpRoot: string;
  let originalEnabled: string | undefined;
  let originalPath: string | undefined;
  let originalGit: string | undefined;
  let originalGitDir: string | undefined;
  let originalGitWorkTree: string | undefined;
  let originalGitIndexFile: string | undefined;

  function mirrorConfig(gitEnabled = true): MirrorConfig {
    return {
      enabled: true,
      path: tmpRoot,
      kinds: ["entities", "relationships", "sources", "timeline"],
      git_enabled: gitEnabled,
      memory_export: {
        enabled: false,
        path: "MEMORY.md",
        limit_lines: 200,
      },
    };
  }

  beforeEach(() => {
    tmpRoot = mkdtempSync(path.join(tmpdir(), "neotoma-mirror-git-test-"));
    originalEnabled = process.env.NEOTOMA_MIRROR_ENABLED;
    originalPath = process.env.NEOTOMA_MIRROR_PATH;
    originalGit = process.env.NEOTOMA_MIRROR_GIT_ENABLED;
    originalGitDir = process.env.GIT_DIR;
    originalGitWorkTree = process.env.GIT_WORK_TREE;
    originalGitIndexFile = process.env.GIT_INDEX_FILE;
    process.env.NEOTOMA_MIRROR_ENABLED = "true";
    process.env.NEOTOMA_MIRROR_PATH = tmpRoot;
    process.env.NEOTOMA_MIRROR_GIT_ENABLED = "true";
    delete process.env.GIT_DIR;
    delete process.env.GIT_WORK_TREE;
    delete process.env.GIT_INDEX_FILE;
  });

  afterEach(() => {
    if (originalEnabled === undefined) delete process.env.NEOTOMA_MIRROR_ENABLED;
    else process.env.NEOTOMA_MIRROR_ENABLED = originalEnabled;
    if (originalPath === undefined) delete process.env.NEOTOMA_MIRROR_PATH;
    else process.env.NEOTOMA_MIRROR_PATH = originalPath;
    if (originalGit === undefined) delete process.env.NEOTOMA_MIRROR_GIT_ENABLED;
    else process.env.NEOTOMA_MIRROR_GIT_ENABLED = originalGit;
    if (originalGitDir === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = originalGitDir;
    if (originalGitWorkTree === undefined) delete process.env.GIT_WORK_TREE;
    else process.env.GIT_WORK_TREE = originalGitWorkTree;
    if (originalGitIndexFile === undefined) delete process.env.GIT_INDEX_FILE;
    else process.env.GIT_INDEX_FILE = originalGitIndexFile;
    try {
      rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  describe("buildCommitMessage", () => {
    it("produces a deterministic, sorted message across reruns", () => {
      const batch = {
        trigger: "store" as const,
        entities: [
          { entity_type: "contact", slug: "sarah-johnson-abc", field_count: 2 },
          { entity_type: "contact", slug: "alex-smith-def", field_count: 1 },
        ],
        relationships: [
          {
            relationship_type: "WORKS_WITH",
            key: "src-1__tgt-2-abcd",
          },
        ],
        observations: [
          {
            observation_id: "obs_002",
            source_id: "src_abc",
            source_priority: 100,
            observed_at: "2026-04-17T10:00:00.000Z",
          },
          {
            observation_id: "obs_001",
            source_id: "src_abc",
            source_priority: 100,
            observed_at: "2026-04-17T09:00:00.000Z",
          },
        ],
      };
      const m1 = buildCommitMessage(batch, 3);
      const m2 = buildCommitMessage(batch, 3);
      expect(m1).toBe(m2);
      // Entities sorted alphabetically by (type, slug).
      expect(m1.indexOf("alex-smith")).toBeLessThan(m1.indexOf("sarah-johnson"));
      // Observations sorted alphabetically by id.
      expect(m1.indexOf("obs_001")).toBeLessThan(m1.indexOf("obs_002"));
      expect(m1).toContain("update: 3 file(s) across entities,relationships via store");
      expect(m1).toContain("trigger: store");
      expect(m1).toContain("author: agent");
    });

    it("reports user authorship when an author name is provided", () => {
      const m = buildCommitMessage(
        {
          trigger: "correct",
          entities: [{ entity_type: "contact", slug: "s-1" }],
          author: { name: "Mark Hendrickson", email: "mark@example.com" },
        },
        1
      );
      expect(m).toContain("author: user");
    });

    it("falls back to 'mirror' when no kinds can be inferred", () => {
      const m = buildCommitMessage({ trigger: "rebuild" }, 0);
      expect(m.split("\n")[0]).toBe("update: 0 file(s) across mirror via rebuild");
    });
  });

  describe("initMirrorRepo", () => {
    it("is a no-op when git is disabled", async () => {
      process.env.NEOTOMA_MIRROR_GIT_ENABLED = "false";
      const res = await initMirrorRepo(mirrorConfig(false));
      expect(res.initialized).toBe(false);
      const gitDir = path.join(tmpRoot, ".git");
      let exists = true;
      try {
        await fsp.stat(gitDir);
      } catch {
        exists = false;
      }
      expect(exists).toBe(false);
    });

    it.skipIf(!gitAvailable())(
      "initializes a git repo in the mirror root and is idempotent",
      async () => {
        const first = await initMirrorRepo(mirrorConfig());
        expect(first.initialized).toBe(true);
        const gitDirStat = await fsp.stat(path.join(tmpRoot, ".git"));
        expect(gitDirStat.isDirectory()).toBe(true);
        const gitignore = await fsp.readFile(path.join(tmpRoot, ".gitignore"), "utf8");
        expect(gitignore).toContain(".DS_Store");

        const second = await initMirrorRepo(mirrorConfig());
        expect(second.initialized).toBe(false);
      }
    );
  });

  describe("commit path end-to-end", () => {
    it.skipIf(!gitAvailable())(
      "creates initial commit via ensureInitialCommit, then batch commit on second write",
      async () => {
        await initMirrorRepo(mirrorConfig());
        // Seed a file so there is something to commit.
        await fsp.writeFile(path.join(tmpRoot, "hello.md"), "hello\n", "utf8");
        const first = await ensureInitialCommit(mirrorConfig());
        expect(first.committed).toBe(true);
        expect(first.commit_hash).toBeTruthy();

        // Second call: no new diff → no commit.
        const second = await ensureInitialCommit(mirrorConfig());
        expect(second.committed).toBe(false);

        // Add another file and use batch commit.
        await fsp.writeFile(path.join(tmpRoot, "world.md"), "world\n", "utf8");
        const batch = await commitMirrorBatch(
          {
            trigger: "store",
            entities: [{ entity_type: "contact", slug: "world-123", field_count: 1 }],
            observations: [{ observation_id: "obs_world" }],
          },
          mirrorConfig()
        );
        expect(batch.committed).toBe(true);
        expect(batch.file_count).toBeGreaterThanOrEqual(1);

        const log = execSync("git log --oneline", {
          cwd: tmpRoot,
          encoding: "utf8",
        })
          .trim()
          .split("\n");
        expect(log.length).toBeGreaterThanOrEqual(2);
      }
    );

    it.skipIf(!gitAvailable())("skips the batch commit when there is no diff", async () => {
      await initMirrorRepo(mirrorConfig());
      await fsp.writeFile(path.join(tmpRoot, "a.md"), "x\n", "utf8");
      await ensureInitialCommit(mirrorConfig());

      const res = await commitMirrorBatch({ trigger: "store" }, mirrorConfig());
      expect(res.committed).toBe(false);
      expect(res.reason).toBe("empty_diff");
    });
  });
});
