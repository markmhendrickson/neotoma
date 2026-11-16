/**
 * Record-wide as-of reads for relationships and related entities (#2700).
 *
 * The single-entity read (`computeEntitySnapshotAtTime`) already answers "what
 * did the record say about this entity as of T" with two write-clock cutoffs:
 *
 * - `at`          upper bound on an observation's `observed_at`
 * - `at_ingested` upper bound on an observation's `created_at`
 *
 * When both are supplied both bounds apply (AND). This module extends the SAME
 * cutoff, with the SAME meaning, to the relationship graph so that related
 * reads can be answered "as recorded by T" consistently with the entity read:
 *
 * - An edge is visible as of T only through the relationship observations that
 *   pass the cutoff. An edge whose observations all postdate T does not exist
 *   as of T.
 * - Liveness is decided from the visible observations only, with the same rule
 *   used at write time (`isRelationshipLive`), so an edge deleted after T is
 *   live as of T and an edge restored after T is still deleted as of T.
 * - The edge snapshot (metadata) is replayed through the relationship reducer
 *   over the visible observations, never read from the materialized
 *   `relationship_snapshots` row (which always reflects "now").
 * - An entity exists as of T when its as-of snapshot has at least one visible
 *   observation, exactly the per-entity rule.
 * - ONE rule for both reads: an edge is visible as of T only if the edge AND both
 *   of its endpoints are visible as of T. `listRelationshipsAsOf` applies it, and
 *   the related-entities traversal is built on `listRelationshipsAsOf`, so the two
 *   reads cannot disagree about an edge at the same cutoff. This includes the
 *   anchor entity: asking about an entity that did not exist as of T returns no
 *   edges.
 * - The cutoff predicate and timestamp validator are the per-entity read's own
 *   (`isObservationVisibleAsOf`, `validateAsOfCutoffs` in
 *   entity_snapshot_at_time.ts); nothing here re-implements them.
 *
 * `at` is a write-time cutoff ("the state as recorded by T, by observed time"),
 * not event (valid) time; event time is out of scope (#2034).
 *
 * Cost: like the per-entity read, this replays observations rather than reading
 * a stored historical snapshot. The cutoff is applied in memory after fetching
 * every matching edge observation. Lists replay one entity per distinct endpoint
 * (memoized per call); traversal issues one list query per frontier node per side.
 */

import { db } from "../db.js";
import { relationshipReducer } from "../reducers/relationship_reducer.js";
import { isRelationshipLive } from "./relationships.js";
import {
  computeEntitySnapshotAtTime,
  hasAsOfCutoff,
  isObservationVisibleAsOf,
  validateAsOfCutoffs,
  type AsOfCutoffs,
  type EntitySnapshotAtTimeResult,
} from "./entity_snapshot_at_time.js";

export { hasAsOfCutoff, validateAsOfCutoffs };
export type { AsOfCutoffs };

/** The `as_of` echo attached to as-of responses, so a reader can see the cutoff applied. */
export function asOfEcho(cutoffs: AsOfCutoffs): { at: string | null; at_ingested: string | null } {
  return { at: cutoffs.at ?? null, at_ingested: cutoffs.at_ingested ?? null };
}

/**
 * Per-call memoized "does this entity exist as of T" check. An entity exists
 * when its as-of snapshot has at least one visible observation; an entity that
 * is absent, owned by someone else, or deleted at T does not.
 */
export function createAsOfEntityLookup(userId: string, cutoffs: AsOfCutoffs) {
  const memo = new Map<string, EntitySnapshotAtTimeResult | null>();
  const snapshotAsOf = async (id: string): Promise<EntitySnapshotAtTimeResult | null> => {
    if (!memo.has(id)) {
      memo.set(id, await computeEntitySnapshotAtTime(id, userId, cutoffs.at, cutoffs.at_ingested));
    }
    return memo.get(id) ?? null;
  };
  const existsAsOf = async (id: string): Promise<boolean> => {
    const snap = await snapshotAsOf(id);
    return Boolean(snap && snap.observation_count > 0);
  };
  return { snapshotAsOf, existsAsOf };
}

