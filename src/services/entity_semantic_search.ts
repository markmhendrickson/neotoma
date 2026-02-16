// Entity semantic search via pgvector similarity over entity_snapshots
// Structural filters (user_id, entity_type, merged) always applied

import type { SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.js";
import { generateEmbedding } from "../embeddings.js";
import { supabase } from "../db.js";

export interface SemanticSearchEntitiesOptions {
  searchText: string;
  userId: string;
  entityType?: string;
  includeMerged?: boolean;
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
 * Returns empty result when: local/SQLite backend, no embeddings, or OPENAI not configured.
 */
export async function semanticSearchEntities(
  options: SemanticSearchEntitiesOptions,
): Promise<SemanticSearchEntitiesResult> {
  const {
    searchText,
    userId,
    entityType,
    includeMerged = false,
    limit,
    offset,
  } = options;

  // Semantic search requires Supabase (pgvector); local SQLite does not support it
  if (config.storageBackend === "local") {
    return { entityIds: [], total: 0 };
  }

  const queryEmbedding = await generateEmbedding(searchText);
  if (!queryEmbedding) {
    return { entityIds: [], total: 0 };
  }

  // Call RPC for vector similarity search (Supabase only; we returned early for local)
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
    console.warn("Entity semantic search failed:", error.message);
    return { entityIds: [], total: 0 };
  }

  const rows = (data ?? []) as Array<{ entity_id: string; similarity: number }>;
  const entityIds = rows.map((r) => r.entity_id);
  const total = entityIds.length;

  return { entityIds, total };
}
