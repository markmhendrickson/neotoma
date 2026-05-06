/**
 * MCP config scanning and installation for Neotoma CLI.
 * Scans cwd and subdirectories for MCP config files (Cursor, Claude Code, Windsurf, etc.),
 * detects dev/prod server configurations, and offers to install missing servers.
 */

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as readline from "node:readline";
import { fileURLToPath } from "node:url";

import { InitAbortError } from "./init_abort.js";
import { blackBox } from "./format.js";

/** Known MCP config file names to scan for (project-local). */
const CONFIG_FILENAMES = ["mcp.json", "mcp_config.json", "claude_desktop_config.json"] as const;

/** Project-relative config paths to check (repo-level Cursor/Claude/Codex). */
const PROJECT_CONFIG_PATHS = [".cursor/mcp.json", ".mcp.json", ".codex/config.toml"] as const;
const LEGACY_NEOTOMA_DEV_SERVER_ID = "neotoma-dev";
const LEGACY_NEOTOMA_PROD_SERVER_ID = "neotoma";
const CLAUDE_DESKTOP_NEOTOMA_DEV_SERVER_ID = "mcpsrv_neotoma_dev";
const CLAUDE_DESKTOP_NEOTOMA_PROD_SERVER_ID = "mcpsrv_neotoma";

/** Codex uses TOML; path ends with config.toml and contains .codex. */
function isCodexConfigPath(filePath: string): boolean {
  const normalized = path.normalize(filePath);
  return normalized.includes(".codex") && normalized.endsWith("config.toml");
}

function isClaudeDesktopConfigPath(filePath: string): boolean {
  return path.basename(path.normalize(filePath)) === "claude_desktop_config.json";
}

function neotomaServerIdForConfig(configPath: string, env: "dev" | "prod"): string {
  if (isClaudeDesktopConfigPath(configPath)) {
    return env === "dev" ? CLAUDE_DESKTOP_NEOTOMA_DEV_SERVER_ID : CLAUDE_DESKTOP_NEOTOMA_PROD_SERVER_ID;
  }
  return env === "dev" ? LEGACY_NEOTOMA_DEV_SERVER_ID : LEGACY_NEOTOMA_PROD_SERVER_ID;
}

function applyClaudeDesktopServerIdMigration(
  mcpServers: Record<string, { command?: string; url?: string; [key: string]: unknown }>
): boolean {
  let changed = false;
  const migrations = [
    [LEGACY_NEOTOMA_DEV_SERVER_ID, CLAUDE_DESKTOP_NEOTOMA_DEV_SERVER_ID],
    [LEGACY_NEOTOMA_PROD_SERVER_ID, CLAUDE_DESKTOP_NEOTOMA_PROD_SERVER_ID],
  ] as const;

  for (const [legacyId, compliantId] of migrations) {
    if (!(legacyId in mcpServers)) continue;
    if (!(compliantId in mcpServers)) {
      mcpServers[compliantId] = mcpServers[legacyId];
    }
    delete mcpServers[legacyId];
    changed = true;
  }

  return changed;
}

/**
 * Detect dev/prod Neotoma servers in Codex TOML (sections [mcp_servers.neotoma-dev] and [mcp_servers.neotoma]).
 */
