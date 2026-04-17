/**
 * Optional git history for the canonical markdown mirror (Phase 3).
 *
 * SQLite remains the sole source of truth; git on top of the mirror provides
 * `git log entity.md`-style observation history derived from deterministic
 * commit metadata. Commits are made once per write transaction (not per file)
 * so a single store/correct call that touches entities + relationships +
 * timeline produces one commit.
 *
 * Determinism requirements:
 *   - Commit messages are built from stable metadata (entity_type/slug,
 *     relationship_type/key, observation_id, source_id, source_priority,
 *     observed_at, trigger, author). No timestamps that would change per run.
 *   - Empty-diff commits are skipped (writeFileIfChanged in canonical_mirror
 *     already prevents spurious rewrites).
 *
 * Concurrency: single-process mirror writes are serialized by the mirror
 * subsystem; this module assumes callers have already synchronized writes
 * before calling `commitMirrorBatch`.
 */
import * as path from "node:path";
import { promises as fs } from "node:fs";

import { getMirrorConfig, MirrorConfig } from "./canonical_mirror.js";

export interface GitCommitEntityChange {
  entity_type: string;
  slug: string;
  field_count?: number;
}

export interface GitCommitRelationshipChange {
  relationship_type: string;
  key: string;
}

export interface GitCommitObservation {
  observation_id: string;
  source_id?: string | null;
  source_priority?: number | null;
  observed_at?: string | null;
}

export type MirrorTrigger =
  | "store"
  | "correct"
  | "interpret"
  | "relationships"
  | "sources"
  | "schemas"
  | "rebuild";

export interface MirrorCommitBatch {
  trigger: MirrorTrigger;
  entities?: GitCommitEntityChange[];
  relationships?: GitCommitRelationshipChange[];
  observations?: GitCommitObservation[];
  kinds?: string[];
  author?: { name?: string; email?: string };
}

export interface GitCommitResult {
  committed: boolean;
  reason?: "git_disabled" | "empty_diff" | "no_repo";
  commit_hash?: string;
  file_count?: number;
}

/**
 * Lazily load simple-git so CLI startup cost stays low when git is disabled.
 * Returned instance is bound to the mirror root.
 */
async function loadSimpleGit(dir: string): Promise<import("simple-git").SimpleGit | null> {
  try {
    const { simpleGit } = await import("simple-git");
    return simpleGit({ baseDir: dir, binary: "git", maxConcurrentProcesses: 1 });
  } catch {
    return null;
  }
}

async function isGitRepo(dir: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path.join(dir, ".git"));
    return stat.isDirectory() || stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Initialize a git repo at the mirror root on enable. Idempotent: skips if
 * `.git` already exists. Does NOT commit here; the first rebuild creates the
 * initial commit.
 */
export async function initMirrorRepo(cfg?: MirrorConfig): Promise<{ initialized: boolean }> {
  const c = cfg ?? getMirrorConfig();
  if (!c.git_enabled) return { initialized: false };
  await fs.mkdir(c.path, { recursive: true });
  if (await isGitRepo(c.path)) return { initialized: false };
  const git = await loadSimpleGit(c.path);
  if (!git) return { initialized: false };
  await git.init();
  const gitignore = path.join(c.path, ".gitignore");
  try {
    await fs.writeFile(gitignore, ".DS_Store\n", "utf8");
  } catch {
    /* ignore */
  }
  return { initialized: true };
}

/**
 * Build the deterministic commit message body per the plan spec:
 *
 *   update: <n> file(s) across <kinds> via <trigger>
 *
 *   entities:
 *     - <entity_type>/<slug> (<n> field(s))
 *   relationships:
 *     - <relationship_type>/<key>
 *   observations:
 *     - <observation_id> source=<source_id> priority=<p> observed_at=<ts>
 *   trigger: <store|correct|interpret|relationships|sources|schemas>
 *   author: <agent|user>
 */
