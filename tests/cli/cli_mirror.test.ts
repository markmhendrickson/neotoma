/**
 * Behavioral tests for `neotoma mirror` CLI helpers.
 *
 * These tests exercise the pure functional surface of the CLI command
 * module (option parsing, result shapes, formatter output). They do not
 * exec the bundled CLI because the mirror command lands before a release
 * and the underlying service functions are covered by
 * `src/services/canonical_mirror.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

import {
  checkMirrorGitignoreStatus,
  ensureMirrorGitignored,
  findEnclosingGitRepo,
  formatMirrorConfig,
  formatMirrorStatus,
  formatRebuildReport,
  runMirrorDisable,
  runMirrorEnable,
  runMirrorStatus,
} from "../../src/cli/commands/mirror.ts";
import type { MirrorConfig } from "../../src/services/canonical_mirror.ts";

describe("neotoma mirror CLI helpers", () => {
  let tmpRoot: string;
  let tmpHome: string;
  let originalEnabled: string | undefined;
  let originalPath: string | undefined;
  let originalKinds: string | undefined;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(() => {
    tmpRoot = mkdtempSync(path.join(tmpdir(), "neotoma-cli-mirror-"));
    tmpHome = mkdtempSync(path.join(tmpdir(), "neotoma-cli-mirror-home-"));
    originalEnabled = process.env.NEOTOMA_MIRROR_ENABLED;
    originalPath = process.env.NEOTOMA_MIRROR_PATH;
    originalKinds = process.env.NEOTOMA_MIRROR_KINDS;
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
    // Redirect HOME so setMirrorConfig cannot mutate the real user config.
    process.env.HOME = tmpHome;
    process.env.USERPROFILE = tmpHome;
    // The CLI enable/disable helpers call setMirrorConfig which writes to
    // ~/.config/neotoma/config.json. We use env vars so the effective cfg
    // is predictable and isolated from user config.
    process.env.NEOTOMA_MIRROR_ENABLED = "true";
    process.env.NEOTOMA_MIRROR_PATH = tmpRoot;
  });

  afterEach(() => {
    if (originalEnabled === undefined) delete process.env.NEOTOMA_MIRROR_ENABLED;
    else process.env.NEOTOMA_MIRROR_ENABLED = originalEnabled;
    if (originalPath === undefined) delete process.env.NEOTOMA_MIRROR_PATH;
    else process.env.NEOTOMA_MIRROR_PATH = originalPath;
    if (originalKinds === undefined) delete process.env.NEOTOMA_MIRROR_KINDS;
    else process.env.NEOTOMA_MIRROR_KINDS = originalKinds;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
    try {
      rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    try {
      rmSync(tmpHome, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("runMirrorStatus returns shape with counts and absolute path", async () => {
    const status = await runMirrorStatus();
    expect(status.path).toBe(tmpRoot);
    expect(status.absolute_path).toBe(path.resolve(tmpRoot));
    expect(status.kinds.length).toBeGreaterThan(0);
    expect(Object.keys(status.counts)).toEqual(
      expect.arrayContaining(["entities", "relationships", "sources", "timeline", "schemas"])
    );
  });

  it("runMirrorEnable parses --kinds and toggles git without throwing", async () => {
    const cfg = await runMirrorEnable({
      path: tmpRoot,
      kinds: "entities,schemas",
      noGit: true,
    });
    expect(cfg.enabled).toBe(true);
    expect(cfg.kinds).toEqual(["entities", "schemas"]);
    expect(cfg.git_enabled).toBe(false);
    expect(cfg.absolute_path).toBe(path.resolve(tmpRoot));
  });

  it("runMirrorEnable rejects invalid --kinds values", async () => {
    await expect(
      runMirrorEnable({ path: tmpRoot, kinds: "entities,bogus" })
    ).rejects.toThrow(/bogus/);
  });

  it("runMirrorDisable returns disabled config", async () => {
    const cfg = await runMirrorDisable();
    expect(cfg.enabled).toBe(false);
  });

  it("formatMirrorStatus produces a human-readable block with counts", () => {
    const formatted = formatMirrorStatus({
      enabled: true,
      path: tmpRoot,
      absolute_path: path.resolve(tmpRoot),
      kinds: ["entities", "schemas"],
      git_enabled: false,
      counts: {
        entities: 3,
        relationships: 0,
        sources: 1,
        timeline: 0,
        schemas: 2,
      },
    });
    expect(formatted).toContain("Mirror:     enabled");
    expect(formatted).toContain("Kinds:      entities, schemas");
    expect(formatted).toContain("entities");
    expect(formatted).toContain("(disabled)");
  });

  it("formatMirrorConfig includes the absolute path and git status", () => {
    const formatted = formatMirrorConfig({
      enabled: false,
      path: tmpRoot,
      absolute_path: path.resolve(tmpRoot),
      kinds: ["entities"],
      git_enabled: true,
    });
    expect(formatted).toContain("Mirror:   disabled");
    expect(formatted).toContain(path.resolve(tmpRoot));
    expect(formatted).toContain("Git:      enabled");
  });

  it("runMirrorEnable with gitignore=true writes .gitignore inside enclosing repo", async () => {
    const repoRoot = mkdtempSync(path.join(tmpdir(), "neotoma-mirror-repo-"));
    try {
      mkdirSync(path.join(repoRoot, ".git"), { recursive: true });
      const mirrorDir = path.join(repoRoot, "data", "mirror");
      mkdirSync(mirrorDir, { recursive: true });
      process.env.NEOTOMA_MIRROR_PATH = mirrorDir;

      const cfg = await runMirrorEnable({
        path: mirrorDir,
        kinds: "entities",
        noGit: true,
        gitignore: true,
      });

      expect(cfg.gitignore).toBeTruthy();
      expect(cfg.gitignore?.added).toBe(true);
      expect(cfg.gitignore?.already_present).toBe(false);
      expect(cfg.gitignore?.repo_root).toBe(repoRoot);
      expect(cfg.gitignore?.entry).toBe("data/mirror/");
      const text = readFileSync(path.join(repoRoot, ".gitignore"), "utf8");
      expect(text).toContain("# Neotoma markdown mirror");
      expect(text).toContain("data/mirror/");
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("runMirrorEnable with noGitignore=true skips writing .gitignore", async () => {
    const repoRoot = mkdtempSync(path.join(tmpdir(), "neotoma-mirror-repo-"));
    try {
      mkdirSync(path.join(repoRoot, ".git"), { recursive: true });
      const mirrorDir = path.join(repoRoot, "data", "mirror");
      mkdirSync(mirrorDir, { recursive: true });
      process.env.NEOTOMA_MIRROR_PATH = mirrorDir;

      const cfg = await runMirrorEnable({
        path: mirrorDir,
        noGit: true,
        noGitignore: true,
      });

      expect(cfg.gitignore).toBeNull();
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("formatRebuildReport reports per-kind counts", () => {
    const out = formatRebuildReport({
      config: {
        enabled: true,
        path: tmpRoot,
        kinds: ["entities"],
        git_enabled: false,
      },
      report: {
        kinds: ["entities"],
        counts: {
          entities: { written: 5, unchanged: 1, removed: 2 },
          relationships: { written: 0, unchanged: 0, removed: 0 },
          sources: { written: 0, unchanged: 0, removed: 0 },
          timeline: { written: 0, unchanged: 0, removed: 0 },
          schemas: { written: 0, unchanged: 0, removed: 0 },
        },
      },
    });
    expect(out).toContain("entities");
    expect(out).toMatch(/5\s+1\s+2/);
  });
});

describe("mirror gitignore helpers", () => {
  let repoRoot: string;
  let mirrorDir: string;
  let cfg: MirrorConfig;

  beforeEach(() => {
    repoRoot = mkdtempSync(path.join(tmpdir(), "neotoma-gi-repo-"));
    mkdirSync(path.join(repoRoot, ".git"), { recursive: true });
    mirrorDir = path.join(repoRoot, "data", "mirror");
    mkdirSync(mirrorDir, { recursive: true });
    cfg = {
      enabled: true,
      path: mirrorDir,
      kinds: ["entities"],
      git_enabled: false,
      memory_export: { enabled: false, path: "MEMORY.md", limit_lines: 200 },
    };
  });

  afterEach(() => {
    try {
      rmSync(repoRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("findEnclosingGitRepo returns the repo root for a nested path", () => {
    expect(findEnclosingGitRepo(mirrorDir)).toBe(repoRoot);
  });

  it("findEnclosingGitRepo returns null when no .git is found up the tree", () => {
    const loose = mkdtempSync(path.join(tmpdir(), "neotoma-gi-loose-"));
    try {
      // Walk up from a deep path that never hits a .git until it stops.
      const deep = path.join(loose, "a", "b", "c");
      mkdirSync(deep, { recursive: true });
      const found = findEnclosingGitRepo(deep);
      // Either null (no enclosing repo) or not `loose` itself. Since loose is
      // under /tmp and /tmp is not a git repo, expect null.
      expect(found).toBeNull();
    } finally {
      rmSync(loose, { recursive: true, force: true });
    }
  });

  it("ensureMirrorGitignored appends once then is idempotent", () => {
    const first = ensureMirrorGitignored(cfg);
    expect(first.added).toBe(true);
    expect(first.already_present).toBe(false);
    expect(first.entry).toBe("data/mirror/");
    expect(first.repo_root).toBe(repoRoot);

    const second = ensureMirrorGitignored(cfg);
    expect(second.added).toBe(false);
    expect(second.already_present).toBe(true);

    const text = readFileSync(path.join(repoRoot, ".gitignore"), "utf8");
    const occurrences = text.split("data/mirror/").length - 1;
    expect(occurrences).toBe(1);
  });

  it("ensureMirrorGitignored treats an existing absolute-style entry as already present", () => {
    writeFileSync(
      path.join(repoRoot, ".gitignore"),
      "# existing\n/data/mirror/\n",
      "utf8"
    );
    const result = ensureMirrorGitignored(cfg);
    expect(result.added).toBe(false);
    expect(result.already_present).toBe(true);
  });

  it("ensureMirrorGitignored returns null-shaped result when mirror is not inside a repo", () => {
    const loose = mkdtempSync(path.join(tmpdir(), "neotoma-gi-loose-"));
    try {
      const looseMirror = path.join(loose, "mirror");
      mkdirSync(looseMirror, { recursive: true });
      const looseCfg: MirrorConfig = { ...cfg, path: looseMirror };
      const result = ensureMirrorGitignored(looseCfg);
      expect(result.repo_root).toBeNull();
      expect(result.added).toBe(false);
      expect(result.entry).toBeNull();
    } finally {
      rmSync(loose, { recursive: true, force: true });
    }
  });

  it("checkMirrorGitignoreStatus reflects gitignored state read-only", () => {
    const before = checkMirrorGitignoreStatus(cfg);
    expect(before.inside_git_repo).toBe(true);
    expect(before.git_repo_root).toBe(repoRoot);
    expect(before.gitignored).toBe(false);

    ensureMirrorGitignored(cfg);
    const after = checkMirrorGitignoreStatus(cfg);
    expect(after.gitignored).toBe(true);
  });
});