function detectNeotomaServersFromCodexToml(content: string): { hasDev: boolean; hasProd: boolean } {
  const hasDev = /\[mcp_servers\.neotoma-dev\]/m.test(content);
  const hasProd = /\[mcp_servers\.neotoma\]/m.test(content);
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
 * Write neotoma-dev and neotoma into user-level ~/.codex/config.toml so Codex sees them.
 * Replaces or appends the Neotoma marker block; leaves other user options intact.
 */
async function syncCodexUserConfig(
  repoRoot: string,
  sessionPorts?: SessionPorts,
  transport: McpTransportChoice = "b"
): Promise<void> {
  const userPath = getUserLevelCodexConfigPath();
  if (!userPath) return;

  const launchTarget = resolveMcpLaunchTarget(repoRoot);
  const entries = neotomaServerEntriesForTransport(repoRoot, sessionPorts, transport);
  const blocks: string[] = [];
  for (const [id, config] of Object.entries(entries)) {
    const lines = [`[mcp_servers.${id}]`];
    if ("url" in config && typeof config.url === "string") {
      lines.push(`url = ${escapeTomlString(config.url)}`);
    } else if ("command" in config && typeof config.command === "string") {
      lines.push(`command = ${escapeTomlString(config.command)}`);
      lines.push(`cwd = ${escapeTomlString(launchTarget.root)}`);
    }
    if ("args" in config && Array.isArray(config.args) && config.args.length) {
      lines.push(`args = [${config.args.map((a) => escapeTomlString(a)).join(", ")}]`);
    }
    if ("env" in config && config.env && Object.keys(config.env).length > 0) {
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

/** Optional session ports from CLI; supports default dev/prod and selected active instance. */
export type SessionPorts = {
  devPort?: number;
  prodPort?: number;
  activePort?: number;
  activeEnv?: "dev" | "prod";
};

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

  for (const [serverId, config] of Object.entries(mcpServers)) {
    if (!config || typeof config !== "object") continue;
    const serverConfig = config as {
      command?: string;
      url?: string;
      args?: unknown;
      env?: Record<string, unknown>;
    };

    const command = serverConfig.command || "";
    const url = serverConfig.url || "";
    const args = Array.isArray(serverConfig.args) ? serverConfig.args.map((arg) => String(arg)) : [];
    const envMode = String(serverConfig.env?.NEOTOMA_ENV ?? "").toLowerCase();
    const downstreamUrl = String(serverConfig.env?.MCP_PROXY_DOWNSTREAM_URL ?? "");
    const downstreamPort = downstreamUrl ? portFromUrl(downstreamUrl) : null;
    const hasDistArg = args.some((arg) => isDistMcpEntrypointArg(arg));
    const id = serverId.toLowerCase();
    const idHintsDev = id.includes("dev");
    const idHintsProd = id === "neotoma" || id === "mcpsrv_neotoma" || id.includes("prod");

    const isDevCommand =
      command.includes("run_neotoma_mcp_stdio.sh") ||
      command.includes("run_neotoma_mcp_stdio_dev_watch.sh") ||
      command.includes("run_neotoma_mcp_stdio_dev_shim.sh") ||
      (command.includes("run_neotoma_mcp_signed_stdio_dev_shim.sh") &&
        (idHintsDev || (!idHintsProd && (downstreamPort === wantDevPort || downstreamPort === 3080))));
    const isProdCommand =
      command.includes("run_neotoma_mcp_stdio_prod.sh") ||
      command.includes("run_neotoma_mcp_stdio_prod_watch.sh") ||
      (command.includes("run_neotoma_mcp_signed_stdio_dev_shim.sh") &&
        (idHintsProd ||
          (!idHintsDev && (downstreamPort === wantProdPort || downstreamPort === 3180 || envMode === "production"))));

    if (url) {
      const port = portFromUrl(url);
      const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
      const isFly = url.includes("neotoma.fly.dev/mcp");
      if (isLocal && url.includes("/mcp")) {
        if (wantDevPort != null) {
          if (port === wantDevPort) hasDev = true;
        } else if (port === 3080) {
          hasDev = true;
        }
        if (wantProdPort != null) {
          if (port === wantProdPort) hasProd = true;
        } else if (port === 3180) {
          hasProd = true;
        }
        if (sessionPorts?.activePort != null && port === sessionPorts.activePort) {
          if (sessionPorts.activeEnv === "dev") hasDev = true;
          if (sessionPorts.activeEnv === "prod") hasProd = true;
        }
      }
      if (isFly) hasProd = true;
    }
    if (isDevCommand) hasDev = true;
    if (isProdCommand) hasProd = true;
    if (hasDistArg) {
      if (envMode === "production" || envMode === "prod") {
        hasProd = true;
      } else if (envMode === "development" || envMode === "dev") {
        hasDev = true;
      } else if (idHintsDev) {
        hasDev = true;
      } else if (idHintsProd) {
        hasProd = true;
      } else {
        hasDev = true;
        hasProd = true;
      }
    }
  }

  return { hasDev, hasProd };
}

/**
 * Analyze MCP config for misconfigurations.
 * For local Neotoma usage, HTTP MCP URLs are the default.
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
    const serverConfig = config as { command?: string; url?: string; args?: unknown };
    const url = serverConfig.url || "";
    const command = serverConfig.command || "";
    const args = Array.isArray(serverConfig.args) ? serverConfig.args.map((arg) => String(arg)) : [];
    const hasDistArg = args.some((arg) => isDistMcpEntrypointArg(arg));

    const isNeotoma =
      serverId.toLowerCase().includes("neotoma") ||
      command.includes("run_neotoma_mcp") ||
      hasDistArg ||
      (url.includes("localhost") && url.includes("/mcp"));

    if (!isNeotoma) continue;

    void isLocalRepo;

    // Port mismatch when session ports are set
    if (url && sessionPorts) {
      const port = portFromUrl(url);
      if (port != null) {
        const isDevLike =
          port === 3080 ||
          port === sessionPorts.devPort ||
          (sessionPorts.activeEnv === "dev" && port === sessionPorts.activePort);
        const isProdLike =
          port === 3180 ||
          port === sessionPorts.prodPort ||
          (sessionPorts.activeEnv === "prod" && port === sessionPorts.activePort);
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

/**
 * Generate neotoma-dev and neotoma (prod) stdio MCP server entries.
 * This lets MCP clients launch Neotoma directly without requiring a separate API server.
 */
type McpServerEntry = { url: string } | { command: string; args?: string[]; env?: Record<string, string> };
export type McpTransportChoice = "a" | "b" | "c" | "d";

/** Default HTTP /mcp for `neotoma api start --env dev` (port 3080). */
const DEFAULT_DEV_MCP_URL = "http://127.0.0.1:3080/mcp";
/** Default HTTP /mcp for `neotoma api start --env prod` (port 3180). */
const DEFAULT_PROD_MCP_URL = "http://127.0.0.1:3180/mcp";

function hasRequiredMcpScripts(root: string): boolean {
  const scriptsDir = path.join(root, "scripts");
  return (
    existsSync(path.join(scriptsDir, "run_neotoma_mcp_stdio.sh")) &&
    existsSync(path.join(scriptsDir, "run_neotoma_mcp_stdio_prod.sh"))
  );
}

function getInstalledCliRoot(): string {
  // Works in both source checkouts and globally installed/built CLI packages.
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function hasDistMcpEntrypoint(root: string): boolean {
  return existsSync(path.join(root, "dist", "index.js"));
}

function isDistMcpEntrypointArg(arg: string): boolean {
  const normalized = arg.replace(/\\/g, "/").toLowerCase();
  return normalized.includes("/dist/index.js") && normalized.includes("neotoma");
}

function resolveMcpLaunchTarget(repoRoot: string): { root: string; mode: "scripts" | "dist" } {
  const installedRoot = getInstalledCliRoot();
  const candidates = [installedRoot, repoRoot];
  for (const root of candidates) {
    if (hasRequiredMcpScripts(root)) return { root, mode: "scripts" };
  }
  for (const root of candidates) {
    if (hasDistMcpEntrypoint(root)) return { root, mode: "dist" };
  }
  return { root: repoRoot, mode: "scripts" };
}

export function neotomaServerEntries(
  repoRoot: string,
  _sessionPorts?: SessionPorts
): {
  "neotoma-dev": McpServerEntry;
  neotoma: McpServerEntry;
} {
  const launchTarget = resolveMcpLaunchTarget(repoRoot);
  if (launchTarget.mode === "scripts") {
    return {
      "neotoma-dev": { command: path.join(launchTarget.root, "scripts", "run_neotoma_mcp_stdio.sh") },
      neotoma: { command: path.join(launchTarget.root, "scripts", "run_neotoma_mcp_stdio_prod.sh") },
    };
  }

  const distEntrypoint = path.join(launchTarget.root, "dist", "index.js");
  const baseEnv = { NEOTOMA_ACTIONS_DISABLE_AUTOSTART: "1" };
  return {
    "neotoma-dev": { command: process.execPath, args: [distEntrypoint], env: baseEnv },
    neotoma: {
      command: process.execPath,
      args: [distEntrypoint],
      env: { ...baseEnv, NEOTOMA_ENV: "production" },
    },
  };
}

function maybeEnv(env: Record<string, string>): { env?: Record<string, string> } {
  return Object.keys(env).length > 0 ? { env } : {};
}

function downstreamUrlForEnv(env: "dev" | "prod", sessionPorts?: SessionPorts): string {
  const port = env === "dev" ? sessionPorts?.devPort : sessionPorts?.prodPort;
  if (port != null) return `http://127.0.0.1:${port}/mcp`;
  return env === "dev" ? DEFAULT_DEV_MCP_URL : DEFAULT_PROD_MCP_URL;
}

export function parseMcpTransportChoice(answer: string | undefined): McpTransportChoice {
  const a = (answer ?? "").trim().toLowerCase();
  if (a === "1" || a === "a" || a === "signed" || a === "signed-dev-shim") return "a";
  if (a === "2" || a === "b" || a === "dev-shim" || a === "shim") return "b";
  if (a === "3" || a === "c" || a === "direct" || a === "stdio") return "c";
  if (a === "4" || a === "d" || a === "prod" || a === "prod-parity") return "d";
  return "b";
}

async function promptMcpTransport(): Promise<McpTransportChoice> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<McpTransportChoice>((resolve, reject) => {
    let settled = false;
    rl.on("close", () => {
      if (!settled) {
        settled = true;
        reject(new InitAbortError());
      }
    });
    rl.question(
      "Choose MCP transport (what gets written for neotoma-dev + neotoma in mcp.json):\n" +
        "\n" +
        "  (1) A — Signed stdio shim + AAuth\n" +
        "      Cursor speaks stdio; child process signs HTTP to /mcp. neotoma-dev → dev API;\n" +
        "      neotoma → prod API (two slots, two backends).\n" +
        "\n" +
        "  (2) B — Unsigned/local stdio (default)\n" +
        "      Lower-ceremony local setup: packaged installs launch Neotoma directly over stdio.\n" +
        "      Source checkouts use the unsigned dev shim with the same dev/prod slots.\n" +
        "\n" +
        "  (3) C — Direct stdio (no HTTP shim)\n" +
        "      MCP runs Neotoma stdio entrypoints directly; reconnect the MCP client after\n" +
        "      code changes that affect the server process.\n" +
        "\n" +
        "  (4) D — Signed shim, prod API on both slots\n" +
        "      neotoma-dev and neotoma both use the prod /mcp URL (default\n" +
        "      http://127.0.0.1:3180/mcp). Use when you want prod data behind both entries.\n" +
        "\n" +
        "Choose [1-4] (default: 2): ",
      (answer) => {
        if (settled) return;
        settled = true;
        rl.close();
        resolve(parseMcpTransportChoice(answer));
      }
    );
  });
}

export function neotomaServerEntriesForTransport(
  repoRoot: string,
  sessionPorts?: SessionPorts,
  transport: McpTransportChoice = "b"
): {
  "neotoma-dev": McpServerEntry;
  neotoma: McpServerEntry;
} {
  if (transport === "c") return neotomaServerEntries(repoRoot, sessionPorts);

  const launchTarget = resolveMcpLaunchTarget(repoRoot);
  if (launchTarget.mode === "scripts") {
    const scriptsDir = path.join(launchTarget.root, "scripts");
    if (transport === "b") {
      const shimScript = path.join(scriptsDir, "run_neotoma_mcp_stdio_dev_shim.sh");
      return {
        "neotoma-dev": { command: shimScript },
        neotoma: {
          command: shimScript,
          env: { NEOTOMA_ENV: "production" },
        },
      };
    }

    const signedShimScript = path.join(scriptsDir, "run_neotoma_mcp_signed_stdio_dev_shim.sh");
    const devDownstreamUrl = transport === "d" ? downstreamUrlForEnv("prod", sessionPorts) : downstreamUrlForEnv("dev", sessionPorts);
    const prodDownstreamUrl = downstreamUrlForEnv("prod", sessionPorts);
    return {
      "neotoma-dev": {
        command: signedShimScript,
        ...maybeEnv(
          devDownstreamUrl === DEFAULT_DEV_MCP_URL
            ? {}
            : { MCP_PROXY_DOWNSTREAM_URL: devDownstreamUrl }
        ),
      },
      neotoma: {
        command: signedShimScript,
        env: { MCP_PROXY_DOWNSTREAM_URL: prodDownstreamUrl },
      },
    };
  }

  const distEntrypoint = path.join(launchTarget.root, "dist", "index.js");
  const cliEntrypoint = path.join(launchTarget.root, "dist", "cli", "index.js");
  const baseEnv = { NEOTOMA_ACTIONS_DISABLE_AUTOSTART: "1" };
  if (transport === "b") {
    return {
      "neotoma-dev": { command: process.execPath, args: [distEntrypoint], env: baseEnv },
      neotoma: {
        command: process.execPath,
        args: [distEntrypoint],
        env: { ...baseEnv, NEOTOMA_ENV: "production" },
      },
    };
  }

  const devDownstreamUrl = transport === "d" ? downstreamUrlForEnv("prod", sessionPorts) : downstreamUrlForEnv("dev", sessionPorts);
  const prodDownstreamUrl = downstreamUrlForEnv("prod", sessionPorts);
  return {
    "neotoma-dev": {
      command: process.execPath,
      args: [cliEntrypoint, "mcp", "proxy", "--aauth"],
      env: { MCP_PROXY_DOWNSTREAM_URL: devDownstreamUrl },
    },
    neotoma: {
      command: process.execPath,
      args: [cliEntrypoint, "mcp", "proxy", "--aauth"],
      env: { MCP_PROXY_DOWNSTREAM_URL: prodDownstreamUrl },
    },
  };
}

/**
 * Detect whether AAuth keys exist at the standard CLI location
 * (`~/.neotoma/aauth/private.jwk`). When present, the proxy path
 * should be offered as the recommended MCP entry.
 */
export function hasAAuthKeys(): boolean {
  const aAuthKeyPath = path.join(os.homedir(), ".neotoma", "aauth", "private.jwk");
  return existsSync(aAuthKeyPath);
}

export async function ensureAAuthKeysForSignedTransport(
  transport: McpTransportChoice,
  silent: boolean
): Promise<void> {
  if (transport !== "a" && transport !== "d") return;
  if (hasAAuthKeys()) return;

  const { generateAndStoreKeypair } = await import("./aauth_signer.js");
  try {
    const result = await generateAndStoreKeypair();
    if (!silent) {
      process.stdout.write(`Generated AAuth keypair for signed MCP transport (${result.thumbprint}).\n`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Unable to generate AAuth keypair for signed MCP transport. Run \`neotoma auth keygen\` manually, then retry. ${message}`
    );
  }
}

/**
 * Build MCP server entries that use the identity proxy instead of direct stdio.
 * The proxy bridges stdio to HTTP with clientInfo injection and optional AAuth signing.
 */
export function neotomaProxyServerEntries(
  repoRoot: string,
  options?: { aauth?: boolean; downstreamUrl?: string },
): {
  "neotoma-dev": McpServerEntry;
  neotoma: McpServerEntry;
} {
  const launchTarget = resolveMcpLaunchTarget(repoRoot);
  const aauth = options?.aauth ?? hasAAuthKeys();
  const proxyArgs = aauth ? ["mcp", "proxy", "--aauth"] : ["mcp", "proxy"];

  if (launchTarget.mode === "scripts") {
    const proxyScript = path.join(launchTarget.root, "scripts", "run_neotoma_mcp_proxy.sh");
    const env: Record<string, string> = {};
    if (options?.downstreamUrl) {
      env.MCP_PROXY_DOWNSTREAM_URL = options.downstreamUrl;
    }
    return {
      "neotoma-dev": {
        command: proxyScript,
        ...(Object.keys(env).length > 0 ? { env } : {}),
      },
      neotoma: {
        command: proxyScript,
        env: {
          ...env,
          MCP_PROXY_DOWNSTREAM_URL: options?.downstreamUrl ?? "http://localhost:3180/mcp",
        },
      },
    };
  }

  const distEntrypoint = path.join(launchTarget.root, "dist", "cli", "index.js");
  const baseEnv: Record<string, string> = {};
  if (options?.downstreamUrl) {
    baseEnv.MCP_PROXY_DOWNSTREAM_URL = options.downstreamUrl;
  }

  return {
    "neotoma-dev": {
      command: process.execPath,
      args: [distEntrypoint, ...proxyArgs],
      env: {
        ...baseEnv,
        MCP_PROXY_DOWNSTREAM_URL: options?.downstreamUrl ?? "http://localhost:3080/mcp",
      },
    },
    neotoma: {
      command: process.execPath,
      args: [distEntrypoint, ...proxyArgs],
      env: {
        ...baseEnv,
        MCP_PROXY_DOWNSTREAM_URL: options?.downstreamUrl ?? "http://localhost:3180/mcp",
      },
    },
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
      if (isCodexConfigPath(absPath)) {
        foundPaths.push(absPath);
      } else {
        const parsed = await parseMcpConfig(absPath);
        if (parsed) foundPaths.push(absPath);
      }
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
  | { type: "port_mismatch"; serverId: string; expectedPort: number; actualPort: number; description: string }
  | { type: "invalid_claude_server_id"; serverId: string; description: string };

export type ConfigStatus = {
  path: string;
  hasDev: boolean;
  hasProd: boolean;
  /** Issues that suggest fixing (e.g. HTTP locally when stdio recommended, port mismatch). */
  issues?: McpConfigIssue[];
};

export type McpHookHarness = "cursor" | "claude-code" | "codex";

/** Infer hook-capable harnesses from MCP config paths that already contain a Neotoma server. */
export function inferHookHarnessesFromMcpConfigs(configs: ConfigStatus[]): McpHookHarness[] {
  const harnesses = new Set<McpHookHarness>();
  for (const config of configs) {
    if (!config.hasDev && !config.hasProd) continue;
    const normalized = path.normalize(config.path);
    const lower = normalized.toLowerCase();
    if (
      normalized.endsWith(path.normalize(".cursor/mcp.json")) ||
      normalized.includes(`${path.sep}.cursor${path.sep}mcp.json`) ||
      lower.endsWith(path.normalize(`${path.sep}.cursor${path.sep}mcp.json`).toLowerCase())
    ) {
      harnesses.add("cursor");
      continue;
    }
    if (isCodexConfigPath(normalized)) {
      harnesses.add("codex");
      continue;
    }
    if (path.basename(normalized) === "claude_desktop_config.json" || lower.includes(`${path.sep}claude${path.sep}`)) {
      harnesses.add("claude-code");
    }
  }
  return [...harnesses];
}

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
    activePort?: number;
    activeEnv?: "dev" | "prod";
    neotomaRepoRoot?: string | null;
  }
): Promise<{ configs: ConfigStatus[]; repoRoot: string | null }> {
  const includeUserLevel = options?.includeUserLevel ?? false;
  const userLevelFirst = options?.userLevelFirst ?? false;
  const sessionPorts: SessionPorts | undefined =
    options?.devPort != null ||
    options?.prodPort != null ||
    options?.activePort != null ||
    options?.activeEnv != null
      ? {
          devPort: options.devPort,
          prodPort: options.prodPort,
          activePort: options.activePort,
          activeEnv: options.activeEnv,
        }
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
      if (isClaudeDesktopConfigPath(configPath)) {
        for (const serverId of [LEGACY_NEOTOMA_DEV_SERVER_ID, LEGACY_NEOTOMA_PROD_SERVER_ID]) {
          if (parsed.mcpServers && serverId in parsed.mcpServers) {
            issues.push({
              type: "invalid_claude_server_id",
              serverId,
              description: `${serverId} is not accepted by Claude Desktop; use a mcpsrv_* server id instead.`,
            });
          }
        }
      }
      configs.push({ path: configPath, hasDev, hasProd, issues: issues.length ? issues : undefined });
    }
  }

  return { configs, repoRoot };
}

/**
 * Prompt user for yes/no input. In a TTY, a single y/n keypress submits immediately
 * and is echoed once; otherwise uses readline (e.g. for non-interactive or tests).
 * Rejects with InitAbortError on EOF (Cmd+D).
 * When `defaultYes` is true, Enter/empty input accepts (same as `Y/n` prompts).
 */
async function promptYesNo(
  question: string,
  opts?: { defaultYes?: boolean }
): Promise<boolean> {
  const defaultYes = opts?.defaultYes === true;
  const hint = defaultYes ? "Y/n" : "y/n";
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    const rl = readline.createInterface({
      input: stdin,
      output: process.stdout,
    });
    return new Promise<boolean>((resolve, reject) => {
      let settled = false;
      rl.on("close", () => {
        if (!settled) {
          settled = true;
          reject(new InitAbortError());
        }
      });
      rl.question(`${question} (${hint}): `, (answer) => {
        if (!settled) {
          settled = true;
          rl.close();
          const t = (answer ?? "").trim().toLowerCase();
          if (t === "") {
            resolve(defaultYes);
            return;
          }
          resolve(t === "y" || t === "yes");
        }
      });
    });
  }

  return new Promise<boolean>((resolve, reject) => {
    process.stdout.write(`${question} (${hint}): `);
    const wasPaused = stdin.isPaused();
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    function done(value: boolean): void {
      stdin.removeListener("data", onData);
      stdin.removeListener("end", onEnd);
      stdin.setRawMode(false);
      if (wasPaused) stdin.pause();
      process.stdout.write("\n");
      resolve(value);
    }

    function onEnd(): void {
      stdin.removeListener("data", onData);
      stdin.removeListener("end", onEnd);
      stdin.setRawMode(false);
      if (wasPaused) stdin.pause();
      process.stdout.write("\n");
      reject(new InitAbortError());
    }

    function onData(key: string | Buffer): void {
      const k = typeof key === "string" ? key : key.toString("utf8");
      if (k === "\u0004") {
        stdin.removeListener("data", onData);
        stdin.removeListener("end", onEnd);
        stdin.setRawMode(false);
        if (wasPaused) stdin.pause();
        process.stdout.write("\n");
        reject(new InitAbortError());
        return;
      }
      if (k === "\u0003") {
        done(false);
        return;
      }
      const lower = k.toLowerCase();
      if (lower === "y") {
        done(true);
        return;
      }
      if (lower === "n") {
        done(false);
        return;
      }
      if (lower === "\r" || lower === "\n") {
        done(defaultYes);
        return;
      }
    }

    stdin.once("data", onData);
    stdin.once("end", onEnd);
  });
}

/**
 * Prompt user to choose user-level or project-level config. Returns "user", "project", or null if cancelled.
 * Rejects with InitAbortError on EOF (Cmd+D).
 */
async function promptUserOrProject(question: string): Promise<"user" | "project" | null> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<"user" | "project" | null>((resolve, reject) => {
    let settled = false;
    rl.on("close", () => {
      if (!settled) {
        settled = true;
        reject(new InitAbortError());
      }
    });
    rl.question(`${question} `, (answer) => {
      if (!settled) {
        settled = true;
        rl.close();
        const a = (answer ?? "").trim().toLowerCase();
        if (a === "u" || a === "user") {
          resolve("user");
        } else if (a === "p" || a === "project") {
          resolve("project");
        } else {
          resolve(null);
        }
      }
    });
  });
}

