/**
 * Attachment Resolution Service (Domain Layer) — #2340
 *
 * Implements the approved contract:
 *
 *   A snapshot is a function of the observations *attached to* an entity,
 *   where attachment is resolved through a declared resolution layer, rather
 *   than of the observations whose `entity_id` column equals the entity.
 *
 * This module IS that declared resolution layer. It is the single seam every
 * snapshot fetch should go through, so that merge's union and split's
 * difference become two resolution rules over one mechanism rather than two
 * traversals with two cycle guards.
 *
 * ## What it resolves today
 *
 * Exactly one rule is live: the entity-grained merge alias
 * (`entities.merged_to_entity_id`). Asking for an entity that was merged away
 * resolves to its survivor, transitively. That is behaviour-preserving —
 * merge already rewrites `observations.entity_id` to the survivor, so the
 * resolved set is identical to today's flat fetch for every entity that is
 * not itself a tombstone. See `tests/integration/attachment_resolution_
 * equivalence.test.ts`, which pins that equivalence and passed unchanged
 * before and after this module landed.
 *
 * The observation-grained rules — split's difference-on-source and
 * union-on-target, and merge's append-based redirect — are deliberately NOT
 * here yet. They arrive with the `split_entity` / `merge_entities` redesigns
 * (#2329), which this module unblocks. The seam is built first, on purpose,
 * so those changes are a new resolution rule in one place rather than a new
 * fetch in a dozen.
 *
 * ## Guards
 *
 * Resolution is bounded by a cycle guard (a visited set) and a maximum depth.
 * Exceeding either is reported through `truncated` / `truncationReason`,
 * never silently truncated. This is deliberate: the two existing pointer-
 * follows in the codebase have neither guard —
 * `entity_queries.ts:getEntityWithProvenance` recurses into itself with no
 * visited set, and `cli/index.ts` resolves exactly one hop — so a declared
 * resolution layer that inherited those defects on day one would be no
 * improvement. `entity_merge.ts` blocks merging an already-merged entity on
 * either side, which prevents a two-cycle but does not prevent chains
 * (A→B, then C→B, then B→D builds depth), so the bound is load-bearing.
 *
 * The read path degrades rather than throws: a cycle or an over-deep chain
 * returns the best-resolved set with `truncated: true` and logs, because a
 * snapshot read that throws takes down every caller of `recomputeSnapshot`,
 * whereas one that reports the anomaly leaves the store readable while the
 * inconsistency is repaired.
 */

import { db } from "../db.js";
import { logger } from "../utils/logger.js";
import type { Observation } from "../reducers/observation_reducer.js";

/**
 * Maximum number of alias hops followed before resolution is declared
 * over-deep. Merge chains are pathological beyond a couple of hops; 32 is far
 * above anything legitimate while still bounding a runaway.
 */
export const MAX_ATTACHMENT_RESOLUTION_DEPTH = 32;

export type AttachmentTruncationReason = "cycle" | "depth";

export interface AttachmentResolution {
  /**
   * The entity the requested id resolves to after following the declared
   * resolution rules. Equals the requested id when nothing redirects.
   */
  resolvedEntityId: string;
  /** The observations attached to the resolved entity, for this user. */
  observations: Observation[];
  /** The full hop path, starting at the requested id. Useful for diagnosis. */
  path: string[];
  /** True when a guard stopped resolution before it reached a fixed point. */
  truncated: boolean;
  truncationReason?: AttachmentTruncationReason;
}

/**
 * Follow the entity-grained merge alias to a fixed point, bounded by a
 * visited set and a depth cap. Pure traversal — no observation reads.
 */
export async function resolveAttachmentTarget(
  entityId: string,
  userId: string
): Promise<{
  resolvedEntityId: string;
  path: string[];
  truncated: boolean;
  truncationReason?: AttachmentTruncationReason;
}> {
  const path: string[] = [entityId];
  const visited = new Set<string>([entityId]);
  let current = entityId;

  for (let depth = 0; depth < MAX_ATTACHMENT_RESOLUTION_DEPTH; depth++) {
    const { data: row, error } = await db
      .from("entities")
      .select("id, merged_to_entity_id")
      .eq("id", current)
      .eq("user_id", userId)
      .single();

    // A missing entity row is not an error here: observations can be fetched
    // for an id with no `entities` row (the CLI recompute path does exactly
    // that), and the flat fetch never consulted `entities` at all. Resolving
    // to the id as given preserves that behaviour.
    if (error || !row) {
      return { resolvedEntityId: current, path, truncated: false };
    }

    const next = (row as { merged_to_entity_id?: string | null }).merged_to_entity_id;
    if (!next) {
      return { resolvedEntityId: current, path, truncated: false };
    }

    if (visited.has(next)) {
      logger.warn(
        `[AttachmentResolution] cycle in merge aliases for entity ${entityId} ` +
          `(path length ${path.length}); resolution stopped at ${current}`
      );
      return {
        resolvedEntityId: current,
        path,
        truncated: true,
        truncationReason: "cycle",
      };
    }

    visited.add(next);
    path.push(next);
    current = next;
  }

  logger.warn(
    `[AttachmentResolution] merge-alias chain for entity ${entityId} exceeded ` +
      `MAX_ATTACHMENT_RESOLUTION_DEPTH=${MAX_ATTACHMENT_RESOLUTION_DEPTH}; ` +
      `resolution stopped at ${current}`
  );
  return {
    resolvedEntityId: current,
    path,
    truncated: true,
    truncationReason: "depth",
  };
}

/**
 * The observations attached to an entity, under the declared resolution
 * layer. This is what a snapshot is a function of.
 *
 * Behaviour-preserving today: for any entity that is not itself a merge
 * tombstone, the resolved id equals the requested id and the returned set is
 * exactly what `.eq("entity_id", entityId)` returns.
 */
export async function resolveAttachedObservations(
  entityId: string,
  userId: string
): Promise<AttachmentResolution> {
  const target = await resolveAttachmentTarget(entityId, userId);

  const { data, error } = await db
    .from("observations")
    .select("*")
    .eq("entity_id", target.resolvedEntityId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to fetch attached observations: ${error.message}`);
  }

  return {
    resolvedEntityId: target.resolvedEntityId,
    observations: (data ?? []) as Observation[],
    path: target.path,
    truncated: target.truncated,
    truncationReason: target.truncationReason,
  };
}
