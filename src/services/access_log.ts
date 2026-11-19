/**
 * Structured per-request access log.
 *
 * Writes one JSON line per HTTP request to standard output once the response
 * finishes, so the line carries the resolved user, auth method and status.
 * The line answers "who did what, from where, when" for hosted deployments
 * (neotoma#2239).
 *
 * Redaction rule: the line never carries request or response bodies, header
 * values (other than a truncated user agent), cookie values, tokens, keys or
 * query values. Query parameters are logged by name only.
 *
 * Format selection (`NEOTOMA_ACCESS_LOG`): `json` (this line), `dev` (the
 * previous morgan "dev" format) or `off`. Unset or unrecognised values fall
 * back to `json` when the server binds beyond loopback and `dev` for a
 * loopback bind.
 */
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { isLoopbackHost } from "../shared/bind_host.js";

export type AccessLogFormat = "json" | "dev" | "off";

export const ACCESS_LOG_SERVICE = "neotoma-api";
export const REQUEST_ID_HEADER = "x-request-id";
export const USER_AGENT_MAX_LENGTH = 120;
/** Readiness and liveness paths; logged with `health: true`. */
export const HEALTH_PATHS: ReadonlySet<string> = new Set(["/health", "/ready"]);

/** Incoming request ids are reused only when they match this shape. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

export interface AccessLogRecord {
  ts: string;
  request_id: string;
  method: string;
  path: string;
  query_keys: string[];
  status: number;
  duration_ms: number;
  bytes: number | null;
  user_id: string | null;
  auth_method: string;
  agent: string | null;
  client_ip: string | null;
  user_agent: string | null;
  service: string;
  health: boolean;
}

type AccessLogRequest = Request & {
  requestId?: string;
  authMethod?: string;
  authenticatedUserId?: string;
  aauthAdmission?: { admitted?: boolean; agent_label?: string } | null;
};

export function resolveAccessLogFormat(
  rawValue: string | undefined,
  bindHost: string
): AccessLogFormat {
  const value = (rawValue ?? "").trim().toLowerCase();
  if (value === "json" || value === "dev" || value === "off") return value;
  return isLoopbackHost(bindHost) ? "dev" : "json";
}

/**
 * Record the auth method label on the request so the access log can report
 * it. Called by the auth middleware next to its `[Auth]` log lines; the label
 * is the same fixed string those lines carry.
 */
export function setRequestAuthMethod(req: Request, label: string): void {
  (req as AccessLogRequest).authMethod = label;
}

/** Reuse a well-formed incoming request id, otherwise generate one. */
export function resolveRequestId(req: Request): string {
  const raw = req.headers[REQUEST_ID_HEADER];
  const incoming = Array.isArray(raw) ? raw[0] : raw;
  if (typeof incoming === "string" && REQUEST_ID_PATTERN.test(incoming.trim())) {
    return incoming.trim();
  }
  return randomUUID();
}

function pathAndQueryKeys(req: Request): { path: string; query_keys: string[] } {
  const url = req.originalUrl || req.url || "/";
  const queryIndex = url.indexOf("?");
  const path = queryIndex === -1 ? url : url.slice(0, queryIndex);
  if (queryIndex === -1) return { path, query_keys: [] };
  const keys = new Set<string>();
  for (const key of new URLSearchParams(url.slice(queryIndex + 1)).keys()) keys.add(key);
  return { path, query_keys: [...keys].sort() };
}

export function buildAccessLogRecord(
  req: Request,
  res: Response,
  opts: {
    startedAt: bigint;
    startedAtMs: number;
    clientIp: (req: Request) => string | null;
    now?: bigint;
  }
): AccessLogRecord {
  const r = req as AccessLogRequest;
  const { path, query_keys } = pathAndQueryKeys(req);
  const end = opts.now ?? process.hrtime.bigint();
  const durationMs = Number(end - opts.startedAt) / 1e6;
  const lengthHeader = res.getHeader("content-length");
  const bytes =
    lengthHeader === undefined || lengthHeader === null || Number.isNaN(Number(lengthHeader))
      ? null
      : Number(lengthHeader);
  const userAgent = firstUserAgent(req);
  const admission = r.aauthAdmission;
  return {
    ts: new Date(opts.startedAtMs).toISOString(),
    request_id: r.requestId ?? resolveRequestId(req),
    method: req.method,
    path,
    query_keys,
    status: res.statusCode,
    duration_ms: Math.round(durationMs * 1000) / 1000,
    bytes,
    user_id: typeof r.authenticatedUserId === "string" ? r.authenticatedUserId : null,
    auth_method: r.authMethod ?? "none",
    agent: admission?.admitted && admission.agent_label ? admission.agent_label : null,
    client_ip: opts.clientIp(req),
    user_agent: userAgent,
    service: ACCESS_LOG_SERVICE,
    health: HEALTH_PATHS.has(path),
  };
}

function firstUserAgent(req: Request): string | null {
  const raw = req.headers["user-agent"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || value.length === 0) return null;
  return value.slice(0, USER_AGENT_MAX_LENGTH);
}

/**
 * Express middleware: assigns the request id (echoed in `x-request-id`) and
 * writes the JSON line on response `finish`. Install before the auth
 * middleware so the id exists for every request; the line is written after
 * auth has run because it waits for the response to finish.
 */
export function jsonAccessLog(opts: {
  /**
   * Resolves the client address. Supplied by `src/actions.ts`, which owns
   * every read of proxy-supplied address headers (see
   * docs/architecture/change_guardrails_rules.mdc, MUST NOT 15).
   */
  clientIp: (req: Request) => string | null;
  write?: (line: string) => void;
}): RequestHandler {
  const write = opts.write ?? ((line: string) => process.stdout.write(line));
  return (req: Request, res: Response, next: NextFunction): void => {
    const startedAt = process.hrtime.bigint();
    const startedAtMs = Date.now();
    const requestId = resolveRequestId(req);
    (req as AccessLogRequest).requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    let written = false;
    const emit = () => {
      if (written) return;
      written = true;
      try {
        const record = buildAccessLogRecord(req, res, {
          startedAt,
          startedAtMs,
          clientIp: opts.clientIp,
        });
        write(JSON.stringify(record) + "\n");
      } catch {
        // Logging must never affect the response.
      }
    };
    res.on("finish", emit);
    res.on("close", emit);
    next();
  };
}
