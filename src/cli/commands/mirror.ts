/**
 * CLI command implementations for `neotoma mirror`.
 *
 * Delegates to `src/services/canonical_mirror.ts` for filesystem writes and
 * `src/services/canonical_markdown.ts` for rendering. This module only handles
 * command parsing, user interaction, and formatted output.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ALL_MIRROR_KINDS,
  getMirrorConfig,
  getMirrorStatus,
  MirrorConfig,
  MirrorKind,
  rebuildMirror,
  setMirrorConfig,
} from "../../services/canonical_mirror.js";
import { initMirrorRepo } from "../../services/canonical_mirror_git.js";

export interface MirrorRebuildOptions {
  kind?: string;
  entityType?: string;
  entityId?: string;
  clean?: boolean;
}

export interface MirrorEnableOptions {
  path?: string;
  kinds?: string;
  git?: boolean;
  noGit?: boolean;
  gitignore?: boolean;
  noGitignore?: boolean;
}

export interface MirrorGitignoreResult {
  /** Absolute path of the enclosing git repo, or `null` when the mirror path is not inside a repo. */
  repo_root: string | null;
  /** Absolute path of the `.gitignore` file that was (or would be) updated. `null` when no repo was found. */
  gitignore_path: string | null;
  /** Repo-root-relative entry written to `.gitignore` (trailing slash included). `null` when no repo was found. */
  entry: string | null;
  /** True when the helper appended the entry, false when it was already present or when no repo was found. */
  added: boolean;
  /** True when the entry was already present in `.gitignore`. */
  already_present: boolean;
}

function parseKind(raw: string | undefined): MirrorKind | "all" | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "all") return "all";
  if ((ALL_MIRROR_KINDS as readonly string[]).includes(v)) return v as MirrorKind;
  throw new Error(`Invalid --kind: ${raw}. Allowed: all, ${ALL_MIRROR_KINDS.join(", ")}`);
}

function parseKinds(raw: string | undefined): MirrorKind[] | undefined {
  if (!raw) return undefined;
  const parts = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  const invalid = parts.filter((p) => !(ALL_MIRROR_KINDS as readonly string[]).includes(p));
  if (invalid.length > 0) {
    throw new Error(
      `Invalid --kinds values: ${invalid.join(", ")}. Allowed: ${ALL_MIRROR_KINDS.join(", ")}`
    );
  }
  return parts as MirrorKind[];
}

export interface MirrorRebuildResult {
  config: {
    enabled: boolean;
    path: string;
    kinds: MirrorKind[];
    git_enabled: boolean;
  };
  report: Awaited<ReturnType<typeof rebuildMirror>>;
}

export async function runMirrorRebuild(
  options: MirrorRebuildOptions
): Promise<MirrorRebuildResult> {
  const kind = parseKind(options.kind);
  const cfg = getMirrorConfig();
  const report = await rebuildMirror({
    kind,
    entityType: options.entityType,
    entityId: options.entityId,
    clean: Boolean(options.clean),
  });
  return {
    config: {
      enabled: cfg.enabled,
      path: cfg.path,
      kinds: cfg.kinds,
      git_enabled: cfg.git_enabled,
    },
    report,
  };
}

export interface MirrorStatusResult {
  enabled: boolean;
  path: string;
  absolute_path: string;
  kinds: MirrorKind[];
  git_enabled: boolean;
  counts: Record<MirrorKind, number>;
}

export async function runMirrorStatus(): Promise<MirrorStatusResult> {
  const status = await getMirrorStatus();
  return {
    enabled: status.enabled,
    path: status.path,
    absolute_path: path.resolve(status.path),
    kinds: status.kinds,
    git_enabled: status.git_enabled,
    counts: status.counts,
  };
}

export interface MirrorConfigResult {
  enabled: boolean;
  path: string;
  absolute_path: string;
  kinds: MirrorKind[];
  git_enabled: boolean;
  gitignore?: MirrorGitignoreResult | null;
}

