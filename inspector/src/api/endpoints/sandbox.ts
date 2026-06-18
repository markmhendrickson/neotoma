import { get, post, type FetchOptions } from "../client";

export interface SandboxTerms {
  version: string;
  effective_date: string;
  content_markdown: string;
  weekly_reset_utc: string;
  abuse_report_email?: string;
}

export interface SandboxReportInput {
  reason:
    | "abuse"
    | "pii_leak"
    | "illegal_content"
    | "spam"
    | "bug"
    | "other";
  description: string;
  entity_id?: string;
  url?: string;
  reporter_contact?: string;
}

export interface SandboxReportResponse {
  report_id: string;
  access_token: string;
  status: "received" | "reviewing" | "resolved" | "rejected";
  submitted_at: string;
  next_check_suggested_at?: string;
}

export function getSandboxTerms(fetch?: FetchOptions) {
  return get<SandboxTerms>("/sandbox/terms", undefined, fetch);
}

export function submitSandboxReport(input: SandboxReportInput, fetch?: FetchOptions) {
  return post<SandboxReportResponse>("/sandbox/report", input, fetch);
}

export function getSandboxReportStatus(accessToken: string, fetch?: FetchOptions) {
  return get<SandboxReportResponse>(
    `/sandbox/report/status?access_token=${encodeURIComponent(accessToken)}`,
    undefined,
    fetch,
  );
}
