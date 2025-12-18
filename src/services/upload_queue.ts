import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { supabase } from "../db.js";

const DEFAULT_QUEUE_DIR = path.join(process.cwd(), ".tmp", "upload-queue");

export interface FailedUploadPayload {
  bucket: string;
  objectPath: string;
  buffer: Buffer;
  byteSize: number;
  userId: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  payloadSubmissionId?: string | null;
  contentHash?: string;
}

export function getUploadQueueDirectory(): string {
  const fromEnv = process.env.UPLOAD_QUEUE_DIR?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_QUEUE_DIR;
}

export function computeContentHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

async function ensureQueueDirectory(): Promise<string> {
  const dir = getUploadQueueDirectory();
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function enqueueFailedUpload(
  payload: FailedUploadPayload,
): Promise<{ id: string }> {
  const dir = await ensureQueueDirectory();
  const queueFileName = `${Date.now()}-${randomUUID()}.bin`;
  const tempFilePath = path.join(dir, queueFileName);

  await writeFile(tempFilePath, payload.buffer, { mode: 0o600 });

  const { data, error } = await supabase
    .from("upload_queue")
    .insert({
      temp_file_path: tempFilePath,
      bucket: payload.bucket,
      object_path: payload.objectPath,
      content_hash: payload.contentHash ?? computeContentHash(payload.buffer),
      byte_size: payload.byteSize,
      user_id: payload.userId,
      error_message: payload.errorMessage ?? null,
      metadata: payload.metadata ?? {},
      payload_submission_id: payload.payloadSubmissionId ?? null,
    })
    .select("id")
    .single();

  if (error) {
    await rm(tempFilePath, { force: true });
    throw new Error(`Failed to enqueue upload: ${error.message ?? error.code}`);
  }

  return { id: data!.id as string };
}
