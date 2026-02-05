#!/usr/bin/env node
import { Command } from "commander";
import { createHash, randomBytes } from "node:crypto";
import { exec, execSync, spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";

import { createApiClient } from "../shared/api_client.js";
import { getOpenApiOperationMapping } from "../shared/contract_mappings.js";
import {
  API_LOG_PATH,
  API_LOGS_DIR,
  API_PID_PATH,
  CONFIG_PATH,
  DEFAULT_BASE_URL,
  baseUrlFromOption,
  clearConfig,
  isTokenExpired,
  readConfig,
  writeConfig,
  type Config,
} from "./config.js";

type OutputMode = "json" | "pretty";

type NpmScript = {
  name: string;
  command: string;
};

type PackageJson = {
  name?: string;
  scripts?: Record<string, string>;
};

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    entries.sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([key, val]) => [key, normalizeValue(val)]));
  }

  return value;
}

function createIdempotencyKey(payload: unknown): string {
  const normalized = normalizeValue(payload);
  const hash = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
  return `idemp_${hash}`;
}

async function findRepoRoot(startDir: string): Promise<string | null> {
  let current = startDir;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const pkgPath = path.join(current, "package.json");
    try {
      const raw = await fs.readFile(pkgPath, "utf-8");
      const pkg = JSON.parse(raw) as PackageJson;
      if (pkg.name === "neotoma") {
        return current;
      }
    } catch {
      // ignore and walk up
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function loadNpmScripts(): Promise<{ repoRoot: string; scripts: NpmScript[] }> {
  const repoRoot = await findRepoRoot(process.cwd());
  if (!repoRoot) {
    throw new Error("Not a Neotoma repo. Run from the repo root (package.json name must be 'neotoma').");
  }
  const pkgPath = path.join(repoRoot, "package.json");
  const raw = await fs.readFile(pkgPath, "utf-8");
  const pkg = JSON.parse(raw) as PackageJson;
  const scripts = Object.entries(pkg.scripts ?? {})
    .map(([name, command]) => ({ name, command }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { repoRoot, scripts };
}

async function runNpmScript(scriptName: string, args: string[]): Promise<never> {
  const { repoRoot } = await loadNpmScripts();
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const scriptArgs = ["run", scriptName, ...(args.length > 0 ? ["--", ...args] : [])];
  const child = spawn(npmCmd, scriptArgs, {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env },
  });
  child.on("close", (code) => {
    process.exit(code ?? 1);
  });
  child.on("error", (err) => {
    writeCliError(err);
    process.exit(1);
  });
  return new Promise(() => {});
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return Object.fromEntries(entries.map(([key, val]) => [key, sortKeys(val)]));
  }
  return value;
}

function stableStringify(value: unknown, indent: number): string {
  return JSON.stringify(sortKeys(value), null, indent);
}

function resolveOutputMode(): OutputMode {
  const opts = program.opts();
  const json = Boolean(opts.json);
  const pretty = Boolean(opts.pretty);
  if (json && pretty) {
    throw new Error("Use only one of --json or --pretty.");
  }
  return json ? "json" : "pretty";
}

function writeOutput(value: unknown, mode: OutputMode): void {
  const indent = mode === "pretty" ? 2 : 0;
  process.stdout.write(`${stableStringify(value, indent)}\n`);
}

function writeMessage(message: string, mode: OutputMode): void {
  if (mode === "json") {
    writeOutput({ message }, mode);
    return;
  }
  console.log(message);
}

function formatCliError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

function writeCliError(err: unknown): void {
  const msg = formatCliError(err);
  process.stderr.write(`neotoma: ${msg}\n`);
}

function formatApiError(error: unknown): string {
  if (error && typeof error === "object") {
    const o = error as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    if (typeof o.detail === "string") return o.detail;
    if (typeof o.error === "string") return o.error;
    if (Array.isArray(o.detail) && o.detail.length > 0) {
      const first = o.detail[0];
      if (first && typeof first === "object" && "msg" in first) return String((first as { msg: unknown }).msg);
    }
  }
  return String(error);
}

function parseOptionalJson(value?: string): unknown {
  if (!value) {
    return undefined;
  }
  return JSON.parse(value);
}

function openBrowser(url: string): void {
  const quoted = `"${url.replace(/"/g, "%22")}"`;
  if (process.platform === "darwin") {
    exec(`open ${quoted}`);
    return;
  }
  if (process.platform === "win32") {
    exec(`start "" ${quoted}`);
    return;
  }
  exec(`xdg-open ${quoted}`);
}

function base64UrlEncode(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildCodeChallenge(verifier: string): string {
  const digest = createHash("sha256").update(verifier).digest();
  return base64UrlEncode(digest);
}

export function buildOAuthAuthorizeUrl(params: {
  baseUrl: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  clientId: string;
  devStub?: boolean;
}): string {
  const authUrl = new URL(`${params.baseUrl}/api/mcp/oauth/authorize`);
  authUrl.searchParams.set("redirect_uri", params.redirectUri);
  authUrl.searchParams.set("state", params.state);
  authUrl.searchParams.set("code_challenge", params.codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("client_id", params.clientId);
  if (params.devStub) {
    authUrl.searchParams.set("dev_stub", "1");
  }
  return authUrl.toString();
}

async function startOAuthCallbackServer(): Promise<{
  redirectUri: string;
  waitForCode: Promise<{ code: string; state: string }>;
}> {
  return new Promise((resolve, reject) => {
    let resolveCode: (value: { code: string; state: string }) => void;
    const waitForCode = new Promise<{ code: string; state: string }>((innerResolve) => {
      resolveCode = innerResolve;
    });

    const server = http.createServer((req, res) => {
      if (!req.url) {
        res.statusCode = 400;
        res.end("Missing callback URL");
        return;
      }
      const requestUrl = new URL(req.url, "http://127.0.0.1");
      if (requestUrl.pathname !== "/callback") {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }
      const code = requestUrl.searchParams.get("code");
      const state = requestUrl.searchParams.get("state");
      if (!code || !state) {
        res.statusCode = 400;
        res.end("Missing code or state");
        return;
      }
      res.statusCode = 200;
      res.end("Authentication complete. You can close this tab.");
      server.close();
      resolveCode({ code, state });
    });

    server.on("error", (error) => {
      reject(error);
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to start callback server"));
        return;
      }
      const redirectUri = `http://127.0.0.1:${address.port}/callback`;
      resolve({ redirectUri, waitForCode });
    });
  });
}

async function exchangeToken(baseUrl: string, code: string): Promise<{
  access_token: string;
  token_type?: string;
  expires_in?: number;
}> {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);

  const response = await fetch(`${baseUrl}/api/mcp/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${errorText}`);
  }

  return (await response.json()) as {
    access_token: string;
    token_type?: string;
    expires_in?: number;
  };
}

async function requireToken(config: Config): Promise<string> {
  if (!config.access_token || isTokenExpired(config)) {
    throw new Error("Not authenticated. Run `neotoma auth login`.");
  }
  return config.access_token;
}

const PACK_RAT_ART = `
         /\\    /\\
        /  \\__/  \\
       (   o  o   )  ___
        \\   ^    /  (   )
         \\_____/    ) (        Truth layer for AI memory
        /   _   \\  /   \\
       (  ( ) )  )
        \\ /   \\ /  ^   ^
`;

/** Turn raw fetch/network errors into a short, human-readable message. */
function humanReadableApiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const code = err instanceof Error && "cause" in err && (err.cause as NodeJS.ErrnoException)?.code;
  if (msg === "fetch failed" || code === "ECONNREFUSED") {
    return "Server not reachable. Is the API running? Try `neotoma api start`.";
  }
  if (code === "ENOTFOUND") {
    return "Host not found. Check --base-url.";
  }
  if (msg.includes("timeout") || (err instanceof Error && err.name === "AbortError")) {
    return "Request timed out.";
  }
  return msg;
}

