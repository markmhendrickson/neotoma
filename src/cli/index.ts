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

import { config as appConfig } from "../config.js";
import { getMcpAuthToken } from "../crypto/mcp_auth_token.js";
import { createApiClient } from "../shared/api_client.js";
import { getOpenApiOperationMapping } from "../shared/contract_mappings.js";
import {
  API_LOG_PATH,
  API_LOGS_DIR,
  API_PID_PATH,
  CONFIG_PATH,
  DEFAULT_BASE_URL,
  clearConfig,
  isTokenExpired,
  readConfig,
  resolveBaseUrl,
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

/** Turn raw fetch/network errors into a short, human-readable message. */
function humanReadableApiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const code = err instanceof Error && "cause" in err && (err.cause as NodeJS.ErrnoException)?.code;
  if (msg === "fetch failed" || code === "ECONNREFUSED") {
    return "Server not reachable. Is the API running? Try `neotoma api start`. If the API is on port 8082 (e.g. npm run dev:prod), use --base-url http://localhost:8082";
  }
  if (code === "ENOTFOUND") {
    return "Host not found. Check --base-url.";
  }
  if (msg.includes("timeout") || (err instanceof Error && err.name === "AbortError")) {
    return "Request timed out.";
  }
  return msg;
}

function formatCliError(err: unknown): string {
  const human = humanReadableApiError(err);
  let detail: string | undefined;
  if (err instanceof Error && err.cause) {
    const c = err.cause as NodeJS.ErrnoException & { message?: string };
    if (typeof c.message === "string" && c.message) detail = c.message;
    else if (c.code) detail = String(c.code);
  }
  if (detail) return `${human} (${detail})`;
  return human;
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

/**
 * Resolve CLI auth token using same patterns as MCP.
 * Encryption off: NEOTOMA_DEV_TOKEN only, or no token (API treats no Bearer as dev-local).
 * Encryption on: key-derived token (requires NEOTOMA_KEY_FILE_PATH or NEOTOMA_MNEMONIC).
 */
async function getCliToken(): Promise<string | undefined> {
  if (appConfig.encryption.enabled) {
    const token = getMcpAuthToken();
    if (!token) {
      throw new Error(
        "Encryption is enabled but no key configured. Set NEOTOMA_KEY_FILE_PATH or NEOTOMA_MNEMONIC."
      );
    }
    return token;
  }
  if (process.env.NEOTOMA_DEV_TOKEN) return process.env.NEOTOMA_DEV_TOKEN;
  return undefined;
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

/** Check API health; returns status for display in intro. */
async function checkApiStatusForIntro(): Promise<{
  ok: boolean;
  baseUrl?: string;
  latencyMs?: number;
  error?: string;
}> {
  try {
    const config = await readConfig();
    const baseUrl = (await resolveBaseUrl(program.opts().baseUrl, config)).replace(/\/$/, "");
    const healthUrl = `${baseUrl}/health`;
    const start = Date.now();
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });
    const data = (await res.json()) as { ok?: boolean };
    const ok = res.ok && data.ok === true;
    return { ok, baseUrl, latencyMs: Date.now() - start };
  } catch (err) {
    const config = await readConfig().catch(() => ({} as Config));
    const baseUrl = (await resolveBaseUrl(program.opts().baseUrl, config)).replace(/\/$/, "");
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
  .option("--base-url <url>", "API base URL (default: auto-detect 8082 or 8080)")
  .option("--json", "Output machine-readable JSON")
  .option("--pretty", "Output formatted JSON for humans");

// No preAction auth validation: CLI uses MCP-style auth (key-derived or no token),
// not stored OAuth. auth login remains for MCP Connect (Cursor) setup.

const authCommand = program.command("auth").description("Authentication commands");

const authLoginCommand = authCommand
  .command("login")
  .description("Login using OAuth PKCE")
  .option("--dev-stub", "Use local dev stub authentication (local backend only)")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const baseUrl = await resolveBaseUrl(program.opts().baseUrl, config);
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
    const baseUrl = await resolveBaseUrl(program.opts().baseUrl, config);
    let token: string | undefined;
    try {
      token = await getCliToken();
    } catch (err) {
      writeMessage(formatCliError(err), outputMode);
      process.exitCode = 1;
      return;
    }
    const status: Record<string, unknown> = {
      base_url: config.base_url || DEFAULT_BASE_URL,
      connection_id: config.connection_id,
      auth_mode: appConfig.encryption.enabled ? "key-derived" : token ? "dev-token" : "none",
    };
    if (config.expires_at) status.expires_at = config.expires_at;
    if (config.access_token) status.token_expired = isTokenExpired(config);
    try {
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${baseUrl}/api/me`, { headers });
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

authCommand
  .command("mcp-token")
  .description(
    "Print MCP auth token derived from your private key (when encryption is enabled). Add to mcp.json: headers.Authorization = 'Bearer <token>'"
  )
  .action(async () => {
    const outputMode = resolveOutputMode();
    const keyFilePath = process.env.NEOTOMA_KEY_FILE_PATH || "";
    const mnemonic = process.env.NEOTOMA_MNEMONIC || "";
    const mnemonicPassphrase = process.env.NEOTOMA_MNEMONIC_PASSPHRASE || "";
    const { deriveMcpAuthToken, hexToKey, mnemonicToSeed } = await import(
      "../crypto/key_derivation.js"
    );
    const { readFileSync } = await import("fs");
    let token: string;
    if (keyFilePath) {
      const raw = readFileSync(keyFilePath, "utf8").trim();
      token = deriveMcpAuthToken(hexToKey(raw));
    } else if (mnemonic) {
      const seed = mnemonicToSeed(mnemonic, mnemonicPassphrase);
      token = deriveMcpAuthToken(seed);
    } else {
      if (outputMode === "json") {
        process.stdout.write(JSON.stringify({ error: "Set NEOTOMA_KEY_FILE_PATH or NEOTOMA_MNEMONIC" }) + "\n");
      } else {
        process.stderr.write(
          "Set NEOTOMA_KEY_FILE_PATH or NEOTOMA_MNEMONIC to derive the MCP token.\n"
        );
      }
      process.exitCode = 1;
      return;
    }
    if (outputMode === "json") {
      process.stdout.write(JSON.stringify({ token }) + "\n");
    } else {
      process.stdout.write(`${token}\n`);
      process.stderr.write(
        "Add to .cursor/mcp.json under neotoma: \"headers\": { \"Authorization\": \"Bearer <token>\" }\n"
      );
    }
  });

const mcpCommand = program.command("mcp").description("MCP server configuration");

mcpCommand
  .command("config")
  .description("Show MCP configuration guidance for Cursor and other clients")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const baseUrl = (await resolveBaseUrl(program.opts().baseUrl, config)).replace(/\/$/, "");
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

program
  .command("watch")
  .description("Stream record changes from the database as they happen (local backend only)")
  .option("--interval <ms>", "Polling interval in ms", "400")
  .option("--json", "Output NDJSON (one JSON object per line)")
  .option("--human", "Output one plain line per change (no timestamps, emoji, or IDs)")
  .option("--tail", "Only show changes from now (skip existing records)")
  .action(async (opts: { interval?: string; json?: boolean; human?: boolean; tail?: boolean }) => {
    const storageBackend = process.env.NEOTOMA_STORAGE_BACKEND || "local";
    if (storageBackend !== "local") {
      process.stderr.write(
        "neotoma watch requires local backend. Set NEOTOMA_STORAGE_BACKEND=local or use Supabase Realtime for remote.\n"
      );
      process.exit(1);
    }

    const config = await readConfig();
    let token: string | undefined;
    try {
      token = await getCliToken();
    } catch {
      process.stderr.write(
        "neotoma watch requires auth. Set NEOTOMA_KEY_FILE_PATH or NEOTOMA_MNEMONIC when encryption is on.\n"
      );
      process.exit(1);
    }
    const baseUrl = (await resolveBaseUrl(program.opts().baseUrl, config)).replace(/\/$/, "");
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let userId: string;
    try {
      const res = await fetch(`${baseUrl}/api/me`, { headers });
      if (!res.ok) {
        process.stderr.write("neotoma watch: could not resolve user. Run `neotoma auth login` and ensure the API is running.\n");
        process.exit(1);
      }
      const me = (await res.json()) as { user_id?: string };
      if (!me.user_id) {
        process.stderr.write("neotoma watch: API did not return user_id. Ensure the API is running and you are authenticated.\n");
        process.exit(1);
      }
      userId = me.user_id;
    } catch (err) {
      process.stderr.write(
        "neotoma watch: could not reach API to resolve user. " +
          (err instanceof Error ? err.message : String(err)) +
          ". Run `neotoma auth login` and ensure the API is running.\n"
      );
      process.exit(1);
    }

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
    const defaultDbFile =
      (process.env.NEOTOMA_ENV || process.env.NODE_ENV || "development") === "production"
        ? "neotoma.prod.db"
        : "neotoma.db";
    const sqlitePath = process.env.NEOTOMA_SQLITE_PATH || path.join(dataDir, defaultDbFile);

    const resolvedPath = path.isAbsolute(sqlitePath) ? sqlitePath : path.join(process.cwd(), sqlitePath);
    try {
      await fs.access(resolvedPath);
    } catch {
      process.stderr.write(`neotoma watch: SQLite DB not found at ${resolvedPath}. Start the API and ingest data first.\n`);
      process.exit(1);
    }

    // Open read-write so we can attach to WAL/shm; we only run SELECT. Opening readonly
    // while the API has the DB in WAL mode often causes "disk I/O error" (readers need shm access).
    const { default: Database } = await import("better-sqlite3");
    const db = new Database(resolvedPath);
    db.pragma("busy_timeout = 2000");

    type TableDef = { table: string; idCol: string; tsCol: string; userFilter?: "user_id" | "source_user" };
    const tableDefs: TableDef[] = [
      { table: "sources", idCol: "id", tsCol: "created_at" },
      { table: "entities", idCol: "id", tsCol: "created_at" },
      { table: "observations", idCol: "id", tsCol: "created_at" },
      { table: "relationship_observations", idCol: "id", tsCol: "created_at" },
      { table: "timeline_events", idCol: "id", tsCol: "created_at" },
      { table: "interpretations", idCol: "id", tsCol: "started_at", userFilter: "source_user" },
      { table: "entity_snapshots", idCol: "entity_id", tsCol: "computed_at" },
      { table: "raw_fragments", idCol: "id", tsCol: "created_at" },
      { table: "entity_merges", idCol: "id", tsCol: "created_at" },
      { table: "relationship_snapshots", idCol: "relationship_key", tsCol: "computed_at" },
    ];

    const TABLE_EMOJI: Record<string, string> = {
      sources: "📄",
      entities: "👤",
      observations: "👁️",
      relationship_observations: "🔗",
      timeline_events: "📅",
      interpretations: "🔄",
      entity_snapshots: "📊",
      raw_fragments: "📝",
      entity_merges: "🔀",
      relationship_snapshots: "🔗",
    };

    function fetchEntityNames(entityIds: Set<string>, forUserId: string): Map<string, string> {
      const map = new Map<string, string>();
      if (entityIds.size === 0) return map;
      try {
        const placeholders = Array.from(entityIds).map(() => "?").join(",");
        const stmt = db.prepare(
          `SELECT id, canonical_name FROM entities WHERE id IN (${placeholders}) AND user_id = ?`
        );
        const rows = stmt.all(...entityIds, forUserId) as { id: string; canonical_name: string }[];
        for (const r of rows) map.set(r.id, r.canonical_name);
      } catch {
        // entities table may not exist or may lack user_id
      }
      return map;
    }

    function formatWatchSummary(
      table: string,
      row: Record<string, unknown>,
      entityNames: Map<string, string>
    ): string {
      const v = (k: string) => String(row[k] ?? "").slice(0, 36);
      const name = (id: string) => entityNames.get(id) ?? id.slice(0, 12) + "…";
      switch (table) {
        case "sources":
          return v("original_filename") || v("mime_type") || "source";
        case "entities":
          return `${v("entity_type")}: ${v("canonical_name")}`;
        case "observations":
          return `${v("entity_type")} obs for ${name(v("entity_id"))}`;
        case "relationship_observations":
          return `${v("relationship_type")} ${name(v("source_entity_id"))} → ${name(v("target_entity_id"))}`;
        case "timeline_events":
          return `${v("event_type")} @ ${v("event_timestamp")}`;
        case "interpretations":
          return `${v("status")} (source: ${v("source_id").slice(0, 8)}…)`;
        case "entity_snapshots":
          return `${v("entity_type")} ${name(v("entity_id"))} (${row.observation_count ?? 0} obs)`;
        case "raw_fragments":
          return `${v("entity_type")}.${v("fragment_key")}`;
        case "entity_merges":
          return `${name(v("from_entity_id"))} → ${name(v("to_entity_id"))}`;
        case "relationship_snapshots":
          return `${v("relationship_type")} ${name(v("source_entity_id"))} → ${name(v("target_entity_id"))} (${row.observation_count ?? 0} obs)`;
        default:
          return "";
      }
    }

    function formatWatchSentence(
      table: string,
      row: Record<string, unknown>,
      entityNames: Map<string, string>
    ): string {
      const v = (k: string) => String(row[k] ?? "").trim();
      const q = (s: string) => (s ? `"${s}"` : "");
      const name = (id: string) => entityNames.get(id) || id.slice(0, 12) + "…";
      const relPerson = (id: string) => {
        const n = entityNames.get(id);
        return n ? `person "${n}"` : `"${id.slice(0, 12)}…"`;
      };
      const entityWithType = (id: string, entityType: string) => {
        const n = entityNames.get(id);
        return n ? `${entityType} "${n}"` : `"${id.slice(0, 12)}…"`;
      };
      switch (table) {
        case "sources":
          return `Created source ${q(v("original_filename") || v("mime_type") || "unknown")}`;
        case "entities": {
          const type = v("entity_type") || "entity";
          return `Created ${type} ${q(v("canonical_name"))}`;
        }
        case "observations": {
          const entityType = v("entity_type") || "entity";
          return `Created observation for ${entityWithType(v("entity_id"), entityType)}`;
        }
        case "relationship_observations":
          return `Created relationship ${q(v("relationship_type"))} for ${relPerson(v("source_entity_id"))} with ${relPerson(v("target_entity_id"))}`;
        case "timeline_events":
          return `Created timeline event ${q(v("event_type"))} at ${v("event_timestamp") || "unknown"}`;
        case "interpretations":
          return `Created interpretation for source ${q(String(v("source_id")).slice(0, 12) + "…")}`;
        case "entity_snapshots":
          return `Updated snapshot for ${relPerson(v("entity_id"))} (${row.observation_count ?? 0} observations)`;
        case "raw_fragments":
          return `Created fragment ${q(v("entity_type") + "." + v("fragment_key"))}`;
        case "entity_merges":
          return `Merged ${q(name(v("from_entity_id")))} into ${q(name(v("to_entity_id")))}`;
        case "relationship_snapshots":
          return `Updated relationship ${q(v("relationship_type"))} for ${relPerson(v("source_entity_id"))} with ${relPerson(v("target_entity_id"))}`;
        default:
          return `Created ${table} record`;
      }
    }

    const now = new Date().toISOString();
    const cursors: Record<string, string> = opts.tail ? Object.fromEntries(tableDefs.map((t) => [t.table, now])) : {};
    const intervalMs = Math.max(100, parseInt(opts.interval ?? "400", 10) || 400);
    const jsonMode = Boolean(opts.json);
    const humanMode = Boolean(opts.human);

    if (!jsonMode && !humanMode) {
      process.stderr.write("Streaming record changes (Ctrl+C to stop)\n");
      process.stderr.write(`  DB: ${resolvedPath}\n`);
      process.stderr.write(`  User: ${userId}\n`);
      process.stderr.write(`  Poll interval: ${intervalMs} ms\n`);
      process.stderr.write("---\n");
    }

    function collectEntityIds(table: string, rows: Record<string, unknown>[]): Set<string> {
      const ids = new Set<string>();
      for (const row of rows) {
        const add = (k: string) => {
          const val = row[k];
          if (val && typeof val === "string") ids.add(val);
        };
        if (table === "observations") add("entity_id");
        else if (table === "relationship_observations" || table === "relationship_snapshots") {
          add("source_entity_id");
          add("target_entity_id");
        }
        else if (table === "entity_snapshots") add("entity_id");
        else if (table === "entity_merges") {
          add("from_entity_id");
          add("to_entity_id");
        }
      }
      return ids;
    }

    function poll(): void {
      for (const { table, idCol, tsCol, userFilter } of tableDefs) {
        try {
          const cursor = cursors[table] ?? "1970-01-01T00:00:00Z";
          const userClause =
            userFilter === "source_user"
              ? "source_id IN (SELECT id FROM sources WHERE user_id = ?)"
              : "user_id = ?";
          const stmt = db.prepare(
            `SELECT * FROM ${table} WHERE ${tsCol} IS NOT NULL AND ${tsCol} > ? AND ${userClause} ORDER BY ${tsCol} ASC LIMIT 100`
          );
          const rows = stmt.all(cursor, userId) as Record<string, unknown>[];
          const entityNames = fetchEntityNames(collectEntityIds(table, rows), userId);

          for (const row of rows) {
            const ts = String(row[tsCol] ?? "");
            if (ts && (!cursors[table] || ts > cursors[table])) {
              cursors[table] = ts;
            }
            const id = row[idCol];
            const payload = sortKeys(row) as Record<string, unknown>;
            const summary = formatWatchSummary(table, row, entityNames);
            const event = {
              table,
              emoji: TABLE_EMOJI[table] ?? "•",
              summary,
              operation: "insert",
              id: id ?? null,
              ts_col: tsCol,
              ts: ts || null,
              payload,
            };

            if (jsonMode) {
              process.stdout.write(JSON.stringify(event) + "\n");
            } else if (humanMode) {
              const line = formatWatchSentence(table, row, entityNames);
              process.stdout.write(line + "\n");
            } else {
              const emoji = TABLE_EMOJI[table] ?? "•";
              const tsStr = ts ? new Date(ts).toISOString() : "";
              process.stdout.write(`[${tsStr}] ${emoji} ${table} ${String(id)}  ${summary}\n`);
            }
          }
        } catch (err) {
          // Table may not exist or column may differ
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes("no such table")) {
            process.stderr.write(`neotoma watch: ${table}: ${msg}\n`);
          }
        }
      }
    }

    poll();
    const interval = setInterval(poll, intervalMs);
    const onExit = () => {
      clearInterval(interval);
      db.close();
      process.exit(0);
    };
    process.on("SIGINT", onExit);
    process.on("SIGTERM", onExit);
  });

const storageCommand = program.command("storage").description("Storage locations and file paths");

storageCommand
  .command("info")
  .description("Show where CLI config and server data are stored (file paths and backend)")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const baseUrl = (await resolveBaseUrl(program.opts().baseUrl, config)).replace(/\/$/, "");

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
    const isProd = (process.env.NEOTOMA_ENV || process.env.NODE_ENV || "development") === "production";
    const defaultDbFile = isProd ? "neotoma.prod.db" : "neotoma.db";
    const sqlitePath = process.env.NEOTOMA_SQLITE_PATH || path.join(dataDir, defaultDbFile);
    const rawStorageSubdir = isProd ? "sources_prod" : "sources";
    const eventLogSubdir = isProd ? "events_prod" : "events";
    const logsSubdir = isProd ? "logs_prod" : "logs";
    const rawStorageDir =
      process.env.NEOTOMA_RAW_STORAGE_DIR || (typeof dataDir === "string" && dataDir !== "data" ? path.join(dataDir, rawStorageSubdir) : path.join("data", rawStorageSubdir));
    const eventLogDir =
      process.env.NEOTOMA_EVENT_LOG_DIR || (typeof dataDir === "string" && dataDir !== "data" ? path.join(dataDir, eventLogSubdir) : path.join("data", eventLogSubdir));
    const logsDir =
      process.env.NEOTOMA_LOGS_DIR || (typeof dataDir === "string" && dataDir !== "data" ? path.join(dataDir, logsSubdir) : path.join("data", logsSubdir));

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
              logs: logsDir,
              description:
                "Local backend: SQLite DB and raw files under data/. Defaults are env-specific (dev: data/sources, data/events, data/logs, neotoma.db; prod: data/sources_prod, data/events_prod, data/logs_prod, neotoma.prod.db). Override with NEOTOMA_DATA_DIR, NEOTOMA_SQLITE_PATH, NEOTOMA_RAW_STORAGE_DIR, NEOTOMA_EVENT_LOG_DIR, NEOTOMA_LOGS_DIR, NEOTOMA_PROJECT_ROOT.",
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
      if (paths.logs) process.stdout.write(`  logs:        ${paths.logs}\n`);
      if (paths.description) process.stdout.write(`  ${paths.description}\n`);
    } else if (storageBackend === "supabase" && info.storage_paths && typeof info.storage_paths === "object") {
      const paths = info.storage_paths as Record<string, unknown>;
      if (paths.description) process.stdout.write(`  ${paths.description}\n`);
    }
  });

// ── Backup & Restore ──────────────────────────────────────────────────────

const backupCommand = program.command("backup").description("Backup encrypted neotoma.db and data files");

backupCommand
  .command("create")
  .description("Create a backup of the local database, sources, and event logs")
  .option("--output <dir>", "Output directory for the backup", "./backups")
  .action(async (opts: { output: string }) => {
    const outputMode = resolveOutputMode();
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
    const isProd = (process.env.NEOTOMA_ENV || process.env.NODE_ENV || "development") === "production";
    const defaultDbFile = isProd ? "neotoma.prod.db" : "neotoma.db";
    const sqlitePath = process.env.NEOTOMA_SQLITE_PATH || path.join(dataDir, defaultDbFile);
    const rawStorageSubdir = isProd ? "sources_prod" : "sources";
    const eventLogSubdir = isProd ? "events_prod" : "events";
    const logsSubdir = isProd ? "logs_prod" : "logs";
    const rawStorageDir = process.env.NEOTOMA_RAW_STORAGE_DIR || path.join(dataDir, rawStorageSubdir);
    const eventLogDir = process.env.NEOTOMA_EVENT_LOG_DIR || path.join(dataDir, eventLogSubdir);
    const logsDir = process.env.NEOTOMA_LOGS_DIR || path.join(dataDir, logsSubdir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const backupDir = path.join(opts.output, `neotoma-backup-${timestamp}`);

    await fs.mkdir(backupDir, { recursive: true });

    const manifest: Record<string, unknown> = {
      version: "1.0",
      created_at: new Date().toISOString(),
      contents: {} as Record<string, string>,
      checksums: {} as Record<string, string>,
      encrypted: process.env.NEOTOMA_ENCRYPTION_ENABLED === "true",
      key_required: "User must preserve private key file (~/.neotoma/keys/) or mnemonic phrase for restore",
    };
    const contents = manifest.contents as Record<string, string>;
    const checksums = manifest.checksums as Record<string, string>;

    // Copy SQLite DB using file copy (better-sqlite3 backup API requires the DB instance)
    try {
      await fs.access(sqlitePath);
      const destDb = path.join(backupDir, path.basename(sqlitePath));
      await fs.copyFile(sqlitePath, destDb);
      contents.neotoma_db = path.basename(sqlitePath);

      // Compute checksum
      const dbBuf = await fs.readFile(destDb);
      checksums[path.basename(sqlitePath)] = "sha256:" + createHash("sha256").update(dbBuf).digest("hex");

      // WAL file
      const walPath = sqlitePath + "-wal";
      try {
        await fs.access(walPath);
        await fs.copyFile(walPath, path.join(backupDir, path.basename(walPath)));
        contents.wal = path.basename(walPath);
      } catch {
        // No WAL file
      }
    } catch {
      writeCliError("SQLite database not found at " + sqlitePath);
    }

    // Copy sources directory
    try {
      await fs.access(rawStorageDir);
      const destSources = path.join(backupDir, "sources");
      await fs.cp(rawStorageDir, destSources, { recursive: true });
      contents.sources = "sources/";
    } catch {
      // No sources directory
    }

    // Copy event log directory
    for (const dir of [eventLogDir, logsDir]) {
      try {
        await fs.access(dir);
        const dirName = path.basename(dir);
        await fs.cp(dir, path.join(backupDir, dirName), { recursive: true });
        contents[dirName] = dirName + "/";
      } catch {
        // Directory does not exist
      }
    }

    // Write manifest
    await fs.writeFile(
      path.join(backupDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
    );

    const result = {
      status: "complete",
      backup_dir: backupDir,
      contents,
      encrypted: manifest.encrypted,
    };

    if (outputMode === "json") {
      writeOutput(result, outputMode);
    } else {
      process.stdout.write(`Backup complete: ${backupDir}\n`);
      for (const [key, val] of Object.entries(contents)) {
        process.stdout.write(`  ${key}: ${val}\n`);
      }
      if (manifest.encrypted) {
        process.stdout.write("\nData is encrypted. Preserve your key file or mnemonic phrase for restore.\n");
      }
    }
  });

backupCommand
  .command("restore")
  .description("Restore a backup into the data directory")
  .requiredOption("--from <dir>", "Backup directory to restore from")
  .option("--target <dir>", "Target data directory (default: NEOTOMA_DATA_DIR or ./data)")
  .action(async (opts: { from: string; target?: string }) => {
    const outputMode = resolveOutputMode();
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

    const targetDir = opts.target || process.env.NEOTOMA_DATA_DIR || (projectRoot ? path.join(projectRoot, "data") : "data");

    // Read manifest
    const manifestPath = path.join(opts.from, "manifest.json");
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
    } catch {
      writeCliError("No manifest.json found in backup directory: " + opts.from);
      return;
    }

    const contents = (manifest.contents || {}) as Record<string, string>;
    await fs.mkdir(targetDir, { recursive: true });

    // Restore DB
    if (contents.neotoma_db) {
      await fs.copyFile(
        path.join(opts.from, contents.neotoma_db),
        path.join(targetDir, contents.neotoma_db),
      );
    }
    if (contents.wal) {
      await fs.copyFile(
        path.join(opts.from, contents.wal),
        path.join(targetDir, contents.wal),
      );
    }

    // Restore directories
    for (const [, val] of Object.entries(contents)) {
      if (typeof val === "string" && val.endsWith("/")) {
        const srcDir = path.join(opts.from, val);
        const destDir = path.join(targetDir, val);
        try {
          await fs.access(srcDir);
          await fs.cp(srcDir, destDir, { recursive: true });
        } catch {
          // skip missing dirs
        }
      }
    }

    const result = {
      status: "restored",
      target_dir: targetDir,
      contents,
      encrypted: manifest.encrypted,
    };

    if (outputMode === "json") {
      writeOutput(result, outputMode);
    } else {
      process.stdout.write(`Restore complete to: ${targetDir}\n`);
      for (const [key, val] of Object.entries(contents)) {
        process.stdout.write(`  ${key}: ${val}\n`);
      }
      if (manifest.encrypted) {
        process.stdout.write("\nData is encrypted. You need the original key file or mnemonic to access it.\n");
      }
    }
  });

// ── Logs ──────────────────────────────────────────────────────────────────

const logsCommand = program.command("logs").description("View and decrypt persistent log files");

logsCommand
  .command("tail")
  .description("Read persistent log files, optionally decrypting encrypted entries")
  .option("--decrypt", "Decrypt encrypted log lines using key file or mnemonic")
  .option("--lines <n>", "Number of lines to show (default: last 50)", "50")
  .option("--file <path>", "Specific log file path (default: latest in data/logs or data/events, env-specific)")
  .action(async (opts: { decrypt?: boolean; lines: string; file?: string }) => {
    const outputMode = resolveOutputMode();
    const lineCount = parseInt(opts.lines, 10) || 50;

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
    const isProd = (process.env.NEOTOMA_ENV || process.env.NODE_ENV || "development") === "production";
    const logsSubdir = isProd ? "logs_prod" : "logs";
    const eventLogSubdir = isProd ? "events_prod" : "events";

    let logFilePath = opts.file;
    if (!logFilePath) {
      const logsDirResolved = process.env.NEOTOMA_LOGS_DIR || path.join(dataDir, logsSubdir);
      const eventLogDirResolved = process.env.NEOTOMA_EVENT_LOG_DIR || path.join(dataDir, eventLogSubdir);
      for (const dir of [logsDirResolved, eventLogDirResolved]) {
        try {
          const files = await fs.readdir(dir);
          const logFiles = files.filter((f) => f.endsWith(".jsonl") || f.endsWith(".log"));
          if (logFiles.length > 0) {
            logFiles.sort().reverse();
            logFilePath = path.join(dir, logFiles[0]);
            break;
          }
        } catch {
          // directory does not exist
        }
      }
    }

    if (!logFilePath) {
      writeCliError("No log files found in env-specific data/logs or data/events (dev: logs, events; prod: logs_prod, events_prod).");
      return;
    }

    let content: string;
    try {
      content = await fs.readFile(logFilePath, "utf-8");
    } catch {
      writeCliError("Cannot read log file: " + logFilePath);
      return;
    }

    const allLines = content.split("\n").filter((l) => l.trim().length > 0);
    const lines = allLines.slice(-lineCount);

    let logKey: Uint8Array | null = null;
    if (opts.decrypt) {
      // Dynamically import to avoid loading crypto at CLI startup
      const { deriveKeys, deriveKeysFromMnemonic, hexToKey } = await import("../crypto/key_derivation.js");

      const keyFilePath = process.env.NEOTOMA_KEY_FILE_PATH || "";
      const mnemonic = process.env.NEOTOMA_MNEMONIC || "";
      const passphrase = process.env.NEOTOMA_MNEMONIC_PASSPHRASE || "";

      if (keyFilePath) {
        const raw = (await fs.readFile(keyFilePath, "utf-8")).trim();
        const keyBytes = hexToKey(raw);
        logKey = deriveKeys(keyBytes).logKey;
      } else if (mnemonic) {
        logKey = deriveKeysFromMnemonic(mnemonic, passphrase).logKey;
      } else {
        writeCliError("--decrypt requires NEOTOMA_KEY_FILE_PATH or NEOTOMA_MNEMONIC to be set.");
        return;
      }
    }

    const output: string[] = [];
    for (const line of lines) {
      if (opts.decrypt && logKey) {
        const { isEncryptedLogLine, decryptLogLine } = await import("../utils/log_encrypt.js");
        if (isEncryptedLogLine(line)) {
          try {
            output.push(decryptLogLine(line, logKey));
          } catch {
            output.push("[decryption failed] " + line);
          }
        } else {
          output.push(line);
        }
      } else {
        output.push(line);
      }
    }

    if (outputMode === "json") {
      const parsed = output.map((l) => {
        try { return JSON.parse(l); } catch { return l; }
      });
      writeOutput({ file: logFilePath, lines: parsed }, outputMode);
    } else {
      process.stdout.write(`Log file: ${logFilePath}\n\n`);
      for (const line of output) {
        process.stdout.write(line + "\n");
      }
    }
  });

const apiCommand = program.command("api").description("API runtime status and management");

apiCommand
  .command("status")
  .description("Check if the API server is running")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const baseUrl = (await resolveBaseUrl(program.opts().baseUrl, config)).replace(/\/$/, "");
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
  .option("--background", "Start the server in the background; logs and PID are env-specific (~/.config/neotoma/logs/api.log or logs_prod/api.log)")
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
          commands: {
            dev: "npm run dev:server",
            dev_prod: "npm run dev:prod",
            start_api: "npm run start:api",
            start_prod: "npm run start:prod",
          },
          ports: { default: 8080, prod: 8082 },
          message: "Run in a separate terminal from the Neotoma repo. CLI defaults to port 8080; for 8082 use --base-url http://localhost:8082",
        },
        outputMode
      );
      return;
    }
    process.stdout.write("To start the API server, run in a separate terminal:\n\n");
    process.stdout.write("  npm run dev:server   (development, port 8080)\n");
    process.stdout.write("  npm run dev:prod    (production-like, port 8082)\n");
    process.stdout.write("  npm run start:api   (production, after npm run build; port from HTTP_PORT, default 8080)\n");
    process.stdout.write("  npm run start:prod  (production, port 8082)\n\n");
    process.stdout.write("Or start in background: neotoma api start --background\n\n");
    process.stdout.write("CLI defaults to port 8080. If the API is on 8082 (e.g. dev:prod), use: neotoma --base-url http://localhost:8082 <command>\n");
  });

apiCommand
  .command("stop")
  .description("Stop the API server process on the configured port")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const baseUrl = (await resolveBaseUrl(program.opts().baseUrl, config)).replace(/\/$/, "");
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
    const token = await getCliToken();
    const api = createApiClient({ baseUrl: await resolveBaseUrl(program.opts().baseUrl, config), token });
    const { data, error, response } = await api.POST("/api/entities/query", {
      body: {
        entity_type: opts.type,
        search: opts.search,
        limit: Number(opts.limit),
        offset: Number(opts.offset),
        include_merged: Boolean(opts.includeMerged),
      },
    });
    const status = response?.status;
    if (error) {
      const detail = formatApiError(error);
      let msg = status ? `Failed to list entities: ${status} ${detail}` : `Failed to list entities: ${detail}`;
      if (status === 401) msg += ". Run `neotoma auth login` to sign in.";
      throw new Error(msg);
    }
    writeOutput(data, outputMode);
  });

entitiesCommand
  .command("get")
  .description("Get entity by ID")
  .argument("<id>", "Entity ID")
  .action(async (id: string) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({ baseUrl: await resolveBaseUrl(program.opts().baseUrl, config), token });
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
    const token = await getCliToken();
    const api = createApiClient({ baseUrl: await resolveBaseUrl(program.opts().baseUrl, config), token });
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
    const token = await getCliToken();
    const api = createApiClient({ baseUrl: await resolveBaseUrl(program.opts().baseUrl, config), token });
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
    const token = await getCliToken();
    const api = createApiClient({ baseUrl: await resolveBaseUrl(program.opts().baseUrl, config), token });
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
    const token = await getCliToken();
    const api = createApiClient({ baseUrl: await resolveBaseUrl(program.opts().baseUrl, config), token });
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
    const token = await getCliToken();
    const api = createApiClient({ baseUrl: await resolveBaseUrl(program.opts().baseUrl, config), token });
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
    const token = await getCliToken();
    const api = createApiClient({ baseUrl: await resolveBaseUrl(program.opts().baseUrl, config), token });
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
    const token = await getCliToken();
    const api = createApiClient({ baseUrl: await resolveBaseUrl(program.opts().baseUrl, config), token });

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
    const token = await getCliToken();
    const api = createApiClient({ baseUrl: await resolveBaseUrl(program.opts().baseUrl, config), token });
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

    const baseUrl = await resolveBaseUrl(program.opts().baseUrl, config);
    const token = opts.skipAuth ? undefined : await getCliToken();
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
