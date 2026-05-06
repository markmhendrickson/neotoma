/**
 * Builders for constructing ExternalActor objects from GitHub API data.
 *
 * These are used by the issues ingest paths (submitIssue, addIssueMessage,
 * syncIssuesFromGitHub) to populate the request context with external actor
 * provenance before writes.
 */

import type { ExternalActor, ExternalActorVerifiedVia } from "../../crypto/agent_identity.js";
import type { GitHubComment, GitHubIssue } from "./types.js";

/**
 * Build an ExternalActor from a GitHub issue's `.user` field.
 * Returns null if the user field is absent (login required; id defaults to 0).
 */
export function buildExternalActorFromGithubIssue(
  issue: GitHubIssue | null | undefined,
  options?: {
    verified_via?: ExternalActorVerifiedVia;
    repository?: string;
  },
): ExternalActor | null {
  const user = issue?.user;
  if (!user?.login) return null;
  return {
    provider: "github",
    login: user.login,
    id: user.id ?? 0,
    type: normaliseGithubUserType(user.type),
    verified_via: options?.verified_via ?? "claim",
    event_id: issue?.number,
    ...(options?.repository ? { repository: options.repository } : {}),
  };
}

/**
 * Build an ExternalActor from a GitHub comment's `.user` field.
 * Returns null if the user field is absent (login required; id defaults to 0).
 */
export function buildExternalActorFromGithubComment(
  comment: GitHubComment | null | undefined,
  issue: GitHubIssue | null | undefined,
  options?: {
    verified_via?: ExternalActorVerifiedVia;
    repository?: string;
  },
): ExternalActor | null {
  const user = comment?.user;
  if (!user?.login) return null;
  return {
    provider: "github",
    login: user.login,
    id: user.id ?? 0,
    type: normaliseGithubUserType(user.type),
    verified_via: options?.verified_via ?? "claim",
    comment_id: comment?.id,
    event_id: issue?.number,
    ...(options?.repository ? { repository: options.repository } : {}),
  };
}

/**
 * Build an ExternalActor from raw fields (useful for webhook payloads
 * or when the full GitHubIssue/Comment type is not available).
 */
export function buildExternalActor(params: {
  login: string;
  id: number;
  type?: string;
  verified_via?: ExternalActorVerifiedVia;
  delivery_id?: string;
  event_type?: string;
  repository?: string;
  event_id?: number;
  comment_id?: number;
}): ExternalActor {
  return {
    provider: "github",
    login: params.login,
    id: params.id,
    type: normaliseGithubUserType(params.type),
    verified_via: params.verified_via ?? "claim",
    ...(params.delivery_id ? { delivery_id: params.delivery_id } : {}),
    ...(params.event_type ? { event_type: params.event_type } : {}),
    ...(params.repository ? { repository: params.repository } : {}),
    ...(params.event_id !== undefined ? { event_id: params.event_id } : {}),
    ...(params.comment_id !== undefined ? { comment_id: params.comment_id } : {}),
  };
}

function normaliseGithubUserType(
  type: string | undefined,
): "User" | "Bot" | "Organization" {
  if (!type) return "User";
  const lower = type.toLowerCase();
  if (lower === "bot") return "Bot";
  if (lower === "organization") return "Organization";
  return "User";
}
