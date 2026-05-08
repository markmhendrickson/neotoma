/**
 * Neotoma remote client for issue submission.
 *
 * Submits issues to a remote Neotoma instance (the operator's) using AAuth-signed
 * HTTP requests. Reuses the existing API client infrastructure with signWithCliAAuth
 * so the submitter's identity is cryptographically attributed.
 *
 * This is the primary submission transport for all issues (public and private).
 * GitHub is an optional pre-step for discoverability (public issues only).
 *
 * Outbound issue calls POST to `/issues/submit` (the OpenAPI-canonical path).
 * `src/actions.ts` also mounts `/api/issues/submit` as an alias on the same handler,
 * but the client uses the canonical path only. Entity read-backs use
 * `GET /entities/{id}` (guest `access_token` query).
 */

import { createApiClient, type NeotomaApiClient } from "../../shared/api_client.js";
import { loadIssuesConfig } from "./config.js";
import {
  githubIssueThreadConversationId,
  localIssueThreadConversationId,
} from "./github_issue_thread.js";
import { localIssueId } from "./github_thread_keys.js";
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
  const signingDisabled = process.env.NEOTOMA_CLI_AAUTH_DISABLE === "1";
  return createApiClient({
    baseUrl: targetUrl,
    /** Explicit false when tests set `NEOTOMA_CLI_AAUTH_DISABLE=1` on the submitter child. */
    signWithCliAAuth: !signingDisabled,
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
  author?: string;
  authorGithubId?: number;
  authorGithubType?: string;
  local_issue_id?: string;
  submission_timestamp?: string;
}): Promise<RemoteSubmitResult> {
  const config = await loadIssuesConfig();
  if (!config.target_url?.trim()) {
    throw new Error(
      "Issues target URL is empty. Set NEOTOMA_ISSUES_TARGET_URL or issues.target_url in ~/.config/neotoma/config.json."
    );
  }

  const client = createRemoteClient(config.target_url.trim());
  const now =
    typeof params.submission_timestamp === "string" && params.submission_timestamp.trim().length > 0
      ? params.submission_timestamp.trim()
      : new Date().toISOString();
  const ghNum = params.githubNumber ?? 0;
  const localId =
    ghNum > 0
      ? undefined
      : typeof params.local_issue_id === "string" && params.local_issue_id.trim().length > 0
        ? params.local_issue_id.trim()
        : localIssueId(config.repo, params.title, now);

  const authorTrim = params.author?.trim();
  const guestBody: Record<string, unknown> = {
    title: params.title,
    body: params.body,
    labels: params.labels ?? [],
    visibility: params.visibility,
    submission_timestamp: now,
  };
  if (params.githubUrl?.trim()) {
    guestBody.github_url = params.githubUrl.trim();
  }
  if (ghNum > 0) {
    guestBody.github_number = ghNum;
  }
  if (authorTrim) {
    guestBody.author = authorTrim;
  }
  if (localId) {
    guestBody.local_issue_id = localId;
  }

  const { data, error } = (await client.POST("/issues/submit" as any, {
    body: guestBody,
  })) as {
    data?: {
      entity_ids?: string[];
      issue_entity_id?: string;
      conversation_id?: string;
      guest_access_token?: string;
    };
    error?: unknown;
  };

  if (error) {
    throw new Error(`Remote Neotoma issue submit failed: ${JSON.stringify(error)}`);
  }

  const issueEntityId = data?.issue_entity_id ?? data?.entity_ids?.[0] ?? "";
  const conversationId = data?.conversation_id ?? data?.entity_ids?.[1] ?? "";
  const entityIds =
    Array.isArray(data?.entity_ids) && data.entity_ids.length > 0
      ? data.entity_ids
      : [issueEntityId, conversationId].filter(Boolean);

  return {
    entity_ids: entityIds,
    conversation_id: conversationId,
    issue_entity_id: issueEntityId,
    access_token: data?.guest_access_token,
  };
}

/**
 * Add a message to an existing issue on the remote Neotoma instance.
 *
 * Prefer `issue_entity_id` (canonical on the target instance). When omitted, `githubIssueNumber`
 * must be set for GitHub-backed threads.
 */
