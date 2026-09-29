import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { mirrorToHarness } from "../../src/cli/skills_mirror.ts";
import { SKILL_FIELD_SPECS } from "../../src/services/skills/seed_schema.ts";

/**
 * `existsSync` follows symlinks, so it reports `false` for a dangling link
 * that is still on disk. Pruning assertions must look at the link itself.
 */
function entryPresent(path: string): boolean {
  return lstatSync(path, { throwIfNoEntry: false }) !== undefined;
}

const repoRoot = process.env.NEOTOMA_SKILL_ROOT ?? process.cwd();
const digestPath = join(repoRoot, "skills", "digest", "SKILL.md");
const statusPath = join(repoRoot, "skills", "status", "SKILL.md");

describe("published digest skill identity", () => {
  it("ships under skills/digest and retires the conflicting status path", () => {
    expect(existsSync(digestPath)).toBe(true);
    expect(existsSync(statusPath)).toBe(false);
  });

  it("publishes digest, not status, through the harness mirror", () => {
    const harnessRoot = mkdtempSync(join(tmpdir(), "digest-mirror-"));

    try {
      mkdirSync(join(harnessRoot, ".codex"), { recursive: true });
      const result = mirrorToHarness("codex", {
        cwd: harnessRoot,
        scope: "project",
        sourceDir: join(repoRoot, "skills"),
      });

      expect(result.mode).toBe("whole-dir-symlink");
      expect(existsSync(join(harnessRoot, ".codex", "skills", "digest", "SKILL.md"))).toBe(true);
      expect(existsSync(join(harnessRoot, ".codex", "skills", "status", "SKILL.md"))).toBe(false);
    } finally {
      rmSync(harnessRoot, { recursive: true, force: true });
    }
  });

  it("prunes a package-managed stale status link without deleting foreign skills", () => {
    const harnessRoot = mkdtempSync(join(tmpdir(), "digest-migration-"));

    try {
      const target = join(harnessRoot, ".codex", "skills");
      mkdirSync(join(target, "foreign-skill"), { recursive: true });
      symlinkSync(join(repoRoot, "skills", "status"), join(target, "status"), "junction");
      expect(entryPresent(join(target, "status"))).toBe(true);

      const result = mirrorToHarness("codex", {
        cwd: harnessRoot,
        scope: "project",
        sourceDir: join(repoRoot, "skills"),
      });

      expect(result.mode).toBe("per-skill-symlink");
      expect(entryPresent(join(target, "status"))).toBe(false);
      expect(existsSync(join(target, "digest", "SKILL.md"))).toBe(true);
      expect(entryPresent(join(target, "foreign-skill"))).toBe(true);
    } finally {
      rmSync(harnessRoot, { recursive: true, force: true });
    }
  });

  it("declares side_effect_class on the canonical skill schema", () => {
    const field = SKILL_FIELD_SPECS.find((spec) => spec.name === "side_effect_class");
    expect(field?.type).toBe("string");
    expect(field?.required).not.toBe(true);
    expect(field?.description).toContain("`read_only`");
    expect(field?.description).toContain("`state_changing`");
    expect(field?.description).toMatch(/treated as `state_changing` \(fail closed\)/);
  });

  it("declares the digest name, slug, trigger, and report-only mode", () => {
    const digest = readFileSync(digestPath, "utf8");

    expect(digest).toMatch(/^name: digest$/m);
    expect(digest).toMatch(/^slug: digest$/m);
    expect(digest).toMatch(/^\s+- \/digest$/m);
    expect(digest).toContain("`/digest --report-only`");
    expect(digest).toMatch(/^# digest$/m);
  });

  it("makes report-only strictly write-free, including session bookkeeping", () => {
    const digest = readFileSync(digestPath, "utf8");

    expect(digest).toContain("that mode MUST NOT write or update a `session_digest`");
    expect(digest).toMatch(/^## Session digest \(default mode only\)$/m);
    expect(digest).toContain("no action and no writes of any kind");
    expect(digest).not.toContain(
      "After composing the prose report, store or update exactly ONE `session_digest`"
    );
  });

  it("binds transcript discovery and session identity to the active harness", () => {
    const digest = readFileSync(digestPath, "utf8");

    for (const harness of ["claude-code", "cursor", "codex"]) {
      expect(digest).toMatch(new RegExp(`^\\s+- ${harness.replace("-", "\\-")}$`, "m"));
    }
    expect(digest).toContain("~/.claude/projects/*/<session-id>.jsonl");
    expect(digest).toContain(
      "~/.cursor/projects/*/agent-transcripts/<session-id>/<session-id>.jsonl"
    );
    expect(digest).toContain("${CODEX_HOME:-~/.codex}/sessions/**/rollout-*.jsonl");
    expect(digest).toContain("session_meta.payload.id");
    expect(digest).toContain('`"<harness>:<root-session-id>"`');
    expect(digest).toContain("session-digest-<harness>-<root-session-id>");
    expect(digest).not.toContain('`harness`: `"claude-code"`');
    expect(digest).not.toContain("glob `~/.claude/projects/*/*.jsonl`");
  });

  it("contains the proactive dispatch contract and forbids durable task chips", () => {
    const digest = readFileSync(digestPath, "utf8");

    expect(digest).toContain("MUST act on every agent-movable recommendation");
    expect(digest).toContain("MUST NOT use `mcp__ccd_session__spawn_task`");
    expect(digest).toContain("There is no numbered \"reply with a number or 'all'\" prompt");
  });

  it("leaves no /status command reference in the affected skill mirrors", () => {
    const affected = [
      digestPath,
      join(repoRoot, "skills", "end", "SKILL.md"),
      join(repoRoot, "skills", "where", "SKILL.md"),
    ];

    for (const path of affected) {
      expect(readFileSync(path, "utf8"), path).not.toMatch(/\/status\b/);
    }
  });
});
