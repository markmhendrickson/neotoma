/**
 * POST /feedback/submit (public route)
 *
 * Accepts feedback from the Neotoma MCP server (authenticated by
 * `AGENT_SITE_BEARER`) and persists it in Blobs. Performs server-side
 * PII redaction as a backstop, enforces a minimum `metadata.environment`
 * shape, routes `kind=fix_verification` through the verification heuristic,
 * and returns the submit response with `redaction_preview`.
 */

import type { Config } from "@netlify/functions";
import { requirePublicBearer } from "../lib/auth.js";
import { forwardToNeotoma, loadForwarderConfigFromEnv } from "../lib/forwarder.js";
import {
  generateAccessToken,
  generateFeedbackId,
  hashAccessToken,
} from "../lib/ids.js";
import { deriveNextCheckAt } from "../lib/next_check.js";
import {
  generateRedactionSalt,
  redactionModeFromEnv,
  scanAndRedact,
} from "../lib/redaction.js";
import { errorResponse, jsonResponse } from "../lib/responses.js";
import {
  addToPending,
  addToSubmitterIndex,
  countRecentBySubmitter,
  enqueueMirror,
  readFeedback,
  writeFeedback,
  writeTokenIndex,
} from "../lib/storage.js";
import type {
  FeedbackKind,
  StoredFeedback,
  SubmitRequest,
  SubmitResponse,
  VerificationOutcome,
  VerificationRoutingHint,
} from "../lib/types.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const VALID_KINDS: FeedbackKind[] = [
  "incident",
  "report",
  "primitive_ask",
  "doc_gap",
  "contract_discrepancy",
  "fix_verification",
];
const VALID_OUTCOMES: VerificationOutcome[] = [
  "verified_working",
  "verified_working_with_caveat",
  "unable_to_verify",
  "verification_failed",
];

function isUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return errorResponse(405, "method_not_allowed", "Use POST");
  const auth = requirePublicBearer(req);
  if (!auth.ok) return errorResponse(auth.status, "unauthorized", auth.message);

  let payload: SubmitRequest;
  try {
    payload = (await req.json()) as SubmitRequest;
  } catch {
    return errorResponse(400, "bad_request", "Body must be valid JSON");
  }

  if (!payload || typeof payload !== "object") {
    return errorResponse(400, "bad_request", "Body must be an object");
  }
  if (!VALID_KINDS.includes(payload.kind)) {
    return errorResponse(400, "bad_request", `kind must be one of ${VALID_KINDS.join(", ")}`);
  }
  if (!payload.title || typeof payload.title !== "string") {
    return errorResponse(400, "bad_request", "title is required");
  }
  if (!payload.body || typeof payload.body !== "string") {
    return errorResponse(400, "bad_request", "body is required");
  }

  const env = payload.metadata?.environment;
  if (!env || !env.neotoma_version || !env.client_name || !env.os) {
    return errorResponse(
      400,
      "environment_required",
      "metadata.environment must include at minimum neotoma_version, client_name, and os",
    );
  }

  const submitterId = (payload.submitter_id ?? "").toString().trim() || "anonymous";

  const hourly = await countRecentBySubmitter(submitterId, HOUR);
  if (hourly >= 20) {
    return new Response(
      JSON.stringify({
        error: "rate_limited",
        message: "Per-submitter hourly cap (20) exceeded",
      }),
      {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "900" },
      },
    );
  }
  const daily = await countRecentBySubmitter(submitterId, DAY);
  if (daily >= 100) {
    return new Response(
      JSON.stringify({
        error: "rate_limited",
        message: "Per-submitter daily cap (100) exceeded",
      }),
      {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "3600" },
      },
    );
  }

  let parent: StoredFeedback | null = null;
  let routingHint: VerificationRoutingHint = "auto";
  if (payload.kind === "fix_verification") {
    if (!payload.parent_feedback_id) {
      return errorResponse(
        400,
        "parent_required",
        "kind=fix_verification requires parent_feedback_id",
      );
    }
    if (!payload.verification_outcome || !VALID_OUTCOMES.includes(payload.verification_outcome)) {
      return errorResponse(
        400,
        "outcome_required",
        `verification_outcome must be one of ${VALID_OUTCOMES.join(", ")}`,
      );
    }
    if (!payload.verified_at_version) {
      return errorResponse(
        400,
        "verified_version_required",
        "kind=fix_verification requires verified_at_version",
      );
    }
    parent = await readFeedback(payload.parent_feedback_id);
    if (!parent) {
      return errorResponse(404, "parent_not_found", "parent_feedback_id does not exist");
    }
    if (payload.routing_hint && ["auto", "reopen_parent", "new_child"].includes(payload.routing_hint)) {
      routingHint = payload.routing_hint;
    }
  }

  if (payload.status_push) {
    if (!isUrl(payload.status_push.webhook_url)) {
      return errorResponse(400, "bad_webhook_url", "status_push.webhook_url must be https://");
    }
  }

  const salt = generateRedactionSalt();
  const errMsg =
    typeof payload.metadata?.environment?.error_message === "string"
      ? (payload.metadata!.environment!.error_message as string)
      : undefined;
  const redaction = scanAndRedact({
    title: payload.title,
    body: payload.body,
    error_message: errMsg,
    salt,
  });

  if (redactionModeFromEnv() === "reject" && redaction.applied) {
    return errorResponse(
      400,
      "redaction_required",
      "Server-side scanner detected likely PII; client must redact before resubmitting",
      { backstop_hits: redaction.hits },
    );
  }

  const now = new Date();
  const id = generateFeedbackId();
  const accessToken = generateAccessToken();
  const accessTokenHash = hashAccessToken(accessToken);

  const metadata = { ...(payload.metadata ?? {}) };
  if (metadata.environment && redaction.error_message != null) {
    metadata.environment = { ...metadata.environment, error_message: redaction.error_message };
  }

  const record: StoredFeedback = {
    id,
    submitter_id: submitterId,
    kind: payload.kind,
    title: redaction.title,
    body: redaction.body,
    metadata,
    submitted_at: now.toISOString(),
    status: "submitted",
    status_updated_at: now.toISOString(),
    classification: null,
    resolution_links: {
      github_issue_urls: [],
      pull_request_urls: [],
      commit_shas: [],
      duplicate_of_feedback_id: null,
      related_entity_ids: [],
      notes_markdown: "",
      verifications: [],
    },
    upgrade_guidance: null,
    triage_notes: null,
    last_activity_at: null,
    next_check_suggested_at: deriveNextCheckAt("submitted", 0, now),
    access_token_hash: accessTokenHash,
    prefer_human_draft: payload.prefer_human_draft === true ? true : undefined,
    redaction_applied: redaction.applied,
    redaction_backstop_hits: redaction.hits,
    consecutive_same_status_polls: 0,
    status_push: payload.status_push,
    parent_feedback_id: payload.parent_feedback_id,
    verification_outcome: payload.verification_outcome,
    verified_at_version: payload.verified_at_version,
  };

  await writeFeedback(record);
  await writeTokenIndex(accessTokenHash, id);
  await addToPending(id);
  await addToSubmitterIndex(submitterId, id);
  if (parent) {
    const parentLinks = parent.resolution_links;
    parentLinks.verifications = Array.from(
      new Set([...(parentLinks.verifications ?? []), id]),
    );
    parent.resolution_links = parentLinks;
    parent.last_activity_at = now.toISOString();
    await writeFeedback(parent);
  }
  void routingHint;

  // Best-effort mirror into Neotoma via the Cloudflare tunnel. Never blocks
  // the response path — tunnel-down / slow cases enqueue for the retry
  // worker to drain later. See docs/subsystems/feedback_neotoma_forwarder.md.
  const forwarderMode = loadForwarderConfigFromEnv().mode;
  if (forwarderMode !== "off") {
    record.mirror_attempts = (record.mirror_attempts ?? 0) + 1;
    const forward = await forwardToNeotoma(record, "create");
    if (forward.mirrored && forward.entity_id) {
      record.mirrored_to_neotoma = true;
      record.mirrored_at = new Date().toISOString();
      record.neotoma_entity_id = forward.entity_id;
      record.mirror_last_error = undefined;
      await writeFeedback(record);
    } else {
      record.mirrored_to_neotoma = false;
      record.mirror_last_error = forward.reason ?? "unknown";
      await writeFeedback(record);
      if (forwarderMode === "required") {
        return errorResponse(
          502,
          "neotoma_mirror_failed",
          `Forward to Neotoma failed (${forward.reason ?? "unknown"}); NEOTOMA_FEEDBACK_FORWARD_MODE=required blocks submit.`,
        );
      }
      const nowIso = new Date().toISOString();
      await enqueueMirror({
        feedback_id: record.id,
        op: "create",
        attempts: 1,
        next_try_at: new Date(Date.now() + 60 * 1000).toISOString(),
        enqueued_at: nowIso,
        last_error: forward.reason,
      });
    }
  }

  const response: SubmitResponse = {
    feedback_id: id,
    access_token: accessToken,
    submitted_at: record.submitted_at,
    status: record.status,
    expected_acknowledge_within_seconds: 3600,
    expected_response_within_seconds: 86400,
    next_check_suggested_at: record.next_check_suggested_at,
    status_url_hint:
      "Call get_feedback_status with this access_token. Do not share the token; it is single-purpose (read status for this feedback).",
    redaction_preview: {
      applied: redaction.applied,
      redacted_title: redaction.title,
      redacted_body: redaction.body,
      redacted_fields_count: redaction.fields_redacted,
      backstop_hits: redaction.hits,
    },
  };

  return jsonResponse(200, response);
};

export const config: Config = { path: "/.netlify/functions/submit" };
