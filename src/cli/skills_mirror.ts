/**
 * Skills auto-mirror — keep harness skills directories in sync with the
 * canonical `neotoma/skills/` source.
 *
 * Source of truth: the `skills/` directory shipped with the npm package
 * (real `SKILL.md` files, one subdirectory per skill).
 *
 * This module is the single reconciliation code path shared by:
 *   - `neotoma setup` (one-shot install for a chosen harness), and
 *   - `neotoma skills sync` (continuous mirror across every detected harness,
 *     driven by the `com.neotoma.skills-sync` LaunchAgent on file change).
 *
 * Reconciliation strategy (per harness target directory):
 *   1. Whole-directory symlink (target `skills/` → source `skills/`) when the
 *      target is absent or already our symlink, and the source has no
 *      deprecated skills to withhold. New, removed, and renamed skills
 *      propagate instantly with zero per-skill drift.
 *   2. Per-skill symlink fallback when the target directory already exists with
 *      foreign content (e.g. a harness wrote its own skills there), or when
 *      the source contains one or more deprecated skills (see below). We
 *      never clobber non-Neotoma content — each published skill is linked in
 *      individually and foreign entries are left untouched.
 *
 * "New harness gets skills automatically" is keyed on the harness *base*
 * directory (`~/.cursor`, `~/.codex`, …), not the skills subdirectory: if the
 * base exists, we create and populate `skills/` even when it was never set up.
 *
 * Deprecated skills: a skill whose `SKILL.md` frontmatter declares
 * `deprecated: true` is a retired primitive wrapper kept on disk only for
 * link/URL compatibility (SkillHub listings, GitHub blob links, which point at
 * the repo file). It is excluded from `listSkillNames`'s default (installable)
 * view, and its presence in the source forces per-skill mode so the exclusion
 * is enforceable — a whole-dir symlink cannot omit one subdirectory. Both
 * install modes converge on the same result after a re-sync: a pre-existing
 * whole-dir symlink is converted to per-skill links, and any per-skill link a
 * prior sync created to a now-deprecated skill is pruned. Harness skill
 * directories and `available_skills` therefore never advertise it.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import type { ToolId } from "./doctor.js";
import { filterInstallableSkillNames, isDeprecatedSkillDir } from "../shared/skill_deprecation.js";

/**
 * Harnesses that own a skills directory, mapped to:
 *   - `base`: the harness root directory (relative to home or cwd). Its
 *     existence signals the harness is installed and should receive skills.
 *   - `dir`: the skills directory (relative to home or cwd) we mirror into.
 *
 * MCP-only tools (windsurf, continue, vscode) are intentionally absent: they
 * have no skills directory.
 *
 * Note: Cursor scans several skill roots; `.cursor/skills` is the correct
 * user-skills directory. `.cursor/skills-cursor` is Cursor's separate managed
 * root and must not be targeted.
 */
export const SKILL_HARNESSES: Partial<Record<ToolId, { base: string; dir: string }>> = {
  "claude-code": { base: ".claude", dir: ".claude/skills" },
  "claude-desktop": { base: ".claude", dir: ".claude/skills" },
  cursor: { base: ".cursor", dir: ".cursor/skills" },
  codex: { base: ".codex", dir: ".codex/skills" },
  openclaw: { base: ".openclaw", dir: ".openclaw/skills" },
};

export type MirrorMode = "whole-dir-symlink" | "per-skill-symlink";

export interface HarnessMirrorResult {
  tool: ToolId;
  /** Absolute target skills directory. */
  target: string;
  /** Whether the harness base directory exists (i.e. harness is installed). */
  base_present: boolean;
  /** Reconciliation strategy applied (null when skipped). */
  mode: MirrorMode | null;
  /** Whether the filesystem was modified this run. */
  changed: boolean;
  /** Skills linked in this run (per-skill mode) or "*" for whole-dir. */
  linked: string[];
  /** Per-skill operations that were attempted but failed (e.g. symlink EPERM). */
  errors?: Array<{ skill: string; reason: string }>;
  skipped?: boolean;
  reason?: string;
}

