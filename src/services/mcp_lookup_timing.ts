import type { Request, Response } from "express";
import {
  CallToolRequestSchema,
  JSONRPCRequestSchema,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@modelcontextprotocol/sdk/types.js";

import { RetrieveEntityByIdentifierSchema } from "../shared/action_schemas.js";
import { logger } from "../utils/logger.js";

type Terminal = "finish" | "close";

export type McpLookupTiming = {
  traceId: string;
  receivedAt: number;
  titlePrefix: string;
  headersAt?: number;
  dispatchedAt?: number;
  completedAt?: number;
  outcome?: "returned" | "threw";
  terminal?: Terminal;
};

const pending = new WeakMap<Request, McpLookupTiming>();

/** Capture first HTTP receipt, before parsing or authentication, without logging it. */
export function createMcpLookupReceiptObserver(env: NodeJS.ProcessEnv = process.env) {
  const header = env.NEOTOMA_DEBUG_MCP_LOOKUP_TRACE_HEADER?.toLowerCase();
  const titlePrefix = env.NEOTOMA_DEBUG_MCP_LOOKUP_TRACE_TITLE_PREFIX;
  if (!header || !/^x-[a-z0-9-]{1,55}-trace$/.test(header)) return;
  if (!titlePrefix || !/^[a-z0-9][a-z0-9_-]{0,127}:$/.test(titlePrefix)) return;

  return (req: Request, _res: Response, next: () => void): void => {
    try {
      if (req.method === "POST" && req.path === "/mcp") {
        const receivedAt = performance.now();
        let traceId: string | undefined;
        // Normalized headers may join duplicates. Require exactly one raw value.
        for (let i = 0; i < req.rawHeaders.length; i += 2) {
          if (req.rawHeaders[i].toLowerCase() !== header) continue;
          const value = req.rawHeaders[i + 1];
          if (traceId || !/^[0-9a-f]{32}$/.test(value)) {
            traceId = undefined;
            break;
          }
          traceId = value;
        }
        if (traceId) pending.set(req, { traceId, receivedAt, titlePrefix });
      }
    } catch {
      // Diagnostics must not change request handling.
    }
    next();
  };
}

/** Only called after legacy HTTP admission with the configured primary bearer. */
export function observeMcpLookupResponse(req: Request, res: Response): McpLookupTiming | undefined {
  try {
    const timing = pending.get(req);
    pending.delete(req);
    if (!timing || !req.complete || res.destroyed || !isEligibleLookup(req, timing)) return;

    const originalWriteHead = res.writeHead;
    res.writeHead = function (this: Response, ...args: unknown[]) {
      const result = Reflect.apply(originalWriteHead, this, args) as Response;
      try {
        // Server commit time, distinct from the time a client sees the headers.
        if (!timing.terminal) timing.headersAt ??= performance.now();
      } catch {
        // Preserve the response even if a timing sample cannot be taken.
      }
      return result;
    };
    const emit = (terminal: Terminal) => {
      if (timing.terminal) return;
      timing.terminal = terminal;
      try {
        res.removeListener("finish", onFinish);
        res.removeListener("close", onClose);
        const { headersAt, dispatchedAt, completedAt, outcome } = timing;
        const elapsed = (timestamp: number | undefined) =>
          timestamp === undefined
            ? undefined
            : Math.round((timestamp - timing.receivedAt) * 1000) / 1000;
        const terminalMs = elapsed(performance.now());
        logger.info(
          JSON.stringify({
            event: "mcp_identifier_lookup_timing",
            trace_id: timing.traceId,
            terminal,
            dispatch_ms: elapsed(dispatchedAt),
            completion_ms: elapsed(completedAt),
            headers_ms: elapsed(headersAt),
            finish_ms: terminal === "finish" ? terminalMs : undefined,
            close_ms: terminal === "close" ? terminalMs : undefined,
            outcome,
          })
        );
      } catch {
        // Diagnostics must not propagate from a response event.
      }
    };
    const onFinish = () => emit("finish");
    const onClose = () => emit("close");
    res.once("finish", onFinish);
    res.once("close", onClose);
    return timing;
  } catch {
    return undefined;
  }
}

type LookupScope = { entity_type?: string; by?: string; identifier: string };

function isScopedLookup(scope: LookupScope, titlePrefix: string): boolean {
  return (
    scope.entity_type === "event" &&
    scope.by === "title" &&
    scope.identifier.startsWith(titlePrefix) &&
    /^[0-9a-f]{64}$/.test(scope.identifier.slice(titlePrefix.length))
  );
}

function isEligibleLookup(req: Request, timing: McpLookupTiming): boolean {
  // Mirror the legacy SDK's POST prerequisites without changing the HTTP response.
  const accept = req.get("accept");
  const version = req.get("mcp-protocol-version");
  if (
    !req.get("mcp-session-id") ||
    !accept?.includes("application/json") ||
    !accept.includes("text/event-stream") ||
    !req.get("content-type")?.includes("application/json") ||
    (version !== undefined && !SUPPORTED_PROTOCOL_VERSIONS.includes(version))
  ) {
    return false;
  }
  const rpc = JSONRPCRequestSchema.safeParse(req.body);
  if (!rpc.success) return false;
  const tool = CallToolRequestSchema.safeParse(rpc.data);
  if (!tool.success || tool.data.params.name !== "retrieve_entity_by_identifier") return false;
  const args = RetrieveEntityByIdentifierSchema.safeParse(tool.data.params.arguments);
  return args.success && isScopedLookup(args.data, timing.titlePrefix);
}

/** Called after lookup arguments and authenticated store identity are validated. */
export function timeMcpIdentifierLookup<T>(
  timing: McpLookupTiming | undefined,
  scope: LookupScope,
  lookup: () => Promise<T>
): Promise<T> {
  if (!timing || timing.terminal || !isScopedLookup(scope, timing.titlePrefix)) {
    return lookup();
  }
  try {
    timing.dispatchedAt = performance.now();
  } catch {
    return lookup();
  }
  return completeLookupTiming(timing, lookup);
}

async function completeLookupTiming<T>(
  timing: McpLookupTiming,
  lookup: () => Promise<T>
): Promise<T> {
  let outcome: McpLookupTiming["outcome"] = "threw";
  try {
    const result = await lookup();
    outcome = "returned";
    return result;
  } finally {
    try {
      // A close receipt is the snapshot of phases reached before disconnection.
      if (!timing.terminal) {
        timing.completedAt = performance.now();
        timing.outcome = outcome;
      }
    } catch {
      // Preserve the lookup result or original rejection.
    }
  }
}
