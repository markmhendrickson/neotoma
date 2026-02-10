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
};

export const DEFAULT_BASE_URL = "http://localhost:8080";
/** Ports probed for auto-detection when no --base-url or config.base_url is set. 8082 first (dev:prod). */
export const CANDIDATE_API_PORTS = [8082, 8080];
export const CONFIG_DIR = path.join(os.homedir(), ".config", "neotoma");
export const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

const cliEnv = process.env.NEOTOMA_ENV || process.env.NODE_ENV || "development";
const isProd = cliEnv === "production";
/** Directory for API server logs when started with `neotoma api start --background`. Env-specific so dev and prod can run in background without overwriting each other. */
export const API_LOGS_DIR = path.join(CONFIG_DIR, isProd ? "logs_prod" : "logs");
/** Log file for API server when started with `neotoma api start --background`. */
export const API_LOG_PATH = path.join(API_LOGS_DIR, "api.log");
/** PID file for background API server process. Env-specific so dev and prod can run in background without overwriting each other. */
export const API_PID_PATH = path.join(CONFIG_DIR, isProd ? "api_prod.pid" : "api.pid");

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

/** Probes /health on each candidate port (8082 then 8080); returns ports that respond with ok. */
export async function detectRunningApiPorts(): Promise<number[]> {
  const ports: number[] = [];
  for (const port of CANDIDATE_API_PORTS) {
    if (await probeHealth(port)) ports.push(port);
  }
  return ports;
}

/** Base URL when detection finds no server; prefer 8082 (dev:prod) so it works without config. */
const FALLBACK_BASE_URL = `http://${DETECT_HOST}:8082`;

/**
 * Resolves API base URL: --base-url wins; otherwise auto-detects a single running server.
 * config.base_url is ignored so the CLI always uses the running server (or --base-url).
 * When no server is detected, returns 8082 so dev:prod works without config.
 */
export async function resolveBaseUrl(option?: string, _config?: Config): Promise<string> {
  void _config;
  if (option) return option.replace(/\/$/, "");
  const ports = await detectRunningApiPorts();
  if (ports.length === 0) return FALLBACK_BASE_URL;
  if (ports.length === 1) return `http://${DETECT_HOST}:${ports[0]}`;
  throw new Error(
    `Multiple API servers running (ports ${ports.join(", ")}). Set --base-url to choose one.`
  );
}
