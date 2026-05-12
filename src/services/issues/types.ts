/**
 * Type definitions for the Issues subsystem.
 *
 * Issues are the collaborative interface between Neotoma users (reporters)
 * and maintainers, backed by GitHub Issues as the collaborative transport
 * and Neotoma conversations as the relational data model.
 */

export type IssueVisibility = "public" | "private";
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
  /** Optional reporter provenance (Phase 4 daemon / CI). */
  reporter_git_sha?: string;
  reporter_git_ref?: string;
  reporter_channel?: string;
  reporter_app_version?: string;
  reporter_ci_run_id?: string;
  reporter_patch_source_id?: string;
}

export interface IssueMessageParams {
  /** Neotoma `issue` entity id (MCP and HTTP require this). */
  entity_id?: string;
  /** GitHub issue number in the configured repo; internal/tests only — not exposed on MCP. */
  issue_number?: number;
  body: string;
  /**
   * Optional guest token for operator read-through / remote append when the local `issue`
   * row mirrors a remote instance. When omitted, `guest_access_token` on the issue snapshot is used.
   */
  guest_access_token?: string;
  /**
   * Optional reporter environment for this thread message. Soft requirement
   * (server emits a warning when both `reporter_git_sha` and
   * `reporter_app_version` are missing); the underlying
   * `conversation_message` row carries them so subsequent debugging steps
   * stay correlated with the build the reporter is testing against. See
   * docs/subsystems/issues.md and docs/developer/mcp/instructions.md.
   */
  reporter_git_sha?: string;
  reporter_git_ref?: string;
  reporter_channel?: string;
  reporter_app_version?: string;
}

export interface IssueSyncParams {
  since?: string;
  state?: "open" | "closed" | "all";
  labels?: string[];
}

export interface IssueStatusParams {
  /** Neotoma `issue` entity id (MCP requires this). */
  entity_id?: string;
  /** GitHub issue number in the configured repo; internal/tests only — not exposed on MCP. */
  issue_number?: number;
  skip_sync?: boolean;
  /**
   * Optional guest token for operator read-through when the local row mirrors a remote issue.
   * When omitted, `guest_access_token` on the issue snapshot is used.
   */
  guest_access_token?: string;
}

export interface IssuesConfig {
  github_auth: GitHubAuthMethod;
  repo: string;
  reporting_mode: IssueReportingMode;
  sync_staleness_ms: number;
  configured_at: string | null;
  target_url: string | null;
  /** Optional author label for private/local issues when GitHub user is unavailable. */
  author_alias?: string | null;
}

/** Canonical issue submission URL when env and stored `issues.target_url` are unset or blank. */
export const DEFAULT_ISSUES_TARGET_URL = "https://neotoma.markmhendrickson.com";

export const DEFAULT_ISSUES_CONFIG: IssuesConfig = {
  github_auth: "gh_cli",
  repo: "markmhendrickson/neotoma",
  /** Default: require explicit user approval before each `submit_issue` unless the operator opts into `proactive`. */
  reporting_mode: "consent",
  sync_staleness_ms: 300_000,
  configured_at: null,
  target_url: DEFAULT_ISSUES_TARGET_URL,
  author_alias: null,
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
  github_number: number | null;
  github_url: string;
  repo: string;
  visibility: IssueVisibility;
  author: string;
  created_at: string;
  closed_at: string | null;
  last_synced_at: string;
  sync_pending: boolean;
}
