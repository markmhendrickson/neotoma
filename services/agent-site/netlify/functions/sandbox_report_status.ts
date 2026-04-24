/**
 * GET /sandbox/report/status?access_token=... (or ?token= for manual checks)
 *
 * Public endpoint (bearer from sandbox forwarder) that resolves an abuse-report
 * access token to its current status. Mirrors /feedback/status but scoped to
 * the sandbox_reports blobs store.
 */

import type { Config } from "@netlify/functions";
import { hashAccessToken } from "../lib/ids.js";
import { errorResponse, jsonResponse } from "../lib/responses.js";
import { lookupReportIdByTokenHash, readReport } from "../lib/sandbox_storage.js";

function readBearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  if (!h.toLowerCase().startsWith("bearer ")) return null;
  return h.slice(7).trim();
}

function requireSandboxBearer(req: Request) {
  const expected = process.env.AGENT_SITE_SANDBOX_BEARER;
  if (!expected) {
    return { ok: false, status: 500, message: "AGENT_SITE_SANDBOX_BEARER not configured" };
  }
  const provided = readBearer(req);
  if (!provided || provided !== expected) {
    return { ok: false, status: 401, message: "Missing or invalid bearer token" };
  }
  return { ok: true } as const;
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== "GET") return errorResponse(405, "method_not_allowed", "Use GET");
  const auth = requireSandboxBearer(req);
  if (auth.ok !== true) return errorResponse(auth.status, "unauthorized", auth.message);

  const url = new URL(req.url);
  const token =
    url.searchParams.get("access_token")?.trim() ||
    url.searchParams.get("token")?.trim();
  if (!token) {
    return errorResponse(
      400,
      "bad_request",
      "access_token or token query param required",
    );
  }

  const tokenHash = hashAccessToken(token);
  const id = await lookupReportIdByTokenHash(tokenHash);
  if (!id) return errorResponse(404, "not_found", "Unknown access token");
  const record = await readReport(id);
  if (!record) return errorResponse(404, "not_found", "Report not found");

  return jsonResponse({
    report_id: record.id,
    status: record.status,
    submitted_at: record.submitted_at,
    status_updated_at: record.status_updated_at,
    resolution_notes: record.resolution_notes,
    next_check_suggested_at: new Date(
      new Date(record.status_updated_at).getTime() + 24 * 3600 * 1000,
    ).toISOString(),
  });
};

export const config: Config = {
  path: "/sandbox/report/status",
};
