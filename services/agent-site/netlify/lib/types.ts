/**
 * Shared types for the agent.neotoma.io feedback pipeline.
 *
 * These shapes are the wire contract for both public and admin routes. They are
 * mirrored by `src/services/feedback_transport_local.ts` so the local and HTTP
 * transports project to structurally-identical responses (see
 * `tests/integration/feedback_pipeline_local_vs_http.test.ts`).
 */

export type FeedbackKind =
  | "incident"
  | "report"
  | "primitive_ask"
  | "doc_gap"
  | "contract_discrepancy"
  | "fix_verification";

export type FeedbackStatus =
  | "submitted"
  | "triaged"
  | "planned"
  | "in_progress"
  | "resolved"
  | "duplicate"
  | "wontfix"
  | "wait_for_next_release"
  | "removed";

export type VerificationOutcome =
  | "verified_working"
  | "verified_working_with_caveat"
  | "unable_to_verify"
  | "verification_failed";

export type VerificationRoutingHint = "auto" | "reopen_parent" | "new_child";

export type ActionRequired =
  | "upgrade_and_retry"
  | "upgrade_and_use_new_surface"
  | "no_action"
  | "wait_for_next_release"
  | "behavior_change_only"
  | "rollback"
  | "await_regression_fix";

export type ResolutionConfidence =
  | "attested"
  | "single_attestation"
  | "unattested"
  | "contested";

export interface EnvironmentBlock {
  neotoma_version: string;
  mcp_server_version?: string;
  client_name: string;
  client_version?: string;
  os: string;
  os_version?: string;
  node_version?: string;
  runtime_locale?: string;
  tool_name?: string;
  invocation_shape?: string[];
  error_type?: string;
  error_message?: string;
  retry_behavior?: string;
  /** Best-effort — populated when the submitter can introspect it. */
  error_class?: string;
  /** Best-effort — populated when the submitter can count same-class hits in-session. */
  hit_count?: number;
  consent_mode_at_submit?: "proactive" | "consent" | "off_with_user_request";
  prior_similar_errors?: boolean;
  fallback_outcome?: string;
}

export interface StatusPushConfig {
  webhook_url: string;
  webhook_secret?: string;
}

export interface SubmitRequest {
  submitter_id?: string;
  kind: FeedbackKind;
  title: string;
  body: string;
  metadata?: {
    source_repo?: string;
    error_class?: string;
    reproduction_steps?: string;
    environment?: EnvironmentBlock;
    [k: string]: unknown;
  };
  user_consent_captured?: boolean;
  explicit_user_request?: boolean;
  prefer_human_draft?: boolean;
  status_push?: StatusPushConfig;
  /** Only required when kind === "fix_verification". */
  parent_feedback_id?: string;
  verification_outcome?: VerificationOutcome;
  verified_at_version?: string;
  routing_hint?: VerificationRoutingHint;
}

export interface NewSurface {
  kind: "cli_flag" | "mcp_tool" | "response_field" | "env_var" | "other";
  name: string;
  summary: string;
}

export interface InstallCommands {
  neotoma_cli?: string;
  neotoma_client_ts?: string;
  neotoma_client_python?: string;
  mcp_config_note?: string;
  [k: string]: string | undefined;
}

export interface UpgradeGuidance {
  target_version: string | null;
  min_version_including_fix: string | null;
  current_version_seen_at_submit?: string | null;
  release_url?: string | null;
  install_commands: InstallCommands;
  restart_required?: boolean;
  verification_steps?: string[];
  /** Array (minimal + real-workflow + per-language); see usage_example_array todo. */
  usage_example?: string[];
  new_surfaces?: NewSurface[];
  migration_notes?: string;
  docs_url?: string | null;
  breaking_change?: boolean;
  action_required: ActionRequired;
  /** Populated when action_required='rollback'. Same shape as install_commands. */
  rollback_commands?: InstallCommands;
}

export interface ResolutionLinks {
  github_issue_urls: string[];
  pull_request_urls: string[];
  commit_shas: string[];
  duplicate_of_feedback_id: string | null;
  related_entity_ids: string[];
  notes_markdown: string;
  /** Feedback ids of fix_verification submissions referencing this item. */
  verifications?: string[];
}

export interface VerificationRequest {
  requested: true;
  verify_by: string;
  verification_steps: string[];
  expected_outcome: string;
  report_via: "submit_feedback";
  report_kind: "fix_verification";
  parent_feedback_id: string;
  deadline_behavior: "silence_treated_as_unable_to_verify";
}

