/**
 * MCP 2026-07-28 stateless request handling for the Streamable HTTP transport
 * (neotoma#2070).
 *
 * The 2026-07-28 revision removes protocol sessions (SEP-2567) and the
 * `initialize` handshake (SEP-2575). Every request carries its own protocol
 * version and client capabilities in `params._meta`, and the server resolves
 * each request on its own. This module holds the transport-level pieces of
 * that model so `/mcp` in actions.ts can serve both eras on one route:
 *
 * - {@link selectMcpHttpEra}: the dispatcher. It decides modern vs legacy from
 *   the request SHAPE alone, before any credential is read, so credential
 *   material is never threaded into both branches.
 * - {@link screenMcpStandardHeaders}: the `Mcp-Method` / `Mcp-Name` audit. Those
 *   headers are visible to every gateway and load balancer on the path, so a
 *   value shaped like a credential or personal data is rejected (400) on both
 *   eras, never forwarded, never echoed back and never logged.
 * - {@link validateModernMcpRequest}: the 2026-07-28 request-metadata rules
 *   (`MCP-Protocol-Version` / `Mcp-Method` / `Mcp-Name` must be present and
 *   match the body; `_meta` must carry the required fields).
 * - {@link SingleExchangeTransport}: a one-request SDK transport, so a fresh
 *   `NeotomaServer` can serve exactly one JSON-RPC request and be discarded.
 *   No SDK fork: @modelcontextprotocol/sdk (1.29 / 1.30) implements no
 *   2026-07-28 support, so the stateless path drives the SDK's own request
 *   dispatch through this transport instead of its session transport.
 */

import type { Request } from "express";
import type {
  Transport,
  TransportSendOptions,
} from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage, MessageExtraInfo } from "@modelcontextprotocol/sdk/types.js";

/** The modern (stateless) protocol revision this server implements. */
export const MCP_MODERN_PROTOCOL_VERSION = "2026-07-28";

/**
 * Versions the stateless path serves. Legacy versions (2025-11-25 and earlier)
 * are served only through `initialize` on the session path, so they are not
 * offered here: a modern client retrying with one in `_meta` would only be
 * rejected again.
 */
export const MCP_MODERN_SUPPORTED_VERSIONS: readonly string[] = [MCP_MODERN_PROTOCOL_VERSION];

export const MCP_META_PROTOCOL_VERSION = "io.modelcontextprotocol/protocolVersion";
export const MCP_META_CLIENT_CAPABILITIES = "io.modelcontextprotocol/clientCapabilities";
export const MCP_META_CLIENT_INFO = "io.modelcontextprotocol/clientInfo";
export const MCP_META_SERVER_INFO = "io.modelcontextprotocol/serverInfo";

/** Error codes the 2026-07-28 spec reserves (`-32020`..`-32099`). */
export const MCP_ERROR_HEADER_MISMATCH = -32020;
export const MCP_ERROR_UNSUPPORTED_PROTOCOL_VERSION = -32022;
const JSONRPC_INVALID_PARAMS = -32602;
const JSONRPC_METHOD_NOT_FOUND = -32601;

/** Methods whose request must carry `Mcp-Name`, and the body field it mirrors. */
const MCP_NAME_SOURCE_FIELD: Record<string, "name" | "uri"> = {
  "tools/call": "name",
  "prompts/get": "name",
  "resources/read": "uri",
};

/** Results that carry `ttlMs` + `cacheScope` under 2026-07-28 (SEP-2549). */
const CACHEABLE_METHODS = new Set([
  "server/discover",
  "tools/list",
  "prompts/list",
  "resources/list",
  "resources/read",
  "resources/templates/list",
]);

/**
 * Freshness hint for cacheable results. `private`: every result is served to
 * an authenticated caller, so shared intermediaries must not reuse it.
 */
export const MCP_STATELESS_CACHE_HINT = { ttlMs: 60_000, cacheScope: "private" as const };

export type McpHttpEra = "modern" | "legacy";

