/**
 * Snapshot Computation Service (Domain Layer)
 *
 * Handles entity snapshot queries and recomputation. Extracted from
 * actions.ts and server.ts to enforce layer boundaries.
 */

import { db } from "../db.js";
import { observationReducer } from "../reducers/observation_reducer.js";

export interface SnapshotRecord {
  entity_id: string;
  entity_type: string;
  schema_version: string;
  snapshot: Record<string, unknown>;
  computed_at: string;
  observation_count: number;
  last_observation_at: string;
  provenance: Record<string, string>;
  user_id: string;
}

export async function getSnapshot(
  entityId: string,
  userId: string
): Promise<SnapshotRecord | null> {
  const { data, error } = await db
    .from("entity_snapshots")
    .select("*")
    .eq("entity_id", entityId)
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to get snapshot: ${error.message}`);
  }

  return data as SnapshotRecord | null;
}

export async function deleteSnapshot(
  entityId: string,
  userId: string
): Promise<void> {
  await db
    .from("entity_snapshots")
    .delete()
    .eq("entity_id", entityId)
    .eq("user_id", userId);
}

export async function recomputeSnapshot(
  entityId: string,
  userId: string
): Promise<SnapshotRecord | null> {
  const { data: observations, error } = await db
    .from("observations")
    .select("*")
    .eq("entity_id", entityId)
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to fetch observations for recomputation: ${error.message}`);
  if (!observations || observations.length === 0) return null;

  const computed = await observationReducer.computeSnapshot(entityId, observations);
  if (!computed) {
    await deleteSnapshot(entityId, userId);
    return null;
  }

  const { error: upsertError } = await db
    .from("entity_snapshots")
    .upsert({ ...computed } as Record<string, unknown>);

  if (upsertError) throw new Error(`Failed to upsert snapshot: ${upsertError.message}`);

  return computed as SnapshotRecord;
}

export async function findStaleSnapshots(
  userId: string
): Promise<Array<{ entity_id: string; entity_type: string }>> {
  const { data, error } = await db
    .from("entity_snapshots")
    .select("entity_id, entity_type")
    .eq("user_id", userId)
    .eq("observation_count", 0);

  if (error) throw new Error(`Failed to find stale snapshots: ${error.message}`);
  return (data || []) as Array<{ entity_id: string; entity_type: string }>;
}
