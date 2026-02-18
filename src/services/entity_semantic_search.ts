// Entity semantic search via pgvector (Supabase) or sqlite-vec (local)
// Structural filters (user_id, entity_type, merged) always applied

import type { SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { generateEmbedding } from "../embeddings.js";
import { supabase } from "../db.js";
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
 * Local mode uses sqlite-vec; Supabase uses pgvector.
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

  // Local mode: sqlite-vec KNN
  if (config.storageBackend === "local") {
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
      `[entity_semantic_search] local userId=${userId} search="${searchText.slice(0, 40)}${searchText.length > 40 ? "..." : ""}" entityIds=${entityIds.length}`
    );
    return { entityIds, total: entityIds.length };
  }

  // Supabase: pgvector RPC
  const client = supabase as SupabaseClient;
  const { data, error } = await client.rpc("search_entity_snapshots_by_embedding", {
    query_embedding: queryEmbedding,
    p_user_id: userId,
    p_entity_type: entityType ?? null,
    p_include_merged: includeMerged,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    logger.warn(`[entity_semantic_search] Supabase RPC failed: ${error.message}`);
    return { entityIds: [], total: 0 };
  }

  const rows = (data ?? []) as Array<{ entity_id: string; similarity: number }>;
  const entityIds = rows.map((r) => r.entity_id);
  const total = entityIds.length;

  return { entityIds, total };
}
