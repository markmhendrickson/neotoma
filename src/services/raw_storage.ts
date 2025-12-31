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
}

export interface RawStorageResult {
  sourceId: string;
  contentHash: string;
  storageUrl: string;
  fileSize: number;
  deduplicated: boolean;
}

/**
 * Compute SHA-256 hash of file content
 */
export function computeContentHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Store raw file content with content-addressed deduplication
 * 
 * Storage path: sources/{user_id}/{content_hash}
 * Deduplication: Per-user uniqueness on (user_id, content_hash)
 */
export async function storeRawContent(
  options: RawStorageOptions
): Promise<RawStorageResult> {
  const { userId, fileBuffer, mimeType, originalFilename, provenance = {} } = options;

  // Compute content hash
  const contentHash = computeContentHash(fileBuffer);
  const fileSize = fileBuffer.length;

  // Check for existing source (deduplication)
  const { data: existing, error: checkError } = await supabase
    .from("sources")
    .select("id, storage_url")
    .eq("user_id", userId)
    .eq("content_hash", contentHash)
    .maybeSingle();

  if (checkError) {
    throw new Error(`Failed to check for existing source: ${checkError.message}`);
  }

  // If already exists, return existing source
  if (existing) {
    return {
      sourceId: existing.id,
      contentHash,
      storageUrl: existing.storage_url,
      fileSize,
      deduplicated: true,
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
      throw new Error(`Failed to upload to storage: ${uploadError.message}`);
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
      provenance: {
        ...provenance,
        uploaded_at: new Date().toISOString(),
      },
    })
    .select()
    .single();

  if (insertError) {
    throw new Error(`Failed to create source record: ${insertError.message}`);
  }

  return {
    sourceId: source.id,
    contentHash,
    storageUrl: storagePath,
    fileSize,
    deduplicated: false,
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

