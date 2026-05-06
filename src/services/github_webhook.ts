/**
 * GitHub webhook verification and event mapping.
 *
 * Provides:
 * - HMAC SHA-256 signature verification (timing-safe) for X-Hub-Signature-256
 * - Event mapping from GitHub issues/issue_comment events to Neotoma store payloads
 *   with external_actor provenance at `verified_via: "webhook_signature"`.
 */

import crypto from "node:crypto";

import type { ExternalActor } from "../crypto/agent_identity.js";
import { buildExternalActor } from "./issues/external_actor_builder.js";

/**
 * Verify the GitHub webhook signature using timing-safe HMAC SHA-256.
 *
 * @param rawBody - The raw request body bytes (NOT parsed JSON).
 * @param signatureHeader - The `X-Hub-Signature-256` header value (e.g. "sha256=abc123...").
 * @param secret - The shared webhook secret (`GITHUB_WEBHOOK_SECRET`).
 * @returns true if the signature is valid, false otherwise.
 */
export function verifyGithubSignature(
  rawBody: Buffer,
  signatureHeader: string,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;

  const parts = signatureHeader.split("=");
  if (parts.length !== 2 || parts[0] !== "sha256") return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const received = parts[1]!;

  if (expected.length !== received.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(received, "hex"),
  );
}

export interface WebhookStorePayload {
  entities: Record<string, unknown>[];
  relationships: Array<{
    relationship_type: string;
    source_index: number;
    target_index: number;
  }>;
  idempotency_key: string;
  external_actor: ExternalActor;
  observation_source: "sensor";
}

/**
 * Map a GitHub webhook event to a Neotoma store payload.
 *
 * Supports `issues` and `issue_comment` event types.
 * Returns null for unsupported events or actions.
 */
export function mapEventToStore(
  event: string,
  payload: Record<string, unknown>,
  deliveryId: string,
): WebhookStorePayload | null {
  if (event === "issues") {
    return mapIssueEvent(payload, deliveryId);
  }
  if (event === "issue_comment") {
    return mapIssueCommentEvent(payload, deliveryId);
  }
  return null;
}

function mapIssueEvent(
  payload: Record<string, unknown>,
  deliveryId: string,
): WebhookStorePayload | null {
  const action = payload.action as string;
  if (!["opened", "edited", "closed", "reopened", "labeled", "unlabeled"].includes(action)) {
    return null;
  }

  const issue = payload.issue as Record<string, unknown> | undefined;
  if (!issue) return null;

  const user = issue.user as { login?: string; id?: number; type?: string } | null;
  const repo = payload.repository as { full_name?: string } | undefined;
  const repoName = repo?.full_name ?? "";

  const actor = buildExternalActor({
    login: user?.login ?? "unknown",
    id: user?.id ?? 0,
    type: user?.type,
    verified_via: "webhook_signature",
    delivery_id: deliveryId,
    event_type: "issues",
    repository: repoName,
    event_id: issue.number as number,
  });

  const labels = (issue.labels as Array<{ name: string }> | undefined)?.map((l) => l.name) ?? [];
  const now = new Date().toISOString();

  const entities: Record<string, unknown>[] = [
    {
      entity_type: "issue",
      title: issue.title as string,
      body: issue.body as string ?? "",
      status: issue.state as string,
      labels,
      github_number: issue.number as number,
      github_url: issue.html_url as string,
      repo: repoName,
      visibility: "public",
      author: user?.login ?? "unknown",
      github_actor: { login: actor.login, id: actor.id, type: actor.type },
      created_at: issue.created_at as string,
      closed_at: issue.closed_at as string | null,
      last_synced_at: now,
      sync_pending: false,
      data_source: `github webhook issues ${repoName} #${issue.number as number} delivery:${deliveryId}`,
    },
    {
      entity_type: "conversation",
      title: `Issue #${issue.number as number}: ${issue.title as string}`,
      thread_kind: "multi_party",
    },
    {
      entity_type: "conversation_message",
      role: "user",
      sender_kind: "user",
      content: issue.body as string ?? "",
      author: user?.login ?? "unknown",
      github_actor: { login: actor.login, id: actor.id, type: actor.type },
      github_comment_id: `issue-body-${issue.number as number}`,
      created_at: issue.created_at as string,
    },
  ];

  return {
    entities,
    relationships: [
      { relationship_type: "REFERS_TO", source_index: 0, target_index: 1 },
      { relationship_type: "PART_OF", source_index: 2, target_index: 1 },
    ],
    idempotency_key: `webhook-issue-${repoName}-${issue.number as number}-${deliveryId}`,
    external_actor: actor,
    observation_source: "sensor",
  };
}

function mapIssueCommentEvent(
  payload: Record<string, unknown>,
  deliveryId: string,
): WebhookStorePayload | null {
  const action = payload.action as string;
  if (!["created", "edited"].includes(action)) {
    return null;
  }

  const comment = payload.comment as Record<string, unknown> | undefined;
  const issue = payload.issue as Record<string, unknown> | undefined;
  if (!comment || !issue) return null;

  const user = comment.user as { login?: string; id?: number; type?: string } | null;
  const repo = payload.repository as { full_name?: string } | undefined;
  const repoName = repo?.full_name ?? "";

  const actor = buildExternalActor({
    login: user?.login ?? "unknown",
    id: user?.id ?? 0,
    type: user?.type,
    verified_via: "webhook_signature",
    delivery_id: deliveryId,
    event_type: "issue_comment",
    repository: repoName,
    event_id: issue.number as number,
    comment_id: comment.id as number,
  });

  const entities: Record<string, unknown>[] = [
    {
      entity_type: "conversation",
      title: `Issue #${issue.number as number}: ${issue.title as string}`,
      thread_kind: "multi_party",
    },
    {
      entity_type: "conversation_message",
      role: "user",
      sender_kind: "user",
      content: comment.body as string,
      author: user?.login ?? "unknown",
      github_actor: { login: actor.login, id: actor.id, type: actor.type },
      github_comment_id: String(comment.id),
      created_at: comment.created_at as string,
    },
  ];

  return {
    entities,
    relationships: [
      { relationship_type: "PART_OF", source_index: 1, target_index: 0 },
    ],
    idempotency_key: `webhook-comment-${repoName}-${issue.number as number}-${comment.id as number}-${deliveryId}`,
    external_actor: actor,
    observation_source: "sensor",
  };
}
