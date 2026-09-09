/**
 * Relationships Service for Relationship Types (FU-059)
 *
 * Manages first-class typed relationships between entities.
 * Updated to use relationship observations and snapshots.
 */

import { createHash } from "node:crypto";

import { db } from "../db.js";
import type { RelationshipSnapshot } from "../reducers/relationship_reducer.js";
import { generateDeterministicSourceId } from "./source_identity.js";
import { getCurrentAgentIdentity } from "./request_context.js";
import { enforceAttributionPolicy } from "./attribution_policy.js";
import { emitRelationshipLifecycle } from "../events/substrate_store_emit.js";
import { getActiveRelationshipTypeNames } from "./relationship_types/registry.js";

/** Minimal shape of a `relationship_observations` row needed for liveness. */
interface RelationshipObservationRow {
  source_priority: number;
  observed_at: string;
  metadata?: { _deleted?: boolean } | null;
}

/**
 * Single source of truth for "is this edge live?" (#1570). An edge is dead when
 * its highest-priority (then most recent) observation carries
 * `metadata._deleted === true`. Used at write time to materialize
 * `relationship_snapshots.is_live`, and mirrored by the read-path filter and
 * the SQLite backfill so the column never drifts from the observation log.
 * Returns true (live) when the observation set is empty.
 */
export function isRelationshipLive(observations: RelationshipObservationRow[]): boolean {
  if (!observations || observations.length === 0) return true;
  let winner: RelationshipObservationRow | null = null;
  for (const obs of observations) {
    if (winner === null) {
      winner = obs;
      continue;
    }
    if (
      obs.source_priority > winner.source_priority ||
      (obs.source_priority === winner.source_priority &&
        new Date(obs.observed_at).getTime() > new Date(winner.observed_at).getTime())
    ) {
      winner = obs;
    }
  }
  return winner?.metadata?._deleted !== true;
}

/**
 * A relationship type name.
 *
 * This was a 28-member closed union until #1972 (G25). It is now `string`,
 * because the vocabulary is a RUNTIME REGISTRY
 * (`relationship_types/registry.ts`) rather than a compile-time literal —
 * membership is decided against registered rows at write time, in
 * `createRelationship` below, which remains the single enforcement point.
 *
 * The union was not enforcement in any useful sense: `store`'s relationship
 * leg reached this service through an explicit `as never` cast
 * (`actions.ts:8056`), so the compiler was actively silenced about it, and
 * `validTypes.has()` was the only thing between an arbitrary string and the
 * database. Keeping the alias (rather than replacing every reference with
 * `string`) preserves the documentary value of the name at ~16 call sites.
 */
export type RelationshipType = string;

export interface Relationship {
  id: string;
  relationship_type: RelationshipType;
  source_entity_id: string;
  target_entity_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
  user_id: string;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right)
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

/**
 * Structured refusal for an unregistered relationship type.
 *
 * Replaces a bare `throw new Error("Invalid relationship type: X")`, which
 * named no remedy — a caller learned the type was rejected but not that a
 * registry exists, nor how to read it, nor how to add to it.
 */
export class UnregisteredRelationshipTypeError extends Error {
  readonly code = "unregistered_relationship_type";
  readonly statusCode = 400;
  readonly relationshipType: string;
  readonly hint: string;

  constructor(relationshipType: string) {
    const hint =
      `Call list_relationship_types to see the vocabulary this instance accepts, ` +
      `or register_relationship_type to add "${relationshipType}" to it.`;
    super(`Invalid relationship type: ${relationshipType}. ${hint}`);
    this.name = "UnregisteredRelationshipTypeError";
    this.relationshipType = relationshipType;
    this.hint = hint;
  }
}

export class RelationshipsService {
  /**
   * Validate a relationship type against the registry.
   *
   * THIS IS THE SINGLE ENFORCEMENT POINT for the relationship vocabulary, and
   * it was the single enforcement point before #1972 too — the difference is
   * that it now reads registered rows instead of a hardcoded 28-member Set,
   * so the vocabulary is data and the fifteen advertisement copies elsewhere
   * in the tree have nothing left to drift from.
   *
   * Membership is resolved user-then-global: a type registered by this user
   * shadows a global one of the same name, and another user's user-scoped
   * registration is not visible here at all.
   */
  async assertRegisteredType(relationshipType: string, userId?: string): Promise<void> {
    const names = await getActiveRelationshipTypeNames(userId);
    if (!names.has(relationshipType)) {
      throw new UnregisteredRelationshipTypeError(relationshipType);
    }
  }

