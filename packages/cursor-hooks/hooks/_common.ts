/**
 * Shared helpers for Neotoma Cursor hooks.
 *
 * Cursor hooks receive a JSON payload on stdin and may write a JSON
 * response to stdout. All Neotoma hooks are best-effort — a failure
 * here must never block the agent turn. We catch every exception and
 * log to stderr.
 */

import { NeotomaClient } from "@neotoma/client";

const NEOTOMA_BASE_URL =
  process.env.NEOTOMA_BASE_URL ?? "http://127.0.0.1:3080";
const NEOTOMA_TOKEN = process.env.NEOTOMA_TOKEN ?? "dev-local";
const NEOTOMA_LOG_LEVEL = (
  process.env.NEOTOMA_LOG_LEVEL ?? "warn"
).toLowerCase();

const LEVEL_ORDER: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

export function log(level: string, message: string): void {
  const current = LEVEL_ORDER[NEOTOMA_LOG_LEVEL] ?? 2;
  const requested = LEVEL_ORDER[level] ?? 3;
  if (requested >= current) {
    process.stderr.write(`[neotoma-cursor] ${level}: ${message}\n`);
  }
}

export async function readHookInput<T = Record<string, unknown>>(): Promise<T> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      if (!data.trim()) {
        resolve({} as T);
        return;
      }
      try {
        resolve(JSON.parse(data) as T);
      } catch (err) {
        log("warn", `Failed to parse hook input: ${(err as Error).message}`);
        resolve({} as T);
      }
    });
    // Handle the case where stdin is already closed
    if ((process.stdin as { readableEnded?: boolean }).readableEnded) {
      resolve({} as T);
    }
  });
}

export function writeHookOutput(payload: Record<string, unknown>): void {
  try {
    process.stdout.write(JSON.stringify(payload));
  } catch (err) {
    log("warn", `Failed to write hook output: ${(err as Error).message}`);
  }
}

export function getClient(): NeotomaClient | null {
  try {
    return new NeotomaClient({
      transport: "http",
      baseUrl: NEOTOMA_BASE_URL,
      token: NEOTOMA_TOKEN,
    });
  } catch (err) {
    log("warn", `Failed to construct NeotomaClient: ${(err as Error).message}`);
    return null;
  }
}

export function makeIdempotencyKey(
  sessionId: string,
  turnId: string,
  suffix: string
): string {
  const safeSession = sessionId || `cursor-${Date.now()}`;
  const safeTurn = turnId || String(Date.now());
  return `conversation-${safeSession}-${safeTurn}-${suffix}`;
}

export function harnessProvenance(
  extra?: Record<string, unknown>
): Record<string, unknown> {
  return {
    data_source: "cursor-hook",
    harness: "cursor",
    cwd: process.cwd(),
    ...(extra ?? {}),
  };
}

export async function runHook(
  name: string,
  handler: (input: Record<string, unknown>) => Promise<Record<string, unknown>>
): Promise<void> {
  try {
    const input = await readHookInput<Record<string, unknown>>();
    const output = await handler(input);
    writeHookOutput(output);
  } catch (err) {
    log("error", `${name} hook failed: ${(err as Error).message}`);
    writeHookOutput({});
  }
}
