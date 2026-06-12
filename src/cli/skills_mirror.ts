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
 *      target is absent or already our symlink. New, removed, and renamed
 *      skills propagate instantly with zero per-skill drift.
 *   2. Per-skill symlink fallback when the target directory already exists with
 *      foreign content (e.g. a harness wrote its own skills there). We never
 *      clobber non-Neotoma content — each published skill is linked in
 *      individually and foreign entries are left untouched.
 *
 * "New harness gets skills automatically" is keyed on the harness *base*
 * directory (`~/.cursor`, `~/.codex`, …), not the skills subdirectory: if the
 * base exists, we create and populate `skills/` even when it was never set up.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import type { ToolId } from "./doctor.js";

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
  skipped?: boolean;
  reason?: string;
}

export interface SkillsMirrorReport {
  source: string;
  source_present: boolean;
  scope: "user" | "project";
  results: HarnessMirrorResult[];
  changed: boolean;
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

/** List skill subdirectory names in the source, or [] when unreadable. */
function listSkillNames(sourceDir: string): string[] {
  try {
    return readdirSync(sourceDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
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
  sourceDir: string,
  skillNames: string[]
): { changed: boolean; bailToPerSkill?: boolean } {
  if (isSymlinkTo(targetDir, sourceDir)) return { changed: false };

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
    rmSync(targetDir, { recursive: false, force: true });
  }

  mkdirSync(dirname(targetDir), { recursive: true });
  symlinkSync(sourceDir, targetDir, "junction");
  // skillNames intentionally accepted for symmetry with mirrorPerSkill; the
  // whole-dir symlink exposes every source skill without enumerating them.
  void skillNames;
  return { changed: true };
}

/**
 * Mirror each source skill into `targetDir` as an individual symlink, and
 * prune our own stale skill links whose source skill no longer exists. Foreign
 * entries are left untouched.
 */
function mirrorPerSkill(
  targetDir: string,
  sourceDir: string,
  skillNames: string[]
): { changed: boolean; linked: string[] } {
  mkdirSync(targetDir, { recursive: true });
  const names = new Set(skillNames);
  let changed = false;
  const linked: string[] = [];

  // Prune stale links pointing into our source for skills that were removed.
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
    } catch {
      /* non-fatal per-skill failure */
    }
  }

  return { changed, linked };
}

/** Reconcile a single harness target directory against the source. */
export function mirrorToHarness(
  tool: ToolId,
  opts: { cwd?: string; scope?: "user" | "project"; sourceDir?: string } = {}
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

  const skillNames = listSkillNames(sourceDir);
  if (skillNames.length === 0) {
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

  // An existing whole-dir symlink to our source is definitively ours — checking
  // its contents through the link would misread the source skills as foreign.
  const alreadyWholeDir = isSymlinkTo(targetDir, sourceDir);
  const foreign =
    !alreadyWholeDir &&
    existsSync(targetDir) &&
    hasForeignContent(targetDir, sourceDir, new Set(skillNames));

  if (!foreign) {
    const whole = mirrorWholeDir(targetDir, sourceDir, skillNames);
    if (!whole.bailToPerSkill) {
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

  const { changed, linked } = mirrorPerSkill(targetDir, sourceDir, skillNames);
  return {
    tool,
    target: targetDir,
    base_present: true,
    mode: "per-skill-symlink",
    changed,
    linked,
  };
}

/**
 * Mirror skills to every known harness whose base directory is present.
 * This is the entry point used by `neotoma skills sync` and the watcher.
 */
export function mirrorSkillsToAllHarnesses(
  opts: { cwd?: string; scope?: "user" | "project"; sourceDir?: string } = {}
): SkillsMirrorReport {
  const scope = opts.scope ?? "user";
  const sourceDir = opts.sourceDir ?? getPublishedSkillsSource();
  const sourcePresent = existsSync(sourceDir);

  const results: HarnessMirrorResult[] = [];
  if (sourcePresent) {
    for (const tool of Object.keys(SKILL_HARNESSES) as ToolId[]) {
      results.push(mirrorToHarness(tool, { ...opts, scope, sourceDir }));
    }
  }

  return {
    source: sourceDir,
    source_present: sourcePresent,
    scope,
    results,
    changed: results.some((r) => r.changed),
  };
}
