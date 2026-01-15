// FU-134: Query Updates
// Provenance chain, merged entity exclusion

import { supabase } from "../db.js";

export interface EntityQueryOptions {
  userId?: string;
  entityType?: string;
  includeMerged?: boolean;
  limit?: number;
  offset?: number;
}

export interface EntityWithProvenance {
  entity_id: string;
  entity_type: string;
  canonical_name: string;
  snapshot: Record<string, unknown>;
  observation_count: number;
  last_observation_at: string;
  provenance: Record<string, unknown>;
  merged_to_entity_id?: string | null;
  merged_at?: string | null;
}

/**
 * Query entities with merged entity exclusion
 */
export async function queryEntities(
  options: EntityQueryOptions = {}
): Promise<EntityWithProvenance[]> {
  const {
    userId,
    entityType,
    includeMerged = false,
    limit = 100,
    offset = 0,
  } = options;

  // Build query for entities
  let entityQuery = supabase
    .from("entities")
    .select("id, entity_type, canonical_name, user_id, merged_to_entity_id, merged_at");

  // Filter by user if provided
  if (userId) {
    entityQuery = entityQuery.eq("user_id", userId);
  }

  // Filter by entity type if provided
  if (entityType) {
    entityQuery = entityQuery.eq("entity_type", entityType);
  }

  // Exclude merged entities unless explicitly requested
  if (!includeMerged) {
    entityQuery = entityQuery.is("merged_to_entity_id", null);
  }

  entityQuery = entityQuery.range(offset, offset + limit - 1);

  const { data: entities, error: entitiesError } = await entityQuery;

  if (entitiesError) {
    throw new Error(`Failed to query entities: ${entitiesError.message}`);
  }

  if (!entities || entities.length === 0) {
    return [];
  }

  // Get snapshots for entities
  const entityIds = entities.map((e: any) => e.id);
  const { data: snapshots, error: snapshotsError } = await supabase
    .from("entity_snapshots")
    .select("*")
    .in("entity_id", entityIds);

  if (snapshotsError) {
    throw new Error(`Failed to query snapshots: ${snapshotsError.message}`);
  }

  // Combine entities with snapshots
  const snapshotMap = new Map(
    (snapshots || []).map((s: any) => [s.entity_id, s])
  );

  return entities.map((entity: any) => {
    const snapshot = snapshotMap.get(entity.id);
    return {
      entity_id: entity.id,
      entity_type: entity.entity_type,
      canonical_name: entity.canonical_name,
      snapshot: snapshot?.snapshot || {},
      observation_count: snapshot?.observation_count || 0,
      last_observation_at: snapshot?.last_observation_at || entity.created_at,
      provenance: snapshot?.provenance || {},
      merged_to_entity_id: entity.merged_to_entity_id,
      merged_at: entity.merged_at,
    };
  });
}

/**
 * Get entity snapshot with full provenance chain
 */
export async function getEntityWithProvenance(
  entityId: string
): Promise<EntityWithProvenance | null> {
  // Get entity
  const { data: entity, error: entityError } = await supabase
    .from("entities")
    .select("*")
    .eq("id", entityId)
    .single();

  if (entityError || !entity) {
    return null;
  }

  // Check if entity is merged - redirect to target
  if (entity.merged_to_entity_id) {
    return getEntityWithProvenance(entity.merged_to_entity_id);
  }

  // Get snapshot
  const { data: snapshot, error: snapshotError } = await supabase
    .from("entity_snapshots")
    .select("*")
    .eq("entity_id", entityId)
    .single();

  if (snapshotError && snapshotError.code !== "PGRST116") {
    throw new Error(`Failed to get snapshot: ${snapshotError.message}`);
  }

  return {
    entity_id: entity.id,
    entity_type: entity.entity_type,
    canonical_name: entity.canonical_name,
    schema_version: snapshot?.schema_version || "1.0",
    snapshot: snapshot?.snapshot || {},
    observation_count: snapshot?.observation_count || 0,
    last_observation_at: snapshot?.last_observation_at || entity.created_at,
    provenance: snapshot?.provenance || {},
    computed_at: snapshot?.computed_at || entity.created_at,
    merged_to_entity_id: entity.merged_to_entity_id,
    merged_at: entity.merged_at,
  };
}

/**
 * Get source metadata for provenance chain
 */
export async function getSourceMetadata(sourceId: string) {
  const { data, error } = await supabase
    .from("sources")
    .select("id, content_hash, mime_type, file_size, original_filename, created_at")
    .eq("id", sourceId)
    .single();

  if (error) {
    throw new Error(`Failed to get source metadata: ${error.message}`);
  }

  return data;
}

/**
 * Get interpretation run metadata for provenance chain
 */
export async function getInterpretationMetadata(runId: string) {
  const { data, error } = await supabase
    .from("interpretations")
    .select("id, interpretation_config, status, started_at, completed_at, observations_created")
    .eq("id", runId)
    .single();

  if (error) {
    throw new Error(`Failed to get interpretation run: ${error.message}`);
  }

  return data;
}

/**
 * Get full provenance chain for an observation
 */
export async function getObservationProvenance(observationId: string) {
  // Get observation
  const { data: observation, error: obsError } = await supabase
    .from("observations")
    .select("*")
    .eq("id", observationId)
    .single();

  if (obsError) {
    throw new Error(`Failed to get observation: ${obsError.message}`);
  }

  const provenance: any = {
    observation_id: observationId,
    entity_id: observation.entity_id,
    observed_at: observation.observed_at,
    source_priority: observation.source_priority,
  };

  // Get source if exists
  if (observation.source_id) {
    try {
      provenance.source = await getSourceMetadata(observation.source_id);
    } catch (error) {
      console.warn(`Failed to get source metadata: ${error}`);
    }
  }

  // Get interpretation run if exists
  if (observation.interpretation_id) {
    try {
      provenance.interpretation = await getInterpretationMetadata(
        observation.interpretation_id
      );
    } catch (error) {
      console.warn(`Failed to get interpretation run: ${error}`);
    }
  }

  return provenance;
}

