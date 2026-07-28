/**
 * Instance-stored `skill` rows → harness materialization (#1950).
 *
 * Complements `skills_mirror.ts` (package `skills/` dir → harness) with a
 * second, opt-in source: `enabled` `skill` entities on the connected Neotoma
 * instance. Fetched rows are rendered as real `<slug>/SKILL.md` files under a
 * dedicated local root (`~/.neotoma/instance-skills/<instance-host>/`), then
 * reconciled into harness skill dirs using the exact same per-skill-symlink
 * mechanism `skills_mirror.ts` already uses (`mirrorPerSkill`).
 *
 * Trust contract (see #1950 Q3 and the design comment on #1951):
 *   - Gated behind `--include-instance-skills` on `neotoma skills sync` (and,
 *     transitively, `--include-instance-scripts` on the same command).
 *   - Package-shipped skills always win on name collision: an instance skill
 *     whose slug matches a package skill is skipped with a warning, never
 *     overwritten.
 *   - Idempotent: re-running updates changed rows and prunes materialized
 *     dirs whose row is gone or disabled — but ONLY dirs carrying our
 *     provenance header (`INSTANCE_SKILL_PROVENANCE_MARKER` below), so a
 *     user-authored directory that happens to share a slug is never touched.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import type { ToolId } from "./doctor.js";
import {
  SKILL_HARNESSES,
  getPublishedSkillsSource,
  listSkillNames,
  mirrorPerSkill,
} from "./skills_mirror.js";
import type { InstanceSkillRow } from "./instance_skills_client.js";

/** Marks a materialized instance-skill directory as ours to prune. Never present in user-authored skills. */
export const INSTANCE_SKILL_PROVENANCE_MARKER = "neotoma:instance-skill-provenance";

/** Root directory holding materialized instance skills for a given instance host. */
export function getInstanceSkillsRoot(instanceHost: string, homeDir: string = homedir()): string {
  return join(homeDir, ".neotoma", "instance-skills", sanitizeHostForPath(instanceHost));
}

function sanitizeHostForPath(host: string): string {
  return host.replace(/[^a-zA-Z0-9_.-]/g, "_") || "unknown-host";
}

/** Kebab-case a skill row's slug/name into a filesystem-safe directory name. */
export function resolveSkillDirName(row: Pick<InstanceSkillRow, "name" | "slug">): string {
  const raw = (row.slug && row.slug.trim()) || row.name;
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Render a `skill` row into a `SKILL.md` string: YAML frontmatter matching
 * shipped skills' shape (name, description, triggers, user_invocable when
 * set) plus a do-not-edit provenance header, then the markdown `content`
 * body.
 */
export function renderInstanceSkillMarkdown(
  row: InstanceSkillRow,
  opts: { instanceHost: string }
): string {
  const frontmatterLines = ["---", `name: ${row.name}`];
  if (row.description) frontmatterLines.push(`description: ${yamlScalar(row.description)}`);
  if (row.triggers && row.triggers.length > 0) {
    frontmatterLines.push("triggers:");
    for (const t of row.triggers) frontmatterLines.push(`  - ${yamlScalar(t)}`);
  }
  if (typeof row.user_invocable === "boolean") {
    frontmatterLines.push(`user_invocable: ${row.user_invocable}`);
  }
  frontmatterLines.push("---");

  const provenance = [
    "<!-- DO NOT EDIT — materialized from a Neotoma instance skill row. -->",
    `<!-- ${INSTANCE_SKILL_PROVENANCE_MARKER} -->`,
    `<!-- source_entity_id: ${row.entity_id} -->`,
    `<!-- instance: ${opts.instanceHost} -->`,
    "<!-- Edit the `skill` row on the instance and re-run `neotoma skills sync --include-instance-skills` to update this file. -->",
  ].join("\n");

  const body = row.content ?? "";
  return `${frontmatterLines.join("\n")}\n\n${provenance}\n\n${body}\n`;
}

