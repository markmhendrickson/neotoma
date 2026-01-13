/**
 * Observation Reducer Engine for Enhanced Reducer Engine (FU-056)
 *
 * Deterministic snapshot computation from observations with merge strategies.
 */

import { supabase } from "../db.js";
import {
  schemaRegistry,
  type SchemaDefinition,
  type ReducerConfig,
} from "../services/schema_registry.js";

export interface Observation {
  id: string;
  entity_id: string;
  entity_type: string;
  schema_version: string;
  source_record_id: string;
  observed_at: string;
  specificity_score: number | null;
  source_priority: number;
  fields: Record<string, unknown>;
  created_at: string;
  user_id: string;
}

export interface EntitySnapshot {
  entity_id: string;
  entity_type: string;
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

export class ObservationReducer {
  /**
   * Compute snapshot from observations
   */
  async computeSnapshot(
    entityId: string,
    observations: Observation[],
  ): Promise<EntitySnapshot> {
    if (observations.length === 0) {
      throw new Error(`No observations found for entity ${entityId}`);
    }

    // Get entity type from first observation
    const entityType = observations[0].entity_type;
    const schemaVersion = observations[0].schema_version;
    const userId = observations[0].user_id;

    // Load schema and merge policies
    const schemaEntry = await schemaRegistry.loadActiveSchema(entityType);
    if (!schemaEntry) {
      // For v0.1.0, use default merge policies if no schema exists
      console.warn(
        `No active entity schema found for entity type ${entityType}, using defaults`,
      );
      return this.computeSnapshotWithDefaults(entityId, observations);
    }

    const schemaDef = schemaEntry.schema_definition;
    const reducerConfig = schemaEntry.reducer_config;

    // Sort observations deterministically
    const sortedObservations = this.sortObservations(observations);

    // Compute snapshot by applying merge strategies per field
    const snapshot: Record<string, unknown> = {};
    const provenance: Record<string, string> = {};

    // Get all unique fields from observations
    const allFields = new Set<string>();
    for (const obs of sortedObservations) {
      Object.keys(obs.fields).forEach((field) => allFields.add(field));
    }

    // Apply merge strategy for each field
    for (const field of allFields) {
      const policy = reducerConfig.merge_policies[field];
      const strategy = policy?.strategy || "last_write";
      const tieBreaker = policy?.tie_breaker || "observed_at";

      const result = this.applyMergeStrategy(
        field,
        sortedObservations,
        strategy,
        tieBreaker,
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
      entity_id: entityId,
      entity_type: entityType,
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
  private sortObservations(observations: Observation[]): Observation[] {
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
    observations: Observation[],
    strategy: MergeStrategy,
    tieBreaker: "observed_at" | "source_priority",
  ): { value: unknown; source_observation_id: string } {
    // Filter observations that have this field
    const relevantObservations = observations.filter(
      (obs) => obs.fields[field] !== undefined && obs.fields[field] !== null,
    );

    if (relevantObservations.length === 0) {
      throw new Error(`No observations found with field ${field}`);
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
    observations: Observation[],
  ): { value: unknown; source_observation_id: string } {
    // Observations already sorted by observed_at DESC
    const latest = observations[0];
    return {
      value: latest.fields[field],
      source_observation_id: latest.id,
    };
  }

  /**
   * Highest Priority strategy
   */
  private highestPriority(
    field: string,
    observations: Observation[],
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
      value: sorted[0].fields[field],
      source_observation_id: sorted[0].id,
    };
  }

  /**
   * Most Specific strategy
   */
  private mostSpecific(
    field: string,
    observations: Observation[],
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
      value: sorted[0].fields[field],
      source_observation_id: sorted[0].id,
    };
  }

  /**
   * Merge Array strategy
   */
  private mergeArray(
    field: string,
    observations: Observation[],
  ): { value: unknown; source_observation_id: string } {
    const values = new Set<unknown>();
    const observationIds: string[] = [];

    for (const obs of observations) {
      const value = obs.fields[field];
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
   * Compute snapshot with default merge policies (when no schema exists)
   */
  private async computeSnapshotWithDefaults(
    entityId: string,
    observations: Observation[],
  ): Promise<EntitySnapshot> {
    if (observations.length === 0) {
      throw new Error(`No observations found for entity ${entityId}`);
    }

    const entityType = observations[0].entity_type;
    const schemaVersion = observations[0].schema_version || "1.0";
    const userId = observations[0].user_id;

    // Sort observations deterministically
    const sortedObservations = this.sortObservations(observations);

    // Use last-write-wins for all fields
    const snapshot: Record<string, unknown> = {};
    const provenance: Record<string, string> = {};

    const allFields = new Set<string>();
    for (const obs of sortedObservations) {
      Object.keys(obs.fields).forEach((field) => allFields.add(field));
    }

    for (const field of allFields) {
      const result = this.lastWriteWins(
        field,
        sortedObservations.filter(
          (obs) =>
            obs.fields[field] !== undefined && obs.fields[field] !== null,
        ),
      );

      if (result.value !== undefined && result.value !== null) {
        snapshot[field] = result.value;
        provenance[field] = result.source_observation_id;
      }
    }

    const lastObservationAt = sortedObservations[0].observed_at;
    const computedAt = new Date().toISOString();

    return {
      entity_id: entityId,
      entity_type: entityType,
      schema_version: schemaVersion,
      snapshot,
      computed_at: computedAt,
      observation_count: observations.length,
      last_observation_at: lastObservationAt,
      provenance,
      user_id: userId,
    };
  }
}

export const observationReducer = new ObservationReducer();