export interface VerificationCountsByOutcome {
  verified_working: number;
  verified_working_with_caveat: number;
  unable_to_verify: number;
  verification_failed: number;
}

export interface RedactionPreview {
  applied: boolean;
  redacted_title: string;
  redacted_body: string;
  redacted_fields_count: number;
  backstop_hits: string[];
}

export interface SubmitResponse {
  feedback_id: string;
  access_token: string;
  submitted_at: string;
  status: FeedbackStatus;
  expected_acknowledge_within_seconds: number;
  expected_response_within_seconds: number;
  next_check_suggested_at: string | null;
  status_url_hint: string;
  redaction_preview?: RedactionPreview;
}

export interface StatusResponse {
  feedback_id: string;
  status: FeedbackStatus;
  status_updated_at: string;
  classification: string | null;
  resolution_links: ResolutionLinks;
  upgrade_guidance: UpgradeGuidance | null;
  verification_request: VerificationRequest | null;
  triage_notes: string | null;
  last_activity_at: string | null;
  next_check_suggested_at: string | null;
  /** Only present when status=resolved and verification attestations exist. */
  resolution_confidence?: ResolutionConfidence;
  verification_count_by_outcome?: VerificationCountsByOutcome;
  first_verification_at?: string | null;
  last_verification_at?: string | null;
  /** Regression breadcrumbs; present when the resolved fix was reopened. */
  regression_candidate?: boolean;
  regression_detected_at?: string | null;
  regression_count?: number;
  superseded_by_version?: string | null;
}

export interface StoredFeedback {
  id: string;
  submitter_id: string;
  kind: FeedbackKind;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  submitted_at: string;
  status: FeedbackStatus;
  status_updated_at: string;
  classification: string | null;
  resolution_links: ResolutionLinks;
  upgrade_guidance: UpgradeGuidance | null;
  triage_notes: string | null;
  last_activity_at: string | null;
  next_check_suggested_at: string | null;
  access_token_hash: string;
  prefer_human_draft?: boolean;
  redaction_applied: boolean;
  redaction_backstop_hits: string[];
  consecutive_same_status_polls: number;
  /** Configured on submit, used by push_webhook_worker. */
  status_push?: StatusPushConfig;
  /** Only set when kind=fix_verification. */
  parent_feedback_id?: string;
  verification_outcome?: VerificationOutcome;
  verified_at_version?: string;
  /** Parent-side attestation aggregation (present on parent records only). */
  verification_count_by_outcome?: VerificationCountsByOutcome;
  resolution_confidence?: ResolutionConfidence;
  first_verification_at?: string | null;
  last_verification_at?: string | null;
  /** Regression tracking (present on reopened parents). */
  regression_candidate?: boolean;
  regression_detected_at?: string | null;
  regression_detected_by_feedback_id?: string | null;
  regression_count?: number;
  superseded_by_version?: string | null;

  /**
   * Netlify -> Neotoma forwarder bookkeeping.
   *
   * - `mirrored_to_neotoma`: true iff the most recent forward attempt reached
   *   the tunnel and Neotoma confirmed a store. False or undefined means the
   *   entity is NOT yet durable in Neotoma (still queued under
   *   `mirror_pending`) and the Blobs copy is the only source of truth.
   * - `neotoma_entity_id`: the `entity_id` returned by `store_structured` on
   *   the first successful forward. Used on subsequent updates so admin
   *   patches land as observations on the same entity instead of creating
   *   duplicates.
   * - `mirrored_at`: ISO timestamp of the most recent successful forward.
   * - `mirror_attempts`: total forward attempts since the item was created
   *   (submit + retry drains).
   * - `mirror_last_error`: last failure reason (HTTP status, `timeout`,
   *   `unreachable`) to aid operator triage.
   */
  mirrored_to_neotoma?: boolean;
  neotoma_entity_id?: string;
  mirrored_at?: string;
  mirror_attempts?: number;
  mirror_last_error?: string;
}

export interface AdminStatusUpdate {
  status?: FeedbackStatus;
  classification?: string | null;
  resolution_links?: Partial<ResolutionLinks>;
  upgrade_guidance?: UpgradeGuidance | null;
  triage_notes?: string | null;
  notes_markdown?: string;
}
