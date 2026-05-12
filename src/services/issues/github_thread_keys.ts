import { createHash } from "node:crypto";

/**
 * Stable `turn_key` values for GitHub-backed issue thread messages.
 *
 * `conversation_message` uses schema `canonical_name_fields: ["turn_key"]`.
 * Without `turn_key`, resolution falls back to sorted-field heuristics and can
 * collapse distinct GitHub comments that share the same `author` string.
 */

function githubIssueThreadPrefix(repo: string, issueNumber: number): string {
  return `github:${repo.trim()}#${issueNumber}`;
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function localIssueId(repo: string, title: string, createdAt: string): string {
  return `local:${repo.trim()}:${shortHash(`${repo.trim()}\n${createdAt}\n${title.trim()}`)}`;
}

function localIssueThreadPrefix(repo: string, issueId: string): string {
  return `local:${repo.trim()}:${issueId.trim()}`;
}

export function githubIssueBodyTurnKey(repo: string, issueNumber: number): string {
  return `${githubIssueThreadPrefix(repo, issueNumber)}:issue-body`;
}

export function githubIssueCommentTurnKey(
  repo: string,
  issueNumber: number,
  commentId: string,
): string {
  return `${githubIssueThreadPrefix(repo, issueNumber)}:comment:${String(commentId).trim()}`;
}

export function localIssueBodyTurnKey(repo: string, issueId: string): string {
  return `${localIssueThreadPrefix(repo, issueId)}:issue-body`;
}

/** Stable `turn_key` for follow-up messages on Neotoma-local issue threads (no GitHub number). */
export function localIssueCommentTurnKey(repo: string, issueId: string, commentKey: string): string {
  return `${localIssueThreadPrefix(repo, issueId)}:comment:${String(commentKey).trim()}`;
}
