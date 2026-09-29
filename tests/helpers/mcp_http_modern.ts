/**
 * Shared harness for MCP 2026-07-28 (stateless) Streamable HTTP tests (#2070).
 *
 * Boots the real Express `app` from src/actions.ts on a loopback port — the
 * same pattern as tests/integration/mcp_session_404_reconnect.test.ts — and
 * sends requests shaped the way a 2026-07-28 client sends them: no
 * `Mcp-Session-Id`, no `initialize`, protocol version and client capabilities
 * in `params._meta`, and the mirrored `MCP-Protocol-Version` / `Mcp-Method` /
 * `Mcp-Name` headers.
 *
 * `bootMcpApp()` may be called more than once in a test: each call re-imports
 * the module graph (`vi.resetModules()`), so two booted apps are two
 * independent "replicas" with separate in-process session maps sharing one
 * data directory — what two API instances behind a load balancer look like.
 */

import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { vi } from "vitest";

export const MODERN_PROTOCOL_VERSION = "2026-07-28";

const ENV_KEYS = [
  "NEOTOMA_AUTO_DISCOVER_TUNNEL_URL_IN_PROD",
  "NEOTOMA_BEARER_TOKEN",
  "NEOTOMA_DATA_DIR",
  "NEOTOMA_ENCRYPTION_ENABLED",
  "NEOTOMA_ENV",
  "NEOTOMA_HOST_URL",
  "NEOTOMA_HTTP_PORT",
  "NEOTOMA_KEY_FILE_PATH",
  "NEOTOMA_MNEMONIC",
  "NEOTOMA_MNEMONIC_PASSPHRASE",
] as const;

export type BootedMcpApp = {
  baseUrl: string;
  close: () => Promise<void>;
};

export type McpTestEnv = {
  tmpRoot: string;
  restore: () => void;
};

/** Point the app at a throwaway data dir with no auth configured. */
export function prepareMcpTestEnv(prefix: string): McpTestEnv {
  const original = new Map<string, string | undefined>(
    ENV_KEYS.map((key) => [key, process.env[key]])
  );
  const tmpRoot = mkdtempSync(path.join(tmpdir(), prefix));
  process.env.NEOTOMA_AUTO_DISCOVER_TUNNEL_URL_IN_PROD = "false";
  process.env.NEOTOMA_DATA_DIR = path.join(tmpRoot, "data");
  process.env.NEOTOMA_ENCRYPTION_ENABLED = "false";
  process.env.NEOTOMA_ENV = "development";
  process.env.NEOTOMA_HOST_URL = "http://127.0.0.1";
  process.env.NEOTOMA_HTTP_PORT = "0";
  delete process.env.NEOTOMA_BEARER_TOKEN;
  delete process.env.NEOTOMA_KEY_FILE_PATH;
  delete process.env.NEOTOMA_MNEMONIC;
  delete process.env.NEOTOMA_MNEMONIC_PASSPHRASE;
  return {
    tmpRoot,
    restore: () => {
      for (const [key, value] of original.entries()) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      rmSync(tmpRoot, { recursive: true, force: true });
    },
  };
}

/** Import a fresh copy of the app module graph and listen on a loopback port. */
export async function bootMcpApp(): Promise<BootedMcpApp> {
  vi.resetModules();
  const { app } = await import("../../src/actions.js");
  const httpServer = createServer(app);
  await new Promise<void>((resolve, reject) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
    httpServer.once("error", reject);
  });
  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected TCP server address");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

export type ModernCallOptions = {
  /** OAuth connection id sent as X-Connection-Id. */
  connectionId?: string;
  /** Extra / overriding headers. A value of `null` removes a default header. */
  headers?: Record<string, string | null>;
  /** Override the `_meta` block entirely. */
  meta?: Record<string, unknown> | null;
};

export type JsonRpcReply = {
  jsonrpc?: string;
  id?: string | number | null;
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string; data?: Record<string, unknown> };
};

export function modernMeta(): Record<string, unknown> {
  return {
    "io.modelcontextprotocol/protocolVersion": MODERN_PROTOCOL_VERSION,
    "io.modelcontextprotocol/clientCapabilities": {},
    "io.modelcontextprotocol/clientInfo": { name: "neotoma-2070-probe", version: "0.0.0" },
  };
}

/** POST one 2026-07-28 JSON-RPC request with the mirrored standard headers. */
export async function modernPost(
  baseUrl: string,
  request: { id?: number | string; method: string; params?: Record<string, unknown> },
  options: ModernCallOptions = {}
): Promise<{ status: number; headers: Headers; body: JsonRpcReply | null; text: string }> {
  const params: Record<string, unknown> = { ...(request.params ?? {}) };
  if (options.meta !== null) {
    params._meta = options.meta ?? modernMeta();
  }
  const payload: Record<string, unknown> = { jsonrpc: "2.0", method: request.method, params };
  if (request.id !== undefined) payload.id = request.id;

  const defaults: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": MODERN_PROTOCOL_VERSION,
    "Mcp-Method": request.method,
  };
  const nameSource =
    request.method === "resources/read"
      ? request.params?.uri
      : request.method === "tools/call" || request.method === "prompts/get"
        ? request.params?.name
        : undefined;
  if (typeof nameSource === "string") defaults["Mcp-Name"] = nameSource;
  if (options.connectionId) defaults["X-Connection-Id"] = options.connectionId;

  const headers: Record<string, string> = { ...defaults };
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    const existing = Object.keys(headers).find((k) => k.toLowerCase() === key.toLowerCase());
    if (existing) delete headers[existing];
    if (value !== null) headers[key] = value;
  }

  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body: JsonRpcReply | null = null;
  try {
    body = text ? (JSON.parse(text) as JsonRpcReply) : null;
  } catch {
    body = null;
  }
  return { status: res.status, headers: res.headers, body, text };
}

/** Parse the JSON text payload of a `tools/call` result. */
export function toolResultJson(reply: JsonRpcReply | null): Record<string, unknown> {
  const content = (reply?.result?.content ?? []) as Array<{ type?: string; text?: string }>;
  const first = content.find((c) => c.type === "text" && typeof c.text === "string");
  if (!first?.text) {
    throw new Error(`tools/call returned no text content: ${JSON.stringify(reply)}`);
  }
  return JSON.parse(first.text) as Record<string, unknown>;
}
