/**
 * GET /feedback/pending  (admin-only)
 *
 * Returns full stored records for items in the pending index so the local
 * cron can classify and write status back.
 */

import type { Config } from "@netlify/functions";
import { requireAdminBearer } from "../lib/auth.js";
import { errorResponse, jsonResponse } from "../lib/responses.js";
import { listPending, readFeedback } from "../lib/storage.js";

export default async (req: Request): Promise<Response> => {
  if (req.method !== "GET") return errorResponse(405, "method_not_allowed", "Use GET");
  const auth = requireAdminBearer(req);
  if (!auth.ok) return errorResponse(auth.status, "unauthorized", auth.message);

  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get("limit") ?? "100", 10) || 100));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);

  const ids = await listPending(limit, offset);
  const records = [];
  for (const id of ids) {
    const r = await readFeedback(id);
    if (r) records.push(r);
  }
  return jsonResponse(200, { items: records, count: records.length });
};

export const config: Config = { path: "/.netlify/functions/pending" };
