/**
 * Local/short-circuit feedback transport.
 *
 * `submit_feedback` writes a record to `LocalFeedbackStore` (JSON-backed under
 * the Neotoma data dir) and returns the same response shape as the HTTP path.
 * `get_feedback_status` reads the record and projects it to `StatusResponse`.
 *
 * This transport is the default when `NEOTOMA_FEEDBACK_TRANSPORT=local` or
 * when `AGENT_SITE_BASE_URL` is unset. `neotoma triage` watches this file to
 * pick up pending entries and write triage/classification results back.
 */

import { randomBytes } from "node:crypto";
import { deriveNextCheckAt } from "./feedback/next_check.js";
import {
  LocalFeedbackStore,
  generateFeedbackId,
  hashToken,
  type LocalFeedbackRecord,
} from "./feedback/local_store.js";
import { mirrorLocalFeedbackToEntity } from "./feedback/mirror_local_to_entity.js";
import { generateRedactionSalt, scanAndRedact } from "./feedback/redaction.js";
import { buildVerificationRequest } from "./feedback/verification_request.js";
import type {
  FeedbackStatusResponse,
  FeedbackTransport,
  SubmitFeedbackArgs,
  SubmitFeedbackResponse,
} from "./feedback/types.js";

function generateAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

function projectStatus(record: LocalFeedbackRecord, now: Date = new Date()): FeedbackStatusResponse {
  const nextCheck = deriveNextCheckAt(record.status, record.consecutive_same_status_polls, now);
  return {
    feedback_id: record.id,
    status: record.status,
    status_updated_at: record.status_updated_at,
    classification: record.classification,
    resolution_links: record.resolution_links,
    upgrade_guidance: record.upgrade_guidance,
    verification_request: buildVerificationRequest({
      status: record.status,
      status_updated_at: record.status_updated_at,
      id: record.id,
      upgrade_guidance: record.upgrade_guidance,
    }),
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

export class LocalFeedbackTransport implements FeedbackTransport {
  constructor(private readonly storePath?: string) {}

  private store(): LocalFeedbackStore {
    return new LocalFeedbackStore(this.storePath);
  }

  async submit(args: SubmitFeedbackArgs, submitterId: string): Promise<SubmitFeedbackResponse> {
    const env = (args.metadata as any)?.environment ?? {};
    if (!env.neotoma_version || !env.client_name || !env.os) {
      throw new Error(
        "submit_feedback: metadata.environment must include neotoma_version, client_name, and os",
      );
    }

    if (args.kind === "fix_verification") {
      if (!args.parent_feedback_id) throw new Error("kind=fix_verification requires parent_feedback_id");
      if (!args.verification_outcome) throw new Error("kind=fix_verification requires verification_outcome");
      if (!args.verified_at_version) throw new Error("kind=fix_verification requires verified_at_version");
      const parent = await this.store().getById(args.parent_feedback_id);
      if (!parent) throw new Error("parent_feedback_id not found");
    }

    const salt = generateRedactionSalt();
    const errMsg = typeof env.error_message === "string" ? env.error_message : undefined;
    const redaction = scanAndRedact({ title: args.title, body: args.body, error_message: errMsg, salt });

    const now = new Date();
    const id = generateFeedbackId();
    const accessToken = generateAccessToken();
    const tokenHash = hashToken(accessToken);

    const metadata = { ...(args.metadata ?? {}) };
    if ((metadata as any).environment && redaction.error_message != null) {
      (metadata as any).environment = {
        ...(metadata as any).environment,
        error_message: redaction.error_message,
      };
    }

    const record: LocalFeedbackRecord = {
      id,
      submitter_id: submitterId,
      kind: args.kind,
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
      access_token_hash: tokenHash,
      redaction_applied: redaction.applied,
      redaction_backstop_hits: redaction.hits,
      consecutive_same_status_polls: 0,
      status_push: args.status_push,
      parent_feedback_id: args.parent_feedback_id,
      verification_outcome: args.verification_outcome,
      verified_at_version: args.verified_at_version,
    };

    await this.store().upsert(record, tokenHash);

    await mirrorLocalFeedbackToEntity(record, {
      dataSource: `neotoma local submit ${record.submitted_at.slice(0, 10)}`,
    });

    return {
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
  }

  async status(accessToken: string): Promise<FeedbackStatusResponse> {
    const record = await this.store().getByTokenHash(hashToken(accessToken));
    if (!record) {
      throw new Error("feedback not found for access_token");
    }
    record.consecutive_same_status_polls = (record.consecutive_same_status_polls ?? 0) + 1;
    await this.store().upsert(record);
    return projectStatus(record);
  }
}
