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

/** JSON-RPC error code `src/actions.ts` uses for an unknown/expired MCP session. */
const MCP_SESSION_LOST_RPC_CODE = -32001;

/** Statuses on which a session-loss body is honoured. 401 is deliberately absent — see below. */
const SESSION_LOST_STATUSES = new Set([404, 503]);

/**
 * Extract `error.code` from a JSON-RPC error envelope, or null when the body is
 * not parseable JSON-RPC. A non-JSON body (an HTML 404 from a proxy in front of
 * the app, say) yields null and is judged on its message text alone.
 */
function jsonRpcErrorCode(bodyText: string): number | null {
  try {
    const parsed = JSON.parse(bodyText) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const err = (parsed as { error?: unknown }).error;
    if (typeof err !== "object" || err === null) return null;
    const code = (err as { code?: unknown }).code;
    return typeof code === "number" ? code : null;
  } catch {
    return null;
  }
}

/** The session-unknown copy emitted by `src/actions.ts`, matched case-insensitively. */
function hasSessionUnknownMessage(bodyText: string): boolean {
  const t = bodyText.toLowerCase();
  return (
    t.includes("mcp session is unknown") || t.includes("session is unknown on this api instance")
  );
}

/**
 * True when a downstream response means "your MCP session is gone, re-initialize"
 * (neotoma#2312). Exported for unit tests.
 *
 * Keyed on THREE things together, and each one is load-bearing:
 *
 * 1. **Status is 404 or 503.** 404 is the spec-compliant status per MCP Streamable
 *    HTTP session management (neotoma#1923); 503 was the prior status and is retained
 *    so this proxy still recovers against older/unpatched Neotoma server instances.
 *    401 is deliberately excluded — `src/actions.ts` returns `-32001` on four separate
 *    auth failures (invalid/expired bearer, encryption-mode token, unauthenticated POST,
 *    invalid connection id). Those are not session loss, and replaying `initialize`
 *    against them would spin the retry loop against a credential problem the replay
 *    cannot fix, burning `maxAttempts` and masking the real error from the operator.
 *
 * 2. **The body carries JSON-RPC `error.code === -32001`.** This is what distinguishes
 *    a session loss from a genuine routing 404 (a missing route, a misconfigured
 *    downstream URL), which must surface as an error rather than be retried.
 *
 * 3. **The message says the session is unknown.** The code alone is not sufficient,
 *    since `-32001` is reused for auth; the message keeps an unrelated future
 *    `-32001` on 404/503 from being read as session loss.
 *
 * A body that is not parseable JSON-RPC (no code recoverable) still qualifies on the
 * message alone, so a server that wraps or strips the envelope does not regress
 * recovery that worked before this change.
 */
export function isRecoverableMcpSessionLostError(status: number, bodyText: string): boolean {
  if (!SESSION_LOST_STATUSES.has(status)) return false;
  if (!hasSessionUnknownMessage(bodyText)) return false;
  const code = jsonRpcErrorCode(bodyText);
  return code === null || code === MCP_SESSION_LOST_RPC_CODE;
}

/** JSON-RPC code for an internal server error — the substrate's own crash surfacing (neotoma#2316). */
const MCP_INTERNAL_ERROR_RPC_CODE = -32603;

/**
 * How an `initialize` failure is classified (neotoma#2321). Exported for tests.
 *
 * The distinction that matters is not "did it fail" but "did anything happen
 * server-side, and can a replay fix it":
 *
 * - `retryable_transport` — the request never reached a server that answered.
 * - `retryable_server` — a server answered and reported its own failure.
 * - `auth_rejected` — a server answered and refused the credential.
 * - `other_terminal` — anything else; retrying is not known to be safe or useful.
 */
export type InitializeFailureClass =
  | "retryable_transport"
  | "retryable_server"
  | "auth_rejected"
  | "other_terminal";

