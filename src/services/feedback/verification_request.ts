/**
 * Shared verification-request projection helper. Mirrors
 * `services/agent-site/netlify/lib/project_status.ts` so local and HTTP
 * transports produce identical `verification_request` blocks.
 */

import type { LocalFeedbackRecord } from "./local_store.js";
import type { UpgradeGuidance, VerificationRequest } from "./types.js";

const VERIFY_WINDOW_DAYS = 7;

export function buildVerificationRequest(
  record: { status: LocalFeedbackRecord["status"]; status_updated_at: string; id: string; upgrade_guidance: UpgradeGuidance | null },
): VerificationRequest | null {
  if (record.status !== "resolved") return null;
  const guidance = record.upgrade_guidance;
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