export function buildCommitMessage(
  batch: MirrorCommitBatch,
  fileCount: number
): string {
  const kinds = (batch.kinds && batch.kinds.length > 0
    ? batch.kinds
    : uniqueKindsFromBatch(batch)
  ).slice().sort();

  const lines: string[] = [];
  lines.push(
    `update: ${fileCount} file(s) across ${kinds.join(",") || "mirror"} via ${batch.trigger}`
  );
  lines.push("");

  if (batch.entities && batch.entities.length > 0) {
    lines.push("entities:");
    const sorted = batch.entities
      .slice()
      .sort((a, b) =>
        a.entity_type === b.entity_type
          ? a.slug.localeCompare(b.slug)
          : a.entity_type.localeCompare(b.entity_type)
      );
    for (const e of sorted) {
      const suffix =
        typeof e.field_count === "number" ? ` (${e.field_count} field(s))` : "";
      lines.push(`  - ${e.entity_type}/${e.slug}${suffix}`);
    }
  }

  if (batch.relationships && batch.relationships.length > 0) {
    lines.push("relationships:");
    const sorted = batch.relationships
      .slice()
      .sort((a, b) =>
        a.relationship_type === b.relationship_type
          ? a.key.localeCompare(b.key)
          : a.relationship_type.localeCompare(b.relationship_type)
      );
    for (const r of sorted) {
      lines.push(`  - ${r.relationship_type}/${r.key}`);
    }
  }

  if (batch.observations && batch.observations.length > 0) {
    lines.push("observations:");
    const sorted = batch.observations
      .slice()
      .sort((a, b) => a.observation_id.localeCompare(b.observation_id));
    for (const o of sorted) {
      const parts = [o.observation_id];
      if (o.source_id) parts.push(`source=${o.source_id}`);
      if (typeof o.source_priority === "number") parts.push(`priority=${o.source_priority}`);
      if (o.observed_at) parts.push(`observed_at=${o.observed_at}`);
      lines.push(`  - ${parts.join(" ")}`);
    }
  }

  lines.push(`trigger: ${batch.trigger}`);
  const authorKind = batch.author?.name ? "user" : "agent";
  lines.push(`author: ${authorKind}`);

  return lines.join("\n") + "\n";
}

function uniqueKindsFromBatch(batch: MirrorCommitBatch): string[] {
  const kinds = new Set<string>();
  if (batch.entities && batch.entities.length > 0) kinds.add("entities");
  if (batch.relationships && batch.relationships.length > 0) kinds.add("relationships");
  return [...kinds];
}

/**
 * Stage all pending changes and commit them once with a deterministic message.
 * Empty-diff commits are skipped (content-hash no-op in Phase 2 already
 * prevents spurious file writes, but this is a safety net for index-only
 * rewrites that touched mtime but not content).
 */
export async function commitMirrorBatch(
  batch: MirrorCommitBatch,
  cfg?: MirrorConfig
): Promise<GitCommitResult> {
  const c = cfg ?? getMirrorConfig();
  if (!c.git_enabled) return { committed: false, reason: "git_disabled" };
  if (!(await isGitRepo(c.path))) return { committed: false, reason: "no_repo" };

  const git = await loadSimpleGit(c.path);
  if (!git) return { committed: false, reason: "no_repo" };

  await git.add(["-A"]);
  const status = await git.status();
  const fileCount =
    status.staged.length +
    status.created.length +
    status.modified.length +
    status.deleted.length +
    status.renamed.length;
  if (fileCount === 0) return { committed: false, reason: "empty_diff" };

  const message = buildCommitMessage(batch, fileCount);
  const commitOpts: Record<string, string | null> = {};
  if (batch.author?.name) commitOpts["--author"] =
    `${batch.author.name} <${batch.author.email ?? "neotoma@localhost"}>`;

  const res = await git.commit(message, undefined, commitOpts);
  return {
    committed: true,
    commit_hash: res.commit,
    file_count: fileCount,
  };
}

/**
 * Initial commit after `neotoma mirror rebuild` so subsequent batch commits
 * have a parent. Idempotent: no-ops when the repo already has at least one
 * commit.
 */
export async function ensureInitialCommit(cfg?: MirrorConfig): Promise<GitCommitResult> {
  const c = cfg ?? getMirrorConfig();
  if (!c.git_enabled) return { committed: false, reason: "git_disabled" };
  if (!(await isGitRepo(c.path))) return { committed: false, reason: "no_repo" };

  const git = await loadSimpleGit(c.path);
  if (!git) return { committed: false, reason: "no_repo" };

  try {
    await git.revparse(["HEAD"]);
    return { committed: false, reason: "empty_diff" };
  } catch {
    // No HEAD yet — we need an initial commit.
  }

  await git.add(["-A"]);
  const status = await git.status();
  const fileCount =
    status.staged.length +
    status.created.length +
    status.modified.length;
  if (fileCount === 0) return { committed: false, reason: "empty_diff" };

  const res = await git.commit("Neotoma mirror initialized\n");
  return { committed: true, commit_hash: res.commit, file_count: fileCount };
}
