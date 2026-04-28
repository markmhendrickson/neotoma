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
  env: Record<string, string | undefined> = process.env,
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
}

function preflightPayload(
  configured: boolean,
  mode: AdminFeedbackMode,
): AdminProxyPreflight {
  return {
    configured,
    mode,
    base_url_env: ADMIN_BASE_URL_ENV,
    bearer_env: ADMIN_BEARER_ENV,
    mode_env: ADMIN_MODE_ENV,
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
  if (tier === "hardware" || tier === "software" || tier === "operator_attested") return true;
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
  const mode = resolveAdminFeedbackMode();
  res.status(501).json({
    error: "admin_proxy_unconfigured",
    message:
      "Admin feedback proxy is disabled. Set NEOTOMA_FEEDBACK_ADMIN_MODE to 'local' or 'hosted', or unset it to default to local mode.",
    mode,
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

// ---------------------------------------------------------------------------
// Local-mode backends
// ---------------------------------------------------------------------------

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

async function findByCommitLocal(
  req: Request,
  res: Response,
  sha: string,
): Promise<void> {
  const store = new LocalFeedbackStore();
  const ids = await store.findByCommitSha(sha);
  const records: LocalFeedbackRecord[] = [];
  for (const id of ids) {
    const r = await store.getById(id);
    if (r) records.push(r);
  }
  res.json({ items: records, mode: "local" });
}

async function updateStatusLocal(
  req: Request,
  res: Response,
  id: string,
): Promise<void> {
  const store = new LocalFeedbackStore();
  const record = await store.getById(id);
  if (!record) {
    res.status(404).json({ error: "not_found", message: `Feedback ${id} not found in local store` });
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
    ...(body.notes_markdown !== undefined
      ? { notes_markdown: body.notes_markdown }
      : {}),
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
    upgrade_guidance: body.upgrade_guidance !== undefined ? body.upgrade_guidance : record.upgrade_guidance,
    next_check_suggested_at: body.next_check_suggested_at !== undefined
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
  app.get("/admin/feedback/preflight", (_req, res) => {
    const mode = resolveAdminFeedbackMode();
    res.json(preflightPayload(mode !== "disabled", mode));
  });

  app.get("/admin/feedback/pending", async (req, res) => {
    if (!enforceTier(req, res)) return;
    const mode = resolveAdminFeedbackMode();
    if (mode === "disabled") { sendUnconfigured(res); return; }
    if (mode === "local") { await listPendingLocal(req, res); return; }
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
    const mode = resolveAdminFeedbackMode();
    if (mode === "disabled") { sendUnconfigured(res); return; }
    const sha = decodeURIComponent(req.params.sha);
    if (mode === "local") { await findByCommitLocal(req, res, sha); return; }
    await proxyRequest({
      req,
      res,
      method: "GET",
      path: `/feedback/by_commit/${encodeURIComponent(sha)}`,
    });
  });

  app.post("/admin/feedback/:id/status", async (req, res) => {
    if (!enforceTier(req, res)) return;
    const mode = resolveAdminFeedbackMode();
    if (mode === "disabled") { sendUnconfigured(res); return; }
    const id = decodeURIComponent(req.params.id);
    if (mode === "local") { await updateStatusLocal(req, res, id); return; }
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
  enforceTier,
  sendUnconfigured,
  resolveAdminFeedbackMode,
  listPendingLocal,
  findByCommitLocal,
  updateStatusLocal,
};
