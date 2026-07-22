// Entity snapshot embedding generation for semantic search
// Embeds structured output (entity_type + canonical_name + snapshot) at upsert time

import { config } from "../config.js";
import { generateEmbedding, getEntitySearchableText, hasEmbeddingProvider } from "../embeddings.js";
import { db } from "../db.js";
import { storeLocalEntityEmbedding } from "./local_entity_embedding.js";

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
  const { data, error } = await db
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
  canonicalName?: string | null
): Promise<EntitySnapshotRowWithEmbedding> {
  // Generate embedding for both pgvector and local (sqlite-vec)
  // Skip only when OPENAI_API_KEY is not configured
  if (!hasEmbeddingProvider()) {
    // No provider: short-circuit before the canonical_name lookup and the
    // snapshot JSON serialization, both of which exist only to build text for
    // an embedding that would be null anyway. Keeps the no-provider store path
    // at the same cost as the pre-embedding raw upsert.
    return { ...snapshotRow, embedding: null };
  }

  const name = canonicalName ?? (await fetchCanonicalName(snapshotRow.entity_id));
  const effectiveName = name ?? snapshotRow.entity_id;

  const searchableText = getEntitySearchableText(
    snapshotRow.entity_type,
    effectiveName,
    snapshotRow.snapshot
  );

  const embedding = await generateEmbedding(searchableText);

  return {
    ...snapshotRow,
    embedding: embedding ?? null,
  };
}

/**
 * Upsert entity snapshot and store embedding for local backend when present.
 * Single entry point for all entity_snapshots upserts to ensure local embedding storage.
 */
export async function upsertEntitySnapshotWithEmbedding(
  row: EntitySnapshotRowWithEmbedding,
  options?: { throwOnError?: boolean }
): Promise<void> {
  const payload = getEntitySnapshotUpsertPayload(row);
  const { error } = await db
    .from("entity_snapshots")
    .upsert(payload as Record<string, unknown>, { onConflict: "entity_id" });
  // Existing repair-loop callers relied on this never throwing; only the
  // primary store path opts into strict error propagation, which is what the
  // raw upsert it replaced already did.
  if (error && options?.throwOnError) {
    throw new Error(error.message);
  }
  if (config.storageBackend === "local" && row.embedding) {
    storeLocalEntityEmbedding({
      entity_id: row.entity_id,
      embedding: row.embedding,
      user_id: row.user_id,
      entity_type: row.entity_type,
      merged: false,
    });
  }
}

/**
 * Get the entity_snapshots row payload for upsert, including embedding when supported.
 * Omits embedding for local/SQLite backend (no embedding column).
 */
export function getEntitySnapshotUpsertPayload(
  row: EntitySnapshotRowWithEmbedding
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
