/**
 * Detection helpers for `neotoma doctor` and `neotoma hooks`.
 *
 * Returns a consolidated `HooksReport` describing, per hook-capable harness,
 * whether Neotoma's lifecycle hooks are already installed and whether any
 * non-Neotoma hook plugin is registered in the same file. This is the state
 * the activation flow in install.md reads before offering `neotoma hooks
 * install`.
 *
 * The module re-implements the small amount of "is this entry Neotoma's?"
 * logic that the per-package installers already own, intentionally duplicated
 * (rather than imported) so the CLI does not pay the cost of loading
 * `@neotoma/client` and its transitive deps just to read a JSON/TOML file.
 */

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** Hook-capable harness identifiers. Broader than `ToolId` since it includes
 * surfaces (opencode, claude-agent-sdk) that don't install the `neotoma`
 * binary but can still consume the hook packages. */
export type HookHarnessId =
  | "cursor"
  | "claude-code"
  | "codex"
  | "opencode"
  | "claude-agent-sdk";

export const HOOK_HARNESSES: readonly HookHarnessId[] = [
  "cursor",
  "claude-code",
  "codex",
  "opencode",
  "claude-agent-sdk",
];

export interface HookStatus {
  /** Neotoma hook entries are present in this harness's config. */
  present: boolean;
  /** Path to the config file consulted (absolute), or null if the harness
   * does not have a filesystem-resident config (e.g. claude-agent-sdk). */
  path: string | null;
  /** Names of non-Neotoma hook plugins/entries detected alongside Neotoma
   * entries. Empty array when no other plugins are present. */
  other_hook_plugins: string[];
}

export interface HooksReport {
  /** True iff the current tool (via hint) supports hooks. */
  supported_by_tool: boolean;
  /** Per-harness installation state. */
  installed: Record<HookHarnessId, HookStatus>;
  /** Activation may offer hooks iff supported_by_tool and the current tool
   * is not already installed and MCP is configured (caller enforces the MCP
   * check since doctor computes that separately). */
  eligible_for_offer: boolean;
}

/** Neotoma's Cursor hook scripts, emitted by packages/cursor-hooks. */
const CURSOR_HOOK_SCRIPTS = [
  "before_submit_prompt.js",
  "after_tool_use.js",
  "stop.js",
];

function isNeotomaCursorEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const args = (entry as { args?: unknown }).args;
  if (!Array.isArray(args)) return false;
  return args.some((a) => {
    if (typeof a !== "string") return false;
    if (a.includes("@neotoma/cursor-hooks")) return true;
    if (!a.includes("cursor-hooks")) return false;
    return CURSOR_HOOK_SCRIPTS.some(
      (name) => a.endsWith(name) || a.includes(`dist/${name}`)
    );
  });
}

function entryLabel(entry: unknown): string {
  if (!entry || typeof entry !== "object") return "unknown";
  const obj = entry as { name?: unknown; command?: unknown; args?: unknown };
  if (typeof obj.name === "string" && obj.name.trim()) return obj.name;
  if (typeof obj.command === "string" && obj.command.trim()) return obj.command;
  if (Array.isArray(obj.args) && obj.args.length > 0) {
    const first = obj.args.find((a) => typeof a === "string" && a.trim());
    if (typeof first === "string") {
      const base = path.basename(first);
      return base || first;
    }
  }
  return "unknown";
}

async function readJson<T = unknown>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function detectCursor(cwd: string): Promise<HookStatus> {
  const file = path.join(cwd, ".cursor", "hooks.json");
  const parsed = await readJson<{ hooks?: Record<string, unknown[]> }>(file);
  if (!parsed || !existsSync(file)) {
    return { present: false, path: file, other_hook_plugins: [] };
  }
  let present = false;
  const others = new Set<string>();
  const hooks = parsed.hooks ?? {};
  for (const entries of Object.values(hooks)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (isNeotomaCursorEntry(entry)) {
        present = true;
      } else {
        others.add(entryLabel(entry));
      }
    }
  }
  return { present, path: file, other_hook_plugins: [...others] };
}

