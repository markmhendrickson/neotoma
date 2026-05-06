/**
 * MCP identity proxy: stdio upstream, HTTP downstream.
 *
 * Bridges stdio-only harnesses (Cursor, Claude Code, Codex) to Neotoma's
 * HTTP `/mcp` endpoint with clientInfo injection, optional AAuth signing,
 * Mcp-Session-Id relay, and SSE fan-out.
 *
 * TypeScript port of the battle-tested Python proxy from ateles. Reuses
 * Neotoma's existing deps (`@modelcontextprotocol/sdk`, `jose`,
 * `@hellocoop/httpsig`) so no new runtime dependencies are needed.
 */

import { createInterface } from "node:readline";

import type { AAuthSignerConfig } from "./aauth_client_signer.js";
import { signedFetch } from "./aauth_client_signer.js";
import { runPreflight } from "./preflight.js";

export const DEFAULT_CLIENT_NAME = "neotoma-mcp-proxy";
export const DEFAULT_DOWNSTREAM_URL = "http://localhost:3080/mcp";
const SESSION_HEADER = "mcp-session-id";

export interface ProxyConfig {
  downstreamUrl: string;
  clientName: string;
  clientVersion: string;
  agentLabel?: string;
  bearerToken?: string;
  connectionId?: string;
  sessionPreflight: boolean;
  sessionPreflightBase?: string;
  failClosed: boolean;
  logFile?: string;
  extraHeaders: Record<string, string>;
  aauthEnabled: boolean;
  aauthSigner?: AAuthSignerConfig;
  autostart: boolean;
}

function effectiveClientName(config: ProxyConfig): string {
  if (config.agentLabel) return `${config.clientName}+${config.agentLabel}`;
  return config.clientName;
}

function log(msg: string): void {
  const ts = new Date().toISOString();
  process.stderr.write(`${ts} [neotoma-mcp-proxy] ${msg}\n`);
}

/** Include `error.cause` (e.g. ECONNREFUSED) — `fetch failed` alone is opaque in logs. */
function describeNetworkError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts = [err.message];
  const { cause } = err;
  if (cause instanceof Error) {
    parts.push(`cause=${cause.message}`);
  } else if (cause && typeof cause === "object" && "code" in cause) {
    parts.push(`cause.code=${String((cause as { code: unknown }).code)}`);
  } else if (cause !== undefined) {
    parts.push(`cause=${String(cause)}`);
  }
  return parts.join(" ");
}

function buildBaseHeaders(config: ProxyConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "User-Agent": `${effectiveClientName(config)}/${config.clientVersion}`,
  };
  if (config.bearerToken) {
    headers["Authorization"] = `Bearer ${config.bearerToken}`;
  }
  if (config.connectionId) {
    headers["X-Connection-Id"] = config.connectionId;
  }
  if (config.aauthSigner) {
    headers["X-Agent-Label"] = config.aauthSigner.sub;
  }
  Object.assign(headers, config.extraHeaders);
  return headers;
}

function injectClientInfo(
  message: Record<string, unknown>,
  config: ProxyConfig,
): void {
  if (message.method !== "initialize") return;
  const params = (message.params ?? {}) as Record<string, unknown>;
  message.params = params;
  const clientInfo = (params.clientInfo ?? {}) as Record<string, unknown>;
  params.clientInfo = clientInfo;
  const existingName = clientInfo.name;
  if (!existingName || typeof existingName !== "string" || !existingName.trim()) {
    clientInfo.name = effectiveClientName(config);
  }
  if (!clientInfo.version) {
    clientInfo.version = config.clientVersion;
  }
  log(`initialize clientInfo injected: name=${String(clientInfo.name)} version=${String(clientInfo.version)}`);
}

class SessionState {
  sessionId: string | null = null;

  attach(headers: Record<string, string>): void {
    if (this.sessionId) {
      headers[SESSION_HEADER] = this.sessionId;
    }
  }

  capture(responseHeaders: Headers): void {
    const value = responseHeaders.get(SESSION_HEADER);
    if (value) this.sessionId = value;
  }
}

