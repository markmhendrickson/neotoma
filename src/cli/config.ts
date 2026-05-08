import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { readLocalHttpPortFromFile } from "../utils/local_http_port_file.js";

export type Config = {
  base_url?: string;
  access_token?: string;
  token_type?: string;
  expires_at?: string;
  connection_id?: string;
  /** Last auth mode chosen during `neotoma init`. */
  init_auth_mode?: "dev_local" | "oauth" | "key_derived";
  /** Neotoma project root; set by init so CLI can start servers from any cwd. */
  project_root?: string;
  /** Legacy alias for project_root kept for backward compatibility. */
  repo_root?: string;
  /** Additional ports to probe for running API instances. */
  extra_api_ports?: number[];
  /** Ports learned from prior successful sessions. */
  known_api_ports?: number[];
  /**
   * Sticky preferred environment for the CLI. Written when the user runs
   * `neotoma api start --env prod` or `--env dev`, or when a session starts
   * with an explicit `--env` flag. Read by `resolveLocalTransportEnv` in
   * `src/shared/local_transport.ts` so plain `neotoma store` and similar
   * commands route to the correct SQLite DB file even when no env var is set.
   */
  preferred_env?: "prod" | "dev";
};

export const DEFAULT_BASE_URL = "http://localhost:3080";
/** Ports probed for auto-detection when no --base-url or config.base_url is set. */
export const CANDIDATE_API_PORTS = [3080, 3180];
export const CONFIG_DIR = path.join(os.homedir(), ".config", "neotoma");
export const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
export const USER_ENV_PATH = path.join(CONFIG_DIR, ".env");

const cliEnv = process.env.NEOTOMA_ENV || "development";
/** True when NEOTOMA_ENV is "production". Used for API logs dir, PID path, and CLI log default. */
export const isProd = cliEnv === "production";
/** Directory for API server logs when started with `neotoma api start --background`. Env-specific so dev and prod can run in background without overwriting each other. */
export const API_LOGS_DIR = path.join(CONFIG_DIR, isProd ? "logs_prod" : "logs");
/** Log file for API server when started with `neotoma api start --background`. */
export const API_LOG_PATH = path.join(API_LOGS_DIR, "api.log");
/** PID file for background API server process. Env-specific so dev and prod can run in background without overwriting each other. */
export const API_PID_PATH = path.join(CONFIG_DIR, isProd ? "api_prod.pid" : "api.pid");

/** JSON file storing PIDs and ports for dev+prod servers started with neotoma --background. Used by neotoma stop. */
export const BACKGROUND_SERVERS_PATH = path.join(CONFIG_DIR, "background_servers.json");

/** Default path for CLI stdout/stderr tee when no --log-file is given. Use --no-log-file to disable. */
export const CLI_LOG_PATH = path.join(CONFIG_DIR, "cli.log");

export async function readConfig(): Promise<Config> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as Config;
  } catch {
    return {};
  }
}

export async function writeConfig(next: Config): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(next, null, 2));
}

export async function clearConfig(): Promise<void> {
  try {
    await fs.unlink(CONFIG_PATH);
  } catch {
    // ignore
  }
}

export function isTokenExpired(config: Config): boolean {
  if (!config.expires_at) return true;
  return Date.now() >= new Date(config.expires_at).getTime();
}

export function baseUrlFromOption(option?: string, config?: Config): string {
  return option || config?.base_url || DEFAULT_BASE_URL;
}

/** Used only for TCP probes; avoids depending on `localhost` resolution. */
const DETECT_HOST = "127.0.0.1";
/**
 * Host in auto-resolved API base URLs must match the server's AAuth canonical
 * authority (`canonicalAauthAuthority()` → `config.apiBase` host, default
 * `localhost`). If the CLI signed `http://127.0.0.1:3080/...` while the API
 * expects `localhost:3080`, RFC 9421 verification fails and routes see
 * anonymous tier (e.g. `inspector admin unlock` redeem).
 */
const RESOLVED_API_LOOPBACK_HOST = "localhost";
const DETECT_TIMEOUT_MS = 2000;

