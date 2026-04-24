/**
 * Types shared by the sandbox-report local + HTTP transports. Kept parallel
 * to `src/services/feedback/types.ts` so the reporting pipeline for the
 * public sandbox is structurally identical to the product-feedback pipeline.
 *
 * Sandbox reports are forwarded off the public Fly host (which is wiped
 * weekly) into the central Netlify-backed durable store so triage state
 * survives resets.
 */

export type SandboxReportReason =
  | "abuse"
  | "pii_leak"
  | "illegal_content"
  | "spam"
  | "bug"
  | "other";

export type SandboxReportStatus =
  | "received"
  | "reviewing"
  | "resolved"
  | "rejected";

export interface SubmitSandboxReportArgs {
  reason: SandboxReportReason;
  description: string;
  entity_id?: string;
  url?: string;
  reporter_contact?: string;
  metadata?: Record<string, unknown>;
}

export interface SandboxReportSubmitResponse {
  report_id: string;
  access_token: string;
  status: SandboxReportStatus;
  submitted_at: string;
  next_check_suggested_at: string | null;
  redaction_preview?: {
    applied: boolean;
    redacted_description: string;
    fields_redacted_count: number;
    backstop_hits: string[];
  };
}

export interface SandboxReportStatusResponse {
  report_id: string;
  status: SandboxReportStatus;
  submitted_at: string;
  status_updated_at: string;
  resolution_notes: string | null;
  next_check_suggested_at: string | null;
}

export interface SandboxReportTransport {
  submit(
    args: SubmitSandboxReportArgs,
    submitterIp: string,
  ): Promise<SandboxReportSubmitResponse>;
  status(accessToken: string): Promise<SandboxReportStatusResponse>;
}

export type SandboxReportTransportKind = "local" | "http";

export function resolveSandboxReportTransportKind(
  env: Record<string, string | undefined> = process.env,
): SandboxReportTransportKind {
  const explicit = (env.NEOTOMA_SANDBOX_REPORT_TRANSPORT ?? "").toLowerCase();
  if (explicit === "local" || explicit === "http") return explicit;
  if (env.NEOTOMA_SANDBOX_REPORT_FORWARD_URL) return "http";
  return "local";
}