  /**
   * Create relationship (creates observation and snapshot)
   */
  async createRelationship(params: {
    relationship_type: RelationshipType;
    source_entity_id: string;
    target_entity_id: string;
    source_id?: string | null;
    source_peer_id?: string;
    metadata?: Record<string, unknown>;
    user_id: string;
  }): Promise<RelationshipSnapshot> {
    enforceAttributionPolicy("relationships", getCurrentAgentIdentity());
    await this.assertRegisteredType(params.relationship_type, params.user_id);

    const relationshipKey = `${params.relationship_type}:${params.source_entity_id}:${params.target_entity_id}`;
    let sourceId = params.source_id || null;

    if (!sourceId || sourceId === "00000000-0000-0000-0000-000000000000") {
      const metadataString = stableStringify(params.metadata || {});
      const contentHash = createHash("sha256")
        .update(`${relationshipKey}:${params.user_id}:${metadataString}`)
        .digest("hex");
      const contentHashValue = `relationship_${contentHash.substring(0, 24)}`;

      // Try to find existing source first (handles idempotent re-creation after cleanup)
      const { data: existing } = await db
        .from("sources")
        .select("id")
        .eq("content_hash", contentHashValue)
        .eq("user_id", params.user_id)
        .single();

      if (existing) {
        sourceId = existing.id;
      } else {
        const deterministicSourceId = generateDeterministicSourceId(
          params.user_id,
          contentHashValue
        );
        const { data: source, error: sourceError } = await db
          .from("sources")
          .insert({
            id: deterministicSourceId,
            content_hash: contentHashValue,
            mime_type: "application/json",
            storage_url: `internal://relationship/${params.relationship_type}`,
            file_size: 0,
            user_id: params.user_id,
          })
          .select()
          .single();

        if (sourceError || !source) {
          throw new Error(
            `Failed to create relationship source: ${sourceError?.message || "Unknown error"}`
          );
        }

        sourceId = source.id;
      }
    }

    if (sourceId == null) {
      throw new Error("Missing source id for relationship observation");
    }

    // Create relationship observation
    const { createRelationshipObservations } = await import("./interpretation.js");
    const relationshipsCreated = await createRelationshipObservations(
      [
        {
          relationship_type: params.relationship_type,
          source_entity_id: params.source_entity_id,
          target_entity_id: params.target_entity_id,
          metadata: params.metadata || {},
        },
      ],
      sourceId,
      null, // No interpretation_id for direct creation
      params.user_id,
      100 // High priority for direct creation
    );

    if (relationshipsCreated === 0) {
      const { data: observations } = await db
        .from("relationship_observations")
        .select("id")
        .eq("relationship_key", relationshipKey)
        .eq("user_id", params.user_id)
        .limit(1);

      if (!observations || observations.length === 0) {
        throw new Error(`Failed to create relationship observation for ${relationshipKey}`);
      }
    }

    // Get the computed snapshot (with retry for eventual consistency)
    let snapshot = await this.getRelationshipSnapshot(
      params.relationship_type,
      params.source_entity_id,
      params.target_entity_id,
      params.user_id
    );

    // Retry once if snapshot not found (eventual consistency)
    if (!snapshot) {
      // Wait a brief moment for snapshot computation to complete
      await new Promise((resolve) => setTimeout(resolve, 100));
      snapshot = await this.getRelationshipSnapshot(
        params.relationship_type,
        params.source_entity_id,
        params.target_entity_id,
        params.user_id
      );
    }

    if (!snapshot) {
      // If still not found, try computing it directly
      snapshot = await this.computeRelationshipSnapshot(
        params.relationship_type,
        params.source_entity_id,
        params.target_entity_id,
        params.user_id
      );
    }

    const relTs = snapshot.last_observation_at || snapshot.computed_at || new Date().toISOString();
    emitRelationshipLifecycle({
      user_id: params.user_id,
      relationship_key: relationshipKey,
      relationship_type: params.relationship_type,
      source_entity_id: params.source_entity_id,
      target_entity_id: params.target_entity_id,
      event_type: "relationship.created",
      timestamp: relTs,
      source_id: sourceId ?? undefined,
      source_peer_id: params.source_peer_id,
    });

    return snapshot;
  }

