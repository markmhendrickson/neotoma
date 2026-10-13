/**
 * GitHub ↔ Neotoma issues sync (`syncIssuesFromGitHub`, `syncIssueIfStale`).
 *
 * Pull leg — GitHub → Neotoma:
 *   - issue entity (per GitHub issue)
 *   - conversation entity (one per issue, linked via REFERS_TO)
 *   - conversation_message entities (one per comment, PART_OF conversation);
 *     sender_kind is `user` here (GitHub mirror). MCP/CLI issue tooling uses `agent`.
 *
 * Push leg — Neotoma → GitHub (opt-in outside the configured default repo):
 *   - Finds local issue entities with `visibility: "public"` and no `github_number`
 *     (i.e. `sync_pending: true` or never pushed).
 *   - Runs `runRedactionGuard` (scan mode) on title+body before creating on GitHub.
 *   - Writes `github_number`, `github_url`, `sync_pending: false` back via `correct`.
 *
 * Target repo: `params.repo` (validated `owner/name`) overrides the configured default
 * (`NEOTOMA_ISSUES_REPO` / `issues.repo`) for one call. `params.push` defaults to true only
 * when the target IS the configured default; for any other repo it defaults to false so a
 * mirror of a different repo never creates GitHub issues from unrelated local records.
 *
 * Dry run: `params.commit === false` reads GitHub and local state, reports what would be
 * created / updated / pushed in `plan`, and performs no write (no `store`, no `correct`,
 * no GitHub create).
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
import { IssueValidationError } from "./errors.js";
import { assertRepoAllowed, type RepoAllowlistConfig } from "./repo_allowlist.js";
import type { GitHubIssue, GitHubComment, IssueSyncParams } from "./types.js";
import { MAX_QUERY_OFFSET } from "../entity_query_limits.js";
import {
  REPO_SLUG_FORMAT_MESSAGE,
  isValidRepoSlug,
  repoSlugsEqual,
} from "../../shared/repo_slug.js";

/**
 * One-time migration token folded into BOTH pull-leg sync idempotency keys
 * (`issue-sync-*` and `issue-comment-sync-*`).
 *
 * Before the deterministic-provenance fix, the issue store payload contained a
 * wall-clock `last_synced_at`/`data_source`, so existing `sources` rows under
 * the sync keys carry a content_hash that no longer matches the (now
 * deterministic) payload. Those rows can't be overwritten — the idempotency
 * check rejects the mismatched content — so already-synced issues were frozen
 * with ERR_IDEMPOTENCY_MISMATCH and never updated. The comment path re-stores
 * the issue entity too, so it strands the same way under its own key.
 *
 * Bumping this token gives every issue/comment a brand-new key, sidestepping
 * the stale rows without any destructive DB repair. The old rows simply go
 * inert. Bump it again only if a future payload-shape change strands keys the
 * same way.
 */
const SYNC_KEY_MIGRATION = "m2";

export interface SyncPlanIssue {
  github_number: number;
  title: string;
}

export interface SyncPlanPush {
  entity_id: string;
  title: string;
}

/** What a dry run (`commit: false`) reports instead of writing. */
export interface SyncPlan {
  /** GitHub issues with no local mirror for the target repo yet. */
  issues_to_create: SyncPlanIssue[];
  /** GitHub issues whose local mirror is behind GitHub's `updated_at`. */
  issues_to_update: SyncPlanIssue[];
  /** GitHub issues already mirrored at GitHub's current `updated_at`. */
  issues_unchanged: number;
  /** Comments that would be stored across created + updated + unchanged issues. */
  messages_to_sync: number;
  /** Local public issues with no github_number that the push leg would create on GitHub. */
  issues_to_push: SyncPlanPush[];
  /** Non-fatal caveats (for example a truncated local scan). */
  warnings: string[];
}

export interface SyncResult {
  /** Target GitHub repo (`owner/name`) this run mirrored. */
  repo: string;
  /** True when the run was a dry run (`commit: false`): nothing was written. */
  dry_run: boolean;
  /** Whether the push leg was enabled for this run (resolved from `push` + `repo`). */
  push_enabled: boolean;
  issues_synced: number;
  messages_synced: number;
  errors: string[];
  /** Number of local public issues successfully pushed to GitHub. */
  issues_pushed: number;
  /** Per-issue push errors (non-fatal — pull leg still runs). */
  push_errors: string[];
  /** Present only on a dry run. */
  plan?: SyncPlan;
}

