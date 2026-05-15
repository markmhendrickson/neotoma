/**
 * Observation Reducer Engine for Enhanced Reducer Engine (FU-056)
 *
 * Deterministic snapshot computation from observations with merge strategies.
 */

import {
  schemaRegistry,
  type FieldDefinition,
  type SchemaRegistryEntry,
  type ReducerConfig,
  type ObservationSourceRankValue,
  DEFAULT_OBSERVATION_SOURCE_PRIORITY,
} from "../services/schema_registry.js";
import { validateFieldWithConverters } from "../services/field_validation.js";
import { getSchemaDefinition } from "../services/schema_definitions.js";

export interface Observation {
  id: string;
  entity_id: string;
  entity_type: string;
  schema_version: string;
  source_id: string;
  observed_at: string;
  specificity_score: number | null;
  source_priority: number;
  /**
   * Kind of write (sensor / llm_summary / workflow_state / human /
   * import). Used as a tie-break after numeric `source_priority`.
   * Null / undefined for legacy rows written before the field existed;
   * those rank last within their `source_priority` bucket.
   */
  observation_source?: ObservationSourceRankValue | null;
  fields: Record<string, unknown>;
  created_at: string;
  user_id: string;
}

/**
 * Convert a `ReducerConfig.observation_source_priority` declaration (or
 * the shipped default) into a rank lookup where lower numbers win.
 * Unknown or missing values fall to `Number.MAX_SAFE_INTEGER` so they
 * sort last within their `source_priority` bucket without bypassing the
 * normal observed_at / id tie-break downstream.
 */
function buildObservationSourceRank(
  reducerConfig?: ReducerConfig,
): Map<string, number> {
  const order =
    reducerConfig?.observation_source_priority ??
    DEFAULT_OBSERVATION_SOURCE_PRIORITY;
  const rank = new Map<string, number>();
  order.forEach((value, index) => {
    rank.set(value, index);
  });
  return rank;
}