  /**
   * Get relationship snapshots for entity (replaces getRelationshipsForEntity)
   *
   * Filters deleted relationships by default.
   */
  async getRelationshipsForEntity(
    entityId: string,
    direction: "outgoing" | "incoming" | "both" = "both",
    includeDeleted: boolean = false,
    userId?: string
  ): Promise<RelationshipSnapshot[]> {
    let query;

    if (direction === "outgoing") {
      query = db.from("relationship_snapshots").select("*").eq("source_entity_id", entityId);
    } else if (direction === "incoming") {
      query = db.from("relationship_snapshots").select("*").eq("target_entity_id", entityId);
    } else {
      query = db
        .from("relationship_snapshots")
        .select("*")
        .or(`source_entity_id.eq.${entityId},target_entity_id.eq.${entityId}`);
    }

    // Scope to the caller when a userId is supplied. These methods have no
    // callers today; the optional param keeps them safe-by-construction for reuse.
    if (userId) {
      query = query.eq("user_id", userId);
    }

    // Order by recency, then by relationship_key (the relationship_snapshots
    // PRIMARY KEY) as a stable secondary sort so ties on last_observation_at
    // are deterministic. See docs/architecture/determinism.md.
    const { data, error } = await query
      .order("last_observation_at", { ascending: false })
      .order("relationship_key", { ascending: true });

    if (error) {
      throw new Error(`Failed to get relationships: ${error.message}`);
    }

    const relationships = (data || []) as RelationshipSnapshot[];

    // Filter deleted relationships unless explicitly requested
    if (!includeDeleted) {
      return this.filterDeletedRelationships(relationships, userId);
    }

    return relationships;
  }

  /**
   * Remove soft-deleted relationships from a snapshot list.
   *
   * A relationship snapshot row persists after deletion; deletion is recorded
   * as a `relationship_observations` row whose `metadata._deleted === true`.
   * A relationship is considered deleted when the highest-priority (then most
   * recent) observation for its `relationship_key` carries that flag. This
   * mirrors the soft-delete semantics enforced by `getRelationshipSnapshot`
   * and is the single source of truth for "is this edge live?" used by every
   * read path (entity listing, type listing, and the `/list_relationships`
   * handler). Returns the input list unchanged when it is empty.
   */
  async filterDeletedRelationships(
    relationships: RelationshipSnapshot[],
    userId?: string
  ): Promise<RelationshipSnapshot[]> {
    if (relationships.length === 0) {
      return relationships;
    }

    const relationshipKeys = relationships.map((r) => r.relationship_key);

    // Check for deletion observations (highest priority with _deleted: true)
    let deletionQuery = db
      .from("relationship_observations")
      .select("relationship_key, source_priority, observed_at, metadata")
      .in("relationship_key", relationshipKeys);
    if (userId) {
      deletionQuery = deletionQuery.eq("user_id", userId);
    }
    const { data: deletionObservations } = await deletionQuery
      .order("source_priority", { ascending: false })
      .order("observed_at", { ascending: false });

    // Find relationships whose highest-priority observation is a deletion
    const deletedRelationshipKeys = new Set<string>();
    if (deletionObservations) {
      const highestByKey = new Map<string, any>();
      for (const obs of deletionObservations) {
        if (!highestByKey.has(obs.relationship_key)) {
          highestByKey.set(obs.relationship_key, obs);
        } else {
          const existing = highestByKey.get(obs.relationship_key);
          if (
            obs.source_priority > existing.source_priority ||
            (obs.source_priority === existing.source_priority &&
              new Date(obs.observed_at).getTime() > new Date(existing.observed_at).getTime())
          ) {
            highestByKey.set(obs.relationship_key, obs);
          }
        }
      }

      for (const [key, obs] of highestByKey.entries()) {
        if (obs.metadata?._deleted === true) {
          deletedRelationshipKeys.add(key);
        }
      }
    }

    return relationships.filter((r) => !deletedRelationshipKeys.has(r.relationship_key));
  }

