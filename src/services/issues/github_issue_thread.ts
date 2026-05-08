/**
 * Stable identity for Neotoma `conversation` rows that mirror a GitHub issue thread.
 *
 * The `conversation` schema uses `conversation_id` in `canonical_name_fields`;
 * title must remain display-only so submit / sync / CLI paths cannot fork threads
 * when GitHub titles drift or writers use different title templates.
 */

/**
 * Returns a stable `conversation.conversation_id` for `owner/repo` + GitHub issue number.
 * Omit when there is no positive GitHub number (local-only pending create).
 */
export function githubIssueThreadConversationId(
  repo: string,
  githubIssueNumber: number,
): string | undefined {
  const r = repo.trim();
  if (!r || !Number.isFinite(githubIssueNumber) || githubIssueNumber <= 0) {
    return undefined;
  }
  return `github_issue_thread:${r}#${githubIssueNumber}`;
}

export function localIssueThreadConversationId(
  repo: string,
  localIssueId: string,
): string | undefined {
  const r = repo.trim();
  const id = localIssueId.trim();
  if (!r || !id) return undefined;
  return `local_issue_thread:${r}:${id}`;
}