type InstallTargetChoice =
  | "project_all"
  | "user_all"
  | "both_all"
  | "cursor_only"
  | "claude_only"
  | "codex_only"
  | "skip";

type InstallEnvChoice = "dev" | "prod" | "both" | "skip";

export function parseInstallEnvironmentChoice(answer: string): InstallEnvChoice {
  const a = (answer ?? "").trim().toLowerCase();
  if (a === "4" || a === "skip" || a === "s") return "skip";
  if (a === "1" || a === "dev" || a === "d") return "dev";
  if (a === "3" || a === "both" || a === "b") return "both";
  if (a === "2" || a === "prod" || a === "p") return "prod";
  return "prod";
}

async function promptInstallEnvironment(): Promise<InstallEnvChoice> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<InstallEnvChoice>((resolve, reject) => {
    let settled = false;
    rl.on("close", () => {
      if (!settled) {
        settled = true;
        reject(new InitAbortError());
      }
    });
    rl.question(
      "Configure MCP servers for:\n" +
        "  (1) dev\n" +
        "  (2) prod\n" +
        "  (3) both\n" +
        "  (4) skip\n" +
        "Choose [1-4] (default: 2): ",
      (answer) => {
        if (settled) return;
        settled = true;
        rl.close();
        return resolve(parseInstallEnvironmentChoice(answer));
      }
    );
  });
}

