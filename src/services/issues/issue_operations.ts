/**
 * High-level issue operations — Neotoma-canonical.
 *
 * All issues (public and private) are submitted to the operator's Neotoma
 * instance as the canonical store. GitHub is an optional discovery/mirror
 * layer for public issues.
 *
 * Flow:
 *   1. (Public only) Push to GitHub first for discoverability
 *   2. Submit to operator's Neotoma instance (with github_url if available)
 *   3. Store local reference for status tracking
 *
 * When `issues.target_url` is non-empty, step 2 is required: if the remote
 * instance is unreachable or rejects the store, the tool throws after step 3
 * so callers see an error while local `sync_pending` data remains for retry.
 *
 * Private issues never touch GitHub.
 */

import type { Operations, StoreEntityInput, StoreInput, StoreResult } from "../../core/operations.js";
import { runWithExternalActor } from "../request_context.js";
import { loadIssuesConfig } from "./config.js";
import { buildExternalActorFromGithubComment, buildExternalActorFromGithubIssue } from "./external_actor_builder.js";
import * as github from "./github_client.js";
import { githubIssueThreadConversationId } from "./github_issue_thread.js";
import { githubIssueBodyTurnKey, githubIssueCommentTurnKey } from "./github_thread_keys.js";
import * as neotomaClient from "./neotoma_client.js";
import { syncIssueIfStale } from "./sync.js";
import type { GitHubComment, GitHubIssue, IssueCreateParams, IssueMessageParams } from "./types.js";

const GITHUB_MIRROR_GUIDANCE_MAX_CAUSE = 240;

function truncateGuidanceCause(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= GITHUB_MIRROR_GUIDANCE_MAX_CAUSE) return collapsed;
  return `${collapsed.slice(0, GITHUB_MIRROR_GUIDANCE_MAX_CAUSE - 1)}…`;
}

/**
 * Human-facing guidance when a public issue did not get a GitHub mirror.
 * Safe for MCP tool JSON (truncated cause; no raw response bodies beyond error.message).
 */
export function buildGithubMirrorGuidance(cause: unknown): string {
  let msg = "";
  if (cause instanceof Error) msg = cause.message;
  else if (cause !== undefined && cause !== null) msg = String(cause);
  const causeLine = msg ? truncateGuidanceCause(msg) : "unknown error";
  return (
    "Public issue was stored in Neotoma without a GitHub mirror. Next steps: (1) Authenticate — set NEOTOMA_ISSUES_GITHUB_TOKEN or run `gh auth login` (CLI: `neotoma issues auth`). " +
    "(2) Create the GitHub issue on the configured repo (web UI or `gh issue create`). " +
    "(3) Update the Neotoma `issue` entity's `github_number` and `github_url` (e.g. `correct` or Inspector) so `get_issue_status` and sync stay aligned. " +
    `Cause: ${causeLine}`
  );
}

export interface SubmitIssueResult {
  issue_number: number;
  github_url: string;
  entity_id: string;
  conversation_id: string;
  remote_entity_id: string;
  pushed_to_github: boolean;
  submitted_to_neotoma: boolean;
  /** When a public issue was stored without a GitHub mirror, non-null guidance for agents/operators. */
  github_mirror_guidance: string | null;
}

export interface AddMessageResult {
  github_comment_id: string | null;
  message_entity_id: string;
  pushed_to_github: boolean;
  submitted_to_neotoma: boolean;
}

export interface GetIssueStatusResult {
  issue_number: number;
  title: string;
  status: string;
  labels: string[];
  github_url: string;
  author: string;
  created_at: string;
  closed_at: string | null;
  messages: Array<{
    author: string;
    body: string;
    created_at: string;
  }>;
  synced: boolean;
}

/**
 * Create a new issue: optionally mirror to GitHub, then submit to Neotoma.
 */