function rankForObservationSource(
  obs: Pick<Observation, "observation_source">,
  rank: Map<string, number>,
): number {
  const value = obs.observation_source;
  if (!value) return Number.MAX_SAFE_INTEGER;
  const r = rank.get(value);
  return r === undefined ? Number.MAX_SAFE_INTEGER : r;
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
   * 
   * Returns null if entity is deleted (has deletion observation with _deleted: true).
   */
  async computeSnapshot(
    entityId: string,
    observations: Observation[],
  ): Promise<EntitySnapshot | null> {
    if (observations.length === 0) {
      throw new Error(`No observations found for entity ${entityId}`);
    }

    // Sort observations first to check for deletion
    const sortedObservations = this.sortObservations(observations);

    // Pre-compute observation_source ranking from the schema (or default
    // order) so deletion / highest-priority / most-specific comparisons
    // all use the same tie-break axis without re-reading the schema.
    const deletionRank = buildObservationSourceRank();

    // Check if entity is deleted (highest priority observation with _deleted: true)
    const highestPriorityObs = [...sortedObservations].sort((a, b) => {
      // Primary: source_priority DESC
      if (b.source_priority !== a.source_priority) {
        return b.source_priority - a.source_priority;
      }
      // Secondary: observation_source ranking (ASC — lower rank wins)
      const rankA = rankForObservationSource(a, deletionRank);
      const rankB = rankForObservationSource(b, deletionRank);
      if (rankA !== rankB) return rankA - rankB;
      // Tertiary: observed_at DESC
      return new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime();
    })[0];

    if (highestPriorityObs.fields._deleted === true) {
      // Entity is deleted - return null instead of snapshot
      return null;
    }

    // Get entity type and user from first observation
    const entityType = observations[0].entity_type;
    const userId = observations[0].user_id;

    // Load schema and merge policies (pass userId to support user-specific schemas)
    let schemaEntry: SchemaRegistryEntry | null = await schemaRegistry.loadActiveSchema(
      entityType,
      userId,
    );
    if (!schemaEntry) {
      const codeSchema = getSchemaDefinition(entityType);
      if (codeSchema) {
        schemaEntry = {
          id: "",
          entity_type: codeSchema.entity_type,
          schema_version: codeSchema.schema_version || "1.0",
          schema_definition: codeSchema.schema_definition,
          reducer_config: codeSchema.reducer_config,
          active: true,
          created_at: sortedObservations[0].observed_at,
        };
      }
    }
    if (!schemaEntry) {
      // For v0.1.0, use default merge policies if no schema exists
      console.warn(
        `No active entity schema found for entity type ${entityType}, using defaults`,
      );
      return this.computeSnapshotWithDefaults(entityId, observations);
    }

    // Use the active schema version (the one used for computation), not the observation's schema_version
    const schemaVersion = schemaEntry.schema_version;
    const schemaDef = schemaEntry.schema_definition;
    const reducerConfig = schemaEntry.reducer_config;
    const observationSourceRank = buildObservationSourceRank(reducerConfig);

    // Compute snapshot by applying merge strategies per field
    const snapshot: Record<string, unknown> = {};
    const provenance: Record<string, string> = {};

    // Get unique fields from observations, projected through the active schema.
    // Only fields defined in the schema appear in the snapshot; observation data
    // for removed fields is preserved but not surfaced until re-added.
    const schemaFields = new Set(Object.keys(schemaDef.fields));
    const allFields = new Set<string>();
    for (const obs of sortedObservations) {
      for (const field of Object.keys(obs.fields)) {
        if (schemaFields.has(field)) {
          allFields.add(field);
        }
      }
    }

    // Apply merge strategy for each field
    for (const field of allFields) {
      const policy = reducerConfig.merge_policies[field];
      const strategy = policy?.strategy || "last_write";
      const tieBreaker = policy?.tie_breaker || "observed_at";
      const fieldDef = schemaDef.fields[field];

      const result = this.applyMergeStrategy(
        field,
        sortedObservations,
        strategy,
        tieBreaker,
        fieldDef,
        observationSourceRank,
      );

      if (result && result.value !== undefined && result.value !== null) {
        snapshot[field] = result.value;
        provenance[field] = result.source_observation_id;
      }
    }

    // Find most recent observation timestamp (deterministic - derived from data, not wall-clock)
    const lastObservationAt = sortedObservations[0].observed_at;

    return {
      entity_id: entityId,
      entity_type: entityType,
      schema_version: schemaVersion,
      snapshot,
      computed_at: lastObservationAt,
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
   * 
   * Applies converters from the active schema to ensure snapshot values
   * conform to the schema type, even if observations have old types.
   */
  private applyMergeStrategy(
    field: string,
    observations: Observation[],
    strategy: MergeStrategy,
    tieBreaker: "observed_at" | "source_priority",
    fieldDef?: FieldDefinition,
    observationSourceRank: Map<string, number> = buildObservationSourceRank(),
  ): { value: unknown; source_observation_id: string } | null {
    // Treat null as an explicit clear. Only undefined means the observation did
    // not carry this field and should be ignored by the reducer.
    const relevantObservations = observations.filter(
      (obs) =>
        Object.prototype.hasOwnProperty.call(obs.fields, field) &&
        obs.fields[field] !== undefined,
    );

    if (relevantObservations.length === 0) {
      // Field exists in schema but not in any observations - skip it
      return null;
    }

    // Get merged value using strategy
    let mergedResult: { value: unknown; source_observation_id: string };
    switch (strategy) {
      case "last_write":
        mergedResult = this.lastWriteWins(field, relevantObservations);
        break;

      case "highest_priority":
        mergedResult = this.highestPriority(
          field,
          relevantObservations,
          tieBreaker,
          observationSourceRank,
        );
        break;

      case "most_specific":
        mergedResult = this.mostSpecific(
          field,
          relevantObservations,
          tieBreaker,
          observationSourceRank,
        );
        break;

      case "merge_array":
        mergedResult = this.mergeArray(field, relevantObservations, fieldDef);
        break;

      default:
        throw new Error(`Unknown merge strategy: ${strategy}`);
    }

    if (mergedResult.value === undefined || mergedResult.value === null) {
      return mergedResult;
    }

    // Apply converters if field definition exists and value doesn't match type
    if (fieldDef) {
      const validationResult = validateFieldWithConverters(
        field,
        mergedResult.value,
        fieldDef,
      );

      // If conversion was applied, use converted value
      // If value already matches type, use as-is
      // If conversion failed and should route to raw_fragments, still use the value
      // (we're in snapshot computation, not observation creation)
      if (!validationResult.shouldRouteToRawFragments) {
        return {
          value: validationResult.value,
          source_observation_id: mergedResult.source_observation_id,
        };
      }
      // If conversion failed, still return the original value
      // (better than losing data, even if type doesn't match)
    }

    return mergedResult;
  }

  /**
   * Last Write Wins strategy
   */
  private lastWriteWins(
    field: string,
    observations: Observation[],
  ): { value: unknown; source_observation_id: string } {
    // Observations already sorted by observed_at DESC.
    // Callers (notably computeSnapshotWithDefaults) pre-filter observations
    // down to those where this field is non-null, so the input list can be
    // empty for fields whose only observation is null. Return a sentinel
    // no-value result in that case; the caller drops it from the snapshot.
    const latest = observations[0];
    if (!latest) {
      return { value: undefined, source_observation_id: "" };
    }
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
    observationSourceRank: Map<string, number>,
  ): { value: unknown; source_observation_id: string } {
    const sorted = [...observations].sort((a, b) => {
      // Primary: source_priority DESC
      if (b.source_priority !== a.source_priority) {
        return b.source_priority - a.source_priority;
      }
      // Secondary: observation_source rank ASC (lower rank wins; null last)
      const rankA = rankForObservationSource(a, observationSourceRank);
      const rankB = rankForObservationSource(b, observationSourceRank);
      if (rankA !== rankB) return rankA - rankB;
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
    observationSourceRank: Map<string, number>,
  ): { value: unknown; source_observation_id: string } {
    const sorted = [...observations].sort((a, b) => {
      // Primary: specificity_score DESC
      const scoreA = a.specificity_score ?? 0;
      const scoreB = b.specificity_score ?? 0;
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      // Secondary: source_priority DESC when configured, else observed_at DESC.
      if (tieBreaker === "source_priority") {
        if (b.source_priority !== a.source_priority) {
          return b.source_priority - a.source_priority;
        }
      }
      // Tertiary (or secondary for observed_at tie_breaker):
      // observation_source rank ASC — sensors / workflow beat LLM
      // summaries when specificity and numeric priority are equal.
      const rankA = rankForObservationSource(a, observationSourceRank);
      const rankB = rankForObservationSource(b, observationSourceRank);
      if (rankA !== rankB) return rankA - rankB;
      // Final: observed_at DESC
      return (
        new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime()
      );
    });

    return {
      value: sorted[0].fields[field],
      source_observation_id: sorted[0].id,
    };
  }

  /**
   * Merge Array strategy
   * 
   * Note: For merge_array strategy, converters are applied to individual
   * array elements if fieldDef is provided. However, since merge_array
   * combines values from multiple observations, we apply converters to
   * each value before adding to the set.
   */
  private mergeArray(
    field: string,
    observations: Observation[],
    fieldDef?: FieldDefinition,
  ): { value: unknown; source_observation_id: string } {
    const values = new Set<unknown>();
    const observationIds: string[] = [];

    for (const obs of observations) {
      const rawValue = obs.fields[field];
      if (rawValue !== undefined && rawValue !== null) {
        // Handle array values
        if (Array.isArray(rawValue)) {
          for (const item of rawValue) {
            // Apply converters to each array element if fieldDef exists
            if (fieldDef && fieldDef.type === "array" && fieldDef.converters) {
              // For array types, we'd need to know the element type
              // For now, just add the value as-is
              // TODO: Support element type conversion for arrays
              values.add(item);
            } else {
              values.add(item);
            }
          }
        } else {
          // Single value - apply converters if fieldDef exists
          if (fieldDef) {
            const validationResult = validateFieldWithConverters(
              field,
              rawValue,
              fieldDef,
            );
            if (!validationResult.shouldRouteToRawFragments) {
              values.add(validationResult.value);
            } else {
              values.add(rawValue);
            }
          } else {
            values.add(rawValue);
          }
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
   * 
   * Returns null if entity is deleted.
   */
  private async computeSnapshotWithDefaults(
    entityId: string,
    observations: Observation[],
  ): Promise<EntitySnapshot | null> {
    if (observations.length === 0) {
      throw new Error(`No observations found for entity ${entityId}`);
    }

    // Sort observations deterministically
    const sortedObservations = this.sortObservations(observations);

    // Unseeded-type path: use the default observation_source ranking
    // so sensors / workflow emissions still outrank LLM summaries when
    // `source_priority` ties, matching the seeded-type behavior.
    const defaultRank = buildObservationSourceRank();

    // Check if entity is deleted (highest priority observation with _deleted: true)
    const highestPriorityObs = [...sortedObservations].sort((a, b) => {
      // Primary: source_priority DESC
      if (b.source_priority !== a.source_priority) {
        return b.source_priority - a.source_priority;
      }
      // Secondary: observation_source rank ASC
      const rankA = rankForObservationSource(a, defaultRank);
      const rankB = rankForObservationSource(b, defaultRank);
      if (rankA !== rankB) return rankA - rankB;
      // Tertiary: observed_at DESC
      return new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime();
    })[0];

    if (highestPriorityObs.fields._deleted === true) {
      // Entity is deleted - return null instead of snapshot
      return null;
    }

    const entityType = observations[0].entity_type;
    const schemaVersion = observations[0].schema_version || "1.0";
    const userId = observations[0].user_id;

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
            Object.prototype.hasOwnProperty.call(obs.fields, field) &&
            obs.fields[field] !== undefined,
        ),
      );

      if (result.value !== undefined && result.value !== null) {
        snapshot[field] = result.value;
        provenance[field] = result.source_observation_id;
      }
    }

    const lastObservationAt = sortedObservations[0].observed_at;

    return {
      entity_id: entityId,
      entity_type: entityType,
      schema_version: schemaVersion,
      snapshot,
      computed_at: lastObservationAt,
      observation_count: observations.length,
      last_observation_at: lastObservationAt,
      provenance,
      user_id: userId,
    };
  }
}

export const observationReducer = new ObservationReducer();
