/**
 * Permission-file writers for `neotoma setup`.
 *
 * Merges a single canonical `neotoma *` wildcard approval and a one-time
 * `npm install -g neotoma` allow entry into each supported harness's
 * permission file. All writers are merge-preserving and idempotent.
 */

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ToolId } from "./doctor.js";

export interface PermissionPatch {
  path: string;
  tool: ToolId;
  before: string | null;
  after: string;
  changed: boolean;
  created: boolean;
}

/** Serialize JSON with stable 2-space indentation. */
function jsonStr(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readText(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/** Canonical allow entries to inject per harness. */
const CLAUDE_ALLOW_ENTRIES = ["Bash(neotoma:*)", "Bash(npm install -g neotoma:*)"];
const CURSOR_ALLOW_ENTRIES = ["neotoma *", "npm install -g neotoma"];

/** Merge unique entries into array, preserving existing order. */
function mergeAllow(existing: unknown, entries: string[]): string[] {
  const base = Array.isArray(existing) ? (existing.filter((s) => typeof s === "string") as string[]) : [];
  const out = [...base];
  for (const e of entries) {
    if (!out.includes(e)) out.push(e);
  }
  return out;
}

/** Write `.claude/settings.local.json` with neotoma allow entries (project scope). */
export async function patchClaudeCodeProject(cwd: string, options: { dryRun?: boolean } = {}): Promise<PermissionPatch> {
  const target = path.join(cwd, ".claude", "settings.local.json");
  const before = await readText(target);
  let parsed: { permissions?: { allow?: string[]; deny?: string[]; ask?: string[] } } = {};
  if (before) {
    try {
      parsed = JSON.parse(before) as typeof parsed;
    } catch {
      // treat as empty
    }
  }
  const allow = mergeAllow(parsed.permissions?.allow, CLAUDE_ALLOW_ENTRIES);
  const next = { ...parsed, permissions: { ...(parsed.permissions ?? {}), allow } };
  const after = jsonStr(next);
  const changed = after !== before;
  if (changed && !options.dryRun) {
    await ensureDir(path.dirname(target));
    await fs.writeFile(target, after, "utf8");
  }
  return { path: target, tool: "claude-code", before, after, changed, created: before === null };
}

/** Write `~/.claude/settings.json` with neotoma allow entries (user scope). */
export async function patchClaudeCodeUser(options: { dryRun?: boolean } = {}): Promise<PermissionPatch> {
  const target = path.join(os.homedir(), ".claude", "settings.json");
  const before = await readText(target);
  let parsed: { permissions?: { allow?: string[] } } = {};
  if (before) {
    try {
      parsed = JSON.parse(before) as typeof parsed;
    } catch {
      // ignore
    }
  }
  const allow = mergeAllow(parsed.permissions?.allow, CLAUDE_ALLOW_ENTRIES);
  const next = { ...parsed, permissions: { ...(parsed.permissions ?? {}), allow } };
  const after = jsonStr(next);
  const changed = after !== before;
  if (changed && !options.dryRun) {
    await ensureDir(path.dirname(target));
    await fs.writeFile(target, after, "utf8");
  }
  return { path: target, tool: "claude-code", before, after, changed, created: before === null };
}

/** Write `.cursor/allowlist.json` under the current project root. */
export async function patchCursorAllowlist(cwd: string, options: { dryRun?: boolean } = {}): Promise<PermissionPatch> {
  const target = path.join(cwd, ".cursor", "allowlist.json");
  const before = await readText(target);
  let parsed: { allow?: string[] } = {};
  if (before) {
    try {
      parsed = JSON.parse(before) as typeof parsed;
    } catch {
      // ignore
    }
  }
  const allow = mergeAllow(parsed.allow, CURSOR_ALLOW_ENTRIES);
  const next = { ...parsed, allow };
  const after = jsonStr(next);
  const changed = after !== before;
  if (changed && !options.dryRun) {
    await ensureDir(path.dirname(target));
    await fs.writeFile(target, after, "utf8");
  }
  return { path: target, tool: "cursor", before, after, changed, created: before === null };
}

const CODEX_APPROVAL_BLOCK = `
# Added by \`neotoma setup --tool codex\`
[approvals]
allow = [
  "neotoma *",
  "npm install -g neotoma",
]
`.trimStart();

/** Append an `[approvals]` block to `~/.codex/config.toml` if missing. */
export async function patchCodexConfig(options: { dryRun?: boolean } = {}): Promise<PermissionPatch> {
  const target = path.join(os.homedir(), ".codex", "config.toml");
  const before = await readText(target);
  const hasNeotoma = before ? /neotoma/i.test(before) : false;
  let after: string;
  if (!before) {
    after = CODEX_APPROVAL_BLOCK;
  } else if (hasNeotoma) {
    after = before;
  } else {
    after = before.endsWith("\n") ? `${before}\n${CODEX_APPROVAL_BLOCK}` : `${before}\n\n${CODEX_APPROVAL_BLOCK}`;
  }
  const changed = after !== before;
  if (changed && !options.dryRun) {
    await ensureDir(path.dirname(target));
    await fs.writeFile(target, after, "utf8");
  }
  return { path: target, tool: "codex", before, after, changed, created: before === null };
}

/** Write all supported permission files for a given tool. */
export async function writePermissionsForTool(
  tool: ToolId,
  cwd: string,
  options: { dryRun?: boolean; scope?: "project" | "user" | "both" } = {}
): Promise<PermissionPatch[]> {
  const scope = options.scope ?? "project";
  const results: PermissionPatch[] = [];
  switch (tool) {
    case "claude-code": {
      if (scope === "project" || scope === "both") {
        results.push(await patchClaudeCodeProject(cwd, options));
      }
      if (scope === "user" || scope === "both") {
        results.push(await patchClaudeCodeUser(options));
      }
      break;
    }
    case "cursor": {
      results.push(await patchCursorAllowlist(cwd, options));
      break;
    }
    case "codex": {
      results.push(await patchCodexConfig(options));
      break;
    }
    case "claude-desktop":
    case "openclaw":
    case "windsurf":
    case "continue":
    case "vscode": {
      // These harnesses don't surface an allowlist file; documented in the preflight UI instead.
      break;
    }
  }
  return results;
}

export function toolFromString(s: string): ToolId | null {
  const n = s.trim().toLowerCase();
  if (n === "claude-code" || n === "claudecode" || n === "claude_code") return "claude-code";
  if (n === "claude-desktop" || n === "claude_desktop") return "claude-desktop";
  if (n === "cursor") return "cursor";
  if (n === "codex") return "codex";
  if (n === "openclaw") return "openclaw";
  if (n === "windsurf") return "windsurf";
  if (n === "continue") return "continue";
  if (n === "vscode" || n === "vs-code" || n === "vs_code") return "vscode";
  return null;
}

/** Convenience: detect whether a tool already has neotoma wildcard permission. */
export function hasNeotomaAllow(patch: PermissionPatch): boolean {
  if (!patch.after) return false;
  return /neotoma/i.test(patch.after);
}

/** Expose existsSync for tests. */
export const __testing = { existsSync };
