import { db } from "../../db.js";
import { semanticSearchEntities } from "../../services/entity_semantic_search.js";
import { queryEntities } from "../../services/entity_queries.js";
import { generateEntityId, normalizeEntityValue } from "../../services/entity_resolution.js";

type RetrievedEntity = {
  id: string;
  entity_type: string;
  canonical_name: string;
  snapshot: unknown;
};

export interface RetrieveEntityByIdentifierParams {
  identifier: string;
  entityType?: string;
  userId: string;
  limit?: number;
}

export interface RetrieveEntityByIdentifierResult {
  entities: RetrievedEntity[];
  total: number;
}

export async function retrieveEntityByIdentifierWithFallback(
  params: RetrieveEntityByIdentifierParams
): Promise<RetrieveEntityByIdentifierResult> {
  const { identifier, entityType, userId, limit = 100 } = params;
  const normalized = entityType
    ? normalizeEntityValue(entityType, identifier)
    : identifier.trim().toLowerCase();

  let query = db
    .from("entities")
    .select("*")
    .eq("user_id", userId)
    .or(`canonical_name.ilike.%${normalized}%,aliases.cs.["${normalized}"]`)
    .order("canonical_name", { ascending: true })
    .order("id", { ascending: true });

  if (entityType) {
    query = query.eq("entity_type", entityType);
  }

  const { data: entities, error } = await query.limit(limit);
  if (error) {
    throw new Error(`Failed to search entities: ${error.message}`);
  }

  let directEntities = entities || [];
  if (directEntities.length === 0 && entityType) {
    const possibleId = generateEntityId(entityType, identifier);
    const { data: entityById, error: idError } = await db
      .from("entities")
      .select("*")
      .eq("id", possibleId)
      .eq("user_id", userId)
      .single();

    if (!idError && entityById) {
      directEntities = [entityById];
    }
  }

  if (directEntities.length === 0) {
    const { entityIds, total } = await semanticSearchEntities({
      searchText: identifier,
      userId,
      entityType,
      includeMerged: false,
      limit,
      offset: 0,
    });

    if (entityIds.length === 0) {
      return { entities: [], total: 0 };
    }

    const semanticEntities = await queryEntities({
      userId,
      includeMerged: false,
      entityIds,
      limit,
      offset: 0,
    });

    return {
      entities: semanticEntities.map((entity) => ({
        id: entity.entity_id,
        entity_type: entity.entity_type,
        canonical_name: entity.canonical_name,
        snapshot: entity.snapshot,
      })),
      total,
    };
  }

  const entityIds = directEntities.map((entity: { id: string }) => entity.id);
  const { data: snapshots } = await db
    .from("entity_snapshots")
    .select("*")
    .eq("user_id", userId)
    .in("entity_id", entityIds);

  const snapshotMap = new Map(
    (snapshots || []).map((snapshot: { entity_id: string }) => [snapshot.entity_id, snapshot])
  );
  const entitiesWithSnapshots = directEntities.map((entity: { id: string }) => ({
    ...entity,
    snapshot: snapshotMap.get(entity.id) || null,
  }));

  return {
    entities: entitiesWithSnapshots,
    total: entitiesWithSnapshots.length,
  };
}
