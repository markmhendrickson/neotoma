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
  /**
   * Per-request downstream timeout (ms). A hung request rejects after this
   * and enters the retry path instead of stalling until the harness's own
   * MCP timeout. 0 disables. Falls back to NEOTOMA_MCP_PROXY_TIMEOUT_MS env,
   * then DEFAULT_REQUEST_TIMEOUT_MS.
   */
  requestTimeoutMs?: number;
  /**
   * Max attempts (initial + retries) for recovering a lost MCP session.
   * Falls back to NEOTOMA_MCP_PROXY_MAX_ATTEMPTS env, then
   * DEFAULT_MAX_ATTEMPTS.
   */
  maxRetries?: number;
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

function injectClientInfo(message: Record<string, unknown>, config: ProxyConfig): void {
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
  log(
    `initialize clientInfo injected: name=${String(clientInfo.name)} version=${String(clientInfo.version)}`
  );
}

export class SessionState {
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

  /** Drop stale session id before re-running initialize against downstream. */
  clearSession(): void {
    this.sessionId = null;
  }
}

/** Exported for unit tests — matches `src/actions.ts` Streamable HTTP 503 copy. */
export function isRecoverableMcpSessionLostError(status: number, bodyText: string): boolean {
  if (status !== 503) return false;
  const t = bodyText.toLowerCase();
  return (
    t.includes("mcp session is unknown") || t.includes("session is unknown on this api instance")
  );
}

export interface ProxyLoopState {
  session: SessionState;
  /** Last downstream initialize body (JSON), after clientInfo injection — replayed on session loss. */
  lastInitializeBody: string | null;
}

/** Fresh proxy loop state — exported so callers/tests construct a clean session. */
export function createLoopState(): ProxyLoopState {
  return { session: new SessionState(), lastInitializeBody: null };
}

async function sendDownstream(
  config: ProxyConfig,
  headers: Record<string, string>,
  body: string
): Promise<Response> {
  if (config.aauthSigner) {
    try {
      return await signedFetch(config.downstreamUrl, {
        method: "POST",
        headers,
        body,
        config: config.aauthSigner,
      });
    } catch (signErr) {
      log(`AAuth signing failed: ${describeNetworkError(signErr)}`);
      if (config.failClosed) {
        process.stderr.write(`[neotoma-mcp-proxy] fail-closed: AAuth signing error\n`);
        process.exit(1);
      }
      return await fetch(config.downstreamUrl, {
        method: "POST",
        headers,
        body,
      });
    }
  }
  return await fetch(config.downstreamUrl, {
    method: "POST",
    headers,
    body,
  });
}

function emitJson(payload: unknown): void {
  const line = JSON.stringify(payload);
  process.stdout.write(line + "\n");
}

export function formatDownstreamErrorMessage(status: number, detail: string): string {
  const trimmed = detail.replace(/\s+/g, " ").trim();
  if (!trimmed) return `neotoma-mcp-proxy downstream error (${status})`;
  return `neotoma-mcp-proxy downstream error (${status}): ${trimmed.slice(0, 200)}`;
}

type EmitFn = (payload: unknown) => void;

function emitErrorResponse(
  originalMessage: Record<string, unknown>,
  status: number,
  detail: string,
  emit: EmitFn = emitJson
): void {
  const requestId = originalMessage.id;
  if (requestId === undefined) return;
  emit({
    jsonrpc: "2.0",
    id: requestId,
    error: {
      code: status < 500 ? -32000 : -32001,
      message: formatDownstreamErrorMessage(status, detail),
      data: { detail: detail.slice(0, 500) },
    },
  });
}

async function forwardJsonResponse(response: Response, emit: EmitFn = emitJson): Promise<void> {
  const body = await response.text();
  if (!body) return;
  try {
    const payload = JSON.parse(body);
    emit(payload);
  } catch (err) {
    log(`Failed to decode JSON response: ${String(err)}`);
  }
}

async function forwardSseResponse(response: Response, emit: EmitFn = emitJson): Promise<void> {
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
            emit(payload);
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

async function forwardResponse(response: Response, emit: EmitFn): Promise<void> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    await forwardSseResponse(response, emit);
  } else {
    await forwardJsonResponse(response, emit);
  }
}

/** Default per-request downstream timeout (ms) — below typical harness MCP timeouts so a hang retries rather than surfacing as "unavailable". */
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
/** Default total attempts (initial + retries) to recover a lost MCP session. */
export const DEFAULT_MAX_ATTEMPTS = 4;

function envPositiveInt(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

function resolveTimeoutMs(config: ProxyConfig): number {
  return (
    config.requestTimeoutMs ??
    envPositiveInt("NEOTOMA_MCP_PROXY_TIMEOUT_MS") ??
    DEFAULT_REQUEST_TIMEOUT_MS
  );
}

function resolveMaxAttempts(config: ProxyConfig): number {
  return (
    config.maxRetries ?? envPositiveInt("NEOTOMA_MCP_PROXY_MAX_ATTEMPTS") ?? DEFAULT_MAX_ATTEMPTS
  );
}

/** Exponential backoff capped at 2s: 300, 600, 1200, 2000, … ms. */
export function backoffMs(attempt: number): number {
  return Math.min(300 * 2 ** (attempt - 1), 2000);
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer.unref === "function") timer.unref();
  });
}

