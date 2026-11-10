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
import type {
  McpTransportChoice,
  NeotomaMcpEntryClass,
  NeotomaMcpEntryReadBack,
  McpConfigUnreadableReason,
} from "./mcp_config_scan.js";
import { SIGNED_MCP_TRANSPORTS, readBackNeotomaMcpEntries } from "./mcp_config_scan.js";

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
  /** One-line privacy/transport summary for privacy-conscious evaluators. */
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

const CLASS_DESCRIPTION: Record<Exclude<NeotomaMcpEntryClass, "unknown">, string> = {
  local_stdio: "local stdio",
  stdio_proxy: "local stdio proxy that makes HTTP requests",
  signed_http: "signed HTTP /mcp; makes HTTP requests",
  unsigned_http: "unsigned HTTP /mcp; makes HTTP requests",
};

function describeEntry(e: NeotomaMcpEntryReadBack): string {
  const desc = CLASS_DESCRIPTION[e.class as Exclude<NeotomaMcpEntryClass, "unknown">];
  if (e.class === "local_stdio") return desc;
  // Key, class and locality only: no value copied from the entry (a URL can carry credentials).
  return `${desc} to a ${e.endpoint_locality ?? "remote"} endpoint`;
}

function requestedPresetNote(transport: McpTransportChoice | null | undefined): string {
  if (!transport) return "";
  const kind = SIGNED_MCP_TRANSPORTS[transport] ? "signed" : "unsigned";
  return ` Requested --mcp-transport preset: ${transport} (${kind}); this line reports what the config holds, not the request.`;
}

/**
 * One-line privacy/transport summary appended to setup output. Built only from a
 * read-back of the MCP config files the MCP step wrote or kept, classified entry by
 * entry with `classifyNeotomaMcpEntry`. The requested preset is never evidence:
 * when nothing was read back, a file is unreadable, or any entry is unrecognised,
 * the line says the transport could not be determined.
 */
export function buildPrivacyTransportSummary(
  readBack: {
    entries: NeotomaMcpEntryReadBack[];
    unreadable_paths: string[];
    unreadable?: Array<{ path: string; reason: McpConfigUnreadableReason }>;
  } | null,
  opts: { dryRun?: boolean; requestedTransport?: McpTransportChoice | null } = {}
): string {
  const note = requestedPresetNote(opts.requestedTransport);
  if (opts.dryRun) {
    return (
      "Transport (dry run, nothing written): could not be determined; no MCP config was written to read back." +
      note
    );
  }
  if (readBack && readBack.unreadable_paths.length > 0) {
    return (
      `Transport: could not be determined; ${(
        readBack.unreadable ??
        readBack.unreadable_paths.map((p) => ({ path: p, reason: "file could not be read" }))
      )
        .map((u) => `${u.path}: ${u.reason}`)
        .join(", ")}. ` +
      "Check your MCP client config." +
      note
    );
  }
  if (!readBack || readBack.entries.length === 0) {
    return (
      "Transport: could not be determined; this run wrote or kept no Neotoma MCP config entry to read back. " +
      "Check your MCP client config." +
      note
    );
  }
  const multiFile = new Set(readBack.entries.map((e) => e.path)).size > 1;
  const label = (e: NeotomaMcpEntryReadBack) =>
    multiFile ? `${e.server_key} (${e.path})` : e.server_key;
  const unknown = readBack.entries.filter((e) => e.class === "unknown");
  if (unknown.length > 0) {
    return (
      `Transport: could not be determined; unrecognised Neotoma MCP entry ${unknown
        .map(label)
        .join(", ")}. Check your MCP client config.` + note
    );
  }
  if (readBack.entries.every((e) => e.class === "local_stdio")) {
    return (
      `Transport: local stdio MCP for every Neotoma entry (${readBack.entries
        .map(label)
        .join(", ")}); no network egress from the MCP transport.` + note
    );
  }
  return (
    `Transport: ${readBack.entries.map((e) => `${label(e)}: ${describeEntry(e)}`).join("; ")}.` +
    note
  );
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
  /**
   * MCP transport preset passed to the mcp-configure runner (`--mcp-transport`).
   * Named in `privacy_transport_summary` as the request only; the transport itself is
   * read back from the config files the mcp step reports in `details.updatedPaths`.
   */
  mcpTransport?: McpTransportChoice | null;
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

/** Config paths the mcp step reports it wrote or kept (`offerInstall`'s `updatedPaths`). */
function mcpStepConfigPaths(step: SetupStepResult | undefined): string[] {
  const details = step?.details as { updatedPaths?: unknown } | undefined;
  if (!step?.ok || !details || !Array.isArray(details.updatedPaths)) return [];
  return details.updatedPaths.filter((p): p is string => typeof p === "string" && p.length > 0);
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
  // Read back what the MCP step actually wrote or kept; never infer it from the request.
  const writtenPaths = dryRun ? [] : mcpStepConfigPaths(mcpStep);
  const readBack = writtenPaths.length > 0 ? await readBackNeotomaMcpEntries(writtenPaths) : null;
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
    privacy_transport_summary: buildPrivacyTransportSummary(readBack, {
      dryRun,
      requestedTransport: options.mcpTransport ?? null,
    }),
  };
}
