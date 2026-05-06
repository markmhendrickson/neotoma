/**
 * Type definitions for the Issues subsystem.
 *
 * Issues are the collaborative interface between Neotoma users (reporters)
 * and maintainers, backed by GitHub Issues as the collaborative transport
 * and Neotoma conversations as the relational data model.
 */

export type IssueVisibility = "public" | "private" | "advisory";
export type IssueStatus = "open" | "closed";
export type IssueReportingMode = "proactive" | "consent" | "off";
export type GitHubAuthMethod = "gh_cli" | "bot" | "token";

export interface IssueLabels {
  bug?: boolean;
  doc_gap?: boolean;
  enhancement?: boolean;
  question?: boolean;
  [key: string]: boolean | undefined;
}

export interface IssueCreateParams {
  title: string;
  body: string;
  labels?: string[];
  visibility?: IssueVisibility;
}

export interface IssueMessageParams {
  issue_number: number;
  body: string;
}

export interface IssueSyncParams {
  since?: string;
  state?: "open" | "closed" | "all";
  labels?: string[];
}

export interface IssueStatusParams {
  issue_number: number;
  skip_sync?: boolean;
}

export interface IssuesConfig {
  github_auth: GitHubAuthMethod;
  repo: string;
  reporting_mode: IssueReportingMode;
  sync_staleness_ms: number;
  configured_at: string | null;
  target_url: string | null;
}

/** Canonical issue submission URL when env and stored `issues.target_url` are unset or blank. */
export const DEFAULT_ISSUES_TARGET_URL = "https://neotoma.markmhendrickson.com";

export const DEFAULT_ISSUES_CONFIG: IssuesConfig = {
  github_auth: "gh_cli",
  repo: "markmhendrickson/neotoma",
  reporting_mode: "proactive",
  sync_staleness_ms: 300_000,
  configured_at: null,
  target_url: DEFAULT_ISSUES_TARGET_URL,
};

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  labels: Array<{ name: string }>;
  html_url: string;
  user: { login: string; id?: number; type?: string } | null;
  created_at: string;
  closed_at: string | null;
  updated_at: string;
}

export interface GitHubComment {
  id: number;
  body: string;
  user: { login: string; id?: number; type?: string } | null;
  created_at: string;
  updated_at: string;
  html_url: string;
}

export interface IssueEntity {
  entity_type: "issue";
  title: string;
  body: string;
  status: IssueStatus;
  labels: string[];
  github_number: number;
  github_url: string;
  repo: string;
  visibility: IssueVisibility;
  author: string;
  created_at: string;
  closed_at: string | null;
  last_synced_at: string;
  sync_pending: boolean;
}
