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

import type {
  Operations,
  StoreEntityInput,
  StoreInput,
  StoreResult,
} from "../../core/operations.js";
import { assertGuestWriteAllowed } from "../access_policy.js";
import {
  getCurrentAgentIdentity,
  getRequestContext,
  runWithExternalActor,
  runWithRequestContext,
} from "../request_context.js";
import {
  appendMessageToConversation,
  entitySnapshotPayload,
  mintGuestReadBackToken,
  persistGuestTokenHashOnIssue,
  resolveConversationForRoot,
  storeRootWithThread,
  structuredEntities,
  structuredEntityIdAt,
} from "../submitted_thread/submitted_thread.js";
import { loadIssuesConfig } from "./config.js";
import { IssueTransportError, IssueValidationError } from "./errors.js";
import { runRedactionGuard } from "./redaction_guard.js";
import {
  buildExternalActorFromGithubComment,
  buildExternalActorFromGithubIssue,
} from "./external_actor_builder.js";
import * as github from "./github_client.js";
import {
  githubIssueThreadConversationId,
  localIssueThreadConversationId,
} from "./github_issue_thread.js";
import {
  githubIssueBodyTurnKey,
  githubIssueCommentTurnKey,
  localIssueBodyTurnKey,
  localIssueCommentTurnKey,
  localIssueId,
} from "./github_thread_keys.js";
import * as neotomaClient from "./neotoma_client.js";
import { syncIssueIfStale } from "./sync_issues_from_github.js";
import type {
  GitHubComment,
  GitHubIssue,
  IssueCreateParams,
  IssueMessageParams,
  IssueStatusParams,
  IssueVisibility,
} from "./types.js";

const GITHUB_MIRROR_GUIDANCE_MAX_CAUSE = 240;

function entityPrimaryId(entity: { entity_id?: string; id?: string }): string {
  if (typeof entity.entity_id === "string" && entity.entity_id.trim())
    return entity.entity_id.trim();
  if (typeof entity.id === "string" && entity.id.trim()) return entity.id.trim();
  return "";
}