async function promptInstallTarget(includeProjectOptions: boolean): Promise<InstallTargetChoice> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<InstallTargetChoice>((resolve, reject) => {
    let settled = false;
    rl.on("close", () => {
      if (!settled) {
        settled = true;
        reject(new InitAbortError());
      }
    });
    const prompt = includeProjectOptions
      ? "Add or update MCP servers:\n" +
        "  (1) project (Cursor + Claude + Codex in this source checkout)\n" +
        "  (2) user (Cursor + Claude + Codex in ~)\n" +
        "  (3) both (project + user)\n" +
        "  (4) Cursor only (project + user)\n" +
        "  (5) Claude only (project + user)\n" +
        "  (6) Codex only (project + user)\n" +
        "  (7) skip\n" +
        "Choose [1-7] (default: 2): "
      : "Add or update MCP servers:\n" +
        "  (1) user (Cursor + Claude + Codex in ~)\n" +
        "  (2) Cursor only (user)\n" +
        "  (3) Claude only (user)\n" +
        "  (4) Codex only (user)\n" +
        "  (5) skip\n" +
        "Note: project-level MCP options require running from a source checkout.\n" +
        "Choose [1-5] (default: 1): ";
    rl.question(prompt, (answer) => {
        if (settled) return;
        settled = true;
        rl.close();
        const a = (answer ?? "").trim().toLowerCase();
        if (!includeProjectOptions) {
          if (a === "" || a === "1" || a === "user" || a === "u") return resolve("user_all");
          if (a === "2" || a === "cursor" || a === "c") return resolve("cursor_only");
          if (a === "3" || a === "claude") return resolve("claude_only");
          if (a === "4" || a === "codex") return resolve("codex_only");
          return resolve("skip");
        }
        if (a === "" || a === "2" || a === "user" || a === "u") return resolve("user_all");
        if (a === "1" || a === "project" || a === "p") return resolve("project_all");
        if (a === "3" || a === "both") return resolve("both_all");
        if (a === "4" || a === "cursor" || a === "c") return resolve("cursor_only");
        if (a === "5" || a === "claude") return resolve("claude_only");
        if (a === "6" || a === "codex") return resolve("codex_only");
        return resolve("skip");
      });
  });
}

