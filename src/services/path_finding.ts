/**
 * Warm-path primitives: "how do we reach X?" (#1969).
 *
 * Two read-only graph queries over `relationship_snapshots`:
 *
 *  - {@link findPaths} — resolve a target *company* or *fund* by free-text
 *    name, then return the network paths that reach it. This is the warm-intro
 *    question ("who can introduce us to Acme?") answered in ONE call, and it
 *    returns the PATH (the ordered chain of entities and edges traversed), not
 *    just the endpoints. That is the difference from
 *    `query_contacts_at_company`, which returns only the directly-linked
 *    contacts and no chain.
 *
 *  - {@link findShortestPath} — generic shortest path between two known
 *    entity ids.
 *
 * ## Why a dedicated BFS instead of calling retrieve_related_entities
 *
 * `retrieve_related_entities` (server.ts) walks the same tables with the same
 * visited-set cycle protection, but it discards the predecessor information as
 * it goes — it accumulates a flat `relatedEntityIds` set, so a path cannot be
 * reconstructed from its output. This module keeps the identical traversal
 * shape (level-synchronous BFS, visited set, per-hop frontier) and adds one
 * thing: a `predecessor` map recording which edge first reached each node.
 * Paths are then read back by walking predecessors from the target. The
 * traversal contract (cycle safety, tenant scoping, liveness filtering) is
 * deliberately the same so the two agree on reachability.
 *
 * ## Performance posture (#1945)
 *
 * This repo runs a synchronous DB driver on the main thread, so an unbounded
 * graph walk would block the event loop. Every dimension of this traversal is
 * bounded and the bounds are enforced, not advisory:
 *
 *  - `max_hops` is clamped to {@link MAX_HOPS_CEILING}.
 *  - the per-hop frontier is capped at {@link MAX_FRONTIER_SIZE}; growth beyond
 *    it truncates the frontier and sets `truncated: true` on the result.
 *  - total nodes expanded is capped at {@link MAX_NODES_EXPANDED}.
 *  - `max_paths` bounds the number of reconstructed paths returned.
 *  - each node is expanded at most once (visited set), which is what makes the
 *    walk O(V+E)-bounded and cycle-safe.
 *
 * Because BFS visits each node once via its FIRST discovering edge, the paths
 * returned are shortest-by-hop-count; this is a reachability/warm-intro
 * primitive, not an all-paths enumerator.
 *
 * Read-only: never creates entities or edges (mirrors company_query.ts and the
 * State Layer rule against inference on a read path — see
 * docs/foundation/philosophy.md #15).
 */

import { db } from "../db.js";
import { logger } from "../utils/logger.js";
import type { RelationshipType } from "./relationships.js";

/** Hard ceiling on traversal depth, regardless of requested max_hops (#1945). */
export const MAX_HOPS_CEILING = 5;
/** Hard ceiling on nodes expanded across the whole traversal (#1945). */
export const MAX_NODES_EXPANDED = 2000;
/** Hard ceiling on the size of a single BFS frontier (#1945). */
export const MAX_FRONTIER_SIZE = 500;
/** Default number of reconstructed paths returned. */
export const DEFAULT_MAX_PATHS = 25;
/** Hard ceiling on reconstructed paths returned. */
export const MAX_PATHS_CEILING = 200;

/**
 * Relationship types traversed by default when reaching a **company**.
 *
 * `works_at` is the load-bearing edge (contact -> company, auto-linked from a
 * contact's `organization` field, see schema_reference_linking.ts).
 * `knows` (#1969) extends reach one person-hop further: A knows B, B works_at
 * Acme. The remaining org-structure types let a path terminate at a parent or
 * acquiring company.
 */
export const DEFAULT_COMPANY_EDGE_TYPES: RelationshipType[] = [
  "works_at",
  "knows",
  "member_of",
  "reports_to",
  "manages",
  "owns",
  "subsidiary_of",
  "acquired_by",
  "partner_of",
];

/**
 * Relationship types traversed by default when reaching a **fund**.
 *
 * NOTE (#1969): `invested_in` / `funded_by` exist in the type enum but NOTHING
 * currently populates them — no schema `reference_fields` rule auto-links an
 * investor, and no importer writes them. Until a writer exists, a fund target
 * will legitimately return zero paths on real data even though the traversal
 * is correct. Tests cover this path with explicitly-created edges.
 */
