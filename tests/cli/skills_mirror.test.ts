/**
 * Tests for the skills auto-mirror reconciler (`src/cli/skills_mirror.ts`).
 *
 * Exercises the pure functional surface against temporary harness directories
 * using project scope (cwd-rooted), so no real HOME directory is touched.
 * Covers: whole-dir symlink when safe, per-skill fallback preserving foreign
 * content, absent-harness skip, idempotency, auto-population of harnesses
 * installed later, and pruning of removed skills without clobbering foreign
 * entries.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  mirrorToHarness,
  mirrorSkillsToAllHarnesses,
  SKILL_HARNESSES,
} from "../../src/cli/skills_mirror.ts";

let root: string;
let sourceDir: string;

function makeSource(names: string[]): void {
  for (const n of names) {
    fs.mkdirSync(path.join(sourceDir, n), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, n, "SKILL.md"), `---\nname: ${n}\n---\n`);
  }
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "skmirror-"));
  sourceDir = path.join(root, "src-skills");
  makeSource(["end", "status", "query-memory"]);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("mirrorToHarness", () => {
  it("uses a whole-dir symlink when the target is absent", () => {
    fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
    const r = mirrorToHarness("claude-code", { cwd: root, scope: "project", sourceDir });
    expect(r.mode).toBe("whole-dir-symlink");
    expect(r.changed).toBe(true);
    const skillsDir = path.join(root, ".claude", "skills");
    expect(fs.lstatSync(skillsDir).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(path.join(skillsDir, "end", "SKILL.md"))).toBe(true);
  });

  it("targets .cursor/skills (never .cursor/skills-cursor)", () => {
    fs.mkdirSync(path.join(root, ".cursor"), { recursive: true });
    const r = mirrorToHarness("cursor", { cwd: root, scope: "project", sourceDir });
    expect(r.target.endsWith(path.join(".cursor", "skills"))).toBe(true);
    expect(r.target).not.toContain("skills-cursor");
  });

  it("skips a harness whose base directory is absent", () => {
    const r = mirrorToHarness("openclaw", { cwd: root, scope: "project", sourceDir });
    expect(r.skipped).toBe(true);
    expect(r.changed).toBe(false);
    expect(fs.existsSync(path.join(root, ".openclaw"))).toBe(false);
  });

  it("falls back to per-skill symlinks and preserves foreign content", () => {
    const codexSkills = path.join(root, ".codex", "skills", "vendor-skill");
    fs.mkdirSync(codexSkills, { recursive: true });
    fs.writeFileSync(path.join(codexSkills, "SKILL.md"), "foreign");

    const r = mirrorToHarness("codex", { cwd: root, scope: "project", sourceDir });
    expect(r.mode).toBe("per-skill-symlink");
    const skillsDir = path.join(root, ".codex", "skills");
    expect(fs.lstatSync(skillsDir).isSymbolicLink()).toBe(false); // stays a real dir
    expect(fs.existsSync(path.join(skillsDir, "vendor-skill", "SKILL.md"))).toBe(true); // foreign kept
    expect(fs.lstatSync(path.join(skillsDir, "end")).isSymbolicLink()).toBe(true); // ours linked
  });

  it("never recursive-deletes real files: a stray real entry forces per-skill mode", () => {
    // Simulate a target dir that passed the foreign check as empty but gains a
    // real (non-symlink) entry — the whole-dir path must bail, not rm -rf it.
    const skillsDir = path.join(root, ".claude", "skills");
    fs.mkdirSync(skillsDir, { recursive: true });
    const realFile = path.join(skillsDir, "IMPORTANT.txt");
    fs.writeFileSync(realFile, "do not delete me");

    const r = mirrorToHarness("claude-code", { cwd: root, scope: "project", sourceDir });
    // foreign content detected → per-skill mode, real file preserved.
    expect(r.mode).toBe("per-skill-symlink");
    expect(fs.existsSync(realFile)).toBe(true);
    expect(fs.lstatSync(path.join(skillsDir, "end")).isSymbolicLink()).toBe(true);
  });

  it("is idempotent on repeat runs and keeps whole-dir mode (no foreign misread)", () => {
    fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
    const first = mirrorToHarness("claude-code", { cwd: root, scope: "project", sourceDir });
    expect(first.mode).toBe("whole-dir-symlink");
    const again = mirrorToHarness("claude-code", { cwd: root, scope: "project", sourceDir });
    expect(again.changed).toBe(false);
    // Re-running over our own whole-dir symlink must NOT misclassify the linked
    // source skills as foreign and flip to per-skill mode.
    expect(again.mode).toBe("whole-dir-symlink");
    expect(fs.lstatSync(path.join(root, ".claude", "skills")).isSymbolicLink()).toBe(true);
  });
});

describe("mirrorSkillsToAllHarnesses", () => {
  it("mirrors only to installed harnesses and reports per-harness results", () => {
    fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
    fs.mkdirSync(path.join(root, ".cursor"), { recursive: true });
    const report = mirrorSkillsToAllHarnesses({ cwd: root, scope: "project", sourceDir });
    const by = Object.fromEntries(report.results.map((r) => [r.tool, r]));
    expect(by["claude-code"].changed).toBe(true);
    expect(by["cursor"].changed).toBe(true);
    expect(by["codex"].skipped).toBe(true);
    expect(by["openclaw"].skipped).toBe(true);
  });

  it("auto-populates a harness installed after the first sync", () => {
    fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
    mirrorSkillsToAllHarnesses({ cwd: root, scope: "project", sourceDir });
    expect(fs.existsSync(path.join(root, ".cursor", "skills"))).toBe(false);

    fs.mkdirSync(path.join(root, ".cursor"), { recursive: true });
    mirrorSkillsToAllHarnesses({ cwd: root, scope: "project", sourceDir });
    expect(fs.existsSync(path.join(root, ".cursor", "skills", "end", "SKILL.md"))).toBe(true);
  });

  it("propagates new skills and prunes removed ones in per-skill mode", () => {
    const codexSkills = path.join(root, ".codex", "skills", "vendor-skill");
    fs.mkdirSync(codexSkills, { recursive: true });
    fs.writeFileSync(path.join(codexSkills, "SKILL.md"), "foreign");
    mirrorSkillsToAllHarnesses({ cwd: root, scope: "project", sourceDir });

    makeSource(["new-skill"]);
    mirrorSkillsToAllHarnesses({ cwd: root, scope: "project", sourceDir });
    expect(fs.existsSync(path.join(root, ".codex", "skills", "new-skill", "SKILL.md"))).toBe(true);

    fs.rmSync(path.join(sourceDir, "new-skill"), { recursive: true });
    mirrorSkillsToAllHarnesses({ cwd: root, scope: "project", sourceDir });
    expect(fs.existsSync(path.join(root, ".codex", "skills", "new-skill"))).toBe(false); // pruned
    expect(fs.existsSync(path.join(root, ".codex", "skills", "vendor-skill", "SKILL.md"))).toBe(
      true
    ); // foreign kept
  });

  it("reports source_present=false when the source is missing", () => {
    const report = mirrorSkillsToAllHarnesses({
      cwd: root,
      scope: "project",
      sourceDir: path.join(root, "does-not-exist"),
    });
    expect(report.source_present).toBe(false);
    expect(report.results).toHaveLength(0);
  });
});

describe("SKILL_HARNESSES map", () => {
  it("includes every skills-capable harness and excludes MCP-only tools", () => {
    expect(Object.keys(SKILL_HARNESSES).sort()).toEqual(
      ["claude-code", "claude-desktop", "codex", "cursor", "openclaw"].sort()
    );
    expect(SKILL_HARNESSES.cursor?.dir).toBe(".cursor/skills");
  });
});
