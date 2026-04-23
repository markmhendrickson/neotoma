/**
 * POST /feedback/:id/status  (admin-only)
 *
 * The single writer of feedback status. Owns:
 *   - Status transitions + classification write-through.
 *   - upgrade_guidance shape validation.
 *   - last_activity_at / triage_notes projection.
 *   - Commit-index reverse lookup maintenance.
 *   - Webhook fan-out when upgrade_guidance.min_version_including_fix transitions null -> assigned.
 *   - verification_failed routing (reopen parent vs spawn child) for items
 *     submitted with kind=fix_verification.
 *   - Tombstone ("removed") semantics — keeps the row, nulls PII, caps TTL.
 */

import type { Config } from "@netlify/functions";
import { requireAdminBearer } from "../lib/auth.js";
import { forwardToNeotoma, loadForwarderConfigFromEnv } from "../lib/forwarder.js";
import { deriveNextCheckAt, isTerminalStatus } from "../lib/next_check.js";
import { errorResponse, jsonResponse } from "../lib/responses.js";
import {
  addCommitIndex,
  addToPending,
  enqueueMirror,
  enqueueWebhook,
  readFeedback,
  removeFromPending,
  writeFeedback,
} from "../lib/storage.js";
import type {
  AdminStatusUpdate,
  FeedbackStatus,
  StoredFeedback,
  UpgradeGuidance,
  VerificationCountsByOutcome,
  VerificationOutcome,
} from "../lib/types.js";
import { decideVerificationRouting } from "../lib/verification.js";

const VALID_STATUSES: FeedbackStatus[] = [
  "submitted",
  "triaged",
  "planned",
  "in_progress",
  "resolved",
  "duplicate",
  "wontfix",
  "wait_for_next_release",
  "removed",
];

function validateGuidance(g: UpgradeGuidance | null | undefined): string | null {
  if (g == null) return null;
  if (!g.install_commands || typeof g.install_commands !== "object") {
    return "upgrade_guidance.install_commands is required when guidance block is present";
  }
  if (!g.action_required) {
    return "upgrade_guidance.action_required is required when guidance block is present";
  }
  return null;
}

function emptyCounts(): VerificationCountsByOutcome {
  return {
    verified_working: 0,
    verified_working_with_caveat: 0,
    unable_to_verify: 0,
    verification_failed: 0,
  };
}

function recomputeCounts(
  parent: StoredFeedback,
  childOutcome: VerificationOutcome,
  childTs: string,
): void {
  const counts = parent.verification_count_by_outcome ?? emptyCounts();
  counts[childOutcome] += 1;
  parent.verification_count_by_outcome = counts;
  if (!parent.first_verification_at) parent.first_verification_at = childTs;
  parent.last_verification_at = childTs;

  const successful = counts.verified_working;
  const failed = counts.verification_failed;
  if (failed > 0) {
    parent.resolution_confidence = "contested";
  } else if (successful >= 2) {
    parent.resolution_confidence = "attested";
  } else if (successful === 1) {
    parent.resolution_confidence = "single_attestation";
  } else {
    parent.resolution_confidence = "unattested";
  }
}

async function fanOutWebhook(feedbackId: string, now: Date): Promise<void> {
  await enqueueWebhook({
    feedback_id: feedbackId,
    attempts: 0,
    next_try_at: now.toISOString(),
    enqueued_at: now.toISOString(),
  });
}

function updateStatusTransition(
  record: StoredFeedback,
  newStatus: FeedbackStatus,
  now: Date,
): void {
  if (record.status !== newStatus) {
    record.status = newStatus;
    record.status_updated_at = now.toISOString();
    record.consecutive_same_status_polls = 0;
    record.last_activity_at = now.toISOString();
  }
  record.next_check_suggested_at = deriveNextCheckAt(
    record.status,
    record.consecutive_same_status_polls,
    now,
  );
}

