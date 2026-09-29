/**
 * Shared helper for filtering deprecated package skills out of any
 * "what's installable/advertised" view of `skills/`.
 *
 * A skill is deprecated when its `SKILL.md` frontmatter declares
 * `deprecated: true`. Deprecated skills stay on disk (compatibility for
 * existing symlinks, SkillHub listings, and GitHub blob links) but must never
 * appear in a fresh install or in `available_skills`.
 *
 * Used by both `src/cli/skills_mirror.ts` (harness install/mirror) and
 * `src/server.ts` (MCP `available_skills`), which otherwise have no shared
 * import path (cli/ depends on core, not the reverse).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * True when `skillDir/SKILL.md` declares `deprecated: true` in its YAML
 * frontmatter. Deliberately tolerant: a missing, unreadable, or malformed
 * file is treated as not-deprecated rather than raised, since this is an
 * advisory filter, not a validation step.
 */
export function isDeprecatedSkillDir(skillDir: string): boolean {
  try {
    const raw = readFileSync(join(skillDir, "SKILL.md"), "utf-8");
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return false;
    return /^deprecated:\s*true\s*$/m.test(match[1]);
  } catch {
    return false;
  }
}

/**
 * Filter skill directory names down to the installable/advertisable set:
 * every name except those whose `SKILL.md` declares `deprecated: true`.
 */
export function filterInstallableSkillNames(sourceDir: string, names: string[]): string[] {
  return names.filter((name) => !isDeprecatedSkillDir(join(sourceDir, name)));
}
