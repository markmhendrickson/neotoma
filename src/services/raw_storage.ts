// FU-120: Raw Storage Service
// Content-addressed storage with SHA-256 hashing and Supabase Storage

import crypto from "crypto";
import { supabase } from "../db.js";

export interface RawStorageOptions {
  userId: string;
  fileBuffer: Buffer;
  mimeType: string;
  originalFilename?: string;
  provenance?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface RawStorageResult {
  sourceId: string;
  contentHash: string;
  storageUrl: string;
  fileSize: number;
  deduplicated: boolean;
  idempotencyKey?: string;
}

/**
 * Compute SHA-256 hash of file content
 */
export function computeContentHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Store raw file content with content-addressed deduplication.
 * Idempotent: second calls with the same content return the existing source
 * (or claim the existing file in DB) instead of throwing "file already exists".
 *
 * Storage path: sources/{user_id}/{content_hash}
 * Deduplication: Per-user uniqueness on (user_id, content_hash)
 */
export async function storeRawContent(
  options: RawStorageOptions
): Promise<RawStorageResult> {
  const { userId, fileBuffer, mimeType, originalFilename, provenance = {}, idempotencyKey } = options;

  // Compute content hash
  const contentHash = computeContentHash(fileBuffer);
  const fileSize = fileBuffer.length;

  if (idempotencyKey) {
    const { data: existingByKey, error: existingByKeyError } = await supabase
      .from("sources")
      .select("id, storage_url, content_hash, file_size, idempotency_key")
      .eq("user_id", userId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existingByKeyError) {
      throw new Error(`Failed to check idempotency key: ${existingByKeyError.message}`);
    }

    if (existingByKey) {
      if (existingByKey.content_hash !== contentHash) {
        throw new Error(
          "Idempotency key reuse detected with different content. Use a new idempotency_key."
        );
      }

      return {
        sourceId: existingByKey.id,
        contentHash,
        storageUrl: existingByKey.storage_url,
        fileSize: existingByKey.file_size,
        deduplicated: true,
        idempotencyKey,
      };
    }
  }

  // Check for existing source (deduplication)
  const { data: existing, error: checkError } = await supabase
    .from("sources")
    .select("id, storage_url, idempotency_key")
    .eq("user_id", userId)
    .eq("content_hash", contentHash)
    .maybeSingle();

  if (checkError) {
    throw new Error(`Failed to check for existing source: ${checkError.message}`);
  }

  // If already exists, return existing source
  if (existing) {
    if (idempotencyKey && !existing.idempotency_key) {
      const { error: updateError } = await supabase
        .from("sources")
        .update({ idempotency_key: idempotencyKey })
        .eq("id", existing.id);

      if (updateError) {
        throw new Error(`Failed to set idempotency key: ${updateError.message}`);
      }
    }

    return {
      sourceId: existing.id,
      contentHash,
      storageUrl: existing.storage_url,
      fileSize,
      deduplicated: true,
      idempotencyKey,
    };
  }

  // Upload to Supabase Storage
  const storagePath = `${userId}/${contentHash}`;
  const bucketName = "sources";

  // Check if we're in test environment
  const isTestEnv = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  
  if (!isTestEnv) {
    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(storagePath, fileBuffer, {
        upsert: false,
        contentType: mimeType,
      });

    if (uploadError) {
      const isAlreadyExists =
        uploadError.message?.toLowerCase().includes("already exists") ||
        uploadError.message?.toLowerCase().includes("file already exists") ||
        (uploadError as { code?: string }).code === "STORAGE_FILE_EXISTS";
      if (isAlreadyExists) {
        const { data: existingAfterUpload, error: recheckError } = await supabase
          .from("sources")
          .select("id, storage_url")
          .eq("user_id", userId)
          .eq("content_hash", contentHash)
          .maybeSingle();
        if (!recheckError && existingAfterUpload) {
          return {
            sourceId: existingAfterUpload.id,
            contentHash,
            storageUrl: existingAfterUpload.storage_url,
            fileSize,
            deduplicated: true,
          };
        }
        // File on storage but no source row (e.g. previous insert failed). Insert to claim it.
      } else {
        throw new Error(`Failed to upload to storage: ${uploadError.message}`);
      }
    }
  }

  // Create source record
  const { data: source, error: insertError } = await supabase
    .from("sources")
    .insert({
      user_id: userId,
      content_hash: contentHash,
      mime_type: mimeType,
      storage_url: storagePath,
      file_size: fileSize,
      original_filename: originalFilename,
      idempotency_key: idempotencyKey,
      provenance: {
        ...provenance,
        uploaded_at: new Date().toISOString(),
      },
    })
    .select()
    .single();

  if (insertError) {
    const isDuplicate =
      insertError.message?.toLowerCase().includes("duplicate") ||
      insertError.message?.toLowerCase().includes("unique") ||
      (insertError as { code?: string }).code === "23505";
    if (isDuplicate) {
      const { data: existingSource, error: recheckError } = await supabase
        .from("sources")
        .select("id, storage_url")
        .eq("user_id", userId)
        .eq("content_hash", contentHash)
        .maybeSingle();
      if (!recheckError && existingSource) {
        return {
          sourceId: existingSource.id,
          contentHash,
          storageUrl: existingSource.storage_url,
          fileSize,
          deduplicated: true,
        };
      }
    }
    throw new Error(`Failed to create source record: ${insertError.message}`);
  }

  return {
    sourceId: source.id,
    contentHash,
    storageUrl: storagePath,
    fileSize,
    deduplicated: false,
    idempotencyKey,
  };
}

/**
 * Get source metadata by ID
 */
export async function getSourceMetadata(sourceId: string) {
  const { data, error } = await supabase
    .from("sources")
    .select("*")
    .eq("id", sourceId)
    .single();

  if (error) {
    throw new Error(`Failed to get source metadata: ${error.message}`);
  }

  return data;
}

/**
 * Download raw content from storage
 */
export async function downloadRawContent(
  storageUrl: string,
  bucketName: string = "sources"
): Promise<Buffer> {
  const { data, error } = await supabase.storage
    .from(bucketName)
    .download(storageUrl);

  if (error || !data) {
    throw new Error(`Failed to download content: ${error?.message}`);
  }

  return Buffer.from(await data.arrayBuffer());
}