export async function submitIssue(
  ops: Operations,
  params: IssueCreateParams,
): Promise<SubmitIssueResult> {
  const config = await loadIssuesConfig();
  const now = new Date().toISOString();
  const visibility = params.visibility === "advisory" ? "private" : (params.visibility ?? "public");
  const toolingLabels = github.mergeNeotomaToolingIssueLabels(params.labels);

  let githubIssue: GitHubIssue | null = null;
  let pushedToGithub = false;
  let githubUrl = "";
  let issueNumber = 0;
  let githubMirrorFailure: unknown = null;

  // Step 1: For public issues, optionally push to GitHub first for discoverability
  if (visibility === "public") {
    try {
      githubIssue = await github.createIssue({
        title: params.title,
        body: params.body,
        labels: toolingLabels,
      });
      pushedToGithub = true;
      githubUrl = githubIssue.html_url;
      issueNumber = githubIssue.number;
    } catch (err) {
      githubMirrorFailure = err;
      // GitHub push failed — continue with Neotoma-only submission
    }
  }

  const author = githubIssue?.user?.login ?? "local";

  // Step 2: Submit to operator's Neotoma instance (canonical)
  let submittedToNeotoma = false;
  let remoteEntityId = "";
  let remoteConversationId = "";
  let remoteGuestAccessToken: string | undefined;
  const issuesTargetUrl = config.target_url?.trim() ?? "";
  let remoteSubmissionAttempted = false;
  let remoteSubmissionError: Error | null = null;

  if (issuesTargetUrl) {
    remoteSubmissionAttempted = true;
    try {
      const remoteResult = await neotomaClient.submitIssueToRemote({
        title: params.title,
        body: params.body,
        labels: toolingLabels,
        visibility,
        githubUrl: githubUrl || undefined,
        githubNumber: issueNumber || undefined,
        author,
        authorGithubId: githubIssue?.user?.id,
        authorGithubType: githubIssue?.user?.type,
      });
      submittedToNeotoma = true;
      remoteEntityId = remoteResult.issue_entity_id;
      remoteConversationId = remoteResult.conversation_id;
      remoteGuestAccessToken = remoteResult.access_token?.trim() || undefined;
    } catch (err) {
      remoteSubmissionError = err instanceof Error ? err : new Error(String(err));
    }
  }

  // Step 3: Store local reference for tracking
  const threadConversationId = githubIssueThreadConversationId(config.repo, issueNumber);
  const externalActor = buildExternalActorFromGithubIssue(githubIssue, { repository: config.repo });

  const entities: StoreInput["entities"] = [
    {
      entity_type: "issue",
      title: params.title,
      body: params.body,
      status: "open",
      labels: toolingLabels,
      github_number: issueNumber,
      github_url: githubUrl,
      repo: config.repo,
      visibility,
      author,
      github_actor: externalActor ? { login: externalActor.login, id: externalActor.id, type: externalActor.type } : undefined,
      created_at: githubIssue?.created_at ?? now,
      closed_at: null,
      last_synced_at: submittedToNeotoma ? now : null,
      sync_pending: !submittedToNeotoma,
      remote_instance_url: config.target_url ?? null,
      remote_entity_id: remoteEntityId || null,
      ...(remoteGuestAccessToken ? { guest_access_token: remoteGuestAccessToken } : {}),
      data_source: submittedToNeotoma
        ? `neotoma-issue ${config.target_url} ${now.slice(0, 10)}`
        : pushedToGithub
          ? `github issues api ${config.repo} #${issueNumber} ${now.slice(0, 10)}`
          : `local-create ${now.slice(0, 10)}`,
    } as StoreEntityInput,
    {
      entity_type: "conversation",
      title: `Issue #${issueNumber || "pending"}: ${params.title}`,
      thread_kind: "multi_party",
      ...(threadConversationId ? { conversation_id: threadConversationId } : {}),
    } as StoreEntityInput,
    {
      entity_type: "conversation_message",
      role: "user",
      sender_kind: "agent",
      content: params.body,
      author,
      github_actor: externalActor ? { login: externalActor.login, id: externalActor.id, type: externalActor.type } : undefined,
      github_comment_id: issueNumber ? `issue-body-${issueNumber}` : null,
      ...(issueNumber > 0
        ? { turn_key: githubIssueBodyTurnKey(config.repo, issueNumber) }
        : {}),
      created_at: githubIssue?.created_at ?? now,
    } as StoreEntityInput,
  ];

  const relationships: StoreInput["relationships"] = [
    { relationship_type: "REFERS_TO", source_index: 0, target_index: 1 },
    { relationship_type: "PART_OF", source_index: 2, target_index: 1 },
  ];

  const storeResult: StoreResult = await runWithExternalActor(externalActor, () =>
    ops.store({
      entities,
      relationships,
      idempotency_key: `issue-create-${config.repo}-${issueNumber || Date.now()}`,
    }),
  ) as StoreResult;

  const entityId = storeResult.structured?.entities?.[0]?.entity_id ?? "";
  const conversationId = storeResult.structured?.entities?.[1]?.entity_id ?? "";

  if (remoteSubmissionAttempted && !submittedToNeotoma) {
    const cause = remoteSubmissionError?.message ?? "unknown error";
    const githubHint =
      pushedToGithub && githubUrl
        ? ` A GitHub issue was created anyway: ${githubUrl}.`
        : "";
    throw new Error(
      `Failed to submit issue to Neotoma at ${issuesTargetUrl}: ${cause}.${githubHint} ` +
        "The issue was stored locally with sync_pending=true for a later retry.",
    );
  }

  const githubMirrorGuidance =
    visibility === "public" && !pushedToGithub ? buildGithubMirrorGuidance(githubMirrorFailure) : null;

  return {
    issue_number: issueNumber,
    github_url: githubUrl,
    entity_id: entityId,
    conversation_id: remoteConversationId || conversationId,
    remote_entity_id: remoteEntityId,
    pushed_to_github: pushedToGithub,
    submitted_to_neotoma: submittedToNeotoma,
    github_mirror_guidance: githubMirrorGuidance,
  };
}

