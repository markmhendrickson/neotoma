/**
 * Relationships Service for Relationship Types (FU-059)
 *
 * Manages first-class typed relationships between entities.
 * Updated to use relationship observations and snapshots.
 */

import { createHash } from "node:crypto";

import { supabase } from "../db.js";
import type { RelationshipSnapshot } from "../reducers/relationship_reducer.js";

export type RelationshipType =
  | "PART_OF"
  | "CORRECTS"
  | "REFERS_TO"
  | "SETTLES"
  | "DUPLICATE_OF"
  | "DEPENDS_ON"
  | "SUPERSEDES"
  | "EMBEDS";

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
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export class RelationshipsService {
  private validTypes: Set<RelationshipType> = new Set([
    "PART_OF",
    "CORRECTS",
    "REFERS_TO",
    "SETTLES",
    "DUPLICATE_OF",
    "DEPENDS_ON",
    "SUPERSEDES",
    "EMBEDS",
  ]);

  /**
   * Create relationship (creates observation and snapshot)
   */
  async createRelationship(params: {
    relationship_type: RelationshipType;
    source_entity_id: string;
    target_entity_id: string;
    source_id?: string | null;
    metadata?: Record<string, unknown>;
    user_id: string;
  }): Promise<RelationshipSnapshot> {
    if (!this.validTypes.has(params.relationship_type)) {
      throw new Error(`Invalid relationship type: ${params.relationship_type}`);
    }

    const relationshipKey = `${params.relationship_type}:${params.source_entity_id}:${params.target_entity_id}`;
    let sourceId = params.source_id || null;

    if (!sourceId || sourceId === "00000000-0000-0000-0000-000000000000") {
      const metadataString = stableStringify(params.metadata || {});
      const contentHash = createHash("sha256")
        .update(`${relationshipKey}:${params.user_id}:${metadataString}`)
        .digest("hex");

      const { data: source, error: sourceError } = await supabase
        .from("sources")
        .insert({
          content_hash: `relationship_${contentHash.substring(0, 24)}`,
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
      100, // High priority for direct creation
    );

    if (relationshipsCreated === 0) {
      const { data: observations } = await supabase
        .from("relationship_observations")
        .select("id")
        .eq("relationship_key", relationshipKey)
        .eq("user_id", params.user_id)
        .limit(1);

      if (!observations || observations.length === 0) {
        throw new Error(
          `Failed to create relationship observation for ${relationshipKey}`
        );
      }
    }

    // Get the computed snapshot (with retry for eventual consistency)
    let snapshot = await this.getRelationshipSnapshot(
      params.relationship_type,
      params.source_entity_id,
      params.target_entity_id,
      params.user_id,
    );

    // Retry once if snapshot not found (eventual consistency)
    if (!snapshot) {
      // Wait a brief moment for snapshot computation to complete
      await new Promise((resolve) => setTimeout(resolve, 100));
      snapshot = await this.getRelationshipSnapshot(
        params.relationship_type,
        params.source_entity_id,
        params.target_entity_id,
        params.user_id,
      );
    }

    if (!snapshot) {
      // If still not found, try computing it directly
      snapshot = await this.computeRelationshipSnapshot(
        params.relationship_type,
        params.source_entity_id,
        params.target_entity_id,
        params.user_id,
      );
    }

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
  ): Promise<RelationshipSnapshot[]> {
    let query;

    if (direction === "outgoing") {
      query = supabase
        .from("relationship_snapshots")
        .select("*")
        .eq("source_entity_id", entityId);
    } else if (direction === "incoming") {
      query = supabase
        .from("relationship_snapshots")
        .select("*")
        .eq("target_entity_id", entityId);
    } else {
      query = supabase
        .from("relationship_snapshots")
        .select("*")
        .or(`source_entity_id.eq.${entityId},target_entity_id.eq.${entityId}`);
    }

    const { data, error } = await query.order("last_observation_at", {
      ascending: false,
    });

    if (error) {
      throw new Error(`Failed to get relationships: ${error.message}`);
    }

    const relationships = (data || []) as RelationshipSnapshot[];

    // Filter deleted relationships unless explicitly requested
    if (!includeDeleted && relationships.length > 0) {
      const relationshipKeys = relationships.map((r) => r.relationship_key);
      
      // Check for deletion observations (highest priority with _deleted: true)
      const { data: deletionObservations } = await supabase
        .from("relationship_observations")
        .select("relationship_key, source_priority, observed_at, metadata")
        .in("relationship_key", relationshipKeys)
        .order("source_priority", { ascending: false })
        .order("observed_at", { ascending: false });

      // Find relationships with deletion observations
      const deletedRelationshipKeys = new Set<string>();
      if (deletionObservations) {
        // Group by relationship_key and get highest priority observation
        const highestByKey = new Map<string, any>();
        for (const obs of deletionObservations) {
          if (!highestByKey.has(obs.relationship_key)) {
            highestByKey.set(obs.relationship_key, obs);
          } else {
            const existing = highestByKey.get(obs.relationship_key);
            if (obs.source_priority > existing.source_priority ||
                (obs.source_priority === existing.source_priority &&
                 new Date(obs.observed_at).getTime() > new Date(existing.observed_at).getTime())) {
              highestByKey.set(obs.relationship_key, obs);
            }
          }
        }

        // Check if highest priority observation is a deletion
        for (const [key, obs] of highestByKey.entries()) {
          if (obs.metadata?._deleted === true) {
            deletedRelationshipKeys.add(key);
          }
        }
      }

      // Filter out deleted relationships
      return relationships.filter((r) => !deletedRelationshipKeys.has(r.relationship_key));
    }

    return relationships;
  }

  /**
   * Get relationship snapshots by type
   * 
   * Filters deleted relationships by default.
   */
  async getRelationshipsByType(
    type: RelationshipType,
    includeDeleted: boolean = false,
  ): Promise<RelationshipSnapshot[]> {
    const { data, error } = await supabase
      .from("relationship_snapshots")
      .select("*")
      .eq("relationship_type", type)
      .order("last_observation_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to get relationships by type: ${error.message}`);
    }

    const relationships = (data || []) as RelationshipSnapshot[];

    // Filter deleted relationships unless explicitly requested
    if (!includeDeleted && relationships.length > 0) {
      const relationshipKeys = relationships.map((r) => r.relationship_key);
      
      const { data: deletionObservations } = await supabase
        .from("relationship_observations")
        .select("relationship_key, source_priority, observed_at, metadata")
        .in("relationship_key", relationshipKeys)
        .order("source_priority", { ascending: false })
        .order("observed_at", { ascending: false });

      const deletedRelationshipKeys = new Set<string>();
      if (deletionObservations) {
        const highestByKey = new Map<string, any>();
        for (const obs of deletionObservations) {
          if (!highestByKey.has(obs.relationship_key)) {
            highestByKey.set(obs.relationship_key, obs);
          } else {
            const existing = highestByKey.get(obs.relationship_key);
            if (obs.source_priority > existing.source_priority ||
                (obs.source_priority === existing.source_priority &&
                 new Date(obs.observed_at).getTime() > new Date(existing.observed_at).getTime())) {
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
    includeDeleted: boolean = false,
  ): Promise<RelationshipSnapshot | null> {
    const relationshipKey = `${relationshipType}:${sourceEntityId}:${targetEntityId}`;

    const { data, error } = await supabase
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
      const { data: observations } = await supabase
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
    userId: string,
  ): Promise<RelationshipSnapshot> {
    const { relationshipReducer } = await import("../reducers/relationship_reducer.js");
    
    const relationshipKey = `${relationshipType}:${sourceEntityId}:${targetEntityId}`;

    // Get all observations for this relationship
    const { data: observations, error: fetchError } = await supabase
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
      observations as any,
    );

    // Save snapshot
    const { error: saveError } = await supabase
      .from("relationship_snapshots")
      .upsert(
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
        },
        {
          onConflict: "relationship_key",
        },
      );

    if (saveError) {
      throw new Error(`Failed to save snapshot: ${saveError.message}`);
    }

    return snapshot;
  }
}

export const relationshipsService = new RelationshipsService();
