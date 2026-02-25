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
  entityType: string;
  schemaVersion: string;
  key: string;
  value: unknown;
  reason: "unknown_field" | "converted_value_original";
  convertedTo?: unknown;
  interpretationId?: string | null;
}

async function queueAutoEnhancement(
  entityType: string,
  fragmentKey: string,
  userId: string,
  frequencyCount: number
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
    logger.warn(
      `[AUTO_ENHANCE] Failed to queue enhancement check for ${entityType}.${fragmentKey}:`,
      queueError.message
    );
  }
}

export async function storeFragment(params: StoreFragmentParams): Promise<boolean> {
  const { sourceId, userId, entityType, schemaVersion, key, value, reason, convertedTo, interpretationId } = params;

  if (value === null || value === undefined) return false;

  const envelope: Record<string, unknown> = {
    reason,
    entity_type: entityType,
    schema_version: schemaVersion,
  };
  if (convertedTo !== undefined) {
    envelope.converted_to = convertedTo;
  }

  const { data: existing } = await db
    .from("raw_fragments")
    .select("id, frequency_count, entity_id")
    .eq("source_id", sourceId)
    .eq("fragment_key", key)
    .eq("user_id", userId)
    .eq("entity_type", entityType)
    .maybeSingle();

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
      logger.error(`[raw_fragments] FAILED to update fragment for ${entityType}.${key}:`, {
        error: updateError,
        code: updateError.code,
        message: updateError.message,
      });
      return false;
    }

    await queueAutoEnhancement(entityType, key, userId, newCount);
    return true;
  }

  const fragmentId = randomUUID();
  const insertData: Record<string, unknown> = {
    id: fragmentId,
    source_id: sourceId,
    interpretation_id: interpretationId ?? null,
    user_id: userId,
    entity_type: entityType,
    fragment_key: key,
    fragment_value: value,
    fragment_envelope: envelope,
  };

  const { error: insertError } = await db
    .from("raw_fragments")
    .insert(insertData)
    .select();

  if (insertError) {
    if (insertError.code === "23505") {
      logger.warn(
        `[raw_fragments] Race condition for ${entityType}.${key}, retrying as update...`
      );
      const { data: retryExisting } = await db
        .from("raw_fragments")
        .select("id, frequency_count")
        .eq("source_id", sourceId)
        .eq("fragment_key", key)
        .eq("user_id", userId)
        .maybeSingle();

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

  await queueAutoEnhancement(entityType, key, userId, 1);
  return true;
}

export async function storeConvertedOriginals(params: {
  sourceId: string;
  userId: string;
  entityType: string;
  schemaVersion: string;
  originalValues: Record<string, unknown>;
  validFields: Record<string, unknown>;
}): Promise<number> {
  const { sourceId, userId, entityType, schemaVersion, originalValues, validFields } = params;
  let count = 0;

  for (const [key, value] of Object.entries(originalValues)) {
    const stored = await storeFragment({
      sourceId,
      userId,
      entityType,
      schemaVersion,
      key,
      value,
      reason: "converted_value_original",
      convertedTo: validFields[key],
    });
    if (stored) count++;
  }

  return count;
}

export async function storeUnknownFields(params: {
  sourceId: string;
  userId: string;
  entityType: string;
  schemaVersion: string;
  unknownFields: Record<string, unknown>;
}): Promise<number> {
  const { sourceId, userId, entityType, schemaVersion, unknownFields } = params;

  const nonNullEntries = Object.entries(unknownFields).filter(
    ([, value]) => value !== null && value !== undefined
  );

  if (nonNullEntries.length > 0) {
    logger.error(
      `[raw_fragments] Storing ${nonNullEntries.length} unknown fields for ${entityType} (source_id: ${sourceId}, user_id: ${userId})`
    );
  }

  let count = 0;
  for (const [key, value] of nonNullEntries) {
    const stored = await storeFragment({
      sourceId,
      userId,
      entityType,
      schemaVersion,
      key,
      value,
      reason: "unknown_field",
    });
    if (stored) count++;
  }

  return count;
}
