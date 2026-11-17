// Entity semantic search via pgvector or sqlite-vec (local)
// Structural filters (user_id, entity_type, merged) always applied

import type { EntityFallbackReason, EntityReadTrace } from "../shared/entity_read_contract.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { generateEmbedding, type EmbeddingAcquisitionTrace } from "../embeddings.js";
import {
  describeLocalSemanticUnavailableReason,
  localSemanticSearchUnavailableReason,
  searchLocalEntityEmbeddings,
  type LocalSemanticUnavailableReason,
} from "./local_entity_embedding.js";

const warnedUnavailableReasons = new Set<LocalSemanticUnavailableReason>();

export interface SemanticSearchEntitiesOptions {
  searchText: string;
  readTrace?: EntityReadTrace;
  userId: string;
  entityType?: string;
  /** Multi-type filter, OR-combined with `entityType` (#1562). */
  entityTypes?: string[];
  includeMerged?: boolean;
  /** Distance threshold (0–2). Results with distance >= threshold are dropped. Only applied in local mode. */
  similarityThreshold?: number;
  limit: number;
  offset: number;
}

export interface SemanticSearchEntitiesResult {
  entityIds: string[];
  total: number;
  fallbackReason?: EntityFallbackReason;
}

/**
 * Semantic search over entity_snapshots by embedding similarity.
 * Returns entity IDs ordered by similarity. Structural filters always applied.
 * Returns empty result when: no embeddings or OPENAI not configured.
 * Uses sqlite-vec in local-only mode.
 */
export async function semanticSearchEntities(
  options: SemanticSearchEntitiesOptions
): Promise<SemanticSearchEntitiesResult> {
  const {
    searchText,
    userId,
    entityType,
    entityTypes,
    includeMerged = false,
    similarityThreshold,
    limit,
    offset,
  } = options;

  // Without a vector backend an embedding can be neither stored nor searched,
  // so skip the provider call and let the caller use its lexical fallback.
  const unavailable = await localSemanticSearchUnavailableReason();
  if (unavailable) {
    if (!warnedUnavailableReasons.has(unavailable)) {
      warnedUnavailableReasons.add(unavailable);
      logger.warn(
        `[entity_semantic_search] semantic search skipped: ${describeLocalSemanticUnavailableReason(unavailable)}; using lexical fallback`
      );
    }
    options.readTrace?.reasons.add("semantic_backend_unavailable");
    // Same vocabulary as searchLocalEntityEmbeddings for a missing vector backend.
    return {
      entityIds: [],
      total: 0,
      fallbackReason: config.openaiApiKey ? "unknown" : "not_configured",
    };
  }

  const embeddingTrace: EmbeddingAcquisitionTrace = {};
  const queryEmbedding = await generateEmbedding(searchText, embeddingTrace);
  if (!queryEmbedding) {
    logger.warn("[entity_semantic_search] No query embedding (OPENAI_API_KEY?)");
    return {
      entityIds: [],
      total: 0,
      fallbackReason:
        embeddingTrace.reason === "embedding_not_configured"
          ? "not_configured"
          : "embedding_unavailable",
    };
  }

  const { entityIds, total, fallbackReason } = await searchLocalEntityEmbeddings({
    readTrace: options.readTrace,
    queryEmbedding,
    userId,
    entityType: entityType ?? null,
    entityTypes,
    includeMerged,
    distanceThreshold: similarityThreshold,
    limit,
    offset,
  });

  logger.info(
    `[entity_semantic_search] local userId=${userId} search="${searchText.slice(0, 40)}${searchText.length > 40 ? "..." : ""}" entityIds=${entityIds.length} backend=${config.storageBackend}`
  );
  return { entityIds, total, ...(fallbackReason ? { fallbackReason } : {}) };
}