function shouldUseLocalHttpPortFileFromEnv(): boolean {
  const v = process.env.NEOTOMA_MCP_USE_LOCAL_PORT_FILE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function localHttpPortFileProbeTimeoutMs(): number {
  const raw = process.env.NEOTOMA_MCP_PORT_PROBE_MS?.trim();
  const n = raw ? Number(raw) : NaN;
  const ms = Number.isFinite(n) ? Math.trunc(n) : 1200;
  return Math.min(5000, Math.max(200, ms));
}

/**
 * TCP probe for a listening port (same semantics as MCP signed shim scripts).
 * Used when `NEOTOMA_MCP_USE_LOCAL_PORT_FILE` is set so the CLI targets the
 * API port written under `.dev-serve/local_http_port_<dev|prod>` (see `readLocalHttpPortFromFile`).
 */
export async function tcpProbePortListening(port: number): Promise<boolean> {
  const timeoutMs = localHttpPortFileProbeTimeoutMs();
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host: DETECT_HOST, port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.setTimeout(timeoutMs);
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

async function tryResolveBaseUrlFromLocalHttpPortFile(_config?: Config): Promise<string | null> {
  if (!shouldUseLocalHttpPortFileFromEnv()) return null;
  const root =
    process.env.NEOTOMA_PROJECT_ROOT?.trim() ||
    _config?.project_root?.trim() ||
    _config?.repo_root?.trim() ||
    process.cwd();
  const port = await readLocalHttpPortFromFile(root);
  if (port == null) return null;
  const listening = await tcpProbePortListening(port);
  if (!listening) return null;
  return `http://${RESOLVED_API_LOOPBACK_HOST}:${port}`;
}

async function probeHealth(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const req = http.get(
      `http://${DETECT_HOST}:${port}/health`,
      { timeout: DETECT_TIMEOUT_MS },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            const data = JSON.parse(body) as { ok?: boolean };
            resolve(res.statusCode === 200 && data.ok === true);
          } catch {
            resolve(false);
          }
        });
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

/** Probes /me; returns true if the API responds (200 or 401 = up). */
async function probeApiReady(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const req = http.get(
      `http://${DETECT_HOST}:${port}/me`,
      { timeout: DETECT_TIMEOUT_MS },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200 || res.statusCode === 401);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Poll /health on a port until it returns ok or timeout. Use after spawning the API server
 * so the REPL only starts when the server is ready.
 */
export async function waitForHealth(
  port: number,
  options?: { timeoutMs?: number; intervalMs?: number }
): Promise<boolean> {
  const timeoutMs = options?.timeoutMs ?? 60000;
  const intervalMs = options?.intervalMs ?? 800;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await probeHealth(port)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * After health is up, poll /me until it responds (200 or 401) or timeout.
 * Use so we only proceed when the API is actually serving requests, not just /health.
 */
export async function waitForApiReady(
  port: number,
  options?: { timeoutMs?: number; intervalMs?: number }
): Promise<boolean> {
  const timeoutMs = options?.timeoutMs ?? 20000;
  const intervalMs = options?.intervalMs ?? 500;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await probeApiReady(port)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * When set by the CLI session (neotoma with no args), the REPL prefers this port for API calls
 * so multiple instances use their own dev server.
 */
const SESSION_DEV_PORT_ENV = "NEOTOMA_SESSION_DEV_PORT";
const SESSION_PROD_PORT_ENV = "NEOTOMA_SESSION_PROD_PORT";
const SESSION_ACTIVE_PORT_ENV = "NEOTOMA_SESSION_API_PORT";

export type ApiEnvHint = "dev" | "prod" | "unknown";
export type ApiInstance = {
  port: number;
  url: string;
  envHint: ApiEnvHint;
  source: "session" | "default" | "config" | "env";
  healthy: boolean;
  latencyMs: number;
};

function parsePortsFromUnknown(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => Number(v))
    .filter((p) => Number.isFinite(p) && p > 0 && p <= 65535)
    .map((p) => Math.trunc(p));
}

function parsePortsFromEnv(value: string | undefined): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((p) => Number.isFinite(p) && p > 0 && p <= 65535)
    .map((p) => Math.trunc(p));
}

function envHintForPort(port: number): ApiEnvHint {
  if (port === 3080) return "dev";
  if (port === 3180) return "prod";
  return "unknown";
}

async function probeHealthDetailed(port: number): Promise<{ healthy: boolean; latencyMs: number }> {
  const start = Date.now();
  const healthy = await probeHealth(port);
  return { healthy, latencyMs: Date.now() - start };
}

function buildCandidatePorts(
  config?: Config
): Array<{ port: number; source: ApiInstance["source"] }> {
  const sessionDev = process.env[SESSION_DEV_PORT_ENV];
  const sessionProd = process.env[SESSION_PROD_PORT_ENV];
  const sessionActive = process.env[SESSION_ACTIVE_PORT_ENV];
  const sessionPorts = [
    sessionActive && /^\d+$/.test(sessionActive) ? parseInt(sessionActive, 10) : null,
    sessionDev && /^\d+$/.test(sessionDev) ? parseInt(sessionDev, 10) : null,
    sessionProd && /^\d+$/.test(sessionProd) ? parseInt(sessionProd, 10) : null,
  ].filter((p): p is number => p != null && Number.isFinite(p) && p > 0 && p <= 65535);

  const configExtra = parsePortsFromUnknown(config?.extra_api_ports);
  const configKnown = parsePortsFromUnknown(config?.known_api_ports);
  const envPorts = parsePortsFromEnv(process.env.NEOTOMA_API_PORTS);

  const withSource: Array<{ port: number; source: ApiInstance["source"] }> = [
    ...sessionPorts.map((port) => ({ port, source: "session" as const })),
    ...CANDIDATE_API_PORTS.map((port) => ({ port, source: "default" as const })),
    ...configExtra.map((port) => ({ port, source: "config" as const })),
    ...configKnown.map((port) => ({ port, source: "config" as const })),
    ...envPorts.map((port) => ({ port, source: "env" as const })),
  ];

  const seen = new Set<number>();
  const deduped: Array<{ port: number; source: ApiInstance["source"] }> = [];
  for (const entry of withSource) {
    if (seen.has(entry.port)) continue;
    seen.add(entry.port);
    deduped.push(entry);
  }
  return deduped.sort((a, b) => a.port - b.port);
}

export async function discoverApiInstances(options?: {
  config?: Config;
  includeUnhealthy?: boolean;
}): Promise<ApiInstance[]> {
  const config = options?.config ?? (await readConfig());
  const includeUnhealthy = options?.includeUnhealthy === true;
  const candidates = buildCandidatePorts(config);
  const instances: ApiInstance[] = [];
  for (const candidate of candidates) {
    const { healthy, latencyMs } = await probeHealthDetailed(candidate.port);
    if (!healthy && !includeUnhealthy) continue;
    instances.push({
      port: candidate.port,
      url: `http://${RESOLVED_API_LOOPBACK_HOST}:${candidate.port}`,
      envHint: envHintForPort(candidate.port),
      source: candidate.source,
      healthy,
      latencyMs,
    });
  }
  return instances;
}

export async function rememberKnownApiPort(port: number): Promise<void> {
  if (!Number.isFinite(port) || port < 1 || port > 65535) return;
  const config = await readConfig();
  const known = new Set<number>(parsePortsFromUnknown(config.known_api_ports));
  known.add(Math.trunc(port));
  const nextKnown = [...known].sort((a, b) => a - b).slice(-20);
  await writeConfig({ ...config, known_api_ports: nextKnown });
}

/** Probes /health on each candidate port (3180 then 3080); returns ports that respond with ok. */
export async function detectRunningApiPorts(): Promise<number[]> {
  const instances = await discoverApiInstances();
  return instances.map((instance) => instance.port);
}

/** Base URL when detection finds no server. */
const FALLBACK_BASE_URL = `http://${RESOLVED_API_LOOPBACK_HOST}:3080`;

function normalizePreferredEnv(value: unknown): "dev" | "prod" | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "dev" || normalized === "development") return "dev";
  if (normalized === "prod" || normalized === "production") return "prod";
  return null;
}

