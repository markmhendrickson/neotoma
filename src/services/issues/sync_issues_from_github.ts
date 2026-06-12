/**
 * GitHub ↔ Neotoma issues sync (`syncIssuesFromGitHub`, `syncIssueIfStale`).
 *
 * Pull leg — GitHub → Neotoma:
 *   - issue entity (per GitHub issue)
 *   - conversation entity (one per issue, linked via REFERS_TO)
 *   - conversation_message entities (one per comment, PART_OF conversation);
 *     sender_kind is `user` here (GitHub mirror). MCP/CLI issue tooling uses `agent`.
 *
 * Push leg — Neotoma → GitHub (when `push` param is true, default):
 *   - Finds local issue entities with `visibility: "public"` and no `github_number`
 *     (i.e. `sync_pending: true` or never pushed).
 *   - Runs `runRedactionGuard` (scan mode) on title+body before creating on GitHub.
 *   - Writes `github_number`, `github_url`, `sync_pending: false` back via `correct`.
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
import { runRedactionGuard } from "./redaction_guard.js";
import type { GitHubIssue, GitHubComment, IssueSyncParams } from "./types.js";

export interface SyncResult {
  issues_synced: number;
  messages_synced: number;
  errors: string[];
  /** Number of local public issues successfully pushed to GitHub. */
  issues_pushed: number;
  /** Per-issue push errors (non-fatal — pull leg still runs). */
  push_errors: string[];
}

/**
 * Sync issues between Neotoma and GitHub.
 *
 * Push leg (default on): local public issues with no github_number are
 * sanitized and created on GitHub, then updated locally with the returned number/url.
 *
 * Pull leg: GitHub issues and their comments are pulled into local entities.
 *
 * Both legs are idempotent. Push failures are non-fatal: the pull leg still runs.
 */
export async function syncIssuesFromGitHub(
  ops: Operations,
  params?: IssueSyncParams
): Promise<SyncResult> {
  const config = await loadIssuesConfig();
  const result: SyncResult = {
    issues_synced: 0,
    messages_synced: 0,
    errors: [],
    issues_pushed: 0,
    push_errors: [],
  };

  // Push leg: local public issues that have never been mirrored to GitHub.
  if (params?.push !== false) {
    await pushUnsyncedIssues(ops, config.repo, result);
  }

  // Pull leg: GitHub → Neotoma.
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
 * Find local public issues with no github_number and push each to GitHub.
 * Redaction guard runs in scan mode before each create — PII is stripped, not blocked.
 * Updates the local entity with the returned github_number, github_url, sync_pending: false.
 *
 * Errors per issue are accumulated in result.push_errors and do not abort other issues.
 */
async function pushUnsyncedIssues(
  ops: Operations,
  repo: string,
  result: SyncResult
): Promise<void> {
  // Retrieve local public issues. We request a generous page and filter client-side
  // because retrieveEntities does not support compound snapshot field filters.
  let raw: unknown;
  try {
    raw = await ops.retrieveEntities({ entity_type: "issue", limit: 500, include_snapshots: true });
  } catch (err) {
    result.push_errors.push(`Failed to retrieve local issues for push: ${(err as Error).message}`);
    return;
  }

  const entities = extractEntitiesArray(raw);

  for (const entity of entities) {
    const snap = entity.snapshot as Record<string, unknown> | undefined;
    if (!snap) continue;

    // Only push public issues with no github_number assigned yet.
    if (snap["visibility"] !== "public") continue;
    const githubNumber = snap["github_number"];
    if (typeof githubNumber === "number" && githubNumber > 0) continue;
    if (typeof githubNumber === "string" && githubNumber.length > 0) continue;

    const entityId = entity.entity_id as string;
    const rawTitle = String(snap["title"] ?? "");
    const rawBody = String(snap["body"] ?? "");
    const labels = Array.isArray(snap["labels"]) ? (snap["labels"] as string[]) : [];

    // Strip PII from title and body before sending to GitHub.
    const guarded = runRedactionGuard({ title: rawTitle, body: rawBody, mode: "scan" });

    let created: GitHubIssue;
    try {
      created = await github.createIssue({
        title: guarded.title,
        body: guarded.body,
        labels,
      });
    } catch (err) {
      result.push_errors.push(
        `Push failed for entity ${entityId} ("${rawTitle}"): ${(err as Error).message}`
      );
      continue;
    }

    // Write github_number/url back and clear sync_pending.
    //
    // The `correct` tool applies ONE field per call and requires an explicit
    // `field` + `value` + unique `idempotency_key` (see CorrectEntityRequestSchema).
    // Passing a `corrections` map silently failed Zod validation, so the
    // github_number was never persisted and the next sync re-pushed the same
    // entity — creating duplicate GitHub issues on every run (#1610).
    //
    // Idempotency keys are deterministic per (entity, field, github number) so a
    // replayed sync re-applies the identical correction instead of erroring.
    const writeBacks: Array<{ field: string; value: unknown }> = [
      { field: "github_number", value: created.number },
      { field: "github_url", value: created.html_url },
      { field: "sync_pending", value: false },
      // Derive from the GitHub issue's creation timestamp (not wall-clock) so a
      // replayed sync re-applies the identical value under the same idempotency
      // key rather than tripping ERR_IDEMPOTENCY_MISMATCH.
      { field: "last_synced_at", value: created.created_at },
    ];

    for (const { field, value } of writeBacks) {
      try {
        await ops.correct({
          entity_id: entityId,
          entity_type: "issue",
          field,
          value,
          idempotency_key: `issue-push-writeback-${entityId}-${field}-gh${created.number}`,
        });
      } catch (err) {
        // Push succeeded but local update failed — not fatal, but notable.
        // Record once per failing field so the cause is visible.
        result.push_errors.push(
          `GitHub issue #${created.number} created but local ${field} write-back failed for ${entityId}: ${(err as Error).message}`
        );
        // Still count as pushed since the GitHub issue exists.
      }
    }

    result.issues_pushed++;
  }
}

/**
 * Safely extract an entities array from the opaque return value of retrieveEntities.
 */
function extractEntitiesArray(raw: unknown): Array<Record<string, unknown>> {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj)) return obj as Array<Record<string, unknown>>;
  if (Array.isArray(obj["entities"])) return obj["entities"] as Array<Record<string, unknown>>;
  return [];
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

  // Include updated_at so each distinct version of an issue gets a unique
  // idempotency_key. A static `issue-sync-${repo}-${number}` key is reused
  // verbatim on every sync, so once an issue's title/body/labels change on
  // GitHub the store fails with ERR_IDEMPOTENCY_MISMATCH (same key, different
  // content) and the issue never updates locally. Keying on updated_at keeps a
  // genuine no-op re-sync idempotent (same key → dedup) while letting changed
  // content through under a fresh key.
  return runWithExternalActor(actor, () =>
    ops.store({
      entities,
      relationships,
      idempotency_key: `issue-sync-${repo}-${issue.number}-${issue.updated_at}`,
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