/**
 * Reject if `p` does not settle within `ms` (0/negative disables). The
 * underlying fetch is left to settle on its own — the caller has already
 * moved on to a retry, and a late success is harmless.
 */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  if (!ms || ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`downstream timeout after ${ms}ms`)), ms);
    if (typeof timer.unref === "function") timer.unref();
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/** Injected transport for {@link dispatchCore}: real impl wraps sendDownstream; tests pass a fake. */
export interface DispatchDeps {
  send: (headers: Record<string, string>, body: string) => Promise<Response>;
  emit: EmitFn;
  sleep: (ms: number) => Promise<void>;
  timeoutMs: number;
  maxAttempts: number;
}

/**
 * Forward one JSON-RPC message downstream, recovering automatically from a
 * lost/expired MCP session — the failure mode behind neotoma#1472/#1667,
 * where a single-instance restart (or a non-sticky replica) drops the
 * in-memory session and the server replies `503 … session is unknown on
 * this API instance`, or the request hangs through the restart window.
 *
 * On that 503 OR a transport error/timeout for a non-initialize method, the
 * cached `initialize` is replayed downstream and the message retried, up to
 * `maxAttempts` with exponential backoff. The client's stdout only ever sees
 * the final result, so backend restarts become invisible instead of failing
 * the whole session. `initialize` itself is never retried here — the client
 * owns the handshake.
 */
export async function dispatchCore(
  deps: DispatchDeps,
  loopState: ProxyLoopState,
  config: ProxyConfig,
  message: Record<string, unknown>
): Promise<void> {
  injectClientInfo(message, config);
  const body = JSON.stringify(message);
  const isInit = message.method === "initialize";
  if (isInit) loopState.lastInitializeBody = body;

  const post = (payload: string): Promise<Response> => {
    const headers = buildBaseHeaders(config);
    loopState.session.attach(headers);
    return withTimeout(deps.send(headers, payload), deps.timeoutMs);
  };

  const reinitialize = async (): Promise<void> => {
    const initBody = loopState.lastInitializeBody;
    if (!initBody) throw new Error("no cached initialize body to replay");
    loopState.session.clearSession();
    const headers = buildBaseHeaders(config);
    const resp = await withTimeout(deps.send(headers, initBody), deps.timeoutMs);
    loopState.session.capture(resp.headers);
    const text = await resp.text();
    if (resp.status >= 400) {
      throw new Error(`re-initialize failed status=${resp.status} body=${text.slice(0, 300)}`);
    }
  };

  let lastDetail = "";
  for (let attempt = 1; attempt <= deps.maxAttempts; attempt++) {
    try {
      // A non-initialize message with no live session (lost on a prior
      // attempt, or the downstream restarted) must re-handshake first.
      if (!isInit && !loopState.session.sessionId && loopState.lastInitializeBody) {
        await reinitialize();
      }

      const resp = await post(body);
      loopState.session.capture(resp.headers);

      if (resp.status < 400) {
        await forwardResponse(resp, deps.emit);
        return;
      }

      const errText = await resp.text();
      if (
        isRecoverableMcpSessionLostError(resp.status, errText) &&
        !isInit &&
        loopState.lastInitializeBody
      ) {
        lastDetail = errText;
        loopState.session.clearSession();
        if (attempt < deps.maxAttempts) {
          log(
            `Downstream MCP session unknown (attempt ${attempt}/${deps.maxAttempts}) — re-initializing and retrying`
          );
          await deps.sleep(backoffMs(attempt));
          continue;
        }
      } else {
        log(
          `Downstream error status=${resp.status} content_type=${resp.headers.get("content-type") ?? ""} body=${errText.slice(0, 500)}`
        );
        emitErrorResponse(message, resp.status, errText, deps.emit);
        return;
      }
    } catch (err) {
      lastDetail = describeNetworkError(err);
      // A transport error or timeout on a non-initialize call is treated as
      // a downstream restart window: drop the session, back off, re-handshake.
      if (!isInit && attempt < deps.maxAttempts) {
        log(
          `Downstream transport error (attempt ${attempt}/${deps.maxAttempts}): ${lastDetail} — clearing session and retrying`
        );
        loopState.session.clearSession();
        await deps.sleep(backoffMs(attempt));
        continue;
      }
      emitErrorResponse(message, 502, lastDetail, deps.emit);
      return;
    }
  }

  emitErrorResponse(
    message,
    503,
    `MCP session recovery exhausted after ${deps.maxAttempts} attempts: ${lastDetail}`,
    deps.emit
  );
}

async function dispatchMessage(
  loopState: ProxyLoopState,
  config: ProxyConfig,
  message: Record<string, unknown>
): Promise<void> {
  await dispatchCore(
    {
      send: (headers, b) => sendDownstream(config, headers, b),
      emit: emitJson,
      sleep,
      timeoutMs: resolveTimeoutMs(config),
      maxAttempts: resolveMaxAttempts(config),
    },
    loopState,
    config,
    message
  );
}

export async function runProxy(config: ProxyConfig): Promise<void> {
  log(
    `Starting proxy: downstream=${config.downstreamUrl} client_name=${effectiveClientName(config)} version=${config.clientVersion} preflight=${config.sessionPreflight} fail_closed=${config.failClosed}`
  );

  if (config.sessionPreflight) {
    await runPreflight(config);
  }

  const loopState = createLoopState();
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
    await dispatchMessage(loopState, config, message);
  }
  log("stdin closed; exiting proxy loop");
}
