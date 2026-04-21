import { db } from "../../db.js";
import { queryEntities } from "../../services/entity_queries.js";
import { logger } from "../../utils/logger.js";
import { semanticSearchEntities } from "../../services/entity_semantic_search.js";
import type { EntityWithProvenance } from "../../services/entity_queries.js";

interface QueryEntitiesParams {
  userId: string;
  entityType?: string;
  includeMerged?: boolean;
  includeSnapshots?: boolean;
  sortBy?: "entity_id" | "canonical_name" | "observation_count" | "last_observation_at";
  sortOrder?: "asc" | "desc";
  published?: boolean;
  publishedAfter?: string;
  publishedBefore?: string;
  search?: string;
  similarityThreshold?: number;
  limit?: number;
  offset?: number;
  updatedSince?: string;
  createdSince?: string;
}

const MAX_LEXICAL_CANDIDATES = 5000;

interface LexicalSearchEntityIdsParams {
  userId: string;
  entityType?: string;
  includeMerged?: boolean;
  search: string;
}

type SnapshotRow = {
  entity_id: string;
  snapshot?: unknown;
};

type LexicalMatch = {
  entityId: string;
  canonicalName: string;
  score: number;
};

export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesSearchTokens(searchableText: string, searchTokens: string[]): boolean {
  if (searchTokens.length === 0) return false;
  const normalized = normalizeSearchText(searchableText);
  return searchTokens.every((token) => normalized.includes(token));
}

function stringifySnapshot(snapshot: unknown): string {
  if (typeof snapshot === "string") {
    return snapshot;
  }
  if (snapshot == null) {
    return "";
  }
  try {
    return JSON.stringify(snapshot);
  } catch {
    return "";
  }
}

async function lexicalSearchEntityIds(params: LexicalSearchEntityIdsParams): Promise<{
  entityIds: string[];
  total: number;
}> {
  const { userId, entityType, includeMerged = false, search } = params;
  const normalizedSearch = normalizeSearchText(search);
  const searchTokens = normalizedSearch.split(" ").filter(Boolean);
  if (searchTokens.length === 0) {
    return { entityIds: [], total: 0 };
  }

  let entityQuery = db
    .from("entities")
    .select("id, canonical_name")
    .eq("user_id", userId)
    .order("id", { ascending: true })
    .limit(MAX_LEXICAL_CANDIDATES);

  if (entityType) {
    entityQuery = entityQuery.eq("entity_type", entityType);
  }
  if (!includeMerged) {
    entityQuery = entityQuery.is("merged_to_entity_id", null);
  }

  const { data: entities, error: entitiesError } = await entityQuery;
  if (entitiesError) {
    throw new Error(`Failed lexical candidate query: ${entitiesError.message}`);
  }
  if (!entities || entities.length === 0) {
    return { entityIds: [], total: 0 };
  }

  const entityIds = entities.map((entity: { id: string }) => entity.id);
  const snapshotMap = new Map<string, unknown>();
  const chunkSize = 500;

  for (let i = 0; i < entityIds.length; i += chunkSize) {
    const chunk = entityIds.slice(i, i + chunkSize);
    const { data: snapshots, error: snapshotsError } = await db
      .from("entity_snapshots")
      .select("entity_id, snapshot")
      .in("entity_id", chunk);

    if (snapshotsError) {
      throw new Error(`Failed lexical snapshot query: ${snapshotsError.message}`);
    }

    for (const snapshot of (snapshots || []) as SnapshotRow[]) {
      snapshotMap.set(snapshot.entity_id, snapshot.snapshot);
    }
  }

  const lexicalMatches: LexicalMatch[] = [];
  for (const entity of entities as Array<{ id: string; canonical_name: string }>) {
    const normalizedCanonical = normalizeSearchText(entity.canonical_name);
    const normalizedSnapshot = normalizeSearchText(stringifySnapshot(snapshotMap.get(entity.id)));
    const searchableText = `${normalizedCanonical} ${normalizedSnapshot}`.trim();
    if (matchesSearchTokens(searchableText, searchTokens)) {
      let score = 0;
      if (normalizedCanonical.includes(normalizedSearch)) {
        score += 300;
      }
      if (normalizedSnapshot.includes(normalizedSearch)) {
        score += 180;
      }
      if (searchableText.startsWith(normalizedSearch)) {
        score += 40;
      }
      for (const token of searchTokens) {
        if (normalizedCanonical.includes(token)) {
          score += 24;
        }
        if (normalizedSnapshot.includes(token)) {
          score += 10;
        }
      }
      lexicalMatches.push({
        entityId: entity.id,
        canonicalName: entity.canonical_name,
        score,
      });
    }
  }

  lexicalMatches.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const canonicalCompare = a.canonicalName.localeCompare(b.canonicalName);
    if (canonicalCompare !== 0) {
      return canonicalCompare;
    }
    return a.entityId.localeCompare(b.entityId);
  });

  const matchedIds = lexicalMatches.map((match) => match.entityId);

  return { entityIds: matchedIds, total: matchedIds.length };
}

