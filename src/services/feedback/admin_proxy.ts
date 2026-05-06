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
 *   1. Gates requests to hardware/software/operator_attested AAuth tiers
 *      or a short-lived local admin session minted from those tiers, so a
 *      random local browser tab without trusted identity cannot drive
 *      pipeline writes.
 *   2. In `hosted` mode, forwards the body untouched to agent.neotoma.io,
 *      injecting the admin bearer from server-side env.
 *   3. In `local` mode, reads/writes the on-disk `LocalFeedbackStore`
 *      and mirrors every write into the `neotoma_feedback` entity graph
 *      via `mirrorLocalFeedbackToEntity`.
 *   4. Returns 501 `admin_proxy_unconfigured` only when
 *      `NEOTOMA_FEEDBACK_ADMIN_MODE=disabled`.
 *
 * Mode is resolved per request from `NEOTOMA_FEEDBACK_ADMIN_MODE` (explicit)
 * or the `AGENT_SITE_BASE_URL` + `AGENT_SITE_ADMIN_BEARER` pair (inferred).
 */

import type { Express, Request, Response } from "express";
import { getAgentIdentityFromRequest } from "../../crypto/agent_identity.js";
import { LocalFeedbackStore, type LocalFeedbackRecord } from "./local_store.js";
import { mirrorLocalFeedbackToEntity } from "./mirror_local_to_entity.js";
import { logger } from "../../utils/logger.js";
import {
  FEEDBACK_ADMIN_ALLOWED_TIERS,
  clearFeedbackAdminCookie,
  createFeedbackAdminChallenge,
  describeFeedbackAdminSession,
  describeFeedbackAdminSessionForChallenge,
  getFeedbackAdminSessionFromRequest,
  getRedeemedFeedbackAdminSession,
  redeemFeedbackAdminChallenge,
  revokeFeedbackAdminSessionFromRequest,
  setFeedbackAdminCookie,
  type FeedbackAdminSessionSnapshot,
} from "./admin_session.js";

const ADMIN_BASE_URL_ENV = "AGENT_SITE_BASE_URL";
const ADMIN_BEARER_ENV = "AGENT_SITE_ADMIN_BEARER";
const ADMIN_MODE_ENV = "NEOTOMA_FEEDBACK_ADMIN_MODE";

export type AdminFeedbackMode = "hosted" | "local" | "disabled";

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

export function resolveAdminFeedbackMode(
  env: Record<string, string | undefined> = process.env
): AdminFeedbackMode {
  const explicit = env[ADMIN_MODE_ENV]?.trim().toLowerCase();
  if (explicit === "disabled") return "disabled";
  if (explicit === "hosted" || explicit === "local") return explicit;
  return env[ADMIN_BASE_URL_ENV] && env[ADMIN_BEARER_ENV] ? "hosted" : "local";
}

/** Public shape for preflight callers; used by the Inspector to flip the UI. */
export interface AdminProxyPreflight {
  configured: boolean;
  mode: AdminFeedbackMode;
  base_url_env: string;
  bearer_env: string;
  mode_env: string;
  allowed_tiers: string[];
  current_direct_tier: string;
  admin_session: FeedbackAdminSessionSnapshot;
}

function preflightPayload(
  configured: boolean,
  mode: AdminFeedbackMode,
  req?: Request
): AdminProxyPreflight {
  const identity = req ? getAgentIdentityFromRequest(req) : null;
  return {
    configured,
    mode,
    base_url_env: ADMIN_BASE_URL_ENV,
    bearer_env: ADMIN_BEARER_ENV,
    mode_env: ADMIN_MODE_ENV,
    allowed_tiers: [...FEEDBACK_ADMIN_ALLOWED_TIERS],
    current_direct_tier: identity?.tier ?? "anonymous",
    admin_session: req ? describeFeedbackAdminSession(req) : { active: false },
  };
}

/**
 * Resolve admin identity from either direct verified AAuth on the request
 * or a short-lived local admin session minted by the unlock bridge.
 */
function resolveFeedbackAdminIdentity(req: Request):
  | {
      source: "aauth";
      tier: string;
      thumbprint?: string;
      sub?: string;
      iss?: string;
    }
  | {
      source: "admin_session";
      tier: string;
      thumbprint?: string;
      sub?: string;
      iss?: string;
      expires_at: string;
    }
  | null {
  const identity = getAgentIdentityFromRequest(req);
  if (identity && FEEDBACK_ADMIN_ALLOWED_TIERS.includes(identity.tier)) {
    return {
      source: "aauth",
      tier: identity.tier,
      thumbprint: identity.thumbprint,
      sub: identity.sub,
      iss: identity.iss,
    };
  }

  const session = getFeedbackAdminSessionFromRequest(req);
  if (session && FEEDBACK_ADMIN_ALLOWED_TIERS.includes(session.tier)) {
    return {
      source: "admin_session",
      tier: session.tier,
      thumbprint: session.thumbprint,
      sub: session.sub,
      iss: session.iss,
      expires_at: new Date(session.expiresAt).toISOString(),
    };
  }

  return null;
}

