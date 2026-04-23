/**
 * GET /feedback/by_commit/:sha  (admin-only)
 *
 * Reverse lookup: given a commit SHA, return feedback_ids whose
 * resolution_links.commit_shas include it. Lets an agent close the loop
 * from a new commit without polling every outstanding feedback_id.
 */

import type { Config } from "@netlify/functions";
import { requireAdminBearer } from "../lib/auth.js";
import { errorResponse, jsonResponse } from "../lib/responses.js";
import { readCommitIndex } from "../lib/storage.js";

export default async (req: Request): Promise<Response> => {
  if (req.method !== "GET") return errorResponse(405, "method_not_allowed", "Use GET");
  const auth = requireAdminBearer(req);
  if (!auth.ok) return errorResponse(auth.status, "unauthorized", auth.message);

  const url = new URL(req.url);
  const sha = url.searchParams.get("sha");
  if (!sha) return errorResponse(400, "missing_sha", "query param `sha` required");

  const feedbackIds = await readCommitIndex(sha);
  return jsonResponse(200, { commit_sha: sha, feedback_ids: feedbackIds });
};

export const config: Config = { path: "/.netlify/functions/by_commit" };