type JsonRpcId = string | number | null;

export type JsonRpcErrorBody = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: { code: number; message: string; data?: Record<string, unknown> };
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readHeader(req: Request, name: string): string | undefined {
  const raw = req.headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw.join(", ");
  return typeof raw === "string" ? raw : undefined;
}

/** JSON-RPC id of a request body, or null when absent / not a request. */
export function jsonRpcIdOf(body: unknown): JsonRpcId {
  if (!isPlainObject(body)) return null;
  const id = body.id;
  return typeof id === "string" || typeof id === "number" ? id : null;
}

/** `params._meta` of a JSON-RPC body, or null. */
export function readRequestMeta(body: unknown): Record<string, unknown> | null {
  if (!isPlainObject(body)) return null;
  const params = body.params;
  if (!isPlainObject(params)) return null;
  const meta = params._meta;
  return isPlainObject(meta) ? meta : null;
}

/**
 * Self-reported client identity from `_meta` (unverified, attribution fallback
 * only). Only string `name` / `version` survive; anything else is dropped.
 */
export function readClientInfoFromMeta(
  meta: Record<string, unknown> | null
): { name?: string; version?: string } | null {
  const info = meta?.[MCP_META_CLIENT_INFO];
  if (!isPlainObject(info)) return null;
  return {
    name: typeof info.name === "string" ? info.name : undefined,
    version: typeof info.version === "string" ? info.version : undefined,
  };
}

/**
 * The dual-era dispatcher. Decided from request shape only, before any
 * credential is read:
 *
 * - `Mcp-Session-Id` present → legacy (an existing session client).
 * - body is `initialize` → legacy (a client opening a legacy session).
 * - otherwise a POST whose `params._meta` carries a protocol version → modern.
 * - anything else → legacy, which keeps today's behaviour (including the 400
 *   for a session-less, non-initialize request from an old client).
 */
export function selectMcpHttpEra(req: Request): McpHttpEra {
  if (req.method !== "POST") return "legacy";
  const sessionId = readHeader(req, "mcp-session-id");
  if (sessionId && sessionId.length > 0) return "legacy";
  const body = req.body as unknown;
  if (!isPlainObject(body)) return "legacy";
  if (body.method === "initialize") return "legacy";
  const meta = readRequestMeta(body);
  if (meta && MCP_META_PROTOCOL_VERSION in meta) return "modern";
  return "legacy";
}

// ---------------------------------------------------------------------------
// Mcp-Method / Mcp-Name credential and personal-data screen
// ---------------------------------------------------------------------------

export type McpStandardHeaderName = "Mcp-Method" | "Mcp-Name";

export type McpHeaderRejectionReason = "credential_shaped" | "personal_data_shaped" | "malformed";

export type McpHeaderRejection = {
  header: McpStandardHeaderName;
  reason: McpHeaderRejectionReason;
  /** Length of the raw header value. The value itself is never retained. */
  length: number;
};

const MAX_HEADER_LENGTH: Record<McpStandardHeaderName, number> = {
  "Mcp-Method": 256,
  "Mcp-Name": 2048,
};

const CREDENTIAL_PATTERNS: RegExp[] = [
  // Authorization scheme prefixes
  /^\s*(?:bearer|basic|digest|token|negotiate)\s+\S/i,
  // JWT / JWS compact serialization
  /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/,
  // Well-known provider key prefixes
  /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/,
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}/,
  // PEM private key material
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  // Credential carried as a URI query / matrix parameter
  /[?&;](?:access_token|id_token|refresh_token|token|api_key|apikey|key|secret|password|passwd|auth|signature|sig|session)=/i,
];

/**
 * A whole value that is one long opaque run (hex, base64, base64url) with both
 * letters and digits. Tool, prompt and method names are short snake_case words,
 * and resource URIs contain `:` and `/`, so neither can match.
 */
function isOpaqueTokenShaped(value: string): boolean {
  return /^[A-Za-z0-9+/=_-]{32,}$/.test(value) && /[0-9]/.test(value) && /[A-Za-z]/.test(value);
}

