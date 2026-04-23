/**
 * Shared types for the feedback pipeline on the MCP side.
 *
 * These mirror `services/agent-site/netlify/lib/types.ts` so the local and
 * HTTP transports project to structurally-identical status responses. Keeping
 * them re-declared rather than cross-imported preserves the clean boundary
 * between the MCP server and the Netlify service.
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

export type FeedbackReportingMode = "proactive" | "consent" | "off";

export interface SubmitFeedbackArgs {
  kind: FeedbackKind;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  user_consent_captured?: boolean;
  explicit_user_request?: boolean;
  prefer_human_draft?: boolean;
  status_push?: { webhook_url: string; webhook_secret?: string };
  parent_feedback_id?: string;
  verification_outcome?: VerificationOutcome;
  verified_at_version?: string;
  routing_hint?: VerificationRoutingHint;
}

export interface GetFeedbackStatusArgs {
  access_token: string;
}

export interface RedactionPreview {
  applied: boolean;
  redacted_title: string;
  redacted_body: string;
  redacted_fields_count: number;
  backstop_hits: string[];
}

export interface SubmitFeedbackResponse {
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

export interface ResolutionLinks {
  github_issue_urls: string[];
  pull_request_urls: string[];
  commit_shas: string[];
  duplicate_of_feedback_id: string | null;
  related_entity_ids: string[];
  notes_markdown: string;
  verifications?: string[];
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
  usage_example?: string[];
  new_surfaces?: NewSurface[];
  migration_notes?: string;
  docs_url?: string | null;
  breaking_change?: boolean;
  action_required: ActionRequired;
  rollback_commands?: InstallCommands;
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

export interface FeedbackStatusResponse {
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
  resolution_confidence?: ResolutionConfidence;
  verification_count_by_outcome?: VerificationCountsByOutcome;
  first_verification_at?: string | null;
  last_verification_at?: string | null;
  regression_candidate?: boolean;
  regression_detected_at?: string | null;
  regression_count?: number;
  superseded_by_version?: string | null;
}

export interface FeedbackTransport {
  submit(
    args: SubmitFeedbackArgs,
    submitterId: string,
  ): Promise<SubmitFeedbackResponse>;
  status(accessToken: string): Promise<FeedbackStatusResponse>;
}

export type TransportKind = "local" | "http";

export function resolveTransportKind(env: Record<string, string | undefined> = process.env): TransportKind {
  const explicit = (env.NEOTOMA_FEEDBACK_TRANSPORT ?? "").toLowerCase();
  if (explicit === "local" || explicit === "http") return explicit;
  if (env.AGENT_SITE_BASE_URL) return "http";
  return "local";
}

export function autoSubmitSuppressed(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env.NEOTOMA_FEEDBACK_AUTO_SUBMIT;
  if (raw == null) return false;
  return raw !== "1" && raw.toLowerCase() !== "true";
}
