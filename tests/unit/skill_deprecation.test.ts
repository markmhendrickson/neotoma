/**
 * Unit tests for `src/shared/skill_deprecation.ts` — the shared filter that
 * excludes retired primitive-wrapper skills (e.g. query-memory, store-data,
 * see #2519-class retirement) from fresh installs and `available_skills`
 * while leaving them resolvable on disk for existing links.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { filterInstallableSkillNames, isDeprecatedSkillDir } from "../../src/shared/skill_deprecation.ts";

let root: string;

function writeSkill(name: string, frontmatter: string): void {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), frontmatter);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-deprecation-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("isDeprecatedSkillDir", () => {
  it("is true when SKILL.md declares deprecated: true", () => {
    writeSkill("retired", "---\nname: retired\ndeprecated: true\n---\n");
    expect(isDeprecatedSkillDir(path.join(root, "retired"))).toBe(true);
  });

  it("is false when SKILL.md has no deprecated field", () => {
    writeSkill("active", "---\nname: active\n---\n");
    expect(isDeprecatedSkillDir(path.join(root, "active"))).toBe(false);
  });

  it("is false when deprecated is false", () => {
    writeSkill("active", "---\nname: active\ndeprecated: false\n---\n");
    expect(isDeprecatedSkillDir(path.join(root, "active"))).toBe(false);
  });

  it("is false when SKILL.md is missing", () => {
    fs.mkdirSync(path.join(root, "empty"), { recursive: true });
    expect(isDeprecatedSkillDir(path.join(root, "empty"))).toBe(false);
  });

  it("is false when frontmatter is malformed (no closing delimiter)", () => {
    writeSkill("broken", "---\nname: broken\ndeprecated: true\n");
    expect(isDeprecatedSkillDir(path.join(root, "broken"))).toBe(false);
  });

  it("does not match 'deprecated: true' outside the frontmatter block", () => {
    writeSkill(
      "sneaky",
      "---\nname: sneaky\n---\n\nThis skill is not deprecated: true is only mentioned in prose.\n"
    );
    expect(isDeprecatedSkillDir(path.join(root, "sneaky"))).toBe(false);
  });
});

describe("filterInstallableSkillNames", () => {
  it("excludes deprecated skills and keeps active ones", () => {
    writeSkill("store-data", "---\nname: store-data\ndeprecated: true\n---\n");
    writeSkill("query-memory", "---\nname: query-memory\ndeprecated: true\n---\n");
    writeSkill("ensure-neotoma", "---\nname: ensure-neotoma\n---\n");

    const result = filterInstallableSkillNames(root, ["store-data", "query-memory", "ensure-neotoma"]);
    expect(result).toEqual(["ensure-neotoma"]);
  });

  it("returns all names unchanged when none are deprecated", () => {
    writeSkill("end", "---\nname: end\n---\n");
    writeSkill("status", "---\nname: status\n---\n");
    expect(filterInstallableSkillNames(root, ["end", "status"])).toEqual(["end", "status"]);
  });
});
