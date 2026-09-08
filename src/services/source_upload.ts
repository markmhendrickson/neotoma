// Streaming multipart upload for source bytes (#2325)
//
// The problem this solves: `store()`'s `file_path` resolves on the server, so
// a remote caller has no way to attach a file except by inlining base64 into
// the JSON-RPC envelope — which `express.json({limit:"10mb"})` caps at roughly
// 7.5 MB of actual file after base64's inflation. That is adequate for a
// markdown note and categorically out of reach for the transcript audio this
// instance holds hundreds of, where an hour of m4a runs 30-60 MB.
//
// Raising the JSON cap does not reach it either: base64 inside a JSON string
// forces the whole artifact through the parser and into memory on both ends,
// at roughly 2.4x the file size per concurrent request. So the bytes need a
// route that never touches the JSON parser.
//
// Why multipart rather than presigned upload: the storage backend is
// pluggable, and the local adapter's "signed URL" is literally
// `file://${targetPath}` — no signing, no expiry, unreachable by a remote
// client. A presigned handshake would work hosted and be silently broken
// self-hosted, reintroducing exactly the environment-dependent split this
// issue exists to close. Multipart keeps one code path across both backends
// and keeps hashing and MIME sniffing server-side, where they can be trusted.
//
// The handle returned is an opaque `source_id`, so a presigned variant can
// later become a second way to obtain the same handle without changing
// `store()`'s contract.
//
// Streaming, not buffering: bytes go to a temp file as they arrive and are
// hashed incrementally. Nothing here holds the whole artifact in memory.

import busboy from "busboy";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Request } from "express";

/**
 * Ceiling on a single uploaded file.
 *
 * Two orders of magnitude above the JSON envelope's ~7.5 MB, which is the
 * point: it covers the transcript-audio class (an hour of m4a at 30-60 MB,
 * multi-hour recordings well past that) that had no route at all before.
 *
 * Not set to the ~1 GB the requirement nominally allows, because the ingest
 * leg still materializes the file once to hand `storeRawContent` a Buffer.
 * Advertising a ceiling the server would OOM on is worse than a lower honest
 * one. Raise it via NEOTOMA_MAX_UPLOAD_BYTES once storage takes a stream.
 *
 * Env-overridable rather than hardcoded at a call site: an operator holding
 * multi-hour recordings raises it, one running a small shared instance lowers
 * it.
 */
export const DEFAULT_MAX_UPLOAD_BYTES = 512 * 1024 * 1024; // 512 MiB

export function getMaxUploadBytes(env: NodeJS.ProcessEnv = process.env): number {
  const raw = (env.NEOTOMA_MAX_UPLOAD_BYTES ?? "").trim();
  if (!raw) return DEFAULT_MAX_UPLOAD_BYTES;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_UPLOAD_BYTES;
  return Math.floor(parsed);
}

export class UploadError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details: Record<string, unknown>;

  constructor(code: string, message: string, status = 400, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "UploadError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface ReceivedUpload {
  /** Path to the temp file holding the received bytes. Caller must clean up. */
  tempPath: string;
  /** SHA-256 of the received bytes, computed while streaming. */
  contentHash: string;
  sizeBytes: number;
  /** Filename from the multipart part, when the client sent one. */
  originalFilename?: string;
  /** MIME type the client claimed. Advisory — the server sniffs its own. */
  clientMimeType?: string;
  /** Non-file fields sent alongside (idempotency_key, mime_type, …). */
  fields: Record<string, string>;
}

/**
 * Receive one file part from a `multipart/form-data` request.
 *
 * Streams to a temp file while hashing, so peak memory is a buffer, not the
 * artifact. Enforces its own size cap — busboy's `limits.fileSize` truncates
 * silently rather than erroring, which would store a corrupted prefix under a
 * hash that looks perfectly valid, so truncation is converted to a hard
 * failure here.
 *
 * The temp file is removed on every failure path. On success the caller owns
 * it and must remove it after ingesting.
 */
export async function receiveUploadedFile(
  req: Request,
  options: { maxBytes?: number } = {}
): Promise<ReceivedUpload> {
  const maxBytes = options.maxBytes ?? getMaxUploadBytes();
  const contentType = req.headers["content-type"] ?? "";

  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    throw new UploadError(
      "ERR_UPLOAD_NOT_MULTIPART",
      "This route expects multipart/form-data with one file part. " +
        "Send the raw bytes as a file part rather than base64 in JSON.",
      415
    );
  }

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "neotoma-upload-"));
  const tempPath = path.join(tempDir, "payload");

  const cleanup = async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  };

  try {
    return await new Promise<ReceivedUpload>((resolve, reject) => {
      const bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: maxBytes } });
      const fields: Record<string, string> = {};
      const hash = crypto.createHash("sha256");

      let sizeBytes = 0;
      let sawFile = false;
      let truncated = false;
      let settled = false;
      let pending: Promise<void> = Promise.resolve();
      let originalFilename: string | undefined;
      let clientMimeType: string | undefined;

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        req.unpipe(bb);
        reject(error);
      };

      bb.on("field", (name, value) => {
        fields[name] = value;
      });

      bb.on("file", (_name, stream, info) => {
        sawFile = true;
        originalFilename = info.filename?.trim() || undefined;
        clientMimeType = info.mimeType?.trim() || undefined;

        stream.on("data", (chunk: Buffer) => {
          sizeBytes += chunk.length;
          hash.update(chunk);
        });

        // busboy truncates at the limit instead of erroring. A truncated file
        // stored under a hash of its prefix is a false success, so refuse it.
        stream.on("limit", () => {
          truncated = true;
        });

        pending = pipeline(stream, fs.createWriteStream(tempPath)).catch((error: Error) => {
          fail(
            new UploadError(
              "ERR_UPLOAD_WRITE_FAILED",
              `Failed to persist the uploaded bytes: ${error.message}`,
              500
            )
          );
        });
      });

      bb.on("error", (error: unknown) => {
        fail(
          new UploadError(
            "ERR_UPLOAD_MALFORMED",
            `Could not parse the multipart request: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        );
      });

      bb.on("close", () => {
        void pending.then(() => {
          if (settled) return;

          if (!sawFile) {
            return fail(
              new UploadError(
                "ERR_UPLOAD_NO_FILE",
                "No file part was present. Send the bytes as a file part in a " +
                  "multipart/form-data body."
              )
            );
          }

          if (truncated) {
            return fail(
              new UploadError(
                "ERR_UPLOAD_TOO_LARGE",
                `The uploaded file exceeds this instance's limit of ${maxBytes} bytes. ` +
                  "Raise NEOTOMA_MAX_UPLOAD_BYTES on the server to accept it.",
                413,
                { max_bytes: maxBytes }
              )
            );
          }

          settled = true;
          resolve({
            tempPath,
            contentHash: hash.digest("hex"),
            sizeBytes,
            originalFilename,
            clientMimeType,
            fields,
          });
        });
      });

      req.pipe(bb);
    });
  } catch (error) {
    await cleanup();
    throw error;
  }
}

/**
 * Remove a temp upload and its directory.
 */
export async function discardUpload(tempPath: string): Promise<void> {
  await fs.promises.rm(path.dirname(tempPath), { recursive: true, force: true }).catch(() => {});
}
