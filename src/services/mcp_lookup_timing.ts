import type { Request, Response } from "express";

import { logger } from "../utils/logger.js";

export type McpLookupTiming = {
  traceId: string;
  receivedAt: number;
  titlePrefix: string;
  headersAt?: number;
  dispatchedAt?: number;
  completedAt?: number;
  outcome?: "returned" | "threw";
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

/** Only called on the legacy transport path after the configured primary bearer passes. */
export function observeMcpLookupResponse(req: Request, res: Response): McpLookupTiming | undefined {
  try {
    const timing = pending.get(req);
    if (!timing || Array.isArray(req.body) || req.body?.method !== "tools/call") return;
    if (req.body.params?.name !== "retrieve_entity_by_identifier") return;

    const originalWriteHead = res.writeHead;
    res.writeHead = function (this: Response, ...args: unknown[]) {
      const result = Reflect.apply(originalWriteHead, this, args) as Response;
      try {
        // Server commit time, distinct from the time a client sees the headers.
        timing.headersAt ??= performance.now();
      } catch {
        // Preserve the response even if a timing sample cannot be taken.
      }
      return result;
    };
    res.once("finish", () => {
      try {
        const { headersAt, dispatchedAt, completedAt, outcome } = timing;
        if (headersAt === undefined || dispatchedAt === undefined || completedAt === undefined) {
          return;
        }
        const elapsed = (timestamp: number) =>
          Math.round((timestamp - timing.receivedAt) * 1000) / 1000;
        logger.info(
          JSON.stringify({
            event: "mcp_identifier_lookup_timing",
            trace_id: timing.traceId,
            dispatch_ms: elapsed(dispatchedAt),
            completion_ms: elapsed(completedAt),
            headers_ms: elapsed(headersAt),
            finish_ms: elapsed(performance.now()),
            outcome,
          })
        );
      } catch {
        // Diagnostics must not propagate from a response event.
      }
    });
    return timing;
  } catch {
    return undefined;
  }
}

type LookupScope = { entity_type?: string; by?: string; identifier: string };

/** Called after lookup arguments and authenticated store identity are validated. */
export function timeMcpIdentifierLookup<T>(
  timing: McpLookupTiming | undefined,
  scope: LookupScope,
  lookup: () => Promise<T>
): Promise<T> {
  if (
    !timing ||
    scope.entity_type !== "event" ||
    scope.by !== "title" ||
    !scope.identifier.startsWith(timing.titlePrefix) ||
    !/^[0-9a-f]{64}$/.test(scope.identifier.slice(timing.titlePrefix.length))
  ) {
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
      timing.completedAt = performance.now();
      timing.outcome = outcome;
    } catch {
      // Preserve the lookup result or original rejection.
    }
  }
}
