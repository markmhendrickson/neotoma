/**
 * Raw Fragments Service (Domain Layer)
 *
 * Handles storage of unknown fields and converted-value originals in the
 * raw_fragments table. Includes idempotence, race-condition handling, and
 * auto-enhancement queuing. Extracted from server.ts to enforce layer
 * boundaries.
 */

import { randomUUID } from "crypto";
import { db } from "../db.js";
import { logger } from "../utils/logger.js";

export interface StoreFragmentParams {
  sourceId: string;
  userId: string;
  entityId?: string;
  entityType: string;
  schemaVersion: string;
  key: string;
  value: unknown;
  reason: "unknown_field" | "converted_value_original";
  convertedTo?: unknown;
  interpretationId?: string | null;
  /** Conditional caller owns the DB transaction and postcommit callbacks. */
  transactionEffects?: Array<() => Promise<void>>;
  /**
   * No-op suppression (#2792). When the entity's newest fragment for this key
   * already carries the same value and envelope, from any source, count the
   * sighting on that fragment (`frequency_count`, `last_seen`) instead of
   * inserting a row per source. Needs `entityId`. Only the newest fragment is
   * considered, so a value that changed and changed back (A, B, A) still
   * stores a row for each change, and the newest fragment per key, which is
   * what readers pick, keeps carrying the current value.
   */
  reuseAcrossSources?: boolean;
}