function reporterProvenanceFields(params: IssueCreateParams): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = [
    "reporter_git_sha",
    "reporter_git_ref",
    "reporter_channel",
    "reporter_app_version",
    "reporter_ci_run_id",
    "reporter_patch_source_id",
  ] as const;
  for (const k of keys) {
    const v = params[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

function truncateGuidanceCause(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= GITHUB_MIRROR_GUIDANCE_MAX_CAUSE) return collapsed;
  return `${collapsed.slice(0, GITHUB_MIRROR_GUIDANCE_MAX_CAUSE - 1)}…`;
}

function parseGithubNumberFromSnapshot(snapshot: Record<string, unknown>): number {
  const v = snapshot.github_number;
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.trunc(v);
  if (typeof v === "string" && /^\d+$/.test(v.trim())) {
    const n = parseInt(v.trim(), 10);
    if (n > 0) return n;
  }
  return 0;
}

type ResolvedIssueRow = {
  issue_entity_id: string;
  snapshot: Record<string, unknown>;
  githubNumber: number;
  localIssueId: string | null;
};

function snapshotFromEntityRow(row: {
  snapshot?: Record<string, unknown>;
}): Record<string, unknown> {
  const snapshot = row.snapshot ?? {};
  return snapshot.snapshot && typeof snapshot.snapshot === "object"
    ? (snapshot.snapshot as Record<string, unknown>)
    : snapshot;
}

async function resolveIssueEntityIdByGithubNumber(
  ops: Operations,
  githubNumber: number,
  repo: string
): Promise<string> {
  const result = (await ops.retrieveEntities({
    entity_type: "issue",
    limit: 200,
    include_snapshots: true,
  })) as {
    entities?: Array<{
      id?: string;
      entity_id?: string;
      snapshot?: Record<string, unknown>;
    }>;
  };
  const numberMatches = (result.entities ?? []).filter((entity) => {
    const snapshot = snapshotFromEntityRow(entity);
    return parseGithubNumberFromSnapshot(snapshot) === githubNumber;
  });
  const candidates = numberMatches.filter((entity) => snapshotFromEntityRow(entity).repo === repo);
  if (candidates.length === 0 && numberMatches.length > 0) {
    return numberMatches[0]?.entity_id ?? numberMatches[0]?.id ?? "";
  }
  return candidates[0]?.entity_id ?? candidates[0]?.id ?? "";
}

/**
 * Resolve an `issue` row from Neotoma (`entity_id` preferred) or legacy GitHub issue number
 * in the configured repo.
 */
export async function resolveIssueRow(
  ops: Operations,
  params: { entity_id?: string; issue_number?: number }
): Promise<ResolvedIssueRow> {
  const trimmedEid = typeof params.entity_id === "string" ? params.entity_id.trim() : "";
  const hasEid = trimmedEid.length > 0;
  const num = params.issue_number;
  const hasNum = typeof num === "number" && Number.isInteger(num) && num > 0;

  if (!hasEid && !hasNum) {
    throw new Error("Provide entity_id or issue_number.");
  }

  let issue_entity_id = hasEid
    ? trimmedEid
    : ((
        (await ops.retrieveEntityByIdentifier({
          identifier: String(num),
          entity_type: "issue",
        })) as { entity_id?: string } | null
      )?.entity_id ?? "");

  if (!issue_entity_id && hasNum) {
    const config = await loadIssuesConfig();
    issue_entity_id = await resolveIssueEntityIdByGithubNumber(ops, num, config.repo);
  }

  if (!issue_entity_id) {
    throw new Error(`No issue entity found for issue_number=${num}.`);
  }

  const raw = (await ops.retrieveEntitySnapshot({
    entity_id: issue_entity_id,
    format: "json",
  })) as {
    entity_type?: string;
    entity_id?: string;
    snapshot?: Record<string, unknown>;
  } | null;

  if (!raw || raw.entity_type !== "issue") {
    throw new Error(
      `entity_id must refer to an issue entity (got ${raw?.entity_type ?? "unknown"}).`
    );
  }

  const snapshot = (raw.snapshot ?? {}) as Record<string, unknown>;
  const githubNumber = parseGithubNumberFromSnapshot(snapshot);
  const localIssueId =
    typeof snapshot.local_issue_id === "string" && snapshot.local_issue_id.trim().length > 0
      ? snapshot.local_issue_id.trim()
      : null;

  if (hasEid && hasNum && githubNumber > 0 && num !== githubNumber) {
    throw new Error(
      `issue_number (${num}) does not match github_number on entity (${githubNumber}).`
    );
  }

  return { issue_entity_id, snapshot, githubNumber, localIssueId };
}

function remoteIssueEntityIdForTarget(
  snapshot: Record<string, unknown>,
  localIssueEntityId: string
): string {
  const r = snapshot.remote_entity_id;
  if (typeof r === "string" && r.trim().length > 0) return r.trim();
  return localIssueEntityId;
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
  guest_access_token?: string;
  /** When a public issue was stored without a GitHub mirror, non-null guidance for agents/operators. */
  github_mirror_guidance: string | null;
  /** Non-null when remote submission was attempted but failed; issue stored locally with sync_pending=true. */
  remote_submission_error: string | null;
}

export interface GuestIssueSubmitParams {
  userId: string;
  title: string;
  body: string;
  labels?: string[];
  visibility?: IssueVisibility;
  githubUrl?: string;
  githubNumber?: number;
  author?: string;
  local_issue_id?: string;
  submission_timestamp?: string;
}

export interface GuestIssueSubmitResult {
  entity_ids: string[];
  issue_entity_id: string;
  conversation_id: string;
  guest_access_token: string;
}

export interface AddMessageResult {
  github_comment_id: string | null;
  message_entity_id: string;
  pushed_to_github: boolean;
  submitted_to_neotoma: boolean;
  remote_submission_error: string | null;
}

export interface GetIssueStatusResult {
  /** Neotoma canonical id for this `issue` row. */
  issue_entity_id: string;
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

function mergeIssueStatusMessages(
  remoteMessages: GetIssueStatusResult["messages"],
  localMessages: GetIssueStatusResult["messages"]
): GetIssueStatusResult["messages"] {
  const byKey = new Map<string, GetIssueStatusResult["messages"][number]>();

  for (const message of [...remoteMessages, ...localMessages]) {
    const key = issueStatusMessageMergeKey(message);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, message);
    } else if (shouldPreferIssueStatusMessage(message, existing)) {
      byKey.set(key, message);
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    const createdAtCmp = a.created_at.localeCompare(b.created_at);
    if (createdAtCmp !== 0) return createdAtCmp;
    const authorCmp = a.author.localeCompare(b.author);
    if (authorCmp !== 0) return authorCmp;
    return a.body.localeCompare(b.body);
  });
}

function issueStatusMessageMergeKey(message: GetIssueStatusResult["messages"][number]): string {
  const body = message.body.trim().replace(/\s+/g, " ");
  const timestampMs = Date.parse(message.created_at);
  if (!Number.isFinite(timestampMs)) {
    return `${message.created_at}\0${body}`;
  }
  return `${Math.floor(timestampMs / 1000)}\0${body}`;
}

function shouldPreferIssueStatusMessage(
  candidate: GetIssueStatusResult["messages"][number],
  existing: GetIssueStatusResult["messages"][number]
): boolean {
  if (existing.author === "guest" && candidate.author !== "guest") {
    return true;
  }
  return false;
}