/** Check API health; returns status for display in intro. */
async function checkApiStatusForIntro(): Promise<{
  ok: boolean;
  baseUrl?: string;
  latencyMs?: number;
  error?: string;
}> {
  try {
    const config = await readConfig();
    const baseUrl = baseUrlFromOption(program.opts().baseUrl, config).replace(/\/$/, "");
    const healthUrl = `${baseUrl}/health`;
    const start = Date.now();
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });
    const data = (await res.json()) as { ok?: boolean };
    const ok = res.ok && data.ok === true;
    return { ok, baseUrl, latencyMs: Date.now() - start };
  } catch (err) {
    const config = await readConfig().catch(() => ({} as Config));
    const baseUrl = baseUrlFromOption(program.opts().baseUrl, config).replace(/\/$/, "");
    return {
      ok: false,
      baseUrl,
      error: humanReadableApiError(err),
    };
  }
}

const program = new Command();
program
  .name("neotoma")
  .description("Neotoma CLI")
  .option("--base-url <url>", "API base URL", DEFAULT_BASE_URL)
  .option("--json", "Output machine-readable JSON")
  .option("--pretty", "Output formatted JSON for humans");

const authCommand = program.command("auth").description("Authentication commands");

const authLoginCommand = authCommand
  .command("login")
  .description("Login using OAuth PKCE")
  .option("--dev-stub", "Use local dev stub authentication (local backend only)")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const baseUrl = baseUrlFromOption(program.opts().baseUrl, config);
    const loginOptions = authLoginCommand.opts();
    const state = base64UrlEncode(randomBytes(16));
    const verifier = base64UrlEncode(randomBytes(32));
    const challenge = buildCodeChallenge(verifier);

    const { redirectUri, waitForCode } = await startOAuthCallbackServer();

    const authUrl = buildOAuthAuthorizeUrl({
      baseUrl,
      redirectUri,
      state,
      codeChallenge: challenge,
      clientId: "neotoma-cli",
      devStub: Boolean(loginOptions.devStub),
    });

    writeMessage("Opening browser for authorization...", outputMode);
    openBrowser(authUrl);
    if (outputMode !== "json") {
      process.stderr.write("Waiting for you to complete sign-in in the browser...\n");
    }

    const { code, state: returnedState } = await waitForCode;
    if (returnedState !== state) {
      throw new Error("OAuth state mismatch");
    }

    const token = await exchangeToken(baseUrl, code);
    const expiresAt = token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : undefined;

    await writeConfig({
      base_url: baseUrl,
      access_token: token.access_token,
      token_type: token.token_type,
      expires_at: expiresAt,
      connection_id: code,
    });

    writeMessage("Authentication successful.", outputMode);
  });

