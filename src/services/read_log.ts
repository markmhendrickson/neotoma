/**
 * Structured per-call read log (part of neotoma#1872).
 *
 * In the HTTP server process, every entity read (the operations marked
 * `readLog` in src/shared/contract_mappings.ts) writes ONE JSON line to
 * standard output per call, listing which entities the call returned. A log
 * shipper can keep the line outside the instance. The REST surface writes it
 * from the `restReadLog` middleware; MCP calls served over HTTP write it from
 * the tool dispatcher in src/server.ts. The stdio MCP process and in-process
 * callers write nothing (see `readLogWriter`).
 *
 * Content rule: the line carries entity ids and entity types only. It never
 * carries entity contents, snapshot fields, search text or query values; a
 * search term is logged as its length (`query_length`).
 *
 * The line is written whenever `NEOTOMA_ACCESS_LOG` is not `off` (the same
 * setting as the access log in src/services/access_log.ts).
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { OPENAPI_OPERATION_MAPPINGS } from "../shared/contract_mappings.js";

export const READ_LOG_EVENT = "read";
export const READ_LOG_ENTITY_ID_CAP = 50;
/** Bounds on the result walk so a large response cannot make logging expensive. */
const MAX_WALK_DEPTH = 8;
const MAX_WALK_NODES = 20000;

export type ReadSurface = "rest" | "mcp";
export type ReadStatus = "ok" | "refused" | "error";

export interface ReadLogRecord {
  ts: string;
  event: typeof READ_LOG_EVENT;
  request_id: string | null;
  user_id: string | null;
  surface: ReadSurface;
  operation: string;
  agent: string | null;
  auth_method: string;
  status: ReadStatus;
  /** HTTP status for REST calls; null for MCP calls. */
  http_status: number | null;
  entity_types: Record<string, number>;
  count: number;
  entity_ids: string[];
  truncated: boolean;
  /** Length of the search term when the call carried one; never the term itself. */
  query_length: number | null;
}

/** True unless `NEOTOMA_ACCESS_LOG` is `off`. */
export function readLogEnabled(rawValue: string | undefined): boolean {
  return (rawValue ?? "").trim().toLowerCase() !== "off";
}

/**
 * MCP tool names that are reads: every `readLog` operation in
 * src/shared/contract_mappings.ts that has an MCP twin. Derived from the same
 * rows as `REST_READ_ROUTES`, so a read on one surface is a read on the other.
 */
export const READ_TOOL_NAMES: ReadonlySet<string> = new Set(
  OPENAPI_OPERATION_MAPPINGS.filter((m) => m.readLog === true && m.mcpTool).map(
    (m) => m.mcpTool as string
  )
);

interface RestReadRoute {
  method: string;
  pattern: RegExp;
  operation: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Pattern for an OpenAPI path. Matching ignores letter case and allows one
 * trailing slash, as Express routing does with its default (non-strict,
 * case-insensitive) settings, so every spelling that reaches a handler is
 * logged.
 */
export function readRoutePattern(path: string): RegExp {
  const source = path
    .split("/")
    .map((segment) => (/^\{[^}]+\}$/.test(segment) ? "[^/]+" : escapeRegExp(segment)))
    .join("/");
  return new RegExp(`^${source}/?$`, "i");
}