function emitJson(payload: unknown): void {
  const line = JSON.stringify(payload);
  process.stdout.write(line + "\n");
}

function emitErrorResponse(
  originalMessage: Record<string, unknown>,
  status: number,
  detail: string,
): void {
  const requestId = originalMessage.id;
  if (requestId === undefined) return;
  emitJson({
    jsonrpc: "2.0",
    id: requestId,
    error: {
      code: status < 500 ? -32000 : -32001,
      message: `neotoma-mcp-proxy downstream error (${status})`,
      data: { detail: detail.slice(0, 500) },
    },
  });
}

async function forwardJsonResponse(response: Response): Promise<void> {
  const body = await response.text();
  if (!body) return;
  try {
    const payload = JSON.parse(body);
    emitJson(payload);
  } catch (err) {
    log(`Failed to decode JSON response: ${String(err)}`);
  }
}

async function forwardSseResponse(response: Response): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let currentEvent = "message";
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, "");
        if (line === "") {
          currentEvent = "message";
          continue;
        }
        if (line.startsWith(":")) continue;
        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim();
          continue;
        }
        if (line.startsWith("data:")) {
          const data = line.slice(5).trim();
          if (currentEvent !== "message") continue;
          try {
            const payload = JSON.parse(data);
            emitJson(payload);
          } catch {
            log(`SSE data frame is not JSON: ${data.slice(0, 200)}`);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function dispatchMessage(
  state: SessionState,
  config: ProxyConfig,
  message: Record<string, unknown>,
): Promise<void> {
  injectClientInfo(message, config);
  const headers = buildBaseHeaders(config);
  state.attach(headers);
  const body = JSON.stringify(message);

  try {
    let resp: Response;
    if (config.aauthSigner) {
      try {
        resp = await signedFetch(config.downstreamUrl, {
          method: "POST",
          headers,
          body,
          config: config.aauthSigner,
        });
      } catch (signErr) {
        log(`AAuth signing failed: ${describeNetworkError(signErr)}`);
        if (config.failClosed) {
          process.stderr.write(
            `[neotoma-mcp-proxy] fail-closed: AAuth signing error\n`,
          );
          process.exit(1);
        }
        resp = await fetch(config.downstreamUrl, {
          method: "POST",
          headers,
          body,
        });
      }
    } else {
      resp = await fetch(config.downstreamUrl, {
        method: "POST",
        headers,
        body,
      });
    }

    state.capture(resp.headers);
    const contentType = resp.headers.get("content-type") ?? "";
    if (resp.status >= 400) {
      const bodyText = await resp.text();
      log(
        `Downstream error status=${resp.status} content_type=${contentType} body=${bodyText.slice(0, 500)}`,
      );
      emitErrorResponse(message, resp.status, bodyText);
      return;
    }
    if (contentType.includes("text/event-stream")) {
      await forwardSseResponse(resp);
    } else {
      await forwardJsonResponse(resp);
    }
  } catch (err) {
    log(`Downstream transport error: ${describeNetworkError(err)}`);
    emitErrorResponse(message, 502, describeNetworkError(err));
  }
}

export async function runProxy(config: ProxyConfig): Promise<void> {
  log(
    `Starting proxy: downstream=${config.downstreamUrl} client_name=${effectiveClientName(config)} version=${config.clientVersion} preflight=${config.sessionPreflight} fail_closed=${config.failClosed}`,
  );

  if (config.sessionPreflight) {
    await runPreflight(config);
  }

  const state = new SessionState();
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line) continue;
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line);
    } catch {
      log(`Dropping non-JSON stdin line: ${line.slice(0, 200)}`);
      continue;
    }
    if (typeof message !== "object" || message === null || Array.isArray(message)) {
      log(`Dropping non-object JSON-RPC message: ${line.slice(0, 200)}`);
      continue;
    }
    await dispatchMessage(state, config, message);
  }
  log("stdin closed; exiting proxy loop");
}