authCommand
  .command("status")
  .description("Show authentication status and user details")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    if (!config.access_token) {
      writeMessage("Not authenticated.", outputMode);
      return;
    }
    const baseUrl = baseUrlFromOption(program.opts().baseUrl, config);
    const status: Record<string, unknown> = {
      base_url: config.base_url || DEFAULT_BASE_URL,
      connection_id: config.connection_id,
      expires_at: config.expires_at,
      token_expired: isTokenExpired(config),
    };
    try {
      const res = await fetch(`${baseUrl}/api/me`, {
        headers: { Authorization: `Bearer ${config.access_token}` },
      });
      if (res.ok) {
        const me = (await res.json()) as { user_id?: string; email?: string };
        if (me.user_id) status.user_id = me.user_id;
        if (me.email != null) status.email = me.email;
      }
    } catch {
      // Omit user details if /api/me fails (e.g. server unreachable)
    }
    writeOutput(status, outputMode);
  });

authCommand
  .command("logout")
  .description("Clear local auth credentials")
  .action(async () => {
    const outputMode = resolveOutputMode();
    await clearConfig();
    writeMessage("Credentials cleared.", outputMode);
  });

const mcpCommand = program.command("mcp").description("MCP server configuration");

mcpCommand
  .command("config")
  .description("Show MCP configuration guidance for Cursor and other clients")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const baseUrl = baseUrlFromOption(program.opts().baseUrl, config).replace(/\/$/, "");
    const mcpUrl = `${baseUrl}/mcp`;
    const hasAuth = Boolean(
      config.connection_id && config.connection_id !== "your-connection-id"
    );

    const exampleConfig = {
      mcpServers: {
        neotoma: hasAuth
          ? { url: mcpUrl, headers: { "X-Connection-Id": config.connection_id } }
          : { url: mcpUrl },
      },
    };

    if (outputMode === "json") {
      writeOutput(
        {
          cursor_config_path: ".cursor/mcp.json",
          example_config: exampleConfig,
          steps: [
            "Run `neotoma auth login` to create an OAuth connection (or use the web UI).",
            "Add the JSON above to .cursor/mcp.json in your project (or Cursor user config).",
            "Use your connection_id from `neotoma auth status` as X-Connection-Id.",
            "Restart Cursor and use Connect if shown, or rely on X-Connection-Id.",
          ],
          docs: "docs/developer/mcp_cursor_setup.md",
        },
        outputMode
      );
      return;
    }

    process.stdout.write("MCP configuration (Cursor)\n\n");
    process.stdout.write("1. Create an OAuth connection: neotoma auth login\n");
    process.stdout.write("2. Add this to .cursor/mcp.json in your project (or Cursor user config):\n\n");
    process.stdout.write(JSON.stringify(exampleConfig, null, 2) + "\n\n");
    process.stdout.write("3. Use your connection_id from `neotoma auth status` as X-Connection-Id.\n");
    process.stdout.write("4. Restart Cursor. Use Connect if shown; otherwise X-Connection-Id authenticates.\n\n");
    process.stdout.write("Full guide: docs/developer/mcp_cursor_setup.md\n");
  });

const storageCommand = program.command("storage").description("Storage locations and file paths");

