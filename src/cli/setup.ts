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

import type { ToolId } from "./doctor.js";
import { runDoctor } from "./doctor.js";
import { mirrorToHarness } from "./skills_mirror.js";
import { runHooksInstall } from "./hooks.js";
import { toHookHarness } from "./hooks_detect.js";
import type { PermissionPatch } from "./permissions.js";
import { writePermissionsForTool, toolFromString } from "./permissions.js";
import {
  type McpTransportChoice,
  type McpWrittenEntry,
} from "./mcp_config_scan.js";

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
  /** Canonical single-line install confirmation. Agents grep for this to confirm install succeeded. */
  verify_line: string;
  /**
   * One-line transport summary describing only the Neotoma MCP entries this run wrote;
   * other entries are reported as not checked.
   */
  privacy_transport_summary: string;
}

/**
 * Compose the canonical install-verification line that agent harnesses grep for.
 * Format: `Neotoma installed at <path> (resolved via <manager>; v<version>; data_dir=<dir>; mcp=<transport>)`
 *
 * When the binary is not yet on PATH (e.g. a version-manager shell mismatch),
 * uses the global_bin path from the package root so the line is still emitted.
 */
export function buildVerifyLine(doctor: Awaited<ReturnType<typeof runDoctor>>): string {
  const bin =
    doctor.neotoma.which_neotoma ??
    doctor.neotoma.global_bin ??
    "(not found on PATH — see path_fix_hint)";
  const via = doctor.neotoma.resolved_via ?? "unknown";
  const ver = doctor.neotoma.version ? `v${doctor.neotoma.version}` : "vunknown";
  const dataDir = doctor.data.data_dir;
  // MCP transport: infer from detected MCP server configs whether a signed/http proxy is in use.
  const hasMcpConfig = Object.values(doctor.mcp_servers_detected).some(
    (c) => c.has_neotoma || c.has_neotoma_dev
  );
  const mcpLabel = hasMcpConfig ? "stdio" : "stdio (not yet configured)";
  return `Neotoma installed at ${bin} (resolved via ${via}; ${ver}; data_dir=${dataDir}; mcp=${mcpLabel})`;
}

const MCP_PRESET_DESCRIPTION: Record<McpTransportChoice, string> = {
  a: "preset a: local signing proxy command forwarding to a signed HTTP MCP endpoint",
  b: "preset b: local command that may forward MCP requests to a local Neotoma HTTP endpoint",
  c: "preset c: local stdio command with no URL; this entry makes no network requests",
  d: "preset d: local signing proxy command forwarding to a signed HTTP MCP endpoint, with the dev entry pointed at the prod endpoint",
  e: "preset e: local signing proxy command forwarding to a signed HTTP MCP endpoint, discovered from the local prod port file",
};

/**
 * Plain-language description of what one preset's generated entries do (no URL, path or command).
 * Only preset `c` (local stdio, no URL) may say it makes no network requests; a test pins
 * that for every other preset, so this never throws during a user's setup run.
 */
export function describeWrittenMcpTransport(transport: McpTransportChoice): string {
  return MCP_PRESET_DESCRIPTION[transport];
}

export const NO_MCP_ENTRY_WRITTEN_SUMMARY =
  "Transport: This line describes no Neotoma MCP entry, because this run recorded no new one. Any existing entries, including any setup repaired or re-pointed to a new port, were not checked.";

export const OTHER_MCP_ENTRIES_NOT_CHECKED =
  "Any other Neotoma entries in your MCP config, including any setup repaired or re-pointed to a new port, are not described here and were not checked.";

/**
 * One-line transport summary built only from the entries this run generated and wrote.
 * It never reads existing configs back, and never prints a URL, host, port, path,
 * command, argument or environment value.
 */
export function buildPrivacyTransportSummary(written: McpWrittenEntry[] | undefined): string {
  const seen = new Set<string>();
  const clauses: string[] = [];
  for (const entry of written ?? []) {
    const key = `${entry.server_key}\u0000${entry.transport}`;
    if (seen.has(key)) continue;
    seen.add(key);
    clauses.push(`${entry.server_key} (${describeWrittenMcpTransport(entry.transport)})`);
  }
  if (clauses.length === 0) return NO_MCP_ENTRY_WRITTEN_SUMMARY;
  // Setup may also have repaired or re-ported other entries (offerFix,
  // applySessionPortsToUrls); those are not recorded here, so the line states only
  // that they were not checked, never that they were unchanged.
  return `Transport: this run wrote ${clauses.join("; ")}. ${OTHER_MCP_ENTRIES_NOT_CHECKED}`;
}

function isMcpTransportChoice(value: unknown): value is McpTransportChoice {
  return value === "a" || value === "b" || value === "c" || value === "d" || value === "e";
}