async function detectClaudeCode(cwd: string): Promise<HookStatus> {
  // Claude Code plugins can live at project scope (.claude/plugins.json) or
  // user scope (~/.claude/plugins.json). We check both; `present` is true iff
  // either references the neotoma plugin id.
  const candidates = [
    path.join(cwd, ".claude", "plugins.json"),
    path.join(os.homedir(), ".claude", "plugins.json"),
  ];
  const others = new Set<string>();
  let present = false;
  let pathUsed: string | null = null;
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    pathUsed = pathUsed ?? candidate;
    const parsed = await readJson<{
      plugins?: Array<{ name?: string; id?: string }>;
      installed?: Array<{ name?: string; id?: string }>;
    }>(candidate);
    if (!parsed) continue;
    const list = [
      ...(parsed.plugins ?? []),
      ...(parsed.installed ?? []),
    ];
    for (const plugin of list) {
      const name = (plugin.name ?? plugin.id ?? "").toString();
      if (!name) continue;
      if (name === "neotoma" || name.startsWith("neotoma/") || name.includes("neotoma-")) {
        present = true;
      } else {
        others.add(name);
      }
    }
  }
  return { present, path: pathUsed, other_hook_plugins: [...others] };
}

async function detectCodex(): Promise<HookStatus> {
  const file = path.join(os.homedir(), ".codex", "config.toml");
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return { present: false, path: file, other_hook_plugins: [] };
  }
  const present = raw.includes("# BEGIN neotoma-codex-hooks");
  // Best-effort: identify non-Neotoma hook entries by looking for [notify] /
  // [history] sections that do not fall inside the Neotoma-marked block.
  const others = new Set<string>();
  const withoutBlock = raw.replace(
    /# BEGIN neotoma-codex-hooks[\s\S]*?# END neotoma-codex-hooks/,
    ""
  );
  const sectionRe = /^\s*\[(notify|history)\]/gm;
  let match: RegExpExecArray | null;
  while ((match = sectionRe.exec(withoutBlock)) !== null) {
    others.add(`[${match[1]}] (external)`);
  }
  return { present, path: file, other_hook_plugins: [...others] };
}

async function detectOpenCode(): Promise<HookStatus> {
  // OpenCode plugins are user-code imports, not a config file, so the best
  // we can do is look for a plugin module with "neotoma" in its name under
  // the standard plugin directories.
  const candidates = [
    path.join(os.homedir(), ".config", "opencode", "plugins"),
    path.join(os.homedir(), ".opencode", "plugins"),
  ];
  let present = false;
  let pathUsed: string | null = null;
  for (const dir of candidates) {
    if (!existsSync(dir)) continue;
    pathUsed = pathUsed ?? dir;
    try {
      const entries = await fs.readdir(dir);
      if (entries.some((e) => /neotoma/i.test(e))) {
        present = true;
        break;
      }
    } catch {
      // ignore
    }
  }
  return { present, path: pathUsed, other_hook_plugins: [] };
}

async function detectClaudeAgentSdk(): Promise<HookStatus> {
  // The SDK adapter is always a user-code import; there is no installable
  // state file to inspect. We surface `present: false` and `path: null` so
  // activation does not offer auto-install for this surface.
  return { present: false, path: null, other_hook_plugins: [] };
}

export interface DetectHooksOptions {
  cwd?: string;
  /** The currently-detected harness (from doctor.current_tool_hint). When
   * set, eligibility uses its installation status. */
  currentTool?: HookHarnessId | null;
  /** Whether MCP is already configured for the current tool. Activation
   * requires this so hooks only layer on top of a working MCP setup. */
  mcpConfigured?: boolean;
}

/** Collect per-harness installation state for activation / `neotoma hooks`. */
export async function detectHooks(
  opts: DetectHooksOptions = {}
): Promise<HooksReport> {
  const cwd = opts.cwd ?? process.cwd();
  const [cursor, claudeCode, codex, opencode, claudeAgentSdk] = await Promise.all([
    detectCursor(cwd),
    detectClaudeCode(cwd),
    detectCodex(),
    detectOpenCode(),
    detectClaudeAgentSdk(),
  ]);
  const installed: Record<HookHarnessId, HookStatus> = {
    cursor,
    "claude-code": claudeCode,
    codex,
    opencode,
    "claude-agent-sdk": claudeAgentSdk,
  };
  const currentTool = opts.currentTool ?? null;
  const supported_by_tool = Boolean(
    currentTool && HOOK_HARNESSES.includes(currentTool)
  );
  const currentInstalled =
    currentTool && installed[currentTool]
      ? installed[currentTool].present
      : false;
  const eligible_for_offer =
    supported_by_tool && !currentInstalled && Boolean(opts.mcpConfigured);
  return { supported_by_tool, installed, eligible_for_offer };
}

/** Narrow an arbitrary string to a `HookHarnessId` or `null`. */
export function toHookHarness(value: unknown): HookHarnessId | null {
  if (typeof value !== "string") return null;
  return (HOOK_HARNESSES as readonly string[]).includes(value)
    ? (value as HookHarnessId)
    : null;
}