storageCommand
  .command("info")
  .description("Show where CLI config and server data are stored (file paths and backend)")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const baseUrl = baseUrlFromOption(program.opts().baseUrl, config).replace(/\/$/, "");

    const storageBackend = process.env.NEOTOMA_STORAGE_BACKEND || "local";
    let projectRoot: string | undefined = process.env.NEOTOMA_PROJECT_ROOT;
    if (!projectRoot) {
      try {
        const pkgPath = path.join(process.cwd(), "package.json");
        const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8")) as { name?: string };
        if (pkg.name === "neotoma") projectRoot = process.cwd();
      } catch {
        // not in neotoma repo
      }
    }

    const dataDir = process.env.NEOTOMA_DATA_DIR || (projectRoot ? path.join(projectRoot, "data") : "data");
    const sqlitePath =
      process.env.NEOTOMA_SQLITE_PATH || (typeof dataDir === "string" && dataDir !== "data" ? path.join(dataDir, "neotoma.db") : "data/neotoma.db");
    const rawStorageDir =
      process.env.NEOTOMA_RAW_STORAGE_DIR || (typeof dataDir === "string" && dataDir !== "data" ? path.join(dataDir, "sources") : "data/sources");
    const eventLogDir =
      process.env.NEOTOMA_EVENT_LOG_DIR || (typeof dataDir === "string" && dataDir !== "data" ? path.join(dataDir, "events") : "data/events");

    const info: Record<string, unknown> = {
      config_file: CONFIG_PATH,
      config_description: "CLI credentials and base URL (local only)",
      server_url: baseUrl,
      server_description: "API base URL (your data is served from this backend).",
      storage_backend: storageBackend,
      storage_paths:
        storageBackend === "local"
          ? {
              data_dir: dataDir,
              sqlite_db: sqlitePath,
              raw_sources: rawStorageDir,
              event_log: eventLogDir,
              description:
                "Local backend: SQLite DB and raw files under data/. Override with NEOTOMA_DATA_DIR, NEOTOMA_SQLITE_PATH, NEOTOMA_RAW_STORAGE_DIR, NEOTOMA_EVENT_LOG_DIR, NEOTOMA_PROJECT_ROOT.",
            }
          : {
              description: "Supabase backend: data is stored in your Supabase project (Postgres + Storage bucket 'sources').",
            },
    };

    if (outputMode === "json") {
      writeOutput(info, outputMode);
      return;
    }

    process.stdout.write("Storage and config locations\n\n");
    process.stdout.write(`Config file (CLI): ${info.config_file}\n`);
    process.stdout.write(`  ${info.config_description}\n\n`);
    process.stdout.write(`Server: ${info.server_url}\n`);
    process.stdout.write(`  ${info.server_description}\n\n`);
    process.stdout.write(`Backend: ${storageBackend}\n`);
    if (storageBackend === "local" && info.storage_paths && typeof info.storage_paths === "object") {
      const paths = info.storage_paths as Record<string, unknown>;
      if (paths.data_dir) process.stdout.write(`  data_dir:    ${paths.data_dir}\n`);
      if (paths.sqlite_db) process.stdout.write(`  sqlite_db:   ${paths.sqlite_db}\n`);
      if (paths.raw_sources) process.stdout.write(`  raw_sources: ${paths.raw_sources}\n`);
      if (paths.event_log) process.stdout.write(`  event_log:   ${paths.event_log}\n`);
      if (paths.description) process.stdout.write(`  ${paths.description}\n`);
    } else if (storageBackend === "supabase" && info.storage_paths && typeof info.storage_paths === "object") {
      const paths = info.storage_paths as Record<string, unknown>;
      if (paths.description) process.stdout.write(`  ${paths.description}\n`);
    }
  });

const apiCommand = program.command("api").description("API runtime status and management");

apiCommand
  .command("status")
  .description("Check if the API server is running")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const baseUrl = baseUrlFromOption(program.opts().baseUrl, config).replace(/\/$/, "");
    const healthUrl = baseUrl + "/health";
    const start = Date.now();
    let ok = false;
    let statusCode: number | undefined;
    let errorMessage: string | undefined;
    try {
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
      statusCode = res.status;
      const data = (await res.json()) as { ok?: boolean };
      ok = res.ok && data.ok === true;
    } catch (err) {
      errorMessage = humanReadableApiError(err);
    }
    const latencyMs = Date.now() - start;

    if (outputMode === "json") {
      writeOutput(
        {
          url: healthUrl,
          status: ok ? "up" : "down",
          status_code: statusCode,
          latency_ms: latencyMs,
          error: errorMessage ?? undefined,
        },
        outputMode
      );
      return;
    }

    if (ok) {
      process.stdout.write("API is up (" + baseUrl + ")\n");
      process.stdout.write("  Latency: " + latencyMs + " ms\n");
    } else {
      process.stderr.write("API is down (" + baseUrl + ")\n");
      if (errorMessage) process.stderr.write("  " + errorMessage + "\n");
      if (statusCode != null && !errorMessage?.includes("HTTP")) {
        process.stderr.write("  HTTP status: " + statusCode + "\n");
      }
    }
  });

