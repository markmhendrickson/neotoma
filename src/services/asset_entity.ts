/**
 * Asset Entity Service (Domain Layer)
 *
 * One implementation of "a stored file gets an asset entity", shared by both
 * ingress transports.
 *
 * Why this is a service and not a method on either transport: before #2352 this
 * logic lived only as a private method on the MCP server class, so the HTTP
 * `/store` route had no way to reach it and simply did not attach an asset
 * entity at all. The same bytes therefore produced a different graph depending
 * on which transport carried them — an asset entity and an `asset_entity_id` in
 * the response over MCP, nothing over HTTP. That environment-dependent split is
 * exactly what #2325 exists to close, and `src/cli/plans.ts` had already been
 * written against the MCP-shaped response: it POSTs to HTTP `/store`, reads
 * `asset_entity_id` off the reply, and creates an EMBEDS edge only when that
 * field is present — so over HTTP it silently never created one.
 *
 * Extracting rather than duplicating is the point. Two copies of an
 * entity-resolution + observation-write pair drift, and the drift is invisible:
 * both transports keep returning success while writing different graphs.
 */

import { db } from "../db.js";

/**
 * Asset entity type for a MIME type. Kept beside the writer so both transports
 * classify identically — a divergence here would produce `image_asset` on one
 * transport and `file_asset` on the other for the same bytes.
 */
export function getAssetEntityType(mimeType: string): string {
  const normalized = (mimeType || "").toLowerCase();
  if (normalized.startsWith("image/")) return "image_asset";
  if (normalized.startsWith("audio/")) return "audio_asset";
  if (normalized.startsWith("video/")) return "video_asset";
  return "file_asset";
}

export interface EnsureAssetEntityParams {
  userId: string;
  sourceId: string;
  contentHash: string;
  fileSize: number;
  mimeType: string;
  originalFilename?: string;
  /**
   * Where the bytes live. Absent for a `sources` row whose upload leg was
   * skipped (the test harness does this unless NEOTOMA_TEST_REAL_STORAGE=1),
   * so it is tolerated rather than required — the asset entity is still the
   * correct graph record of the file.
   */
  storageUrl?: string | null;
  sourcePriority: number;
  idempotencyKey?: string;
}

/**
 * Resolve (or create) the asset entity for a stored source and record one
 * observation of it. Idempotent per (user, source, entity): a second call for
 * the same source does not write a second observation, which is what makes it
 * safe to call from the already-uploaded `source_id` path where the same handle
 * may legitimately be stored more than once.
 */
export async function ensureAssetEntity(
  params: EnsureAssetEntityParams
): Promise<{ entityId: string; entityType: string }> {
  const { resolveEntity } = await import("./entity_resolution.js");
  const { createObservation } = await import("./observation_storage.js");
  const {
    userId,
    sourceId,
    contentHash,
    fileSize,
    mimeType,
    originalFilename,
    storageUrl,
    sourcePriority,
    idempotencyKey,
  } = params;

  const entityType = getAssetEntityType(mimeType);
  const fields: Record<string, unknown> = {
    source_id: sourceId,
    content_hash: contentHash,
    mime_type: mimeType,
    file_size: fileSize,
    storage_url: storageUrl,
    original_filename: originalFilename,
    // An unnamed upload has no real name to record; falling back to the source
    // id keeps titles distinct, where the old literal "file" collided every
    // unnamed upload onto one entity (#2325).
    title: originalFilename || sourceId,
  };

  const entityId = await resolveEntity({
    entityType,
    fields,
    userId,
  });

  const { data: existingObservation, error: existingObservationError } = await db
    .from("observations")
    .select("id")
    .eq("user_id", userId)
    .eq("source_id", sourceId)
    .eq("entity_id", entityId)
    .limit(1)
    .maybeSingle();

  if (existingObservationError) {
    throw new Error(
      `Failed to check existing asset observation: ${existingObservationError.message}`
    );
  }

  if (!existingObservation) {
    await createObservation({
      entity_id: entityId,
      entity_type: entityType,
      schema_version: "1.0",
      source_id: sourceId,
      interpretation_id: null,
      observed_at: new Date().toISOString(),
      specificity_score: 1.0,
      source_priority: sourcePriority,
      fields,
      user_id: userId,
      idempotency_key: idempotencyKey ? `${idempotencyKey}:asset` : null,
    });
  }

  return { entityId, entityType };
}
