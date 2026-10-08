/**
 * Point the Claude plugin at the user's own Neotoma when the CLI installs it.
 *
 * The Claude plugin bundles an MCP connector whose URL is the plugin option
 * `neotoma_mcp_url` (default: the shared public sandbox), and its hooks follow
 * the same option. A CLI install (`neotoma hooks install --tool claude-code`,
 * and `neotoma setup`, which calls it) is by definition a local setup, so it
 * must never leave the plugin on the sandbox:
 *
 *   1. Set the option to the user's configured Neotoma, so connector and hooks
 *      both use it (`claude plugin configure --values-stdin`).
 *   2. When Claude Code already has the user's own Neotoma MCP entry (which
 *      `neotoma setup` writes), turn the bundled connector off
 *      (`disabledMcpServers` in ~/.claude/settings.json), so Claude Code ends up
 *      with exactly ONE Neotoma connector.
 *
 * Runs on fresh installs and on re-runs against an existing install, which is
 * the upgrade path for plugin 0.1.x users.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { WIN_SHELL } from "../shared/spawn_platform.js";

export const CLAUDE_PLUGIN_URL_OPTION = "neotoma_mcp_url";
/** Scoped name Claude Code gives the plugin's bundled server (`plugin:<plugin>:<server>`). */
export const CLAUDE_PLUGIN_BUNDLED_SERVER = "plugin:neotoma:neotoma";
/** Default local API root, and what plugin 0.1.x hooks used. */
export const DEFAULT_LOCAL_BASE_URL = "http://127.0.0.1:3080";

export interface ClaudePluginUrlInputs {
  /** NEOTOMA_BASE_URL from the environment. */
  envBaseUrl?: string | null;
  /** `base_url` from the Neotoma CLI config. */
  configBaseUrl?: string | null;
  /** Base URL of a running local API, from `neotoma doctor`. */
  apiBaseUrl?: string | null;
}

/** The `/mcp` URL of the user's configured Neotoma. */
export function resolveClaudePluginMcpUrl(inputs: ClaudePluginUrlInputs): string {
  const base =
    [inputs.envBaseUrl, inputs.configBaseUrl, inputs.apiBaseUrl]
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .find((v) => v.length > 0) ?? DEFAULT_LOCAL_BASE_URL;
  return `${base.replace(/\/+$/, "").replace(/\/mcp$/i, "")}/mcp`;
}

/**
 * Add `server` to `disabledMcpServers` in a Claude Code settings.json text,
 * keeping every other key. Returns null when the file is not valid JSON (we
 * never overwrite a file we cannot parse).
 */
export function mergeDisabledMcpServers(
  before: string | null,
  server: string
): { after: string; changed: boolean } | null {
  let parsed: Record<string, unknown> = {};
  if (before && before.trim()) {
    try {
      const value = JSON.parse(before) as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      parsed = value as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  const existing = Array.isArray(parsed.disabledMcpServers)
    ? (parsed.disabledMcpServers as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  if (existing.includes(server)) {
    return { after: before ?? "", changed: false };
  }
  const next = { ...parsed, disabledMcpServers: [...existing, server] };
  return { after: `${JSON.stringify(next, null, 2)}\n`, changed: true };
}

export interface ConfigureClaudePluginDeps {
  spawn?: typeof spawnSync;
  settingsPath?: string;
  readText?: (p: string) => Promise<string | null>;
  writeText?: (p: string, text: string) => Promise<void>;
}

export interface ConfigureClaudePluginResult {
  ok: boolean;
  mcpUrl: string;
  /** True when the bundled connector was turned off (own MCP entry present). */
  disabledBundled: boolean;
  message: string;
}

async function defaultReadText(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

async function defaultWriteText(p: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, text, "utf8");
}

export async function configureClaudePluginConnector(
  args: {
    installSpec: string;
    urlInputs: ClaudePluginUrlInputs;
    /** Claude Code already has the user's own Neotoma MCP entry. */
    hasOwnNeotomaMcp: boolean;
    dryRun?: boolean;
  },
  deps: ConfigureClaudePluginDeps = {}
): Promise<ConfigureClaudePluginResult> {
  const spawn = deps.spawn ?? spawnSync;
  const settingsPath = deps.settingsPath ?? path.join(os.homedir(), ".claude", "settings.json");
  const readText = deps.readText ?? defaultReadText;
  const writeText = deps.writeText ?? defaultWriteText;
  const mcpUrl = resolveClaudePluginMcpUrl(args.urlInputs);
  const values = JSON.stringify({ [CLAUDE_PLUGIN_URL_OPTION]: mcpUrl });

  if (args.dryRun) {
    return {
      ok: true,
      mcpUrl,
      disabledBundled: args.hasOwnNeotomaMcp,
      message:
        `[dry-run] would set ${CLAUDE_PLUGIN_URL_OPTION}=${mcpUrl} ` +
        `(claude plugin configure ${args.installSpec} --values-stdin)` +
        (args.hasOwnNeotomaMcp
          ? ` and add ${CLAUDE_PLUGIN_BUNDLED_SERVER} to disabledMcpServers in ${settingsPath}`
          : ""),
    };
  }

  const res = spawn("claude", ["plugin", "configure", args.installSpec, "--values-stdin"], {
    input: values,
    stdio: ["pipe", "inherit", "inherit"],
    encoding: "utf-8",
    // claude.cmd on Windows requires shell mode (CVE-2024-27980) or EINVAL.
    ...WIN_SHELL,
  });
  if (res.status !== 0) {
    return {
      ok: false,
      mcpUrl,
      disabledBundled: false,
      message:
        `Could not set the plugin's Neotoma MCP URL (claude plugin configure exited ` +
        `${res.status ?? "unknown"}). Set it by hand so the plugin does not use the ` +
        `public sandbox: echo '${values}' | claude plugin configure ${args.installSpec} --values-stdin`,
    };
  }

  let disabledBundled = false;
  let disableNote = "";
  if (args.hasOwnNeotomaMcp) {
    const merged = mergeDisabledMcpServers(
      await readText(settingsPath),
      CLAUDE_PLUGIN_BUNDLED_SERVER
    );
    if (merged === null) {
      disableNote =
        ` Claude Code already has your own Neotoma MCP entry, but ${settingsPath} is not ` +
        `valid JSON, so the plugin's duplicate connector was NOT turned off. Turn it off in ` +
        `/mcp (${CLAUDE_PLUGIN_BUNDLED_SERVER}).`;
    } else {
      if (merged.changed) await writeText(settingsPath, merged.after);
      disabledBundled = true;
      disableNote =
        ` Claude Code already has your own Neotoma MCP entry, so the plugin's bundled ` +
        `connector (${CLAUDE_PLUGIN_BUNDLED_SERVER}) is turned off to avoid a duplicate.`;
    }
  }

  return {
    ok: true,
    mcpUrl,
    disabledBundled,
    message: `Plugin points at your Neotoma (${mcpUrl}); hooks use the same URL.${disableNote}`,
  };
}