export type AsOfEntityLookup = ReturnType<typeof createAsOfEntityLookup>;

export interface RelationshipAsOfFilter {
  userId: string;
  entityId?: string;
  sourceEntityId?: string;
  targetEntityId?: string;
  /** Applies when `entityId` is the only anchor. */
  direction?: "inbound" | "outbound" | "incoming" | "outgoing" | "both";
  relationshipType?: string;
  relationshipTypes?: string[];
  includeDeleted?: boolean;
}

export interface RelationshipAsOfRow {
  relationship_key: string;
  relationship_type: string;
  source_entity_id: string;
  target_entity_id: string;
  schema_version: string;
  snapshot: Record<string, unknown>;
  computed_at: string;
  observation_count: number;
  last_observation_at: string;
  provenance: Record<string, string>;
  user_id: string;
  is_live: number;
}

/**
 * Reconstruct relationship snapshot rows as recorded by the cutoff: the edge must
 * have a visible observation, be live (unless `includeDeleted`), and both
 * endpoints must exist as of T. Returns the rows sorted like the live list reads: `last_observation_at` DESC, then
 * `relationship_key` ASC. Not paginated; callers slice.
 */
export async function listRelationshipsAsOf(
  filter: RelationshipAsOfFilter,
  cutoffs: AsOfCutoffs,
  lookup: AsOfEntityLookup = createAsOfEntityLookup(filter.userId, cutoffs)
): Promise<RelationshipAsOfRow[]> {
  validateAsOfCutoffs(cutoffs);

  let query = db.from("relationship_observations").select("*").eq("user_id", filter.userId);

  if (filter.sourceEntityId || filter.targetEntityId) {
    if (filter.sourceEntityId) query = query.eq("source_entity_id", filter.sourceEntityId);
    if (filter.targetEntityId) query = query.eq("target_entity_id", filter.targetEntityId);
  } else if (filter.entityId) {
    const dir = filter.direction ?? "both";
    if (dir === "outbound" || dir === "outgoing") {
      query = query.eq("source_entity_id", filter.entityId);
    } else if (dir === "inbound" || dir === "incoming") {
      query = query.eq("target_entity_id", filter.entityId);
    } else {
      query = query.or(
        `source_entity_id.eq.${filter.entityId},target_entity_id.eq.${filter.entityId}`
      );
    }
  }
  if (filter.relationshipType) {
    query = query.eq("relationship_type", filter.relationshipType);
  }
  if (filter.relationshipTypes && filter.relationshipTypes.length > 0) {
    query = query.in("relationship_type", filter.relationshipTypes);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to read relationship observations: ${error.message}`);
  }

  const byKey = new Map<string, any[]>();
  for (const obs of (data ?? []) as any[]) {
    if (!isObservationVisibleAsOf(obs, cutoffs)) continue;
    const list = byKey.get(obs.relationship_key);
    if (list) list.push(obs);
    else byKey.set(obs.relationship_key, [obs]);
  }

  const rows: RelationshipAsOfRow[] = [];
  for (const [key, observations] of byKey.entries()) {
    const live = isRelationshipLive(observations);
    if (!live && !filter.includeDeleted) continue;
    // One visibility rule: the edge and both endpoints must exist as of T.
    const first = observations[0];
    if (
      !(await lookup.existsAsOf(first.source_entity_id)) ||
      !(await lookup.existsAsOf(first.target_entity_id))
    ) {
      continue;
    }
    const snap = await relationshipReducer.computeSnapshot(key, observations);
    rows.push({
      relationship_key: snap.relationship_key,
      relationship_type: snap.relationship_type,
      source_entity_id: snap.source_entity_id,
      target_entity_id: snap.target_entity_id,
      schema_version: snap.schema_version,
      snapshot: snap.snapshot,
      computed_at: snap.computed_at,
      observation_count: snap.observation_count,
      last_observation_at: snap.last_observation_at,
      provenance: snap.provenance,
      user_id: snap.user_id,
      is_live: live ? 1 : 0,
    });
  }

  rows.sort((a, b) => {
    const aTime = new Date(a.last_observation_at || a.computed_at || 0).getTime();
    const bTime = new Date(b.last_observation_at || b.computed_at || 0).getTime();
    if (bTime !== aTime) return bTime - aTime;
    return a.relationship_key < b.relationship_key
      ? -1
      : a.relationship_key > b.relationship_key
        ? 1
        : 0;
  });
  return rows;
}

export interface RelatedEntitiesAsOfParams {
  entityId: string;
  userId: string;
  relationshipTypes?: string[];
  direction: "inbound" | "outbound" | "both";
  maxHops: number;
  includeEntities: boolean;
}

export interface RelatedEntitiesAsOfResult {
  relationships: RelationshipAsOfRow[];
  /** Entity rows (as in the live read) with an as-of `snapshot`. */
  entities: any[];
  hops_traversed: number;
}

/**
 * Breadth-first as-of traversal with the same shape and ordering as the live
 * `retrieve_related_entities` read. Differences are only the as-of ones: edges
 * come from `listRelationshipsAsOf` (so the edge and both endpoints must be
 * visible as of T) and entity snapshots are the as-of replays. `maxHops` is not
 * capped, as in the live read; each hop costs one list query per frontier node.
 */
export async function retrieveRelatedEntitiesAsOf(
  params: RelatedEntitiesAsOfParams,
  cutoffs: AsOfCutoffs
): Promise<RelatedEntitiesAsOfResult> {
  validateAsOfCutoffs(cutoffs);

  const lookup = createAsOfEntityLookup(params.userId, cutoffs);

  const visited = new Set<string>([params.entityId]);
  const relatedIds = new Set<string>();
  const relationships: RelationshipAsOfRow[] = [];
  let currentLevel = [params.entityId];
  let hopsTraversed = 0;

  for (let hop = 0; hop < params.maxHops; hop++) {
    const nextLevel: string[] = [];

    for (const currentId of currentLevel) {
      const sides: Array<"outbound" | "inbound"> =
        params.direction === "both" ? ["outbound", "inbound"] : [params.direction];
      for (const side of sides) {
        const rows = (
          await listRelationshipsAsOf(
            {
              userId: params.userId,
              entityId: currentId,
              direction: side,
              relationshipTypes: params.relationshipTypes,
            },
            cutoffs,
            lookup
          )
        ).sort((a, b) => (a.relationship_key < b.relationship_key ? -1 : 1));

        for (const rel of rows) {
          const otherId = side === "outbound" ? rel.target_entity_id : rel.source_entity_id;
          // Like the live read, an edge reached from both of its ends is listed
          // once per end it was reached from.
          relationships.push(rel);
          if (!visited.has(otherId)) {
            visited.add(otherId);
            relatedIds.add(otherId);
            nextLevel.push(otherId);
          }
        }
      }
    }

    hopsTraversed = hop + 1;
    if (nextLevel.length === 0) break;
    currentLevel = nextLevel;
  }

  let entities: any[] = [];
  if (params.includeEntities && relatedIds.size > 0) {
    const { data, error } = await db
      .from("entities")
      .select("*")
      .eq("user_id", params.userId)
      .order("canonical_name", { ascending: true })
      .order("id", { ascending: true })
      .in("id", Array.from(relatedIds));
    if (error) {
      throw new Error(`Failed to read related entities: ${error.message}`);
    }
    entities = [];
    for (const entity of (data ?? []) as any[]) {
      const snap = await lookup.snapshotAsOf(entity.id);
      if (!snap || snap.observation_count === 0) continue;
      entities.push({
        ...entity,
        snapshot: {
          entity_id: snap.entity_id,
          entity_type: snap.entity_type,
          schema_version: snap.schema_version,
          snapshot: snap.snapshot,
          provenance: snap.provenance,
          computed_at: snap.computed_at,
          observation_count: snap.observation_count,
          last_observation_at: snap.last_observation_at,
        },
      });
    }
  }

  return { relationships, entities, hops_traversed: hopsTraversed };
}
