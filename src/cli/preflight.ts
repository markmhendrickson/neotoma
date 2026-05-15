/**
 * `neotoma preflight` — standalone permission-file writer.
 *
 * Without --apply: prints a single copy-paste block that the user can apply
 * manually, ending the multi-prompt back-and-forth that plagued the old setup
 * flow.
 *
 * With --apply: calls writePermissionsForTool() directly and writes the
 * allowlist file(s) on the user's behalf.
 */

import type { ToolId } from "./doctor.js";
import type { PermissionPatch } from "./permissions.js";
import { writePermissionsForTool, toolFromString } from "./permissions.js";

export interface PreflightReport {
  tool: ToolId | null;
  apply: boolean;
  dry_run: boolean;
  patches: PermissionPatch[];
  /** True when there was nothing to do (already configured). */
  already_ok: boolean;
  /** Copy-paste block for manual application; null when --apply was used. */
  copy_paste_block: string | null;
  overall_ok: boolean;
}

/**
 * Build the human-readable copy-paste block for a given tool's required
 * permission entries. Printed when --apply is not requested.
 */
function buildCopyPasteBlock(tool: ToolId): string {
  switch (tool) {
    case "claude-code":
      return [
        "Add the following entries to your Claude Code settings.",
        "",
        "Project scope (.claude/settings.local.json):",
        '  "permissions": { "allow": ["Bash(neotoma:*)", "Bash(npm install -g neotoma:*)"] }',
        "",
        "User scope (~/.claude/settings.json):",
        '  "permissions": { "allow": ["Bash(neotoma:*)", "Bash(npm install -g neotoma:*)"] }',
        "",
        "Or run `neotoma preflight --tool claude-code --apply` to write these automatically.",
      ].join("\n");

    case "cursor":
      return [
        "Add the following entries to .cursor/allowlist.json in your project:",
        "",
        '  { "allow": ["neotoma *", "npm install -g neotoma"] }',
        "",
        "Or run `neotoma preflight --tool cursor --apply` to write this automatically.",
      ].join("\n");

    case "codex":
      return [
        "Add the following block to ~/.codex/config.toml:",
        "",
        "  [approvals]",
        '  allow = ["neotoma *", "npm install -g neotoma"]',
        "",
        "Or run `neotoma preflight --tool codex --apply` to write this automatically.",
      ].join("\n");

    case "claude-desktop":
      return [
        "Claude Desktop uses an MCP server config rather than a command allowlist.",
        "Run `neotoma setup --tool claude-desktop` to configure the MCP server entry.",
      ].join("\n");

    case "openclaw":
      return [
        "openclaw uses a native plugin rather than a command allowlist.",
        "Run `neotoma setup --tool openclaw` to complete configuration.",
      ].join("\n");

    case "windsurf":
    case "continue":
    case "vscode":
      return [
        `${tool} does not expose a command allowlist file.`,
        `Run \`neotoma setup --tool ${tool}\` to configure the MCP server entry.`,
      ].join("\n");

    default:
      return "Unknown tool. Run `neotoma preflight --tool <tool>` with a supported tool name.";
  }
}

export interface RunPreflightOptions {
  tool?: string | ToolId | null;
  apply?: boolean;
  dryRun?: boolean;
  cwd?: string;
  scope?: "project" | "user" | "both";
}

export async function runPreflight(options: RunPreflightOptions = {}): Promise<PreflightReport> {
  const cwd = options.cwd ?? process.cwd();
  const apply = options.apply ?? false;
  const dryRun = options.dryRun ?? false;

  const toolInput = typeof options.tool === "string" ? toolFromString(options.tool) : (options.tool ?? null);
  const tool: ToolId | null = toolInput;

  if (!tool) {
    return {
      tool: null,
      apply,
      dry_run: dryRun,
      patches: [],
      already_ok: false,
      copy_paste_block: "Specify a tool with --tool <tool>. Supported: claude-code, cursor, codex, openclaw, claude-desktop, windsurf, continue, vscode",
      overall_ok: false,
    };
  }

  // Tools that have no writable allowlist file.
  const noAllowlistTools: ToolId[] = ["claude-desktop", "openclaw", "windsurf", "continue", "vscode"];
  if (noAllowlistTools.includes(tool)) {
    const block = buildCopyPasteBlock(tool);
    return {
      tool,
      apply,
      dry_run: dryRun,
      patches: [],
      already_ok: false,
      copy_paste_block: block,
      overall_ok: true,
    };
  }

  if (!apply) {
    // Print-only mode: no writes, just describe what to do.
    const block = buildCopyPasteBlock(tool);
    return {
      tool,
      apply: false,
      dry_run: dryRun,
      patches: [],
      already_ok: false,
      copy_paste_block: block,
      overall_ok: true,
    };
  }

  // Apply mode: delegate to writePermissionsForTool.
  const defaultScope = tool === "claude-code" ? "both" : "project";
  const patches = await writePermissionsForTool(tool, cwd, {
    dryRun,
    scope: options.scope ?? defaultScope,
  });

  const anyChanged = patches.some((p) => p.changed);
  const alreadyOk = patches.length > 0 && !anyChanged;

  return {
    tool,
    apply: true,
    dry_run: dryRun,
    patches,
    already_ok: alreadyOk,
    copy_paste_block: null,
    overall_ok: true,
  };
}