async function countVisibleEntities(params: {
  userId: string;
  entityType?: string;
  includeMerged?: boolean;
  published?: boolean;
  publishedAfter?: string;
  publishedBefore?: string;
  updatedSince?: string;
  createdSince?: string;
}): Promise<number> {
  const {
    userId,
    entityType,
    includeMerged = false,
    published,
    publishedAfter,
    publishedBefore,
    updatedSince,
    createdSince,
  } = params;

  let entityIdQuery = db.from("entities").select("id").eq("user_id", userId);
  if (entityType) {
    entityIdQuery = entityIdQuery.eq("entity_type", entityType);
  }
  if (!includeMerged) {
    entityIdQuery = entityIdQuery.is("merged_to_entity_id", null);
  }
  if (updatedSince) {
    entityIdQuery = entityIdQuery.gte("updated_at", updatedSince);
  }
  if (createdSince) {
    entityIdQuery = entityIdQuery.gte("created_at", createdSince);
  }
  if (published !== undefined || publishedAfter || publishedBefore) {
    let snapshotQuery = db
      .from("entity_snapshots")
      .select("entity_id")
      .eq("user_id", userId);
    if (entityType) {
      snapshotQuery = snapshotQuery.eq("entity_type", entityType);
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
    const { data: snapshotRows, error: snapshotError } = await snapshotQuery;
    if (snapshotError) {
      throw new Error(`Failed to query snapshot ids for count: ${snapshotError.message}`);
    }
    const snapshotEntityIds = (snapshotRows || []).map((row: { entity_id: string }) => row.entity_id);
    if (snapshotEntityIds.length === 0) {
      return 0;
    }
    entityIdQuery = entityIdQuery.in("id", snapshotEntityIds);
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
    includeSnapshots = true,
    sortBy = "entity_id",
    sortOrder = "asc",
    published,
    publishedAfter,
    publishedBefore,
    search,
    similarityThreshold,
    limit = 100,
    offset = 0,
    updatedSince,
    createdSince,
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
        includeSnapshots,
        sortBy,
        sortOrder,
        published,
        publishedAfter,
        publishedBefore,
        limit,
        offset: 0,
        entityIds,
        updatedSince,
        createdSince,
      });
      const orderMap = new Map(entityIds.map((id, i) => [id, i]));
      entities.sort((a, b) => {
        const ai = orderMap.get(a.entity_id) ?? 9999;
        const bi = orderMap.get(b.entity_id) ?? 9999;
        return ai - bi;
      });
      total = semanticTotal;
    } else {
      const { entityIds: lexicalIds, total: lexicalTotal } = await lexicalSearchEntityIds({
        userId,
        entityType,
        includeMerged,
        search: search.trim(),
      });

      if (lexicalIds.length === 0) {
        entities = [];
        total = 0;
      } else {
        const paginatedIds = lexicalIds.slice(offset, offset + limit);
        entities = await queryEntities({
          userId,
          entityType,
          includeMerged,
          includeSnapshots,
          sortBy,
          sortOrder,
          published,
          publishedAfter,
          publishedBefore,
          updatedSince,
          createdSince,
          limit: paginatedIds.length,
          offset: 0,
          entityIds: paginatedIds,
        });

        const orderMap = new Map(paginatedIds.map((id, i) => [id, i]));
        entities.sort((a, b) => {
          const ai = orderMap.get(a.entity_id) ?? 9999;
          const bi = orderMap.get(b.entity_id) ?? 9999;
          return ai - bi;
        });
        total = lexicalTotal;
      }
    }
  } else {
    entities = await queryEntities({
      userId,
      entityType,
      includeMerged,
      includeSnapshots,
      sortBy,
      sortOrder,
      published,
      publishedAfter,
      publishedBefore,
      limit,
      offset,
      updatedSince,
      createdSince,
    });

    total = await countVisibleEntities({
      userId,
      entityType,
      includeMerged,
      published,
      publishedAfter,
      publishedBefore,
      updatedSince,
      createdSince,
    });
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