  /**
   * Get relationship snapshots by type
   *
   * Filters deleted relationships by default.
   */
  async getRelationshipsByType(
    type: RelationshipType,
    includeDeleted: boolean = false,
    userId?: string
  ): Promise<RelationshipSnapshot[]> {
    // Order by recency, then by relationship_key (the relationship_snapshots
    // PRIMARY KEY) as a stable secondary sort so ties on last_observation_at
    // are deterministic. See docs/architecture/determinism.md.
    let query = db.from("relationship_snapshots").select("*").eq("relationship_type", type);
    if (userId) {
      query = query.eq("user_id", userId);
    }
    const { data, error } = await query
      .order("last_observation_at", { ascending: false })
      .order("relationship_key", { ascending: true });

    if (error) {
      throw new Error(`Failed to get relationships by type: ${error.message}`);
    }

    const relationships = (data || []) as RelationshipSnapshot[];

    // Filter deleted relationships unless explicitly requested
    if (!includeDeleted) {
      return this.filterDeletedRelationships(relationships, userId);
    }

    return relationships;
  }

  /**
   * Get a specific relationship snapshot
   *
   * Returns null if relationship is deleted (unless explicitly requested).
   */
  async getRelationshipSnapshot(
    relationshipType: RelationshipType,
    sourceEntityId: string,
    targetEntityId: string,
    userId: string,
    includeDeleted: boolean = false
  ): Promise<RelationshipSnapshot | null> {
    const relationshipKey = `${relationshipType}:${sourceEntityId}:${targetEntityId}`;

    const { data, error } = await db
      .from("relationship_snapshots")
      .select("*")
      .eq("relationship_key", relationshipKey)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get relationship snapshot: ${error.message}`);
    }

    const snapshot = data as RelationshipSnapshot | null;

    // Check if relationship is deleted (unless explicitly requested)
    if (snapshot && !includeDeleted) {
      const { data: observations } = await db
        .from("relationship_observations")
        .select("source_priority, observed_at, metadata")
        .eq("relationship_key", relationshipKey)
        .eq("user_id", userId)
        .order("source_priority", { ascending: false })
        .order("observed_at", { ascending: false })
        .limit(1);

      if (observations && observations.length > 0) {
        const highestPriorityObs = observations[0];
        if (highestPriorityObs.metadata?._deleted === true) {
          // Relationship is deleted - return null
          return null;
        }
      }
    }

    return snapshot;
  }

  /**
   * Compute or recompute snapshot for a relationship
   */
  async computeRelationshipSnapshot(
    relationshipType: RelationshipType,
    sourceEntityId: string,
    targetEntityId: string,
    userId: string
  ): Promise<RelationshipSnapshot> {
    const { relationshipReducer } = await import("../reducers/relationship_reducer.js");

    const relationshipKey = `${relationshipType}:${sourceEntityId}:${targetEntityId}`;

    // Get all observations for this relationship
    const { data: observations, error: fetchError } = await db
      .from("relationship_observations")
      .select("*")
      .eq("relationship_key", relationshipKey)
      .eq("user_id", userId)
      .order("observed_at", { ascending: false });

    if (fetchError) {
      throw new Error(`Failed to fetch observations: ${fetchError.message}`);
    }

    if (!observations || observations.length === 0) {
      throw new Error(`No observations found for relationship ${relationshipKey}`);
    }

    // Compute snapshot
    const snapshot = await relationshipReducer.computeSnapshot(
      relationshipKey,
      observations as any
    );

    // Materialize liveness (#1570). The edge is dead when its highest-priority
    // (then most recent) observation is a deletion — the same rule
    // `filterDeletedRelationships` applies on the read path. Derived here from
    // the observations already fetched above, so the default list_relationships
    // read can exclude soft-deleted edges via a DB predicate (`is_live = 1`)
    // and paginate at the DB instead of loading + filtering in process.
    const isLive = isRelationshipLive(observations as RelationshipObservationRow[]);

    // Save snapshot
    const { error: saveError } = await db.from("relationship_snapshots").upsert(
      {
        relationship_key: snapshot.relationship_key,
        relationship_type: snapshot.relationship_type,
        source_entity_id: snapshot.source_entity_id,
        target_entity_id: snapshot.target_entity_id,
        schema_version: snapshot.schema_version,
        snapshot: snapshot.snapshot,
        computed_at: snapshot.computed_at,
        observation_count: snapshot.observation_count,
        last_observation_at: snapshot.last_observation_at,
        provenance: snapshot.provenance,
        user_id: snapshot.user_id,
        is_live: isLive ? 1 : 0,
      },
      {
        onConflict: "relationship_key",
      }
    );

    if (saveError) {
      throw new Error(`Failed to save snapshot: ${saveError.message}`);
    }

    return snapshot;
  }
}

export const relationshipsService = new RelationshipsService();
