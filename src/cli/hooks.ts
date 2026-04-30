/**
 * `neotoma hooks` — install / uninstall / status for lifecycle hooks.
 *
 * Hooks can be installed directly with `neotoma hooks install`, or
 * automatically by setup flows after Neotoma MCP has been configured for a
 * hook-capable harness. Runtime MCP servers never mutate harness config; only
 * local setup commands call these installers.
 *
 * The command itself is a thin wrapper that delegates to each package's own
 * installer script:
 *   - cursor   → packages/cursor-hooks/scripts/install.mjs
 *   - codex    → packages/codex-hooks/scripts/install.mjs
 *   - claude-code / opencode / claude-agent-sdk → print a snippet and exit
 *
 * Guardrails (enforced before any write):
 *   - `data.initialized === false` → refuse; instruct user to `neotoma init`.
 *   - `hooks.installed[tool].other_hook_plugins.length > 0` → refuse unless
 *     `--force` is set; surface the detected plugin names.
 *   - Non-interactive prompt by default; `--yes` bypasses confirmation.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

import { runDoctor, type DoctorReport } from "./doctor.js";
import type { HookHarnessId, HookStatus } from "./hooks_detect.js";
import { HOOK_HARNESSES } from "./hooks_detect.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface HooksCommandOptions {
  tool: HookHarnessId;
  cwd?: string;
  dryRun?: boolean;
  yes?: boolean;
  force?: boolean;
}

export interface HooksCommandResult {
  ok: boolean;
  tool: HookHarnessId;
  action: "install" | "uninstall" | "status";
  message: string;
  /** Populated when delegation to a package script happened. */
  delegated_to: string | null;
  /** Raw doctor.hooks snapshot after the command. */
  status: DoctorReport["hooks"];
}

/** Locate the repo root containing `packages/<pkg>/scripts/install.mjs`.
 *
 * Covers three layouts:
 *   1. Local checkout: dist/cli/hooks.js → ../.. → repo root
 *   2. Global npm install: the neotoma package keeps `packages/` alongside
 *      `dist/`, so the same traversal works.
 *   3. Development where the caller runs `tsx src/cli/hooks.ts` directly.
 *
 * Returns null when the repo root cannot be located.
 */
function locateRepoRoot(): string | null {
  const candidates = [
    path.resolve(__dirname, "..", ".."),
    path.resolve(__dirname, "..", "..", ".."),
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "packages"))) return candidate;
  }
  return null;
}

function packageInstallerPath(
  tool: HookHarnessId,
  repoRoot: string
): string | null {
  const map: Partial<Record<HookHarnessId, string>> = {
    cursor: path.join(
      repoRoot,
      "packages",
      "cursor-hooks",
      "scripts",
      "install.mjs"
    ),
    codex: path.join(
      repoRoot,
      "packages",
      "codex-hooks",
      "scripts",
      "install.mjs"
    ),
  };
  const candidate = map[tool];
  if (!candidate) return null;
  return existsSync(candidate) ? candidate : null;
}

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

function printSnippetOnly(tool: HookHarnessId): string {
  if (tool === "claude-code") {
    return [
      "Claude Code plugin: install from the plugin marketplace or add to",
      "  .claude/plugins.json:",
      '    { "plugins": [{ "name": "neotoma", "source": "@neotoma/claude-code-plugin" }] }',
      "See docs/integrations/hooks/claude_code.md.",
    ].join("\n");
  }
  if (tool === "opencode") {
    return [
      "OpenCode plugin: add to your OpenCode plugin config, e.g.:",
      '  import neotoma from "@neotoma/opencode-plugin";',
      "  export default { plugins: [neotoma()] };",
      "See docs/integrations/hooks/opencode.md.",
    ].join("\n");
  }
  if (tool === "claude-agent-sdk") {
    return [
      "Claude Agent SDK: add hooks in your own code:",
      '  import { createNeotomaHooks } from "@neotoma/claude-agent-sdk-adapter";',
      "  const hooks = createNeotomaHooks();",
      "See docs/integrations/hooks/claude_agent_sdk.md.",
    ].join("\n");
  }
  return "No installer available for this harness.";
}

function checkGuardrails(
  report: DoctorReport,
  status: HookStatus,
  tool: HookHarnessId,
  force: boolean
): string | null {
  if (!report.data.initialized) {
    return "Neotoma has no initialized data directory. Run `neotoma init` before installing hooks.";
  }
  if (!force && status.other_hook_plugins.length > 0) {
    return (
      `Detected other hook plugins in ${status.path ?? "the target config"}: ` +
      status.other_hook_plugins.join(", ") +
      ". Re-run with --force after reviewing for compatibility."
    );
  }
  if (!HOOK_HARNESSES.includes(tool)) {
    return `Unsupported tool: ${tool}`;
  }
  return null;
}

