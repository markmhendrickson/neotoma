import { createReadStream, openAsBlob } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { NeotomaApiClient } from "../shared/api_client.js";
import { getMaxUploadBytes } from "../services/source_upload.js";

/** Send the file through the existing authenticated API client, without base64. */
export async function uploadSourceFile(
  api: NeotomaApiClient,
  filePath: string,
  options: { mimeType: string; idempotencyKey?: string; userId?: string }
): Promise<string> {
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error("Source upload requires a regular file.");
  const maxBytes = getMaxUploadBytes();
  if (info.size > maxBytes) {
    throw new Error(`Source exceeds the remote upload limit of ${maxBytes} bytes.`);
  }
  const form = new FormData();
  form.append(
    "file",
    await openAsBlob(filePath, { type: options.mimeType }),
    path.basename(filePath)
  );
  if (options.idempotencyKey) form.append("idempotency_key", options.idempotencyKey);
  const { data, error } = await api.POST("/sources/upload", {
    params: { query: { user_id: options.userId } },
    body: form as any,
    bodySerializer: (body) => body as unknown as FormData,
  });
  if (error) throw new Error(`Failed to upload source: ${JSON.stringify(error)}`);
  if (!data?.source_id) throw new Error("Source upload returned no source_id.");
  return data.source_id;
}

export async function hashSourceFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}
