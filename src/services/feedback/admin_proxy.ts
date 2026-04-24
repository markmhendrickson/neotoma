/**
 * Local admin proxy for the agent.neotoma.io feedback pipeline.
 *
 * The canonical admin API (`POST /feedback/:id/status`,
 * `GET /feedback/pending`, `GET /feedback/by_commit/:sha`) lives on
 * `agent.neotoma.io` and is gated by the `AGENT_SITE_ADMIN_BEARER` shared
 * secret. The Inspector cannot hold that secret — it would leak on any
 * dev workstation — so we expose a thin proxy from the local Neotoma
 * server that:
 *
 *   1. Gates requests to hardware/software AAuth tiers only, so a
 *      random local browser tab without trusted identity cannot drive
 *      pipeline writes.
 *   2. Forwards the body untouched to agent.neotoma.io, injecting the
 *      admin bearer from server-side env.
 *   3. Returns 501 `admin_proxy_unconfigured` when either env var is
 *      missing, so the Inspector can disable the UI without a 401.
 *
 * This is the Phase 4 landing for the Inspector feedback scope plan
 * (`.cursor/plans/inspector_feedback_page_scope_a5c3dd68.plan.md`).
 */

import type { Express, Request, Response } from "express";
import { getAgentIdentityFromRequest } from "../../crypto/agent_identity.js";
import { logger } from "../../utils/logger.js";

const ADMIN_BASE_URL_ENV = "AGENT_SITE_BASE_URL";
const ADMIN_BEARER_ENV = "AGENT_SITE_ADMIN_BEARER";

interface AdminProxyEnv {
  baseUrl: string;
  bearer: string;
}

function readAdminProxyEnv(): AdminProxyEnv | null {
  const baseUrl = process.env[ADMIN_BASE_URL_ENV];
  const bearer = process.env[ADMIN_BEARER_ENV];
  if (!baseUrl || !bearer) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), bearer };
}

/** Public shape for preflight callers; used by the Inspector to flip the UI. */
export interface AdminProxyPreflight {
  configured: boolean;
  base_url_env: string;
  bearer_env: string;
  allowed_tiers: string[];
}

function preflightPayload(configured: boolean): AdminProxyPreflight {
  return {
    configured,
    base_url_env: ADMIN_BASE_URL_ENV,
    bearer_env: ADMIN_BEARER_ENV,
    allowed_tiers: ["hardware", "software"],
  };
}

/**
 * Enforce that the request carries a hardware/software AAuth tier. An
 * anonymous local browser session (no key, no clientInfo) is rejected
 * with 403 so the admin proxy cannot be driven without intent. Returns
 * `true` when the guard passed; callers should return immediately when
 * it returns `false`.
 */
function enforceTier(req: Request, res: Response): boolean {
  const identity = getAgentIdentityFromRequest(req);
  const tier = identity?.tier ?? "anonymous";
  if (tier === "hardware" || tier === "software") return true;
  res.status(403).json({
    error: "admin_proxy_forbidden",
    message:
      "Admin feedback proxy requires a hardware/software AAuth tier. Resolved tier: " +
      tier,
    tier,
  });
  return false;
}

function sendUnconfigured(res: Response): void {
  res.status(501).json({
    error: "admin_proxy_unconfigured",
    message:
      "Admin feedback proxy is not configured. Set AGENT_SITE_BASE_URL and AGENT_SITE_ADMIN_BEARER on the Neotoma server to enable.",
    missing: [ADMIN_BASE_URL_ENV, ADMIN_BEARER_ENV].filter(
      (name) => !process.env[name],
    ),
  });
}

async function proxyRequest(options: {
  req: Request;
  res: Response;
  method: "GET" | "POST";
  path: string;
  body?: unknown;
}): Promise<void> {
  const { req, res, method, path, body } = options;
  const env = readAdminProxyEnv();
  if (!env) {
    sendUnconfigured(res);
    return;
  }
  const url = `${env.baseUrl}${path}`;
  const init: RequestInit = {
    method,
    headers: {
      authorization: `Bearer ${env.bearer}`,
      "content-type": "application/json",
      accept: "application/json",
      "x-neotoma-admin-proxy": "1",
    },
  };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  let upstream: Response | globalThis.Response;
  try {
    upstream = await fetch(url, init);
  } catch (err) {
    logger.warn(
      `[feedback-admin-proxy] fetch failed: ${(err as Error).message}`,
      {
        method,
        path,
        url,
        ip: req.ip,
      },
    );
    res.status(502).json({
      error: "admin_proxy_upstream_error",
      message: (err as Error).message,
    });
    return;
  }
  const contentType = upstream.headers.get("content-type") ?? "application/json";
  const text = await upstream.text();
  res.status(upstream.status).type(contentType).send(text);
}

/**
 * Mount admin proxy routes onto the Neotoma HTTP server. Safe to call
 * once at server boot. Returns silently when no registration is needed
 * so callers do not have to guard on env vars themselves.
 */
export function registerFeedbackAdminProxyRoutes(app: Express): void {
  app.get("/admin/feedback/preflight", (req, res) => {
    const env = readAdminProxyEnv();
    res.json(preflightPayload(env !== null));
  });

  app.get("/admin/feedback/pending", async (req, res) => {
    if (!enforceTier(req, res)) return;
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query)) {
      if (typeof v === "string") query.set(k, v);
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    await proxyRequest({
      req,
      res,
      method: "GET",
      path: `/feedback/pending${suffix}`,
    });
  });

  app.get("/admin/feedback/by_commit/:sha", async (req, res) => {
    if (!enforceTier(req, res)) return;
    const sha = encodeURIComponent(req.params.sha);
    await proxyRequest({
      req,
      res,
      method: "GET",
      path: `/feedback/by_commit/${sha}`,
    });
  });

  app.post("/admin/feedback/:id/status", async (req, res) => {
    if (!enforceTier(req, res)) return;
    const id = encodeURIComponent(req.params.id);
    await proxyRequest({
      req,
      res,
      method: "POST",
      path: `/feedback/${id}/status`,
      body: req.body ?? {},
    });
  });
}

/** Exposed for tests. */
export const FEEDBACK_ADMIN_PROXY_INTERNALS = {
  readAdminProxyEnv,
  preflightPayload,
  enforceTier,
  sendUnconfigured,
};
