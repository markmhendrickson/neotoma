/**
 * Attribution context middleware.
 *
 * Runs after {@link aauthVerify} and is responsible for threading the
 * resolved {@link AgentIdentity} into the per-request `AsyncLocalStorage`
 * store that every write-path service reads from via
 * `getCurrentAgentIdentity()`. Before this middleware existed only the
 * `/mcp` handler did that wiring (see Phase 1.6 of the AAuth integration),
 * which meant direct HTTP write routes (`/store`, `/observations/create`,
 * `/create_relationship`, `/correct`, and the rest) could not honour AAuth
 * headers even when the caller sent a valid signature.
 *
 * The middleware is purely wiring: it never rejects a request, logs at
 * most one structured event (the `aauthVerify` middleware already emits
 * `attribution_decision`), and degrades to a null identity for unsigned
 * anonymous callers. The attribution policy is applied one layer deeper,
 * inside each write-path service via `enforceAttributionPolicy`.
 *
 * Fallback attribution (Phase 1 of the parity plan): beyond AAuth, this
 * middleware honours optional `X-Client-Name` and `X-Client-Version`
 * headers so CLI and other HTTP-only clients can self-report a non-MCP
 * `clientInfo.name` equivalent. Values that hit
 * {@link normaliseClientNameWithReason}'s generic-name list are dropped,
 * same as MCP's `initialize` handshake.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";

import {
  getAgentIdentityFromRequest,
  normaliseClientName,
} from "../crypto/agent_identity.js";
import {
  getAttributionDecisionFromRequest,
} from "./aauth_verify.js";
import { runWithRequestContext } from "../services/request_context.js";

function headerString(req: Request, name: string): string | null {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  if (typeof value === "string") return value;
  return null;
}

/**
 * Resolve the caller-supplied `clientInfo`-equivalent fields from HTTP
 * headers. We intentionally prefer explicit headers over User-Agent so
 * the signal stays structured and callers opt in.
 */
function extractClientInfoFromHeaders(req: Request): {
  clientName: string | null;
  clientVersion: string | null;
  connectionId: string | null;
} {
  return {
    clientName: headerString(req, "x-client-name"),
    clientVersion: headerString(req, "x-client-version"),
    connectionId:
      headerString(req, "x-connection-id") ?? headerString(req, "x-connection-id".toLowerCase()),
  };
}

/**
 * Express middleware that stashes the resolved agent identity into the
 * per-request `AsyncLocalStorage` store. Apply this globally in
 * [src/actions.ts](../actions.ts) after {@link aauthVerify} so every
 * downstream route handler — including direct-write HTTP endpoints —
 * sees the same identity the MCP handler already does.
 *
 * The handler passed to `next()` runs inside the `AsyncLocalStorage`
 * scope. Routes that need a richer server-resolved identity (the MCP
 * HTTP handler is the canonical example) may still call
 * {@link runWithRequestContext} themselves to nest a more specific
 * context — nested scopes shadow outer ones exactly as intended.
 */
export function attributionContext(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { clientName, clientVersion, connectionId } =
      extractClientInfoFromHeaders(req);
    const identity = getAgentIdentityFromRequest(req, {
      clientName: normaliseClientName(clientName),
      clientVersion,
      connectionId,
    });
    const decision = getAttributionDecisionFromRequest(req);
    runWithRequestContext(
      {
        agentIdentity: identity,
        attributionDecision: decision,
      },
      () => {
        next();
      },
    );
  };
}
