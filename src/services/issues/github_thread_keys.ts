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