/**
 * Classify a *handshake* failure (neotoma#2321).
 *
 * This is deliberately a separate predicate from {@link isRecoverableMcpSessionLostError},
 * which answers a different question — "was an established session lost" — and
 * must keep answering only that. On the initialize path there is no session yet,
 * so session-loss reasoning does not apply at all.
 *
 * Each class is keyed on more than one signal, following the discipline
 * neotoma#2320 established for the session-loss predicate:
 *
 * 1. **`auth_rejected` is keyed on HTTP 401**, not on `-32001`. `src/actions.ts`
 *    returns `-32001` from four separate auth paths (invalid/expired bearer,
 *    encryption-mode token, unauthenticated POST, invalid connection id) — and
 *    every one of them returns **401**, while the session-loss path returns 404.
 *    The status is therefore the reliable discriminator and the shared `-32001`
 *    is not. Retrying an auth rejection would hammer a server that is correctly
 *    refusing a credential a replay cannot change, so this exclusion is checked
 *    FIRST and no later rule can override it.
 *
 * 2. **`retryable_server` requires evidence the server itself failed** — an HTTP
 *    5xx, or a JSON-RPC `-32603`. The `-32603` arm is load-bearing beyond the
 *    5xx one: when the crash happens after response headers are already sent,
 *    `src/actions.ts` cannot restate the status, so the internal error rides out
 *    through an otherwise-200 response. That is the exact shape of the
 *    "DB request aborted by caller" handshake failure in neotoma#2316.
 *
 * 3. **A 4xx that is not 401 is `other_terminal`.** A 400 or a routing 404 is a
 *    client/config error; replaying it just burns the budget and hides the cause.
 *
 * Note what is deliberately absent: no rule keys on `-32001` alone. Auth and
 * session loss share that code, so it cannot by itself justify a retry.
 */
