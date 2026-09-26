import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.env.NEOTOMA_SKILL_ROOT ?? process.cwd();
const digestPath = join(repoRoot, "skills", "digest", "SKILL.md");
const statusPath = join(repoRoot, "skills", "status", "SKILL.md");

describe("published digest skill identity", () => {
  it("ships under skills/digest and retires the conflicting status path", () => {
    expect(existsSync(digestPath)).toBe(true);
    expect(existsSync(statusPath)).toBe(false);
  });

  it("declares the digest name, slug, trigger, and report-only mode", () => {
    const digest = readFileSync(digestPath, "utf8");

    expect(digest).toMatch(/^name: digest$/m);
    expect(digest).toMatch(/^slug: digest$/m);
    expect(digest).toMatch(/^\s+- \/digest$/m);
    expect(digest).toContain("`/digest --report-only`");
    expect(digest).toMatch(/^# digest$/m);
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
