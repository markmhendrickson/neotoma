/**
 * GitHub inbound webhook: signature verification + event → store payload mapping.
 */

import crypto from "node:crypto";

import type { ExternalActor } from "../../../crypto/agent_identity.js";
import { buildExternalActor } from "../../issues/external_actor_builder.js";

export function verifyGithubSignature(
  rawBody: Buffer,
  signatureHeader: string,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;

  const parts = signatureHeader.split("=");
  if (parts.length !== 2 || parts[0] !== "sha256") return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  const received = parts[1]!;

  if (expected.length !== received.length) return false;

  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
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

export function mapGithubWebhookEventToStore(
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

/** @deprecated Use {@link mapGithubWebhookEventToStore}. */
export const mapEventToStore = mapGithubWebhookEventToStore;

function reporterFieldsFromPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const installation = payload.installation as { id?: number } | undefined;
  if (installation?.id != null) {
    out.reporter_ci_run_id = `github-installation-${installation.id}`;
  }
  return out;
}

function mapIssueEvent(payload: Record<string, unknown>, deliveryId: string): WebhookStorePayload | null {
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

  const issueRow: Record<string, unknown> = {
    entity_type: "issue",
    title: issue.title as string,
    body: (issue.body as string) ?? "",
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
    ...reporterFieldsFromPayload(payload),
  };

  const entities: Record<string, unknown>[] = [
    issueRow,
    {
      entity_type: "conversation",
      title: `Issue #${issue.number as number}: ${issue.title as string}`,
      thread_kind: "multi_party",
    },
    {
      entity_type: "conversation_message",
      role: "user",
      sender_kind: "user",
      content: (issue.body as string) ?? "",
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

function mapIssueCommentEvent(payload: Record<string, unknown>, deliveryId: string): WebhookStorePayload | null {
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
    relationships: [{ relationship_type: "PART_OF", source_index: 1, target_index: 0 }],
    idempotency_key: `webhook-comment-${repoName}-${issue.number as number}-${comment.id as number}-${deliveryId}`,
    external_actor: actor,
    observation_source: "sensor",
  };
}
