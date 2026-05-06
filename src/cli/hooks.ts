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

/**
 * Locate the claude-code plugin package directory within the repo root.
 * Returns the absolute path if it exists, null otherwise.
 */
function claudeCodePluginDir(repoRoot: string): string | null {
  const candidate = path.join(repoRoot, "packages", "claude-code-plugin");
  return existsSync(candidate) ? candidate : null;
}

/** Matches `packages/claude-code-plugin/.claude-plugin/marketplace.json` `name` and plugin entry `name`. */
const CLAUDE_NEOTOMA_MARKETPLACE_NAME = "neotoma-marketplace";
const CLAUDE_NEOTOMA_PLUGIN_INSTALL_SPEC = `neotoma@${CLAUDE_NEOTOMA_MARKETPLACE_NAME}`;

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(`${question} [Y/n] `, (answer) => {
      rl.close();
      const t = (answer ?? "").trim().toLowerCase();
      if (t === "" || t === "y" || t === "yes") {
        resolve(true);
        return;
      }
      resolve(false);
    });
  });
}

function printSnippetOnly(tool: HookHarnessId, repoRoot?: string | null): string {
  if (tool === "claude-code") {
    const pluginDir = repoRoot ? claudeCodePluginDir(repoRoot) : null;
    if (pluginDir && repoRoot) {
      return [
        "Claude Code plugin (local checkout detected). Claude CLI only installs",
        "  `plugin@marketplace` ids — register this folder as a marketplace, then install:",
        `  claude plugin marketplace add ${pluginDir}`,
        `  claude plugin install ${CLAUDE_NEOTOMA_PLUGIN_INSTALL_SPEC}`,
        "See docs/integrations/hooks/claude_code.md.",
      ].join("\n");
    }
    return [
      "Claude Code plugin: install from npm once published:",
      "  claude plugin install @neotoma/claude-code-plugin",
      "Or add to .claude/plugins.json:",
      '  { "plugins": [{ "name": "neotoma", "source": "@neotoma/claude-code-plugin" }] }',
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
    // For claude-code: Claude's `plugin install` only accepts `name@marketplace`
    // (see code.claude.com plugins reference). Local checkouts ship a catalog at
    // `packages/claude-code-plugin/.claude-plugin/marketplace.json`; register the
    // plugin root as a marketplace, then install `neotoma@neotoma-marketplace`.
    if (opts.tool === "claude-code") {
      const pluginDir = claudeCodePluginDir(repoRoot);
      if (pluginDir) {
        if (opts.dryRun) {
          return {
            ok: true,
            tool: opts.tool,
            action: "install",
            message:
              `[dry-run] would run: claude plugin marketplace add ${pluginDir} && ` +
              `claude plugin install ${CLAUDE_NEOTOMA_PLUGIN_INSTALL_SPEC}`,
            delegated_to: pluginDir,
            status: report.hooks,
          };
        }
        if (!opts.yes) {
          const ok = await confirm(
            `Install Neotoma Claude Code plugin? This will run \`claude plugin marketplace add ${pluginDir}\` then \`claude plugin install ${CLAUDE_NEOTOMA_PLUGIN_INSTALL_SPEC}\`.`
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
        const addRes = spawnSync(
          "claude",
          ["plugin", "marketplace", "add", pluginDir],
          { cwd: repoRoot, stdio: "inherit" }
        );
        const installRes = spawnSync(
          "claude",
          ["plugin", "install", CLAUDE_NEOTOMA_PLUGIN_INSTALL_SPEC],
          { cwd: repoRoot, stdio: "inherit" }
        );
        const ok = installRes.status === 0;
        const addOk = addRes.status === 0;
        return {
          ok,
          tool: opts.tool,
          action: "install",
          message: ok
            ? `Installed Neotoma Claude Code plugin (${CLAUDE_NEOTOMA_PLUGIN_INSTALL_SPEC}).` +
                (addOk ? "" : " (marketplace add returned non-zero; it may already be registered.)")
            : `claude plugin install failed (status ${installRes.status ?? "unknown"}). ` +
                `Ensure marketplace is registered: claude plugin marketplace add ${pluginDir} ` +
                `then: claude plugin install ${CLAUDE_NEOTOMA_PLUGIN_INSTALL_SPEC}` +
                (addOk ? "" : ` (marketplace add exited ${addRes.status ?? "unknown"})`),
          delegated_to: pluginDir,
          status: report.hooks,
        };
      }
    }

    const snippet = printSnippetOnly(opts.tool, repoRoot);
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
