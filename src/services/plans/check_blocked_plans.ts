/**
 * check_blocked_plans — Detect plans that are blocked on closed GitHub issues.
 *
 * Queries all `plan` entities with status "awaiting_input" or "blocked",
 * finds linked `issue` entities via REFERS_TO relationships, checks whether
 * those issues have since been closed (via the locally-cached snapshot),
 * and returns a list of plans that are now unblockable.
 *
 * This gives agents and operators a recovery workflow: call
 * check_blocked_plans at session start (after get_session_identity), surface
 * any newly-unblockable plans to the user, and resume or re-drive the
 * blocked work.
 */

import type { Operations } from "../../core/operations.js";

export interface UnblockablePlan {
  /** Neotoma entity_id of the blocked plan. */
  entity_id: string;
  /** Title of the blocked plan. */
  title: string;
  /** GitHub issue number of the now-closed linked issue (0 when local-only). */
  linked_issue_number: number;
  /** Title of the linked issue. */
  linked_issue_title: string;
}

export interface CheckBlockedPlansResult {
  unblockable_plans: UnblockablePlan[];
}

const BLOCKED_STATUSES = new Set(["awaiting_input", "blocked"]);

function extractEntityId(entity: { id?: string; entity_id?: string }): string {
  if (typeof entity.entity_id === "string" && entity.entity_id.trim()) {
    return entity.entity_id.trim();
  }
  if (typeof entity.id === "string" && entity.id.trim()) {
    return entity.id.trim();
  }
  return "";
}

function snapshotOf(entity: { snapshot?: Record<string, unknown> }): Record<string, unknown> {
  const s = entity.snapshot ?? {};
  return s.snapshot && typeof s.snapshot === "object" ? (s.snapshot as Record<string, unknown>) : s;
}

/**
 * Check all blocked or awaiting-input plans and return those whose linked
 * GitHub issues are now closed.
 */
export async function checkBlockedPlans(ops: Operations): Promise<CheckBlockedPlansResult> {
  // 1. Retrieve all plan entities (status filter applied client-side since
  //    retrieve_entities does not support field-level predicate filtering).
  const plansResult = (await ops.retrieveEntities({
    entity_type: "plan",
    limit: 500,
    include_snapshots: true,
  })) as {
    entities?: Array<{
      id?: string;
      entity_id?: string;
      entity_type: string;
      snapshot?: Record<string, unknown>;
    }>;
  };

  const blockedPlans = (plansResult.entities ?? []).filter((entity) => {
    const snapshot = snapshotOf(entity);
    const status = typeof snapshot.status === "string" ? snapshot.status.trim() : "";
    return BLOCKED_STATUSES.has(status);
  });

  if (blockedPlans.length === 0) {
    return { unblockable_plans: [] };
  }

  const unblockable: UnblockablePlan[] = [];

  for (const plan of blockedPlans) {
    const planEntityId = extractEntityId(plan);
    if (!planEntityId) continue;

    const planSnapshot = snapshotOf(plan);
    const planTitle =
      typeof planSnapshot.title === "string" && planSnapshot.title.trim()
        ? planSnapshot.title.trim()
        : planEntityId;

    // 2. Find linked issue entities via outbound REFERS_TO relationships.
    const related = (await ops.retrieveRelatedEntities({
      entity_id: planEntityId,
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

    const linkedIssues = (related?.entities ?? []).filter((e) => e.entity_type === "issue");

    for (const issueEntity of linkedIssues) {
      const issueSnapshot = snapshotOf(issueEntity);

      // 3. Check whether the linked issue is now closed.
      const issueStatus =
        typeof issueSnapshot.status === "string" ? issueSnapshot.status.trim().toLowerCase() : "";
      const closedAt = issueSnapshot.closed_at;
      const isClosed =
        issueStatus === "closed" ||
        (typeof closedAt === "string" && closedAt.trim().length > 0) ||
        (closedAt !== null && closedAt !== undefined);

      if (!isClosed) continue;

      const githubNumber =
        typeof issueSnapshot.github_number === "number" &&
        Number.isFinite(issueSnapshot.github_number) &&
        issueSnapshot.github_number > 0
          ? Math.trunc(issueSnapshot.github_number)
          : typeof issueSnapshot.github_number === "string" &&
              /^\d+$/.test(issueSnapshot.github_number.trim())
            ? parseInt(issueSnapshot.github_number.trim(), 10)
            : 0;

      const issueTitle =
        typeof issueSnapshot.title === "string" && issueSnapshot.title.trim()
          ? issueSnapshot.title.trim()
          : `Issue #${githubNumber || extractEntityId(issueEntity)}`;

      unblockable.push({
        entity_id: planEntityId,
        title: planTitle,
        linked_issue_number: githubNumber,
        linked_issue_title: issueTitle,
      });

      // One closed issue is sufficient to declare the plan unblockable.
      break;
    }
  }

  return { unblockable_plans: unblockable };
}