export function classifyInitializeFailure(input: {
  status?: number;
  bodyText?: string;
  networkError?: boolean;
}): InitializeFailureClass {
  const { status, bodyText = "", networkError } = input;

  // No usable HTTP response at all: nothing happened server-side, so replaying
  // the handshake cannot duplicate any server-side effect.
  if (networkError || status === undefined) return "retryable_transport";

  // Checked before everything else — see (1) above.
  if (status === 401) return "auth_rejected";

  const code = jsonRpcErrorCode(bodyText);
  if (status >= 500) return "retryable_server";
  // A 2xx/3xx carrying an internal-error envelope — the crash-after-headers case.
  if (code === MCP_INTERNAL_ERROR_RPC_CODE) return "retryable_server";

  return "other_terminal";
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

/**
 * True when `payload` is a JSON-RPC *response* (it carries `result` or
 * `error`). Server-initiated requests and notifications are not responses and
 * are never correlated against the pending request's id.
 */
export function isJsonRpcResponse(payload: unknown): payload is { id?: unknown } {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return false;
  const rec = payload as Record<string, unknown>;
  return "result" in rec || "error" in rec;
}

/**
 * Guard against neotoma#2272: a response describing a DIFFERENT caller's write.
 *
 * The proxy used to forward whatever envelope downstream returned, so a payload
 * belonging to another in-flight call could be delivered as the answer to this
 * one. That is strictly worse than a failed write: the entire discipline for an
 * append-only store under load is "don't trust a success code, re-read the
 * entity", and that assumes the response at least says WHICH write it
 * describes. An agent that stores the returned `entity_id` would attach
 * subsequent work to the wrong parent, and no idempotency key can detect it —
 * the mismatch is downstream of the write.
 *
 * A response whose id does not match the request is therefore dropped and
 * replaced with an explicit error, so the caller retries or verifies rather
 * than silently adopting another caller's entity id. Notifications and
 * server-initiated requests (no id, no result/error) pass through untouched.
 *
 * Returns the payload to emit, or null to drop it.
 */
export function correlateResponse(payload: unknown, requestId: unknown): unknown | null {
  // A batch is forwarded only when every response in it matches.
  if (Array.isArray(payload)) {
    const mismatch = payload.some((el) => isJsonRpcResponse(el) && el.id !== requestId);
    return mismatch ? null : payload;
  }
  if (!isJsonRpcResponse(payload)) return payload;
  // A response with a null id is the spec's shape for "could not determine the
  // request" (e.g. a parse error), so it is passed through as this call's error.
  if (payload.id === null || payload.id === undefined) return payload;
  return payload.id === requestId ? payload : null;
}

async function forwardJsonResponse(
  response: Response,
  emit: EmitFn = emitJson,
  requestId?: unknown
): Promise<void> {
  const body = await response.text();
  if (!body) return;
  try {
    const payload = JSON.parse(body);
    const correlated = correlateResponse(payload, requestId);
    if (correlated === null) {
      log(
        `Dropped mis-correlated downstream response (neotoma#2272): expected id=${JSON.stringify(requestId)}`
      );
      return;
    }
    emit(correlated);
  } catch (err) {
    log(`Failed to decode JSON response: ${String(err)}`);
  }
}

async function forwardSseResponse(
  response: Response,
  emit: EmitFn = emitJson,
  requestId?: unknown
): Promise<void> {
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
            const correlated = correlateResponse(payload, requestId);
            if (correlated === null) {
              log(
                `Dropped mis-correlated downstream SSE response (neotoma#2272): expected id=${JSON.stringify(requestId)}`
              );
              continue;
            }
            emit(correlated);
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

/**
 * Forward a downstream response to stdout, dropping any envelope that does not
 * correlate to `requestId` (neotoma#2272).
 *
 * Returns true when a response for `requestId` was emitted. A false return
 * means every response frame was mis-correlated and dropped, so the caller is
 * still owed an answer — `dispatchCore` turns that into an explicit error
 * rather than leaving the client waiting forever.
 */
async function forwardResponse(
  response: Response,
  emit: EmitFn,
  requestId?: unknown
): Promise<boolean> {
  let answered = requestId === undefined;
  const trackingEmit: EmitFn = (payload) => {
    if (isJsonRpcResponse(payload) || Array.isArray(payload)) answered = true;
    emit(payload);
  };
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    await forwardSseResponse(response, trackingEmit, requestId);
  } else {
    await forwardJsonResponse(response, trackingEmit, requestId);
  }
  return answered;
}

/**
 * Emit an already-buffered response body, preserving the neotoma#2272
 * correlation guard.
 *
 * The initialize path has to read the body to classify it (a crash can surface
 * as `-32603` through a 200 — neotoma#2321), which consumes the stream, so
 * `forwardResponse` can no longer be used. This re-implements the same emit
 * rules over text already in hand: SSE frames are parsed out of the buffer, a
 * JSON body is parsed directly, and either way a payload whose id does not match
 * the request is dropped rather than delivered as this call's answer.
 */
function emitBufferedResponse(
  bodyText: string,
  response: Response,
  emit: EmitFn,
  requestId: unknown,
  originalMessage: Record<string, unknown>
): void {
  const contentType = response.headers.get("content-type") ?? "";
  let answered = requestId === undefined;
  const trackingEmit: EmitFn = (payload) => {
    if (isJsonRpcResponse(payload) || Array.isArray(payload)) answered = true;
    emit(payload);
  };

  const emitOne = (raw: string): void => {
    try {
      const payload = JSON.parse(raw);
      const correlated = correlateResponse(payload, requestId);
      if (correlated === null) {
        log(
          `Dropped mis-correlated downstream response (neotoma#2272): expected id=${JSON.stringify(requestId)}`
        );
        return;
      }
      trackingEmit(correlated);
    } catch {
      log(`Failed to decode initialize response payload: ${raw.slice(0, 200)}`);
    }
  };

  if (contentType.includes("text/event-stream")) {
    let currentEvent = "message";
    for (const rawLine of bodyText.split("\n")) {
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
        if (currentEvent !== "message") continue;
        emitOne(line.slice(5).trim());
      }
    }
  } else if (bodyText) {
    emitOne(bodyText);
  }

  if (!answered) {
    emitErrorResponse(
      originalMessage,
      502,
      "downstream response did not correlate to this request (neotoma#2272); it was dropped rather than delivered as your result — re-read the entity to confirm whether the write landed",
      emit
    );
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

/**
 * Wall-clock ceiling for retrying a failed handshake (neotoma#2321).
 *
 * Attempt count alone is not a sufficient bound here. The proxy is a stdio child
 * and emits nothing until `dispatchCore` resolves, so the client sits blocked on
 * its own `initialize` timeout for the whole retry window — 60s by default in the
 * MCP SDK (`DEFAULT_REQUEST_TIMEOUT_MSEC`). Four attempts that each burn the full
 * 15s request timeout plus backoff would total ~62s and blow past that, turning a
 * recoverable handshake into a client-side abort — the very outcome this retry
 * exists to prevent.
 *
 * 45s leaves headroom under the default client budget while still spanning the
 * fast-failure cases this fix targets (ECONNREFUSED, socket close, 5xx/-32603 all
 * return in well under a second, so the whole window is a couple of seconds of
 * backoff). Overridable via NEOTOMA_MCP_PROXY_HANDSHAKE_BUDGET_MS.
 */
export const DEFAULT_HANDSHAKE_RETRY_BUDGET_MS = 45_000;

/** Injected transport for {@link dispatchCore}: real impl wraps sendDownstream; tests pass a fake. */
export interface DispatchDeps {
  send: (headers: Record<string, string>, body: string) => Promise<Response>;
  emit: EmitFn;
  sleep: (ms: number) => Promise<void>;
  timeoutMs: number;
  maxAttempts: number;
  /** Wall-clock ceiling for handshake retries. Tests inject a clock; production uses Date.now. */
  now?: () => number;
  /** Total ms the handshake retry loop may span. Defaults to DEFAULT_HANDSHAKE_RETRY_BUDGET_MS. */
  handshakeBudgetMs?: number;
}

/**
 * Forward one JSON-RPC message downstream, recovering automatically from a
 * lost/expired MCP session — the failure mode behind neotoma#1472/#1667/#1923,
 * where a single-instance restart (or a non-sticky replica) drops the
 * in-memory session and the server replies `404 … session is unknown on
 * this API instance` (or, against an older server, `503`), or the request
 * hangs through the restart window.
 *
 * On that 404/503 OR a transport error/timeout for a non-initialize method, the
 * cached `initialize` is replayed downstream and the message retried, up to
 * `maxAttempts` with exponential backoff. The client's stdout only ever sees
 * the final result, so backend restarts become invisible instead of failing
 * the whole session.
 *
 * `initialize` takes a SEPARATE path (neotoma#2321). Session-loss recovery
 * cannot help a handshake that never established — there is no session to
 * recover and no cached handshake to replay — so a failed `initialize` used to
 * be permanent for the life of the client, leaving every session opened during
 * an outage dark long after the backend recovered. It is now retried, but only
 * on a classified failure ({@link classifyInitializeFailure}): a transport
 * failure that never reached a server, or a server that answered with its own
 * internal failure. An `initialize` refused for authentication is never retried.
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

  const now = deps.now ?? Date.now;
  const handshakeBudgetMs =
    deps.handshakeBudgetMs ??
    envPositiveInt("NEOTOMA_MCP_PROXY_HANDSHAKE_BUDGET_MS") ??
    DEFAULT_HANDSHAKE_RETRY_BUDGET_MS;
  const handshakeStartedAt = now();

  /**
   * Decide whether a classified handshake failure gets another attempt, and log
   * why. Returns false when the caller must surface a terminal error instead.
   */
  const shouldRetryHandshake = (cls: InitializeFailureClass, attempt: number): boolean => {
    if (cls === "auth_rejected" || cls === "other_terminal") return false;
    if (attempt >= deps.maxAttempts) return false;
    const elapsed = now() - handshakeStartedAt;
    const wait = backoffMs(attempt);
    if (elapsed + wait >= handshakeBudgetMs) {
      log(
        `initialize retry budget exhausted after ${elapsed}ms (limit ${handshakeBudgetMs}ms) — surfacing the failure while the client is still waiting`
      );
      return false;
    }
    return true;
  };

  /** Terminal handshake error, with a class the client can act on. */
  const emitHandshakeFailure = (cls: InitializeFailureClass, detail: string): void => {
    if (cls === "auth_rejected") {
      log(`initialize auth rejected — not retrying: ${detail.slice(0, 300)}`);
      emitErrorResponse(
        message,
        401,
        `handshake_auth_rejected: downstream refused the credential, so retrying cannot help. Check the bearer token, X-Connection-Id, or AAuth agent grant. ${detail}`,
        deps.emit
      );
      return;
    }
    if (cls === "other_terminal") {
      emitErrorResponse(message, 502, `handshake_failed: ${detail}`, deps.emit);
      return;
    }
    const token =
      cls === "retryable_transport" ? "handshake_unreachable" : "handshake_server_error";
    log(`initialize exhausted (${token}) after ${deps.maxAttempts} attempts`);
    emitErrorResponse(
      message,
      503,
      `${token}: the Neotoma MCP server could not be reached or failed to complete the handshake after ${deps.maxAttempts} attempts. This is a connection failure, NOT a missing tool — tools are unavailable because the session never established, not because they do not exist. ${detail}`,
      deps.emit
    );
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
        // A handshake can fail through an otherwise-successful response: when the
        // substrate crashes after headers are sent, `src/actions.ts` cannot restate
        // the status, so `-32603` rides out on a 200 (neotoma#2316/#2321). Buffer
        // the body once and classify before forwarding, or that failure is
        // forwarded as a successful handshake and the session is dark for good.
        if (isInit) {
          const okText = await resp.text();
          const cls = classifyInitializeFailure({ status: resp.status, bodyText: okText });
          if (cls === "retryable_server") {
            lastDetail = okText.slice(0, 300);
            if (shouldRetryHandshake(cls, attempt)) {
              log(
                `initialize retry attempt=${attempt}/${deps.maxAttempts} (${cls}): downstream returned an internal error through a ${resp.status} response — retrying`
              );
              loopState.session.clearSession();
              await deps.sleep(backoffMs(attempt));
              continue;
            }
            emitHandshakeFailure(cls, lastDetail);
            return;
          }
          if (attempt > 1) log(`initialize recovered after ${attempt} attempts`);
          emitBufferedResponse(okText, resp, deps.emit, message.id, message);
          return;
        }

        const answered = await forwardResponse(resp, deps.emit, message.id);
        if (!answered) {
          // Every frame downstream sent belonged to a different request
          // (neotoma#2272). The caller must never adopt another write's
          // payload, and must not be left hanging either.
          emitErrorResponse(
            message,
            502,
            "downstream response did not correlate to this request (neotoma#2272); it was dropped rather than delivered as your result — re-read the entity to confirm whether the write landed",
            deps.emit
          );
        }
        return;
      }

      const errText = await resp.text();

      // The handshake path (neotoma#2321): classify, then retry only what a
      // replay can fix. Session-loss reasoning below is left untouched — it
      // answers a different question and never applies before a session exists.
      if (isInit) {
        const cls = classifyInitializeFailure({ status: resp.status, bodyText: errText });
        lastDetail = `status=${resp.status} ${errText.slice(0, 300)}`;
        if (shouldRetryHandshake(cls, attempt)) {
          log(
            `initialize retry attempt=${attempt}/${deps.maxAttempts} (${cls}): downstream status=${resp.status} — retrying`
          );
          loopState.session.clearSession();
          await deps.sleep(backoffMs(attempt));
          continue;
        }
        emitHandshakeFailure(cls, lastDetail);
        return;
      }

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

      // A handshake that never reached a server (CONNECT_TIMEOUT, ECONNREFUSED,
      // socket closed before a response). Nothing happened downstream, so a
      // replay cannot duplicate a server-side effect (neotoma#2321).
      if (isInit) {
        const cls = classifyInitializeFailure({ networkError: true });
        if (shouldRetryHandshake(cls, attempt)) {
          log(
            `initialize retry attempt=${attempt}/${deps.maxAttempts} (${cls}): ${lastDetail} — retrying`
          );
          loopState.session.clearSession();
          await deps.sleep(backoffMs(attempt));
          continue;
        }
        emitHandshakeFailure(cls, lastDetail);
        return;
      }

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
