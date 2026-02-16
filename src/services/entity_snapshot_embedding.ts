// Entity snapshot embedding generation for semantic search
// Embeds structured output (entity_type + canonical_name + snapshot) at upsert time

import { config } from "../config.js";
import { generateEmbedding, getEntitySearchableText } from "../embeddings.js";
import { supabase } from "../db.js";

export interface EntitySnapshotRowForEmbedding {
  entity_id: string;
  entity_type: string;
  schema_version: string;
  snapshot: Record<string, unknown>;
  computed_at: string;
  observation_count: number;
  last_observation_at: string;
  provenance: Record<string, unknown>;
  user_id: string;
}

export interface EntitySnapshotRowWithEmbedding extends EntitySnapshotRowForEmbedding {
  embedding?: number[] | null;
}

/**
 * Fetch canonical_name for an entity from the entities table.
 */
async function fetchCanonicalName(entityId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("entities")
    .select("canonical_name")
    .eq("id", entityId)
    .single();

  if (error || !data) {
    return null;
  }
  return (data as { canonical_name: string }).canonical_name;
}

/**
 * Prepare an entity snapshot row with embedding for upsert.
 * Fetches canonical_name from entities if not provided, builds searchable text,
 * generates embedding when OPENAI is configured, and returns the row with embedding.
 */
export async function prepareEntitySnapshotWithEmbedding(
  snapshotRow: EntitySnapshotRowForEmbedding,
  canonicalName?: string | null,
): Promise<EntitySnapshotRowWithEmbedding> {
  // Embedding only supported on Supabase (pgvector); SQLite has no embedding column
  if (config.storageBackend === "local") {
    return { ...snapshotRow, embedding: null };
  }

  const name =
    canonicalName ?? (await fetchCanonicalName(snapshotRow.entity_id));
  const effectiveName = name ?? snapshotRow.entity_id;

  const searchableText = getEntitySearchableText(
    snapshotRow.entity_type,
    effectiveName,
    snapshotRow.snapshot,
  );

  const embedding = await generateEmbedding(searchableText);

  return {
    ...snapshotRow,
    embedding: embedding ?? null,
  };
}

/**
 * Get the entity_snapshots row payload for upsert, including embedding when supported.
 * Omits embedding for local/SQLite backend (no embedding column).
 */
export function getEntitySnapshotUpsertPayload(
  row: EntitySnapshotRowWithEmbedding,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    entity_id: row.entity_id,
    entity_type: row.entity_type,
    schema_version: row.schema_version,
    snapshot: row.snapshot,
    computed_at: row.computed_at,
    observation_count: row.observation_count,
    last_observation_at: row.last_observation_at,
    provenance: row.provenance,
    user_id: row.user_id,
  };
  if (config.storageBackend !== "local" && "embedding" in row) {
    payload.embedding = row.embedding;
  }
  return payload;
}
