/**
 * Relationship Reducer Engine
 *
 * Deterministic snapshot computation from relationship observations with merge strategies.
 * Mirrors the entity observation reducer but works with relationships.
 */

import { supabase } from "../db.js";

export interface RelationshipObservation {
  id: string;
  relationship_key: string;
  relationship_type: string;
  source_entity_id: string;
  target_entity_id: string;
  source_id: string;
  interpretation_id: string | null;
  observed_at: string;
  specificity_score: number | null;
  source_priority: number;
  metadata: Record<string, unknown>;
  canonical_hash: string;
  created_at: string;
  user_id: string;
}

export interface RelationshipSnapshot {
  relationship_key: string;
  relationship_type: string;
  source_entity_id: string;
  target_entity_id: string;
  schema_version: string;
  snapshot: Record<string, unknown>;
  computed_at: string;
  observation_count: number;
  last_observation_at: string;
  provenance: Record<string, string>; // field → observation_id
  user_id: string;
}

type MergeStrategy =
  | "last_write"
  | "highest_priority"
  | "most_specific"
  | "merge_array";

export class RelationshipReducer {
  /**
   * Compute snapshot from relationship observations
   */
  async computeSnapshot(
    relationshipKey: string,
    observations: RelationshipObservation[],
  ): Promise<RelationshipSnapshot> {
    if (observations.length === 0) {
      throw new Error(
        `No observations found for relationship ${relationshipKey}`,
      );
    }

    // Get relationship type from first observation
    const relationshipType = observations[0].relationship_type;
    const sourceEntityId = observations[0].source_entity_id;
    const targetEntityId = observations[0].target_entity_id;
    const userId = observations[0].user_id;

    // For now, use default merge policies (last_write for all fields)
    // In the future, could load from schema_registry if relationship schemas are added
    const schemaVersion = "1.0";

    // Sort observations deterministically
    const sortedObservations = this.sortObservations(observations);

    // Compute snapshot by applying merge strategies per metadata field
    const snapshot: Record<string, unknown> = {};
    const provenance: Record<string, string> = {};

    // Get all unique metadata fields from observations
    const allFields = new Set<string>();
    for (const obs of sortedObservations) {
      Object.keys(obs.metadata).forEach((field) => allFields.add(field));
    }

    // Apply merge strategy for each field
    for (const field of allFields) {
      const result = this.applyMergeStrategy(
        field,
        sortedObservations,
        "last_write", // Default strategy
        "observed_at", // Default tie breaker
      );

      if (result.value !== undefined && result.value !== null) {
        snapshot[field] = result.value;
        provenance[field] = result.source_observation_id;
      }
    }

    // Find most recent observation timestamp
    const lastObservationAt = sortedObservations[0].observed_at;
    const computedAt = new Date().toISOString();

    return {
      relationship_key: relationshipKey,
      relationship_type: relationshipType,
      source_entity_id: sourceEntityId,
      target_entity_id: targetEntityId,
      schema_version: schemaVersion,
      snapshot,
      computed_at: computedAt,
      observation_count: observations.length,
      last_observation_at: lastObservationAt,
      provenance,
      user_id: userId,
    };
  }

  /**
   * Sort observations deterministically
   */
  private sortObservations(
    observations: RelationshipObservation[],
  ): RelationshipObservation[] {
    return [...observations].sort((a, b) => {
      // Primary: observed_at DESC (most recent first)
      const timeA = new Date(a.observed_at).getTime();
      const timeB = new Date(b.observed_at).getTime();
      if (timeB !== timeA) {
        return timeB - timeA;
      }
      // Secondary: id ASC (stable tie-breaker)
      return a.id.localeCompare(b.id);
    });
  }

  /**
   * Apply merge strategy to field
   */
  private applyMergeStrategy(
    field: string,
    observations: RelationshipObservation[],
    strategy: MergeStrategy,
    tieBreaker: "observed_at" | "source_priority",
  ): { value: unknown; source_observation_id: string } {
    // Filter observations that have this metadata field
    const relevantObservations = observations.filter(
      (obs) =>
        obs.metadata[field] !== undefined && obs.metadata[field] !== null,
    );

    if (relevantObservations.length === 0) {
      throw new Error(`No observations found with metadata field ${field}`);
    }

    switch (strategy) {
      case "last_write":
        return this.lastWriteWins(field, relevantObservations);

      case "highest_priority":
        return this.highestPriority(field, relevantObservations, tieBreaker);

      case "most_specific":
        return this.mostSpecific(field, relevantObservations, tieBreaker);

      case "merge_array":
        return this.mergeArray(field, relevantObservations);

      default:
        throw new Error(`Unknown merge strategy: ${strategy}`);
    }
  }

  /**
   * Last Write Wins strategy
   */
  private lastWriteWins(
    field: string,
    observations: RelationshipObservation[],
  ): { value: unknown; source_observation_id: string } {
    // Observations already sorted by observed_at DESC
    const latest = observations[0];
    return {
      value: latest.metadata[field],
      source_observation_id: latest.id,
    };
  }

  /**
   * Highest Priority strategy
   */
  private highestPriority(
    field: string,
    observations: RelationshipObservation[],
    tieBreaker: "observed_at" | "source_priority",
  ): { value: unknown; source_observation_id: string } {
    const sorted = [...observations].sort((a, b) => {
      // Primary: source_priority DESC
      if (b.source_priority !== a.source_priority) {
        return b.source_priority - a.source_priority;
      }
      // Tie breaker
      if (tieBreaker === "observed_at") {
        return (
          new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime()
        );
      }
      // source_priority is already the primary sort, so just use id
      return a.id.localeCompare(b.id);
    });

    return {
      value: sorted[0].metadata[field],
      source_observation_id: sorted[0].id,
    };
  }

  /**
   * Most Specific strategy
   */
  private mostSpecific(
    field: string,
    observations: RelationshipObservation[],
    tieBreaker: "observed_at" | "source_priority",
  ): { value: unknown; source_observation_id: string } {
    const sorted = [...observations].sort((a, b) => {
      // Primary: specificity_score DESC
      const scoreA = a.specificity_score ?? 0;
      const scoreB = b.specificity_score ?? 0;
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      // Tie breaker
      if (tieBreaker === "observed_at") {
        return (
          new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime()
        );
      } else {
        return b.source_priority - a.source_priority;
      }
    });

    return {
      value: sorted[0].metadata[field],
      source_observation_id: sorted[0].id,
    };
  }

  /**
   * Merge Array strategy
   */
  private mergeArray(
    field: string,
    observations: RelationshipObservation[],
  ): { value: unknown; source_observation_id: string } {
    const values = new Set<unknown>();
    const observationIds: string[] = [];

    for (const obs of observations) {
      const value = obs.metadata[field];
      if (value !== undefined && value !== null) {
        // Handle array values
        if (Array.isArray(value)) {
          value.forEach((v) => values.add(v));
        } else {
          values.add(value);
        }
        observationIds.push(obs.id);
      }
    }

    return {
      value: Array.from(values),
      source_observation_id: observationIds.join(","), // Multiple sources
    };
  }

  /**
   * Generate relationship key from components
   */
  static generateRelationshipKey(
    relationshipType: string,
    sourceEntityId: string,
    targetEntityId: string,
  ): string {
    return `${relationshipType}:${sourceEntityId}:${targetEntityId}`;
  }
}

export const relationshipReducer = new RelationshipReducer();
