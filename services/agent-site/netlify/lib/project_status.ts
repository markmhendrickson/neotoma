/**
 * Project a `StoredFeedback` record into the public `StatusResponse` shape.
 *
 * The same projection logic is mirrored in
 * `src/services/feedback_transport_local.ts` so the local and HTTP transports
 * produce structurally-identical responses.
 */

import { deriveNextCheckAt } from "./next_check.js";
import type {
  StatusResponse,
  StoredFeedback,
  VerificationRequest,
} from "./types.js";

const VERIFY_WINDOW_DAYS = 7;

export function buildVerificationRequest(
  record: StoredFeedback,
): VerificationRequest | null {
  const guidance = record.upgrade_guidance;
  if (record.status !== "resolved") return null;
  if (!guidance || !guidance.min_version_including_fix) return null;

  const resolvedAt = new Date(record.status_updated_at);
  const deadline = new Date(resolvedAt.getTime() + VERIFY_WINDOW_DAYS * 24 * 3600 * 1000);

  const steps =
    guidance.verification_steps && guidance.verification_steps.length > 0
      ? guidance.verification_steps
      : [
          "Upgrade to `" + guidance.min_version_including_fix + "` using `install_commands`.",
          "Re-run the invocation from the original report.",
          "Confirm the fix resolves the reported friction.",
        ];

  return {
    requested: true,
    verify_by: deadline.toISOString(),
    verification_steps: steps,
    expected_outcome:
      "The originally failing invocation succeeds on the upgraded version without the reported friction.",
    report_via: "submit_feedback",
    report_kind: "fix_verification",
    parent_feedback_id: record.id,
    deadline_behavior: "silence_treated_as_unable_to_verify",
  };
}

export function projectStatus(record: StoredFeedback, now: Date = new Date()): StatusResponse {
  const nextCheck = deriveNextCheckAt(
    record.status,
    record.consecutive_same_status_polls,
    now,
  );
  return {
    feedback_id: record.id,
    status: record.status,
    status_updated_at: record.status_updated_at,
    classification: record.classification,
    resolution_links: record.resolution_links,
    upgrade_guidance: record.upgrade_guidance,
    verification_request: buildVerificationRequest(record),
    triage_notes: record.triage_notes,
    last_activity_at: record.last_activity_at,
    next_check_suggested_at: nextCheck,
    resolution_confidence: record.resolution_confidence,
    verification_count_by_outcome: record.verification_count_by_outcome,
    first_verification_at: record.first_verification_at ?? null,
    last_verification_at: record.last_verification_at ?? null,
    regression_candidate: record.regression_candidate,
    regression_detected_at: record.regression_detected_at ?? null,
    regression_count: record.regression_count,
    superseded_by_version: record.superseded_by_version ?? null,
  };
}
