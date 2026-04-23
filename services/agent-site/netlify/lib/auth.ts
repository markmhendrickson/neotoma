/**
 * Bearer-token auth for public and admin routes.
 *
 * Public routes (submit, status) trust the single `AGENT_SITE_BEARER` shared
 * with the Neotoma MCP server — Simon never talks to agent.neotoma.io directly.
 * Admin routes (pending, update_status, by_commit) require the stronger
 * `AGENT_SITE_ADMIN_BEARER` held only by Mark's local cron.
 *
 * For the special by_commit lookup, an individual submitter's `access_token`
 * is also accepted (returns only feedback records they submitted).
 */

export interface AuthFailure {
  ok: false;
  status: number;
  message: string;
}

export interface AuthOk {
  ok: true;
}

export type AuthResult = AuthOk | AuthFailure;

function readBearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  if (!h.toLowerCase().startsWith("bearer ")) return null;
  return h.slice(7).trim();
}

export function requirePublicBearer(req: Request): AuthResult {
  const expected = process.env.AGENT_SITE_BEARER;
  if (!expected) {
    return { ok: false, status: 500, message: "AGENT_SITE_BEARER not configured" };
  }
  const provided = readBearer(req);
  if (!provided || provided !== expected) {
    return { ok: false, status: 401, message: "Missing or invalid bearer token" };
  }
  return { ok: true };
}

export function requireAdminBearer(req: Request): AuthResult {
  const expected = process.env.AGENT_SITE_ADMIN_BEARER;
  if (!expected) {
    return { ok: false, status: 500, message: "AGENT_SITE_ADMIN_BEARER not configured" };
  }
  const provided = readBearer(req);
  if (!provided || provided !== expected) {
    return { ok: false, status: 401, message: "Missing or invalid admin bearer token" };
  }
  return { ok: true };
}

export function extractAccessTokenQuery(url: URL): string | null {
  return url.searchParams.get("token");
}