async function doInstall(
  opts: HooksCommandOptions,
  report: DoctorReport
): Promise<HooksCommandResult> {
  const status = report.hooks.installed[opts.tool];
  const guardrail = checkGuardrails(report, status, opts.tool, Boolean(opts.force));
  if (guardrail) {
    return {
      ok: false,
      tool: opts.tool,
      action: "install",
      message: guardrail,
      delegated_to: null,
      status: report.hooks,
    };
  }

  if (status.present && !opts.force) {
    return {
      ok: true,
      tool: opts.tool,
      action: "install",
      message: `Neotoma hooks already installed for ${opts.tool} at ${status.path ?? "<unknown>"}.`,
      delegated_to: null,
      status: report.hooks,
    };
  }

  const repoRoot = locateRepoRoot();
  if (!repoRoot) {
    return {
      ok: false,
      tool: opts.tool,
      action: "install",
      message:
        "Could not locate the Neotoma package root. This typically means the hook packages were not published with this install. Run from a local checkout, or run `npm install -g neotoma@latest` once the hook packages are published.",
      delegated_to: null,
      status: report.hooks,
    };
  }

  const installerPath = packageInstallerPath(opts.tool, repoRoot);
  if (!installerPath) {
    const snippet = printSnippetOnly(opts.tool);
    return {
      ok: true,
      tool: opts.tool,
      action: "install",
      message: `No auto-installer for ${opts.tool}. Copy-paste the following:\n${snippet}`,
      delegated_to: null,
      status: report.hooks,
    };
  }

  if (!opts.yes) {
    const ok = await confirm(
      `Install Neotoma hooks for ${opts.tool}? This will edit ${status.path ?? "the tool config"}.`
    );
    if (!ok) {
      return {
        ok: false,
        tool: opts.tool,
        action: "install",
        message: "Declined by user.",
        delegated_to: null,
        status: report.hooks,
      };
    }
  }

  if (opts.dryRun) {
    return {
      ok: true,
      tool: opts.tool,
      action: "install",
      message: `[dry-run] would run: node ${installerPath} install`,
      delegated_to: installerPath,
      status: report.hooks,
    };
  }

  const res = spawnSync("node", [installerPath, "install"], {
    cwd: opts.cwd ?? process.cwd(),
    stdio: "inherit",
  });
  const ok = res.status === 0;
  return {
    ok,
    tool: opts.tool,
    action: "install",
    message: ok
      ? `Installed Neotoma hooks for ${opts.tool}.`
      : `Installer exited with status ${res.status ?? "unknown"}.`,
    delegated_to: installerPath,
    status: report.hooks,
  };
}

async function doUninstall(
  opts: HooksCommandOptions,
  report: DoctorReport
): Promise<HooksCommandResult> {
  const status = report.hooks.installed[opts.tool];
  if (!status.present) {
    return {
      ok: true,
      tool: opts.tool,
      action: "uninstall",
      message: `No Neotoma hooks installed for ${opts.tool}.`,
      delegated_to: null,
      status: report.hooks,
    };
  }
  const repoRoot = locateRepoRoot();
  if (!repoRoot) {
    return {
      ok: false,
      tool: opts.tool,
      action: "uninstall",
      message: "Could not locate the Neotoma package root.",
      delegated_to: null,
      status: report.hooks,
    };
  }
  const installerPath = packageInstallerPath(opts.tool, repoRoot);
  if (!installerPath) {
    return {
      ok: false,
      tool: opts.tool,
      action: "uninstall",
      message: `No auto-uninstaller for ${opts.tool}. Remove the plugin manually.`,
      delegated_to: null,
      status: report.hooks,
    };
  }
  if (opts.dryRun) {
    return {
      ok: true,
      tool: opts.tool,
      action: "uninstall",
      message: `[dry-run] would run: node ${installerPath} --uninstall`,
      delegated_to: installerPath,
      status: report.hooks,
    };
  }
  const res = spawnSync("node", [installerPath, "--uninstall"], {
    cwd: opts.cwd ?? process.cwd(),
    stdio: "inherit",
  });
  const ok = res.status === 0;
  return {
    ok,
    tool: opts.tool,
    action: "uninstall",
    message: ok
      ? `Uninstalled Neotoma hooks for ${opts.tool}.`
      : `Uninstaller exited with status ${res.status ?? "unknown"}.`,
    delegated_to: installerPath,
    status: report.hooks,
  };
}

export async function runHooksInstall(
  opts: HooksCommandOptions
): Promise<HooksCommandResult> {
  const report = await runDoctor({ cwd: opts.cwd });
  return doInstall(opts, report);
}

export async function runHooksUninstall(
  opts: HooksCommandOptions
): Promise<HooksCommandResult> {
  const report = await runDoctor({ cwd: opts.cwd });
  return doUninstall(opts, report);
}

export async function runHooksStatus(
  opts: { cwd?: string } = {}
): Promise<DoctorReport["hooks"]> {
  const report = await runDoctor({ cwd: opts.cwd });
  return report.hooks;
}
