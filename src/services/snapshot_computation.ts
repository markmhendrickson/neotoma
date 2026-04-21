/**
 * Snapshot Computation Service (Domain Layer)
 *
 * Handles entity snapshot queries and recomputation. Extracted from
 * actions.ts and server.ts to enforce layer boundaries.
 */

import { db } from "../db.js";
import { logger } from "../utils/logger.js";
import { observationReducer } from "../reducers/observation_reducer.js";
import {
  CanonicalNameUnresolvedError,
  deriveCanonicalNameFromFieldsWithTrace,
  generateEntityId,
} from "./entity_resolution.js";
import { schemaRegistry, type SchemaDefinition } from "./schema_registry.js";
import { upsertTimelineEventsForEntitySnapshot } from "./timeline_events.js";

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

  const sourceId =
    typeof (observations[0] as { source_id?: string | null }).source_id === "string"
      ? ((observations[0] as { source_id: string }).source_id || "")
      : "";

  let schema: SchemaDefinition | null = null;
  try {
    const entry = await schemaRegistry.loadActiveSchema(
      computed.entity_type,
      computed.user_id || userId,
    );
    schema = entry?.schema_definition ?? null;
  } catch {
    schema = null;
  }

  await upsertTimelineEventsForEntitySnapshot({
    entityType: computed.entity_type,
    entityId: computed.entity_id,
    sourceId,
    userId: computed.user_id || userId,
    snapshot: (computed.snapshot as Record<string, unknown>) || {},
    // Skip raw_fragments: recomputation is per-entity; shared source+type fragments could mis-attach.
    sameTypeInSourceBatch: 2,
    schema,
  });

  // Opportunistic canonical_name evolution: when the merged snapshot now has
  // more identity-bearing fields than the row that created this entity, try
  // to re-derive a stronger canonical_name and (when it does not collide with
  // another row) update entities.canonical_name and push the prior name into
  // aliases. entity_id stays stable since it was hashed from the original
  // name; the new name is retrievable via canonical_name/aliases search.
  try {
    await maybeRederiveCanonicalName({
      entityId,
      entityType: computed.entity_type,
      userId: computed.user_id || userId,
      snapshot: (computed.snapshot as Record<string, unknown>) || {},
      schema,
    });
  } catch (err) {
    logger.warn(
      `[SNAPSHOT] Failed to re-derive canonical_name for ${entityId}: ` +
        (err instanceof Error ? err.message : String(err)),
    );
  }

  return computed as SnapshotRecord;
}

async function maybeRederiveCanonicalName(params: {
  entityId: string;
  entityType: string;
  userId: string;
  snapshot: Record<string, unknown>;
  schema: SchemaDefinition | null;
}): Promise<void> {
  const { entityId, entityType, userId, snapshot, schema } = params;
  if (!snapshot || Object.keys(snapshot).length === 0) return;

  let derived;
  try {
    derived = deriveCanonicalNameFromFieldsWithTrace(entityType, snapshot, schema);
  } catch (err) {
    if (err instanceof CanonicalNameUnresolvedError) {
      // Not enough signal in the snapshot yet; leave the current name in place.
      return;
    }
    throw err;
  }

  const newCanonicalName = derived.canonicalName;
  if (!newCanonicalName) return;

  const { data: entityRow, error: fetchError } = await db
    .from("entities")
    .select("id, canonical_name, aliases, user_id")
    .eq("id", entityId)
    .maybeSingle();
  if (fetchError) return;
  if (!entityRow) return;

  const currentCanonicalName = String(entityRow.canonical_name ?? "").trim();
  if (!currentCanonicalName || currentCanonicalName === newCanonicalName) return;

  // Collision guard: refuse to rename if another entity already occupies the
  // (entity_type, canonical_name) slot — either by hashed id or by the text
  // column — because that would silently converge two distinct records.
  const collisionId = generateEntityId(entityType, newCanonicalName);
  if (collisionId !== entityId) {
    const { data: collisionById } = await db
      .from("entities")
      .select("id")
      .eq("id", collisionId)
      .maybeSingle();
    if (collisionById) {
      logger.info(
        `[SNAPSHOT] Skipping canonical_name rename for ${entityId}: ` +
          `${newCanonicalName} already hashes to ${collisionId}.`,
      );
      return;
    }
  }
  const { data: collisionByName } = await db
    .from("entities")
    .select("id")
    .eq("entity_type", entityType)
    .eq("canonical_name", newCanonicalName)
    .not("id", "eq", entityId)
    .limit(1);
  if (Array.isArray(collisionByName) && collisionByName.length > 0) {
    logger.info(
      `[SNAPSHOT] Skipping canonical_name rename for ${entityId}: ` +
        `another ${entityType} entity already uses "${newCanonicalName}".`,
    );
    return;
  }

  // Preserve the prior name so search by the old identifier still works.
  const existingAliases = Array.isArray(entityRow.aliases)
    ? (entityRow.aliases as string[])
    : [];
  const nextAliases = existingAliases.includes(currentCanonicalName)
    ? existingAliases
    : [...existingAliases, currentCanonicalName];

  const { error: updateError } = await db
    .from("entities")
    .update({
      canonical_name: newCanonicalName,
      aliases: nextAliases,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entityId)
    .eq("user_id", userId);

  if (updateError) {
    logger.warn(
      `[SNAPSHOT] canonical_name rename failed for ${entityId}: ${updateError.message}`,
    );
    return;
  }

  logger.info(
    `[SNAPSHOT] canonical_name evolved for ${entityId}: ` +
      `"${currentCanonicalName}" -> "${newCanonicalName}" (prior kept as alias)`,
  );
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
