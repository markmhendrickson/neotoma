/**
 * MCP config scanning and installation for Neotoma CLI.
 * Scans cwd and subdirectories for MCP config files (Cursor, Claude Code, Windsurf, etc.),
 * detects dev/prod server configurations, and offers to install missing servers.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as readline from "node:readline";

import { CANDIDATE_API_PORTS } from "./config.js";
import { blackBox } from "./format.js";

/** Known MCP config file names to scan for (project-local). */
const CONFIG_FILENAMES = ["mcp.json", "mcp_config.json", "claude_desktop_config.json"] as const;

/** Project-relative config paths to check (e.g. .cursor/mcp.json, .mcp.json). */
const PROJECT_CONFIG_PATHS = [".cursor/mcp.json", ".mcp.json"] as const;

/** Codex uses TOML; path ends with config.toml and contains .codex. */
function isCodexConfigPath(filePath: string): boolean {
  const normalized = path.normalize(filePath);
  return normalized.includes(".codex") && normalized.endsWith("config.toml");
}

/**
 * Detect dev/prod Neotoma servers in Codex TOML (sections [mcp_servers.neotoma-dev] and [mcp_servers.neotoma-prod]).
 */
function detectNeotomaServersFromCodexToml(content: string): { hasDev: boolean; hasProd: boolean } {
  const hasDev = /\[mcp_servers\.neotoma-dev\]/m.test(content);
  const hasProd = /\[mcp_servers\.neotoma-prod\]/m.test(content);
  return { hasDev, hasProd };
}

