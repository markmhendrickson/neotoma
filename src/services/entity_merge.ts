/**
 * Entity Merge Service (Domain Layer)
 *
 * Handles entity merge operations: validation, observation rewriting,
 * merge tracking, and snapshot cleanup. Extracted from actions.ts and
 * server.ts to enforce layer boundaries.
 */

import { db } from "../db.js";
import { rewriteObservationEntityId } from "./observation_storage.js";

export interface MergeEntitiesParams {
  fromEntityId: string;
  toEntityId: string;
  userId: string;
  mergeReason?: string;
  mergedBy: string;
}

export interface MergeResult {
  observations_moved: number;
  merged_at: string;
}

export async function mergeEntities(params: MergeEntitiesParams): Promise<MergeResult> {
  const { fromEntityId, toEntityId, userId, mergeReason, mergedBy } = params;

  const { data: fromEntity } = await db
    .from("entities")
    .select("id, merged_to_entity_id")
    .eq("id", fromEntityId)
    .eq("user_id", userId)
    .single();

  const { data: toEntity } = await db
    .from("entities")
    .select("id, merged_to_entity_id")
    .eq("id", toEntityId)
    .eq("user_id", userId)
    .single();

  if (!fromEntity || !toEntity) {
    throw new EntityNotFoundError("Entity not found");
  }

  if (fromEntity.merged_to_entity_id) {
    throw new EntityAlreadyMergedError("Source entity already merged");
  }

  if (toEntity.merged_to_entity_id) {
    throw new EntityAlreadyMergedError("Target entity already merged");
  }

  const observations_moved = await rewriteObservationEntityId(
    fromEntityId,
    toEntityId,
    userId
  );

  const merged_at = new Date().toISOString();

  const { error: mergeError } = await db
    .from("entities")
    .update({ merged_to_entity_id: toEntityId, merged_at })
    .eq("id", fromEntityId)
    .eq("user_id", userId);

  if (mergeError) throw new Error(`Failed to mark entity as merged: ${mergeError.message}`);

  await db.from("entity_merges").insert({
    user_id: userId,
    from_entity_id: fromEntityId,
    to_entity_id: toEntityId,
    reason: mergeReason,
    merged_by: mergedBy,
    observations_rewritten: observations_moved,
  });

  await db
    .from("entity_snapshots")
    .delete()
    .eq("entity_id", fromEntityId)
    .eq("user_id", userId);

  return { observations_moved, merged_at };
}

export class EntityNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntityNotFoundError";
  }
}

export class EntityAlreadyMergedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntityAlreadyMergedError";
  }
}