/**
 * Thrown for a malformed `repo` before any GitHub request or local write. An
 * {@link IssueValidationError}, so REST answers 400 and MCP answers InvalidParams.
 */
export class InvalidSyncRepoError extends IssueValidationError {
  constructor(value: unknown) {
    super({
      code: "ERR_INVALID_REPO",
      message: `${REPO_SLUG_FORMAT_MESSAGE} Received: ${JSON.stringify(value)}.`,
      required_fields: ["repo"],
    });
    this.name = "InvalidSyncRepoError";
  }
}

/**
 * Resolve the effective target repo, push flag and dry-run flag for a sync call.
 *
 * A caller-supplied `repo` must be a well-formed slug AND be the configured repo or on the
 * allowlist (see `repo_allowlist.ts`). Both checks run here, before any GitHub request and
 * before any local read or write, and they apply equally to pull, push and dry run.
 * A repo that fails the allowlist is rejected with an error that does not disclose whether
 * it exists or is reachable with the server's credential.
 *
 * `push` default: true only for the configured default repo. Reasoning: the push leg
 * creates public GitHub issues from local records that were never bound to any repo, so
 * pointing a sync at a different repo must not export them there unless the caller says
 * so. The default repo keeps its historical push-on behaviour so existing scheduled
 * syncs do not silently stop pushing (a breaking change for no safety gain: the
 * default target is the one the operator already configured to receive them).
 */
export function resolveSyncTarget(
  params: IssueSyncParams | undefined,
  config: RepoAllowlistConfig
): { repo: string; isDefaultRepo: boolean; push: boolean; dryRun: boolean } {
  const defaultRepo = config.repo;
  let repo = defaultRepo;
  if (params?.repo !== undefined) {
    if (!isValidRepoSlug(params.repo)) throw new InvalidSyncRepoError(params.repo);
    assertRepoAllowed(params.repo, config);
    repo = params.repo;
  }
  const isDefaultRepo = repoSlugsEqual(repo, defaultRepo);
  return {
    repo,
    isDefaultRepo,
    push: params?.push ?? isDefaultRepo,
    dryRun: params?.commit === false,
  };
}

/**
 * Sync issues between Neotoma and GitHub.
 *
 * Push leg: local public issues with no github_number are sanitized and created on
 * GitHub, then updated locally with the returned number/url. On by default only for the
 * configured default repo; opt-in (`push: true`) for any other `repo`.
 *
 * Pull leg: GitHub issues and their comments are pulled into local entities.
 *
 * Both legs are idempotent. Push failures are non-fatal: the pull leg still runs.
 *
 * With `commit: false` neither leg writes; the result carries a `plan` instead.
 */
