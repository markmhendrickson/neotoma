/**
 * POST /feedback/:id/mirror_replay  (admin-only)
 *
 * Operator escape hatch for the Neotoma forwarder: force an immediate
 * mirror attempt for a specific feedback record, bypassing the
 * `mirror_pending` queue's backoff. Used by
 * `neotoma triage --mirror-replay <feedback_id>` when a previously-
 * exhausted record needs to be pushed through after the tunnel comes
 * back.
 *
 * On success stamps `mirrored_to_neotoma=true` + `neotoma_entity_id` on
 * the Blobs record. On failure returns 502 with the structured forward
 * reason so the caller can surface it.
 */

import type { Config } from "@netlify/functions";
import { requireAdminBearer } from "../lib/auth.js";
import { forwardToNeotoma, loadForwarderConfigFromEnv } from "../lib/forwarder.js";
import { errorResponse, jsonResponse } from "../lib/responses.js";
import { readFeedback, writeFeedback } from "../lib/storage.js";

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return errorResponse(405, "method_not_allowed", "Use POST");
  const auth = requireAdminBearer(req);
  if (!auth.ok) return errorResponse(auth.status, "unauthorized", auth.message);

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return errorResponse(400, "missing_id", "query param `id` required");

  const record = await readFeedback(id);
  if (!record) return errorResponse(404, "not_found", "No such feedback record");

  const mode = loadForwarderConfigFromEnv().mode;
  if (mode === "off") {
    return errorResponse(
      409,
      "forwarder_disabled",
      "NEOTOMA_FEEDBACK_FORWARD_MODE=off; enable the forwarder before replay",
    );
  }

  const op: "create" | "update" = record.neotoma_entity_id ? "update" : "create";
  record.mirror_attempts = (record.mirror_attempts ?? 0) + 1;
  const forward = await forwardToNeotoma(record, op);

  if (forward.mirrored && forward.entity_id) {
    record.mirrored_to_neotoma = true;
    record.mirrored_at = new Date().toISOString();
    record.neotoma_entity_id = forward.entity_id;
    record.mirror_last_error = undefined;
    await writeFeedback(record);
    return jsonResponse(200, {
      ok: true,
      feedback_id: record.id,
      neotoma_entity_id: record.neotoma_entity_id,
      mirrored_at: record.mirrored_at,
    });
  }

  record.mirrored_to_neotoma = false;
  record.mirror_last_error = forward.reason ?? "unknown";
  await writeFeedback(record);
  return errorResponse(
    502,
    "mirror_failed",
    `Forward returned ${forward.reason ?? "unknown"}`,
  );
};

export const config: Config = { path: "/.netlify/functions/mirror_replay" };