/** Canonical JSON (keys sorted at every depth) for comparing fragment values. */
function canonical(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        const item = (v as Record<string, unknown>)[k];
        if (item !== undefined) out[k] = sort(item);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

async function queueAutoEnhancement(
  entityType: string,
  fragmentKey: string,
  userId: string,
  frequencyCount: number,
  strict = false
): Promise<void> {
  try {
    const { schemaRecommendationService } = await import("./schema_recommendation.js");
    await schemaRecommendationService.queueAutoEnhancementCheck({
      entity_type: entityType,
      fragment_key: fragmentKey,
      user_id: userId,
      frequency_count: frequencyCount,
    });
  } catch (queueError: any) {
    if (strict) throw new Error("Conditional enhancement notification failed.");
    logger.warn(
      `[AUTO_ENHANCE] Failed to queue enhancement check for ${entityType}.${fragmentKey}:`,
      queueError.message
    );
  }
}

export async function storeFragment(params: StoreFragmentParams): Promise<boolean> {
  const {
    sourceId,
    userId,
    entityId,
    entityType,
    schemaVersion,
    key,
    value,
    reason,
    convertedTo,
    interpretationId,
  } = params;

  if (value === null || value === undefined) return false;

  const envelope: Record<string, unknown> = {
    reason,
    entity_type: entityType,
    schema_version: schemaVersion,
  };
  if (convertedTo !== undefined) {
    envelope.converted_to = convertedTo;
  }

  let existingQuery = db
    .from("raw_fragments")
    .select("id, frequency_count")
    .eq("source_id", sourceId)
    .eq("fragment_key", key)
    .eq("user_id", userId)
    .eq("entity_type", entityType);
  if (entityId) {
    existingQuery = existingQuery.eq("entity_id", entityId);
  }
  const { data: existing, error: readError } = await existingQuery.maybeSingle();
  if (readError && params.transactionEffects) throw new Error("Conditional fragment read failed.");
  const enhance = (count: number) => {
    const callback = () =>
      queueAutoEnhancement(entityType, key, userId, count, Boolean(params.transactionEffects));
    if (params.transactionEffects) {
      params.transactionEffects.push(callback);
      return Promise.resolve();
    }
    return callback();
  };

  // Same value already on the entity's newest fragment for this key, stored by
  // an earlier source: count the sighting there rather than add a row (#2792).
  let repeated: { id: string; frequency_count: number | null } | null = null;
  if (!existing && params.reuseAcrossSources && entityId && !params.transactionEffects) {
    try {
      const { data: newest } = await db
        .from("raw_fragments")
        .select("id, frequency_count, fragment_value, fragment_envelope")
        .eq("entity_id", entityId)
        .eq("user_id", userId)
        .eq("entity_type", entityType)
        .eq("fragment_key", key)
        .order("last_seen", { ascending: false })
        .order("id", { ascending: false })
        .limit(1);
      const row = newest?.[0] as
        | {
            id: string;
            frequency_count: number | null;
            fragment_value: unknown;
            fragment_envelope: unknown;
          }
        | undefined;
      if (
        row &&
        canonical(row.fragment_value) === canonical(value) &&
        canonical(row.fragment_envelope) === canonical(envelope)
      ) {
        repeated = { id: row.id, frequency_count: row.frequency_count };
      }
    } catch (repeatError) {
      logger.warn(
        `[raw_fragments] repeat check failed for ${entityType}.${key}, inserting instead: ${
          repeatError instanceof Error ? repeatError.message : String(repeatError)
        }`
      );
    }
  }

  if (repeated) {
    const newCount = (repeated.frequency_count || 1) + 1;
    const { error: repeatUpdateError } = await db
      .from("raw_fragments")
      .update({ frequency_count: newCount, last_seen: new Date().toISOString() })
      .eq("id", repeated.id);
    if (!repeatUpdateError) {
      await enhance(newCount);
      return true;
    }
    logger.warn(
      `[raw_fragments] could not count a repeat on ${repeated.id}, inserting instead: ${repeatUpdateError.message}`
    );
  }

  if (existing) {
    const newCount = (existing.frequency_count || 1) + 1;
    const { error: updateError } = await db
      .from("raw_fragments")
      .update({
        fragment_value: value,
        fragment_envelope: envelope,
        frequency_count: newCount,
        last_seen: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (updateError) {
      if (params.transactionEffects) throw new Error("Conditional fragment update failed.");
      logger.error(`[raw_fragments] FAILED to update fragment for ${entityType}.${key}:`, {
        error: updateError,
        code: updateError.code,
        message: updateError.message,
      });
      return false;
    }

    await enhance(newCount);
    return true;
  }

  const fragmentId = randomUUID();
  const insertData: Record<string, unknown> = {
    id: fragmentId,
    source_id: sourceId,
    interpretation_id: interpretationId ?? null,
    user_id: userId,
    ...(entityId ? { entity_id: entityId } : {}),
    entity_type: entityType,
    fragment_key: key,
    fragment_value: value,
    fragment_envelope: envelope,
  };

  const { error: insertError } = await db.from("raw_fragments").insert(insertData).select();

  if (insertError) {
    if (params.transactionEffects) throw new Error("Conditional fragment insert failed.");
    if (insertError.code === "23505") {
      logger.warn(`[raw_fragments] Race condition for ${entityType}.${key}, retrying as update...`);
      let retryQuery = db
        .from("raw_fragments")
        .select("id, frequency_count")
        .eq("source_id", sourceId)
        .eq("fragment_key", key)
        .eq("user_id", userId)
        .eq("entity_type", entityType);
      if (entityId) {
        retryQuery = retryQuery.eq("entity_id", entityId);
      }
      const { data: retryExisting } = await retryQuery.maybeSingle();

      if (retryExisting) {
        const retryCount = (retryExisting.frequency_count || 1) + 1;
        await db
          .from("raw_fragments")
          .update({
            fragment_value: value,
            fragment_envelope: envelope,
            frequency_count: retryCount,
            last_seen: new Date().toISOString(),
          })
          .eq("id", retryExisting.id);

        await queueAutoEnhancement(entityType, key, userId, retryCount);
        return true;
      }
    } else {
      logger.error(`[raw_fragments] FAILED to insert fragment for ${entityType}.${key}:`, {
        error: insertError,
        code: insertError.code,
        message: insertError.message,
      });
    }
    return false;
  }

  await enhance(1);
  return true;
}

export async function storeConvertedOriginals(params: {
  sourceId: string;
  userId: string;
  entityId?: string;
  entityType: string;
  schemaVersion: string;
  originalValues: Record<string, unknown>;
  validFields: Record<string, unknown>;
  reuseAcrossSources?: boolean;
}): Promise<number> {
  const { sourceId, userId, entityId, entityType, schemaVersion, originalValues, validFields } =
    params;
  let count = 0;

  for (const [key, value] of Object.entries(originalValues)) {
    const stored = await storeFragment({
      sourceId,
      userId,
      entityId,
      entityType,
      schemaVersion,
      key,
      value,
      reason: "converted_value_original",
      convertedTo: validFields[key],
      reuseAcrossSources: params.reuseAcrossSources,
    });
    if (stored) count++;
  }

  return count;
}

export async function storeUnknownFields(params: {
  sourceId: string;
  userId: string;
  entityId?: string;
  entityType: string;
  schemaVersion: string;
  unknownFields: Record<string, unknown>;
  reuseAcrossSources?: boolean;
}): Promise<{ count: number; fields: string[] }> {
  const { sourceId, userId, entityId, entityType, schemaVersion, unknownFields } = params;

  const nonNullEntries = Object.entries(unknownFields).filter(
    ([, value]) => value !== null && value !== undefined
  );

  if (nonNullEntries.length > 0) {
    logger.error(
      `[raw_fragments] Storing ${nonNullEntries.length} unknown fields for ${entityType} (source_id: ${sourceId}, user_id: ${userId})`
    );
  }

  const storedFields: string[] = [];
  for (const [key, value] of nonNullEntries) {
    const stored = await storeFragment({
      sourceId,
      userId,
      entityId,
      entityType,
      schemaVersion,
      key,
      value,
      reason: "unknown_field",
      reuseAcrossSources: params.reuseAcrossSources,
    });
    if (stored) storedFields.push(key);
  }

  return { count: storedFields.length, fields: storedFields };
}
