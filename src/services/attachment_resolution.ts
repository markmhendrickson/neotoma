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
 * ## Caller contract (#2343)
 *
 * Entity snapshots go through this module or through `recomputeSnapshot`.
 * Never `.eq("entity_id", id)` → `observationReducer.computeSnapshot` for an
 * entity snapshot: that is the bypass #2343 removed from ten sites.
 *
 *   - **Persisting** a snapshot → `resolveOwnedObservations` (or
 *     `recomputeSnapshot`, which uses it). It returns `null` for a redirected
 *     id, which is the guard that stops a survivor's snapshot being written
 *     under a tombstone.
 *   - **Reading** an observation set → `resolveAttachedObservations`.
 *   - **Only the resolved id** (e.g. a point-in-time replay that applies its
 *     own time filter) → `resolveAttachmentTarget`.
 *   - **A raw SQLite handle** (the local adapter's insert path, the CLI's
 *     merge-import against an arbitrary database file) → the same rules over
 *     that handle, in `attachment_resolution_sqlite.ts`.
 *
 * **Resolution is not ownership.** Resolving answers "which observations
 * attach here?"; owning answers "whose snapshot row is this?". Conflating
 * them is how a resolution layer silently duplicates state.
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
 * ## Tenancy scope
 *
 * `userId` is the caller's existing scope, passed through unchanged. `null`
 * means "do not filter by user" and exists for the one legacy repair endpoint
 * whose observation fetch was already unscoped: this layer replaces WHICH
 * mechanism finds the rows, and must not quietly change WHICH rows are found.
 * New callers should pass a real user id.
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
  userId: string | null
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
    // `userId === null` means the caller reads across tenants (one legacy
    // repair endpoint does; see resolveAttachedObservations). Scoping is the
    // caller's existing contract, not something this layer may tighten:
    // narrowing a previously-unscoped fetch would change which observations
    // the reducer sees, which is the one thing this migration must not do.
    let entityQuery = db.from("entities").select("id, merged_to_entity_id").eq("id", current);
    if (userId !== null) entityQuery = entityQuery.eq("user_id", userId);
    const { data: row, error } = await entityQuery.single();

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
  userId: string | null
): Promise<AttachmentResolution> {
  const target = await resolveAttachmentTarget(entityId, userId);

  let obsQuery = db.from("observations").select("*").eq("entity_id", target.resolvedEntityId);
  if (userId !== null) obsQuery = obsQuery.eq("user_id", userId);
  // Ordered observed_at DESC because that is what every bypassing fetch this
  // seam replaces already did (#2343), and the reducer's tie-breaks read the
  // input order. Ordering here rather than at each call site keeps the set the
  // reducer sees identical no matter which path asked for it.
  const { data, error } = await obsQuery.order("observed_at", { ascending: false });

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

/**
 * The observations a given entity id may compute and PERSIST its own snapshot
 * from, under the declared resolution layer.
 *
 * This is `resolveAttachedObservations` plus the ownership question, and it
 * exists because those are two different questions that are easy to conflate
 * — conflating them is how a resolution layer silently duplicates state.
 *
 * Resolution answers *"which observations attach here?"*. Ownership answers
 * *"whose snapshot row is this?"*. A merge tombstone resolves to its survivor,
 * so a persisting caller that only resolved would compute the survivor's
 * snapshot and write it back **under the tombstone's id** — manufacturing a
 * duplicate snapshot the flat fetch never produced, because merge had already
 * moved the rows. `recomputeSnapshot` learned this the hard way in #2342; this
 * helper is that lesson made reusable so every persisting site inherits it
 * rather than re-deriving it (#2343).
 *
 * Returns `null` — meaning *do not upsert under this id* — when the id is
 * redirected. Returns an empty array only when the id genuinely owns no
 * observations; callers that distinguish "delete the stale row" from "skip"
 * should branch on that difference themselves.
 *
 * Read-only callers (e.g. a point-in-time replay, which asks what attached
 * *then* rather than who owns a row *now*) want `resolveAttachedObservations`
 * instead — ownership is not their question.
 */
export async function resolveOwnedObservations(
  entityId: string,
  userId: string | null
): Promise<Observation[] | null> {
  const attached = await resolveAttachedObservations(entityId, userId);
  if (attached.resolvedEntityId !== entityId) {
    logger.info(
      `[AttachmentResolution] ${entityId} resolves to ${attached.resolvedEntityId}; ` +
        `it owns no snapshot of its own, so no snapshot is written under it.`
    );
    return null;
  }
  return attached.observations;
}