/**
 * Add a message to an existing issue: submit to remote Neotoma + optionally GitHub.
 */
export async function addIssueMessage(
  ops: Operations,
  params: IssueMessageParams,
): Promise<AddMessageResult> {
  const config = await loadIssuesConfig();
  let githubComment: GitHubComment | null = null;
  let pushedToGithub = false;
  let submittedToNeotoma = false;
  const issuesTargetUrl = config.target_url?.trim() ?? "";
  let remoteSubmissionAttempted = false;
  let remoteSubmissionError: Error | null = null;

  // Push to remote Neotoma instance (canonical)
  if (issuesTargetUrl) {
    remoteSubmissionAttempted = true;
    try {
      await neotomaClient.addMessageToRemote({
        githubIssueNumber: params.issue_number,
        body: params.body,
      });
      submittedToNeotoma = true;
    } catch (err) {
      remoteSubmissionError = err instanceof Error ? err : new Error(String(err));
    }
  }

  // Optionally push to GitHub (for public issues with a valid issue number)
  if (params.issue_number > 0) {
    try {
      githubComment = await github.addIssueComment(params.issue_number, params.body);
      pushedToGithub = true;
    } catch {
      // GitHub push failed — local-only
    }
  }

  const now = new Date().toISOString();
  const author = githubComment?.user?.login ?? "local";
  const threadConversationId = githubIssueThreadConversationId(config.repo, params.issue_number);
  const commentActor = buildExternalActorFromGithubComment(githubComment, null, { repository: config.repo });

  const entities: StoreInput["entities"] = [
    {
      entity_type: "conversation",
      title: `Issue #${params.issue_number}`,
      thread_kind: "multi_party",
      ...(threadConversationId ? { conversation_id: threadConversationId } : {}),
    } as StoreEntityInput,
    {
      entity_type: "conversation_message",
      role: "user",
      sender_kind: "agent",
      content: params.body,
      author,
      github_actor: commentActor ? { login: commentActor.login, id: commentActor.id, type: commentActor.type } : undefined,
      github_comment_id: githubComment ? String(githubComment.id) : `local-${Date.now()}`,
      ...(githubComment && params.issue_number > 0
        ? {
            turn_key: githubIssueCommentTurnKey(
              config.repo,
              params.issue_number,
              String(githubComment.id),
            ),
          }
        : {}),
      created_at: githubComment?.created_at ?? now,
    } as StoreEntityInput,
  ];

  const relationships: StoreInput["relationships"] = [
    { relationship_type: "PART_OF", source_index: 1, target_index: 0 },
  ];

  const storeResult: StoreResult = await runWithExternalActor(commentActor, () =>
    ops.store({
      entities,
      relationships,
      idempotency_key: `issue-message-${config.repo}-${params.issue_number}-${githubComment?.id ?? Date.now()}`,
    }),
  ) as StoreResult;

  const messageEntityId = storeResult.structured?.entities?.[1]?.entity_id ?? "";

  if (remoteSubmissionAttempted && !submittedToNeotoma) {
    const cause = remoteSubmissionError?.message ?? "unknown error";
    throw new Error(
      `Failed to submit issue message to Neotoma at ${issuesTargetUrl}: ${cause}. ` +
        "The message was stored locally for follow-up.",
    );
  }

  return {
    github_comment_id: githubComment ? String(githubComment.id) : null,
    message_entity_id: messageEntityId,
    pushed_to_github: pushedToGithub,
    submitted_to_neotoma: submittedToNeotoma,
  };
}