apiCommand
  .command("start")
  .description("Start the API server (foreground instructions or background)")
  .option("--background", "Start the server in the background and write logs to ~/.config/neotoma/logs/api.log")
  .action(async (opts: { background?: boolean }) => {
    const outputMode = resolveOutputMode();
    const cwd = process.cwd();

    if (opts.background) {
      let isNeotomaRepo = false;
      try {
        const pkgPath = path.join(cwd, "package.json");
        const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8")) as { name?: string };
        isNeotomaRepo = pkg.name === "neotoma";
      } catch {
        // ignore
      }
      if (!isNeotomaRepo) {
        if (outputMode === "json") {
          writeOutput({ ok: false, error: "Not a Neotoma repo (package.json name must be 'neotoma'). Run from the repo root." }, outputMode);
          return;
        }
        process.stderr.write("Not a Neotoma repo. Run 'neotoma api start --background' from the Neotoma repo root.\n");
        return;
      }

      await fs.mkdir(API_LOGS_DIR, { recursive: true });
      const logStream = (await fs.open(API_LOG_PATH, "a")).createWriteStream();
      const logLine = "\n--- neotoma api start (" + new Date().toISOString() + ") ---\n";
      logStream.write(logLine);

      const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
      const child = spawn(npmCmd, ["run", "dev:server"], {
        cwd,
        detached: true,
        stdio: ["ignore", logStream, logStream],
        env: { ...process.env },
      });
      child.unref();
      await fs.writeFile(API_PID_PATH, String(child.pid ?? ""));

      if (outputMode === "json") {
        writeOutput(
          {
            ok: true,
            pid: child.pid,
            log_file: API_LOG_PATH,
            message: "API server started in background. Use 'neotoma api logs' to view logs.",
          },
          outputMode
        );
        return;
      }
      process.stdout.write("API server started in background.\n");
      process.stdout.write("  PID: " + (child.pid ?? "unknown") + "\n");
      process.stdout.write("  Logs: " + API_LOG_PATH + "\n");
      process.stdout.write("  View logs: neotoma api logs (use --follow to stream)\n");
      return;
    }

    if (outputMode === "json") {
      writeOutput(
        {
          command: "npm run dev:server",
          command_production: "npm run start:api",
          message: "Run in a separate terminal from the Neotoma repo.",
        },
        outputMode
      );
      return;
    }
    process.stdout.write("To start the API server, run in a separate terminal:\n\n");
    process.stdout.write("  npm run dev:server   (development, no UI)\n");
    process.stdout.write("  npm run start:api    (production, after npm run build)\n\n");
    process.stdout.write("Or start in background: neotoma api start --background\n\n");
    process.stdout.write("Default port: 8080. Set HTTP_PORT to use another port.\n");
  });

apiCommand
  .command("stop")
  .description("Stop the API server process on the configured port")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const baseUrl = baseUrlFromOption(program.opts().baseUrl, config).replace(/\/$/, "");
    let port = 8080;
    try {
      const u = new URL(baseUrl);
      if (u.port) port = parseInt(u.port, 10);
      else port = u.protocol === "https:" ? 443 : 80;
    } catch {
      // keep default 8080
    }
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      port = 8080;
    }

    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.join(scriptDir, "..", "..");
    const killPortScript = path.join(repoRoot, "scripts", "kill-port.js");

    let ran = false;
    try {
      const scriptExists = await fs.access(killPortScript).then(() => true).catch(() => false);
      if (scriptExists) {
        execSync("node \"" + killPortScript + "\" " + port, {
          stdio: "inherit",
          cwd: repoRoot,
        });
        ran = true;
      }
    } catch {
      // script failed or not in repo
    }

    if (outputMode === "json") {
      writeOutput(
        {
          port,
          stop_ran: ran,
          message: ran
            ? "Stop command completed for port " + port + "."
            : "Run from repo root to stop: node scripts/kill-port.js " + port,
        },
        outputMode
      );
      return;
    }

    if (ran) {
      process.stdout.write("Stop command completed for port " + port + ".\n");
    } else {
      process.stdout.write("To stop the API server: node scripts/kill-port.js " + port + " (from repo root)\n");
    }
  });

