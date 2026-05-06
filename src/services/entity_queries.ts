// FU-134: Query Updates
// Provenance chain, merged entity exclusion

import { db } from "../db.js";

export interface EntityQueryOptions {
  userId?: string;
  entityType?: string;
  includeMerged?: boolean;
  includeDeleted?: boolean;
  includeSnapshots?: boolean;
  sortBy?: "entity_id" | "canonical_name" | "observation_count" | "last_observation_at";
  sortOrder?: "asc" | "desc";
  published?: boolean;
  publishedAfter?: string;
  publishedBefore?: string;
  limit?: number;
  offset?: number;
  /** When provided, fetch only these entity IDs (e.g. from semantic search) */
  entityIds?: string[];
  /** ISO 8601 timestamp; return entities whose updated_at is >= this value. */
  updatedSince?: string;
  /** ISO 8601 timestamp; return entities whose created_at is >= this value. */
  createdSince?: string;
  /**
   * R3: filter entities whose observations were resolved with a specific
   * `identity_basis` (see {@link IdentityBasis} in entity_resolution.ts). The
   * filter is satisfied when ANY observation for the entity was resolved with
   * the requested basis, so callers can ask "which entities were created via
   * heuristic name matching?" without joining observations themselves.
   *
   * Implemented as a pre-filter: resolve candidate `entity_id`s from the
   * `observations` table and intersect with the main entity query.
   */
  identityBasis?:
    | "schema_rule"
    | "schema_lookup"
    | "heuristic_name"
    | "heuristic_fallback"
    | "target_id";
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
  /**
   * Optional schema-derived display label for `entity_type` (from
   * `SchemaMetadata.label`). Clients may surface this as a human-readable
   * subtitle to avoid re-deriving it per view.
   */
  entity_type_label?: string | null;
  /**
   * Optional ordered list of the most important snapshot fields for overview
   * display. Computed from schema field order when available. Clients are
   * free to ignore this and use their own ordering.
   */
  primary_fields?: string[];
  /**
   * Optional ISO timestamp of when the underlying `entities` row was created.
   * Surfaced here for overview cards; mirrors `entities.created_at`.
   */
  created_at?: string;
}

/** Row shape from entity_snapshots table (select *). */
interface EntitySnapshotRow {
  entity_id: string;
  schema_version?: string;
  snapshot?: Record<string, unknown>;
  observation_count?: number;
  last_observation_at?: string;
  provenance?: Record<string, unknown>;
  computed_at?: string;
  [key: string]: unknown;
}

const ENTITY_BASE_SELECT =
  "id, entity_type, canonical_name, user_id, merged_to_entity_id, merged_at, created_at";

