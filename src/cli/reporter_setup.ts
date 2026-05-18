/**
 * `neotoma reporter setup` — one-shot reporter onboarding command.
 *
 * Orchestrates the steps a new friction-reporter (tester / user agent) needs:
 *   1. Version check: warns when the installed Neotoma CLI is older than the
 *      minimum version required for stable issue reporting.
 *   2. Preflight: applies harness permission-file allowlist entries so agents
 *      can call `neotoma` without per-command approval prompts.
 *   3. Config write: persists default reporter fields (reporter_git_sha,
 *      reporter_app_version, default_visibility) to project-local
 *      `.neotoma/reporter.json` so subsequent `neotoma issues create` calls
 *      pick them up automatically.
 *   4. Smoke-test hint: prints a ready-to-run dry-run command the user can
 *      copy to verify the wiring.
 */

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

import type { ToolId } from "./doctor.js";
import { detectCurrentToolHint } from "./doctor.js";
import { runPreflight } from "./preflight.js";

/** Minimum neotoma version required for stable reporter usage. */
export const REPORTER_MIN_VERSION = "0.12.0";

/** Config file path relative to the project root (cwd). */
export const REPORTER_CONFIG_FILENAME = ".neotoma/reporter.json";

export interface ReporterConfig {
  reporter_git_sha?: string;
  reporter_app_version?: string;
  default_visibility?: "public" | "private";
}

export interface ReporterSetupStepResult {
  step: string;
  ok: boolean;
  skipped?: boolean;
  changed?: boolean;
  reason?: string;
  details?: unknown;
}

export interface ReporterSetupReport {
  tool: ToolId | null;
  dry_run: boolean;
  installed_version: string | null;
  version_ok: boolean;
  steps: ReporterSetupStepResult[];
  reporter_config: ReporterConfig;
  reporter_config_path: string;
  smoke_test_command: string;
  overall_ok: boolean;
  summary: string;
}

export interface RunReporterSetupOptions {
  tool?: string | ToolId | null;
  dryRun?: boolean;
  cwd?: string;
  /** Pre-supply git SHA; skips prompt when set. */
  gitSha?: string;
  /** Pre-supply app/CLI version; skips prompt when set. */
  appVersion?: string;
  /** Default visibility for submitted issues. */
  defaultVisibility?: "public" | "private";
  /** When true, emit a copy-paste env-var block instead of writing the file. */
  printBlock?: boolean;
}

