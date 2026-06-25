// FU-120: Raw Storage Service
// Content-addressed storage with SHA-256 hashing and local/cloud storage

import crypto from "crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { db } from "../db.js";
import { generateDeterministicSourceId } from "./source_identity.js";
import { getCurrentAgentIdentity, getCurrentAttribution } from "./request_context.js";
import { enforceAttributionPolicy } from "./attribution_policy.js";

export interface RawStorageOptions {
  userId: string;
  fileBuffer: Buffer;
  mimeType: string;
  originalFilename?: string;
  sourceType?: string;
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
export async function storeRawContent(options: RawStorageOptions): Promise<RawStorageResult> {
  enforceAttributionPolicy("sources", getCurrentAgentIdentity());
  const {
    userId,
    fileBuffer,
    mimeType,
    originalFilename,
    sourceType,
    provenance = {},
    idempotencyKey,
  } = options;

  // Compute content hash
  const contentHash = computeContentHash(fileBuffer);
  const fileSize = fileBuffer.length;

  if (idempotencyKey) {
    const { data: existingByKey, error: existingByKeyError } = await db
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
  const { data: existing, error: checkError } = await db
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
      const { error: updateError } = await db
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

  // Upload to storage
  const storagePath = `${userId}/${contentHash}`;
  const bucketName = "sources";

  // Check if we're in test environment
  const isTestEnv = process.env.NODE_ENV === "test" || process.env.VITEST === "true";

  if (!isTestEnv) {
    const { error: uploadError } = await db.storage
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
        const { data: existingAfterUpload, error: recheckError } = await db
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
  const deterministicSourceId = generateDeterministicSourceId(userId, contentHash);
  const sourceRow: Record<string, unknown> = {
    id: deterministicSourceId,
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
      ...getCurrentAttribution(),
    },
  };
  if (sourceType) sourceRow.source_type = sourceType;
  const { data: source, error: insertError } = await db
    .from("sources")
    .insert(sourceRow)
    .select()
    .single();

  if (insertError) {
    const isDuplicate =
      insertError.message?.toLowerCase().includes("duplicate") ||
      insertError.message?.toLowerCase().includes("unique") ||
      (insertError as { code?: string }).code === "23505";
    if (isDuplicate) {
      const { data: existingSource, error: recheckError } = await db
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
  const { data, error } = await db.from("sources").select("*").eq("id", sourceId).single();

  if (error) {
    throw new Error(`Failed to get source metadata: ${error.message}`);
  }

  return data;
}

/** Thrown when the stored file is missing (e.g. ENOENT on local storage). Callers can catch and skip or retry. */
export class SourceFileNotFoundError extends Error {
  readonly code = "SOURCE_FILE_NOT_FOUND";
  constructor(
    message: string,
    public readonly storageUrl: string
  ) {
    super(message);
    this.name = "SourceFileNotFoundError";
  }
}

/**
 * Download raw content from storage
 */
export async function downloadRawContent(
  storageUrl: string,
  bucketName: string = "sources"
): Promise<Buffer> {
  const { data, error } = await db.storage.from(bucketName).download(storageUrl);

  if (error || !data) {
    const msg = error?.message ?? "Unknown error";
    if (msg.includes("ENOENT") || msg.includes("no such file or directory")) {
      throw new SourceFileNotFoundError(`Source file not found: ${msg}`, storageUrl);
    }
    throw new Error(`Failed to download content: ${msg}`);
  }

  return Buffer.from(await data.arrayBuffer());
}

/**
 * Absolute filesystem path for a row's `storage_url` when using local raw storage
 * (`sources` bucket → {@link config.rawStorageDir} + object key).
 * Returns null for non-file keys (e.g. `internal://…`) or non-local backends.
 */
export function resolveLocalSourceFilePath(storageUrl: string | null | undefined): string | null {
  if (storageUrl == null || typeof storageUrl !== "string") return null;
  const u = storageUrl.trim();
  if (!u || u.startsWith("internal://")) return null;
  if (u.startsWith("file://")) {
    try {
      return fileURLToPath(u);
    } catch {
      return null;
    }
  }
  if (config.storageBackend !== "local") return null;
  return path.resolve(path.join(config.rawStorageDir, u));
}

// ---------------------------------------------------------------------------
// By-reference source storage (#1775)
// ---------------------------------------------------------------------------

export interface ReferenceStorageOptions {
  userId: string;
  absolutePath: string;
  mimeType?: string;
  originalFilename?: string;
  idempotencyKey?: string;
  provenance?: Record<string, unknown>;
}

export interface ReferenceStorageResult {
  sourceId: string;
  contentHash: string;
  sizeBytes: number;
  mimeType: string;
  mtime: string;
  hostId: string;
  path: string;
  deduplicated: boolean;
}

/**
 * Store a file by reference — read it once to compute content_hash + metadata,
 * persist the `sources` row with storage_mode='reference' (no blob bytes).
 *
 * Deduplication: same UNIQUE(content_hash, user_id) index as inline storage,
 * so a reference source dedups against an existing inline source byte-for-byte.
 * An upgrade path: if an inline source with the same hash already exists, it is
 * returned as-is (the caller has durable bytes; no downgrade to reference).
 */
export async function storeRawReference(
  options: ReferenceStorageOptions
): Promise<ReferenceStorageResult> {
  enforceAttributionPolicy("sources", getCurrentAgentIdentity());

  const { userId, absolutePath, originalFilename, idempotencyKey, provenance = {} } = options;

  // Read file for hash + metadata; do NOT retain bytes
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found at reference path: ${absolutePath}`);
  }

  const stat = fs.statSync(absolutePath);
  const fileBuffer = fs.readFileSync(absolutePath);
  const contentHash = computeContentHash(fileBuffer);
  const sizeBytes = stat.size;
  const mtime = stat.mtime.toISOString();
  const hostId = os.hostname();

  // Auto-detect MIME type from extension when not provided
  const ext = path.extname(absolutePath).toLowerCase();
  const resolvedMime =
    options.mimeType ||
    (() => {
      // Minimal extension → MIME map (common document types)
      const extMap: Record<string, string> = {
        ".pdf": "application/pdf",
        ".txt": "text/plain",
        ".md": "text/markdown",
        ".csv": "text/csv",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".mp3": "audio/mpeg",
        ".mp4": "video/mp4",
        ".zip": "application/zip",
      };
      return extMap[ext] ?? "application/octet-stream";
    })();

  // Check idempotency key first
  if (idempotencyKey) {
    const { data: existingByKey, error: existingByKeyError } = await db
      .from("sources")
      .select("id, content_hash, storage_mode, reference_path, size_bytes, mime_type, mtime, host_id")
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
        sizeBytes: existingByKey.size_bytes ?? sizeBytes,
        mimeType: existingByKey.mime_type ?? resolvedMime,
        mtime: existingByKey.mtime ?? mtime,
        hostId: existingByKey.host_id ?? hostId,
        path: existingByKey.reference_path ?? absolutePath,
        deduplicated: true,
      };
    }
  }

  // Check for an existing source with the same hash (any storage mode)
  const { data: existing, error: checkError } = await db
    .from("sources")
    .select("id, storage_mode, idempotency_key, reference_path, size_bytes, mime_type, mtime, host_id")
    .eq("user_id", userId)
    .eq("content_hash", contentHash)
    .maybeSingle();

  if (checkError) {
    throw new Error(`Failed to check for existing source: ${checkError.message}`);
  }

  if (existing) {
    // Upgrade inline → reference is not needed (inline is already more durable).
    // Update idempotency key if not yet set.
    if (idempotencyKey && !existing.idempotency_key) {
      await db
        .from("sources")
        .update({ idempotency_key: idempotencyKey })
        .eq("id", existing.id);
    }
    return {
      sourceId: existing.id,
      contentHash,
      sizeBytes: existing.size_bytes ?? sizeBytes,
      mimeType: existing.mime_type ?? resolvedMime,
      mtime: existing.mtime ?? mtime,
      hostId: existing.host_id ?? hostId,
      path: existing.reference_path ?? absolutePath,
      deduplicated: true,
    };
  }

  // No existing source — insert reference row (no bytes stored)
  const deterministicSourceId = generateDeterministicSourceId(userId, contentHash);
  const sourceRow: Record<string, unknown> = {
    id: deterministicSourceId,
    user_id: userId,
    content_hash: contentHash,
    mime_type: resolvedMime,
    storage_url: `reference://${hostId}${absolutePath}`,
    file_size: sizeBytes,
    original_filename: originalFilename ?? path.basename(absolutePath),
    idempotency_key: idempotencyKey,
    // Reference-mode columns
    storage_mode: "reference",
    reference_path: absolutePath,
    host_id: hostId,
    size_bytes: sizeBytes,
    mtime,
    provenance: {
      ...provenance,
      stored_at: new Date().toISOString(),
      storage_mode: "reference",
      ...getCurrentAttribution(),
    },
  };

  const { data: source, error: insertError } = await db
    .from("sources")
    .insert(sourceRow)
    .select()
    .single();

  if (insertError) {
    const isDuplicate =
      insertError.message?.toLowerCase().includes("duplicate") ||
      insertError.message?.toLowerCase().includes("unique") ||
      (insertError as { code?: string }).code === "23505";
    if (isDuplicate) {
      const { data: existingAfterRace, error: recheckError } = await db
        .from("sources")
        .select("id, storage_mode, reference_path, size_bytes, mime_type, mtime, host_id")
        .eq("user_id", userId)
        .eq("content_hash", contentHash)
        .maybeSingle();
      if (!recheckError && existingAfterRace) {
        return {
          sourceId: existingAfterRace.id,
          contentHash,
          sizeBytes: existingAfterRace.size_bytes ?? sizeBytes,
          mimeType: existingAfterRace.mime_type ?? resolvedMime,
          mtime: existingAfterRace.mtime ?? mtime,
          hostId: existingAfterRace.host_id ?? hostId,
          path: existingAfterRace.reference_path ?? absolutePath,
          deduplicated: true,
        };
      }
    }
    throw new Error(`Failed to create reference source record: ${insertError.message}`);
  }

  return {
    sourceId: source.id,
    contentHash,
    sizeBytes,
    mimeType: resolvedMime,
    mtime,
    hostId,
    path: absolutePath,
    deduplicated: false,
  };
}

/**
 * Resolve a reference source to bytes at read time.
 * Returns a structured result: either `{ found: true, buffer }` or
 * `{ found: false, error: "SOURCE_UNAVAILABLE" | "SOURCE_REFERENCE_STALE", ... }`.
 */
export function resolveReferenceSource(sourceRow: {
  reference_path: string | null;
  content_hash: string | null;
  host_id: string | null;
  size_bytes?: number | null;
}): {
  found: boolean;
  buffer?: Buffer;
  error?: "SOURCE_UNAVAILABLE" | "SOURCE_REFERENCE_STALE";
  details?: Record<string, unknown>;
} {
  const refPath = sourceRow.reference_path;
  if (!refPath) {
    return {
      found: false,
      error: "SOURCE_UNAVAILABLE",
      details: {
        reason: "reference_path is null",
        content_hash: sourceRow.content_hash,
        host_id: sourceRow.host_id,
      },
    };
  }

  if (!fs.existsSync(refPath)) {
    return {
      found: false,
      error: "SOURCE_UNAVAILABLE",
      details: {
        path: refPath,
        content_hash: sourceRow.content_hash,
        host_id: sourceRow.host_id,
      },
    };
  }

  const buffer = fs.readFileSync(refPath);

  // Optional integrity check: re-hash and compare
  if (sourceRow.content_hash) {
    const currentHash = computeContentHash(buffer);
    if (currentHash !== sourceRow.content_hash) {
      return {
        found: false,
        error: "SOURCE_REFERENCE_STALE",
        details: {
          path: refPath,
          expected_hash: sourceRow.content_hash,
          actual_hash: currentHash,
          host_id: sourceRow.host_id,
        },
      };
    }
  }

  return { found: true, buffer };
}
