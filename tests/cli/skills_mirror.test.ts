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
  listInstallableSkillNames,
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
  // The fixture reuses the real retired names, but seeds them WITHOUT
  // `deprecated: true`: here they are ordinary active skills. Only the tests
  // that exercise retirement mark them deprecated, so this fixture does not
  // mirror the shipped frontmatter under `skills/`.
  makeSource(["end", "status", "query-memory", "store-data", "remember-codebase"]);
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
    // lstat, not existsSync: a dangling link left behind must still count as present.
    expect(
      fs.lstatSync(path.join(root, ".codex", "skills", "new-skill"), { throwIfNoEntry: false })
    ).toBeUndefined(); // pruned
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
    expect(report.has_errors).toBe(false);
  });

  it("reports has_errors=false on a clean run", () => {
    fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
    const report = mirrorSkillsToAllHarnesses({ cwd: root, scope: "project", sourceDir });
    expect(report.has_errors).toBe(false);
    for (const r of report.results) expect(r.errors).toBeUndefined();
  });

  it("invokes onLog when converting per-skill links to a whole-dir symlink", () => {
    // First sync into a foreign dir produces per-skill links...
    const skillsDir = path.join(root, ".claude", "skills", "vendor");
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, "SKILL.md"), "foreign");
    mirrorSkillsToAllHarnesses({ cwd: root, scope: "project", sourceDir });
    // ...then remove the foreign entry so the next sync can convert to whole-dir.
    fs.rmSync(path.join(root, ".claude", "skills", "vendor"), { recursive: true });
    const logs: string[] = [];
    mirrorSkillsToAllHarnesses({
      cwd: root,
      scope: "project",
      sourceDir,
      onLog: (m) => logs.push(m),
    });
    expect(logs.some((l) => /Converted .* whole-dir symlink/.test(l))).toBe(true);
    expect(fs.lstatSync(path.join(root, ".claude", "skills")).isSymbolicLink()).toBe(true);
  });
});

describe("deprecated skills", () => {
  function writeDeprecatedSkill(name: string): void {
    fs.mkdirSync(path.join(sourceDir, name), { recursive: true });
    fs.writeFileSync(
      path.join(sourceDir, name, "SKILL.md"),
      `---\nname: ${name}\ndeprecated: true\n---\n`
    );
  }

  it("listInstallableSkillNames excludes deprecated skills but listSkillNames keeps them", () => {
    writeDeprecatedSkill("retired-skill");
    expect(listInstallableSkillNames(sourceDir)).not.toContain("retired-skill");
    expect(listInstallableSkillNames(sourceDir)).toEqual(
      expect.arrayContaining(["end", "status", "query-memory"])
    );
  });

  it("forces per-skill mode (never a whole-dir symlink) when the source has a deprecated skill", () => {
    writeDeprecatedSkill("retired-skill");
    fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
    const r = mirrorToHarness("claude-code", { cwd: root, scope: "project", sourceDir });
    expect(r.mode).toBe("per-skill-symlink");
    const skillsDir = path.join(root, ".claude", "skills");
    expect(fs.lstatSync(skillsDir).isSymbolicLink()).toBe(false);
    // Deprecated skill is not linked into a fresh install...
    expect(fs.existsSync(path.join(skillsDir, "retired-skill"))).toBe(false);
    // ...but active skills still are.
    expect(fs.lstatSync(path.join(skillsDir, "end")).isSymbolicLink()).toBe(true);
  });

  it("prunes a per-skill link to a skill that became deprecated, keeping active and foreign entries", () => {
    // First sync happens before the skill is marked deprecated, and must land
    // in per-skill mode (not whole-dir) so this test actually exercises
    // mirrorPerSkill's prune logic rather than an untouched whole-dir
    // symlink. Foreign content in the target forces that mode, exactly like
    // "falls back to per-skill symlinks and preserves foreign content" above.
    const codexSkills = path.join(root, ".codex", "skills", "vendor-skill");
    fs.mkdirSync(codexSkills, { recursive: true });
    fs.writeFileSync(path.join(codexSkills, "SKILL.md"), "foreign");
    makeSource(["to-be-retired"]);
    const first = mirrorToHarness("codex", { cwd: root, scope: "project", sourceDir });
    expect(first.mode).toBe("per-skill-symlink");
    const linkPath = path.join(root, ".codex", "skills", "to-be-retired");
    expect(fs.existsSync(path.join(linkPath, "SKILL.md"))).toBe(true);

    // Now mark it deprecated and re-sync: retirement means the same thing in
    // per-skill mode as in whole-dir mode, so the existing link is removed.
    fs.writeFileSync(
      path.join(sourceDir, "to-be-retired", "SKILL.md"),
      "---\nname: to-be-retired\ndeprecated: true\n---\n"
    );
    const second = mirrorToHarness("codex", { cwd: root, scope: "project", sourceDir });
    expect(second.mode).toBe("per-skill-symlink");
    expect(second.changed).toBe(true);
    expect(fs.existsSync(linkPath)).toBe(false);
    expect(() => fs.lstatSync(linkPath)).toThrow();
    // The source file itself stays on disk for external links.
    expect(fs.existsSync(path.join(sourceDir, "to-be-retired", "SKILL.md"))).toBe(true);
    // Active skills and foreign content are untouched.
    expect(fs.existsSync(path.join(root, ".codex", "skills", "end", "SKILL.md"))).toBe(true);
    expect(fs.readFileSync(path.join(codexSkills, "SKILL.md"), "utf-8")).toBe("foreign");
  });

  it("removes both retired wrappers from a pre-existing whole-dir install while preserving workflows", () => {
    // First sync happens before any skill is deprecated, into an empty target:
    // this is the whole-dir-symlink mode every real install made before this
    // change shipped. Confirm that precondition explicitly.
    fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
    const first = mirrorToHarness("claude-code", { cwd: root, scope: "project", sourceDir });
    expect(first.mode).toBe("whole-dir-symlink");
    const skillsDir = path.join(root, ".claude", "skills");
    expect(fs.lstatSync(skillsDir).isSymbolicLink()).toBe(true);
    // The whole-dir symlink resolves every skill, including both wrappers
    // about to be retired — proves they are loadable before the upgrade.
    expect(fs.existsSync(path.join(skillsDir, "query-memory", "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(skillsDir, "store-data", "SKILL.md"))).toBe(true);

    // Both primitive wrappers become deprecated (mirrors this PR's own
    // change) and the harness re-syncs (`neotoma doctor` / `neotoma skills
    // sync` / the LaunchAgent watcher) against the same, still-live whole-dir
    // symlink.
    writeDeprecatedSkill("query-memory");
    writeDeprecatedSkill("store-data");
    const second = mirrorToHarness("claude-code", { cwd: root, scope: "project", sourceDir });

    expect(second.mode).toBe("per-skill-symlink");
    expect(second.changed).toBe(true);
    // The whole-dir symlink must actually be replaced by a real directory —
    // not just reported as converted while the old symlink survives.
    expect(fs.lstatSync(skillsDir).isSymbolicLink()).toBe(false);
    // Neither retired wrapper may remain loadable through the harness target.
    expect(fs.existsSync(path.join(skillsDir, "query-memory"))).toBe(false);
    expect(fs.existsSync(path.join(skillsDir, "store-data"))).toBe(false);
    // Workflow-specific and recovery/setup skills remain linked and loadable.
    for (const activeSkill of ["end", "remember-codebase"]) {
      expect(fs.lstatSync(path.join(skillsDir, activeSkill)).isSymbolicLink()).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, activeSkill, "SKILL.md"))).toBe(true);
    }
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
