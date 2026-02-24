// Entity semantic search via pgvector or sqlite-vec (local)
// Structural filters (user_id, entity_type, merged) always applied

import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { generateEmbedding } from "../embeddings.js";
import { searchLocalEntityEmbeddings } from "./local_entity_embedding.js";

export interface SemanticSearchEntitiesOptions {
  searchText: string;
  userId: string;
  entityType?: string;
  includeMerged?: boolean;
  /** Distance threshold (0–2). Results with distance >= threshold are dropped. Only applied in local mode. */
  similarityThreshold?: number;
  limit: number;
  offset: number;
}

export interface SemanticSearchEntitiesResult {
  entityIds: string[];
  total: number;
}

/**
 * Semantic search over entity_snapshots by embedding similarity.
 * Returns entity IDs ordered by similarity. Structural filters always applied.
 * Returns empty result when: no embeddings or OPENAI not configured.
 * Uses sqlite-vec in local-only mode.
 */
export async function semanticSearchEntities(
  options: SemanticSearchEntitiesOptions,
): Promise<SemanticSearchEntitiesResult> {
  const {
    searchText,
    userId,
    entityType,
    includeMerged = false,
    similarityThreshold,
    limit,
    offset,
  } = options;

  const queryEmbedding = await generateEmbedding(searchText);
  if (!queryEmbedding) {
    logger.warn("[entity_semantic_search] No query embedding (OPENAI_API_KEY?)");
    return { entityIds: [], total: 0 };
  }

  const entityIds = searchLocalEntityEmbeddings({
    queryEmbedding,
    userId,
    entityType: entityType ?? null,
    includeMerged,
    distanceThreshold: similarityThreshold,
    limit,
    offset,
  });

  logger.info(
    `[entity_semantic_search] local userId=${userId} search="${searchText.slice(0, 40)}${searchText.length > 40 ? "..." : ""}" entityIds=${entityIds.length} backend=${config.storageBackend}`
  );
  return { entityIds, total: entityIds.length };
}