/** Read `written` from the MCP step's details; anything malformed counts as nothing written. */
export function writtenEntriesFromMcpStep(
  step: SetupStepResult | undefined
): McpWrittenEntry[] | undefined {
  if (!step || !step.ok || step.skipped) return undefined;
  const details = step.details as { written?: unknown } | undefined;
  if (!details || !Array.isArray(details.written)) return undefined;
  const out: McpWrittenEntry[] = [];
  for (const item of details.written) {
    const candidate = item as { server_key?: unknown; transport?: unknown } | null;
    if (
      !candidate ||
      typeof candidate.server_key !== "string" ||
      !isMcpTransportChoice(candidate.transport)
    ) {
      return undefined;
    }
    out.push({ server_key: candidate.server_key, transport: candidate.transport });
  }
  return out;
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
 * Install published skills into the harness skills directory.
 *
 * Delegates to the shared {@link mirrorToHarness} reconciler so `neotoma setup`
 * and the continuous `neotoma skills sync` mirror use one code path: a whole-
 * directory symlink when safe, falling back to per-skill symlinks when the
 * target already holds foreign content.
 */
function installSkills(tool: ToolId, cwd: string, scope: "project" | "user"): SetupStepResult {
  const result = mirrorToHarness(tool, { cwd, scope });
  return {
    id: "skills",
    ok: true,
    changed: result.changed,
    skipped: result.skipped,
    reason: result.reason,
    details: {
      target: result.target,
      mode: result.mode,
      base_present: result.base_present,
      linked: result.linked,
    },
  };
}

export async function runSetup(options: RunSetupOptions = {}): Promise<SetupReport> {
  const cwd = options.cwd ?? process.cwd();
  const dryRun = options.dryRun ?? false;
  const doctorBefore = await runDoctor({ cwd });
  let currentDoctor = doctorBefore;

  const toolInput =
    typeof options.tool === "string" ? toolFromString(options.tool) : (options.tool ?? null);
  const tool: ToolId | null = toolInput ?? doctorBefore.current_tool_hint;

  const steps: SetupStepResult[] = [];

  // Step 1: init (idempotent)
  if (options.runners?.init) {
    steps.push(await options.runners.init());
    if (!dryRun) currentDoctor = await runDoctor({ cwd });
  } else if (currentDoctor.data.initialized) {
    steps.push({
      id: "init",
      ok: true,
      changed: false,
      skipped: true,
      reason: "already-initialized",
    });
  } else if (dryRun) {
    steps.push({ id: "init", ok: true, changed: true, skipped: true, reason: "dry-run" });
  } else {
    steps.push({
      id: "init",
      ok: false,
      changed: false,
      skipped: true,
      reason: "runner-not-provided",
    });
  }

  // Step 2: mcp configure
  if (options.runners?.mcpConfigure) {
    steps.push(await options.runners.mcpConfigure());
    if (!dryRun) currentDoctor = await runDoctor({ cwd });
  } else {
    const hasMcp = Object.values(currentDoctor.mcp_servers_detected).some(
      (c) => c.has_neotoma || c.has_neotoma_dev
    );
    if (hasMcp) {
      steps.push({
        id: "mcp-configure",
        ok: true,
        changed: false,
        skipped: true,
        reason: "already-configured",
      });
    } else if (dryRun) {
      steps.push({
        id: "mcp-configure",
        ok: true,
        changed: true,
        skipped: true,
        reason: "dry-run",
      });
    } else {
      steps.push({
        id: "mcp-configure",
        ok: false,
        changed: false,
        skipped: true,
        reason: "runner-not-provided",
      });
    }
  }

  const existingMcp = Object.values(currentDoctor.mcp_servers_detected).some(
    (c) => c.has_neotoma || c.has_neotoma_dev
  );
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
      steps.push({
        id: "cli-instructions",
        ok: true,
        changed: false,
        skipped: true,
        reason: "already-configured",
      });
    } else if (dryRun) {
      steps.push({
        id: "cli-instructions",
        ok: true,
        changed: true,
        skipped: true,
        reason: "dry-run",
      });
    } else {
      steps.push({
        id: "cli-instructions",
        ok: false,
        changed: false,
        skipped: true,
        reason: "runner-not-provided",
      });
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
    steps.push({
      id: "skills",
      ok: true,
      changed: false,
      skipped: true,
      reason: "tool not specified",
    });
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
    verify_line: buildVerifyLine(doctorAfter),
    privacy_transport_summary: buildPrivacyTransportSummary(
      dryRun ? undefined : writtenEntriesFromMcpStep(mcpStep)
    ),
  };
}
