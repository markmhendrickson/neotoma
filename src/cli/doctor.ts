/**
 * `neotoma doctor` — consolidated diagnostics for agent-led onboarding.
 *
 * Returns a single machine-readable snapshot covering install/runtime/API/MCP/
 * CLI instructions/permission-file state so agents do not improvise with shell
 * introspection (python3, grep, ls, cat, jq, find, which, node -e).
 */

import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import type { Config } from "./config.js";
import { discoverApiInstances } from "./config.js";
import {
  detectHooks,
  toHookHarness,
  type HooksReport,
  type HookHarnessId,
} from "./hooks_detect.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Tool identifiers used across commands. */
export type ToolId = "claude-code" | "claude-desktop" | "cursor" | "codex" | "openclaw";

/** How the `neotoma` binary was located (if at all). */
export type ResolvedVia = "mise" | "nvm" | "fnm" | "npm" | "path" | "unknown";

/** Per-tool permission-file status. */
export interface PermissionFileStatus {
  path: string | null;
  exists: boolean;
  has_neotoma_allow: boolean;
  has_npm_install_allow: boolean;
}

/** Canonical markdown mirror state surfaced to activation. */
export interface MirrorReport {
  /** Whether mirror write-through is currently enabled. */
  enabled: boolean;
  /** Resolved absolute path of the mirror root. */
  path: string;
  /** True when the mirror path sits inside a git repo. */
  inside_git_repo: boolean;
  /** Absolute path of the enclosing git repo, or null when `inside_git_repo` is false. */
  git_repo_root: string | null;
  /** True when `<git_repo_root>/.gitignore` already ignores the mirror directory. */
  gitignored: boolean;
  /**
   * Activation may offer the mirror iff it is not already enabled. Prior
   * declines are tracked at the agent level (stored as a `user_preference`
   * during activation), not in doctor.
   */
  eligible_for_offer: boolean;
}

/** Consolidated doctor snapshot. */
export interface DoctorReport {
  neotoma: {
    installed: boolean;
    version: string | null;
    neotoma_on_path: boolean;
    node_on_path: boolean;
    resolved_via: ResolvedVia;
    which_neotoma: string | null;
    global_bin: string | null;
    global_package_dir: string | null;
    npm_global_root: string | null;
    path_fix_hint: string | null;
  };
  data: {
    config_dir: string;
    data_dir: string;
    db_exists: boolean;
    initialized: boolean;
  };
  api: {
    running: boolean;
    env: "dev" | "prod" | null;
    port: number | null;
    pid: number | null;
    base_url: string | null;
  };
  mcp_servers_detected: Record<string, { path: string | null; has_neotoma: boolean; has_neotoma_dev: boolean }>;
  cli_instructions: {
    project: { cursor: boolean; claude: boolean; codex: boolean };
    user: { cursor: boolean; claude: boolean; codex: boolean };
  };
  permission_files: Record<string, PermissionFileStatus>;
  current_tool_hint: ToolId | null;
  hooks: HooksReport;
  mirror: MirrorReport;
  suggested_next_step:
    | "install"
    | "init"
    | "configure-mcp"
    | "configure-cli-instructions"
    | "configure-permissions"
    | "activate"
    | "offer-hooks"
    | "offer-mirror"
    | "ready";
}

