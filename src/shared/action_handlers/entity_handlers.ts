import { supabase } from "../../db.js";
import { queryEntities } from "../../services/entity_queries.js";

interface QueryEntitiesParams {
  userId: string;
  entityType?: string;
  includeMerged?: boolean;
  limit?: number;
  offset?: number;
}

export async function queryEntitiesWithCount(params: QueryEntitiesParams): Promise<{
  entities: Awaited<ReturnType<typeof queryEntities>>;
  total: number;
  excluded_merged: boolean;
}> {
  const { userId, entityType, includeMerged = false, limit = 100, offset = 0 } = params;
  const entities = await queryEntities({
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

  return {
    entities,
    total: count || 0,
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