export async function runMirrorEnable(options: MirrorEnableOptions): Promise<MirrorConfigResult> {
  const patch: Parameters<typeof setMirrorConfig>[0] = { enabled: true };
  if (typeof options.path === "string" && options.path.length > 0) {
    patch.path = options.path;
  }
  const kinds = parseKinds(options.kinds);
  if (kinds) patch.kinds = kinds;
  if (options.git === true) patch.git_enabled = true;
  if (options.noGit === true) patch.git_enabled = false;
  const cfg = setMirrorConfig(patch);

  // Phase 3: opt-in git. Initialize the repo idempotently so the user can
  // enable git once and let subsequent rebuilds create the initial commit.
  if (cfg.git_enabled) {
    try {
      await initMirrorRepo(cfg);
    } catch {
      // Git is optional; enabling mirror must succeed even if git init fails.
    }
  }

  let gitignore: MirrorGitignoreResult | null | undefined = undefined;
  if (options.gitignore === true) {
    gitignore = ensureMirrorGitignored(cfg);
  } else if (options.noGitignore === true) {
    gitignore = null;
  }

  return {
    enabled: cfg.enabled,
    path: cfg.path,
    absolute_path: path.resolve(cfg.path),
    kinds: cfg.kinds,
    git_enabled: cfg.git_enabled,
    ...(gitignore !== undefined ? { gitignore } : {}),
  };
}

export async function runMirrorDisable(): Promise<MirrorConfigResult> {
  const cfg = setMirrorConfig({ enabled: false });
  return {
    enabled: cfg.enabled,
    path: cfg.path,
    absolute_path: path.resolve(cfg.path),
    kinds: cfg.kinds,
    git_enabled: cfg.git_enabled,
  };
}

export function formatMirrorStatus(status: MirrorStatusResult): string {
  const lines: string[] = [];
  lines.push(`Mirror:     ${status.enabled ? "enabled" : "disabled"}`);
  lines.push(`Path:       ${status.absolute_path}`);
  lines.push(`Kinds:      ${status.kinds.join(", ")}`);
  lines.push(`Git:        ${status.git_enabled ? "enabled" : "disabled"}`);
  lines.push("");
  lines.push("Counts:");
  for (const kind of ALL_MIRROR_KINDS) {
    const included = status.kinds.includes(kind) ? "" : " (disabled)";
    lines.push(`  ${kind.padEnd(14)} ${status.counts[kind]}${included}`);
  }
  return lines.join("\n");
}

export function formatRebuildReport(result: MirrorRebuildResult): string {
  const lines: string[] = [];
  if (!result.config.enabled) {
    lines.push("Mirror is disabled. Run `neotoma mirror enable` first, or pass explicit options.");
    lines.push("");
  }
  lines.push(`Path:   ${path.resolve(result.config.path)}`);
  lines.push(`Kinds:  ${result.report.kinds.join(", ") || "(none)"}`);
  lines.push("");
  lines.push("Kind            Written  Unchanged  Removed");
  for (const kind of ALL_MIRROR_KINDS) {
    const c = result.report.counts[kind];
    if (!c) continue;
    if (c.written === 0 && c.unchanged === 0 && c.removed === 0) continue;
    lines.push(
      `  ${kind.padEnd(12)}  ${String(c.written).padStart(7)}  ${String(c.unchanged).padStart(9)}  ${String(c.removed).padStart(7)}`
    );
  }
  return lines.join("\n");
}

export function formatMirrorConfig(cfg: MirrorConfigResult): string {
  const lines: string[] = [];
  lines.push(`Mirror:   ${cfg.enabled ? "enabled" : "disabled"}`);
  lines.push(`Path:     ${cfg.absolute_path}`);
  lines.push(`Kinds:    ${cfg.kinds.join(", ")}`);
  lines.push(`Git:      ${cfg.git_enabled ? "enabled" : "disabled"}`);
  if (cfg.gitignore !== undefined) {
    lines.push("");
    lines.push(formatMirrorGitignore(cfg.gitignore));
  }
  return lines.join("\n");
}

// ============================================================================
// Gitignore helper
//
// The mirror lives on disk at `cfg.path` (derived from `NEOTOMA_DATA_DIR` by
// default). When that path sits inside a git repository, generated markdown
// files show up in `git status` and can noise up commits. The helper walks up
// from the resolved mirror path to find the enclosing repo, then appends a
// repo-root-relative ignore entry to `<repoRoot>/.gitignore` idempotently.
//
// The helper is deliberately minimal: it never prompts for a path and never
// writes to a repo it did not detect by walking up from the mirror path.
// ============================================================================

/**
 * Walk up from `startDir` looking for a `.git` directory (or file, for
 * worktrees). Returns the path of the containing repo root, or `null` when
 * no enclosing repo is found before reaching the filesystem root or the user's
 * HOME directory. The HOME boundary prevents an accidental match on a
 * dotfiles repo that encompasses the entire home directory.
 */
