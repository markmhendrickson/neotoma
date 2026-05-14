/**
 * `neotoma setup` — composite onboarding command.
 *
 * Collapses `init --yes --idempotent`, `mcp config`,
 * `cli config`, hooks/plugin install, and permission-file writes into one
 * agent-runnable call so harnesses only need wildcard approval for
 * `neotoma *` to complete the full install-first flow.
 *
 * Read-only guidance stays under `mcp guide` and `cli guide`.
 */

import { existsSync, mkdirSync, symlinkSync, readlinkSync, unlinkSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import type { ToolId } from "./doctor.js";
import { runDoctor } from "./doctor.js";
import { runHooksInstall } from "./hooks.js";
import { toHookHarness } from "./hooks_detect.js";
import type { PermissionPatch } from "./permissions.js";
import { writePermissionsForTool, toolFromString } from "./permissions.js";

export interface SetupStepResult {
  id: string;
  ok: boolean;
  changed: boolean;
  skipped?: boolean;
  reason?: string;
  details?: unknown;
}

export interface SetupReport {
  tool: ToolId | null;
  dry_run: boolean;
  steps: SetupStepResult[];
  permission_patches: PermissionPatch[];
  doctor_before: Awaited<ReturnType<typeof runDoctor>>;
  doctor_after: Awaited<ReturnType<typeof runDoctor>>;
  overall_ok: boolean;
}

export interface RunSetupOptions {
  tool?: string | ToolId | null;
  dryRun?: boolean;
  yes?: boolean;
  cwd?: string;
  /** Skip permissions patching; useful for openclaw which uses a native plugin. */
  skipPermissions?: boolean;
  /** Permission scope for tools that expose project+user files. */
  scope?: "project" | "user" | "both";
  /** Skip lifecycle hook/plugin installation. */
  skipHooks?: boolean;
  /** Skip skills installation into the harness. */
  skipSkills?: boolean;
  /** Install skills at project level or user level. */
  skillsScope?: "project" | "user";
  /** Injected runners to keep setup pure + testable. */
  runners?: {
    init?: () => Promise<SetupStepResult>;
    mcpConfigure?: () => Promise<SetupStepResult>;
    cliInstructionsConfigure?: () => Promise<SetupStepResult>;
    hooksInstall?: () => Promise<SetupStepResult>;
  };
}

/**
 * Map a ToolId to the harness skills directory.
 * "user" scope uses the home-directory path; "project" uses cwd.
 */
function getSkillsTarget(tool: ToolId, cwd: string, scope: "project" | "user"): string | null {
  const harnessMap: Partial<Record<ToolId, { dir: string }>> = {
    cursor:          { dir: ".cursor/skills" },
    "claude-code":   { dir: ".claude/skills" },
    "claude-desktop": { dir: ".claude/skills" },
    codex:           { dir: ".codex/skills" },
    openclaw:        { dir: ".openclaw/skills" },
    // MCP-only tools: no skills directory; setup writes MCP config only.
    windsurf:        undefined,
    continue:        undefined,
    vscode:          undefined,
  };
  const entry = harnessMap[tool];
  if (!entry) return null;
  const base = scope === "user" ? homedir() : cwd;
  return join(base, entry.dir);
}

/**
 * Resolve the `skills/` directory from the installed npm package.
 * Works whether the CLI is running from a global install or a local checkout.
 */
function getPublishedSkillsSource(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const packageRoot = resolve(dirname(thisFile), "..", "..");
  return join(packageRoot, "skills");
}

/**
 * Symlink each published skill into the harness skills directory.
 * Idempotent: skips skills that already point to the correct source.
 */
function installSkills(tool: ToolId, cwd: string, scope: "project" | "user"): SetupStepResult {
  const targetDir = getSkillsTarget(tool, cwd, scope);
  if (!targetDir) {
    return { id: "skills", ok: true, changed: false, skipped: true, reason: `tool ${tool} has no skills directory` };
  }

  const sourceDir = getPublishedSkillsSource();
  if (!existsSync(sourceDir)) {
    return { id: "skills", ok: true, changed: false, skipped: true, reason: "no published skills directory found" };
  }

  let entries: string[];
  try {
    entries = readdirSync(sourceDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return { id: "skills", ok: false, changed: false, reason: "failed to read skills source directory" };
  }

  if (entries.length === 0) {
    return { id: "skills", ok: true, changed: false, skipped: true, reason: "no skills to install" };
  }

  mkdirSync(targetDir, { recursive: true });

  let changed = false;
  const installed: string[] = [];
  for (const name of entries) {
    const src = join(sourceDir, name);
    const dst = join(targetDir, name);
    try {
      if (existsSync(dst)) {
        try {
          const current = readlinkSync(dst);
          if (resolve(current) === resolve(src)) continue;
        } catch {
          // dst exists but is not a symlink — skip to avoid overwriting user content
          continue;
        }
        unlinkSync(dst);
      }
      symlinkSync(src, dst, "junction");
      changed = true;
      installed.push(name);
    } catch {
      // non-fatal: individual skill link failure
    }
  }

  return {
    id: "skills",
    ok: true,
    changed,
    details: { installed, target: targetDir, source: sourceDir },
  };
}

export async function runSetup(options: RunSetupOptions = {}): Promise<SetupReport> {
  const cwd = options.cwd ?? process.cwd();
  const dryRun = options.dryRun ?? false;
  const doctorBefore = await runDoctor({ cwd });
  let currentDoctor = doctorBefore;

  const toolInput = typeof options.tool === "string" ? toolFromString(options.tool) : (options.tool ?? null);
  const tool: ToolId | null = toolInput ?? doctorBefore.current_tool_hint;

  const steps: SetupStepResult[] = [];

  // Step 1: init (idempotent)
  if (options.runners?.init) {
    steps.push(await options.runners.init());
    if (!dryRun) currentDoctor = await runDoctor({ cwd });
  } else if (currentDoctor.data.initialized) {
    steps.push({ id: "init", ok: true, changed: false, skipped: true, reason: "already-initialized" });
  } else if (dryRun) {
    steps.push({ id: "init", ok: true, changed: true, skipped: true, reason: "dry-run" });
  } else {
    steps.push({ id: "init", ok: false, changed: false, skipped: true, reason: "runner-not-provided" });
  }

  // Step 2: mcp configure
  if (options.runners?.mcpConfigure) {
    steps.push(await options.runners.mcpConfigure());
    if (!dryRun) currentDoctor = await runDoctor({ cwd });
  } else {
    const hasMcp = Object.values(currentDoctor.mcp_servers_detected).some((c) => c.has_neotoma || c.has_neotoma_dev);
    if (hasMcp) {
      steps.push({ id: "mcp-configure", ok: true, changed: false, skipped: true, reason: "already-configured" });
    } else if (dryRun) {
      steps.push({ id: "mcp-configure", ok: true, changed: true, skipped: true, reason: "dry-run" });
    } else {
      steps.push({ id: "mcp-configure", ok: false, changed: false, skipped: true, reason: "runner-not-provided" });
    }
  }

  const existingMcp = Object.values(currentDoctor.mcp_servers_detected).some((c) => c.has_neotoma || c.has_neotoma_dev);
  const mcpStep = steps.find((s) => s.id === "mcp-configure");
  const mcpConfigured = existingMcp || Boolean(mcpStep?.ok && !mcpStep.skipped);

  // Step 3: CLI instructions configure
  if (options.runners?.cliInstructionsConfigure) {
    steps.push(await options.runners.cliInstructionsConfigure());
    if (!dryRun) currentDoctor = await runDoctor({ cwd });
  } else {
    const ci = currentDoctor.cli_instructions;
    const hasAny =
      ci.project.cursor ||
      ci.project.claude ||
      ci.project.codex ||
      ci.user.cursor ||
      ci.user.claude ||
      ci.user.codex;
    if (hasAny) {
      steps.push({ id: "cli-instructions", ok: true, changed: false, skipped: true, reason: "already-configured" });
    } else if (dryRun) {
      steps.push({ id: "cli-instructions", ok: true, changed: true, skipped: true, reason: "dry-run" });
    } else {
      steps.push({ id: "cli-instructions", ok: false, changed: false, skipped: true, reason: "runner-not-provided" });
    }
  }

  // Step 4: lifecycle hooks. MCP config is the signal that the harness should
  // also get its reliability-floor hooks where the harness supports them.
  if (options.runners?.hooksInstall) {
    steps.push(await options.runners.hooksInstall());
  } else if (options.skipHooks) {
    steps.push({
      id: "hooks",
      ok: true,
      changed: false,
      skipped: true,
      reason: "skip-hooks",
    });
  } else {
    const hookHarness = tool ? toHookHarness(tool) : null;
    if (!hookHarness) {
      steps.push({
        id: "hooks",
        ok: true,
        changed: false,
        skipped: true,
        reason: tool ? `tool ${tool} does not support lifecycle hooks` : "tool not specified",
      });
    } else if (!mcpConfigured) {
      steps.push({
        id: "hooks",
        ok: true,
        changed: false,
        skipped: true,
        reason: "mcp-not-configured",
      });
    } else if (currentDoctor.hooks.installed[hookHarness]?.present) {
      steps.push({
        id: "hooks",
        ok: true,
        changed: false,
        skipped: true,
        reason: "already-installed",
      });
    } else if (dryRun) {
      steps.push({ id: "hooks", ok: true, changed: true, skipped: true, reason: "dry-run" });
    } else if (!currentDoctor.data.initialized) {
      steps.push({
        id: "hooks",
        ok: true,
        changed: false,
        skipped: true,
        reason: "data-not-initialized",
      });
    } else {
      const result = await runHooksInstall({
        tool: hookHarness,
        cwd,
        dryRun: false,
        yes: true,
        force: false,
      });
      steps.push({
        id: "hooks",
        ok: result.ok,
        changed: result.ok && !result.message.includes("already installed"),
        details: {
          message: result.message,
          delegated_to: result.delegated_to,
        },
      });
    }
  }

  // Step 5: install published skills into the harness
  if (options.skipSkills) {
    steps.push({ id: "skills", ok: true, changed: false, skipped: true, reason: "skip-skills" });
  } else if (!tool) {
    steps.push({ id: "skills", ok: true, changed: false, skipped: true, reason: "tool not specified" });
  } else if (dryRun) {
    steps.push({ id: "skills", ok: true, changed: true, skipped: true, reason: "dry-run" });
  } else {
    steps.push(installSkills(tool, cwd, options.skillsScope ?? "user"));
  }

  // Step 6: permission patches
  const permissionPatches: PermissionPatch[] = [];
  if (tool && !options.skipPermissions && tool !== "openclaw" && tool !== "claude-desktop") {
    // claude-code defaults to "both" so the neotoma wildcard allow lands in
    // both the project-scoped settings.local.json and the user-scoped
    // settings.json. The user-level entry makes the allow available across
    // all projects, not just the one where setup was run.
    const defaultScope = tool === "claude-code" ? "both" : "project";
    const patches = await writePermissionsForTool(tool, cwd, {
      dryRun,
      scope: options.scope ?? defaultScope,
    });
    permissionPatches.push(...patches);
    steps.push({
      id: "permissions",
      ok: true,
      changed: patches.some((p) => p.changed),
      details: patches.map((p) => ({ path: p.path, changed: p.changed, created: p.created })),
    });
  } else {
    steps.push({
      id: "permissions",
      ok: true,
      changed: false,
      skipped: true,
      reason: tool ? `tool ${tool} does not expose an allowlist file` : "tool not specified",
    });
  }

  const doctorAfter = dryRun ? doctorBefore : await runDoctor({ cwd });
  const overall = steps.every((s) => s.ok);

  return {
    tool,
    dry_run: dryRun,
    steps,
    permission_patches: permissionPatches,
    doctor_before: doctorBefore,
    doctor_after: doctorAfter,
    overall_ok: overall,
  };
}
