import { db } from "../../db.js";
import { queryEntities } from "../../services/entity_queries.js";
import { logger } from "../../utils/logger.js";
import { semanticSearchEntities } from "../../services/entity_semantic_search.js";
import type { EntityWithProvenance } from "../../services/entity_queries.js";

interface QueryEntitiesParams {
  userId: string;
  entityType?: string;
  includeMerged?: boolean;
  search?: string;
  similarityThreshold?: number;
  limit?: number;
  offset?: number;
}

async function countVisibleEntities(params: {
  userId: string;
  entityType?: string;
  includeMerged?: boolean;
}): Promise<number> {
  const { userId, entityType, includeMerged = false } = params;

  let entityIdQuery = db.from("entities").select("id").eq("user_id", userId);
  if (entityType) {
    entityIdQuery = entityIdQuery.eq("entity_type", entityType);
  }
  if (!includeMerged) {
    entityIdQuery = entityIdQuery.is("merged_to_entity_id", null);
  }

  const { data: entityRows, error: entityError } = await entityIdQuery;
  if (entityError) {
    throw new Error(`Failed to query entity ids for count: ${entityError.message}`);
  }
  if (!entityRows || entityRows.length === 0) {
    return 0;
  }

  const entityIds = entityRows.map((row: { id: string }) => row.id);
  const deletedEntityIds = new Set<string>();
  const chunkSize = 500;

  for (let i = 0; i < entityIds.length; i += chunkSize) {
    const chunk = entityIds.slice(i, i + chunkSize);
    const { data: deletionObservations, error: observationsError } = await db
      .from("observations")
      .select("entity_id, source_priority, observed_at, fields")
      .in("entity_id", chunk)
      .order("source_priority", { ascending: false })
      .order("observed_at", { ascending: false });

    if (observationsError) {
      throw new Error(`Failed to query deletion observations for count: ${observationsError.message}`);
    }

    const highestByEntity = new Map<string, any>();
    for (const obs of deletionObservations || []) {
      if (!highestByEntity.has(obs.entity_id)) {
        highestByEntity.set(obs.entity_id, obs);
      }
    }

    for (const [entityId, obs] of highestByEntity.entries()) {
      if (obs.fields?._deleted === true) {
        deletedEntityIds.add(entityId);
      }
    }
  }

  return entityIds.length - deletedEntityIds.size;
}

export async function queryEntitiesWithCount(params: QueryEntitiesParams): Promise<{
  entities: EntityWithProvenance[];
  total: number;
  excluded_merged: boolean;
}> {
  const {
    userId,
    entityType,
    includeMerged = false,
    search,
    similarityThreshold,
    limit = 100,
    offset = 0,
  } = params;

  let entities: EntityWithProvenance[];
  let total: number;

  if (search && search.trim()) {
    logger.info(
      `[queryEntitiesWithCount] semantic search path: userId=${userId} search=${search.trim().slice(0, 50)} entityType=${entityType ?? "(any)"}`
    );
    const { entityIds, total: semanticTotal } = await semanticSearchEntities({
      searchText: search.trim(),
      userId,
      entityType,
      includeMerged,
      similarityThreshold,
      limit,
      offset,
    });

    if (entityIds.length > 0) {
      entities = await queryEntities({
        userId,
        entityType,
        includeMerged,
        limit,
        offset: 0,
        entityIds,
      });
      const orderMap = new Map(entityIds.map((id, i) => [id, i]));
      entities.sort((a, b) => {
        const ai = orderMap.get(a.entity_id) ?? 9999;
        const bi = orderMap.get(b.entity_id) ?? 9999;
        return ai - bi;
      });
      total = semanticTotal;
    } else {
      entities = await queryEntities({
        userId,
        entityType,
        includeMerged,
        limit,
        offset,
      });
      const filtered = filterEntitiesBySearch(entities, search);
      entities = filtered;
      total = filtered.length;
    }
  } else {
    entities = await queryEntities({
      userId,
      entityType,
      includeMerged,
      limit,
      offset,
    });

    total = await countVisibleEntities({ userId, entityType, includeMerged });
  }

  return {
    entities,
    total,
    excluded_merged: !includeMerged,
  };
}

export function filterEntitiesBySearch<T extends { canonical_name: string }>(
  entities: T[],
  search?: string
): T[] {
  if (!search) return entities;
  const normalized = search.toLowerCase();
  return entities.filter((entity) => entity.canonical_name.toLowerCase().includes(normalized));
}