export function findEnclosingGitRepo(startDir: string): string | null {
  const home = os.homedir();
  let current = path.resolve(startDir);
  const seen = new Set<string>();
  while (!seen.has(current)) {
    seen.add(current);
    const gitPath = path.join(current, ".git");
    if (existsSync(gitPath)) return current;
    // Stop at HOME to avoid matching a dotfiles repo that spans $HOME.
    if (home && current === home) return null;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}

const MIRROR_GITIGNORE_COMMENT = "# Neotoma markdown mirror";

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

function buildMirrorIgnoreEntry(repoRoot: string, mirrorPath: string): string {
  const rel = path.relative(repoRoot, mirrorPath);
  // Normalize to POSIX separators and append a trailing slash so .gitignore
  // only ignores the directory, not a same-named file.
  const posixRel = toPosix(rel);
  return posixRel.endsWith("/") ? posixRel : `${posixRel}/`;
}

function gitignoreContainsEntry(text: string, entry: string): boolean {
  const normalized = entry.replace(/\/+$/, "");
  const variants = new Set([entry, `${entry}/`, normalized, `/${normalized}`, `/${normalized}/`]);
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (variants.has(line)) return true;
  }
  return false;
}

/**
 * Idempotently append the resolved mirror path to the enclosing repo's
 * `.gitignore`. Returns a structured result describing what was done.
 */
export function ensureMirrorGitignored(
  cfg: MirrorConfig = getMirrorConfig()
): MirrorGitignoreResult {
  const mirrorPath = path.resolve(cfg.path);
  const repoRoot = findEnclosingGitRepo(mirrorPath);
  if (!repoRoot) {
    return {
      repo_root: null,
      gitignore_path: null,
      entry: null,
      added: false,
      already_present: false,
    };
  }
  const gitignorePath = path.join(repoRoot, ".gitignore");
  const entry = buildMirrorIgnoreEntry(repoRoot, mirrorPath);
  let existing = "";
  try {
    existing = readFileSync(gitignorePath, "utf8");
  } catch {
    existing = "";
  }
  if (gitignoreContainsEntry(existing, entry)) {
    return {
      repo_root: repoRoot,
      gitignore_path: gitignorePath,
      entry,
      added: false,
      already_present: true,
    };
  }
  // Ensure a trailing newline before appending so a prior line without a
  // terminator does not merge with our comment.
  const needsLeadingNewline = existing.length > 0 && !existing.endsWith("\n");
  const block =
    (needsLeadingNewline ? "\n" : "") +
    (existing.length > 0 ? "\n" : "") +
    `${MIRROR_GITIGNORE_COMMENT}\n${entry}\n`;
  writeFileSync(gitignorePath, existing + block, "utf8");
  return {
    repo_root: repoRoot,
    gitignore_path: gitignorePath,
    entry,
    added: true,
    already_present: false,
  };
}

/**
 * Detect whether the mirror path is already ignored by the enclosing git
 * repo. Read-only; does not mutate `.gitignore`. Used by `neotoma doctor`.
 */
export function checkMirrorGitignoreStatus(cfg: MirrorConfig = getMirrorConfig()): {
  inside_git_repo: boolean;
  git_repo_root: string | null;
  gitignored: boolean;
} {
  const mirrorPath = path.resolve(cfg.path);
  const repoRoot = findEnclosingGitRepo(mirrorPath);
  if (!repoRoot) {
    return { inside_git_repo: false, git_repo_root: null, gitignored: false };
  }
  const gitignorePath = path.join(repoRoot, ".gitignore");
  let existing = "";
  try {
    existing = readFileSync(gitignorePath, "utf8");
  } catch {
    existing = "";
  }
  const entry = buildMirrorIgnoreEntry(repoRoot, mirrorPath);
  return {
    inside_git_repo: true,
    git_repo_root: repoRoot,
    gitignored: gitignoreContainsEntry(existing, entry),
  };
}

export async function runMirrorGitignore(): Promise<MirrorGitignoreResult> {
  return ensureMirrorGitignored();
}

export function formatMirrorGitignore(result: MirrorGitignoreResult | null): string {
  if (result === null) {
    return "Gitignore: skipped";
  }
  if (!result.repo_root) {
    return "Gitignore: mirror path is not inside a git repo; nothing to ignore.";
  }
  const lines: string[] = [];
  lines.push(`Gitignore repo: ${result.repo_root}`);
  lines.push(`Gitignore file: ${result.gitignore_path}`);
  lines.push(`Entry:          ${result.entry}`);
  if (result.added) {
    lines.push("Status:         added");
  } else if (result.already_present) {
    lines.push("Status:         already present");
  } else {
    lines.push("Status:         unchanged");
  }
  return lines.join("\n");
}