export async function syncIssuesFromGitHub(
  ops: Operations,
  params?: IssueSyncParams
): Promise<SyncResult> {
  const config = await loadIssuesConfig();
  const target = resolveSyncTarget(params, config);
  const { repo, dryRun } = target;
  const ghOpts = { repo };

  const result: SyncResult = {
    repo,
    dry_run: dryRun,
    push_enabled: target.push,
    issues_synced: 0,
    messages_synced: 0,
    errors: [],
    issues_pushed: 0,
    push_errors: [],
  };
  const plan: SyncPlan | undefined = dryRun
    ? {
        issues_to_create: [],
        issues_to_update: [],
        issues_unchanged: 0,
        messages_to_sync: 0,
        issues_to_push: [],
        warnings: [],
      }
    : undefined;
  if (plan) result.plan = plan;

  // Local issue entities: needed by the push leg and, in a dry run, to tell created from
  // updated. Loaded once per run.
  let localIssues: Array<Record<string, unknown>> | undefined;
  if (target.push || dryRun) {
    const loaded = await loadLocalIssues(ops);
    if (loaded.error) {
      result.push_errors.push(
        `Failed to retrieve local issues${target.push ? " for push" : ""}: ${loaded.error}`
      );
    }
    if (loaded.truncated) {
      plan?.warnings.push(
        "Local issue scan was truncated at the server paging limit; created/updated counts may be overstated."
      );
    }
    localIssues = loaded.entities;
  }

  // Push leg: local public issues that have never been mirrored to GitHub.
  if (target.push && localIssues) {
    await pushUnsyncedIssues(ops, target, localIssues, result, plan);
  }

  // Pull leg: GitHub → Neotoma.
  let issues: GitHubIssue[];
  try {
    issues = await github.listIssues(
      {
        state: params?.state ?? "all",
        labels: params?.labels,
        since: params?.since,
        per_page: 100,
      },
      ghOpts
    );
  } catch (err) {
    result.errors.push(`Failed to list issues: ${(err as Error).message}`);
    return result;
  }

  const localByNumber = plan ? indexLocalIssuesByNumber(localIssues ?? [], target) : undefined;

  for (const issue of issues) {
    try {
      if (plan && localByNumber) {
        const local = localByNumber.get(issue.number);
        const entry = { github_number: issue.number, title: issue.title };
        if (!local) plan.issues_to_create.push(entry);
        else if (local.last_synced_at !== issue.updated_at) plan.issues_to_update.push(entry);
        else plan.issues_unchanged++;
        const comments = await github.listIssueComments(issue.number, undefined, ghOpts);
        plan.messages_to_sync += comments.length;
        continue;
      }

      await syncSingleIssue(ops, issue, repo);
      result.issues_synced++;

      const comments = await github.listIssueComments(issue.number, undefined, ghOpts);
      for (const comment of comments) {
        await syncSingleComment(ops, comment, issue, repo);
        result.messages_synced++;
      }
    } catch (err) {
      result.errors.push(`Issue #${issue.number}: ${(err as Error).message}`);
    }
  }

  return result;
}

const LOCAL_ISSUE_PAGE_SIZE = 500;

/**
 * Load local `issue` entities (with snapshots), paging up to the server offset ceiling.
 * `truncated` is true when the last page was still full at that ceiling.
 */
async function loadLocalIssues(
  ops: Operations
): Promise<{ entities: Array<Record<string, unknown>>; truncated: boolean; error?: string }> {
  const entities: Array<Record<string, unknown>> = [];
  let offset = 0;
  // We request a generous page and filter client-side because retrieveEntities does not
  // support compound snapshot field filters.
  for (;;) {
    let raw: unknown;
    try {
      raw = await ops.retrieveEntities({
        entity_type: "issue",
        limit: LOCAL_ISSUE_PAGE_SIZE,
        include_snapshots: true,
        ...(offset > 0 ? { offset } : {}),
      });
    } catch (err) {
      return { entities, truncated: false, error: (err as Error).message };
    }
    const page = extractEntitiesArray(raw);
    entities.push(...page);
    if (page.length < LOCAL_ISSUE_PAGE_SIZE) return { entities, truncated: false };
    offset += LOCAL_ISSUE_PAGE_SIZE;
    if (offset > MAX_QUERY_OFFSET) return { entities, truncated: true };
  }
}

/**
 * Index local mirrored issues (those with a github_number) for the target repo. A local
 * issue with no `repo` is only treated as belonging to the configured default repo.
 */
function indexLocalIssuesByNumber(
  entities: Array<Record<string, unknown>>,
  target: { repo: string; isDefaultRepo: boolean }
): Map<number, { last_synced_at: unknown }> {
  const out = new Map<number, { last_synced_at: unknown }>();
  for (const entity of entities) {
    const snap = entity.snapshot as Record<string, unknown> | undefined;
    if (!snap) continue;
    const num = Number(snap["github_number"]);
    if (!Number.isInteger(num) || num <= 0) continue;
    const snapRepo = snap["repo"];
    if (typeof snapRepo === "string" && snapRepo.length > 0) {
      if (!repoSlugsEqual(snapRepo, target.repo)) continue;
    } else if (!target.isDefaultRepo) {
      continue;
    }
    out.set(num, { last_synced_at: snap["last_synced_at"] });
  }
  return out;
}