function enforceFeedbackAdminIdentity(req: Request, res: Response): boolean {
  const resolved = resolveFeedbackAdminIdentity(req);
  if (resolved) return true;
  const directTier = getAgentIdentityFromRequest(req)?.tier ?? "anonymous";
  const session = describeFeedbackAdminSession(req);
  res.status(403).json({
    error: "admin_proxy_forbidden",
    message:
      "Admin feedback proxy requires hardware/software/operator_attested AAuth or an active Inspector admin session. Resolved direct tier: " +
      directTier,
    tier: directTier,
    allowed_tiers: [...FEEDBACK_ADMIN_ALLOWED_TIERS],
    admin_session: session,
  });
  return false;
}

function sendUnconfigured(res: Response): void {
  const mode = resolveAdminFeedbackMode();
  res.status(501).json({
    error: "admin_proxy_unconfigured",
    message:
      "Admin feedback proxy is disabled. Set NEOTOMA_FEEDBACK_ADMIN_MODE to 'local' or 'hosted', or unset it to default to local mode.",
    mode,
    missing: [ADMIN_BASE_URL_ENV, ADMIN_BEARER_ENV].filter((name) => !process.env[name]),
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
    logger.warn(`[feedback-admin-proxy] fetch failed: ${(err as Error).message}`, {
      method,
      path,
      url,
      ip: req.ip,
    });
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

// ---------------------------------------------------------------------------
// Local-mode backends
// ---------------------------------------------------------------------------

async function listAllLocal(_req: Request, res: Response): Promise<void> {
  const store = new LocalFeedbackStore();
  const records = await store.listAll();
  records.sort((a, b) => (b.last_activity_at ?? b.submitted_at).localeCompare(a.last_activity_at ?? a.submitted_at));
  res.json({
    items: records,
    total: records.length,
    mode: "local",
  });
}

async function listPendingLocal(req: Request, res: Response): Promise<void> {
  const limit = parseInt(String(req.query.limit ?? "100"), 10) || 100;
  const store = new LocalFeedbackStore();
  const records = await store.listPending(limit);
  res.json({
    items: records,
    total: records.length,
    mode: "local",
  });
}

async function findByCommitLocal(req: Request, res: Response, sha: string): Promise<void> {
  const store = new LocalFeedbackStore();
  const ids = await store.findByCommitSha(sha);
  const records: LocalFeedbackRecord[] = [];
  for (const id of ids) {
    const r = await store.getById(id);
    if (r) records.push(r);
  }
  res.json({ items: records, mode: "local" });
}

async function updateStatusLocal(req: Request, res: Response, id: string): Promise<void> {
  const store = new LocalFeedbackStore();
  const record = await store.getById(id);
  if (!record) {
    res
      .status(404)
      .json({ error: "not_found", message: `Feedback ${id} not found in local store` });
    return;
  }

  const body = req.body ?? {};
  const now = new Date();

  const isRemoval = body.status === "removed";

  const links = {
    ...record.resolution_links,
    ...(body.github_issue_urls ? { github_issue_urls: body.github_issue_urls } : {}),
    ...(body.pull_request_urls ? { pull_request_urls: body.pull_request_urls } : {}),
    ...(body.commit_shas ? { commit_shas: body.commit_shas } : {}),
    ...(body.duplicate_of_feedback_id !== undefined
      ? { duplicate_of_feedback_id: body.duplicate_of_feedback_id }
      : {}),
    ...(body.notes_markdown !== undefined ? { notes_markdown: body.notes_markdown } : {}),
  };

  const updated: LocalFeedbackRecord = {
    ...record,
    status: body.status ?? record.status,
    status_updated_at: now.toISOString(),
    classification: body.classification ?? record.classification,
    triage_notes: body.triage_notes ?? record.triage_notes,
    last_activity_at: now.toISOString(),
    consecutive_same_status_polls: 0,
    resolution_links: links,
    upgrade_guidance:
      body.upgrade_guidance !== undefined ? body.upgrade_guidance : record.upgrade_guidance,
    next_check_suggested_at:
      body.next_check_suggested_at !== undefined
        ? body.next_check_suggested_at
        : record.next_check_suggested_at,
    ...(isRemoval ? { title: "[removed]", body: "[removed]" } : {}),
  };

  await store.upsert(updated);

  const mirror = await mirrorLocalFeedbackToEntity(updated, {
    dataSource: `neotoma local admin ${now.toISOString().slice(0, 10)}`,
    userId: updated.submitter_id,
  });

  res.json({
    ok: true,
    status: updated.status,
    mode: "local",
    record: updated,
    mirror,
  });
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

/**
 * Mount admin proxy routes onto the Neotoma HTTP server. Safe to call
 * once at server boot. Returns silently when no registration is needed
 * so callers do not have to guard on env vars themselves.
 */
export function registerFeedbackAdminProxyRoutes(app: Express): void {
  app.get("/admin/feedback/preflight", (req, res) => {
    const mode = resolveAdminFeedbackMode();
    res.json(preflightPayload(mode !== "disabled", mode, req));
  });

  app.post("/admin/feedback/auth/challenge", (_req, res) => {
    const challenge = createFeedbackAdminChallenge();
    res.json({
      ...challenge,
      unlock_command: `neotoma inspector admin unlock --challenge ${challenge.challenge}`,
    });
  });

  app.post("/admin/feedback/auth/redeem", (req, res) => {
    const challenge = typeof req.body?.challenge === "string" ? req.body.challenge : "";
    if (!challenge) {
      res.status(400).json({
        error: "admin_unlock_bad_request",
        message: "Missing challenge.",
      });
      return;
    }
    try {
      const session = redeemFeedbackAdminChallenge(
        challenge,
        getAgentIdentityFromRequest(req)
      );
      res.json({
        ok: true,
        tier: session.tier,
        expires_at: new Date(session.expiresAt).toISOString(),
      });
    } catch (err) {
      res.status(403).json({
        error: "admin_unlock_forbidden",
        message: (err as Error).message,
        allowed_tiers: [...FEEDBACK_ADMIN_ALLOWED_TIERS],
      });
    }
  });

  app.get("/admin/feedback/auth/session", (req, res) => {
    const challenge = typeof req.query.challenge === "string" ? req.query.challenge : undefined;
    const existing = describeFeedbackAdminSession(req);
    if (existing.active) {
      res.json({ ...existing, source: "cookie" });
      return;
    }

    if (challenge) {
      const session = getRedeemedFeedbackAdminSession(challenge);
      if (session) {
        setFeedbackAdminCookie(res, session);
        res.json({ ...describeFeedbackAdminSessionForChallenge(challenge), source: "challenge" });
        return;
      }
    }

    res.json({ active: false });
  });

  app.post("/admin/feedback/auth/logout", (req, res) => {
    revokeFeedbackAdminSessionFromRequest(req);
    clearFeedbackAdminCookie(res);
    res.json({ ok: true });
  });

  app.get("/admin/feedback/all", async (req, res) => {
    if (!enforceFeedbackAdminIdentity(req, res)) return;
    const mode = resolveAdminFeedbackMode();
    if (mode === "disabled") {
      sendUnconfigured(res);
      return;
    }
    if (mode === "local") {
      await listAllLocal(req, res);
      return;
    }
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query)) {
      if (typeof v === "string") query.set(k, v);
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    await proxyRequest({
      req,
      res,
      method: "GET",
      path: `/feedback/all${suffix}`,
    });
  });

  app.get("/admin/feedback/pending", async (req, res) => {
    if (!enforceFeedbackAdminIdentity(req, res)) return;
    const mode = resolveAdminFeedbackMode();
    if (mode === "disabled") {
      sendUnconfigured(res);
      return;
    }
    if (mode === "local") {
      await listPendingLocal(req, res);
      return;
    }
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
    if (!enforceFeedbackAdminIdentity(req, res)) return;
    const mode = resolveAdminFeedbackMode();
    if (mode === "disabled") {
      sendUnconfigured(res);
      return;
    }
    const sha = decodeURIComponent(req.params.sha);
    if (mode === "local") {
      await findByCommitLocal(req, res, sha);
      return;
    }
    await proxyRequest({
      req,
      res,
      method: "GET",
      path: `/feedback/by_commit/${encodeURIComponent(sha)}`,
    });
  });

  app.post("/admin/feedback/:id/status", async (req, res) => {
    if (!enforceFeedbackAdminIdentity(req, res)) return;
    const mode = resolveAdminFeedbackMode();
    if (mode === "disabled") {
      sendUnconfigured(res);
      return;
    }
    const id = decodeURIComponent(req.params.id);
    if (mode === "local") {
      await updateStatusLocal(req, res, id);
      return;
    }
    await proxyRequest({
      req,
      res,
      method: "POST",
      path: `/feedback/${encodeURIComponent(id)}/status`,
      body: req.body ?? {},
    });
  });
}

/** Exposed for tests. */
export const FEEDBACK_ADMIN_PROXY_INTERNALS = {
  readAdminProxyEnv,
  preflightPayload,
  resolveFeedbackAdminIdentity,
  enforceFeedbackAdminIdentity,
  sendUnconfigured,
  resolveAdminFeedbackMode,
  listAllLocal,
  listPendingLocal,
  findByCommitLocal,
  updateStatusLocal,
  getRedeemedFeedbackAdminSession,
};