function yamlScalar(value: string): string {
  // Minimal quoting: wrap in double quotes and escape embedded quotes/backslashes
  // whenever the value contains YAML-significant characters. Plain scalars are
  // left unquoted to keep output readable for the common case.
  if (/^[\w .,'()/-]+$/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** True when a file at `path` carries our provenance marker (used to gate pruning). */
export function hasInstanceSkillProvenance(skillMdPath: string): boolean {
  try {
    return readFileSync(skillMdPath, "utf8").includes(INSTANCE_SKILL_PROVENANCE_MARKER);
  } catch {
    return false;
  }
}

export interface MaterializeInstanceSkillsResult {
  root: string;
  written: string[];
  pruned: string[];
  skippedCollisions: Array<{ name: string; reason: string }>;
}

/**
 * Materialize fetched instance skill rows as `<slug>/SKILL.md` files under
 * the instance-skills root, pruning materialized dirs whose row is no longer
 * present (only ever dirs carrying our provenance header). Package-shipped
 * skills win on name collision: a colliding instance row is skipped and
 * reported, never written.
 */
export function materializeInstanceSkills(
  rows: InstanceSkillRow[],
  opts: {
    instanceHost: string;
    homeDir?: string;
    packageSkillsSourceDir?: string;
  }
): MaterializeInstanceSkillsResult {
  const root = getInstanceSkillsRoot(opts.instanceHost, opts.homeDir);
  mkdirSync(root, { recursive: true });

  const packageSkillNames = new Set(
    listSkillNames(opts.packageSkillsSourceDir ?? getPublishedSkillsSource())
  );

  const written: string[] = [];
  const skippedCollisions: Array<{ name: string; reason: string }> = [];
  const currentDirNames = new Set<string>();

  for (const row of rows) {
    const dirName = resolveSkillDirName(row);
    if (!dirName) continue;
    if (packageSkillNames.has(dirName)) {
      skippedCollisions.push({
        name: dirName,
        reason: `package skill '${dirName}' already exists; instance row skipped (package wins)`,
      });
      continue;
    }
    currentDirNames.add(dirName);
    const skillDir = join(root, dirName);
    mkdirSync(skillDir, { recursive: true });
    const skillMdPath = join(skillDir, "SKILL.md");
    const rendered = renderInstanceSkillMarkdown(row, { instanceHost: opts.instanceHost });
    const existing = existsSync(skillMdPath) ? readFileSync(skillMdPath, "utf8") : null;
    if (existing !== rendered) {
      writeFileSync(skillMdPath, rendered, "utf8");
      written.push(dirName);
    }
  }

  // Prune materialized dirs whose row is gone/disabled — only ever dirs
  // carrying our provenance header, never a user-authored directory that
  // happens to share a slug.
  const pruned: string[] = [];
  let existingDirs: string[] = [];
  try {
    existingDirs = readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    existingDirs = [];
  }
  for (const dirName of existingDirs) {
    if (currentDirNames.has(dirName)) continue;
    const skillMdPath = join(root, dirName, "SKILL.md");
    if (!hasInstanceSkillProvenance(skillMdPath)) continue;
    rmSync(join(root, dirName), { recursive: true, force: true });
    pruned.push(dirName);
  }

  return { root, written, pruned, skippedCollisions };
}

/**
 * Reconcile the materialized instance-skills root into every installed
 * harness's skill directory, using the same per-skill-symlink mechanism
 * `skills_mirror.ts` uses for package skills. Package skills already took
 * precedence during materialization (colliding rows never reach disk), so
 * this reuses `mirrorPerSkill` unmodified against the instance-skills root as
 * source.
 */
export function linkInstanceSkillsToHarnesses(
  instanceSkillsRoot: string,
  opts: { cwd?: string; scope?: "user" | "project" } = {}
): Array<{
  tool: ToolId;
  target: string;
  changed: boolean;
  linked: string[];
  errors: Array<{ skill: string; reason: string }>;
  skipped?: boolean;
  reason?: string;
}> {
  const scope = opts.scope ?? "user";
  const cwd = opts.cwd ?? process.cwd();
  const skillNames = listSkillNames(instanceSkillsRoot);

  const results: Array<{
    tool: ToolId;
    target: string;
    changed: boolean;
    linked: string[];
    errors: Array<{ skill: string; reason: string }>;
    skipped?: boolean;
    reason?: string;
  }> = [];

  for (const tool of (Object.keys(SKILL_HARNESSES) as ToolId[]).sort()) {
    const entry = SKILL_HARNESSES[tool];
    if (!entry) continue;
    const base = scope === "user" ? homedir() : cwd;
    const basePath = join(base, entry.base);
    const targetDir = join(base, entry.dir);
    if (!existsSync(basePath)) {
      results.push({
        tool,
        target: targetDir,
        changed: false,
        linked: [],
        errors: [],
        skipped: true,
        reason: `harness base ${entry.base} not present`,
      });
      continue;
    }
    if (skillNames.length === 0) {
      results.push({
        tool,
        target: targetDir,
        changed: false,
        linked: [],
        errors: [],
        skipped: true,
        reason: "no instance skills materialized",
      });
      continue;
    }
    const { changed, linked, errors } = mirrorPerSkill(targetDir, instanceSkillsRoot, skillNames);
    results.push({ tool, target: targetDir, changed, linked, errors });
  }

  return results;
}