apiCommand
  .command("logs")
  .description("View API server logs (from neotoma api start --background)")
  .option("--lines <n>", "Number of lines to show", "50")
  .option("--follow", "Stream new log lines (like tail -f)")
  .action(async (opts: { lines?: string; follow?: boolean }) => {
    const outputMode = resolveOutputMode();
    const lines = Math.max(1, parseInt(opts.lines ?? "50", 10) || 50);

    let exists = false;
    try {
      await fs.access(API_LOG_PATH);
      exists = true;
    } catch {
      // file missing
    }

    if (!exists) {
      if (outputMode === "json") {
        writeOutput(
          { log_file: API_LOG_PATH, error: "No log file. Start the API with 'neotoma api start --background' to capture logs." },
          outputMode
        );
        return;
      }
      process.stderr.write("No log file found.\n");
      process.stderr.write("Start the API in the background to capture logs: neotoma api start --background\n");
      return;
    }

    if (outputMode === "json" && !opts.follow) {
      const content = await fs.readFile(API_LOG_PATH, "utf-8");
      const allLines = content.split("\n");
      const tail = allLines.slice(-lines);
      writeOutput({ log_file: API_LOG_PATH, lines: tail.length, content: tail.join("\n") }, outputMode);
      return;
    }

    const content = await fs.readFile(API_LOG_PATH, "utf-8");
    const allLines = content.split("\n");
    const tail = allLines.slice(-lines);
    process.stdout.write(tail.join("\n"));
    if (tail.length > 0 && !tail[tail.length - 1]?.endsWith("\n")) {
      process.stdout.write("\n");
    }

    if (opts.follow) {
      process.stdout.write("--- following (Ctrl+C to stop) ---\n");
      let lastSize = (await fs.stat(API_LOG_PATH)).size;
      const interval = setInterval(async () => {
        try {
          const stat = await fs.stat(API_LOG_PATH);
          if (stat.size > lastSize) {
            const fd = await fs.open(API_LOG_PATH, "r");
            const buf = Buffer.alloc(stat.size - lastSize);
            await fd.read(buf, 0, buf.length, lastSize);
            fd.close();
            process.stdout.write(buf.toString("utf-8"));
            lastSize = stat.size;
          }
        } catch {
          clearInterval(interval);
        }
      }, 500);
      const onExit = () => {
        clearInterval(interval);
        process.exit(0);
      };
      process.on("SIGINT", onExit);
      process.on("SIGTERM", onExit);
      return;
    }
  });

const devCommand = program.command("dev").description("Developer commands from package.json scripts");

devCommand
  .command("list")
  .description("List available npm scripts")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const { scripts } = await loadNpmScripts();
    if (outputMode === "json") {
      writeOutput({ scripts }, outputMode);
      return;
    }
    process.stdout.write("Available npm scripts:\n\n");
    for (const script of scripts) {
      process.stdout.write(`  ${script.name}  ->  ${script.command}\n`);
    }
    process.stdout.write("\nRun with: neotoma dev <script> [-- <args>]\n");
  });

devCommand
  .command("run")
  .description("Run an npm script")
  .argument("<script>")
  .allowExcessArguments(true)
  .action(async (scriptName: string, ...rest: unknown[]) => {
    const cmd = rest[rest.length - 1] as Command | undefined;
    const extraArgs = cmd?.args ?? [];
    await runNpmScript(scriptName, extraArgs);
  });

const entitiesCommand = program.command("entities").description("Entity commands");
const sourcesCommand = program.command("sources").description("Source commands");
const observationsCommand = program.command("observations").description("Observation commands");
const relationshipsCommand = program.command("relationships").description("Relationship commands");
const timelineCommand = program.command("timeline").description("Timeline commands");
const schemasCommand = program.command("schemas").description("Schema commands");

entitiesCommand
  .command("list")
  .description("List entities")
  .option("--type <entityType>", "Filter by entity type")
  .option("--search <query>", "Search by canonical name")
  .option("--limit <n>", "Limit", "100")
  .option("--offset <n>", "Offset", "0")
  .option("--include-merged", "Include merged entities")
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await requireToken(config);
    const api = createApiClient({ baseUrl: baseUrlFromOption(program.opts().baseUrl, config), token });
    const { data, error } = await api.POST("/api/entities/query", {
      body: {
        entity_type: opts.type,
        search: opts.search,
        limit: Number(opts.limit),
        offset: Number(opts.offset),
        include_merged: Boolean(opts.includeMerged),
      },
    });
    if (error) throw new Error("Failed to list entities");
    writeOutput(data, outputMode);
  });

entitiesCommand
  .command("get")
  .description("Get entity by ID")
  .argument("<id>", "Entity ID")
  .action(async (id: string) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await requireToken(config);
    const api = createApiClient({ baseUrl: baseUrlFromOption(program.opts().baseUrl, config), token });
    const { data, error } = await api.GET("/api/entities/{id}", {
      params: { path: { id } },
    });
    if (error) throw new Error("Failed to fetch entity");
    writeOutput(data, outputMode);
  });