function applyTombstone(record: StoredFeedback, now: Date): void {
  record.status = "removed";
  record.status_updated_at = now.toISOString();
  record.title = "[removed]";
  record.body = "[removed]";
  if (record.metadata && typeof record.metadata === "object") {
    record.metadata = { removed: true };
  }
  record.next_check_suggested_at = null;
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return errorResponse(405, "method_not_allowed", "Use POST");
  const auth = requireAdminBearer(req);
  if (!auth.ok) return errorResponse(auth.status, "unauthorized", auth.message);

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return errorResponse(400, "missing_id", "query param `id` required");

  let body: AdminStatusUpdate;
  try {
    body = (await req.json()) as AdminStatusUpdate;
  } catch {
    return errorResponse(400, "bad_request", "Body must be valid JSON");
  }

  const record = await readFeedback(id);
  if (!record) return errorResponse(404, "not_found", "No such feedback record");

  const now = new Date();
  const oldStatus = record.status;
  const oldMinVersion = record.upgrade_guidance?.min_version_including_fix ?? null;

  if (body.classification !== undefined) {
    record.classification = body.classification;
    record.last_activity_at = now.toISOString();
  }
  if (body.triage_notes !== undefined) {
    record.triage_notes = body.triage_notes;
    record.last_activity_at = now.toISOString();
  }
  if (body.resolution_links) {
    record.resolution_links = {
      ...record.resolution_links,
      ...body.resolution_links,
    };
    record.last_activity_at = now.toISOString();
    for (const sha of record.resolution_links.commit_shas ?? []) {
      await addCommitIndex(sha, record.id);
    }
  }
  if (body.notes_markdown !== undefined) {
    record.resolution_links = {
      ...record.resolution_links,
      notes_markdown: body.notes_markdown,
    };
    record.last_activity_at = now.toISOString();
  }

  if (body.upgrade_guidance !== undefined) {
    const err = validateGuidance(body.upgrade_guidance);
    if (err) return errorResponse(400, "bad_upgrade_guidance", err);
    record.upgrade_guidance = body.upgrade_guidance;
    record.last_activity_at = now.toISOString();
  }

  let verificationRoutingTriageNote: string | null = null;
  if (
    record.kind === "fix_verification" &&
    record.verification_outcome &&
    oldStatus === "submitted" &&
    body.status &&
    body.status !== "removed"
  ) {
    const parentId = record.parent_feedback_id;
    if (parentId) {
      const parent = await readFeedback(parentId);
      if (parent) {
        recomputeCounts(parent, record.verification_outcome, now.toISOString());
        parent.resolution_links = {
          ...parent.resolution_links,
          verifications: Array.from(
            new Set([...(parent.resolution_links.verifications ?? []), record.id]),
          ),
        };
        parent.last_activity_at = now.toISOString();

        if (record.verification_outcome === "verification_failed") {
          const decision = decideVerificationRouting(record, parent, "auto");
          verificationRoutingTriageNote = decision.triage_note;
          if (decision.route === "reopen_parent") {
            const within24h =
              parent.regression_detected_at &&
              now.getTime() - new Date(parent.regression_detected_at).getTime() < 24 * 3600 * 1000;
            if (!parent.regression_candidate && !within24h) {
              parent.regression_candidate = true;
              parent.regression_detected_at = now.toISOString();
              parent.regression_detected_by_feedback_id = record.id;
              parent.regression_count = (parent.regression_count ?? 0) + 1;
              parent.status = "in_progress";
              parent.status_updated_at = now.toISOString();
              parent.consecutive_same_status_polls = 0;
              parent.next_check_suggested_at = deriveNextCheckAt("in_progress", 0, now);
              if (parent.upgrade_guidance) {
                parent.upgrade_guidance = {
                  ...parent.upgrade_guidance,
                  action_required: "await_regression_fix",
                };
              }
              await addToPending(parent.id);
              parent.triage_notes = decision.triage_note;
            } else {
              parent.regression_count = (parent.regression_count ?? 0) + 1;
            }
          }
        }
        await writeFeedback(parent);
      }
    }
  }

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return errorResponse(400, "bad_status", `status must be one of ${VALID_STATUSES.join(", ")}`);
    }
    if (body.status === "removed") {
      applyTombstone(record, now);
      await removeFromPending(record.id);
    } else {
      updateStatusTransition(record, body.status, now);
      if (isTerminalStatus(body.status)) {
        await removeFromPending(record.id);
      } else {
        await addToPending(record.id);
      }
    }
  }

  if (verificationRoutingTriageNote && !record.triage_notes) {
    record.triage_notes = verificationRoutingTriageNote;
  }

  await writeFeedback(record);

  const newMinVersion = record.upgrade_guidance?.min_version_including_fix ?? null;
  if (oldMinVersion === null && newMinVersion !== null && record.status_push) {
    await fanOutWebhook(record.id, now);
  }

  // Propagate admin-side mutations to the Neotoma entity. If the record has
  // never been mirrored (submit-time forward failed and hasn't drained yet)
  // queue a create so the first-write wins the new entity_id; otherwise
  // queue an update-shaped task so the retry worker patches in place.
  const forwarderMode = loadForwarderConfigFromEnv().mode;
  if (forwarderMode !== "off") {
    record.mirror_attempts = (record.mirror_attempts ?? 0) + 1;
    const op: "create" | "update" = record.neotoma_entity_id ? "update" : "create";
    const forward = await forwardToNeotoma(record, op);
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
      const nowIso = new Date().toISOString();
      await enqueueMirror({
        feedback_id: record.id,
        op,
        attempts: 1,
        next_try_at: new Date(Date.now() + 60 * 1000).toISOString(),
        enqueued_at: nowIso,
        last_error: forward.reason,
      });
    }
  }

  return jsonResponse(200, { ok: true, feedback_id: record.id, status: record.status });
};

export const config: Config = { path: "/.netlify/functions/update_status" };