export async function addMessageToRemote(params: {
  body: string;
  githubIssueNumber?: number;
  issue_entity_id?: string;
  guest_access_token?: string;
  local_issue_id?: string;
  issue_title?: string;
  remote_conversation_id?: string;
}): Promise<RemoteMessageResult> {
  const config = await loadIssuesConfig();
  if (!config.target_url?.trim()) {
    throw new Error(
      "Issues target URL is empty. Set NEOTOMA_ISSUES_TARGET_URL or issues.target_url in config."
    );
  }

  const client = createRemoteClient(config.target_url.trim());
  const now = new Date().toISOString();

  const tokenTrim =
    typeof params.guest_access_token === "string" && params.guest_access_token.trim().length > 0
      ? params.guest_access_token.trim()
      : "";
  const remoteIssueEntityId =
    typeof params.issue_entity_id === "string" && params.issue_entity_id.trim().length > 0
      ? params.issue_entity_id.trim()
      : "";

  if (tokenTrim && remoteIssueEntityId) {
    const { data, error } = (await client.POST("/issues/add_message" as any, {
      body: {
        entity_id: remoteIssueEntityId,
        body: params.body,
        guest_access_token: tokenTrim,
      },
    })) as { data?: { message_entity_id?: string }; error?: unknown };

    if (error) {
      throw new Error(`Remote Neotoma message failed: ${JSON.stringify(error)}`);
    }

    return { message_entity_id: data?.message_entity_id ?? "" };
  }

  let ghNum =
    typeof params.githubIssueNumber === "number" && params.githubIssueNumber > 0
      ? Math.trunc(params.githubIssueNumber)
      : 0;
  let localIssueIdVal: string | undefined;
  let issueTitle =
    typeof params.issue_title === "string" && params.issue_title.trim().length > 0
      ? params.issue_title.trim()
      : "Issue";

  const remoteId = remoteIssueEntityId;
  if (remoteId) {
    const status = await getRemoteIssueStatus({
      issueEntityId: remoteId,
      accessToken: params.guest_access_token,
    });
    if (status) {
      const top = status as Record<string, unknown>;
      const nested =
        top.snapshot && typeof top.snapshot === "object"
          ? (top.snapshot as Record<string, unknown>)
          : top;
      if (typeof nested.title === "string" && nested.title.trim()) {
        issueTitle = nested.title.trim();
      }
      const gn = nested.github_number;
      if (typeof gn === "number" && Number.isFinite(gn) && gn > 0) {
        ghNum = Math.trunc(gn);
      } else if (typeof gn === "string" && /^\d+$/.test(gn.trim())) {
        const n = parseInt(gn.trim(), 10);
        if (n > 0) ghNum = n;
      }
      const lid = nested.local_issue_id;
      if (typeof lid === "string" && lid.trim()) {
        localIssueIdVal = lid.trim();
      }
    }
  }

  if (ghNum <= 0 && !localIssueIdVal) {
    const fromParams = params.local_issue_id?.trim();
    if (fromParams) {
      localIssueIdVal = fromParams;
    }
  }

  if (ghNum <= 0 && !localIssueIdVal) {
    throw new Error(
      "addMessageToRemote requires a GitHub-backed issue (githubIssueNumber) or an issue_entity_id that resolves to github_number or local_issue_id on the remote."
    );
  }

  const computedThreadConversationId =
    ghNum > 0
      ? githubIssueThreadConversationId(config.repo, ghNum)
      : localIssueThreadConversationId(config.repo, localIssueIdVal ?? "");
  const threadConversationId =
    typeof params.remote_conversation_id === "string" &&
    params.remote_conversation_id.trim().length > 0
      ? params.remote_conversation_id.trim()
      : computedThreadConversationId;

  const conversationTitle = ghNum > 0 ? `Issue #${ghNum}` : `Issue: ${issueTitle}`;

  const entities = [
    {
      entity_type: "conversation",
      title: conversationTitle,
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

  const { data, error } = (await client.POST("/store", {
    body: {
      entities,
      relationships,
      idempotency_key: `issue-remote-message-${remoteId || "gh"}-${ghNum || localIssueIdVal || "local"}-${Date.now()}`,
    },
  })) as { data?: { structured?: { entities?: Array<{ entity_id: string }> } }; error?: unknown };

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

  const { data, error } = (await client.GET("/entities/{id}" as any, {
    params: {
      path: { id: params.issueEntityId },
      query: params.accessToken?.trim() ? { access_token: params.accessToken.trim() } : {},
    },
  })) as { data?: unknown; error?: unknown };

  if (error) return null;
  return data as Record<string, unknown>;
}

/**
 * Fetch issue status + thread messages from the remote operator (`POST /issues/status`).
 */
export async function fetchRemoteIssueThread(params: {
  issueEntityId: string;
  accessToken?: string;
}): Promise<Record<string, unknown> | null> {
  const config = await loadIssuesConfig();
  if (!config.target_url?.trim()) return null;

  const client = createRemoteClient(config.target_url.trim());
  const token = params.accessToken?.trim();
  const { data, error } = (await client.POST("/issues/status" as any, {
    body: {
      entity_id: params.issueEntityId,
      ...(token ? { guest_access_token: token } : {}),
      skip_sync: true,
    },
  })) as {
    data?: Record<string, unknown>;
    error?: unknown;
  };

  if (error) return null;
  if (!data || typeof data !== "object") return null;
  return data;
}