type ConfigClient = "cursor" | "claude" | "codex" | "other";

function classifyConfigClient(configPath: string): ConfigClient {
  const normalized = path.normalize(configPath);
  if (isCodexConfigPath(normalized)) return "codex";
  if (
    normalized.endsWith(path.normalize(".cursor/mcp.json")) ||
    normalized.includes(`${path.sep}.cursor${path.sep}mcp.json`)
  ) {
    return "cursor";
  }
  if (
    normalized.endsWith(path.normalize(".mcp.json")) ||
    normalized.endsWith(path.normalize("claude_desktop_config.json"))
  ) {
    return "claude";
  }
  return "other";
}

function isProjectLevelConfig(configPath: string, repoRoot: string): boolean {
  const normalizedPath = path.normalize(configPath);
  const normalizedRoot = path.normalize(repoRoot);
  return normalizedPath.startsWith(normalizedRoot + path.sep) || normalizedPath === normalizedRoot;
}

function isKnownUserLevelConfig(configPath: string): boolean {
  const normalized = path.normalize(configPath);
  return getUserLevelConfigPaths().some(({ path: userPath }) => path.normalize(userPath) === normalized);
}

/** Map MCP install target to agent-instructions scope so we can reuse the choice and avoid a second prompt. */
function installChoiceToScope(choice: Exclude<InstallTargetChoice, "skip">): "project" | "user" | "both" {
  if (choice === "project_all") return "project";
  if (choice === "user_all") return "user";
  return "both"; // both_all or any client-only choice
}

