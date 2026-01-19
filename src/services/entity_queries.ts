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
  schema_version?: string;
  snapshot: Record<string, unknown>;
  raw_fragments?: Record<string, unknown>; // Unvalidated fields not yet in schema
  observation_count: number;
  last_observation_at: string;
  provenance: Record<string, unknown>;
  computed_at?: string;
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

  // Get raw_fragments for all entities (batch query)
  const { data: allObservations } = await supabase
    .from("observations")
    .select("entity_id, source_id, user_id")
    .in("entity_id", entityIds)
    .not("source_id", "is", null)
    .limit(1000); // Reasonable limit for batch

  // Group observations by entity_id to get source_ids per entity
  const entitySources = new Map<string, Set<string>>();
  const entityUserIds = new Map<string, Set<string>>();
  
  if (allObservations) {
    for (const obs of allObservations) {
      if (!entitySources.has(obs.entity_id)) {
        entitySources.set(obs.entity_id, new Set());
        entityUserIds.set(obs.entity_id, new Set());
      }
      if (obs.source_id) {
        entitySources.get(obs.entity_id)!.add(obs.source_id);
      }
      if (obs.user_id) {
        entityUserIds.get(obs.entity_id)!.add(obs.user_id);
      }
    }
  }

  // Batch query raw_fragments for all entities
  const allSourceIds = Array.from(new Set(
    Array.from(entitySources.values()).flatMap(s => Array.from(s))
  ));
  
  const rawFragmentsByEntity = new Map<string, Record<string, unknown>>();
  
  if (allSourceIds.length > 0) {
    // Get entity types for filtering
    const entityTypes = new Set(entities.map((e: any) => e.entity_type));
    
    for (const entityType of entityTypes) {
      const entitiesOfType = entities.filter((e: any) => e.entity_type === entityType);
      const entityIdsOfType = entitiesOfType.map((e: any) => e.id);
      
      // Get source_ids for entities of this type
      const sourceIdsForType = new Set<string>();
      const userIdsForType = new Set<string>();
      
      for (const entityId of entityIdsOfType) {
        const sources = entitySources.get(entityId);
        const userIds = entityUserIds.get(entityId);
        if (sources) {
          sources.forEach(sid => sourceIdsForType.add(sid));
        }
        if (userIds) {
          userIds.forEach(uid => userIdsForType.add(uid));
        }
      }

      if (sourceIdsForType.size > 0) {
        const defaultUserId = "00000000-0000-0000-0000-000000000000";
        let fragmentQuery = supabase
          .from("raw_fragments")
          .select("fragment_key, fragment_value, last_seen, source_id")
          .eq("fragment_type", entityType)
          .in("source_id", Array.from(sourceIdsForType));

        // Handle user_id
        if (userIdsForType.size > 0) {
          const userIdFilters = Array.from(userIdsForType).map((uid: string) => 
            uid === defaultUserId ? `user_id.eq.${defaultUserId},user_id.is.null` : `user_id.eq.${uid}`
          );
          fragmentQuery = fragmentQuery.or(userIdFilters.join(","));
        } else {
          fragmentQuery = fragmentQuery.or(`user_id.is.null,user_id.eq.${defaultUserId}`);
        }

        const { data: fragments } = await fragmentQuery;

        if (fragments && fragments.length > 0) {
          // Group fragments by entity (via source_id -> entity_id mapping)
          for (const fragment of fragments) {
            // Find which entity this fragment belongs to
            for (const entityId of entityIdsOfType) {
              const sources = entitySources.get(entityId);
              if (sources && sources.has(fragment.source_id)) {
                if (!rawFragmentsByEntity.has(entityId)) {
                  rawFragmentsByEntity.set(entityId, {});
                }
                const entityFragments = rawFragmentsByEntity.get(entityId)!;
                const key = fragment.fragment_key;
                const lastSeen = fragment.last_seen || "";
                
                // Last-write wins (most recent last_seen)
                // Store last_seen separately for comparison
                const lastSeenKey = `__${key}_last_seen`;
                if (!(key in entityFragments) || 
                    ((entityFragments as any)[lastSeenKey] || "") < lastSeen) {
                  entityFragments[key] = fragment.fragment_value;
                  (entityFragments as any)[lastSeenKey] = lastSeen; // Track for comparison
                }
              }
            }
          }

          // Clean up __*_last_seen tracking fields and exclude fields already in snapshots
          for (const [entityId, fragments] of rawFragmentsByEntity.entries()) {
            const snapshot = snapshotMap.get(entityId);
            const snapshotFields = new Set(Object.keys(snapshot?.snapshot || {}));
            
            const cleaned: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(fragments)) {
              // Skip tracking fields and fields already in snapshot
              if (!key.startsWith("__") && !key.endsWith("_last_seen") && !snapshotFields.has(key)) {
                cleaned[key] = value;
              }
            }
            rawFragmentsByEntity.set(entityId, cleaned);
          }
        }
      }
    }
  }

  return entities.map((entity: any) => {
    const snapshot = snapshotMap.get(entity.id);
    const rawFragments = rawFragmentsByEntity.get(entity.id);
    return {
      entity_id: entity.id,
      entity_type: entity.entity_type,
      canonical_name: entity.canonical_name,
      schema_version: snapshot?.schema_version,
      snapshot: snapshot?.snapshot || {},
      raw_fragments: rawFragments && Object.keys(rawFragments).length > 0 ? rawFragments : undefined,
      observation_count: snapshot?.observation_count || 0,
      last_observation_at: snapshot?.last_observation_at || entity.created_at,
      provenance: snapshot?.provenance || {},
      computed_at: snapshot?.computed_at,
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

  // Get raw_fragments for this entity
  // Find all sources that have observations for this entity
  const { data: observations } = await supabase
    .from("observations")
    .select("source_id, user_id")
    .eq("entity_id", entityId)
    .not("source_id", "is", null)
    .limit(100); // Get sample of sources

  const rawFragments: Record<string, unknown> = {};
  if (observations && observations.length > 0) {
    // Get unique source_ids and user_ids
    const sourceIds = [...new Set(observations.map((o: any) => o.source_id).filter(Boolean))];
    const userIds = [...new Set(observations.map((o: any) => o.user_id).filter(Boolean))];
    const defaultUserId = "00000000-0000-0000-0000-000000000000";

    // Query raw_fragments for these sources with matching fragment_type
    let fragmentQuery = supabase
      .from("raw_fragments")
      .select("fragment_key, fragment_value, last_seen, first_seen, source_id")
      .eq("fragment_type", entity.entity_type)
      .in("source_id", sourceIds);

    // Handle user_id: check both provided user_ids and default UUID
    if (userIds.length > 0) {
      const userIdFilters = userIds.map((uid: string) => 
        uid === defaultUserId ? `user_id.eq.${defaultUserId},user_id.is.null` : `user_id.eq.${uid}`
      );
      fragmentQuery = fragmentQuery.or(userIdFilters.join(","));
    } else {
      fragmentQuery = fragmentQuery.or(`user_id.is.null,user_id.eq.${defaultUserId}`);
    }

    const { data: fragments, error: fragmentError } = await fragmentQuery;

    if (fragmentError) {
      console.warn(`Failed to get raw_fragments for entity ${entityId}:`, fragmentError.message);
    } else if (fragments && fragments.length > 0) {
      // Merge fragments by fragment_key (last_write: most recent last_seen wins)
      const fragmentMap = new Map<string, { value: unknown; last_seen: string }>();
      
      for (const fragment of fragments) {
        const key = fragment.fragment_key;
        const lastSeen = fragment.last_seen || fragment.first_seen || "";
        
        if (!fragmentMap.has(key) || 
            (fragmentMap.get(key)!.last_seen < lastSeen)) {
          fragmentMap.set(key, {
            value: fragment.fragment_value,
            last_seen: lastSeen,
          });
        }
      }

      // Convert to plain object, excluding fields already in snapshot
      const snapshotFields = new Set(Object.keys(snapshot?.snapshot || {}));
      for (const [key, { value }] of fragmentMap.entries()) {
        // Only include if not already in snapshot (avoid duplicates)
        if (!snapshotFields.has(key)) {
          rawFragments[key] = value;
        }
      }
    }
  }

  return {
    entity_id: entity.id,
    entity_type: entity.entity_type,
    canonical_name: entity.canonical_name,
    schema_version: snapshot?.schema_version || "1.0",
    snapshot: snapshot?.snapshot || {},
    raw_fragments: Object.keys(rawFragments).length > 0 ? rawFragments : undefined,
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

