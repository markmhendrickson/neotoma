/**
 * Inspector-driven bulk close / remove for `issue` entities.
 * Close/remove flows optionally call GitHub when `github_number` is linked.
 */

import { randomUUID } from "node:crypto";
import { db } from "../../db.js";
import { softDeleteEntity } from "../deletion.js";
import { closeIssue } from "./github_client.js";

export type IssueBulkItemResult = {
  entity_id: string;
  ok: boolean;
  github_closed?: boolean;
  error?: string;
};

async function loadOwnedIssueSnapshot(
  entityId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const { data: ent, error: entErr } = await db
    .from("entities")
    .select("id, entity_type")
    .eq("id", entityId)
    .eq("user_id", userId)
    .maybeSingle();
  if (entErr || !ent || ent.entity_type !== "issue") {
    return null;
  }

  const { data: row, error: snapErr } = await db
    .from("entity_snapshots")
    .select("snapshot")
    .eq("entity_id", entityId)
    .maybeSingle();
  if (snapErr || !row?.snapshot || typeof row.snapshot !== "object") {
    return null;
  }
  return row.snapshot as Record<string, unknown>;
}

function parseGithubNumber(snapshot: Record<string, unknown>): number {
  const n = snapshot.github_number;
  if (typeof n === "number" && Number.isFinite(n) && n > 0) return Math.floor(n);
  if (typeof n === "string" && /^\d+$/.test(n.trim())) {
    const v = parseInt(n.trim(), 10);
    return Number.isFinite(v) && v > 0 ? v : 0;
  }
  return 0;
}

function issueStorePayload(
  snapshot: Record<string, unknown>,
  patch: {
    status: string;
    closed_at: string | null;
    last_synced_at: string;
    data_source?: string;
  },
): Record<string, unknown> {
  const labels = Array.isArray(snapshot.labels) ? snapshot.labels : [];
  const gh = parseGithubNumber(snapshot);
  const repo = typeof snapshot.repo === "string" ? snapshot.repo : "";
  const now = patch.last_synced_at;
  return {
    entity_type: "issue",
    title: String(snapshot.title ?? ""),
    body: typeof snapshot.body === "string" ? snapshot.body : "",
    status: patch.status,
    labels,
    github_number: gh,
    github_url: typeof snapshot.github_url === "string" ? snapshot.github_url : "",
    repo,
    visibility: typeof snapshot.visibility === "string" ? snapshot.visibility : "public",
    author: typeof snapshot.author === "string" ? snapshot.author : "unknown",
    created_at: typeof snapshot.created_at === "string" ? snapshot.created_at : now,
    closed_at: patch.closed_at,
    last_synced_at: now,
    sync_pending: false,
    data_source:
      patch.data_source ??
      `inspector issues ${repo} #${gh || "local"} ${now.slice(0, 10)}`,
  };
}

async function persistIssueFromSnapshot(
  userId: string,
  snapshot: Record<string, unknown>,
  patch: {
    status: string;
    closed_at: string | null;
    last_synced_at: string;
    data_source?: string;
  },
): Promise<void> {
  const { storeStructuredForApi } = await import("../../actions.js");
  const entity = issueStorePayload(snapshot, patch);
  await storeStructuredForApi({
    userId,
    entities: [entity],
    sourcePriority: 250,
    observationSource: "human",
    idempotencyKey: `inspector-issue-bulk-${randomUUID()}`,
  });
}

/**
 * Mark issues closed locally; when linked to GitHub (`github_number` > 0), PATCH GitHub first.
 */
export async function bulkCloseIssues(
  userId: string,
  entityIds: string[],
): Promise<{ results: IssueBulkItemResult[] }> {
  const results: IssueBulkItemResult[] = [];
  for (const entityId of entityIds) {
    const snapshot = await loadOwnedIssueSnapshot(entityId, userId);
    if (!snapshot) {
      results.push({ entity_id: entityId, ok: false, error: "not_found_or_forbidden" });
      continue;
    }
    const status = String(snapshot.status ?? "open");
    if (status === "closed") {
      results.push({ entity_id: entityId, ok: true, github_closed: false });
      continue;
    }

    const ghNum = parseGithubNumber(snapshot);
    let githubClosed = false;
    if (ghNum > 0) {
      try {
        await closeIssue(ghNum);
        githubClosed = true;
      } catch (err) {
        results.push({
          entity_id: entityId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
    }

    const now = new Date().toISOString();
    const closedAt =
      typeof snapshot.closed_at === "string" && snapshot.closed_at.trim()
        ? snapshot.closed_at
        : now;
    try {
      await persistIssueFromSnapshot(userId, snapshot, {
        status: "closed",
        closed_at: closedAt,
        last_synced_at: now,
      });
      results.push({ entity_id: entityId, ok: true, github_closed: githubClosed });
    } catch (err) {
      results.push({
        entity_id: entityId,
        ok: false,
        github_closed: githubClosed,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { results };
}

/**
 * Soft-delete issue entities. When linked to GitHub and still open locally, closes GitHub first.
 */
export async function bulkRemoveIssues(
  userId: string,
  entityIds: string[],
): Promise<{ results: IssueBulkItemResult[] }> {
  const results: IssueBulkItemResult[] = [];
  for (const entityId of entityIds) {
    const snapshot = await loadOwnedIssueSnapshot(entityId, userId);
    if (!snapshot) {
      results.push({ entity_id: entityId, ok: false, error: "not_found_or_forbidden" });
      continue;
    }

    const status = String(snapshot.status ?? "open");
    const ghNum = parseGithubNumber(snapshot);
    let githubClosed = false;
    if (ghNum > 0 && status === "open") {
      try {
        await closeIssue(ghNum);
        githubClosed = true;
      } catch (err) {
        results.push({
          entity_id: entityId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
    }

    const del = await softDeleteEntity(entityId, "issue", userId, "inspector_bulk_remove");
    if (!del.success) {
      results.push({
        entity_id: entityId,
        ok: false,
        github_closed: githubClosed,
        error: del.error ?? "delete_failed",
      });
      continue;
    }
    results.push({ entity_id: entityId, ok: true, github_closed: githubClosed });
  }
  return { results };
}