function paramCount(path: string): number {
  return (path.match(/\{/g) ?? []).length;
}

/**
 * REST read routes: every `readLog` operation in the contract mappings, with
 * literal paths tried before parameterised ones (so `/entities/duplicates`
 * is not taken for `/entities/{id}`). The logged operation is the
 * `operationId`. Matched on method and path, before or after auth runs.
 */
export const REST_READ_ROUTES: readonly RestReadRoute[] = OPENAPI_OPERATION_MAPPINGS.filter(
  (m) => m.readLog === true
)
  .map((m, index) => ({ m, index }))
  .sort((a, b) => paramCount(a.m.path) - paramCount(b.m.path) || a.index - b.index)
  .map(({ m }) => ({
    method: m.method.toUpperCase(),
    pattern: readRoutePattern(m.path),
    operation: m.operationId,
  }));

export function matchRestReadRoute(method: string, path: string): string | null {
  const upper = method.toUpperCase();
  for (const route of REST_READ_ROUTES) {
    if (route.method === upper && route.pattern.test(path)) return route.operation;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function entityIdOf(node: Record<string, unknown>): string | null {
  if (typeof node.entity_type !== "string" || node.entity_type.length === 0) return null;
  if (typeof node.entity_id === "string" && node.entity_id.length > 0) return node.entity_id;
  if (typeof node.id === "string" && node.id.startsWith("ent_")) return node.id;
  return null;
}

/**
 * Collect the entities a read result returned: every object that carries an
 * `entity_type` together with an `entity_id` (or an `ent_` `id`). The walk
 * does not descend into a matched entity, so ids referenced from inside an
 * entity's snapshot are not counted as returned. Duplicate ids count once.
 */
export function collectReturnedEntities(result: unknown): Array<{ id: string; type: string }> {
  const seen = new Map<string, string>();
  let nodes = 0;
  const walk = (value: unknown, depth: number): void => {
    if (depth > MAX_WALK_DEPTH || nodes >= MAX_WALK_NODES) return;
    nodes += 1;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    if (!isRecord(value)) return;
    const id = entityIdOf(value);
    if (id !== null) {
      if (!seen.has(id)) seen.set(id, value.entity_type as string);
      return;
    }
    for (const key of Object.keys(value)) walk(value[key], depth + 1);
  };
  walk(result, 0);
  return [...seen.entries()].map(([id, type]) => ({ id, type }));
}

/** Length of the search term in read arguments, or null when none was given. */
export function searchQueryLength(args: unknown): number | null {
  if (!isRecord(args)) return null;
  for (const key of ["search", "query"]) {
    const value = args[key];
    if (typeof value === "string") return value.length;
  }
  return null;
}

export interface ReadLogInput {
  surface: ReadSurface;
  operation: string;
  requestId: string | null;
  userId: string | null;
  agent: string | null;
  authMethod: string;
  status: ReadStatus;
  httpStatus?: number | null;
  /** The read result; ignored unless `status` is `ok`. */
  result?: unknown;
  queryLength?: number | null;
  now?: Date;
}

export function buildReadLogRecord(input: ReadLogInput): ReadLogRecord {
  const entities = input.status === "ok" ? collectReturnedEntities(input.result) : [];
  const entityTypes: Record<string, number> = {};
  for (const entity of entities) {
    entityTypes[entity.type] = (entityTypes[entity.type] ?? 0) + 1;
  }
  const truncated = entities.length > READ_LOG_ENTITY_ID_CAP;
  return {
    ts: (input.now ?? new Date()).toISOString(),
    event: READ_LOG_EVENT,
    request_id: input.requestId,
    user_id: input.userId,
    surface: input.surface,
    operation: input.operation,
    agent: input.agent,
    auth_method: input.authMethod,
    status: input.status,
    http_status: input.httpStatus ?? null,
    entity_types: entityTypes,
    count: entities.length,
    entity_ids: entities.slice(0, READ_LOG_ENTITY_ID_CAP).map((e) => e.id),
    truncated,
    query_length: input.queryLength ?? null,
  };
}

/**
 * The line writer. Null until a host installs one: only the HTTP server
 * process does (`installHttpReadLogWriter`, called from `startHTTPServer`).
 * In the stdio MCP process standard output carries the JSON-RPC messages, and
 * in-process callers (the CLI's local transport, plugins) own their standard
 * output, so neither may receive a read line.
 */
let readLogWriter: ((line: string) => void) | null = null;

/** Replace the line writer (tests, HTTP startup). Returns the previous writer. */
export function setReadLogWriter(
  writer: ((line: string) => void) | null
): ((line: string) => void) | null {
  const previous = readLogWriter;
  readLogWriter = writer;
  return previous;
}

/** True when a host installed a writer, so read lines will be written. */
export function readLogWriterInstalled(): boolean {
  return readLogWriter !== null;
}

/** Install the standard-output writer. Called only by the HTTP server at startup. */
export function installHttpReadLogWriter(): void {
  setReadLogWriter((line) => {
    process.stdout.write(line);
  });
}

/** Write one read line. Never throws: logging must not affect the read. */
export function writeReadLog(input: ReadLogInput): void {
  const writer = readLogWriter;
  if (writer === null) return;
  try {
    writer(JSON.stringify(buildReadLogRecord(input)) + "\n");
  } catch {
    // Logging must never affect the response.
  }
}

/** Parse the JSON payload of an MCP tool result, or null. */
export function parseToolResultPayload(result: unknown): unknown {
  if (!isRecord(result) || !Array.isArray(result.content)) return null;
  const first = result.content[0];
  if (!isRecord(first) || first.type !== "text" || typeof first.text !== "string") return null;
  try {
    return JSON.parse(first.text);
  } catch {
    return null;
  }
}

type ReadLogRequest = Request & {
  requestId?: string;
  authMethod?: string;
  authenticatedUserId?: string;
  aauthAdmission?: { admitted?: boolean; agent_label?: string } | null;
};

/** The signed-agent label the access log carries, or null. */
export function admittedAgentLabel(
  admission: { admitted?: boolean; agent_label?: string } | null | undefined
): string | null {
  return admission?.admitted && admission.agent_label ? admission.agent_label : null;
}

function restStatus(httpStatus: number): ReadStatus {
  if (httpStatus < 400) return "ok";
  if (httpStatus === 401 || httpStatus === 403) return "refused";
  return "error";
}

/**
 * Express middleware for the REST surface. For a request matching a read
 * route it captures the JSON body passed to `res.json` and writes one line
 * when the response finishes. Install after the access log (so the request
 * id exists) and before the auth middleware (so a refused read is logged).
 */
export function restReadLog(opts: { write?: (line: string) => void } = {}): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const operation = matchRestReadRoute(req.method, req.path);
    if (operation === null) {
      next();
      return;
    }
    let body: unknown;
    const originalJson = res.json.bind(res);
    res.json = ((payload: unknown) => {
      body = payload;
      return originalJson(payload);
    }) as Response["json"];
    let written = false;
    const emit = () => {
      if (written) return;
      written = true;
      const r = req as ReadLogRequest;
      const httpStatus = res.writableFinished ? res.statusCode : 499;
      const input: ReadLogInput = {
        surface: "rest",
        operation,
        requestId: r.requestId ?? null,
        userId: typeof r.authenticatedUserId === "string" ? r.authenticatedUserId : null,
        agent: admittedAgentLabel(r.aauthAdmission),
        authMethod: r.authMethod ?? "none",
        status: restStatus(httpStatus),
        httpStatus,
        result: body,
        queryLength: searchQueryLength(req.method === "GET" ? req.query : req.body),
      };
      if (opts.write) {
        try {
          opts.write(JSON.stringify(buildReadLogRecord(input)) + "\n");
        } catch {
          // Logging must never affect the response.
        }
      } else {
        writeReadLog(input);
      }
    };
    res.on("finish", emit);
    res.on("close", emit);
    next();
  };
}
