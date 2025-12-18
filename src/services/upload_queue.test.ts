import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { rm, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  enqueueFailedUpload,
  getUploadQueueDirectory,
  computeContentHash,
} from "./upload_queue.js";

const queueMocks = vi.hoisted(() => {
  const singleMock = vi.fn();
  const selectMock = vi.fn(() => ({ single: singleMock }));
  const insertMock = vi.fn(() => ({ select: selectMock }));
  const fromMock = vi.fn(() => ({ insert: insertMock }));
  return { singleMock, selectMock, insertMock, fromMock };
});

vi.mock("../db.js", () => ({
  supabase: {
    from: queueMocks.fromMock,
  },
}));

const TEST_DIR = path.join(process.cwd(), ".tmp-test-upload-queue");

describe("upload_queue service", () => {
  beforeEach(async () => {
    process.env.UPLOAD_QUEUE_DIR = TEST_DIR;
    queueMocks.insertMock.mockClear();
    queueMocks.selectMock.mockClear();
    queueMocks.singleMock.mockClear();
    queueMocks.fromMock.mockClear();
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("enqueues failed upload and writes temp file", async () => {
    queueMocks.singleMock.mockResolvedValue({
      data: { id: "queue-id" },
      error: null,
    });

    const buffer = Buffer.from("hello world");
    const result = await enqueueFailedUpload({
      bucket: "files",
      objectPath: "foo/bar.txt",
      buffer,
      byteSize: buffer.length,
      userId: "user-1",
      errorMessage: "failure",
      metadata: { note: "test" },
      contentHash: computeContentHash(buffer),
    });

    expect(result.id).toEqual("queue-id");
    expect(queueMocks.fromMock).toHaveBeenCalledWith("upload_queue");

    const files = await readdir(getUploadQueueDirectory());
    expect(files.length).toBe(1);
    const saved = await readFile(path.join(getUploadQueueDirectory(), files[0]));
    expect(saved.equals(buffer)).toBe(true);
  });

  it("cleans up temp file when insert fails", async () => {
    queueMocks.singleMock.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });

    const buffer = Buffer.from("bad upload");
    await expect(
      enqueueFailedUpload({
        bucket: "files",
        objectPath: "foo/fail.bin",
        buffer,
        byteSize: buffer.length,
        userId: "user-1",
      }),
    ).rejects.toThrow(/Failed to enqueue upload/);

    const files = await readdir(getUploadQueueDirectory()).catch(() => []);
    expect(files.length).toBe(0);
  });

  it("computes deterministic hashes", () => {
    const buffer = Buffer.from("abc");
    const hash1 = computeContentHash(buffer);
    const hash2 = computeContentHash(Buffer.from("abc"));
    expect(hash1).toEqual(hash2);
  });
});