/**
 * Get the status of an issue, with optional sync-if-stale.
 */
export async function getIssueStatus(
  ops: Operations,
  params: { issue_number: number; skip_sync?: boolean },
): Promise<GetIssueStatusResult> {
  const config = await loadIssuesConfig();

  const existing = await ops.retrieveEntityByIdentifier({
    identifier: String(params.issue_number),
    entity_type: "issue",
  }) as { entity_id?: string; snapshot?: Record<string, unknown> } | null;

  const lastSyncedAt = (existing?.snapshot?.last_synced_at as string) ?? null;

  let synced = false;
  if (!params.skip_sync) {
    synced = await syncIssueIfStale(ops, params.issue_number, lastSyncedAt);
  }

  const current = synced
    ? await ops.retrieveEntityByIdentifier({
        identifier: String(params.issue_number),
        entity_type: "issue",
      }) as { entity_id?: string; snapshot?: Record<string, unknown> } | null
    : existing;

  const snapshot = (current?.snapshot ?? {}) as Record<string, unknown>;

  const related = await ops.retrieveRelatedEntities({
    entity_id: current?.entity_id ?? "",
    relationship_types: ["REFERS_TO"],
    direction: "outbound",
  }) as { entities?: Array<{ entity_id: string; entity_type: string; snapshot?: Record<string, unknown> }> };

  const conversationEntity = related?.entities?.find(
    (e) => e.entity_type === "conversation",
  );

  let messages: GetIssueStatusResult["messages"] = [];
  if (conversationEntity) {
    const parts = await ops.retrieveRelatedEntities({
      entity_id: conversationEntity.entity_id,
      relationship_types: ["PART_OF"],
      direction: "inbound",
    }) as { entities?: Array<{ entity_type: string; snapshot?: Record<string, unknown> }> };

    messages = (parts?.entities ?? [])
      .filter((e) => e.entity_type === "conversation_message")
      .map((e) => ({
        author: (e.snapshot?.author as string) ?? "unknown",
        body: (e.snapshot?.content as string) ?? "",
        created_at: (e.snapshot?.created_at as string) ?? "",
      }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  return {
    issue_number: params.issue_number,
    title: (snapshot.title as string) ?? "",
    status: (snapshot.status as string) ?? "open",
    labels: (snapshot.labels as string[]) ?? [],
    github_url: (snapshot.github_url as string) ?? `https://github.com/${config.repo}/issues/${params.issue_number}`,
    author: (snapshot.author as string) ?? "unknown",
    created_at: (snapshot.created_at as string) ?? "",
    closed_at: (snapshot.closed_at as string) ?? null,
    messages,
    synced,
  };
}