function safeExec(cmd: string, args: string[]): string | null {
  try {
    const out = execFileSync(cmd, args, { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" });
    return out.trim() || null;
  } catch {
    return null;
  }
}

/** Resolve the neotoma binary and detect which shell-manager owns node (mise/nvm/fnm). */
function detectRuntime(): Pick<DoctorReport["neotoma"],
  "neotoma_on_path" | "node_on_path" | "resolved_via" | "which_neotoma" | "global_bin" | "npm_global_root" | "global_package_dir" | "path_fix_hint"> {
  const whichNeotoma = safeExec("which", ["neotoma"]);
  const whichNode = safeExec("which", ["node"]);
  const npmPrefix = safeExec("npm", ["prefix", "-g"]);
  const npmRoot = npmPrefix ? path.join(npmPrefix, "lib", "node_modules") : null;
  const globalBin = npmPrefix ? path.join(npmPrefix, "bin", "neotoma") : null;
  const globalPkgDir = npmRoot ? path.join(npmRoot, "neotoma") : null;
  const globalPkgExists = globalPkgDir ? existsSync(globalPkgDir) : false;

  // Detect resolved_via from the which-neotoma path
  let resolvedVia: ResolvedVia = "unknown";
  if (whichNeotoma) {
    if (whichNeotoma.includes("/.local/share/mise/") || whichNeotoma.includes("/.mise/")) {
      resolvedVia = "mise";
    } else if (whichNeotoma.includes("/.nvm/")) {
      resolvedVia = "nvm";
    } else if (whichNeotoma.includes("/.fnm/") || whichNeotoma.includes("/fnm/")) {
      resolvedVia = "fnm";
    } else if (whichNeotoma.includes("/node_modules/") || (globalBin && path.resolve(whichNeotoma) === path.resolve(globalBin))) {
      resolvedVia = "npm";
    } else {
      resolvedVia = "path";
    }
  }

  // Compute hint when `which neotoma` fails but the global package exists (typical mise/nvm PATH mismatch).
  let pathFixHint: string | null = null;
  if (!whichNeotoma && globalPkgExists) {
    if (npmPrefix && npmPrefix.includes("/mise/")) {
      pathFixHint = `Run \`eval "$(mise activate zsh)"\` in this shell (or restart the terminal) so your agent shell finds the \`neotoma\` binary at ${globalBin ?? "the global npm bin"}.`;
    } else if (npmPrefix && npmPrefix.includes("/.nvm/")) {
      pathFixHint = `Your Node version manager (nvm) installed neotoma at ${globalBin}. Ensure your non-interactive shell sources nvm (e.g. add \`source "$NVM_DIR/nvm.sh"\` to ~/.zshenv).`;
    } else {
      pathFixHint = `\`neotoma\` is not on PATH but exists at ${globalBin ?? globalPkgDir}. Add the containing directory to PATH or re-run \`npm install -g neotoma\` from this shell.`;
    }
  } else if (!whichNeotoma && !globalPkgExists) {
    pathFixHint = "Run `npm install -g neotoma` to install the CLI globally.";
  }

  return {
    neotoma_on_path: Boolean(whichNeotoma),
    node_on_path: Boolean(whichNode),
    resolved_via: resolvedVia,
    which_neotoma: whichNeotoma,
    global_bin: globalBin,
    npm_global_root: npmRoot,
    global_package_dir: globalPkgExists ? globalPkgDir : null,
    path_fix_hint: pathFixHint,
  };
}

function readVersionFromPackageJson(pkgPath: string): string | null {
  try {
    const raw = readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

/** Detect the neotoma version from global package.json or local install. */
function detectVersion(globalPkgDir: string | null): string | null {
  if (globalPkgDir) {
    const v = readVersionFromPackageJson(path.join(globalPkgDir, "package.json"));
    if (v) return v;
  }
  // Fallback: package.json adjacent to current module (dev checkout)
  try {
    const here = path.resolve(path.join(__dirname, "..", "..", "package.json"));
    const v = readVersionFromPackageJson(here);
    if (v) return v;
  } catch {
    // ignore
  }
  return null;
}

/** Heuristically detect which agent harness invoked the CLI (for `current_tool_hint`). */
function detectCurrentToolHint(cwd: string): ToolId | null {
  const env = process.env;
  if (env.CLAUDE_CODE_ENTRYPOINT || env.CLAUDECODE) return "claude-code";
  if (env.CURSOR_AGENT || env.CURSOR_TRACE_ID || env.CURSOR_IDE) return "cursor";
  if (env.OPENAI_CODEX_BUILD || env.CODEX_HOME) return "codex";
  if (env.OPENCLAW_SESSION || env.OPENCLAW_CWD) return "openclaw";
  // Second-best: directory-level markers.
  try {
    if (existsSync(path.join(cwd, ".claude"))) return "claude-code";
    if (existsSync(path.join(cwd, ".cursor"))) return "cursor";
    if (existsSync(path.join(cwd, ".codex"))) return "codex";
  } catch {
    // ignore
  }
  return null;
}

/** Check a Claude Code permission file for neotoma wildcard allow entries. */
async function readClaudePermissions(filePath: string): Promise<PermissionFileStatus> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as { permissions?: { allow?: string[] } };
    const allow = parsed.permissions?.allow ?? [];
    return {
      path: filePath,
      exists: true,
      has_neotoma_allow: allow.some((s) => /^Bash\(neotoma:\*?\)$/.test(s) || s === "Bash(neotoma:*)"),
      has_npm_install_allow: allow.some((s) => /npm\s+install\s+-g\s+neotoma/.test(s)),
    };
  } catch {
    return { path: filePath, exists: false, has_neotoma_allow: false, has_npm_install_allow: false };
  }
}

/** Check a Cursor allowlist JSON file (or legacy path) for neotoma entries. */
async function readCursorAllowlist(projectRoot: string): Promise<PermissionFileStatus> {
  const candidate = path.join(projectRoot, ".cursor", "allowlist.json");
  try {
    const raw = await fs.readFile(candidate, "utf8");
    const parsed = JSON.parse(raw) as { allow?: string[] };
    const allow = parsed.allow ?? [];
    return {
      path: candidate,
      exists: true,
      has_neotoma_allow: allow.some((s) => /neotoma/.test(s)),
      has_npm_install_allow: allow.some((s) => /npm\s+install\s+-g\s+neotoma/.test(s)),
    };
  } catch {
    return { path: candidate, exists: false, has_neotoma_allow: false, has_npm_install_allow: false };
  }
}

/** Check Codex config.toml for neotoma approval entries. */
async function readCodexApprovals(): Promise<PermissionFileStatus> {
  const home = os.homedir();
  const candidate = path.join(home, ".codex", "config.toml");
  try {
    const raw = await fs.readFile(candidate, "utf8");
    const hasNeotoma = /neotoma/i.test(raw) && /\[approvals?\]/.test(raw);
    const hasNpmAllow = /npm\s+install\s+-g\s+neotoma/.test(raw);
    return {
      path: candidate,
      exists: true,
      has_neotoma_allow: hasNeotoma,
      has_npm_install_allow: hasNpmAllow,
    };
  } catch {
    return { path: candidate, exists: false, has_neotoma_allow: false, has_npm_install_allow: false };
  }
}

/** Suggest the next step based on consolidated state. */
function suggestNextStep(report: Omit<DoctorReport, "suggested_next_step">): DoctorReport["suggested_next_step"] {
  if (!report.neotoma.installed) return "install";
  if (!report.data.initialized) return "init";
  const mcpConfigured = Object.values(report.mcp_servers_detected).some((c) => c.has_neotoma || c.has_neotoma_dev);
  if (!mcpConfigured) return "configure-mcp";
  const cliInstr = report.cli_instructions;
  const hasAnyCliInstr =
    cliInstr.project.cursor ||
    cliInstr.project.claude ||
    cliInstr.project.codex ||
    cliInstr.user.cursor ||
    cliInstr.user.claude ||
    cliInstr.user.codex;
  if (!hasAnyCliInstr) return "configure-cli-instructions";
  const hasPerms = Object.values(report.permission_files).some((p) => p.has_neotoma_allow);
  if (!hasPerms && report.current_tool_hint && report.current_tool_hint !== "openclaw") {
    return "configure-permissions";
  }
  if (!report.api.running) return "activate";
  if (report.hooks.eligible_for_offer) return "offer-hooks";
  if (report.mirror.eligible_for_offer) return "offer-mirror";
  return "ready";
}

/** Build the mirror block for the doctor report. */
async function detectMirror(): Promise<MirrorReport> {
  try {
    const { getMirrorConfig } = await import("../services/canonical_mirror.js");
    const { checkMirrorGitignoreStatus } = await import(
      "./commands/mirror.js"
    );
    const cfg = getMirrorConfig();
    const gitignore = checkMirrorGitignoreStatus(cfg);
    return {
      enabled: cfg.enabled,
      path: path.resolve(cfg.path),
      inside_git_repo: gitignore.inside_git_repo,
      git_repo_root: gitignore.git_repo_root,
      gitignored: gitignore.gitignored,
      eligible_for_offer: !cfg.enabled,
    };
  } catch {
    // Never let mirror detection break doctor.
    return {
      enabled: false,
      path: "",
      inside_git_repo: false,
      git_repo_root: null,
      gitignored: false,
      eligible_for_offer: false,
    };
  }
}

export interface RunDoctorOptions {
  cwd?: string;
  /** Optional config override (used by tests). */
  config?: Config;
}

export async function runDoctor(opts: RunDoctorOptions = {}): Promise<DoctorReport> {
  const cwd = opts.cwd ?? process.cwd();
  const runtime = detectRuntime();
  const version = detectVersion(runtime.global_package_dir);
  const installed = runtime.neotoma_on_path || runtime.global_package_dir !== null;

  // Data/init status
  const configDir = path.join(os.homedir(), ".config", "neotoma");
  const dataDir = process.env.NEOTOMA_DATA_DIR ?? path.join(os.homedir(), "neotoma", "data");
  const dbCandidates = [path.join(dataDir, "neotoma.db"), path.join(dataDir, "neotoma.prod.db")];
  const dbExists = dbCandidates.some((p) => existsSync(p));
  const initialized = dbExists && existsSync(configDir);

  // API running?
  let apiRunning = false;
  let apiEnv: "dev" | "prod" | null = null;
  let apiPort: number | null = null;
  const apiPid: number | null = null;
  let apiBaseUrl: string | null = null;
  try {
    const instances = await discoverApiInstances({ config: opts.config });
    const first = instances.find((i) => i.healthy) ?? instances[0];
    if (first) {
      apiRunning = Boolean(first.healthy);
      apiEnv = first.envHint === "dev" ? "dev" : first.envHint === "prod" ? "prod" : null;
      apiPort = first.port ?? null;
      apiBaseUrl = first.url ?? null;
    }
  } catch {
    // ignore discovery errors
  }

  // MCP server detection
  const mcpServersDetected: DoctorReport["mcp_servers_detected"] = {};
  try {
    const { scanForMcpConfigs } = await import("./mcp_config_scan.js");
    const { configs } = await scanForMcpConfigs(cwd, { includeUserLevel: true });
    for (const c of configs) {
      const id = inferMcpToolId(c.path);
      mcpServersDetected[id] = {
        path: c.path,
        has_neotoma: c.hasProd,
        has_neotoma_dev: c.hasDev,
      };
    }
  } catch {
    // leave empty
  }

  // CLI instructions
  let cliInstructions: DoctorReport["cli_instructions"] = {
    project: { cursor: false, claude: false, codex: false },
    user: { cursor: false, claude: false, codex: false },
  };
  try {
    const { scanAgentInstructions } = await import("./agent_instructions_scan.js");
    const res = await scanAgentInstructions(cwd, { includeUserLevel: true });
    cliInstructions = {
      project: {
        cursor: res.appliedProject.cursor,
        claude: res.appliedProject.claude,
        codex: res.appliedProject.codex,
      },
      user: {
        cursor: res.appliedUser.cursor,
        claude: res.appliedUser.claude,
        codex: res.appliedUser.codex,
      },
    };
  } catch {
    // leave defaults
  }

  // Permission files
  const permissionFiles: DoctorReport["permission_files"] = {
    claude_code_project: await readClaudePermissions(path.join(cwd, ".claude", "settings.local.json")),
    claude_code_user: await readClaudePermissions(path.join(os.homedir(), ".claude", "settings.json")),
    cursor_project: await readCursorAllowlist(cwd),
    codex_user: await readCodexApprovals(),
  };

  const currentToolHint = detectCurrentToolHint(cwd);

  // Hooks detection. `toHookHarness` filters out tools without hook support
  // (e.g. claude-desktop, openclaw) so eligibility never triggers on them.
  const mcpConfigured = Object.values(mcpServersDetected).some(
    (c) => c.has_neotoma || c.has_neotoma_dev
  );
  const currentHookHarness: HookHarnessId | null = toHookHarness(currentToolHint);
  const hooks = await detectHooks({
    cwd,
    currentTool: currentHookHarness,
    mcpConfigured,
  });

  const mirror = await detectMirror();

  const partial: Omit<DoctorReport, "suggested_next_step"> = {
    neotoma: {
      installed,
      version,
      ...runtime,
    },
    data: {
      config_dir: configDir,
      data_dir: dataDir,
      db_exists: dbExists,
      initialized,
    },
    api: {
      running: apiRunning,
      env: apiEnv,
      port: apiPort,
      pid: apiPid,
      base_url: apiBaseUrl,
    },
    mcp_servers_detected: mcpServersDetected,
    cli_instructions: cliInstructions,
    permission_files: permissionFiles,
    current_tool_hint: currentToolHint,
    hooks,
    mirror,
  };

  return { ...partial, suggested_next_step: suggestNextStep(partial) };
}

function inferMcpToolId(filePath: string): string {
  const n = filePath.toLowerCase();
  if (n.includes(".cursor")) return "cursor";
  if (n.includes("claude_desktop")) return "claude_desktop";
  if (n.includes(".claude")) return "claude_code";
  if (n.includes(".codex")) return "codex";
  return path.basename(filePath);
}