function filterConfigsByInstallChoice(
  configs: ConfigStatus[],
  choice: InstallTargetChoice,
  repoRoot: string
): ConfigStatus[] {
  if (choice === "skip") return [];
  if (choice === "both_all") return configs;
  if (choice === "project_all") return configs.filter((c) => isProjectLevelConfig(c.path, repoRoot));
  // User scope should only include canonical user-level MCP config files.
  if (choice === "user_all") return configs.filter((c) => isKnownUserLevelConfig(c.path));
  if (choice === "cursor_only") return configs.filter((c) => classifyConfigClient(c.path) === "cursor");
  if (choice === "claude_only") return configs.filter((c) => classifyConfigClient(c.path) === "claude");
  if (choice === "codex_only") return configs.filter((c) => classifyConfigClient(c.path) === "codex");
  return [];
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
    if (sessionPorts.devPort != null && port === 3080) {
      config.url = rewriteMcpUrlToPort(u, sessionPorts.devPort);
    } else if (sessionPorts.prodPort != null && port === 3180) {
      config.url = rewriteMcpUrlToPort(u, sessionPorts.prodPort);
    }
  }
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
  options?: { silent?: boolean; devPort?: number; prodPort?: number; assumeYes?: boolean }
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
      message:
        "Cannot fix: Neotoma source root not found. Run from a Neotoma source checkout.",
      updatedPaths: [],
    };
  }

  if (silent) {
    return {
      fixed: false,
        message: "Misconfigurations detected. Run 'neotoma mcp config' to fix.",
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

  const shouldFix =
    options?.assumeYes ??
    (process.stdin.isTTY
      ? await promptYesNo("Fix these issues? (Align local MCP URLs and Claude Desktop server IDs)", {
          defaultYes: true,
        })
      : false);
  if (!shouldFix) {
    return { fixed: false, message: "Fix cancelled.", updatedPaths: [] };
  }

  const updatedPaths: string[] = [];

  for (const config of configsWithIssues) {
    const parsed = await parseMcpConfig(config.path);
    if (!parsed?.mcpServers) continue;

    let changed = false;

    // Fix port mismatch for URL entries
    if (sessionPorts) {
      const before = JSON.stringify(parsed.mcpServers);
      applySessionPortsToUrls(parsed.mcpServers, sessionPorts);
      if (JSON.stringify(parsed.mcpServers) !== before) changed = true;
    }
    if (isClaudeDesktopConfigPath(config.path)) {
      changed = applyClaudeDesktopServerIdMigration(parsed.mcpServers) || changed;
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
    /** Optional init default: skip env prompt and use this env target. */
    autoInstallEnv?: "dev" | "prod" | "both";
    /** Optional init default: skip target prompt and use this scope. */
    autoInstallScope?: "project" | "user" | "both";
    /** Optional install default: skip transport prompt and use this MCP transport mode. */
    mcpTransport?: McpTransportChoice;
    /**
     * When true, apply the selected transport to every JSON MCP config in the chosen install scope,
     * not only configs missing dev or prod. Use to switch presets (A–D) or refresh script paths.
     */
    rewriteExistingNeotoma?: boolean;
    /** Non-interactive default: accept repair prompts instead of waiting on stdin. */
    assumeYes?: boolean;
    /** When true, do not run sync:mcp (avoids writing project-level MCP configs). */
    skipProjectSync?: boolean;
  }
): Promise<{
  installed: boolean;
  message: string;
  scope?: "project" | "user" | "both";
  updatedPaths?: string[];
}> {
  const silent = options?.silent ?? false;
  const cwd = options?.cwd ?? process.cwd();
  let selectedEnv: "dev" | "prod" | null = options?.currentEnv ?? null;
  let selectedTransport: McpTransportChoice = options?.mcpTransport ?? "b";
  const sessionPorts: SessionPorts | undefined =
    options?.devPort != null || options?.prodPort != null
      ? { devPort: options.devPort, prodPort: options.prodPort }
      : undefined;

  if (!repoRoot) {
    const message =
      "Cannot install: Neotoma source root not found. Run from a Neotoma source checkout or set NEOTOMA_REPO_ROOT.";
    if (!silent) process.stderr.write(message + "\n");
    return { installed: false, message };
  }

  const getMissingConfigs = (env: "dev" | "prod" | null): ConfigStatus[] =>
    env
      ? configs.filter((c) => (env === "dev" ? !c.hasDev : !c.hasProd))
      : configs.filter((c) => !c.hasDev || !c.hasProd);
  const getConfigsForScope = (allConfigs: ConfigStatus[]): ConfigStatus[] => {
    if (options?.autoInstallScope === "user") {
      return filterConfigsByInstallChoice(allConfigs, "user_all", repoRoot);
    }
    if (options?.autoInstallScope === "project") {
      return filterConfigsByInstallChoice(allConfigs, "project_all", repoRoot);
    }
    return allConfigs;
  };
  const getMissingFromConfigs = (
    targetConfigs: ConfigStatus[],
    env: "dev" | "prod" | null
  ): ConfigStatus[] =>
    env
      ? targetConfigs.filter((c) => (env === "dev" ? !c.hasDev : !c.hasProd))
      : targetConfigs.filter((c) => !c.hasDev || !c.hasProd);

  const configsWithIssues = configs.filter((c) => c.issues && c.issues.length > 0);
  if (!silent && options?.currentEnv == null) {
    if (options?.autoInstallEnv) {
      selectedEnv = options.autoInstallEnv === "both" ? null : options.autoInstallEnv;
    } else {
      const envChoice = await promptInstallEnvironment();
      if (envChoice === "skip") {
        process.stdout.write("MCP configuration skipped.\n");
        return { installed: false, message: "MCP configuration skipped." };
      }
      selectedEnv = envChoice === "both" ? null : envChoice;
    }
  }
  const missingConfigs = getMissingConfigs(selectedEnv);
  let scopedTargetConfigs = getConfigsForScope(configs);
  let scopedMissingConfigs = getMissingFromConfigs(scopedTargetConfigs, selectedEnv);

  // First offer to fix misconfigurations if any
  if (configsWithIssues.length > 0 && !silent) {
    const fixResult = await offerFix(configs, repoRoot, {
      silent: false,
      devPort: options?.devPort,
      prodPort: options?.prodPort,
      assumeYes: options?.assumeYes,
    });
    if (fixResult.fixed) {
      process.stdout.write("Fixed: " + fixResult.message + "\n");
      // Re-scan to see if we still need to add missing servers
      const { configs: rescanned } = await scanForMcpConfigs(process.cwd(), {
        includeUserLevel: true,
        userLevelFirst: false,
        devPort: options?.devPort,
        prodPort: options?.prodPort,
      });
      const stillMissing = selectedEnv
        ? rescanned.filter((c) => (selectedEnv === "dev" ? !c.hasDev : !c.hasProd))
        : rescanned.filter((c) => !c.hasDev || !c.hasProd);
      if (stillMissing.length === 0) {
        if (!options?.rewriteExistingNeotoma) {
          return { installed: true, message: fixResult.message };
        }
        scopedTargetConfigs = getConfigsForScope(rescanned);
        scopedMissingConfigs = getMissingFromConfigs(scopedTargetConfigs, selectedEnv);
      } else {
        // Fall through to offer adding missing
        missingConfigs.length = 0;
        missingConfigs.push(...stillMissing);
        scopedTargetConfigs = getConfigsForScope(rescanned);
        scopedMissingConfigs = getMissingFromConfigs(scopedTargetConfigs, selectedEnv);
      }
    } else if (scopedMissingConfigs.length === 0) {
      // User declined fix; no missing servers (only had misconfig)
      return { installed: false, message: "No changes made." };
    }
  }

  if (
    scopedTargetConfigs.length > 0 &&
    scopedMissingConfigs.length === 0 &&
    !options?.rewriteExistingNeotoma
  ) {
    const scopeSuffix =
      options?.autoInstallScope === "user"
        ? " in user-level MCP configs."
        : options?.autoInstallScope === "project"
          ? " in project-level MCP configs."
          : ".";
    const message = selectedEnv
      ? `${selectedEnv === "dev" ? "Dev" : "Prod"} Neotoma server is already configured${scopeSuffix}`
      : `Dev and prod Neotoma servers are already configured${scopeSuffix}`;
    if (!silent) process.stdout.write(message + "\n");
    return { installed: false, message };
  }

  // If no configs found in the selected scope, create a config in that scope.
  if (scopedTargetConfigs.length === 0) {
    if (silent) {
      return {
        installed: false,
        message: "No MCP config files found. Run 'neotoma mcp config' to create one.",
      };
    }

    process.stdout.write("No MCP config files found.\n");
    const choice =
      options?.autoInstallScope === "user"
        ? "user"
        : options?.autoInstallScope === "project"
          ? "project"
          : await promptUserOrProject(
              "Create user-level (~/.cursor/mcp.json) or project-level (.cursor/mcp.json in current project)? (u/p)"
            );
    if (choice === null) {
      return { installed: false, message: "Installation cancelled." };
    }
    if (!options?.mcpTransport && process.stdin.isTTY) {
      selectedTransport = await promptMcpTransport();
    }
    await ensureAAuthKeysForSignedTransport(selectedTransport, silent);

    const cursorDir =
      choice === "user"
        ? path.join(os.homedir(), ".cursor")
        : path.join(await getProjectRoot(cwd), ".cursor");
    const configPath = path.join(cursorDir, "mcp.json");

    await fs.mkdir(cursorDir, { recursive: true });
    const entries = neotomaServerEntriesForTransport(repoRoot, sessionPorts, selectedTransport);
    const mcpServers =
      selectedEnv === "dev"
        ? { "neotoma-dev": entries["neotoma-dev"] }
        : selectedEnv === "prod"
          ? { neotoma: entries.neotoma }
          : entries;
    const newConfig = { mcpServers };
    await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2) + "\n");

    if (choice === "project" && configPath.startsWith(repoRoot) && !options?.skipProjectSync) {
      await runSyncMcp(repoRoot);
    }
    await attemptCursorMcpReload(configPath);

    const createdMsg = selectedEnv
      ? `Created ${configPath} with ${selectedEnv} server.`
      : `Created ${configPath} with dev and prod servers.`;
    return {
      installed: true,
      message: createdMsg,
      scope: choice === "project" ? "project" : "user",
      updatedPaths: [configPath],
    };
  }

  // Offer to update existing configs
  if (silent && !(options?.rewriteExistingNeotoma && options?.autoInstallScope)) {
    const msg = selectedEnv
      ? `Missing ${selectedEnv} server. Run 'neotoma mcp config' to add it.`
      : "Missing dev or prod servers. Run 'neotoma mcp config' to add them.";
    return { installed: false, message: msg };
  }

  const boxAlreadyShown = options?.boxAlreadyShown ?? false;
  if (!boxAlreadyShown && !silent) {
    process.stdout.write("\n" + formatMcpStatusBox(scopedTargetConfigs) + "\n");
  }
  const runningFromSourceCheckout =
    cwd === repoRoot || cwd.startsWith(repoRoot + path.sep);
  const includeProjectOptions = runningFromSourceCheckout;

  const installChoice: InstallTargetChoice =
    options?.autoInstallScope === "project"
      ? "project_all"
      : options?.autoInstallScope === "both"
        ? "both_all"
        : options?.autoInstallScope === "user"
          ? "user_all"
          : await promptInstallTarget(includeProjectOptions);
  if (installChoice === "skip") {
    return { installed: false, message: "Installation cancelled." };
  }
  const scope = installChoiceToScope(installChoice);
  if (!options?.mcpTransport && process.stdin.isTTY) {
    selectedTransport = await promptMcpTransport();
  }
  await ensureAAuthKeysForSignedTransport(selectedTransport, silent);
  const configsForInstallTargets = options?.rewriteExistingNeotoma
    ? scopedTargetConfigs
    : scopedMissingConfigs;
  let selectedMissingConfigs = filterConfigsByInstallChoice(
    configsForInstallTargets,
    installChoice,
    repoRoot
  );
  if (!includeProjectOptions) {
    selectedMissingConfigs = selectedMissingConfigs.filter((c) => !isProjectLevelConfig(c.path, repoRoot));
  }
  if (selectedMissingConfigs.length === 0) {
    return {
      installed: false,
      message: "No matching missing configs for the selected target.",
      scope,
    };
  }

  const entries = neotomaServerEntriesForTransport(repoRoot, sessionPorts, selectedTransport);
  const updatedPaths: string[] = [];
  const selectedIncludesCodex = selectedMissingConfigs.some((c) => isCodexConfigPath(c.path));
  const forceRewriteNeotoma = options?.rewriteExistingNeotoma ?? false;

  for (const config of selectedMissingConfigs) {
    if (isCodexConfigPath(config.path)) continue; // Codex uses TOML; updated via sync:mcp from .cursor/mcp.json
    const parsed = await parseMcpConfig(config.path);
    if (!parsed) continue;

    if (!parsed.mcpServers) parsed.mcpServers = {};

    // Apply session ports to any existing URL-based entries so config uses CLI ports
    applySessionPortsToUrls(parsed.mcpServers, sessionPorts);
    if (isClaudeDesktopConfigPath(config.path)) {
      applyClaudeDesktopServerIdMigration(parsed.mcpServers);
    }

    // Add or replace Neotoma servers (only selected env when selectedEnv is set)
    if (!selectedEnv || selectedEnv === "dev") {
      if (forceRewriteNeotoma || !config.hasDev) {
        parsed.mcpServers[neotomaServerIdForConfig(config.path, "dev")] = entries["neotoma-dev"];
      }
    }
    if (!selectedEnv || selectedEnv === "prod") {
      if (forceRewriteNeotoma || !config.hasProd) {
        parsed.mcpServers[neotomaServerIdForConfig(config.path, "prod")] = entries.neotoma;
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
      if (isClaudeDesktopConfigPath(config.path)) {
        applyClaudeDesktopServerIdMigration(parsed.mcpServers);
      }
      if (JSON.stringify(parsed.mcpServers) !== before) {
        await fs.writeFile(config.path, JSON.stringify(parsed, null, 2) + "\n");
        updatedPaths.push(config.path);
      }
    }
  }

  // Codex is TOML; update user-level Codex config when selected.
  let syncAlreadyRan = false;
  if (repoRoot && selectedIncludesCodex) {
    await syncCodexUserConfig(repoRoot, sessionPorts, selectedTransport);
    const codexPath = getUserLevelCodexConfigPath();
    if (codexPath && !updatedPaths.includes(codexPath)) updatedPaths.push(codexPath);
    if (!options?.skipProjectSync) {
      await runSyncMcp(repoRoot);
      syncAlreadyRan = true;
    }
  }

  if (repoRoot && updatedPaths.length > 0) {
    if (!options?.skipProjectSync && !syncAlreadyRan) {
      await runSyncMcp(repoRoot);
    }
    for (const p of updatedPaths) {
      if (p.includes(".cursor/mcp.json")) await attemptCursorMcpReload(p);
    }
  }

  return {
    installed: true,
    message: `Updated ${updatedPaths.length} config file(s): ${updatedPaths.join(", ")}`,
    scope,
    updatedPaths,
  };
}