export const DEFAULT_FUND_EDGE_TYPES: RelationshipType[] = [
  "invested_in",
  "funded_by",
  "works_at",
  "knows",
  "member_of",
  "manages",
  "partner_of",
];

/** One edge traversed on a path. */
export interface PathEdge {
  relationship_type: string;
  /** The edge as stored: source -> target. */
  source_entity_id: string;
  target_entity_id: string;
  relationship_key: string;
  /**
   * Orientation of this edge **relative to the path as presented**, i.e. as
   * you read `nodes[i] -> nodes[i + 1]`.
   *
   *  - `outbound`: the presented step runs along the stored edge, so
   *    `source_entity_id === nodes[i]`  ("Ana works_at Acme").
   *  - `inbound`: the presented step runs against the stored edge, so
   *    `source_entity_id === nodes[i + 1]` ("Acme <- employs <- Ana").
   *
   * Traversal is undirected (a warm path is a human chain), so this field is
   * what lets a caller render the chain correctly without re-reading the edge
   * table. `source_entity_id` / `target_entity_id` always hold the stored
   * orientation verbatim and are never rewritten.
   */
  traversed: "outbound" | "inbound";
  last_observation_at?: string;
}

/** One node on a path. */
export interface PathNode {
  entity_id: string;
  canonical_name?: string;
  entity_type?: string;
}

/** A single reachability path from an origin to the target. */
export interface GraphPath {
  /** Ordered nodes, origin first, target last. */
  nodes: PathNode[];
  /** Ordered edges; `edges[i]` connects `nodes[i]` to `nodes[i + 1]`. */
  edges: PathEdge[];
  /** Number of edges traversed (nodes.length - 1). */
  hops: number;
}

export interface TraversalBounds {
  max_hops: number;
  max_nodes_expanded: number;
  max_frontier_size: number;
  max_paths: number;
}

export interface TraversalStats {
  nodes_expanded: number;
  hops_traversed: number;
  /** True when a bound cut the traversal short, so results may be incomplete. */
  truncated: boolean;
  /** Which bound(s) fired. */
  truncation_reasons: string[];
}

interface RelationshipSnapshotRow {
  relationship_key: string;
  relationship_type: string;
  source_entity_id: string;
  target_entity_id: string;
  last_observation_at?: string;
}