sourcesCommand
  .command("list")
  .description("List sources")
  .option("--search <query>", "Search by filename or ID")
  .option("--mime-type <mimeType>", "Filter by MIME type")
  .option("--limit <n>", "Limit", "100")
  .option("--offset <n>", "Offset", "0")
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await requireToken(config);
    const api = createApiClient({ baseUrl: baseUrlFromOption(program.opts().baseUrl, config), token });
    const { data, error } = await api.GET("/api/sources", {
      params: {
        query: {
          search: opts.search,
          mime_type: opts.mimeType,
          limit: Number(opts.limit),
          offset: Number(opts.offset),
        },
      },
    });
    if (error) throw new Error("Failed to list sources");
    writeOutput(data, outputMode);
  });

observationsCommand
  .command("list")
  .description("List observations")
  .option("--entity-id <id>", "Filter by entity ID")
  .option("--entity-type <type>", "Filter by entity type")
  .option("--limit <n>", "Limit", "100")
  .option("--offset <n>", "Offset", "0")
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await requireToken(config);
    const api = createApiClient({ baseUrl: baseUrlFromOption(program.opts().baseUrl, config), token });
    const { data, error } = await api.POST("/api/observations/query", {
      body: {
        entity_id: opts.entityId,
        entity_type: opts.entityType,
        limit: Number(opts.limit),
        offset: Number(opts.offset),
      },
    });
    if (error) throw new Error("Failed to list observations");
    writeOutput(data, outputMode);
  });

relationshipsCommand
  .command("list")
  .description("List relationships for an entity")
  .argument("<entityId>", "Entity ID")
  .option("--direction <direction>", "Direction: inbound, outbound, both", "both")
  .action(async (entityId: string, opts) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await requireToken(config);
    const api = createApiClient({ baseUrl: baseUrlFromOption(program.opts().baseUrl, config), token });
    const { data, error } = await api.POST("/list_relationships", {
      body: {
        entity_id: entityId,
        direction: opts.direction,
      },
    });
    if (error) throw new Error("Failed to list relationships");
    writeOutput(data, outputMode);
  });

timelineCommand
  .command("list")
  .description("List timeline events")
  .option("--start-date <date>", "Filter start date")
  .option("--end-date <date>", "Filter end date")
  .option("--event-type <type>", "Filter by event type")
  .option("--limit <n>", "Limit", "100")
  .option("--offset <n>", "Offset", "0")
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await requireToken(config);
    const api = createApiClient({ baseUrl: baseUrlFromOption(program.opts().baseUrl, config), token });
    const { data, error } = await api.GET("/api/timeline", {
      params: {
        query: {
          start_date: opts.startDate,
          end_date: opts.endDate,
          event_type: opts.eventType,
          limit: Number(opts.limit),
          offset: Number(opts.offset),
        },
      },
    });
    if (error) throw new Error("Failed to list timeline events");
    writeOutput(data, outputMode);
  });

schemasCommand
  .command("list")
  .description("List schemas")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await requireToken(config);
    const api = createApiClient({ baseUrl: baseUrlFromOption(program.opts().baseUrl, config), token });
    const { data, error } = await api.GET("/api/schemas", {});
    if (error) throw new Error("Failed to list schemas");
    writeOutput(data, outputMode);
  });

schemasCommand
  .command("get")
  .description("Get schema by entity type")
  .argument("<entityType>", "Entity type")
  .action(async (entityType: string) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await requireToken(config);
    const api = createApiClient({ baseUrl: baseUrlFromOption(program.opts().baseUrl, config), token });
    const { data, error } = await api.GET("/api/schemas/{entity_type}", {
      params: { path: { entity_type: entityType } },
    });
    if (error) throw new Error("Failed to fetch schema");
    writeOutput(data, outputMode);
  });

program
  .command("store")
  .description("Store structured entities from JSON")
  .option("--json <json>", "Inline JSON array of entities")
  .option("--file <path>", "Path to JSON file containing entity array")
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await requireToken(config);
    const api = createApiClient({ baseUrl: baseUrlFromOption(program.opts().baseUrl, config), token });

    let entities: unknown;
    if (opts.json) {
      entities = JSON.parse(opts.json);
    } else if (opts.file) {
      const raw = await fs.readFile(opts.file, "utf-8");
      entities = JSON.parse(raw);
    } else {
      throw new Error("Provide --json or --file with entity array");
    }

    if (!Array.isArray(entities)) {
      throw new Error("Entities must be an array");
    }

    const idempotencyKey = createIdempotencyKey({ entities });
    const { data, error } = await api.POST("/api/store", {
      body: { entities, idempotency_key: idempotencyKey },
    });
    if (error) throw new Error("Failed to store entities");
    writeOutput(data, outputMode);
  });

program
  .command("stats")
  .description("Get dashboard stats")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await requireToken(config);
    const api = createApiClient({ baseUrl: baseUrlFromOption(program.opts().baseUrl, config), token });
    const { data, error } = await api.GET("/api/stats", {});
    if (error) throw new Error("Failed to fetch stats");
    writeOutput(data, outputMode);
  });

