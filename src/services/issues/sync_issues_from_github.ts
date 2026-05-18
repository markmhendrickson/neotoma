/**
 * GitHub → Neotoma issues sync (`syncIssuesFromGitHub`, `syncIssueIfStale`).
 *
 * Pulls GitHub issues and comments into local Neotoma entities:
 *   - issue entity (per GitHub issue)
 *   - conversation entity (one per issue, linked via REFERS_TO)
 *   - conversation_message entities (one per comment, PART_OF conversation);
 *     sender_kind is `user` here (GitHub mirror). MCP/CLI issue tooling uses `agent`.
 *
 * Identity: `issue` via github_number + repo; `conversation` thread via
 * `conversation_id` from {@link githubIssueThreadConversationId}; `conversation_message` via
 * schema `turn_key` (see `github_thread_keys.ts` — not `github_comment_id` alone).
 */

import type {
  Operations,
  StoreEntityInput,
  StoreInput,
  StoreResult,
} from "../../core/operations.js";
import { runWithExternalActor } from "../request_context.js";
import { loadIssuesConfig } from "./config.js";
import {
  buildExternalActorFromGithubComment,
  buildExternalActorFromGithubIssue,
} from "./external_actor_builder.js";
import * as github from "./github_client.js";
import { githubIssueThreadConversationId } from "./github_issue_thread.js";
import { githubIssueBodyTurnKey, githubIssueCommentTurnKey } from "./github_thread_keys.js";
import type { GitHubIssue, GitHubComment, IssueSyncParams } from "./types.js";

export interface SyncResult {
  issues_synced: number;
  messages_synced: number;
  errors: string[];
}

/**
 * Pull issues from GitHub into local Neotoma entities.
 * Idempotent: uses github_number + repo as identity for issues,
 * and github_comment_id for messages.
 */
export async function syncIssuesFromGitHub(
  ops: Operations,
  params?: IssueSyncParams
): Promise<SyncResult> {
  const config = await loadIssuesConfig();
  const result: SyncResult = { issues_synced: 0, messages_synced: 0, errors: [] };

  let issues: GitHubIssue[];
  try {
    issues = await github.listIssues({
      state: params?.state ?? "all",
      labels: params?.labels,
      since: params?.since,
      per_page: 100,
    });
  } catch (err) {
    result.errors.push(`Failed to list issues: ${(err as Error).message}`);
    return result;
  }

  for (const issue of issues) {
    try {
      await syncSingleIssue(ops, issue, config.repo);
      result.issues_synced++;

      const comments = await github.listIssueComments(issue.number);
      for (const comment of comments) {
        await syncSingleComment(ops, comment, issue, config.repo);
        result.messages_synced++;
      }
    } catch (err) {
      result.errors.push(`Issue #${issue.number}: ${(err as Error).message}`);
    }
  }

  return result;
}

/**
 * Sync a single issue and its first message (the issue body).
 */
async function syncSingleIssue(
  ops: Operations,
  issue: GitHubIssue,
  repo: string
): Promise<StoreResult> {
  const now = new Date().toISOString();
  const threadConversationId = githubIssueThreadConversationId(repo, issue.number);
  const actor = buildExternalActorFromGithubIssue(issue, { repository: repo });

  const entities: StoreInput["entities"] = [
    {
      entity_type: "issue",
      title: issue.title,
      body: issue.body ?? "",
      status: issue.state,
      labels: issue.labels.map((l) => l.name),
      github_number: issue.number,
      github_url: issue.html_url,
      repo,
      visibility: "public",
      author: issue.user?.login ?? "unknown",
      github_actor: actor ? { login: actor.login, id: actor.id, type: actor.type } : undefined,
      created_at: issue.created_at,
      closed_at: issue.closed_at,
      last_synced_at: now,
      sync_pending: false,
      data_source: `github issues api ${repo} #${issue.number} ${now.slice(0, 10)}`,
    } as StoreEntityInput,
    {
      entity_type: "conversation",
      title: `Issue #${issue.number}: ${issue.title}`,
      thread_kind: "multi_party",
      ...(threadConversationId ? { conversation_id: threadConversationId } : {}),
    } as StoreEntityInput,
    {
      entity_type: "conversation_message",
      role: "user",
      sender_kind: "user",
      content: issue.body ?? "",
      author: issue.user?.login ?? "unknown",
      github_actor: actor ? { login: actor.login, id: actor.id, type: actor.type } : undefined,
      github_comment_id: `issue-body-${issue.number}`,
      turn_key: githubIssueBodyTurnKey(repo, issue.number),
      created_at: issue.created_at,
    } as StoreEntityInput,
  ];

  const relationships: StoreInput["relationships"] = [
    { relationship_type: "REFERS_TO", source_index: 0, target_index: 1 },
    { relationship_type: "PART_OF", source_index: 2, target_index: 1 },
  ];

  return runWithExternalActor(actor, () =>
    ops.store({
      entities,
      relationships,
      idempotency_key: `issue-sync-${repo}-${issue.number}`,
    })
  ) as Promise<StoreResult>;
}

