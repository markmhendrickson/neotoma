import { spawn } from "node:child_process";
import { runDoctor } from "./doctor.js";
import { runHooksInstall } from "./hooks.js";
import {
  configureCliInstructions,
  configureMcpServers,
  type HarnessInstallScope,
  type HarnessMcpEnv,
} from "./harness_configure.js";
import {
  inferHookHarnessesFromMcpConfigs,
  scanForMcpConfigs,
  type McpTransportChoice,
} from "./mcp_config_scan.js";
import type { RunSetupOptions, SetupStepResult } from "./setup.js";

export interface DefaultSetupRunnerOptions {
  cwd: string;
  dryRun?: boolean;
  yes?: boolean;
  installScope?: HarnessInstallScope;
  mcpEnv?: HarnessMcpEnv;
  mcpTransport?: McpTransportChoice;
  rewriteExistingNeotoma?: boolean;
  skipHooks?: boolean;
  allHarnesses?: boolean;
}

function runInitSubprocess(cwd: string): Promise<SetupStepResult> {
  const entry = process.argv[1];
  if (!entry) {
    return Promise.resolve({
      id: "init",
      ok: false,
      changed: false,
      skipped: true,
      reason: "cli-entrypoint-unavailable",
    });
  }

  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [entry, "init", "--yes", "--idempotent", "--configure-mcp", "no", "--configure-cli", "no"],
      { cwd, stdio: ["ignore", "pipe", "pipe"] }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      resolve({
        id: "init",
        ok: code === 0,
        changed: code === 0,
        reason: code === 0 ? undefined : "init-subprocess-failed",
        details: {
          exit_code: code,
          stdout: stdout.trim().slice(0, 2000),
          stderr: stderr.trim().slice(0, 2000),
        },
      });
    });
    child.on("error", (error) => {
      resolve({
        id: "init",
        ok: false,
        changed: false,
        reason: "init-subprocess-error",
        details: { message: error.message },
      });
    });
  });
}

export function createDefaultSetupRunners(
  options: DefaultSetupRunnerOptions
): NonNullable<RunSetupOptions["runners"]> {
  const cwd = options.cwd;
  const installScope = options.installScope ?? "project";
  const dryRun = options.dryRun ?? false;

  const runners: NonNullable<RunSetupOptions["runners"]> = {
    init: async () => {
      const doctor = await runDoctor({ cwd });
      if (doctor.data.initialized) {
        return { id: "init", ok: true, changed: false, skipped: true, reason: "already-initialized" };
      }
      if (dryRun) {
        return { id: "init", ok: true, changed: true, skipped: true, reason: "dry-run" };
      }
      return runInitSubprocess(cwd);
    },
    mcpConfigure: async () => {
      if (dryRun) {
        return { id: "mcp-configure", ok: true, changed: true, skipped: true, reason: "dry-run" };
      }
      const result = await configureMcpServers({
        cwd,
        autoInstallScope: installScope,
        autoInstallEnv: options.mcpEnv ?? "both",
        mcpTransport: options.mcpTransport,
        assumeYes: options.yes,
        rewriteExistingNeotoma: options.rewriteExistingNeotoma,
      });
      return {
        id: "mcp-configure",
        ok: true,
        changed: result.installed,
        skipped: !result.installed,
        reason: result.installed ? undefined : "already-configured",
        details: result,
      };
    },
    cliInstructionsConfigure: async () => {
      if (dryRun) {
        return { id: "cli-instructions", ok: true, changed: true, skipped: true, reason: "dry-run" };
      }
      const result = await configureCliInstructions({ cwd, scope: installScope });
      return {
        id: "cli-instructions",
        ok: true,
        changed: result.added.length > 0,
        skipped: result.added.length === 0,
        reason: result.added.length === 0 ? "already-configured" : undefined,
        details: result,
      };
    },
  };

  if (options.skipHooks) {
    runners.hooksInstall = async () => ({
      id: "hooks",
      ok: true,
      changed: false,
      skipped: true,
      reason: "skip-hooks",
    });
  } else if (options.allHarnesses) {
    runners.hooksInstall = async () => {
      if (dryRun) {
        return { id: "hooks", ok: true, changed: true, skipped: true, reason: "dry-run" };
      }
      const { configs } = await scanForMcpConfigs(cwd, { includeUserLevel: true, userLevelFirst: false });
      const harnesses = inferHookHarnessesFromMcpConfigs(configs);
      if (harnesses.length === 0) {
        return {
          id: "hooks",
          ok: true,
          changed: false,
          skipped: true,
          reason: "no-hook-capable-mcp-configs",
        };
      }
      const results = [];
      for (const tool of harnesses) {
        results.push(await runHooksInstall({ tool, cwd, dryRun: false, yes: Boolean(options.yes), force: false }));
      }
      return {
        id: "hooks",
        ok: results.every((r) => r.ok),
        changed: results.some((r) => r.ok && !r.message.includes("already installed")),
        details: { results },
      };
    };
  }

  return runners;
}
