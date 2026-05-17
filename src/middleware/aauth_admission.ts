/**
 * AAuth admission middleware.
 *
 * Runs after {@link aauthVerify} and {@link attributionContext}: looks up
 * the active `agent_grant` for the verified AAuth identity and stamps
 * the resolved decision onto the request as `req.aauthAdmission` plus
 * `req.authenticatedUserId` when an active grant matches. Per the
 * Stronger AAuth Admission plan, this is what makes verified AAuth a
 * third remote auth path alongside Bearer / OAuth / X-Connection-Id.
 *
 * The middleware is non-blocking: callers without an AAuth signature,
 * with an unverified signature, or whose identity does not match an
 * active grant flow through unchanged. Whether to reject afterwards is
 * the responsibility of route gates (e.g. the `/mcp` `hasAuth` check
 * and the direct-HTTP write-route auth middleware in
 * [src/actions.ts](../actions.ts)).
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";

import type { AAuthRequestContext } from "../crypto/agent_identity.js";
import { admitFromAAuthContext } from "../services/aauth_admission.js";
import { getAAuthContextFromRequest } from "./aauth_verify.js";
import { getRequestContext, runWithRequestContext } from "../services/request_context.js";
import type { AAuthAdmissionContext } from "../services/protected_entity_types.js";

/** Skip admission lookups on cheap public discovery endpoints. */
const PUBLIC_DISCOVERY_PREFIXES: ReadonlyArray<string> = ["/.well-known/", "/health"];

function isPublicDiscovery(req: Request): boolean {
  const path = req.path || req.url || "";
  return PUBLIC_DISCOVERY_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Express middleware. Stamps `req.aauthAdmission` and (when admitted)
 * `req.authenticatedUserId`, then nests a {@link runWithRequestContext}
 * scope so deep services (`assertCanWriteProtected`,
 * `enforceAgentCapability`) read the same admission via
 * `getCurrentAAuthAdmission()`.
 */
export function aauthAdmission(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (isPublicDiscovery(req)) {
      next();
      return;
    }
    const ctx: AAuthRequestContext | null = getAAuthContextFromRequest(req);
    if (!ctx) {
      // Not signed or signature failed — admission cannot apply. Stamp a
      // negative admission so downstream introspection (/session,
      // diagnostics) can still report a stable shape.
      const negative: AAuthAdmissionContext = {
        admitted: false,
        reason: "not_signed",
      };
      stampAdmission(req, negative);
      const outer = getRequestContext();
      runWithRequestContext(
        {
          agentIdentity: outer?.agentIdentity ?? null,
          attributionDecision: outer?.attributionDecision ?? null,
          aauthAdmission: negative,
        },
        () => {
          next();
        }
      );
      return;
    }

    void admitFromAAuthContext(ctx)
      .then((decision) => {
        const admission: AAuthAdmissionContext = {
          admitted: decision.admitted,
          reason: decision.reason,
          user_id: decision.user_id,
          grant_id: decision.grant_id,
          agent_label: decision.agent_label,
          capabilities: decision.capabilities,
        };
        stampAdmission(req, admission);
        if (admission.admitted && admission.user_id) {
          (req as Request & { authenticatedUserId?: string }).authenticatedUserId =
            admission.user_id;
        }
        const outer = getRequestContext();
        runWithRequestContext(
          {
            agentIdentity: outer?.agentIdentity ?? null,
            attributionDecision: outer?.attributionDecision ?? null,
            aauthAdmission: admission,
          },
          () => {
            next();
          }
        );
      })
      .catch((err) => {
        // Admission lookup is best-effort. On failure, mark the request
        // as unmatched and keep flowing — route gates will still apply
        // and reject when no other auth was supplied.
        const fallback: AAuthAdmissionContext = {
          admitted: false,
          reason: "no_match",
        };
        stampAdmission(req, fallback);
        const outer = getRequestContext();
        runWithRequestContext(
          {
            agentIdentity: outer?.agentIdentity ?? null,
            attributionDecision: outer?.attributionDecision ?? null,
            aauthAdmission: fallback,
          },
          () => {
            next(err instanceof Error ? undefined : undefined);
          }
        );
      });
  };
}

function stampAdmission(req: Request, admission: AAuthAdmissionContext): void {
  (req as Request & { aauthAdmission?: AAuthAdmissionContext }).aauthAdmission = admission;
}

/** Helper for handlers that want the stamped admission without a context dive. */
export function getAAuthAdmissionFromRequest(req: Request): AAuthAdmissionContext | null {
  return (req as Request & { aauthAdmission?: AAuthAdmissionContext }).aauthAdmission ?? null;
}