/**
 * Sync a single GitHub comment into the issue's shared conversation (same graph
 * as CLI `issues sync`).
 */
async function syncSingleComment(
  ops: Operations,
  comment: GitHubComment,
  issue: GitHubIssue,
  repo: string
): Promise<StoreResult> {
  const now = new Date().toISOString();
  const threadConversationId = githubIssueThreadConversationId(repo, issue.number);
  const commentActor = buildExternalActorFromGithubComment(comment, issue, { repository: repo });
  const issueActor = buildExternalActorFromGithubIssue(issue, { repository: repo });

  const entities: StoreInput["entities"] = [
    {
      entity_type: "issue",
      title: issue.title,
      body: issue.body ?? "",
      status: issue.state,
      labels: issue.labels.map((l) => l.name),
      github_number: issue.number,
      github_url: issue.html_url,
      repo,
      visibility: "public",
      author: issue.user?.login ?? "unknown",
      github_actor: issueActor
        ? { login: issueActor.login, id: issueActor.id, type: issueActor.type }
        : undefined,
      created_at: issue.created_at,
      closed_at: issue.closed_at,
      last_synced_at: now,
      sync_pending: false,
      data_source: `github issues api ${repo} #${issue.number} ${now.slice(0, 10)}`,
    } as StoreEntityInput,
    {
      entity_type: "conversation",
      title: `Issue #${issue.number}: ${issue.title}`,
      thread_kind: "multi_party",
      ...(threadConversationId ? { conversation_id: threadConversationId } : {}),
    } as StoreEntityInput,
    {
      entity_type: "conversation_message",
      role: "user",
      sender_kind: "user",
      content: comment.body,
      author: comment.user?.login ?? "unknown",
      github_actor: commentActor
        ? { login: commentActor.login, id: commentActor.id, type: commentActor.type }
        : undefined,
      github_comment_id: String(comment.id),
      turn_key: githubIssueCommentTurnKey(repo, issue.number, String(comment.id)),
      created_at: comment.created_at,
    } as StoreEntityInput,
  ];

  const relationships: StoreInput["relationships"] = [
    { relationship_type: "REFERS_TO", source_index: 0, target_index: 1 },
    { relationship_type: "PART_OF", source_index: 2, target_index: 1 },
  ];

  return runWithExternalActor(commentActor, () =>
    ops.store({
      entities,
      relationships,
      idempotency_key: `issue-comment-sync-${repo}-${issue.number}-${comment.id}`,
    })
  ) as Promise<StoreResult>;
}

/**
 * Check if sync is needed based on staleness threshold.
 */
export async function isSyncStale(lastSyncedAt: string | null): Promise<boolean> {
  if (!lastSyncedAt) return true;
  const config = await loadIssuesConfig();
  const elapsed = Date.now() - new Date(lastSyncedAt).getTime();
  return elapsed > config.sync_staleness_ms;
}

/**
 * Sync a single issue by number if it's stale.
 */
export async function syncIssueIfStale(
  ops: Operations,
  issueNumber: number,
  lastSyncedAt: string | null
): Promise<boolean> {
  const stale = await isSyncStale(lastSyncedAt);
  if (!stale) return false;

  const config = await loadIssuesConfig();
  const issue = await github.getIssue(issueNumber);
  await syncSingleIssue(ops, issue, config.repo);

  const comments = await github.listIssueComments(issueNumber);
  for (const comment of comments) {
    await syncSingleComment(ops, comment, issue, config.repo);
  }

  return true;
}