async function getDeletedEntityIds(entityIds: string[]): Promise<Set<string>> {
  const deletedEntityIds = new Set<string>();
  if (entityIds.length === 0) {
    return deletedEntityIds;
  }

  const { data: deletionObservations } = await db
    .from("observations")
    .select("entity_id, source_priority, observed_at, fields")
    .in("entity_id", entityIds)
    .order("source_priority", { ascending: false })
    .order("observed_at", { ascending: false });

  if (!deletionObservations || deletionObservations.length === 0) {
    return deletedEntityIds;
  }

  // Result set is already sorted by priority and recency.
  const highestByEntity = new Map<string, any>();
  for (const obs of deletionObservations) {
    if (!highestByEntity.has(obs.entity_id)) {
      highestByEntity.set(obs.entity_id, obs);
    }
  }

  for (const [entityId, obs] of highestByEntity.entries()) {
    if (obs.fields?._deleted === true) {
      deletedEntityIds.add(entityId);
    }
  }

  return deletedEntityIds;
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
    includeDeleted = false,
    includeSnapshots = true,
    sortBy = "entity_id",
    sortOrder = "asc",
    published,
    publishedAfter,
    publishedBefore,
    limit = 100,
    offset = 0,
    entityIds: filterEntityIds,
    updatedSince,
    createdSince,
    identityBasis,
  } = options;

  // R3: when an `identity_basis` filter is set, resolve candidate entity_ids
  // from the observations table first. Distinct per entity; we only need the
  // presence of AT LEAST one observation with the requested basis. Intersect
  // with any caller-supplied `entityIds` so both filters compose.
  let identityBasisIds: string[] | null = null;
  if (identityBasis) {
    let obsQuery = db
      .from("observations")
      .select("entity_id")
      .eq("identity_basis", identityBasis);
    if (userId) {
      obsQuery = obsQuery.eq("user_id", userId);
    }
    const { data: obsRows, error: obsErr } = await obsQuery;
    if (obsErr) {
      throw new Error(
        `Failed to prefilter entities by identity_basis: ${obsErr.message}`
      );
    }
    const distinct = new Set<string>(
      (obsRows || []).map((r: { entity_id: string }) => r.entity_id)
    );
    // Empty result set → short-circuit to an empty match IDs list.
    identityBasisIds = Array.from(distinct);
    if (identityBasisIds.length === 0) {
      return [];
    }
  }

  const effectiveEntityIds: string[] | undefined = (() => {
    if (filterEntityIds && identityBasisIds) {
      const caller = new Set(filterEntityIds);
      return identityBasisIds.filter((id) => caller.has(id));
    }
    if (identityBasisIds) return identityBasisIds;
    return filterEntityIds;
  })();

  if (identityBasis && effectiveEntityIds && effectiveEntityIds.length === 0) {
    return [];
  }

  // Build query for entities
  let entityQuery = db.from("entities").select(ENTITY_BASE_SELECT);

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

  // Filter by specific entity IDs (e.g. from semantic search, R3 identity
  // basis pre-filter).
  if (effectiveEntityIds && effectiveEntityIds.length > 0) {
    entityQuery = entityQuery.in("id", effectiveEntityIds);
  }

  if (updatedSince) {
    entityQuery = entityQuery.gte("updated_at", updatedSince);
  }
  if (createdSince) {
    entityQuery = entityQuery.gte("created_at", createdSince);
  }

  const ascending = sortOrder === "asc";
  if (sortBy === "canonical_name") {
    entityQuery = entityQuery.order("canonical_name", { ascending });
  } else {
    entityQuery = entityQuery.order("id", { ascending: sortBy === "entity_id" ? ascending : true });
  }

  const shouldUseSnapshotDrivenScan =
    sortBy === "observation_count" ||
    sortBy === "last_observation_at" ||
    published !== undefined ||
    Boolean(publishedAfter) ||
    Boolean(publishedBefore);

  const fetchEntitiesByIds = async (ids: string[]) => {
    if (ids.length === 0) return [];
    let query = db.from("entities").select(ENTITY_BASE_SELECT).in("id", ids);
    if (userId) {
      query = query.eq("user_id", userId);
    }
    if (entityType) {
      query = query.eq("entity_type", entityType);
    }
    if (!includeMerged) {
      query = query.is("merged_to_entity_id", null);
    }
    if (updatedSince) {
      query = query.gte("updated_at", updatedSince);
    }
    if (createdSince) {
      query = query.gte("created_at", createdSince);
    }
    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to query entities: ${error.message}`);
    }
    return data || [];
  };

  let entities: any[] = [];
  if (shouldUseSnapshotDrivenScan) {
    const scanChunkSize = Math.max(200, Math.min(limit * 4, 1000));
    let scanOffset = 0;
    let visibleSkipped = 0;
    let exhausted = false;

    while (entities.length < limit && !exhausted) {
      let snapshotQuery = db.from("entity_snapshots").select("entity_id");
      if (userId) {
        snapshotQuery = snapshotQuery.eq("user_id", userId);
      }
      if (entityType) {
        snapshotQuery = snapshotQuery.eq("entity_type", entityType);
      }
      if (effectiveEntityIds && effectiveEntityIds.length > 0) {
        snapshotQuery = snapshotQuery.in("entity_id", effectiveEntityIds);
      }
      if (published !== undefined) {
        snapshotQuery = snapshotQuery.eq("snapshot->>published", published ? "true" : "false");
      }
      if (publishedAfter) {
        snapshotQuery = snapshotQuery.gte("snapshot->>published_date", publishedAfter);
      }
      if (publishedBefore) {
        snapshotQuery = snapshotQuery.lte("snapshot->>published_date", publishedBefore);
      }

      if (sortBy === "observation_count") {
        snapshotQuery = snapshotQuery.order("observation_count", { ascending });
      } else if (sortBy === "last_observation_at") {
        snapshotQuery = snapshotQuery.order("last_observation_at", { ascending });
      } else {
        snapshotQuery = snapshotQuery.order("entity_id", { ascending: true });
      }
      snapshotQuery = snapshotQuery.order("entity_id", { ascending: true }).range(
        scanOffset,
        scanOffset + scanChunkSize - 1
      );

      const { data: snapshotRows, error: snapshotError } = await snapshotQuery;
      if (snapshotError) {
        throw new Error(`Failed to query snapshot candidates: ${snapshotError.message}`);
      }

      const rows = snapshotRows || [];
      if (rows.length === 0) {
        exhausted = true;
        break;
      }
      scanOffset += rows.length;

      const orderedIds: string[] = rows.map((row: { entity_id: string }) => row.entity_id);
      const entityRows = await fetchEntitiesByIds(orderedIds);
      const entityById = new Map(entityRows.map((row: any) => [row.id, row]));

      const candidateRows = orderedIds
        .map((id: string) => entityById.get(id))
        .filter((row): row is any => Boolean(row));
      const deletedIds = includeDeleted
        ? new Set<string>()
        : await getDeletedEntityIds(candidateRows.map((row: any) => row.id));

      for (const row of candidateRows) {
        if (deletedIds.has(row.id)) {
          continue;
        }
        if (visibleSkipped < offset) {
          visibleSkipped += 1;
          continue;
        }
        entities.push(row);
        if (entities.length >= limit) {
          break;
        }
      }

      if (rows.length < scanChunkSize) {
        exhausted = true;
      }
    }
  } else if (includeDeleted) {
    const { data: pagedEntities, error: entitiesError } = await entityQuery.range(
      offset,
      offset + limit - 1
    );
    if (entitiesError) {
      throw new Error(`Failed to query entities: ${entitiesError.message}`);
    }
    entities = pagedEntities || [];
  } else {
    // Deleted-state visibility is resolved from highest-priority observations. To keep
    // payloads bounded, scan deterministically in chunks and stop once the requested page
    // of non-deleted entities is filled.
    const scanChunkSize = Math.max(200, Math.min(limit * 4, 1000));
    let scanOffset = 0;
    let visibleSkipped = 0;
    let exhausted = false;

    while (entities.length < limit && !exhausted) {
      const { data: chunk, error: chunkError } = await entityQuery.range(
        scanOffset,
        scanOffset + scanChunkSize - 1
      );
      if (chunkError) {
        throw new Error(`Failed to query entities: ${chunkError.message}`);
      }

      const rows = chunk || [];
      if (rows.length === 0) {
        exhausted = true;
        break;
      }

      scanOffset += rows.length;
      const chunkDeletedEntityIds = await getDeletedEntityIds(rows.map((row: any) => row.id));

      for (const row of rows) {
        if (chunkDeletedEntityIds.has(row.id)) {
          continue;
        }
        if (visibleSkipped < offset) {
          visibleSkipped += 1;
          continue;
        }
        entities.push(row);
        if (entities.length >= limit) {
          break;
        }
      }

      if (rows.length < scanChunkSize) {
        exhausted = true;
      }
    }
  }

  if (entities.length === 0) {
    return [];
  }

  const entityIds = entities.map((e: any) => e.id);
  const filteredEntityIds = entityIds;
  const snapshotSelect = includeSnapshots
    ? "*"
    : "entity_id, schema_version, observation_count, last_observation_at, computed_at";
  const { data: snapshots, error: snapshotsError } = await db
    .from("entity_snapshots")
    .select(snapshotSelect)
    .in("entity_id", entityIds);

  if (snapshotsError) {
    throw new Error(`Failed to query snapshots: ${snapshotsError.message}`);
  }

  const snapshotMap = new Map<string, EntitySnapshotRow>(
    (snapshots || []).map((s: EntitySnapshotRow) => [s.entity_id, s])
  );

  // Get raw_fragments for all entities (batch query)
  let allObservations: Array<{ entity_id: string; source_id: string | null; user_id: string | null }> = [];
  if (includeSnapshots) {
    const { data } = await db
      .from("observations")
      .select("entity_id, source_id, user_id")
      .in("entity_id", filteredEntityIds)
      .not("source_id", "is", null)
      .limit(1000); // Reasonable limit for batch
    allObservations = (data as Array<{ entity_id: string; source_id: string | null; user_id: string | null }>) || [];
  }

  // Group observations by entity_id to get source_ids per entity
  const entitySources = new Map<string, Set<string>>();
  const entityUserIds = new Map<string, Set<string>>();
  
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
        let fragmentQuery = db
          .from("raw_fragments")
          .select("fragment_key, fragment_value, last_seen, source_id, entity_id")
          .eq("entity_type", entityType)
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

        const { data: observationsForSources } = await db
          .from("observations")
          .select("entity_id, source_id")
          .eq("entity_type", entityType)
          .in("source_id", Array.from(sourceIdsForType));
        const legacyEntityCountsBySource = new Map<string, Set<string>>();
        for (const obs of observationsForSources || []) {
          if (!obs.source_id || !obs.entity_id) continue;
          if (!legacyEntityCountsBySource.has(obs.source_id)) {
            legacyEntityCountsBySource.set(obs.source_id, new Set());
          }
          legacyEntityCountsBySource.get(obs.source_id)!.add(obs.entity_id);
        }

        const { data: fragments } = await fragmentQuery;

        if (fragments && fragments.length > 0) {
          // Group fragments by entity (via source_id -> entity_id mapping)
          for (const fragment of fragments) {
            const fragmentEntityId =
              typeof (fragment as { entity_id?: unknown }).entity_id === "string"
                ? (fragment as { entity_id: string }).entity_id
                : null;
            const candidateEntityIds = fragmentEntityId
              ? [fragmentEntityId]
              : legacyEntityCountsBySource.get(fragment.source_id)?.size === 1
                ? [
                    Array.from(
                      legacyEntityCountsBySource.get(fragment.source_id) ?? [],
                    )[0],
                  ]
                : [];

            for (const entityId of candidateEntityIds) {
              if (!entityIdsOfType.includes(entityId)) continue;
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
      snapshot: includeSnapshots ? snapshot?.snapshot || {} : {},
      raw_fragments:
        includeSnapshots && rawFragments && Object.keys(rawFragments).length > 0
          ? rawFragments
          : undefined,
      observation_count: snapshot?.observation_count || 0,
      last_observation_at: snapshot?.last_observation_at || entity.created_at,
      provenance: includeSnapshots ? snapshot?.provenance || {} : {},
      computed_at: snapshot?.computed_at,
      merged_to_entity_id: entity.merged_to_entity_id,
      merged_at: entity.merged_at,
    };
  });
}

/**
 * Get entity snapshot with full provenance chain
 * 
 * Returns null if entity is deleted (has deletion observation).
 */
export async function getEntityWithProvenance(
  entityId: string,
  includeDeleted: boolean = false
): Promise<EntityWithProvenance | null> {
  // Get entity
  const { data: entity, error: entityError } = await db
    .from("entities")
    .select("*")
    .eq("id", entityId)
    .single();

  if (entityError || !entity) {
    return null;
  }

  // Check if entity is merged - redirect to target
  if (entity.merged_to_entity_id) {
    return getEntityWithProvenance(entity.merged_to_entity_id, includeDeleted);
  }

  // Check if entity is deleted (unless explicitly requested)
  if (!includeDeleted) {
    const { data: observations } = await db
      .from("observations")
      .select("source_priority, observed_at, fields")
      .eq("entity_id", entityId)
      .order("source_priority", { ascending: false })
      .order("observed_at", { ascending: false })
      .limit(1);

    if (observations && observations.length > 0) {
      const highestPriorityObs = observations[0];
      if (highestPriorityObs.fields?._deleted === true) {
        // Entity is deleted - return null
        return null;
      }
    }
  }

  // Get snapshot (treat non-PGRST116 errors as "no snapshot" so entity detail still returns)
  const { data: snapshot, error: snapshotError } = await db
    .from("entity_snapshots")
    .select("*")
    .eq("entity_id", entityId)
    .single();

  let effectiveSnapshot: EntitySnapshotRow | null = snapshot as EntitySnapshotRow | null;
  if (snapshotError && snapshotError.code !== "PGRST116") {
    console.warn(`Entity ${entityId}: snapshot query failed (${snapshotError.code}): ${snapshotError.message}. Returning entity without snapshot.`);
    effectiveSnapshot = null;
  }

  // Get raw_fragments for this entity
  // Find all sources that have observations for this entity
  const { data: observations } = await db
    .from("observations")
    .select("source_id, user_id")
    .eq("entity_id", entityId)
    .not("source_id", "is", null)
    .limit(100); // Get sample of sources

  const rawFragments: Record<string, unknown> = {};
  if (observations && observations.length > 0) {
    // Get unique source_ids and user_ids
    const sourceIds = [...new Set(observations.map((o: { source_id?: string }) => o.source_id).filter(Boolean))] as string[];
    const userIds = [...new Set(observations.map((o: { user_id?: string }) => o.user_id).filter((u: string | undefined): u is string => Boolean(u)))];
    const defaultUserId = "00000000-0000-0000-0000-000000000000";

    // Query raw_fragments for these sources with matching entity_type
    let fragmentQuery = db
      .from("raw_fragments")
      .select("fragment_key, fragment_value, last_seen, first_seen, source_id, entity_id")
      .eq("entity_type", entity.entity_type)
      .in("source_id", sourceIds);

    // Handle user_id: check both provided user_ids and default UUID
    if (userIds.length > 0) {
      const userIdFilters = userIds.map((uid) => 
        uid === defaultUserId ? `user_id.eq.${defaultUserId},user_id.is.null` : `user_id.eq.${uid}`
      );
      fragmentQuery = fragmentQuery.or(userIdFilters.join(","));
    } else {
      fragmentQuery = fragmentQuery.or(`user_id.is.null,user_id.eq.${defaultUserId}`);
    }

    const { data: observationsForSources } = await db
      .from("observations")
      .select("entity_id, source_id")
      .eq("entity_type", entity.entity_type)
      .in("source_id", sourceIds);
    const legacyEntityCountsBySource = new Map<string, Set<string>>();
    for (const obs of observationsForSources || []) {
      if (!obs.source_id || !obs.entity_id) continue;
      if (!legacyEntityCountsBySource.has(obs.source_id)) {
        legacyEntityCountsBySource.set(obs.source_id, new Set());
      }
      legacyEntityCountsBySource.get(obs.source_id)!.add(obs.entity_id);
    }

    const { data: fragments, error: fragmentError } = await fragmentQuery;

    if (fragmentError) {
      console.warn(`Failed to get raw_fragments for entity ${entityId}:`, fragmentError.message);
    } else if (fragments && fragments.length > 0) {
      // Merge fragments by fragment_key (last_write: most recent last_seen wins)
      const fragmentMap = new Map<string, { value: unknown; last_seen: string }>();
      
      for (const fragment of fragments) {
        const fragmentEntityId =
          typeof (fragment as { entity_id?: unknown }).entity_id === "string"
            ? (fragment as { entity_id: string }).entity_id
            : null;
        if (fragmentEntityId && fragmentEntityId !== entityId) continue;
        if (
          !fragmentEntityId &&
          (legacyEntityCountsBySource.get(fragment.source_id)?.size ?? 0) !== 1
        ) {
          // Legacy fragments have only source_id + entity_type. If that source
          // produced multiple entities of the same type, attribution is
          // ambiguous and showing them risks cross-entity contamination.
          continue;
        }
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
      const snapshotFields = new Set(Object.keys(effectiveSnapshot?.snapshot || {}));
      for (const [key, { value }] of fragmentMap.entries()) {
        // Only include if not already in snapshot (avoid duplicates)
        if (!snapshotFields.has(key)) {
          rawFragments[key] = value;
        }
      }
    }
  }

  // Best-effort schema-derived enrichments (label, primary fields). These
  // are optional and never block the entity response.
  let entityTypeLabel: string | null = null;
  let primaryFields: string[] | undefined;
  try {
    const { SchemaRegistryService } = await import("./schema_registry.js");
    const registry = new SchemaRegistryService();
    const schema = await registry.loadActiveSchema(
      entity.entity_type,
      entity.user_id ?? undefined,
    );
    if (schema?.metadata?.label) entityTypeLabel = schema.metadata.label;
    const snapshotObj = effectiveSnapshot?.snapshot ?? {};
    if (snapshotObj && Object.keys(snapshotObj).length > 0) {
      const schemaFieldOrder = schema?.schema_definition?.fields
        ? Object.keys(schema.schema_definition.fields)
        : [];
      const { orderedSnapshotKeys } = await import("./canonical_markdown.js");
      const ordered = orderedSnapshotKeys(snapshotObj, schemaFieldOrder);
      // Cap to a reasonable overview-card size; UI is free to pick fewer.
      primaryFields = ordered.slice(0, 8);
    }
  } catch (err) {
    // Non-fatal: leave enrichments unset.
    console.warn(
      `Failed to compute schema enrichments for entity ${entityId}:`,
      err instanceof Error ? err.message : err,
    );
  }

  return {
    entity_id: entity.id,
    entity_type: entity.entity_type,
    canonical_name: entity.canonical_name,
    schema_version: effectiveSnapshot?.schema_version || "1.0",
    snapshot: effectiveSnapshot?.snapshot || {},
    raw_fragments: Object.keys(rawFragments).length > 0 ? rawFragments : undefined,
    observation_count: effectiveSnapshot?.observation_count || 0,
    last_observation_at: effectiveSnapshot?.last_observation_at || entity.created_at,
    provenance: effectiveSnapshot?.provenance || {},
    computed_at: effectiveSnapshot?.computed_at || entity.created_at,
    merged_to_entity_id: entity.merged_to_entity_id,
    merged_at: entity.merged_at,
    entity_type_label: entityTypeLabel,
    primary_fields: primaryFields,
    created_at: entity.created_at,
  };
}

/**
 * Get source metadata for provenance chain
 */
export async function getSourceMetadata(sourceId: string) {
  const { data, error } = await db
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
  const { data, error } = await db
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
  const { data: observation, error: obsError } = await db
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