function coerceRemoteIssueThreadPayload(
  raw: Record<string, unknown>,
  issueEntityIdForResponse: string,
  config: { repo: string },
  synced: boolean
): GetIssueStatusResult | null {
  if (!Array.isArray(raw.messages)) return null;

  const messages = (raw.messages as unknown[])
    .map((m) => {
      const row = m && typeof m === "object" ? (m as Record<string, unknown>) : {};
      return {
        author: typeof row.author === "string" ? row.author : "unknown",
        body: typeof row.body === "string" ? row.body : "",
        created_at: typeof row.created_at === "string" ? row.created_at : "",
      };
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  let ghNum = 0;
  if (typeof raw.issue_number === "number" && Number.isFinite(raw.issue_number)) {
    ghNum = Math.trunc(raw.issue_number);
  } else {
    ghNum = parseGithubNumberFromSnapshot(raw);
  }

  const githubUrlRaw = raw.github_url;
  const githubUrl =
    typeof githubUrlRaw === "string" && githubUrlRaw.length > 0
      ? githubUrlRaw
      : ghNum > 0
        ? `https://github.com/${config.repo}/issues/${ghNum}`
        : "";

  const closedRaw = raw.closed_at;
  const closedAt =
    closedRaw === null || closedRaw === undefined
      ? null
      : typeof closedRaw === "string"
        ? closedRaw
        : null;

  const labelsRaw = raw.labels;
  const labels = Array.isArray(labelsRaw)
    ? (labelsRaw as string[]).filter((x) => typeof x === "string")
    : [];

  return {
    issue_entity_id: issueEntityIdForResponse,
    issue_number: ghNum,
    title: typeof raw.title === "string" ? raw.title : "",
    status: typeof raw.status === "string" ? raw.status : "open",
    labels,
    github_url: githubUrl,
    author: typeof raw.author === "string" ? raw.author : "unknown",
    created_at: typeof raw.created_at === "string" ? raw.created_at : "",
    closed_at: closedAt,
    messages,
    synced,
  };
}

/**
 * Load conversation_message rows for an issue's linked conversation (local graph).
 */
export async function loadIssueThreadMessages(
  ops: Operations,
  issueEntityId: string
): Promise<GetIssueStatusResult["messages"]> {
  const related = (await ops.retrieveRelatedEntities({
    entity_id: issueEntityId,
    relationship_types: ["REFERS_TO"],
    direction: "outbound",
  })) as {
    entities?: Array<{
      id?: string;
      entity_id?: string;
      entity_type: string;
      snapshot?: Record<string, unknown>;
    }>;
  };

  const conversationEntityIds = Array.from(
    new Set(
      (related?.entities ?? [])
        .filter((e) => e.entity_type === "conversation")
        .map((e) => entityPrimaryId(e))
        .filter(Boolean)
    )
  ).sort();
  if (conversationEntityIds.length === 0) return [];

  const messagesByKey = new Map<string, GetIssueStatusResult["messages"][number]>();

  for (const conversationEntityId of conversationEntityIds) {
    const parts = (await ops.retrieveRelatedEntities({
      entity_id: conversationEntityId,
      relationship_types: ["PART_OF"],
      direction: "inbound",
    })) as {
      entities?: Array<{
        id?: string;
        entity_id?: string;
        entity_type: string;
        snapshot?: Record<string, unknown>;
      }>;
    };

    for (const entity of parts?.entities ?? []) {
      if (entity.entity_type !== "conversation_message") continue;
      const snap = entitySnapshotPayload(entity);
      const message = {
        author: (snap.author as string) ?? "unknown",
        body: (snap.content as string) ?? "",
        created_at: (snap.created_at as string) ?? "",
      };
      const messageKey =
        (typeof snap.turn_key === "string" && snap.turn_key.trim()) ||
        (typeof snap.github_comment_id === "string" && snap.github_comment_id.trim()) ||
        entityPrimaryId(entity) ||
        `${message.created_at}|${message.author}|${message.body}`;
      if (!messagesByKey.has(messageKey)) {
        messagesByKey.set(messageKey, message);
      }
    }
  }

  return Array.from(messagesByKey.values()).sort((a, b) => {
    const createdAtCmp = a.created_at.localeCompare(b.created_at);
    if (createdAtCmp !== 0) return createdAtCmp;
    const authorCmp = a.author.localeCompare(b.author);
    if (authorCmp !== 0) return authorCmp;
    return a.body.localeCompare(b.body);
  });
}

/**
 * Build get_issue_status-shaped payload from the local graph for one issue entity id.
 */
export async function loadIssueStatusFromGraph(
  ops: Operations,
  issueEntityId: string,
  config: { repo: string }
): Promise<GetIssueStatusResult> {
  const raw = (await ops.retrieveEntitySnapshot({
    entity_id: issueEntityId,
    format: "json",
  })) as {
    entity_type?: string;
    entity_id?: string;
    snapshot?: Record<string, unknown>;
  } | null;

  if (!raw || raw.entity_type !== "issue") {
    throw new Error(
      `entity_id must refer to an issue entity (got ${raw?.entity_type ?? "unknown"}).`
    );
  }

  const snapshot = (raw.snapshot ?? {}) as Record<string, unknown>;
  const ghNum = parseGithubNumberFromSnapshot(snapshot);
  const messages = await loadIssueThreadMessages(ops, issueEntityId);

  return {
    issue_entity_id: issueEntityId,
    issue_number: ghNum,
    title: (snapshot.title as string) ?? "",
    status: (snapshot.status as string) ?? "open",
    labels: (snapshot.labels as string[]) ?? [],
    github_url:
      (snapshot.github_url as string) ??
      (ghNum > 0 ? `https://github.com/${config.repo}/issues/${ghNum}` : ""),
    author: (snapshot.author as string) ?? "unknown",
    created_at: (snapshot.created_at as string) ?? "",
    closed_at: (snapshot.closed_at as string) ?? null,
    messages,
    synced: false,
  };
}

export async function submitGuestIssue(
  ops: Operations,
  params: GuestIssueSubmitParams
): Promise<GuestIssueSubmitResult> {
  await assertGuestWriteAllowed(["issue"], {});

  const config = await loadIssuesConfig();
  const now =
    typeof params.submission_timestamp === "string" && params.submission_timestamp.trim().length > 0
      ? params.submission_timestamp.trim()
      : new Date().toISOString();
  const ghNum =
    params.githubNumber && params.githubNumber > 0 ? Math.trunc(params.githubNumber) : 0;
  const localId =
    ghNum > 0
      ? undefined
      : typeof params.local_issue_id === "string" && params.local_issue_id.trim().length > 0
        ? params.local_issue_id.trim()
        : localIssueId(config.repo, params.title, now);
  const visibility = params.visibility ?? "public";
  const author =
    typeof params.author === "string" && params.author.trim().length > 0
      ? params.author.trim()
      : "local";
  const threadConversationId =
    ghNum > 0
      ? githubIssueThreadConversationId(config.repo, ghNum)
      : localIssueThreadConversationId(config.repo, localId ?? "");
  const bodyTurnKey =
    ghNum > 0
      ? githubIssueBodyTurnKey(config.repo, ghNum)
      : localIssueBodyTurnKey(config.repo, localId ?? "");

  const entities: StoreInput["entities"] = [
    {
      entity_type: "issue",
      title: params.title,
      body: params.body,
      status: "open",
      labels: params.labels ?? [],
      visibility,
      github_url: params.githubUrl ?? "",
      github_number: ghNum > 0 ? ghNum : null,
      repo: config.repo,
      ...(localId ? { local_issue_id: localId } : {}),
      author,
      created_at: now,
      closed_at: null,
      sync_pending: false,
      data_source: `neotoma-issue-submission ${now.slice(0, 10)}`,
    } as StoreEntityInput,
    {
      entity_type: "conversation",
      title: ghNum > 0 ? `Issue #${ghNum}: ${params.title}` : `Issue: ${params.title}`,
      thread_kind: "multi_party",
      ...(threadConversationId ? { conversation_id: threadConversationId } : {}),
    } as StoreEntityInput,
    {
      entity_type: "conversation_message",
      role: "user",
      sender_kind: "agent",
      content: params.body,
      author,
      created_at: now,
      turn_key: bodyTurnKey,
      github_comment_id: ghNum > 0 ? `issue-body-${ghNum}` : `local-issue-body-${localId}`,
    } as StoreEntityInput,
  ];

  const relationships: StoreInput["relationships"] = [
    { relationship_type: "REFERS_TO", source_index: 0, target_index: 1 },
    { relationship_type: "PART_OF", source_index: 2, target_index: 1 },
  ];

  const currentContext = getRequestContext();
  const storeResult = await storeRootWithThread(
    ops,
    {
      entities,
      relationships,
      idempotency_key: `issue-guest-submit-${config.repo}-${ghNum || localId}`,
    },
    {
      runStore: (input) =>
        runWithRequestContext(
          {
            agentIdentity: currentContext?.agentIdentity ?? null,
            attributionDecision: currentContext?.attributionDecision ?? null,
            aauthAdmission: currentContext?.aauthAdmission ?? null,
            externalActor: currentContext?.externalActor ?? null,
            bypassGuestStoreAccessPolicy: true,
          },
          () => ops.store(input)
        ),
    }
  );
  const structured = structuredEntities(storeResult);
  const entityIds = structured.map((e) => e.entity_id ?? "").filter(Boolean);
  const issueEntityId = entityIds[0] ?? "";
  const conversationId = entityIds[1] ?? "";
  const guestAccessToken = await mintGuestReadBackToken({
    entityIds: [issueEntityId, conversationId].filter(Boolean),
    userId: params.userId,
    thumbprint: getCurrentAgentIdentity()?.thumbprint,
  });
  if (issueEntityId) {
    await persistGuestTokenHashOnIssue(ops, {
      issueEntityId,
      token: guestAccessToken,
      idempotency_key: `issue-guest-token-hash-${issueEntityId}`,
    });
  }

  return {
    entity_ids: entityIds,
    issue_entity_id: issueEntityId,
    conversation_id: conversationId,
    guest_access_token: guestAccessToken,
  };
}

export async function appendGuestIssueMessage(
  ops: Operations,
  params: { issue_entity_id: string; body: string }
): Promise<{ message_entity_id: string }> {
  const raw = (await ops.retrieveEntitySnapshot({
    entity_id: params.issue_entity_id,
    format: "json",
  })) as {
    entity_type?: string;
    snapshot?: Record<string, unknown>;
  } | null;
  if (!raw || raw.entity_type !== "issue") {
    throw new Error(
      `entity_id must refer to an issue entity (got ${raw?.entity_type ?? "unknown"}).`
    );
  }

  const snapshot = (raw.snapshot ?? {}) as Record<string, unknown>;
  const conversation = await resolveConversationForRoot(ops, params.issue_entity_id);
  if (!conversation) {
    throw new Error("Issue conversation relationship is missing.");
  }

  const now = new Date().toISOString();
  const issueTitle =
    typeof snapshot.title === "string" && snapshot.title.trim().length > 0
      ? snapshot.title.trim()
      : "Issue";

  const appendResult = await appendMessageToConversation(ops, {
    strategy: "conversation_extend_batch",
    conversationExtend: {
      entity_type: "conversation",
      target_id: conversation.entity_id,
      title:
        typeof conversation.snapshot.title === "string" && conversation.snapshot.title.trim()
          ? (conversation.snapshot.title as string)
          : `Issue: ${issueTitle}`,
      thread_kind: "multi_party",
    } as StoreEntityInput,
    message: {
      entity_type: "conversation_message",
      role: "user",
      sender_kind: "agent",
      content: params.body,
      author: "guest",
      created_at: now,
      turn_key: `guest-issue-message:${params.issue_entity_id}:${now}`,
    } as StoreEntityInput,
    idempotency_key: `issue-guest-message-${params.issue_entity_id}-${now}`,
  });

  await touchIssueThreadActivity(ops, {
    issueEntityId: params.issue_entity_id,
    messageAt: now,
    author: "guest",
    idempotencyKey: `issue-guest-message-activity-${params.issue_entity_id}-${now}`,
  });

  return appendResult;
}

function reporterProvenanceFieldsForMessage(
  params: Pick<
    IssueMessageParams,
    "reporter_git_sha" | "reporter_git_ref" | "reporter_channel" | "reporter_app_version"
  >
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = [
    "reporter_git_sha",
    "reporter_git_ref",
    "reporter_channel",
    "reporter_app_version",
  ] as const;
  for (const k of keys) {
    const v = params[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

async function touchIssueThreadActivity(
  ops: Operations,
  params: {
    issueEntityId: string;
    messageAt: string;
    author?: string;
    idempotencyKey: string;
  }
): Promise<void> {
  const entity: StoreEntityInput = {
    entity_type: "issue",
    target_id: params.issueEntityId,
    last_message_at: params.messageAt,
  } as StoreEntityInput;

  if (typeof params.author === "string" && params.author.trim().length > 0) {
    entity.last_message_author = params.author.trim();
  }

  await ops.store({
    entities: [entity],
    idempotency_key: params.idempotencyKey,
  });
}

function assertSubmitIssueReporterEnvironment(params: IssueCreateParams): void {
  const sha = typeof params.reporter_git_sha === "string" ? params.reporter_git_sha.trim() : "";
  const version =
    typeof params.reporter_app_version === "string" ? params.reporter_app_version.trim() : "";
  if (sha.length === 0 && version.length === 0) {
    throw new IssueValidationError({
      code: "ERR_REPORTER_ENVIRONMENT_REQUIRED",
      message:
        "submit_issue requires reporter environment: provide at least one of `reporter_git_sha` or `reporter_app_version`.",
      required_fields: [],
      acceptable_field_groups: [["reporter_git_sha"], ["reporter_app_version"]],
      hint:
        "Set `reporter_git_sha` to the SHA you reproduced against (`git rev-parse HEAD`) and/or `reporter_app_version` to the npm/CLI version. " +
        "Daemons / CI may also pass `reporter_git_ref`, `reporter_channel`, `reporter_ci_run_id`. " +
        "See docs/subsystems/issues.md `Reporter provenance` for the full set.",
    });
  }
}

/**
 * Create a new issue: optionally mirror to GitHub, then submit to Neotoma.
 */
export async function submitIssue(
  ops: Operations,
  params: IssueCreateParams
): Promise<SubmitIssueResult> {
  assertSubmitIssueReporterEnvironment(params);
  const config = await loadIssuesConfig();
  const now = new Date().toISOString();
  const visibility = params.visibility ?? "public";
  const toolingLabels = github.mergeNeotomaToolingIssueLabels(params.labels);

  // Public issues additionally pass through the redaction backstop. Even though
  // client agents are required to redact (see the REDACTION MUST clause in
  // docs/developer/mcp/instructions.md), we scan here so a submitter-side bug
  // cannot leak PII into the public GitHub mirror or the operator instance.
  // Private issues do not get scanned: operators may legitimately need raw
  // identifiers in private threads.
  if (visibility === "public") {
    const guarded = runRedactionGuard({ title: params.title, body: params.body, mode: "scan" });
    params = { ...params, title: guarded.title, body: guarded.body };
  }

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

  const authorAlias =
    typeof config.author_alias === "string" && config.author_alias.trim().length > 0
      ? config.author_alias.trim()
      : null;
  const author = githubIssue?.user?.login ?? authorAlias ?? "local";

  // Step 2: Submit to operator's Neotoma instance (canonical)
  let submittedToNeotoma = false;
  let remoteEntityId = "";
  let remoteConversationId = "";
  let remoteGuestAccessToken: string | undefined;
  const issuesTargetUrl = config.target_url?.trim() ?? "";
  let remoteSubmissionAttempted = false;
  let remoteSubmissionError: Error | null = null;

  // Derive once so remote submission and local shadow issue share the same local thread identity.
  const localId = issueNumber > 0 ? undefined : localIssueId(config.repo, params.title, now);

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
        submission_timestamp: now,
        ...(localId ? { local_issue_id: localId } : {}),
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
  const threadConversationId =
    issueNumber > 0
      ? githubIssueThreadConversationId(config.repo, issueNumber)
      : localIssueThreadConversationId(config.repo, localId ?? "");
  const bodyTurnKey =
    issueNumber > 0
      ? githubIssueBodyTurnKey(config.repo, issueNumber)
      : localIssueBodyTurnKey(config.repo, localId ?? "");
  const externalActor = buildExternalActorFromGithubIssue(githubIssue, { repository: config.repo });

  const entities: StoreInput["entities"] = [
    {
      entity_type: "issue",
      title: params.title,
      body: params.body,
      status: "open",
      labels: toolingLabels,
      github_number: issueNumber > 0 ? issueNumber : null,
      github_url: githubUrl,
      repo: config.repo,
      ...(localId ? { local_issue_id: localId } : {}),
      visibility,
      author,
      github_actor: externalActor
        ? { login: externalActor.login, id: externalActor.id, type: externalActor.type }
        : undefined,
      created_at: githubIssue?.created_at ?? now,
      closed_at: null,
      last_synced_at: submittedToNeotoma ? now : null,
      sync_pending: !submittedToNeotoma,
      remote_instance_url: config.target_url ?? null,
      remote_entity_id: remoteEntityId || null,
      remote_conversation_id: remoteConversationId || null,
      ...(remoteGuestAccessToken ? { guest_access_token: remoteGuestAccessToken } : {}),
      data_source: submittedToNeotoma
        ? `neotoma-issue ${config.target_url} ${now.slice(0, 10)}`
        : pushedToGithub
          ? `github issues api ${config.repo} #${issueNumber} ${now.slice(0, 10)}`
          : `local-create ${now.slice(0, 10)}`,
      ...reporterProvenanceFields(params),
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
      github_actor: externalActor
        ? { login: externalActor.login, id: externalActor.id, type: externalActor.type }
        : undefined,
      github_comment_id: issueNumber ? `issue-body-${issueNumber}` : `local-issue-body-${localId}`,
      turn_key: bodyTurnKey,
      created_at: githubIssue?.created_at ?? now,
    } as StoreEntityInput,
  ];

  const relationships: StoreInput["relationships"] = [
    { relationship_type: "REFERS_TO", source_index: 0, target_index: 1 },
    { relationship_type: "PART_OF", source_index: 2, target_index: 1 },
  ];

  const storeResult: StoreResult = (await runWithExternalActor(externalActor, () =>
    ops.store({
      entities,
      relationships,
      idempotency_key: `issue-create-${config.repo}-${issueNumber || Date.now()}`,
    })
  )) as StoreResult;

  const entityId = structuredEntityIdAt(storeResult, 0);
  const conversationId = structuredEntityIdAt(storeResult, 1);

  // Create REFERS_TO relationships from the issue entity to caller-provided entity IDs.
  const entityIdsToLink = Array.isArray(params.entity_ids_to_link)
    ? params.entity_ids_to_link.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0
      )
    : [];
  if (entityId && entityIdsToLink.length > 0) {
    const relationships: import("../../core/operations.js").CreateRelationshipInput[] =
      entityIdsToLink.map((targetId) => ({
        relationship_type: "REFERS_TO" as const,
        source_entity_id: entityId,
        target_entity_id: targetId.trim(),
      }));
    await ops.createRelationships({ relationships });
  }

  let remoteSubmissionErrorMessage: string | null = null;
  if (remoteSubmissionAttempted && !submittedToNeotoma) {
    const cause = remoteSubmissionError?.message ?? "unknown error";
    const githubHint =
      pushedToGithub && githubUrl ? ` A GitHub issue was created anyway: ${githubUrl}.` : "";
    remoteSubmissionErrorMessage =
      `Remote submission to ${issuesTargetUrl} failed: ${cause}.${githubHint} ` +
      "Issue stored locally with sync_pending=true for a later retry.";
  }

  const githubMirrorGuidance =
    visibility === "public" && !pushedToGithub
      ? buildGithubMirrorGuidance(githubMirrorFailure)
      : null;

  return {
    issue_number: issueNumber,
    github_url: githubUrl,
    entity_id: entityId,
    conversation_id: remoteConversationId || conversationId,
    remote_entity_id: remoteEntityId,
    pushed_to_github: pushedToGithub,
    submitted_to_neotoma: submittedToNeotoma,
    ...(remoteGuestAccessToken ? { guest_access_token: remoteGuestAccessToken } : {}),
    github_mirror_guidance: githubMirrorGuidance,
    remote_submission_error: remoteSubmissionErrorMessage,
  };
}

/**
 * Add a message to an existing issue: submit to remote Neotoma + optionally GitHub.
 *
 * Reporter environment is a soft requirement here: when the issue thread is
 * public and neither `reporter_git_sha` nor `reporter_app_version` is
 * provided, a single warning is emitted to stderr describing the gap. The
 * message still persists. Agents are expected to pass these on every
 * issue-thread message (see docs/developer/mcp/instructions.md).
 */
export async function addIssueMessage(
  ops: Operations,
  params: IssueMessageParams
): Promise<AddMessageResult> {
  const config = await loadIssuesConfig();
  const resolved = await resolveIssueRow(ops, params);
  const { issue_entity_id: issueEntityId, snapshot, githubNumber, localIssueId } = resolved;

  const visibilitySnapshot =
    typeof snapshot.visibility === "string" ? snapshot.visibility.trim() : "";
  const isPublicThread = visibilitySnapshot === "public" || githubNumber > 0;
  const messageEnv = reporterProvenanceFieldsForMessage(params);
  if (Object.keys(messageEnv).length === 0 && isPublicThread) {
    process.stderr.write(
      "[issues] add_issue_message: reporter environment missing on public thread message — set `reporter_git_sha` and/or `reporter_app_version` so debugging steps stay correlated with the build under test.\n"
    );
  }

  if (isPublicThread) {
    const guarded = runRedactionGuard({ title: "", body: params.body, mode: "scan" });
    params = { ...params, body: guarded.body };
  }

  let githubComment: GitHubComment | null = null;
  let pushedToGithub = false;
  let submittedToNeotoma = false;
  let remoteMessageEntityId = "";
  const issuesTargetUrl = config.target_url?.trim() ?? "";
  let remoteSubmissionAttempted = false;
  let remoteSubmissionError: Error | null = null;

  const threadConversationId =
    githubNumber > 0
      ? githubIssueThreadConversationId(config.repo, githubNumber)
      : localIssueId
        ? localIssueThreadConversationId(config.repo, localIssueId)
        : undefined;

  if (!threadConversationId) {
    throw new Error(
      "Issue is missing thread identity (no github_number and no local_issue_id); cannot append a message."
    );
  }

  const issueTitle =
    typeof snapshot.title === "string" && snapshot.title.trim().length > 0
      ? snapshot.title.trim()
      : "Issue";
  const conversationTitle = githubNumber > 0 ? `Issue #${githubNumber}` : `Issue: ${issueTitle}`;

  const guestForRemote =
    typeof params.guest_access_token === "string" && params.guest_access_token.trim().length > 0
      ? params.guest_access_token.trim()
      : typeof snapshot.guest_access_token === "string" &&
          snapshot.guest_access_token.trim().length > 0
        ? snapshot.guest_access_token.trim()
        : undefined;

  // Push to remote Neotoma instance (canonical)
  if (issuesTargetUrl) {
    remoteSubmissionAttempted = true;
    try {
      const remoteResult = await neotomaClient.addMessageToRemote({
        body: params.body,
        githubIssueNumber: githubNumber > 0 ? githubNumber : undefined,
        issue_entity_id: remoteIssueEntityIdForTarget(snapshot, issueEntityId),
        local_issue_id: localIssueId ?? undefined,
        issue_title: issueTitle,
        remote_conversation_id:
          typeof snapshot.remote_conversation_id === "string" &&
          snapshot.remote_conversation_id.trim().length > 0
            ? snapshot.remote_conversation_id.trim()
            : undefined,
        guest_access_token: guestForRemote,
      });
      submittedToNeotoma = true;
      remoteMessageEntityId = remoteResult.message_entity_id;
    } catch (err) {
      remoteSubmissionError = err instanceof Error ? err : new Error(String(err));
    }
  }

  // Optionally push to GitHub (for public issues with a valid issue number)
  if (githubNumber > 0) {
    try {
      githubComment = await github.addIssueComment(githubNumber, params.body);
      pushedToGithub = true;
    } catch {
      // GitHub push failed — local-only
    }
  }

  // For operator-backed threads, a successful canonical append is already durable.
  // Avoid creating a second local shadow message when there is no GitHub comment
  // carrying distinct metadata to preserve.
  if (submittedToNeotoma && !pushedToGithub) {
    const now = new Date().toISOString();
    // Keep the local shadow issue warm so requester-side local subscriptions
    // observe thread activity even when the canonical append happened remotely.
    await touchIssueThreadActivity(ops, {
      issueEntityId,
      messageAt: now,
      author: "remote",
      idempotencyKey: `issue-shadow-message-activity-${issueEntityId}-${remoteMessageEntityId || now}`,
    });

    // Create REFERS_TO relationships from the issue entity to caller-provided entity IDs.
    const entityIdsToLinkRemote = Array.isArray(params.entity_ids_to_link)
      ? params.entity_ids_to_link.filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0
        )
      : [];
    if (entityIdsToLinkRemote.length > 0) {
      const rels: import("../../core/operations.js").CreateRelationshipInput[] =
        entityIdsToLinkRemote.map((targetId) => ({
          relationship_type: "REFERS_TO" as const,
          source_entity_id: issueEntityId,
          target_entity_id: targetId.trim(),
        }));
      await ops.createRelationships({ relationships: rels });
    }

    return {
      github_comment_id: null,
      message_entity_id: remoteMessageEntityId,
      pushed_to_github: false,
      submitted_to_neotoma: true,
      remote_submission_error: null,
    };
  }

  const now = new Date().toISOString();
  const author = githubComment?.user?.login ?? "local";
  const commentActor = buildExternalActorFromGithubComment(githubComment, null, {
    repository: config.repo,
  });
  const commentKey = githubComment ? String(githubComment.id) : `local-${Date.now()}`;
  const turnKey =
    githubNumber > 0
      ? githubIssueCommentTurnKey(config.repo, githubNumber, commentKey)
      : localIssueId
        ? localIssueCommentTurnKey(config.repo, localIssueId, commentKey)
        : `local-fallback:${issueEntityId}:${commentKey}`;

  const entities: StoreInput["entities"] = [
    {
      entity_type: "conversation",
      title: conversationTitle,
      thread_kind: "multi_party",
      ...(threadConversationId ? { conversation_id: threadConversationId } : {}),
    } as StoreEntityInput,
    {
      entity_type: "conversation_message",
      role: "user",
      sender_kind: "agent",
      content: params.body,
      author,
      github_actor: commentActor
        ? { login: commentActor.login, id: commentActor.id, type: commentActor.type }
        : undefined,
      github_comment_id: commentKey,
      turn_key: turnKey,
      created_at: githubComment?.created_at ?? now,
      ...messageEnv,
    } as StoreEntityInput,
  ];

  const relationships: StoreInput["relationships"] = [
    { relationship_type: "PART_OF", source_index: 1, target_index: 0 },
  ];

  const storeResult: StoreResult = (await runWithExternalActor(commentActor, () =>
    ops.store({
      entities,
      relationships,
      idempotency_key: `issue-message-${issueEntityId}-${commentKey}`,
    })
  )) as StoreResult;

  const messageEntityId = structuredEntityIdAt(storeResult, 1);

  await runWithExternalActor(commentActor, () =>
    touchIssueThreadActivity(ops, {
      issueEntityId,
      messageAt: githubComment?.created_at ?? now,
      author,
      idempotencyKey: `issue-message-activity-${issueEntityId}-${commentKey}`,
    })
  );

  // Create REFERS_TO relationships from the issue entity to caller-provided entity IDs.
  const entityIdsToLink = Array.isArray(params.entity_ids_to_link)
    ? params.entity_ids_to_link.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0
      )
    : [];
  if (entityIdsToLink.length > 0) {
    const rels: import("../../core/operations.js").CreateRelationshipInput[] = entityIdsToLink.map(
      (targetId) => ({
        relationship_type: "REFERS_TO" as const,
        source_entity_id: issueEntityId,
        target_entity_id: targetId.trim(),
      })
    );
    await ops.createRelationships({ relationships: rels });
  }

  const remoteSubmissionErrorMessage =
    remoteSubmissionAttempted && !submittedToNeotoma
      ? `Remote issue message submission to ${issuesTargetUrl} failed: ${remoteSubmissionError?.message ?? "unknown error"}`
      : null;

  // No issues.target_url: this instance is the canonical operator store.
  if (!issuesTargetUrl) {
    submittedToNeotoma = true;
  }

  return {
    github_comment_id: githubComment ? String(githubComment.id) : null,
    message_entity_id: messageEntityId,
    pushed_to_github: pushedToGithub,
    submitted_to_neotoma: submittedToNeotoma,
    remote_submission_error: remoteSubmissionErrorMessage,
  };
}

async function fetchOperatorIssueMirrorIfApplicable(
  config: { repo: string; target_url: string | null },
  localIssueEntityId: string,
  snapshot: Record<string, unknown>,
  synced: boolean,
  guestAccessTokenOverride?: string | null
): Promise<GetIssueStatusResult | null> {
  const target = typeof config.target_url === "string" ? config.target_url.trim() : "";
  const remoteIdRaw = snapshot.remote_entity_id;
  const remoteId = typeof remoteIdRaw === "string" && remoteIdRaw.trim() ? remoteIdRaw.trim() : "";
  if (!target || !remoteId) {
    return null;
  }
  const tokenRaw =
    typeof guestAccessTokenOverride === "string" && guestAccessTokenOverride.trim().length > 0
      ? guestAccessTokenOverride.trim()
      : snapshot.guest_access_token;
  const token =
    typeof tokenRaw === "string" && tokenRaw.trim().length > 0 ? tokenRaw.trim() : undefined;
  const raw = await neotomaClient.fetchRemoteIssueThread({
    issueEntityId: remoteId,
    accessToken: token,
  });
  if (!raw) return null;
  const coerced = coerceRemoteIssueThreadPayload(raw, localIssueEntityId, config, synced);
  if (coerced) return coerced;
  throw new IssueTransportError({
    code: "ERR_REMOTE_ISSUE_READ_INVALID",
    status: 502,
    message:
      `Remote issue read-through returned an invalid thread payload for ${remoteId}; ` +
      "refusing incomplete local fallback for an operator-backed issue thread.",
    hint: "Check the operator /issues/status response and ensure it includes a valid messages array.",
    extra: {
      local_issue_entity_id: localIssueEntityId,
      remote_issue_entity_id: remoteId,
      target_url: target,
    },
  });
}

/**
 * Get the status of an issue, with optional sync-if-stale from GitHub and
 * read-through to the configured operator Neotoma when this row mirrors a
 * remote canonical issue (`remote_entity_id` + `issues.target_url`).
 */
export async function getIssueStatus(
  ops: Operations,
  params: IssueStatusParams
): Promise<GetIssueStatusResult> {
  const config = await loadIssuesConfig();

  const resolved = await resolveIssueRow(ops, params);
  let snapshot = resolved.snapshot as Record<string, unknown>;

  const lastSyncedAt = (snapshot.last_synced_at as string) ?? null;

  let synced = false;
  if (!params.skip_sync && resolved.githubNumber > 0) {
    synced = await syncIssueIfStale(ops, resolved.githubNumber, lastSyncedAt);
  }

  if (synced) {
    const raw = (await ops.retrieveEntitySnapshot({
      entity_id: resolved.issue_entity_id,
      format: "json",
    })) as { snapshot?: Record<string, unknown> } | null;
    snapshot = (raw?.snapshot ?? snapshot) as Record<string, unknown>;
  }

  const remoteFirst = await fetchOperatorIssueMirrorIfApplicable(
    config,
    resolved.issue_entity_id,
    snapshot,
    synced,
    params.guest_access_token
  );
  if (remoteFirst) {
    const local = await loadIssueStatusFromGraph(ops, resolved.issue_entity_id, config);
    return {
      ...remoteFirst,
      messages: mergeIssueStatusMessages(remoteFirst.messages, local.messages),
    };
  }

  const local = await loadIssueStatusFromGraph(ops, resolved.issue_entity_id, config);
  return { ...local, synced };
}