const PERSONAL_DATA_PATTERNS: RegExp[] = [
  // Email address (also catches `user@host` userinfo in a URI)
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  // International phone number
  /\+\d[\d\s().-]{7,}\d/,
  // A bare UUID is the shape of a user id. (UUIDs inside a resource URI, such
  // as a source id, mirror the body and are allowed.)
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
];

const BASE64_SENTINEL = /^=\?base64\?([A-Za-z0-9+/]*={0,2})\?=$/;

/**
 * Decode the 2026-07-28 `=?base64?...?=` sentinel used for `Mcp-Name` values
 * that are not header-safe. Returns the value unchanged when it is not
 * encoded, or null when the sentinel is present but undecodable.
 */
export function decodeMcpHeaderValue(value: string): string | null {
  const match = BASE64_SENTINEL.exec(value);
  if (!match) {
    return value.startsWith("=?base64?") ? null : value;
  }
  try {
    const decoded = Buffer.from(match[1] ?? "", "base64").toString("utf8");
    return decoded;
  } catch {
    return null;
  }
}

function classifyHeaderValue(value: string): McpHeaderRejectionReason | null {
  for (const pattern of CREDENTIAL_PATTERNS) {
    if (pattern.test(value)) return "credential_shaped";
  }
  // Personal-data shapes before the generic opaque-run check, which a bare
  // UUID would otherwise also satisfy.
  for (const pattern of PERSONAL_DATA_PATTERNS) {
    if (pattern.test(value)) return "personal_data_shaped";
  }
  if (isOpaqueTokenShaped(value.trim())) return "credential_shaped";
  return null;
}

/** True when the value holds a control character other than horizontal tab. */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if ((code < 0x20 && code !== 0x09) || code === 0x7f) return true;
  }
  return false;
}

/**
 * Screen `Mcp-Method` and `Mcp-Name` on any POST, either era. Returns the first
 * rejection, or null when both headers are absent or clean. The returned
 * object carries the header name, a reason and the value's length, never the
 * value.
 */
export function screenMcpStandardHeaders(req: Request): McpHeaderRejection | null {
  const headers: McpStandardHeaderName[] = ["Mcp-Method", "Mcp-Name"];
  for (const header of headers) {
    const raw = readHeader(req, header);
    if (raw === undefined) continue;
    const length = raw.length;
    // Control characters (including CR/LF), or an oversized value, are malformed.
    if (hasControlCharacter(raw) || length > MAX_HEADER_LENGTH[header]) {
      return { header, reason: "malformed", length };
    }
    const decoded = header === "Mcp-Name" ? decodeMcpHeaderValue(raw) : raw;
    if (decoded === null) {
      return { header, reason: "malformed", length };
    }
    const reason =
      classifyHeaderValue(decoded) ?? (decoded === raw ? null : classifyHeaderValue(raw));
    if (reason) return { header, reason, length };
  }
  return null;
}

/** Log-safe summary of the standard headers: presence and length only. */
export function describeMcpStandardHeadersForLog(req: Request): string {
  const parts = (["Mcp-Method", "Mcp-Name"] as const).map((header) => {
    const raw = readHeader(req, header);
    return raw === undefined ? `${header}=absent` : `${header}=present(len=${raw.length})`;
  });
  return parts.join(" ");
}

/**
 * JSON-RPC 400 body for a rejected standard header. Identifies which header
 * and why, and tells the caller how to repair the request, without echoing
 * the value.
 */
