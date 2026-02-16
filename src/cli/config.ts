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
  /** Neotoma repo root; set by init so CLI can start servers from any cwd. */
  repo_root?: string;
  /** Preferred environment (dev or prod) for interactive sessions. */
  preferred_env?: "dev" | "prod";
  /** Server policy: start (start API if needed) or use-existing (connect only). Set by consent prompt. */
  server_policy?: "start" | "use-existing";
};

export const DEFAULT_BASE_URL = "http://localhost:8080";
/** Ports probed for auto-detection when no --base-url or config.base_url is set. 8180 (prod) first, then 8080 (dev). */
export const CANDIDATE_API_PORTS = [8180, 8080];
export const CONFIG_DIR = path.join(os.homedir(), ".config", "neotoma");
export const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

const cliEnv = process.env.NEOTOMA_ENV || process.env.NODE_ENV || "development";
/** True when NEOTOMA_ENV or NODE_ENV is "production". Used for API logs dir, PID path, and CLI log default. */
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

/** Probes /api/me; returns true if the API responds (200 or 401 = up). */
async function probeApiReady(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const req = http.get(
      `http://${DETECT_HOST}:${port}/api/me`,
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
 * After health is up, poll /api/me until it responds (200 or 401) or timeout.
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

/** Probes /health on each candidate port (8180 then 8080); returns ports that respond with ok. */
export async function detectRunningApiPorts(): Promise<number[]> {
  const sessionDev = process.env[SESSION_DEV_PORT_ENV];
  const sessionProd = process.env[SESSION_PROD_PORT_ENV];
  const devPort = sessionDev && /^\d+$/.test(sessionDev) ? parseInt(sessionDev, 10) : null;
  const prodPort = sessionProd && /^\d+$/.test(sessionProd) ? parseInt(sessionProd, 10) : null;
  const sessionPorts = [devPort, prodPort].filter((p): p is number => p != null && Number.isFinite(p) && p > 0 && p <= 65535);
  const candidates =
    sessionPorts.length > 0
      ? [...sessionPorts, ...CANDIDATE_API_PORTS.filter((p) => !sessionPorts.includes(p))]
      : CANDIDATE_API_PORTS;
  const ports: number[] = [];
  for (const port of candidates) {
    if (Number.isFinite(port) && port > 0 && port <= 65535 && (await probeHealth(port))) ports.push(port);
  }
  return ports;
}

/** Base URL when detection finds no server; prefer 8180 (prod) so it works without config. */
const FALLBACK_BASE_URL = `http://${DETECT_HOST}:8180`;

/**
 * Resolves API base URL: --base-url wins; otherwise prefers session server when set.
 * When a session port (NEOTOMA_SESSION_DEV_PORT or NEOTOMA_SESSION_PROD_PORT) is set,
 * uses it exclusively so commands in a session always target the session server.
 * When no session port is set and multiple APIs respond, chooses by NEOTOMA_ENV
 * (production → 8180, development → 8080) so dev/prod MCP configs do not need
 * session port env vars in mcp.json.
 */
export async function resolveBaseUrl(option?: string, config?: Config): Promise<string> {
  if (option) return option.replace(/\/$/, "");

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
    const cfg = config ?? (await readConfig());
    const preferred = cfg.preferred_env ?? "prod";
    const port = preferred === "dev" ? devPort! : prodPort!;
    return `http://${DETECT_HOST}:${port}`;
  }

  const ports = await detectRunningApiPorts();
  if (ports.length === 0) return FALLBACK_BASE_URL;
  if (ports.length === 1) return `http://${DETECT_HOST}:${ports[0]}`;
  // Multiple ports and no session port: choose by NEOTOMA_ENV so dev/prod MCP processes
  // get the right server without needing NEOTOMA_SESSION_DEV_PORT / NEOTOMA_SESSION_PROD_PORT in mcp.json.
  const prodPortDefault = CANDIDATE_API_PORTS[0];
  const devPortDefault = CANDIDATE_API_PORTS[1];
  const port = isProd
    ? (ports.includes(prodPortDefault) ? prodPortDefault : ports[0])
    : (ports.includes(devPortDefault) ? devPortDefault : ports[0]);
  return `http://${DETECT_HOST}:${port}`;
}