/**
 * Find local public issues with no github_number and push each to GitHub.
 * Redaction guard runs in scan mode before each create — PII is stripped, not blocked.
 * Updates the local entity with the returned github_number, github_url, sync_pending: false
 * (and `repo` when the target is not the configured default, so the record is bound to the
 * repo it was exported to).
 *
 * In a dry run (`plan` set) nothing is created or written; candidates are listed in
 * `plan.issues_to_push`.
 *
 * Errors per issue are accumulated in result.push_errors and do not abort other issues.
 */
async function pushUnsyncedIssues(
  ops: Operations,
  target: { repo: string; isDefaultRepo: boolean },
  entities: Array<Record<string, unknown>>,
  result: SyncResult,
  plan: SyncPlan | undefined
): Promise<void> {
  const repo = target.repo;
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

    if (plan) {
      plan.issues_to_push.push({ entity_id: entityId, title: rawTitle });
      continue;
    }

    // Strip PII from title and body before sending to GitHub.
    const guarded = runRedactionGuard({ title: rawTitle, body: rawBody, mode: "scan" });

    let created: GitHubIssue;
    try {
      created = await github.createIssue(
        {
          title: guarded.title,
          body: guarded.body,
          labels,
        },
        { repo }
      );
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
      // A github_number is only meaningful with its repo. For the configured default
      // repo the pull leg already binds it; for any other target bind it explicitly.
      ...(target.isDefaultRepo ? [] : [{ field: "repo", value: repo }]),
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
  // Derive sync-provenance fields from the issue's own updated_at, NOT wall-clock
  // `now`. The idempotency check hashes the full entity payload; a wall-clock
  // last_synced_at/data_source changes every run, so an unchanged issue re-synced
  // under the same (updated_at-keyed) idempotency_key tripped
  // ERR_IDEMPOTENCY_MISMATCH and never synced. Deterministic provenance keeps the
  // payload byte-stable across runs so the idempotent no-op actually holds.
  const syncedAt = issue.updated_at;
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
      last_synced_at: syncedAt,
      sync_pending: false,
      data_source: `github issues api ${repo} #${issue.number} ${syncedAt.slice(0, 10)}`,
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
      idempotency_key: `issue-sync-${repo}-${issue.number}-${issue.updated_at}-${SYNC_KEY_MIGRATION}`,
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
  // Deterministic provenance from the issue's updated_at (see syncSingleIssue) —
  // keeps the re-stored issue entity payload byte-stable across runs so the
  // idempotency content-hash holds.
  const syncedAt = issue.updated_at;
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
      last_synced_at: syncedAt,
      sync_pending: false,
      data_source: `github issues api ${repo} #${issue.number} ${syncedAt.slice(0, 10)}`,
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
      // Include the issue's updated_at: this store re-stores the issue entity
      // (whose deterministic payload tracks issue.updated_at), so when the issue
      // changes the comment store must re-key too — otherwise the new issue
      // content collides with the stale row under a comment.id-only key and
      // trips ERR_IDEMPOTENCY_MISMATCH. (Observed accumulating once the swarm
      // began bumping issue.updated_at on synced issues.)
      idempotency_key: `issue-comment-sync-${repo}-${issue.number}-${comment.id}-${issue.updated_at}-${SYNC_KEY_MIGRATION}`,
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
 *
 * `repo` is the repository the issue lives in (the mirrored entity's own `repo`); it
 * defaults to the configured repo. It must be the configured repo or on the allowlist,
 * checked before any GitHub request, so a refresh can never read from (or store under) a
 * repo the operator has not approved.
 */
export async function syncIssueIfStale(
  ops: Operations,
  issueNumber: number,
  lastSyncedAt: string | null,
  repo?: string
): Promise<boolean> {
  const stale = await isSyncStale(lastSyncedAt);
  if (!stale) return false;

  const config = await loadIssuesConfig();
  const targetRepo = repo ?? config.repo;
  assertRepoAllowed(targetRepo, config);
  const ghOpts = { repo: targetRepo };

  const issue = await github.getIssue(issueNumber, ghOpts);
  await syncSingleIssue(ops, issue, targetRepo);

  const comments = await github.listIssueComments(issueNumber, undefined, ghOpts);
  for (const comment of comments) {
    await syncSingleComment(ops, comment, issue, targetRepo);
  }

  return true;
}