export interface SkillsMirrorReport {
  source: string;
  source_present: boolean;
  scope: "user" | "project";
  results: HarnessMirrorResult[];
  changed: boolean;
  /** True when any harness reported one or more per-skill errors. */
  has_errors: boolean;
}

/**
 * Resolve the canonical `skills/` directory shipped with the package.
 * Works from a global install or a local checkout (src or dist layout).
 */
export function getPublishedSkillsSource(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const packageRoot = resolve(dirname(thisFile), "..", "..");
  return join(packageRoot, "skills");
}

/**
 * List all skill subdirectory names in the source, sorted for deterministic
 * output across filesystems, or [] when unreadable. Includes deprecated
 * skills — callers that install or advertise skills should use
 * `listInstallableSkillNames` instead.
 *
 * Exported so the instance-skills reconciler (#1950) can compute package-name
 * collisions ("package skills win") without re-implementing directory listing.
 */
export function listSkillNames(sourceDir: string): string[] {
  try {
    return readdirSync(sourceDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * List skill subdirectory names that should be installed/advertised: every
 * entry from `listSkillNames` except those whose `SKILL.md` declares
 * `deprecated: true`. This is the set fresh installs and `available_skills`
 * should see; `listSkillNames` remains the full-directory view for callers
 * (collision checks, pruning) that need to know about deprecated entries too.
 */
export function listInstallableSkillNames(sourceDir: string): string[] {
  return filterInstallableSkillNames(sourceDir, listSkillNames(sourceDir));
}

/** True when any skill in `sourceDir` is deprecated. */
function hasDeprecatedSkills(sourceDir: string): boolean {
  return listSkillNames(sourceDir).some((name) => isDeprecatedSkillDir(join(sourceDir, name)));
}

/** True when `p` is a symlink resolving to `expectedTarget`. */
function isSymlinkTo(p: string, expectedTarget: string): boolean {
  try {
    if (!lstatSync(p).isSymbolicLink()) return false;
    return resolve(dirname(p), readlinkSync(p)) === resolve(expectedTarget);
  } catch {
    return false;
  }
}

/** True when `p` is any symlink (regardless of target). */
function isSymlink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Does the target directory hold foreign (non-Neotoma) content that forbids a
 * whole-directory symlink? Foreign = any entry that is not one of our
 * source-derived per-skill symlinks. An empty real directory is NOT foreign.
 */
function hasForeignContent(targetDir: string, sourceDir: string, skillNames: Set<string>): boolean {
  let entries: string[];
  try {
    entries = readdirSync(targetDir);
  } catch {
    return false;
  }
  for (const name of entries) {
    const entry = join(targetDir, name);
    // One of our skills, correctly linked → not foreign.
    if (skillNames.has(name) && isSymlinkTo(entry, join(sourceDir, name))) continue;
    // A stale link to a now-removed source skill → ours to clean, not foreign.
    if (isSymlink(entry)) {
      try {
        const resolved = resolve(targetDir, readlinkSync(entry));
        if (resolved.startsWith(resolve(sourceDir))) continue;
      } catch {
        /* fall through → treat as foreign */
      }
    }
    return true; // anything else is foreign content we must preserve
  }
  return false;
}

/**
 * Mirror the whole source dir as a single symlink at `targetDir`.
 *
 * Only ever called when `hasForeignContent` is false, i.e. the target is
 * absent, a symlink, or a real directory containing exclusively our own skill
 * symlinks. To make a destructive delete of real content impossible even under
 * a logic error, this never recursive-deletes: it unlinks a symlink target, or
 * removes our individual skill symlinks and rmdir's the (now empty) directory —
 * bailing out to per-skill mode if any non-symlink entry is encountered.
 */
function mirrorWholeDir(
  targetDir: string,
  sourceDir: string
): { changed: boolean; converted?: boolean; bailToPerSkill?: boolean } {
  if (isSymlinkTo(targetDir, sourceDir)) return { changed: false };

  let converted = false;
  if (isSymlink(targetDir)) {
    // Wrong-target symlink (whole dir): replace the link itself.
    unlinkSync(targetDir);
  } else if (existsSync(targetDir)) {
    // Real directory of our own skill links — remove each link, then rmdir.
    for (const name of (() => {
      try {
        return readdirSync(targetDir);
      } catch {
        return [];
      }
    })()) {
      const entry = join(targetDir, name);
      if (!isSymlink(entry)) {
        // Unexpected real entry: do not delete it. Fall back to per-skill mode.
        return { changed: false, bailToPerSkill: true };
      }
      unlinkSync(entry);
    }
    // Directory is now empty (only our symlinks were present). rmdir — never a
    // recursive delete — so a real file could never be removed here.
    rmdirSync(targetDir);
    // We replaced an existing per-skill directory with a whole-dir symlink.
    converted = true;
  }

  mkdirSync(dirname(targetDir), { recursive: true });
  symlinkSync(sourceDir, targetDir, "junction");
  return { changed: true, converted };
}

/**
 * Mirror each source skill into `targetDir` as an individual symlink, and
 * prune our own stale skill links whose source skill no longer exists. Foreign
 * entries are left untouched.
 *
 * Exported for reuse by the instance-skills reconciler (#1950): it needs the
 * exact same per-skill-symlink mechanism to link materialized instance-skill
 * directories (`~/.neotoma/instance-skills/<host>/<slug>/`) into harness skill
 * dirs, with package-shipped skills taking precedence on name collision.
 */
export function mirrorPerSkill(
  targetDir: string,
  sourceDir: string,
  skillNames: string[]
): { changed: boolean; linked: string[]; errors: Array<{ skill: string; reason: string }> } {
  mkdirSync(targetDir, { recursive: true });
  const names = new Set(skillNames);
  let changed = false;
  const linked: string[] = [];
  const errors: Array<{ skill: string; reason: string }> = [];

  // Prune our own links pointing into the source for any skill not in the
  // current set: skills removed from the source entirely AND skills that
  // became deprecated (their directory stays in `sourceDir`, but they are
  // absent from `skillNames`). Retirement therefore means the same thing in
  // per-skill mode as in whole-dir mode: after a re-sync the harness no longer
  // resolves the skill, so its stale `description:`/`triggers:` stop being
  // advertised. External references (SkillHub listings, GitHub blob links)
  // point at the repo file, which stays on disk, not at harness links.
  for (const name of (() => {
    try {
      return readdirSync(targetDir);
    } catch {
      return [];
    }
  })()) {
    if (names.has(name)) continue;
    const entry = join(targetDir, name);
    if (!isSymlink(entry)) continue;
    try {
      const resolved = resolve(targetDir, readlinkSync(entry));
      if (resolved.startsWith(resolve(sourceDir))) {
        unlinkSync(entry);
        changed = true;
      }
    } catch {
      /* leave it */
    }
  }

  // Ensure each current skill is linked.
  for (const name of skillNames) {
    const src = join(sourceDir, name);
    const dst = join(targetDir, name);
    if (isSymlinkTo(dst, src)) continue;
    if (existsSync(dst) || isSymlink(dst)) {
      // Replace only our own (wrong/stale) symlink; never overwrite foreign files.
      if (!isSymlink(dst)) continue;
      unlinkSync(dst);
    }
    try {
      symlinkSync(src, dst, "junction");
      changed = true;
      linked.push(name);
    } catch (err) {
      // Non-fatal for the other skills, but surfaced so callers (and the
      // `--json` consumer) can distinguish success from tried-and-failed.
      errors.push({ skill: name, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return { changed, linked, errors };
}

/** Reconcile a single harness target directory against the source. */
export function mirrorToHarness(
  tool: ToolId,
  opts: {
    cwd?: string;
    scope?: "user" | "project";
    sourceDir?: string;
    onLog?: (message: string) => void;
  } = {}
): HarnessMirrorResult {
  const scope = opts.scope ?? "user";
  const cwd = opts.cwd ?? process.cwd();
  const sourceDir = opts.sourceDir ?? getPublishedSkillsSource();
  const entry = SKILL_HARNESSES[tool];

  if (!entry) {
    return {
      tool,
      target: "",
      base_present: false,
      mode: null,
      changed: false,
      linked: [],
      skipped: true,
      reason: "no skills directory for this harness",
    };
  }

  const base = scope === "user" ? homedir() : cwd;
  const basePath = join(base, entry.base);
  const targetDir = join(base, entry.dir);
  const basePresent = existsSync(basePath);

  if (!basePresent) {
    return {
      tool,
      target: targetDir,
      base_present: false,
      mode: null,
      changed: false,
      linked: [],
      skipped: true,
      reason: `harness base ${entry.base} not present`,
    };
  }

  const allSkillNames = listSkillNames(sourceDir);
  if (allSkillNames.length === 0) {
    return {
      tool,
      target: targetDir,
      base_present: true,
      mode: null,
      changed: false,
      linked: [],
      skipped: true,
      reason: "no published skills in source",
    };
  }

  // Deprecated skills must never reach a fresh install: a whole-dir symlink
  // cannot omit one subdirectory, so their presence in the source forces
  // per-skill mode, where `installableSkillNames` leaves them unlinked.
  const sourceHasDeprecated = hasDeprecatedSkills(sourceDir);
  const installableSkillNames = sourceHasDeprecated
    ? listInstallableSkillNames(sourceDir)
    : allSkillNames;

  // An existing whole-dir symlink to our source is definitively ours — checking
  // its contents through the link would misread the source skills as foreign.
  const alreadyWholeDir = isSymlinkTo(targetDir, sourceDir);
  const foreign =
    !alreadyWholeDir &&
    existsSync(targetDir) &&
    hasForeignContent(targetDir, sourceDir, new Set(allSkillNames));

  if (!sourceHasDeprecated && !foreign) {
    const whole = mirrorWholeDir(targetDir, sourceDir);
    if (!whole.bailToPerSkill) {
      if (whole.converted) {
        // Make the per-skill → whole-dir upgrade observable (esp. for the
        // LaunchAgent path, whose only trace is the log file).
        opts.onLog?.(`Converted ${targetDir} from per-skill links to a whole-dir symlink.`);
      }
      return {
        tool,
        target: targetDir,
        base_present: true,
        mode: "whole-dir-symlink",
        changed: whole.changed,
        linked: whole.changed ? ["*"] : [],
      };
    }
    // Unexpected non-symlink entry encountered: preserve it via per-skill mode.
  }

  // A pre-existing whole-dir symlink (from an install made before this source
  // gained a deprecated skill) must be torn down before `mirrorPerSkill` runs:
  // `mkdirSync` on an existing symlink-to-directory is a silent no-op, so
  // without this the symlink would survive untouched and every skill —
  // including the ones we're trying to withhold — would stay resolvable
  // through it. Unlinking just the symlink itself (never its target) is safe;
  // `mirrorPerSkill` immediately recreates a real directory in its place.
  let convertedFromWholeDir = false;
  if (alreadyWholeDir) {
    unlinkSync(targetDir);
    convertedFromWholeDir = true;
    opts.onLog?.(`Converted ${targetDir} from a whole-dir symlink to per-skill links.`);
  }

  const { changed, linked, errors } = mirrorPerSkill(targetDir, sourceDir, installableSkillNames);
  return {
    tool,
    target: targetDir,
    base_present: true,
    mode: "per-skill-symlink",
    changed: convertedFromWholeDir || changed,
    linked,
    ...(errors.length > 0 ? { errors } : {}),
  };
}

/**
 * Mirror skills to every known harness whose base directory is present.
 * This is the entry point used by `neotoma skills sync` and the watcher.
 */
export function mirrorSkillsToAllHarnesses(
  opts: {
    cwd?: string;
    scope?: "user" | "project";
    sourceDir?: string;
    onLog?: (message: string) => void;
  } = {}
): SkillsMirrorReport {
  const scope = opts.scope ?? "user";
  const sourceDir = opts.sourceDir ?? getPublishedSkillsSource();
  const sourcePresent = existsSync(sourceDir);

  const results: HarnessMirrorResult[] = [];
  if (sourcePresent) {
    // Deterministic harness order for stable output across runs.
    for (const tool of (Object.keys(SKILL_HARNESSES) as ToolId[]).sort()) {
      results.push(mirrorToHarness(tool, { ...opts, scope, sourceDir }));
    }
  }

  return {
    source: sourceDir,
    source_present: sourcePresent,
    scope,
    results,
    changed: results.some((r) => r.changed),
    has_errors: results.some((r) => (r.errors?.length ?? 0) > 0),
  };
}
