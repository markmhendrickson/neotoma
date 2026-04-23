/**
 * GET /feedback/status?token=<access_token>  (public route)
 *
 * Reads status by hashed access_token. The access_token alone is sufficient —
 * no additional Neotoma MCP auth is required. See `doc_access_token_alone_auth`
 * in the plan.
 *
 * Increments `consecutive_same_status_polls` when a submitter re-polls without
 * the status changing — the next_check_suggested_at backoff uses this counter.
 */

import type { Config } from "@netlify/functions";
import { extractAccessTokenQuery } from "../lib/auth.js";
import { hashAccessToken } from "../lib/ids.js";
import { projectStatus } from "../lib/project_status.js";
import { errorResponse, jsonResponse } from "../lib/responses.js";
import {
  lookupFeedbackIdByTokenHash,
  readFeedback,
  writeFeedback,
} from "../lib/storage.js";

export default async (req: Request): Promise<Response> => {
  if (req.method !== "GET") return errorResponse(405, "method_not_allowed", "Use GET");

  const url = new URL(req.url);
  const token = extractAccessTokenQuery(url);
  if (!token) return errorResponse(400, "missing_token", "query param `token` required");

  const tokenHash = hashAccessToken(token);
  const feedbackId = await lookupFeedbackIdByTokenHash(tokenHash);
  if (!feedbackId) return errorResponse(404, "not_found", "No feedback matches that token");

  const record = await readFeedback(feedbackId);
  if (!record) return errorResponse(404, "not_found", "Feedback record missing");

  if (record.status === "submitted" || record.status === "triaged") {
    record.consecutive_same_status_polls = (record.consecutive_same_status_polls ?? 0) + 1;
  } else {
    record.consecutive_same_status_polls = (record.consecutive_same_status_polls ?? 0) + 1;
  }
  await writeFeedback(record);

  const response = projectStatus(record);
  return jsonResponse(200, response);
};

export const config: Config = { path: "/.netlify/functions/status" };