/** Detect the installed neotoma version from the CLI binary. */
function detectInstalledVersion(): string | null {
  try {
    const out = execFileSync("neotoma", ["--version"], {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    // Output is typically "0.13.0" or "neotoma/0.13.0 node/v20.x.x"
    const match = /(\d+\.\d+\.\d+)/.exec(out);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Semver comparison: returns true when `installed` >= `required`. */
export function semverGte(installed: string, required: string): boolean {
  const parse = (v: string): [number, number, number] => {
    const parts = v.split(".").map((p) => parseInt(p, 10));
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  };
  const [ia, ib, ic] = parse(installed);
  const [ra, rb, rc] = parse(required);
  if (ia !== ra) return ia > ra;
  if (ib !== rb) return ib > rb;
  return ic >= rc;
}

/** Read existing reporter config, merging over defaults. */
export async function readReporterConfig(configPath: string): Promise<ReporterConfig> {
  try {
    const raw = await fs.readFile(configPath, "utf8");
    return JSON.parse(raw) as ReporterConfig;
  } catch {
    return {};
  }
}

/** Write reporter config JSON, creating the .neotoma/ directory if needed. */
export async function writeReporterConfig(
  configPath: string,
  config: ReporterConfig
): Promise<void> {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
}

/** Build the copy-paste env-var block for --print-block mode. */
export function buildEnvBlock(config: ReporterConfig, configPath: string): string {
  const lines: string[] = [
    "# Reporter environment variables (add to your shell profile or CI env):",
  ];
  if (config.reporter_git_sha) {
    lines.push(`export NEOTOMA_REPORTER_GIT_SHA="${config.reporter_git_sha}"`);
  }
  if (config.reporter_app_version) {
    lines.push(`export NEOTOMA_REPORTER_APP_VERSION="${config.reporter_app_version}"`);
  }
  if (config.default_visibility) {
    lines.push(`export NEOTOMA_REPORTER_DEFAULT_VISIBILITY="${config.default_visibility}"`);
  }
  lines.push("");
  lines.push(`# Or persist these to ${configPath} using: neotoma reporter setup`);
  return lines.join("\n");
}

export async function runReporterSetup(
  options: RunReporterSetupOptions = {}
): Promise<ReporterSetupReport> {
  const cwd = options.cwd ?? process.cwd();
  const dryRun = options.dryRun ?? false;
  const configPath = path.join(cwd, REPORTER_CONFIG_FILENAME);

  const steps: ReporterSetupStepResult[] = [];

  // ── Step 1: Version check ─────────────────────────────────────────────────
  const installedVersion = detectInstalledVersion();
  let versionOk = true;
  if (!installedVersion) {
    steps.push({
      step: "version_check",
      ok: false,
      reason: `Could not detect installed neotoma version. Install with: npm install -g neotoma`,
      details: { required: REPORTER_MIN_VERSION },
    });
    versionOk = false;
  } else if (!semverGte(installedVersion, REPORTER_MIN_VERSION)) {
    steps.push({
      step: "version_check",
      ok: false,
      reason: `Installed version ${installedVersion} is below minimum ${REPORTER_MIN_VERSION}. Upgrade with: npm install -g neotoma@latest`,
      details: { installed: installedVersion, required: REPORTER_MIN_VERSION },
    });
    versionOk = false;
  } else {
    steps.push({
      step: "version_check",
      ok: true,
      details: { installed: installedVersion, required: REPORTER_MIN_VERSION },
    });
  }

  // ── Step 2: Detect harness and run preflight ──────────────────────────────
  const toolInput = options.tool ?? detectCurrentToolHint(cwd);
  const tool: ToolId | null =
    typeof toolInput === "string" && toolInput.length > 0 ? (toolInput as ToolId) : null;

  if (!tool) {
    steps.push({
      step: "preflight",
      ok: false,
      skipped: false,
      reason:
        "Could not detect a harness automatically. Re-run with --tool <claude-code|cursor|codex|openclaw|claude-desktop>.",
    });
  } else {
    try {
      const preflightReport = await runPreflight({
        tool,
        apply: !dryRun,
        dryRun,
        cwd,
        scope: "both",
      });
      const changed = preflightReport.patches.some((p) => p.changed);
      steps.push({
        step: "preflight",
        ok: preflightReport.overall_ok,
        changed,
        skipped: preflightReport.already_ok,
        reason: preflightReport.already_ok
          ? "Permission entries already present."
          : changed
            ? `Applied ${preflightReport.patches.length} permission patch(es).`
            : undefined,
        details: { tool, patches: preflightReport.patches },
      });
    } catch (err) {
      steps.push({
        step: "preflight",
        ok: false,
        reason: (err as Error).message,
      });
    }
  }

  // ── Step 3: Write reporter config ─────────────────────────────────────────
  const existingConfig = await readReporterConfig(configPath);
  const newConfig: ReporterConfig = {
    ...existingConfig,
    ...(options.gitSha !== undefined ? { reporter_git_sha: options.gitSha || undefined } : {}),
    ...(options.appVersion !== undefined
      ? { reporter_app_version: options.appVersion || undefined }
      : {}),
    ...(options.defaultVisibility !== undefined
      ? { default_visibility: options.defaultVisibility }
      : {}),
  };

  // Remove undefined keys so JSON.stringify doesn't emit them.
  const cleanConfig: ReporterConfig = Object.fromEntries(
    Object.entries(newConfig).filter(([, v]) => v !== undefined)
  ) as ReporterConfig;

  const configChanged = JSON.stringify(cleanConfig) !== JSON.stringify(existingConfig);

  if (options.printBlock) {
    steps.push({
      step: "config_write",
      ok: true,
      skipped: true,
      reason: "--print-block mode: config not written; env-var block printed instead.",
      details: { config: cleanConfig },
    });
  } else if (dryRun) {
    steps.push({
      step: "config_write",
      ok: true,
      skipped: true,
      changed: configChanged,
      reason: `Dry run: would ${existsSync(configPath) ? "update" : "create"} ${configPath}`,
      details: { config: cleanConfig },
    });
  } else if (!configChanged && existsSync(configPath)) {
    steps.push({
      step: "config_write",
      ok: true,
      skipped: true,
      changed: false,
      reason: "Reporter config already up to date.",
      details: { config: cleanConfig },
    });
  } else {
    try {
      await writeReporterConfig(configPath, cleanConfig);
      steps.push({
        step: "config_write",
        ok: true,
        changed: configChanged,
        details: { config: cleanConfig, path: configPath },
      });
    } catch (err) {
      steps.push({
        step: "config_write",
        ok: false,
        reason: (err as Error).message,
      });
    }
  }

  // ── Build outputs ─────────────────────────────────────────────────────────
  const smokeTestCommand =
    'neotoma issues create --dry-run --title "test" --body "Reporter setup smoke test"';

  const overallOk = steps.every((s) => s.ok);

  const summaryParts: string[] = [
    `Reporter setup ${overallOk ? "complete" : "completed with issues"}.`,
    `Your agents in this project will file issues with:`,
  ];
  if (cleanConfig.reporter_git_sha) {
    summaryParts.push(`  git_sha=${cleanConfig.reporter_git_sha}`);
  }
  if (cleanConfig.reporter_app_version) {
    summaryParts.push(`  app_version=${cleanConfig.reporter_app_version}`);
  }
  if (cleanConfig.default_visibility) {
    summaryParts.push(`  default_visibility=${cleanConfig.default_visibility}`);
  }
  if (tool) {
    summaryParts.push(`  harness=${tool}`);
  }
  if (!overallOk) {
    summaryParts.push("");
    summaryParts.push("Issues to resolve:");
    for (const s of steps.filter((s) => !s.ok)) {
      summaryParts.push(`  [${s.step}] ${s.reason ?? "unknown error"}`);
    }
  }

  return {
    tool,
    dry_run: dryRun,
    installed_version: installedVersion,
    version_ok: versionOk,
    steps,
    reporter_config: cleanConfig,
    reporter_config_path: configPath,
    smoke_test_command: smokeTestCommand,
    overall_ok: overallOk,
    summary: summaryParts.join("\n"),
  };
}
