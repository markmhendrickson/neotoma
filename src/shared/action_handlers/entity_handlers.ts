import { supabase } from "../../db.js";
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

    let countQuery = supabase.from("entities").select("*", { count: "exact", head: true });
    countQuery = countQuery.eq("user_id", userId);
    if (entityType) {
      countQuery = countQuery.eq("entity_type", entityType);
    }
    if (!includeMerged) {
      countQuery = countQuery.is("merged_to_entity_id", null);
    }
    const { count, error: countError } = await countQuery;
    if (countError) {
      throw new Error(`Failed to count entities: ${countError.message}`);
    }
    total = count || 0;
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