/** Predecessor bookkeeping: which edge first reached a node, and from where. */
interface Predecessor {
  from: string;
  edge: PathEdge;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Level-synchronous BFS from `originIds`, recording predecessors so paths can
 * be reconstructed. Mirrors the traversal in `retrieve_related_entities`
 * (visited set for cycle protection, per-hop frontier, tenant-scoped queries,
 * `is_live = 1` to exclude soft-deleted edges) and additionally stops as soon
 * as `stopAt` is reached, since BFS guarantees the first arrival is shortest.
 */
async function bfsWithPredecessors(params: {
  originIds: string[];
  userId: string;
  relationshipTypes: RelationshipType[] | undefined;
  bounds: TraversalBounds;
  /** Stop expanding once this entity is discovered. */
  stopAt?: string;
}): Promise<{
  predecessor: Map<string, Predecessor>;
  visited: Set<string>;
  stats: TraversalStats;
}> {
  const { originIds, userId, relationshipTypes, bounds, stopAt } = params;

  const predecessor = new Map<string, Predecessor>();
  const visited = new Set<string>(originIds);
  const stats: TraversalStats = {
    nodes_expanded: 0,
    hops_traversed: 0,
    truncated: false,
    truncation_reasons: [],
  };

  const markTruncated = (reason: string): void => {
    stats.truncated = true;
    if (!stats.truncation_reasons.includes(reason)) {
      stats.truncation_reasons.push(reason);
    }
  };

  let frontier = originIds.slice(0, bounds.max_frontier_size);
  if (originIds.length > bounds.max_frontier_size) {
    markTruncated("max_frontier_size");
  }

  if (stopAt && visited.has(stopAt)) {
    return { predecessor, visited, stats };
  }

  for (let hop = 0; hop < bounds.max_hops; hop++) {
    const nextFrontier: string[] = [];
    let reachedStop = false;

    for (const entityId of frontier) {
      if (stats.nodes_expanded >= bounds.max_nodes_expanded) {
        markTruncated("max_nodes_expanded");
        break;
      }
      stats.nodes_expanded++;

      // Both stored orientations are followed: a warm path is a human chain,
      // so `A knows B` and `B knows A` are equally usable for reachability.
      // `traversed` on each PathEdge preserves the stored direction.
      for (const orientation of ["outbound", "inbound"] as const) {
        const column = orientation === "outbound" ? "source_entity_id" : "target_entity_id";
        const otherColumn = orientation === "outbound" ? "target_entity_id" : "source_entity_id";

        let query = db
          .from("relationship_snapshots")
          .select(
            "relationship_key, relationship_type, source_entity_id, target_entity_id, last_observation_at"
          )
          .eq(column, entityId)
          .eq("user_id", userId)
          // Exclude soft-deleted edges at the DB, matching the read-path
          // predicate used by list_relationships (#1570).
          .eq("is_live", 1)
          // Deterministic expansion order, so which edge "first reaches" a
          // node (and therefore the path returned) is stable across runs.
          .order("relationship_key", { ascending: true });

        if (relationshipTypes && relationshipTypes.length > 0) {
          query = query.in("relationship_type", relationshipTypes);
        }

        const { data, error } = await query;
        if (error) {
          logger.warn(`[PATH_FINDING] relationship scan failed: ${error.message}`);
          continue;
        }

        for (const row of (data ?? []) as RelationshipSnapshotRow[]) {
          const neighborId = (row as unknown as Record<string, string>)[otherColumn];
          if (!neighborId || visited.has(neighborId)) continue;

          visited.add(neighborId);
          predecessor.set(neighborId, {
            from: entityId,
            edge: {
              relationship_type: row.relationship_type,
              source_entity_id: row.source_entity_id,
              target_entity_id: row.target_entity_id,
              relationship_key: row.relationship_key,
              traversed: orientation,
              last_observation_at: row.last_observation_at,
            },
          });

          if (stopAt && neighborId === stopAt) {
            reachedStop = true;
            break;
          }

          if (nextFrontier.length < bounds.max_frontier_size) {
            nextFrontier.push(neighborId);
          } else {
            markTruncated("max_frontier_size");
          }
        }
        if (reachedStop) break;
      }
      if (reachedStop) break;
      if (stats.nodes_expanded >= bounds.max_nodes_expanded) break;
    }

    stats.hops_traversed = hop + 1;

    if (reachedStop) break;
    if (stats.nodes_expanded >= bounds.max_nodes_expanded) {
      markTruncated("max_nodes_expanded");
      break;
    }
    if (nextFrontier.length === 0) break;

    // The frontier was non-empty but we are out of hops: reachable nodes may
    // exist beyond max_hops, so report the traversal as depth-bounded.
    if (hop === bounds.max_hops - 1) {
      markTruncated("max_hops");
    }

    frontier = nextFrontier;
  }

  return { predecessor, visited, stats };
}

/**
 * Walk the predecessor chain back from `nodeId` to an origin, producing an
 * origin-first path. Returns null when the chain is broken (should not happen)
 * or exceeds `maxHops` links.
 */
function reconstructPath(
  nodeId: string,
  predecessor: Map<string, Predecessor>,
  maxHops: number
): { nodeIds: string[]; edges: PathEdge[] } | null {
  const nodeIds: string[] = [nodeId];
  const edges: PathEdge[] = [];

  let cursor = nodeId;
  // Bounded by maxHops + 1: predecessor links form a tree rooted at the
  // origins, so this terminates, but the cap makes that structural rather
  // than assumed.
  for (let step = 0; step <= maxHops; step++) {
    const pred = predecessor.get(cursor);
    if (!pred) {
      // Reached an origin (origins have no predecessor entry).
      nodeIds.reverse();
      edges.reverse();
      return { nodeIds, edges };
    }
    edges.push(pred.edge);
    nodeIds.push(pred.from);
    cursor = pred.from;
  }
  return null;
}

/** Hydrate canonical_name/entity_type for the nodes appearing on returned paths. */
async function hydrateNodes(entityIds: string[], userId: string): Promise<Map<string, PathNode>> {
  const byId = new Map<string, PathNode>();
  if (entityIds.length === 0) return byId;

  const { data, error } = await db
    .from("entities")
    .select("id, canonical_name, entity_type")
    .eq("user_id", userId)
    .in("id", entityIds);

  if (error) {
    logger.warn(`[PATH_FINDING] node hydration failed: ${error.message}`);
    return byId;
  }

  for (const row of (data ?? []) as Array<{
    id: string;
    canonical_name: string | null;
    entity_type: string | null;
  }>) {
    byId.set(row.id, {
      entity_id: row.id,
      canonical_name: row.canonical_name ?? undefined,
      entity_type: row.entity_type ?? undefined,
    });
  }
  return byId;
}

export type PathTargetKind = "company" | "fund";

export interface FindPathsResult {
  /** The target name as given by the caller, unmodified. */
  queried_name: string;
  target_kind: PathTargetKind;
  /** Resolved target entity, or null when no exact/fuzzy match exists. */
  target: {
    entity_id: string;
    canonical_name: string;
    basis: "exact_normalized" | "fuzzy_match";
    fuzzy_score?: number;
  } | null;
  /**
   * Paths from the caller's network to the target, shortest-first. Each path
   * is origin-first and target-last.
   */
  paths: GraphPath[];
  /** Total paths found before `max_paths` truncation. */
  total_paths: number;
  bounds: TraversalBounds;
  stats: TraversalStats;
  /**
   * Set when the target kind has no populating writer yet (fund targets,
   * #1969) so an empty result is not mistaken for "no connections".
   */
  notes?: string[];
}

/**
 * Resolve a target entity by free-text name for the given entity type,
 * read-only (never creates). Reuses the company resolver for `company`, and
 * applies the same exact-then-fuzzy order for `fund`.
 */
async function resolveTargetReadOnly(params: {
  name: string;
  entityType: string;
  userId: string;
}): Promise<FindPathsResult["target"]> {
  const { name, entityType, userId } = params;

  const [{ stringSimilarity }, entityResolution, { COMPANY_FUZZY_MATCH_THRESHOLD }] =
    await Promise.all([
      import("./duplicate_detection.js"),
      import("./entity_resolution.js"),
      import("./company_resolution.js"),
    ]);
  const {
    entityIdTenantSalt,
    formatCanonicalNameForStorage,
    generateEntityId,
    normalizeEntityValue,
  } = entityResolution;

  const canonicalNameForStorage = formatCanonicalNameForStorage(entityType, name);
  const exactEntityId = generateEntityId(
    entityType,
    canonicalNameForStorage,
    entityIdTenantSalt(userId)
  );

  const { data: exactRow, error: exactErr } = await db
    .from("entities")
    .select("id, canonical_name, merged_to_entity_id")
    .eq("id", exactEntityId)
    .maybeSingle();

  if (!exactErr && exactRow && !exactRow.merged_to_entity_id) {
    return {
      entity_id: exactRow.id,
      canonical_name: exactRow.canonical_name,
      basis: "exact_normalized",
    };
  }

  const normalizedInput = normalizeEntityValue(entityType, name);
  if (!normalizedInput) return null;

  const { data, error } = await db
    .from("entities")
    .select("id, canonical_name, merged_to_entity_id")
    .eq("entity_type", entityType)
    .eq("user_id", userId)
    .is("merged_to_entity_id", null)
    .limit(2000);

  if (error) {
    logger.warn(`[PATH_FINDING] fuzzy target scan failed: ${error.message}`);
    return null;
  }

  let best: { entity_id: string; canonical_name: string; score: number } | null = null;
  for (const row of (data ?? []) as Array<{
    id: string;
    canonical_name: string | null;
    merged_to_entity_id?: string | null;
  }>) {
    if (row.merged_to_entity_id || !row.canonical_name) continue;
    const candidateNormalized = normalizeEntityValue(entityType, row.canonical_name);
    if (!candidateNormalized) continue;
    const score = stringSimilarity(normalizedInput, candidateNormalized);
    if (score < COMPANY_FUZZY_MATCH_THRESHOLD) continue;
    if (!best || score > best.score || (score === best.score && row.id < best.entity_id)) {
      best = { entity_id: row.id, canonical_name: row.canonical_name, score };
    }
  }

  if (!best) return null;
  return {
    entity_id: best.entity_id,
    canonical_name: best.canonical_name,
    basis: "fuzzy_match",
    fuzzy_score: best.score,
  };
}

/**
 * Warm-path lookup: "how does our network reach <target>?"
 *
 * Resolves `targetName` to a `company` or `fund` entity (read-only, exact then
 * fuzzy), then runs a bounded BFS **outward from the target** and returns the
 * chains that reach it. Searching from the target is what makes this one call
 * instead of N: a single traversal discovers every origin at once, whereas
 * searching from each candidate origin would require one traversal per origin.
 * Each returned path is reversed to read origin-first, so it presents as
 * "Ana -> knows -> Bruno -> works_at -> Acme".
 *
 * Returns the full chain of entities and edges, which is the value over
 * `query_contacts_at_company` (direct employees only, no chain).
 */
export async function findPaths(params: {
  targetName: string;
  targetKind: PathTargetKind;
  userId: string;
  maxHops?: number;
  maxPaths?: number;
  relationshipTypes?: RelationshipType[];
}): Promise<FindPathsResult> {
  const { targetName, targetKind, userId } = params;
  if (!userId) {
    throw new Error(
      "[PATH_FINDING] findPaths requires a non-empty userId " +
        "— refusing to query graph data across all tenants."
    );
  }

  const bounds: TraversalBounds = {
    max_hops: clamp(params.maxHops ?? 3, 1, MAX_HOPS_CEILING),
    max_nodes_expanded: MAX_NODES_EXPANDED,
    max_frontier_size: MAX_FRONTIER_SIZE,
    max_paths: clamp(params.maxPaths ?? DEFAULT_MAX_PATHS, 1, MAX_PATHS_CEILING),
  };

  const notes: string[] = [];
  if (targetKind === "fund") {
    notes.push(
      "Fund reachability traverses invested_in/funded_by edges. No writer " +
        "currently populates those edge types (#1969), so an empty result may " +
        "mean the edges have never been recorded rather than that no path exists."
    );
  }

  // There is no `fund` schema today (schema_definitions.ts defines `company`
  // as the only organization-like type), so a fund is stored as a `company`
  // entity. Try a dedicated `fund` type first — so this keeps working if such
  // a schema is added later — then fall back to `company`. Only the resolution
  // type differs between kinds; the traversal difference is the edge-type set.
  const candidateTypes = targetKind === "company" ? ["company"] : ["fund", "company"];
  let target: FindPathsResult["target"] = null;
  for (const entityType of candidateTypes) {
    target = await resolveTargetReadOnly({ name: targetName, entityType, userId });
    if (target) break;
  }

  const emptyStats: TraversalStats = {
    nodes_expanded: 0,
    hops_traversed: 0,
    truncated: false,
    truncation_reasons: [],
  };

  if (!target) {
    return {
      queried_name: targetName,
      target_kind: targetKind,
      target: null,
      paths: [],
      total_paths: 0,
      bounds,
      stats: emptyStats,
      ...(notes.length > 0 ? { notes } : {}),
    };
  }

  const relationshipTypes =
    params.relationshipTypes && params.relationshipTypes.length > 0
      ? params.relationshipTypes
      : targetKind === "company"
        ? DEFAULT_COMPANY_EDGE_TYPES
        : DEFAULT_FUND_EDGE_TYPES;

  const { predecessor, stats } = await bfsWithPredecessors({
    originIds: [target.entity_id],
    userId,
    relationshipTypes,
    bounds,
  });

  // Every discovered node has a chain back to the target. Reconstruct, then
  // reverse so the path reads origin -> ... -> target.
  const discovered = [...predecessor.keys()].sort();
  const rawPaths: Array<{ nodeIds: string[]; edges: PathEdge[] }> = [];
  for (const nodeId of discovered) {
    const chain = reconstructPath(nodeId, predecessor, bounds.max_hops);
    if (!chain) continue;
    // reconstructPath yields target-first (the target is the BFS origin here);
    // reverse so the caller reads it as network-origin -> target. Reversing
    // the node order also reverses the direction each step is read in, so
    // `traversed` — which is defined relative to the PRESENTED path — must be
    // flipped to match. The stored source/target ids are left untouched.
    rawPaths.push({
      nodeIds: [...chain.nodeIds].reverse(),
      edges: [...chain.edges].reverse().map((edge) => ({
        ...edge,
        traversed: edge.traversed === "outbound" ? ("inbound" as const) : ("outbound" as const),
      })),
    });
  }

  // Shortest paths first, then deterministic by origin entity_id.
  rawPaths.sort((a, b) => {
    if (a.edges.length !== b.edges.length) return a.edges.length - b.edges.length;
    return a.nodeIds[0] < b.nodeIds[0] ? -1 : a.nodeIds[0] > b.nodeIds[0] ? 1 : 0;
  });

  const totalPaths = rawPaths.length;
  const limited = rawPaths.slice(0, bounds.max_paths);
  if (totalPaths > limited.length) {
    stats.truncated = true;
    if (!stats.truncation_reasons.includes("max_paths")) {
      stats.truncation_reasons.push("max_paths");
    }
  }

  const nodeIdsToHydrate = [...new Set(limited.flatMap((p) => p.nodeIds))];
  const nodeById = await hydrateNodes(nodeIdsToHydrate, userId);

  const paths: GraphPath[] = limited.map((p) => ({
    nodes: p.nodeIds.map((id) => nodeById.get(id) ?? { entity_id: id }),
    edges: p.edges,
    hops: p.edges.length,
  }));

  return {
    queried_name: targetName,
    target_kind: targetKind,
    target,
    paths,
    total_paths: totalPaths,
    bounds,
    stats,
    ...(notes.length > 0 ? { notes } : {}),
  };
}

export interface ShortestPathResult {
  from_entity_id: string;
  to_entity_id: string;
  /** The shortest path by hop count, or null when unreachable within bounds. */
  path: GraphPath | null;
  found: boolean;
  bounds: TraversalBounds;
  stats: TraversalStats;
}

/**
 * Generic shortest path between two known entities, by hop count.
 *
 * Uses the same bounded BFS as {@link findPaths} and stops as soon as the
 * destination is discovered — BFS guarantees the first arrival is a shortest
 * path. Returns `found: false` (not an error) when the destination is
 * unreachable within `max_hops`; check `stats.truncated` to distinguish
 * "genuinely unreachable" from "bound cut the search short".
 */
export async function findShortestPath(params: {
  fromEntityId: string;
  toEntityId: string;
  userId: string;
  maxHops?: number;
  relationshipTypes?: RelationshipType[];
}): Promise<ShortestPathResult> {
  const { fromEntityId, toEntityId, userId } = params;
  if (!userId) {
    throw new Error(
      "[PATH_FINDING] findShortestPath requires a non-empty userId " +
        "— refusing to query graph data across all tenants."
    );
  }

  const bounds: TraversalBounds = {
    max_hops: clamp(params.maxHops ?? 4, 1, MAX_HOPS_CEILING),
    max_nodes_expanded: MAX_NODES_EXPANDED,
    max_frontier_size: MAX_FRONTIER_SIZE,
    max_paths: 1,
  };

  if (fromEntityId === toEntityId) {
    const node = (await hydrateNodes([fromEntityId], userId)).get(fromEntityId) ?? {
      entity_id: fromEntityId,
    };
    return {
      from_entity_id: fromEntityId,
      to_entity_id: toEntityId,
      path: { nodes: [node], edges: [], hops: 0 },
      found: true,
      bounds,
      stats: {
        nodes_expanded: 0,
        hops_traversed: 0,
        truncated: false,
        truncation_reasons: [],
      },
    };
  }

  const { predecessor, stats } = await bfsWithPredecessors({
    originIds: [fromEntityId],
    userId,
    relationshipTypes: params.relationshipTypes,
    bounds,
    stopAt: toEntityId,
  });

  const chain = predecessor.has(toEntityId)
    ? reconstructPath(toEntityId, predecessor, bounds.max_hops)
    : null;

  if (!chain) {
    return {
      from_entity_id: fromEntityId,
      to_entity_id: toEntityId,
      path: null,
      found: false,
      bounds,
      stats,
    };
  }

  const nodeById = await hydrateNodes([...new Set(chain.nodeIds)], userId);

  return {
    from_entity_id: fromEntityId,
    to_entity_id: toEntityId,
    path: {
      nodes: chain.nodeIds.map((id) => nodeById.get(id) ?? { entity_id: id }),
      edges: chain.edges,
      hops: chain.edges.length,
    },
    found: true,
    bounds,
    stats,
  };
}