function defaultPortForEnv(env: "dev" | "prod"): number {
  return env === "prod" ? 3180 : 3080;
}

/**
 * Resolves API base URL: --base-url wins; otherwise prefers session server when set.
 * When a session port (NEOTOMA_SESSION_DEV_PORT or NEOTOMA_SESSION_PROD_PORT) is set,
 * uses it exclusively so commands in a session always target the session server.
 * When **`NEOTOMA_MCP_USE_LOCAL_PORT_FILE`** is `1`/`true`/`yes`, reads
 * `<projectRoot>/.dev-serve/local_http_port_<dev|prod>` (or legacy `local_http_port`),
 * matching **`NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE`** / **`NEOTOMA_ENV`** (same rules as
 * the MCP signed shim), TCP-probes, and returns `http://localhost:<port>` when
 * listening — after session env and before `config.base_url` / auto-detect.
 * When no session port is set, a session/config preferred env selects the matching
 * default port even if a different env's API happens to be running, keeping API
 * clients and local transport on the same SQLite profile.
 */
export async function resolveBaseUrl(option?: string, _config?: Config): Promise<string> {
  // Precedence: explicit --base-url flag > NEOTOMA_BASE_URL env var > session
  // ports (for in-session commands) > config.json > auto-detect.
  if (option) return option.replace(/\/$/, "");

  const envBaseUrl = process.env.NEOTOMA_BASE_URL?.trim();
  if (envBaseUrl && envBaseUrl.startsWith("http")) {
    return envBaseUrl.replace(/\/$/, "");
  }

  const sessionActive = process.env[SESSION_ACTIVE_PORT_ENV];
  if (sessionActive && /^\d+$/.test(sessionActive)) {
    return `http://${RESOLVED_API_LOOPBACK_HOST}:${parseInt(sessionActive, 10)}`;
  }

  const sessionDev = process.env[SESSION_DEV_PORT_ENV];
  const sessionProd = process.env[SESSION_PROD_PORT_ENV];
  const devPort = sessionDev && /^\d+$/.test(sessionDev) ? parseInt(sessionDev, 10) : null;
  const prodPort = sessionProd && /^\d+$/.test(sessionProd) ? parseInt(sessionProd, 10) : null;
  const validSessionPorts = [devPort, prodPort].filter(
    (p): p is number => p != null && Number.isFinite(p) && p > 0 && p <= 65535
  );

  if (validSessionPorts.length === 1) {
    return `http://${RESOLVED_API_LOOPBACK_HOST}:${validSessionPorts[0]}`;
  }
  if (validSessionPorts.length === 2) {
    const sessionEnv = process.env.NEOTOMA_SESSION_ENV;
    const preferred: "dev" | "prod" =
      sessionEnv === "dev" || sessionEnv === "prod" ? sessionEnv : "prod";
    const port = preferred === "dev" ? devPort! : prodPort!;
    return `http://${RESOLVED_API_LOOPBACK_HOST}:${port}`;
  }

  const fromLocalPortFile = await tryResolveBaseUrlFromLocalHttpPortFile(_config);
  if (fromLocalPortFile) return fromLocalPortFile;

  const configBaseUrl = _config?.base_url?.trim();
  if (configBaseUrl && configBaseUrl.startsWith("http")) {
    return configBaseUrl.replace(/\/$/, "");
  }

  const instances = await discoverApiInstances({ config: _config });
  const ports = instances.map((instance) => instance.port);
  const sessionEnv = normalizePreferredEnv(process.env.NEOTOMA_SESSION_ENV);
  const configPreferredEnv = normalizePreferredEnv(_config?.preferred_env);
  const preferredEnv = sessionEnv ?? configPreferredEnv;
  if (preferredEnv) {
    const preferredPort = defaultPortForEnv(preferredEnv);
    return `http://${RESOLVED_API_LOOPBACK_HOST}:${preferredPort}`;
  }
  if (ports.length === 0) return FALLBACK_BASE_URL;
  if (ports.length === 1) return `http://${RESOLVED_API_LOOPBACK_HOST}:${ports[0]}`;
  // Multiple ports and no session/config preference: default to development.
  const devPortDefault = defaultPortForEnv("dev");
  const port = ports.includes(devPortDefault) ? devPortDefault : ports[0];
  return `http://${RESOLVED_API_LOOPBACK_HOST}:${port}`;
}
