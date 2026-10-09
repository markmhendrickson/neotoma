// Entity snapshot embedding generation for semantic search
// Embeds structured output (entity_type + canonical_name + snapshot) at upsert time

import { config } from "../config.js";
import {
  generateEmbedding,
  getEntitySearchableText,
  type EmbeddingAcquisitionTrace,
} from "../embeddings.js";
import { db } from "../db.js";
import { storeLocalEntityEmbedding } from "./local_entity_embedding.js";
import { getDb } from "../repositories/db/connection.js";

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
  canonicalName?: string | null,
  trace?: EmbeddingAcquisitionTrace
): Promise<EntitySnapshotRowWithEmbedding> {
  // Generate embedding for both pgvector and local (sqlite-vec)
  // Skip only when OPENAI_API_KEY is not configured
  const name = canonicalName ?? (await fetchCanonicalName(snapshotRow.entity_id));
  const effectiveName = name ?? snapshotRow.entity_id;

  const searchableText = getEntitySearchableText(
    snapshotRow.entity_type,
    effectiveName,
    snapshotRow.snapshot
  );

  const embedding = await generateEmbedding(searchableText, trace);

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
  row: EntitySnapshotRowWithEmbedding
): Promise<void> {
  const payload = getEntitySnapshotUpsertPayload(row);
  await db
    .from("entity_snapshots")
    .upsert(payload as Record<string, unknown>, { onConflict: "entity_id" });
  if (config.storageBackend === "local" && row.embedding) {
    await storeLocalEntityEmbedding({
      entity_id: row.entity_id,
      embedding: row.embedding,
      user_id: row.user_id,
      entity_type: row.entity_type,
      merged: false,
    });
  }
}

/**
 * Conditional writes defer provider work until their business commit. Refresh
 * only the embedding; never upsert an old business snapshot after a concurrent
 * correction. The native recheck and vector update share one write boundary.
 */
export async function refreshEntitySnapshotEmbeddingAfterCommit(
  entityId: string,
  userId: string
): Promise<void> {
  const before = await db
    .from("entity_snapshots")
    .select("*")
    .eq("entity_id", entityId)
    .eq("user_id", userId)
    .single();
  if (before.error || !before.data) throw new Error("Committed embedding basis is unavailable.");
  const original = before.data as EntitySnapshotRowForEmbedding;
  const trace: EmbeddingAcquisitionTrace = {};
  const prepared = await prepareEntitySnapshotWithEmbedding(original, undefined, trace);
  if (trace.reason === "embedding_unavailable" || trace.reason === "invalid_embedding")
    throw new Error("Committed embedding acquisition is unavailable.");
  if (!prepared.embedding) return;
  const { canonicalStoreRequest } = await import("./store_condition_keys.js");
  await (
    await getDb()
  ).transaction(async () => {
    const current = await db
      .from("entity_snapshots")
      .select("*")
      .eq("entity_id", entityId)
      .eq("user_id", userId)
      .single();
    if (
      current.error ||
      !current.data ||
      canonicalStoreRequest(current.data.snapshot) !== canonicalStoreRequest(original.snapshot) ||
      canonicalStoreRequest(current.data.provenance) !==
        canonicalStoreRequest(original.provenance) ||
      current.data.observation_count !== original.observation_count
    )
      throw new Error("Committed embedding basis changed before its derived update.");
    if (config.storageBackend === "local") {
      await storeLocalEntityEmbedding({
        entity_id: entityId,
        user_id: userId,
        entity_type: original.entity_type,
        embedding: prepared.embedding,
        merged: false,
      });
    } else {
      const saved = await db
        .from("entity_snapshots")
        .update({ embedding: prepared.embedding })
        .eq("entity_id", entityId)
        .eq("user_id", userId);
      if (saved.error) throw new Error("Committed embedding update failed.");
    }
  });
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