export function headerRejectionJsonRpcBody(
  rejection: McpHeaderRejection,
  id: JsonRpcId
): JsonRpcErrorBody {
  const why =
    rejection.reason === "credential_shaped"
      ? "its value is shaped like a credential"
      : rejection.reason === "personal_data_shaped"
        ? "its value is shaped like personal data"
        : "its value is malformed";
  const message =
    `${rejection.header} header rejected: ${why}. ` +
    "Mcp-Method and Mcp-Name must carry only the JSON-RPC method and the tool, resource or prompt name. " +
    "Send credentials only in the Authorization header, and resend without this value.";
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: MCP_ERROR_HEADER_MISMATCH,
      message,
      data: {
        error_code: "MCP_HEADER_VALUE_REJECTED",
        message,
        details: { header: rejection.header, reason: rejection.reason },
        hint: "Resend with Mcp-Method set to the JSON-RPC method and Mcp-Name set to the tool, resource or prompt name, or omit the header.",
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Modern request validation
// ---------------------------------------------------------------------------

export type McpModernValidationFailure = {
  httpStatus: 400;
  body: JsonRpcErrorBody;
  /** Log-safe reason (no header or body values). */
  logReason: string;
};

function failure(
  id: JsonRpcId,
  code: number,
  message: string,
  logReason: string,
  data?: Record<string, unknown>
): McpModernValidationFailure {
  return {
    httpStatus: 400,
    body: { jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } },
    logReason,
  };
}

/**
 * Apply the 2026-07-28 per-request rules to a request {@link selectMcpHttpEra}
 * classified as modern. Returns null when the request may be served.
 *
 * Error messages name the header or field at fault but never repeat a
 * header value (a mismatched value could be anything the client put there).
 */
export function validateModernMcpRequest(req: Request): McpModernValidationFailure | null {
  const body = req.body as Record<string, unknown>;
  const id = jsonRpcIdOf(body);
  const meta = readRequestMeta(body) ?? {};

  const version = meta[MCP_META_PROTOCOL_VERSION];
  if (typeof version !== "string" || version.length === 0) {
    return failure(
      id,
      JSONRPC_INVALID_PARAMS,
      `Invalid params: _meta["${MCP_META_PROTOCOL_VERSION}"] must be a non-empty string.`,
      "missing_meta_protocol_version"
    );
  }

  const headerVersion = readHeader(req, "mcp-protocol-version");
  if (!headerVersion) {
    return failure(
      id,
      MCP_ERROR_HEADER_MISMATCH,
      "Header mismatch: the MCP-Protocol-Version header is required and must equal _meta protocolVersion.",
      "missing_protocol_version_header"
    );
  }
  if (headerVersion !== version) {
    return failure(
      id,
      MCP_ERROR_HEADER_MISMATCH,
      "Header mismatch: the MCP-Protocol-Version header does not match _meta protocolVersion.",
      "protocol_version_header_mismatch"
    );
  }

  if (!MCP_MODERN_SUPPORTED_VERSIONS.includes(version)) {
    // Echo the requested version only when it is a plain revision date.
    const requested = /^\d{4}-\d{2}-\d{2}$/.test(version) ? version : undefined;
    return failure(
      id,
      MCP_ERROR_UNSUPPORTED_PROTOCOL_VERSION,
      "Unsupported protocol version",
      "unsupported_protocol_version",
      {
        supported: [...MCP_MODERN_SUPPORTED_VERSIONS],
        ...(requested ? { requested } : {}),
      }
    );
  }

  if (!isPlainObject(meta[MCP_META_CLIENT_CAPABILITIES])) {
    return failure(
      id,
      JSONRPC_INVALID_PARAMS,
      `Invalid params: _meta["${MCP_META_CLIENT_CAPABILITIES}"] is required and must be an object.`,
      "missing_meta_client_capabilities"
    );
  }

  // Header requirements for notification POSTs are not defined by 2026-07-28.
  if (!("id" in body)) return null;

  const method = typeof body.method === "string" ? body.method : "";
  const methodHeader = readHeader(req, "mcp-method");
  if (!methodHeader) {
    return failure(
      id,
      MCP_ERROR_HEADER_MISMATCH,
      "Header mismatch: the Mcp-Method header is required and must equal the JSON-RPC method.",
      "missing_mcp_method_header"
    );
  }
  if (methodHeader !== method) {
    return failure(
      id,
      MCP_ERROR_HEADER_MISMATCH,
      "Header mismatch: the Mcp-Method header does not match the JSON-RPC method.",
      "mcp_method_header_mismatch"
    );
  }

  const nameField = MCP_NAME_SOURCE_FIELD[method];
  if (nameField) {
    const params = isPlainObject(body.params) ? body.params : {};
    const source = params[nameField];
    const nameHeader = readHeader(req, "mcp-name");
    if (!nameHeader) {
      return failure(
        id,
        MCP_ERROR_HEADER_MISMATCH,
        `Header mismatch: the Mcp-Name header is required for ${method} and must equal params.${nameField}.`,
        "missing_mcp_name_header"
      );
    }
    const decoded = decodeMcpHeaderValue(nameHeader);
    if (decoded === null || typeof source !== "string" || decoded !== source) {
      return failure(
        id,
        MCP_ERROR_HEADER_MISMATCH,
        `Header mismatch: the Mcp-Name header does not match params.${nameField}.`,
        "mcp_name_header_mismatch"
      );
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Response shaping
// ---------------------------------------------------------------------------

/**
 * Shape a JSON-RPC response for a modern client: every result carries
 * `resultType` and `_meta` serverInfo; cacheable results carry a cache hint.
 * Returns the HTTP status alongside (404 for an unknown method, per the
 * 2026-07-28 transport rules; 200 otherwise).
 */
export function shapeModernResponse(
  method: string,
  response: Record<string, unknown>,
  serverInfo: { name: string; version: string }
): { status: number; body: Record<string, unknown> } {
  const error = response.error as { code?: unknown } | undefined;
  if (error) {
    return { status: error.code === JSONRPC_METHOD_NOT_FOUND ? 404 : 200, body: response };
  }
  const result = isPlainObject(response.result) ? { ...response.result } : {};
  if (!("resultType" in result)) result.resultType = "complete";
  result._meta = {
    ...(isPlainObject(result._meta) ? result._meta : {}),
    [MCP_META_SERVER_INFO]: serverInfo,
  };
  if (CACHEABLE_METHODS.has(method)) {
    if (result.ttlMs === undefined) result.ttlMs = MCP_STATELESS_CACHE_HINT.ttlMs;
    if (result.cacheScope === undefined) result.cacheScope = MCP_STATELESS_CACHE_HINT.cacheScope;
  }
  return { status: 200, body: { ...response, result } };
}

// ---------------------------------------------------------------------------
// One-request SDK transport
// ---------------------------------------------------------------------------

/**
 * A transport that carries exactly one inbound JSON-RPC message and captures
 * the matching response. Server-to-client notifications and requests emitted
 * while the request is handled are dropped: 2026-07-28 forbids server-initiated
 * requests on the HTTP response stream, and this path answers with a single
 * JSON object.
 */
export class SingleExchangeTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage, extra?: MessageExtraInfo) => void;
  sessionId?: string = undefined;

  readonly response: Promise<Record<string, unknown> | null>;
  private settle!: (value: Record<string, unknown> | null) => void;
  private settled = false;

  constructor(private readonly requestId: JsonRpcId) {
    this.response = new Promise((resolve) => {
      this.settle = (value) => {
        if (this.settled) return;
        this.settled = true;
        resolve(value);
      };
    });
  }

  async start(): Promise<void> {}

  async send(message: JSONRPCMessage, _options?: TransportSendOptions): Promise<void> {
    const candidate = message as Record<string, unknown>;
    if (
      this.requestId !== null &&
      candidate.id === this.requestId &&
      ("result" in candidate || "error" in candidate)
    ) {
      this.settle(candidate);
    }
  }

  async close(): Promise<void> {
    this.settle(null);
    this.onclose?.();
  }

  deliver(message: JSONRPCMessage, extra?: MessageExtraInfo): void {
    if (!this.onmessage) {
      throw new Error("SingleExchangeTransport: not connected");
    }
    this.onmessage(message, extra);
    if (this.requestId === null) {
      // A notification has no response to wait for.
      this.settle(null);
    }
  }
}
