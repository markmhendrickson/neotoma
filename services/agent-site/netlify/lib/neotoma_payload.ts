/**
 * Pure mapper that projects a Netlify-side `StoredFeedback` onto the
 * `neotoma_feedback` entity payload shape expected by Neotoma's `/store`
 * endpoint. Kept side-effect-free so it can be unit-tested and reused by
 * `submit.ts`, `update_status.ts`, and the mirror retry worker.
 *
 * Deliberately NOT included in the entity payload:
 *   - The raw `access_token` (never persisted on the Netlify side anyway).
 *   - Internal mirror bookkeeping (`mirrored_*`, `mirror_attempts`).
 *   - Any bearer / service-token / webhook secret values.
 *
 * Relationships are emitted separately in `relationships_from` so the
 * caller can spread them into the outer `store_structured` call (entity
 * first, then REFERS_TO edges to any `related_entity_ids`).
 */

import type { EnvironmentBlock, StoredFeedback } from "./types.js";

export interface NeotomaFeedbackEntityPayload {
  entity_type: "neotoma_feedback";
  canonical_name: string;
  [key: string]: unknown;
}

export interface StoredFeedbackMirrorPayload {
  entity: NeotomaFeedbackEntityPayload;
  /**
   * REFERS_TO edge targets this feedback references. The forwarder resolves
   * these ids inside the same `store_structured` call using index-based
   * relationships when possible, otherwise via follow-up
   * `create_relationship` requests.
   */
  related_entity_ids: string[];
  /**
   * Idempotency key for the `store_structured` call. Stable across retries
   * for the same feedback_id so mirror attempts never create duplicate
   * observations in Neotoma.
   */
  idempotency_key: string;
  /** Human-readable canonical label for the entity. */
  canonical_name: string;
}

function compactEnvironment(env?: EnvironmentBlock): Record<string, unknown> {
  if (!env) return {};
  const keys: Array<keyof EnvironmentBlock> = [
    "neotoma_version",
    "mcp_server_version",
    "client_name",
    "client_version",
    "os",
    "os_version",
    "node_version",
    "runtime_locale",
    "tool_name",
    "invocation_shape",
    "error_type",
    "error_message",
    "retry_behavior",
    "error_class",
    "hit_count",
    "consent_mode_at_submit",
    "prior_similar_errors",
    "fallback_outcome",
  ];
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = env[k];
    if (v !== undefined && v !== null && v !== "") out[String(k)] = v;
  }
  return out;
}

function truncateForCanonicalName(title: string, max = 64): string {
  const normalized = title.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return normalized.slice(0, max - 1) + "\u2026";
}

/**
 * Project a `StoredFeedback` onto the entity payload for
 * `store_structured`. Pure: no IO, no clock reads beyond the record's own
 * timestamps.
 */
export function storedFeedbackToEntity(
  record: StoredFeedback,
  options?: { dataSource?: string; sourceFile?: string | null },
): StoredFeedbackMirrorPayload {
  const environmentFields = compactEnvironment(
    record.metadata?.environment as EnvironmentBlock | undefined,
  );

  const relatedEntityIds = Array.isArray(record.resolution_links?.related_entity_ids)
    ? record.resolution_links.related_entity_ids.filter(
        (x): x is string => typeof x === "string" && x.length > 0,
      )
    : [];

  const submittedDate = record.submitted_at.slice(0, 10);
  const dataSource =
    options?.dataSource ??
    `agent-site netlify submit ${submittedDate}`;
  const sourceFile = options?.sourceFile ?? null;

  const canonicalName = `${record.id} ${truncateForCanonicalName(record.title)}`.trim();

  const entity: NeotomaFeedbackEntityPayload = {
    entity_type: "neotoma_feedback",
    canonical_name: canonicalName,

    feedback_id: record.id,
    access_token_hash: record.access_token_hash,
    submitter_id: record.submitter_id,

    title: record.title,
    body: record.body,
    kind: record.kind,
    redaction_applied: record.redaction_applied,
    redaction_backstop_hits: record.redaction_backstop_hits ?? [],

    ...environmentFields,

    status: record.status,
    status_updated_at: record.status_updated_at,
    submitted_at: record.submitted_at,
    last_activity_at: record.last_activity_at,
    next_check_suggested_at: record.next_check_suggested_at,

    classification: record.classification,
    triage_notes: record.triage_notes,

    github_issue_urls: record.resolution_links?.github_issue_urls ?? [],
    pull_request_urls: record.resolution_links?.pull_request_urls ?? [],
    commit_shas: record.resolution_links?.commit_shas ?? [],
    duplicate_of_feedback_id: record.resolution_links?.duplicate_of_feedback_id ?? null,
    notes_markdown: record.resolution_links?.notes_markdown ?? "",
    verifications: record.resolution_links?.verifications ?? [],

    upgrade_guidance: record.upgrade_guidance ?? null,

    verification_count_by_outcome: record.verification_count_by_outcome ?? null,
    resolution_confidence: record.resolution_confidence ?? null,
    first_verification_at: record.first_verification_at ?? null,
    last_verification_at: record.last_verification_at ?? null,
    regression_candidate: record.regression_candidate ?? false,
    regression_detected_at: record.regression_detected_at ?? null,
    regression_count: record.regression_count ?? 0,
    superseded_by_version: record.superseded_by_version ?? null,
    prefer_human_draft: record.prefer_human_draft === true,

    data_source: dataSource,
    source_file: sourceFile,
    original_submission_payload: {
      kind: record.kind,
      title: record.title,
      body: record.body,
      metadata: record.metadata ?? {},
      submitted_at: record.submitted_at,
      redaction_applied: record.redaction_applied,
    },
  };

  if (record.parent_feedback_id) {
    entity.parent_feedback_id = record.parent_feedback_id;
    entity.verification_outcome = record.verification_outcome ?? null;
    entity.verified_at_version = record.verified_at_version ?? null;
  }

  return {
    entity,
    related_entity_ids: relatedEntityIds,
    idempotency_key: `neotoma_feedback-${record.id}`,
    canonical_name: canonicalName,
  };
}
