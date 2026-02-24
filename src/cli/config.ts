import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

export type Config = {
  base_url?: string;
  access_token?: string;
  token_type?: string;
  expires_at?: string;
  connection_id?: string;
  /** Last auth mode chosen during `neotoma init`. */
  init_auth_mode?: "dev_local" | "oauth" | "key_derived";
  /** Neotoma repo root; set by init so CLI can start servers from any cwd. */
  repo_root?: string;
  /** Additional ports to probe for running API instances. */
  extra_api_ports?: number[];
  /** Ports learned from prior successful sessions. */
  known_api_ports?: number[];
};

export const DEFAULT_BASE_URL = "http://localhost:8080";
/** Ports probed for auto-detection when no --base-url or config.base_url is set. */
export const CANDIDATE_API_PORTS = [8080, 8180];
export const CONFIG_DIR = path.join(os.homedir(), ".config", "neotoma");
export const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

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

const DETECT_HOST = "127.0.0.1";
const DETECT_TIMEOUT_MS = 2000;

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
  if (port === 8080) return "dev";
  if (port === 8180) return "prod";
  return "unknown";
}

async function probeHealthDetailed(port: number): Promise<{ healthy: boolean; latencyMs: number }> {
  const start = Date.now();
  const healthy = await probeHealth(port);
  return { healthy, latencyMs: Date.now() - start };
}

function buildCandidatePorts(config?: Config): Array<{ port: number; source: ApiInstance["source"] }> {
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
      url: `http://${DETECT_HOST}:${candidate.port}`,
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

/** Probes /health on each candidate port (8180 then 8080); returns ports that respond with ok. */
export async function detectRunningApiPorts(): Promise<number[]> {
  const instances = await discoverApiInstances();
  return instances.map((instance) => instance.port);
}

/** Base URL when detection finds no server. */
const FALLBACK_BASE_URL = `http://${DETECT_HOST}:8080`;

/**
 * Resolves API base URL: --base-url wins; otherwise prefers session server when set.
 * When a session port (NEOTOMA_SESSION_DEV_PORT or NEOTOMA_SESSION_PROD_PORT) is set,
 * uses it exclusively so commands in a session always target the session server.
 * When no session port is set and multiple APIs respond, chooses by NEOTOMA_ENV
 * (production → 8180, development → 8080) so dev/prod MCP configs do not need
 * session port env vars in mcp.json.
 */
export async function resolveBaseUrl(option?: string, _config?: Config): Promise<string> {
  if (option) return option.replace(/\/$/, "");

  const sessionActive = process.env[SESSION_ACTIVE_PORT_ENV];
  if (sessionActive && /^\d+$/.test(sessionActive)) {
    return `http://${DETECT_HOST}:${parseInt(sessionActive, 10)}`;
  }

  const sessionDev = process.env[SESSION_DEV_PORT_ENV];
  const sessionProd = process.env[SESSION_PROD_PORT_ENV];
  const devPort = sessionDev && /^\d+$/.test(sessionDev) ? parseInt(sessionDev, 10) : null;
  const prodPort = sessionProd && /^\d+$/.test(sessionProd) ? parseInt(sessionProd, 10) : null;
  const validSessionPorts = [devPort, prodPort].filter(
    (p): p is number => p != null && Number.isFinite(p) && p > 0 && p <= 65535
  );

  if (validSessionPorts.length === 1) {
    return `http://${DETECT_HOST}:${validSessionPorts[0]}`;
  }
  if (validSessionPorts.length === 2) {
    const sessionEnv = process.env.NEOTOMA_SESSION_ENV;
    const preferred: "dev" | "prod" =
      sessionEnv === "dev" || sessionEnv === "prod" ? sessionEnv : "prod";
    const port = preferred === "dev" ? devPort! : prodPort!;
    return `http://${DETECT_HOST}:${port}`;
  }

  const configBaseUrl = _config?.base_url?.trim();
  if (configBaseUrl && configBaseUrl.startsWith("http")) {
    return configBaseUrl.replace(/\/$/, "");
  }

  const instances = await discoverApiInstances({ config: _config });
  const ports = instances.map((instance) => instance.port);
  if (ports.length === 0) return FALLBACK_BASE_URL;
  if (ports.length === 1) return `http://${DETECT_HOST}:${ports[0]}`;
  // Multiple ports and no session port: prefer explicit session env when provided.
  const devPortDefault = 8080;
  const prodPortDefault = 8180;
  const sessionEnv = process.env.NEOTOMA_SESSION_ENV;
  const preferred: "dev" | "prod" | null =
    sessionEnv === "dev" || sessionEnv === "prod" ? sessionEnv : null;
  const port =
    preferred === "dev"
      ? (ports.includes(devPortDefault) ? devPortDefault : ports[0])
      : preferred === "prod"
      ? (ports.includes(prodPortDefault) ? prodPortDefault : ports[0])
      : (ports.includes(devPortDefault) ? devPortDefault : ports[0]);
  return `http://${DETECT_HOST}:${port}`;
}
