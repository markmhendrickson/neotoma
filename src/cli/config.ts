import fs from "node:fs/promises";
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
export const CONFIG_DIR = path.join(os.homedir(), ".config", "neotoma");
export const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

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
