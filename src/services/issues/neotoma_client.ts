/**
 * Neotoma remote client for issue submission.
 *
 * Submits issues to a remote Neotoma instance (the operator's) using AAuth-signed
 * HTTP requests. Reuses the existing API client infrastructure with signWithCliAAuth
 * so the submitter's identity is cryptographically attributed.
 *
 * This is the primary submission transport for all issues (public and private).
 * GitHub is an optional pre-step for discoverability (public issues only).
 */

import type { ExternalActor } from "../../crypto/agent_identity.js";
import { createApiClient, type NeotomaApiClient } from "../../shared/api_client.js";
import { buildExternalActor } from "./external_actor_builder.js";
import { loadIssuesConfig } from "./config.js";
import { githubIssueThreadConversationId } from "./github_issue_thread.js";
import { githubIssueBodyTurnKey } from "./github_thread_keys.js";
import type { IssueVisibility } from "./types.js";

export interface RemoteSubmitResult {
  entity_ids: string[];
  conversation_id: string;
  issue_entity_id: string;
  access_token?: string;
}

export interface RemoteMessageResult {
  message_entity_id: string;
}

function createRemoteClient(targetUrl: string): NeotomaApiClient {
  return createApiClient({
    baseUrl: targetUrl,
    signWithCliAAuth: true,
  });
}

/**
 * Submit an issue to the remote Neotoma instance.
 */
export async function submitIssueToRemote(params: {
  title: string;
  body: string;
  labels?: string[];
  visibility: IssueVisibility;
  githubUrl?: string;
  githubNumber?: number;
  /** GitHub login or `local` / agent label — stored on remote issue + body message for inspector. */
  author?: string;
  /** GitHub user id (numeric) for external actor provenance. */
  authorGithubId?: number;
  /** GitHub user type for external actor provenance. */
  authorGithubType?: string;
}): Promise<RemoteSubmitResult> {
  const config = await loadIssuesConfig();
  if (!config.target_url?.trim()) {
    throw new Error(
      "Issues target URL is empty. Set NEOTOMA_ISSUES_TARGET_URL or issues.target_url in ~/.config/neotoma/config.json.",
    );
  }

  const client = createRemoteClient(config.target_url.trim());
  const now = new Date().toISOString();
  const ghNum = params.githubNumber ?? 0;
  const threadConversationId = githubIssueThreadConversationId(config.repo, ghNum);

  const authorTrim = params.author?.trim();
  const entities = [
    {
      entity_type: "issue",
      title: params.title,
      body: params.body,
      status: "open",
      labels: params.labels ?? [],
      visibility: params.visibility,
      github_url: params.githubUrl ?? null,
      github_number: params.githubNumber ?? null,
      ...(authorTrim ? { author: authorTrim } : {}),
      created_at: now,
      closed_at: null,
      data_source: `neotoma-issue-submission ${now.slice(0, 10)}`,
    },
    {
      entity_type: "conversation",
      title:
        ghNum > 0 ? `Issue #${ghNum}: ${params.title}` : `Issue: ${params.title}`,
      thread_kind: "multi_party",
      ...(threadConversationId ? { conversation_id: threadConversationId } : {}),
    },
    {
      entity_type: "conversation_message",
      role: "user",
      sender_kind: "agent",
      content: params.body,
      ...(authorTrim ? { author: authorTrim } : {}),
      created_at: now,
      ...(ghNum > 0
        ? {
            turn_key: githubIssueBodyTurnKey(config.repo, ghNum),
            github_comment_id: `issue-body-${ghNum}`,
          }
        : {}),
    },
  ];

  const relationships = [
    { relationship_type: "REFERS_TO" as const, source_index: 0, target_index: 1 },
    { relationship_type: "PART_OF" as const, source_index: 2, target_index: 1 },
  ];

  const externalActor: ExternalActor | undefined =
    authorTrim && authorTrim !== "local"
      ? buildExternalActor({
          login: authorTrim,
          id: params.authorGithubId ?? 0,
          type: params.authorGithubType,
          repository: config.repo,
          event_id: params.githubNumber,
        })
      : undefined;

  const { data, error } = await client.POST("/store", {
    body: {
      entities,
      relationships,
      idempotency_key: `issue-remote-submit-${Date.now()}`,
      ...(externalActor ? { external_actor: externalActor } : {}),
    },
  }) as { data?: { structured?: { entities?: Array<{ entity_id: string }> }; guest_access_token?: string }; error?: unknown };

  if (error) {
    throw new Error(`Remote Neotoma store failed: ${JSON.stringify(error)}`);
  }

  const entityIds = (data as any)?.structured?.entities?.map((e: { entity_id: string }) => e.entity_id) ?? [];
  const issueEntityId = entityIds[0] ?? "";
  const conversationId = entityIds[1] ?? "";

  return {
    entity_ids: entityIds,
    conversation_id: conversationId,
    issue_entity_id: issueEntityId,
    access_token: (data as any)?.guest_access_token,
  };
}

/**
 * Add a message to an existing issue on the remote Neotoma instance.
 */
export async function addMessageToRemote(params: {
  githubIssueNumber: number;
  body: string;
}): Promise<RemoteMessageResult> {
  const config = await loadIssuesConfig();
  if (!config.target_url?.trim()) {
    throw new Error(
      "Issues target URL is empty. Set NEOTOMA_ISSUES_TARGET_URL or issues.target_url in config.",
    );
  }

  const client = createRemoteClient(config.target_url.trim());
  const now = new Date().toISOString();
  const threadConversationId = githubIssueThreadConversationId(config.repo, params.githubIssueNumber);

  const entities = [
    {
      entity_type: "conversation",
      title: `Issue #${params.githubIssueNumber}`,
      thread_kind: "multi_party",
      ...(threadConversationId ? { conversation_id: threadConversationId } : {}),
    },
    {
      entity_type: "conversation_message",
      role: "user",
      sender_kind: "agent",
      content: params.body,
      created_at: now,
    },
  ];

  const relationships = [
    { relationship_type: "PART_OF" as const, source_index: 1, target_index: 0 },
  ];

  const { data, error } = await client.POST("/store", {
    body: {
      entities,
      relationships,
      idempotency_key: `issue-remote-message-${Date.now()}`,
    },
  }) as { data?: { structured?: { entities?: Array<{ entity_id: string }> } }; error?: unknown };

  if (error) {
    throw new Error(`Remote Neotoma message failed: ${JSON.stringify(error)}`);
  }

  const messageEntityId = (data as any)?.structured?.entities?.[1]?.entity_id ?? "";

  return { message_entity_id: messageEntityId };
}

/**
 * Check issue status on the remote Neotoma instance.
 */
export async function getRemoteIssueStatus(params: {
  issueEntityId: string;
  accessToken?: string;
}): Promise<Record<string, unknown> | null> {
  const config = await loadIssuesConfig();
  if (!config.target_url?.trim()) return null;

  const client = createRemoteClient(config.target_url.trim());

  const url = `/guest/entities/${params.issueEntityId}${
    params.accessToken ? `?access_token=${params.accessToken}` : ""
  }`;

  const { data, error } = await client.GET(url as any, {}) as { data?: unknown; error?: unknown };

  if (error) return null;
  return data as Record<string, unknown>;
}