/** Escape a string for TOML (basic quotes; multiline uses triple quotes). */
function escapeTomlString(s: string): string {
  if (s.includes('"') || s.includes("\n")) {
    return '"""' + s.replace(/\\/g, "\\\\").replace(/"""/g, '\\"""') + '"""';
  }
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

/** User-level Codex config path for current OS, or null if not applicable. */
function getUserLevelCodexConfigPath(): string | null {
  const platform = os.platform();
  const homedir = os.homedir();
  if (platform === "darwin" || platform === "linux") {
    return path.join(homedir, ".codex", "config.toml");
  }
  if (platform === "win32") {
    const appdata = process.env.APPDATA;
    return appdata ? path.join(appdata, "Codex", "config.toml") : null;
  }
  return null;
}

/**
 * Write neotoma-dev and neotoma-prod into user-level ~/.codex/config.toml so Codex sees them.
 * Replaces or appends the Neotoma marker block; leaves other user options intact.
 */
async function syncCodexUserConfig(repoRoot: string, sessionPorts?: SessionPorts): Promise<void> {
  const userPath = getUserLevelCodexConfigPath();
  if (!userPath) return;

  const entries = neotomaServerEntries(repoRoot, sessionPorts);
  const blocks: string[] = [];
  for (const [id, config] of Object.entries(entries)) {
    const lines = [
      `[mcp_servers.${id}]`,
      `command = ${escapeTomlString(config.command)}`,
      `cwd = ${escapeTomlString(repoRoot)}`,
    ];
    if (Array.isArray(config.args) && config.args.length) {
      lines.push(`args = [${config.args.map((a) => escapeTomlString(a)).join(", ")}]`);
    }
    if (config.env && Object.keys(config.env).length > 0) {
      lines.push(`[mcp_servers.${id}.env]`);
      for (const [k, v] of Object.entries(config.env)) {
        lines.push(`${k} = ${escapeTomlString(String(v))}`);
      }
    }
    blocks.push(lines.join("\n"));
  }

  const marker = "# --- Neotoma MCP servers (do not edit by hand) ---";
  const markerEnd = "# --- end Neotoma MCP servers ---";
  const newBlock = marker + "\n" + blocks.join("\n\n") + "\n" + markerEnd + "\n";

  let content = "";
  try {
    content = await fs.readFile(userPath, "utf-8");
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      await fs.mkdir(path.dirname(userPath), { recursive: true });
    } else {
      throw err;
    }
  }

  let out = content;
  if (out.includes(marker)) {
    out = out.replace(new RegExp(marker + "[\\s\\S]*?" + markerEnd, "m"), "").trimEnd();
  }
  if (out && !out.endsWith("\n")) out += "\n";
  out += "\n" + newBlock;

  await fs.writeFile(userPath, out);
}

/**
 * User-level MCP config paths by environment and OS.
 * Returns undefined if the path doesn't apply to current OS.
 */
function getUserLevelConfigPaths(): { env: string; path: string }[] {
  const platform = os.platform();
  const homedir = os.homedir();
  const paths: { env: string; path: string }[] = [];

  // Cursor
  paths.push({ env: "Cursor", path: path.join(homedir, ".cursor", "mcp.json") });

  // Claude Code
  if (platform === "darwin") {
    paths.push({
      env: "Claude Code",
      path: path.join(homedir, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
    });
  } else if (platform === "linux") {
    paths.push({
      env: "Claude Code",
      path: path.join(homedir, ".config", "Claude", "claude_desktop_config.json"),
    });
  } else if (platform === "win32") {
    const appdata = process.env.APPDATA;
    if (appdata) {
      paths.push({
        env: "Claude Code",
        path: path.join(appdata, "Claude", "claude_desktop_config.json"),
      });
    }
  }

  // Windsurf
  if (platform === "darwin" || platform === "linux") {
    paths.push({
      env: "Windsurf",
      path: path.join(homedir, ".codeium", "windsurf", "mcp_config.json"),
    });
  } else if (platform === "win32") {
    const appdata = process.env.APPDATA;
    if (appdata) {
      paths.push({
        env: "Windsurf",
        path: path.join(appdata, "Codeium", "Windsurf", "mcp_config.json"),
      });
    }
  }

  // Codex (OpenAI Codex; uses TOML)
  if (platform === "darwin" || platform === "linux") {
    paths.push({
      env: "Codex",
      path: path.join(homedir, ".codex", "config.toml"),
    });
  } else if (platform === "win32") {
    const appdata = process.env.APPDATA;
    if (appdata) {
      paths.push({
        env: "Codex",
        path: path.join(appdata, "Codex", "config.toml"),
      });
    }
  }

  return paths;
}

type McpConfig = {
  mcpServers?: Record<string, { command?: string; args?: string[]; url?: string; [key: string]: unknown }>;
};

/**
 * Parse MCP config file and return mcpServers object if valid, else null.
 */
export async function parseMcpConfig(filePath: string): Promise<McpConfig | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as McpConfig;
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    // Invalid or unreadable
  }
  return null;
}

/** Optional session ports from CLI; when set, URL-based entries must use these ports to count as configured. */
export type SessionPorts = { devPort?: number; prodPort?: number };

function portFromUrl(url: string): number | null {
  try {
    const u = new URL(url);
    const p = u.port ? parseInt(u.port, 10) : (u.protocol === "https:" ? 443 : 80);
    return Number.isFinite(p) ? p : null;
  } catch {
    return null;
  }
}

/**
 * Detect whether a given mcpServers object has dev and prod Neotoma servers configured.
 * When sessionPorts are provided, URL-based entries must use those ports; command-based (stdio) entries always count.
 */
export function detectNeotomaServers(
  mcpServers: Record<string, unknown> | undefined,
  sessionPorts?: SessionPorts
): { hasDev: boolean; hasProd: boolean } {
  if (!mcpServers || typeof mcpServers !== "object") {
    return { hasDev: false, hasProd: false };
  }

  const wantDevPort = sessionPorts?.devPort;
  const wantProdPort = sessionPorts?.prodPort;

  let hasDev = false;
  let hasProd = false;

  for (const config of Object.values(mcpServers)) {
    if (!config || typeof config !== "object") continue;
    const serverConfig = config as { command?: string; url?: string };

    const command = serverConfig.command || "";
    const url = serverConfig.url || "";

    const isDevCommand =
      command.includes("run_neotoma_mcp_stdio.sh") || command.includes("run_neotoma_mcp_stdio_dev_watch.sh");
    const isProdCommand =
      command.includes("run_neotoma_mcp_stdio_prod.sh") || command.includes("run_neotoma_mcp_stdio_prod_watch.sh");

    if (url) {
      const port = portFromUrl(url);
      const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
      const isFly = url.includes("neotoma.fly.dev/mcp");
      if (isLocal && url.includes("/mcp")) {
        if (wantDevPort != null) {
          if (port === wantDevPort) hasDev = true;
        } else if (port === 8080) {
          hasDev = true;
        }
        if (wantProdPort != null) {
          if (port === wantProdPort) hasProd = true;
        } else if (port === 8180) {
          hasProd = true;
        }
      }
      if (isFly) hasProd = true;
    }
    if (isDevCommand) hasDev = true;
    if (isProdCommand) hasProd = true;
  }

  return { hasDev, hasProd };
}

/**
 * Analyze MCP config for misconfigurations or suboptimal setup.
 * When in a local Neotoma repo, stdio is recommended over HTTP for local use.
 */
export function analyzeMcpConfigIssues(
  mcpServers: Record<string, unknown> | undefined,
  options: {
    sessionPorts?: SessionPorts;
    isLocalRepo?: boolean;
  }
): McpConfigIssue[] {
  const issues: McpConfigIssue[] = [];
  if (!mcpServers || typeof mcpServers !== "object") return issues;

  const { sessionPorts, isLocalRepo = true } = options;

  for (const [serverId, config] of Object.entries(mcpServers)) {
    if (!config || typeof config !== "object") continue;
    const serverConfig = config as { command?: string; url?: string };
    const url = serverConfig.url || "";
    const command = serverConfig.command || "";

    const isNeotoma =
      serverId.toLowerCase().includes("neotoma") ||
      command.includes("run_neotoma_mcp") ||
      (url.includes("localhost") && url.includes("/mcp"));

    if (!isNeotoma) continue;

    // Using HTTP locally when stdio is recommended (in local repo)
    if (url && (url.includes("localhost") || url.includes("127.0.0.1")) && isLocalRepo) {
      issues.push({
        type: "http_locally",
        serverId,
        description: `${serverId} uses HTTP locally; stdio is recommended for local development.`,
      });
    }

    // Port mismatch when session ports are set
    if (url && sessionPorts) {
      const port = portFromUrl(url);
      if (port != null) {
        const isDevLike = port === 8080 || port === sessionPorts.devPort;
        const isProdLike = port === 8180 || port === sessionPorts.prodPort;
        if (sessionPorts.devPort != null && isDevLike && port !== sessionPorts.devPort) {
          issues.push({
            type: "port_mismatch",
            serverId,
            expectedPort: sessionPorts.devPort,
            actualPort: port,
            description: `${serverId} uses port ${port} but CLI session uses dev port ${sessionPorts.devPort}.`,
          });
        } else if (sessionPorts.prodPort != null && isProdLike && port !== sessionPorts.prodPort) {
          issues.push({
            type: "port_mismatch",
            serverId,
            expectedPort: sessionPorts.prodPort,
            actualPort: port,
            description: `${serverId} uses port ${port} but CLI session uses prod port ${sessionPorts.prodPort}.`,
          });
        }
      }
    }
  }

  return issues;
}

/** Default API ports: prod 8180, dev 8080. Only add session port env when session uses a non-default port. */
const DEFAULT_PROD_PORT = CANDIDATE_API_PORTS[0];
const DEFAULT_DEV_PORT = CANDIDATE_API_PORTS[1];

/** Build a server entry for JSON: omit args and env when empty so mcp.json stays minimal. */
function serverEntry(
  command: string,
  args: string[] = [],
  env: Record<string, string> = {}
): { command: string; args?: string[]; env?: Record<string, string> } {
  const entry: { command: string; args?: string[]; env?: Record<string, string> } = { command };
  if (args.length > 0) entry.args = args;
  if (Object.keys(env).length > 0) entry.env = env;
  return entry;
}

/**
 * Generate neotoma-dev and neotoma-prod server entries with absolute script paths.
 * When sessionPorts are provided and differ from defaults (8080 dev, 8180 prod), env is set
 * so scripts use the same ports as the CLI session. Default ports are omitted so the MCP
 * process picks by NEOTOMA_ENV when both APIs are running.
 * Empty args and env are omitted so mcp.json is minimal.
 */
export function neotomaServerEntries(
  repoRoot: string,
  sessionPorts?: SessionPorts
): {
  "neotoma-dev": { command: string; args?: string[]; env?: Record<string, string> };
  "neotoma-prod": { command: string; args?: string[]; env?: Record<string, string> };
} {
  const devEnv: Record<string, string> =
    sessionPorts?.devPort != null && sessionPorts.devPort !== DEFAULT_DEV_PORT
      ? { NEOTOMA_SESSION_DEV_PORT: String(sessionPorts.devPort) }
      : {};
  const prodEnv: Record<string, string> =
    sessionPorts?.prodPort != null && sessionPorts.prodPort !== DEFAULT_PROD_PORT
      ? { NEOTOMA_SESSION_PROD_PORT: String(sessionPorts.prodPort) }
      : {};
  return {
    "neotoma-dev": serverEntry(
      path.join(repoRoot, "scripts", "run_neotoma_mcp_stdio.sh"),
      [],
      devEnv
    ),
    "neotoma-prod": serverEntry(
      path.join(repoRoot, "scripts", "run_neotoma_mcp_stdio_prod.sh"),
      [],
      prodEnv
    ),
  };
}

/**
 * Check if a file exists and is accessible.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Walk up from startDir to find project root (directory with .git, package.json, or .cursor).
 */
export async function getProjectRoot(startDir: string): Promise<string> {
  let current = startDir;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const hasGit = await fileExists(path.join(current, ".git"));
    const hasPkg = await fileExists(path.join(current, "package.json"));
    const hasCursor = await fileExists(path.join(current, ".cursor"));
    if (hasGit || hasPkg || hasCursor) return current;
    const parent = path.dirname(current);
    if (parent === current) return startDir;
    current = parent;
  }
}

/**
 * Find all MCP config paths starting from a root directory.
 * When userLevelFirst is true, checks user-level paths first; if any exist, returns only those (skips project-based).
 * Otherwise walks up to find project root, scans project-local paths, and optionally adds user-level paths.
 */
export async function findMcpConfigPaths(
  startDir: string,
  options?: { includeUserLevel?: boolean; userLevelFirst?: boolean; maxDepth?: number }
): Promise<string[]> {
  const includeUserLevel = options?.includeUserLevel ?? false;
  const userLevelFirst = options?.userLevelFirst ?? false;
  const maxDepth = options?.maxDepth ?? 2;
  const foundPaths: string[] = [];

  if (userLevelFirst) {
    for (const { path: userPath } of getUserLevelConfigPaths()) {
      if (await fileExists(userPath)) {
        const parsed = await parseMcpConfig(userPath);
        if (parsed || isCodexConfigPath(userPath)) foundPaths.push(userPath);
      }
    }
    if (foundPaths.length > 0) {
      return Array.from(new Set(foundPaths));
    }
  }

  const projectRoot = await getProjectRoot(startDir);

  // Check project-relative paths
  for (const relPath of PROJECT_CONFIG_PATHS) {
    const absPath = path.join(projectRoot, relPath);
    if (await fileExists(absPath)) {
      const parsed = await parseMcpConfig(absPath);
      if (parsed) foundPaths.push(absPath);
    }
  }

  // Scan subdirectories from startDir (shallow depth)
  await scanDirectory(startDir, 0, maxDepth, foundPaths);

  if (!userLevelFirst && includeUserLevel) {
    for (const { path: userPath } of getUserLevelConfigPaths()) {
      if (await fileExists(userPath)) {
        const parsed = await parseMcpConfig(userPath);
        if (parsed || isCodexConfigPath(userPath)) foundPaths.push(userPath);
      }
    }
  }

  // Deduplicate paths (normalize to resolve symlinks)
  const uniquePaths = new Set<string>();
  for (const p of foundPaths) {
    try {
      const real = await fs.realpath(p);
      uniquePaths.add(real);
    } catch {
      uniquePaths.add(p);
    }
  }

  return Array.from(uniquePaths);
}

/**
 * Recursively scan directory for MCP config files up to maxDepth.
 */
async function scanDirectory(dir: string, depth: number, maxDepth: number, foundPaths: string[]): Promise<void> {
  if (depth > maxDepth) return;

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip common directories that won't have MCP configs
      if (entry.isDirectory()) {
        const skipDirs = ["node_modules", ".git", "dist", "build", ".next", ".turbo", "coverage"];
        if (skipDirs.includes(entry.name)) continue;

        // Check for known config filenames in this directory
        for (const filename of CONFIG_FILENAMES) {
          const configPath = path.join(fullPath, filename);
          if (await fileExists(configPath)) {
            const parsed = await parseMcpConfig(configPath);
            if (parsed) foundPaths.push(configPath);
          }
        }

        // Recurse into subdirectory
        await scanDirectory(fullPath, depth + 1, maxDepth, foundPaths);
      } else if (entry.isFile()) {
        // Check if this file is a known config filename
        if (CONFIG_FILENAMES.includes(entry.name as (typeof CONFIG_FILENAMES)[number])) {
          const parsed = await parseMcpConfig(fullPath);
          if (parsed) foundPaths.push(fullPath);
        }
      }
    }
  } catch {
    // Skip directories we can't read
  }
}

/** Issue detected in MCP config (misconfiguration or suboptimal setup). */
export type McpConfigIssue =
  | { type: "http_locally"; serverId: string; description: string }
  | { type: "port_mismatch"; serverId: string; expectedPort: number; actualPort: number; description: string };

export type ConfigStatus = {
  path: string;
  hasDev: boolean;
  hasProd: boolean;
  /** Issues that suggest fixing (e.g. HTTP locally when stdio recommended, port mismatch). */
  issues?: McpConfigIssue[];
};

/**
 * Scan for MCP configs from cwd and return status for each found config.
 * When userLevelFirst is true, checks user-level config first and skips project-based if any user config exists.
 * When devPort/prodPort are set (e.g. from NEOTOMA_SESSION_*), URL-based entries must use those ports to count as configured.
 * When neotomaRepoRoot is provided, uses it for issue analysis and install; otherwise resolves from cwd.
 */
export async function scanForMcpConfigs(
  cwd: string,
  options?: {
    includeUserLevel?: boolean;
    userLevelFirst?: boolean;
    devPort?: number;
    prodPort?: number;
    neotomaRepoRoot?: string | null;
  }
): Promise<{ configs: ConfigStatus[]; repoRoot: string | null }> {
  const includeUserLevel = options?.includeUserLevel ?? false;
  const userLevelFirst = options?.userLevelFirst ?? false;
  const sessionPorts: SessionPorts | undefined =
    options?.devPort != null || options?.prodPort != null
      ? { devPort: options.devPort, prodPort: options.prodPort }
      : undefined;
  const configPaths = await findMcpConfigPaths(cwd, {
    includeUserLevel: includeUserLevel || userLevelFirst,
    userLevelFirst,
    maxDepth: 2,
  });

  let repoRoot: string | null;
  if (options?.neotomaRepoRoot !== undefined) {
    repoRoot = options.neotomaRepoRoot;
  } else {
    repoRoot = null;
    try {
      const { findRepoRoot } = await import("./index.js");
      repoRoot = await findRepoRoot(cwd);
    } catch {
      // If findRepoRoot is not available, leave null
    }
  }

  const configs: ConfigStatus[] = [];

  for (const configPath of configPaths) {
    if (isCodexConfigPath(configPath)) {
      try {
        const content = await fs.readFile(configPath, "utf-8");
        const { hasDev, hasProd } = detectNeotomaServersFromCodexToml(content);
        configs.push({ path: configPath, hasDev, hasProd });
      } catch {
        // Unreadable; skip
      }
      continue;
    }

    const parsed = await parseMcpConfig(configPath);
    if (parsed) {
      const { hasDev, hasProd } = detectNeotomaServers(parsed.mcpServers, sessionPorts);
      const isLocalRepo = !!repoRoot && configPath.startsWith(repoRoot);
      const issues = analyzeMcpConfigIssues(parsed.mcpServers, {
        sessionPorts,
        isLocalRepo,
      });
      configs.push({ path: configPath, hasDev, hasProd, issues: issues.length ? issues : undefined });
    }
  }

  return { configs, repoRoot };
}

/**
 * Prompt user for yes/no input. In a TTY, a single y/n keypress submits immediately
 * and is echoed once; otherwise uses readline (e.g. for non-interactive or tests).
 */
async function promptYesNo(question: string): Promise<boolean> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    const rl = readline.createInterface({
      input: stdin,
      output: process.stdout,
    });
    return new Promise<boolean>((resolve) => {
      rl.question(`${question} (y/n): `, (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes");
      });
    });
  }

  return new Promise<boolean>((resolve) => {
    process.stdout.write(`${question} (y/n): `);
    const wasPaused = stdin.isPaused();
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    function done(value: boolean): void {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      if (wasPaused) stdin.pause();
      process.stdout.write("\n");
      resolve(value);
    }

    function onData(key: string | Buffer): void {
      const k = typeof key === "string" ? key : key.toString("utf8");
      if (k === "\u0003") {
        done(false);
        return;
      }
      const lower = k.toLowerCase();
      if (lower === "y") {
        done(true);
        return;
      }
      if (lower === "n" || lower === "\r" || lower === "\n") {
        done(false);
        return;
      }
    }

    stdin.once("data", onData);
  });
}

/**
 * Prompt user to choose user-level or project-level config. Returns "user", "project", or null if cancelled.
 */
async function promptUserOrProject(question: string): Promise<"user" | "project" | null> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<"user" | "project" | null>((resolve) => {
    rl.question(`${question} `, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (a === "u" || a === "user") {
        resolve("user");
      } else if (a === "p" || a === "project") {
        resolve("project");
      } else {
        resolve(null);
      }
    });
  });
}

/** Rewrite localhost MCP URL to use the given port. */
function rewriteMcpUrlToPort(url: string, port: number): string {
  try {
    const u = new URL(url);
    u.port = String(port);
    return u.toString();
  } catch {
    return url;
  }
}

/** Ensure all localhost/127.0.0.1 MCP URLs in mcpServers use session ports when provided. */
function applySessionPortsToUrls(
  mcpServers: Record<string, { command?: string; url?: string; [key: string]: unknown }>,
  sessionPorts?: SessionPorts
): void {
  if (!sessionPorts?.devPort && !sessionPorts?.prodPort) return;
  for (const config of Object.values(mcpServers)) {
    if (!config?.url || typeof config.url !== "string") continue;
    const u = config.url;
    if (!u.includes("/mcp") || (!u.includes("localhost") && !u.includes("127.0.0.1"))) continue;
    const port = portFromUrl(u);
    if (port == null) continue;
    if (sessionPorts.devPort != null && port === 8080) {
      config.url = rewriteMcpUrlToPort(u, sessionPorts.devPort);
    } else if (sessionPorts.prodPort != null && port === 8180) {
      config.url = rewriteMcpUrlToPort(u, sessionPorts.prodPort);
    }
  }
}

/**
 * Convert HTTP-based neotoma entries to stdio in mcpServers.
 * Identifies dev (port 8080 or session dev) and prod (port 8180 or session prod) by port.
 */
function convertHttpToStdio(
  mcpServers: Record<string, { command?: string; url?: string; [key: string]: unknown }>,
  repoRoot: string,
  sessionPorts?: SessionPorts
): boolean {
  let changed = false;
  const entries = neotomaServerEntries(repoRoot, sessionPorts);

  for (const [serverId, config] of Object.entries(mcpServers)) {
    if (!config?.url || typeof config.url !== "string") continue;
    const u = config.url;
    if (!u.includes("localhost") && !u.includes("127.0.0.1")) continue;
    if (!u.includes("/mcp")) continue;

    const port = portFromUrl(u);
    if (port == null) continue;

    const isDev = port === 8080 || port === sessionPorts?.devPort;
    const isProd = port === 8180 || port === sessionPorts?.prodPort;

    if (isDev) {
      mcpServers[serverId] = entries["neotoma-dev"];
      changed = true;
    } else if (isProd) {
      mcpServers[serverId] = entries["neotoma-prod"];
      changed = true;
    }
  }

  return changed;
}

/**
 * Run sync:mcp from repo root to propagate config to .mcp.json and .codex.
 */
async function runSyncMcp(repoRoot: string): Promise<void> {
  try {
    const { execSync } = await import("node:child_process");
    execSync("npm run sync:mcp", {
      cwd: repoRoot,
      stdio: "pipe",
    });
  } catch {
    // Non-fatal; config was written
  }
}

/**
 * Attempt to trigger Cursor to reload MCP config after file changes.
 * Cursor may watch mcp.json and reload on change; if not, user must reload manually.
 */
async function attemptCursorMcpReload(configPath: string): Promise<void> {
  // Touching the file can help trigger file watchers
  try {
    const stats = await fs.stat(configPath);
    await fs.utimes(configPath, stats.atime, new Date());
  } catch {
    // Ignore
  }
}

/**
 * Offer to fix misconfigured MCP configs (HTTP locally, port mismatch).
 * Returns true if user accepted and changes were applied.
 */
export async function offerFix(
  configs: ConfigStatus[],
  repoRoot: string | null,
  options?: { silent?: boolean; devPort?: number; prodPort?: number }
): Promise<{ fixed: boolean; message: string; updatedPaths: string[] }> {
  const silent = options?.silent ?? false;
  const sessionPorts: SessionPorts | undefined =
    options?.devPort != null || options?.prodPort != null
      ? { devPort: options.devPort, prodPort: options.prodPort }
      : undefined;

  const configsWithIssues = configs.filter((c) => c.issues && c.issues.length > 0);
  if (configsWithIssues.length === 0) {
    return { fixed: false, message: "No misconfigurations detected.", updatedPaths: [] };
  }

  if (!repoRoot) {
    return {
      fixed: false,
      message: "Cannot fix: Neotoma repo root not found. Run from Neotoma repo.",
      updatedPaths: [],
    };
  }

  if (silent) {
    return {
      fixed: false,
      message: "Misconfigurations detected. Run 'neotoma mcp check' to fix.",
      updatedPaths: [],
    };
  }

  // Summarize issues
  process.stdout.write("\nMCP configuration issues:\n");
  for (const config of configsWithIssues) {
    process.stdout.write(`  ${config.path}\n`);
    for (const issue of config.issues || []) {
      const desc =
        issue.type === "http_locally"
          ? issue.description
          : issue.type === "port_mismatch"
            ? `${issue.description} (expected ${issue.expectedPort}, got ${issue.actualPort})`
            : (issue as McpConfigIssue).description;
      process.stdout.write(`    - ${desc}\n`);
    }
  }
  process.stdout.write("\n");

  const shouldFix = await promptYesNo(
    "Fix these issues? (Convert HTTP to stdio for local use, align ports with CLI session)"
  );
  if (!shouldFix) {
    return { fixed: false, message: "Fix cancelled.", updatedPaths: [] };
  }

  const updatedPaths: string[] = [];

  for (const config of configsWithIssues) {
    const parsed = await parseMcpConfig(config.path);
    if (!parsed?.mcpServers) continue;

    let changed = false;

    // Convert HTTP to stdio where applicable
    const hadHttpLocally = (config.issues || []).some((i) => i.type === "http_locally");
    if (hadHttpLocally) {
      changed = convertHttpToStdio(parsed.mcpServers, repoRoot, sessionPorts) || changed;
    }

    // Fix port mismatch for remaining URL entries
    if (sessionPorts) {
      const before = JSON.stringify(parsed.mcpServers);
      applySessionPortsToUrls(parsed.mcpServers, sessionPorts);
      if (JSON.stringify(parsed.mcpServers) !== before) changed = true;
    }

    if (changed) {
      await fs.writeFile(config.path, JSON.stringify(parsed, null, 2) + "\n");
      updatedPaths.push(config.path);
    }
  }

  if (updatedPaths.length > 0 && repoRoot) {
    await runSyncMcp(repoRoot);
    for (const p of updatedPaths) {
      if (p.includes(".cursor/mcp.json")) await attemptCursorMcpReload(p);
    }
    return {
      fixed: true,
      message: `Fixed ${updatedPaths.length} config file(s): ${updatedPaths.join(", ")}`,
      updatedPaths,
    };
  }

  return { fixed: false, message: "No changes applied.", updatedPaths: [] };
}

/**
 * Offer to install missing dev/prod servers into found configs or create new configs.
 * When sessionPorts are provided, new entries get env set and existing URL-based entries are rewritten to use those ports.
 * Also offers to fix misconfigurations (HTTP locally, port mismatch) before or instead of adding missing servers.
 */
/** MCP config status box title (for width alignment). */
export const MCP_STATUS_BOX_TITLE = " MCP config status ";

/** Return lines for MCP status box (for computing shared box width). */
export function getMcpStatusBoxLines(configs: ConfigStatus[]): string[] {
  const lines: string[] = [];
  for (const config of configs) {
    const devStatus = config.hasDev ? "✓" : "✗";
    const prodStatus = config.hasProd ? "✓" : "✗";
    lines.push(config.path);
    lines.push(`  Dev:  ${devStatus}  Prod: ${prodStatus}`);
  }
  return lines;
}

/** Format MCP config status as a box (for display below intro). */
export function formatMcpStatusBox(
  configs: ConfigStatus[],
  sessionBoxWidth?: number
): string {
  const boxLines = getMcpStatusBoxLines(configs);
  return blackBox(boxLines, {
    title: MCP_STATUS_BOX_TITLE,
    borderColor: "cyan",
    padding: 1,
    sessionBoxWidth,
  });
}

export async function offerInstall(
  configs: ConfigStatus[],
  repoRoot: string | null,
  options?: {
    silent?: boolean;
    devPort?: number;
    prodPort?: number;
    cwd?: string;
    /** When true, skip printing the status box (caller already showed it below intro). */
    boxAlreadyShown?: boolean;
    /** When set, only consider and install the server for this env (e.g. on CLI session start). */
    currentEnv?: "dev" | "prod";
  }
): Promise<{ installed: boolean; message: string }> {
  const silent = options?.silent ?? false;
  const cwd = options?.cwd ?? process.cwd();
  const currentEnv = options?.currentEnv;
  const sessionPorts: SessionPorts | undefined =
    options?.devPort != null || options?.prodPort != null
      ? { devPort: options.devPort, prodPort: options.prodPort }
      : undefined;

  if (!repoRoot) {
    const message =
      "Cannot install: Neotoma repo root not found. Run from Neotoma repo or set NEOTOMA_REPO_ROOT.";
    if (!silent) process.stderr.write(message + "\n");
    return { installed: false, message };
  }

  const configsWithIssues = configs.filter((c) => c.issues && c.issues.length > 0);
  const missingConfigs = currentEnv
    ? configs.filter((c) => (currentEnv === "dev" ? !c.hasDev : !c.hasProd))
    : configs.filter((c) => !c.hasDev || !c.hasProd);

  // First offer to fix misconfigurations if any
  if (configsWithIssues.length > 0 && !silent) {
    const fixResult = await offerFix(configs, repoRoot, {
      silent: false,
      devPort: options?.devPort,
      prodPort: options?.prodPort,
    });
    if (fixResult.fixed) {
      process.stdout.write("Fixed: " + fixResult.message + "\n");
      if (process.stdout.isTTY) {
        process.stdout.write(
          "If Cursor is open, toggle the MCP server or run Developer: Reload Window for changes to take effect.\n"
        );
      }
      // Re-scan to see if we still need to add missing servers
      const { configs: rescanned } = await scanForMcpConfigs(process.cwd(), {
        includeUserLevel: true,
        userLevelFirst: true,
        devPort: options?.devPort,
        prodPort: options?.prodPort,
      });
      const stillMissing = currentEnv
        ? rescanned.filter((c) => (currentEnv === "dev" ? !c.hasDev : !c.hasProd))
        : rescanned.filter((c) => !c.hasDev || !c.hasProd);
      if (stillMissing.length === 0) {
        return { installed: true, message: fixResult.message };
      }
      // Fall through to offer adding missing
      missingConfigs.length = 0;
      missingConfigs.push(...stillMissing);
    } else if (missingConfigs.length === 0) {
      // User declined fix; no missing servers (only had misconfig)
      return { installed: false, message: "No changes made." };
    }
  }

  if (missingConfigs.length === 0) {
    const message = currentEnv
      ? `${currentEnv === "dev" ? "Dev" : "Prod"} Neotoma server is already configured.`
      : "Dev and prod Neotoma servers are already configured.";
    if (!silent) process.stdout.write(message + "\n");
    return { installed: false, message };
  }

  // If no configs found at all, ask user-level vs project-level then create
  if (configs.length === 0) {
    if (silent) {
      return {
        installed: false,
        message: "No MCP config files found. Run 'neotoma mcp check' to create one.",
      };
    }

    process.stdout.write("No MCP config files found.\n");
    const choice = await promptUserOrProject(
      "Create user-level (~/.cursor/mcp.json) or project-level (.cursor/mcp.json in current project)? (u/p)"
    );
    if (choice === null) {
      return { installed: false, message: "Installation cancelled." };
    }

    const cursorDir =
      choice === "user"
        ? path.join(os.homedir(), ".cursor")
        : path.join(await getProjectRoot(cwd), ".cursor");
    const configPath = path.join(cursorDir, "mcp.json");

    await fs.mkdir(cursorDir, { recursive: true });
    const entries = neotomaServerEntries(repoRoot, sessionPorts);
    const mcpServers =
      currentEnv === "dev"
        ? { "neotoma-dev": entries["neotoma-dev"] }
        : currentEnv === "prod"
          ? { "neotoma-prod": entries["neotoma-prod"] }
          : entries;
    const newConfig = { mcpServers };
    await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2) + "\n");

    if (choice === "project" && configPath.startsWith(repoRoot)) {
      await runSyncMcp(repoRoot);
    }
    await attemptCursorMcpReload(configPath);

    if (process.stdout.isTTY) {
      process.stdout.write(
        "If Cursor is open, toggle the MCP server or run Developer: Reload Window for changes to take effect.\n"
      );
    }

    const createdMsg = currentEnv
      ? `Created ${configPath} with ${currentEnv} server.`
      : `Created ${configPath} with dev and prod servers.`;
    return { installed: true, message: createdMsg };
  }

  // Offer to update existing configs
  if (silent) {
    const msg = currentEnv
      ? `Missing ${currentEnv} server. Run 'neotoma mcp check' to add it.`
      : "Missing dev or prod servers. Run 'neotoma mcp check' to add them.";
    return { installed: false, message: msg };
  }

  const boxAlreadyShown = options?.boxAlreadyShown ?? false;
  if (!boxAlreadyShown) {
    process.stdout.write("\n" + formatMcpStatusBox(configs) + "\n");
  }

  const installPrompt = currentEnv
    ? `Add missing Neotoma ${currentEnv} server to these config files?`
    : "Add missing Neotoma servers to these config files?";
  const shouldInstall = await promptYesNo(installPrompt);
  if (!shouldInstall) {
    return { installed: false, message: "Installation cancelled." };
  }

  const entries = neotomaServerEntries(repoRoot, sessionPorts);
  const updatedPaths: string[] = [];
  const missingCodexOnly = missingConfigs.every((c) => isCodexConfigPath(c.path));

  for (const config of missingConfigs) {
    if (isCodexConfigPath(config.path)) continue; // Codex uses TOML; updated via sync:mcp from .cursor/mcp.json
    const parsed = await parseMcpConfig(config.path);
    if (!parsed) continue;

    if (!parsed.mcpServers) parsed.mcpServers = {};

    // Apply session ports to any existing URL-based entries so config uses CLI ports
    applySessionPortsToUrls(parsed.mcpServers, sessionPorts);

    // Add missing servers (only current env when currentEnv is set)
    if (!currentEnv || currentEnv === "dev") {
      if (!config.hasDev) {
        parsed.mcpServers["neotoma-dev"] = entries["neotoma-dev"];
      }
    }
    if (!currentEnv || currentEnv === "prod") {
      if (!config.hasProd) {
        parsed.mcpServers["neotoma-prod"] = entries["neotoma-prod"];
      }
    }

    // Write back
    await fs.writeFile(config.path, JSON.stringify(parsed, null, 2) + "\n");
    updatedPaths.push(config.path);
  }

  // When session ports are set, fix URL ports in all configs so existing URL entries use CLI ports
  if (sessionPorts) {
    for (const config of configs) {
      if (updatedPaths.includes(config.path)) continue; // already written above
      const parsed = await parseMcpConfig(config.path);
      if (!parsed?.mcpServers) continue;
      const before = JSON.stringify(parsed.mcpServers);
      applySessionPortsToUrls(parsed.mcpServers, sessionPorts);
      if (JSON.stringify(parsed.mcpServers) !== before) {
        await fs.writeFile(config.path, JSON.stringify(parsed, null, 2) + "\n");
        updatedPaths.push(config.path);
      }
    }
  }

  // If only Codex was missing, update user-level ~/.codex/config.toml and project .codex via sync:mcp
  if (repoRoot && missingCodexOnly && updatedPaths.length === 0) {
    await syncCodexUserConfig(repoRoot, sessionPorts);
    await runSyncMcp(repoRoot);
    const codexPath = getUserLevelCodexConfigPath();
    return {
      installed: true,
      message: codexPath
        ? `Updated ${codexPath} and project .codex/config.toml. Restart Codex or reload config for changes to take effect.`
        : "Updated project .codex/config.toml (npm run sync:mcp). Restart Codex or reload config for changes to take effect.",
    };
  }

  if (repoRoot && updatedPaths.length > 0) {
    await runSyncMcp(repoRoot);
    for (const p of updatedPaths) {
      if (p.includes(".cursor/mcp.json")) await attemptCursorMcpReload(p);
    }
  }

  if (process.stdout.isTTY && updatedPaths.length > 0) {
    process.stdout.write(
      "If Cursor is open, toggle the MCP server or run Developer: Reload Window for changes to take effect.\n"
    );
  }

  return {
    installed: true,
    message: `Updated ${updatedPaths.length} config file(s): ${updatedPaths.join(", ")}`,
  };
}