program
  .command("mcp-only")
  .description("Call an MCP tool that is not mapped to OpenAPI")
  .requiredOption("--tool <name>", "MCP tool name")
  .requiredOption("--user-id <id>", "Authenticated user ID for local execution")
  .option("--args <json>", "JSON args payload")
  .action(async (opts) => {
    const outputMode = resolveOutputMode();

    const args = parseOptionalJson(opts.args);
    if (opts.args && typeof args !== "object") {
      throw new Error("Invalid JSON for --args");
    }

    const { NeotomaServer } = await import("../server.js");
    const server = new NeotomaServer();
    const result = await server.executeToolForCli(opts.tool, args ?? {}, opts.userId);
    writeOutput(result, outputMode);
  });

program
  .command("request")
  .description("Call an OpenAPI operation by operationId")
  .requiredOption("--operation <id>", "OpenAPI operationId")
  .option("--params <json>", "JSON with { path, query, body }")
  .option("--body <json>", "JSON body override")
  .option("--query <json>", "JSON query override")
  .option("--path <json>", "JSON path override")
  .option("--skip-auth", "Skip auth token for public endpoints")
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const operation = getOpenApiOperationMapping(opts.operation);
    if (!operation) {
      throw new Error("Unknown operationId: " + opts.operation);
    }

    const baseUrl = baseUrlFromOption(program.opts().baseUrl, config);
    const token = opts.skipAuth ? undefined : await requireToken(config);
    const api = createApiClient({ baseUrl, token });

    const params = parseOptionalJson(opts.params);
    const body = parseOptionalJson(opts.body);
    const query = parseOptionalJson(opts.query);
    const pathParams = parseOptionalJson(opts.path);

    const requestParams: Record<string, unknown> =
      params && typeof params === "object"
        ? { ...(params as Record<string, unknown>) }
        : {};

    if (body) {
      requestParams.body = body;
    }
    if (query) {
      requestParams.params = {
        ...(requestParams.params as Record<string, unknown> | undefined),
        query,
      };
    }
    if (pathParams) {
      requestParams.params = {
        ...(requestParams.params as Record<string, unknown> | undefined),
        path: pathParams,
      };
    }

    const method = operation.method.toUpperCase();
    const handler = (api as unknown as Record<string, unknown>)[method] as
      | ((path: string, params: Record<string, unknown>) => Promise<{
          data?: unknown;
          error?: unknown;
        }>)
      | undefined;

    if (!handler) {
      throw new Error("Unsupported method for request: " + operation.method);
    }

    const { data, error } = await handler(operation.path, requestParams);
    if (error) {
      throw new Error("Request failed: " + formatApiError(error));
    }
    writeOutput(data, outputMode);
  });

let devCommandsReady = false;
async function ensureDevCommands(): Promise<void> {
  if (devCommandsReady) return;
  devCommandsReady = true;
  const result = await loadNpmScripts().catch(() => null);
  if (!result) return;
  for (const script of result.scripts) {
    devCommand
      .command(script.name)
      .description(`Run: npm run ${script.name}`)
      .allowExcessArguments(true)
      .action(async (...rest: unknown[]) => {
        const cmd = rest[rest.length - 1] as Command | undefined;
        const extraArgs = cmd?.args ?? [];
        await runNpmScript(script.name, extraArgs);
      });
  }
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  await ensureDevCommands();
  const args = argv.slice(2);
  if (args.length === 0) {
    process.stdout.write(PACK_RAT_ART + "\n");
    const apiStatus = await checkApiStatusForIntro();
    if (apiStatus.ok && apiStatus.baseUrl != null) {
      process.stdout.write(
        "API: up (" + apiStatus.baseUrl + ")" + (apiStatus.latencyMs != null ? " " + apiStatus.latencyMs + " ms" : "") + "\n\n"
      );
    } else {
      process.stdout.write(
        "API: down" + (apiStatus.baseUrl ? " (" + apiStatus.baseUrl + ")" : "") + (apiStatus.error ? " — " + apiStatus.error : "") + "\n\n"
      );
    }
    program.outputHelp();
    process.exit(0);
  }
  await program.parseAsync(argv);
}

const entryPath = process.argv[1];
let isMain = false;
if (typeof entryPath === "string") {
  try {
    const resolvedArgv = realpathSync(entryPath);
    const resolvedModule = realpathSync(fileURLToPath(import.meta.url));
    isMain = resolvedArgv === resolvedModule;
  } catch {
    isMain = pathToFileURL(entryPath).href === import.meta.url;
  }
}
if (isMain) {
  runCli(process.argv).catch((err: unknown) => {
    writeCliError(err);
    process.exit(1);
  });
}
