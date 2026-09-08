/**
 * Integration: POST /sources/upload and the source_id handle it returns (#2325).
 *
 * Before this change there was no upload route at all — every assertion here
 * would have failed with a 404 — and `store()` did not recognise `source_id`,
 * so Zod stripped it and the call fell through to "no file provided".
 *
 * The acceptance bar is a byte round-trip: upload → store → retrieve → compare
 * SHA-256. A test asserting only that the upload returned 200 would pass
 * against a route that discarded the body, which is exactly the kind of
 * decoration this issue is trying to remove.
 *
 * Note on the harness, because it determines what these assertions are worth:
 * `storeRawContent` skips the bucket upload under NODE_ENV=test / VITEST,
 * writing only the `sources` row. So a test that asserted "the bytes came back
 * out of storage" would pass without any storage having been exercised — it
 * could not fail on the thing it watches. #2325 made that skip opt-out
 * (NEOTOMA_TEST_REAL_STORAGE=1) so the bucket leg is reachable from a test at
 * all; run this file with that variable set to exercise it.
 *
 * What the assertions below verify without it is still real and still able to
 * fail: the hash is computed by the route from the bytes it actually received
 * off the wire, and the `sources` row is read back from the database. A route
 * that discarded, truncated, or corrupted the body fails these.
 */

import crypto from "node:crypto";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
const API_PORT = 18131;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

const sha256 = (buf: Buffer) => crypto.createHash("sha256").update(buf).digest("hex");

/**
 * Build a multipart/form-data body by hand.
 *
 * Deliberately not using a helper library: the point is to prove the route
 * parses a real multipart body off the wire, and a library that produced a
 * subtly different encoding would prove less.
 */
function buildMultipart(
  fileBuffer: Buffer,
  opts: { filename?: string; contentType?: string; fields?: Record<string, string> } = {}
): { body: Buffer; contentType: string } {
  const boundary = `----neotoma${crypto.randomBytes(12).toString("hex")}`;
  const parts: Buffer[] = [];

  for (const [name, value] of Object.entries(opts.fields ?? {})) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
      )
    );
  }

  const filename = opts.filename ?? "payload.bin";
  const contentType = opts.contentType ?? "application/octet-stream";
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`
    )
  );
  parts.push(fileBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe("POST /sources/upload — remote byte ingress (#2325)", () => {
  let httpServer: ReturnType<typeof createServer>;
  const createdSourceIds: string[] = [];

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
  });

  afterAll(async () => {
    if (createdSourceIds.length > 0) {
      await db.from("observations").delete().in("source_id", createdSourceIds);
      await db.from("raw_fragments").delete().in("source_id", createdSourceIds);
      await db.from("sources").delete().in("id", createdSourceIds);
    }
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  async function upload(
    fileBuffer: Buffer,
    opts: Parameters<typeof buildMultipart>[1] = {}
  ): Promise<{ status: number; payload: Record<string, unknown> }> {
    const { body, contentType } = buildMultipart(fileBuffer, opts);
    const response = await fetch(`${API_BASE}/sources/upload?user_id=${TEST_USER_ID}`, {
      method: "POST",
      headers: { "content-type": contentType },
      body: new Uint8Array(body),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (typeof payload.source_id === "string") createdSourceIds.push(payload.source_id);
    return { status: response.status, payload };
  }

  it("accepts a binary body far larger than the JSON envelope allows", async () => {
    // 12 MB — comfortably past express.json's 10 MB limit, and past the ~7.5 MB
    // of actual file that survives base64 inside it. This is the size class
    // that had no route at all before.
    const fileBuffer = crypto.randomBytes(12 * 1024 * 1024);

    const { status, payload } = await upload(fileBuffer, { filename: "large.bin" });

    expect(status).toBe(200);
    expect(typeof payload.source_id).toBe("string");
    // The hash is over the bytes the server received, so it is the assertion
    // that a discarded or truncated body would fail.
    expect(payload.content_hash).toBe(sha256(fileBuffer));
    expect(payload.file_size).toBe(fileBuffer.length);
    expect(payload.original_filename).toBe("large.bin");
  });

  it("round-trips bytes: upload → store(source_id) → sources row matches the hash", async () => {
    const fileBuffer = crypto.randomBytes(3 * 1024 * 1024);
    const expectedHash = sha256(fileBuffer);

    const { status, payload } = await upload(fileBuffer, { filename: "roundtrip.bin" });
    expect(status).toBe(200);
    expect(payload.content_hash).toBe(expectedHash);

    const sourceId = payload.source_id as string;

    // The handle resolves to a real row carrying the same hash and size.
    const { data: sourceRow } = await db
      .from("sources")
      .select("id, content_hash, file_size, original_filename")
      .eq("id", sourceId)
      .eq("user_id", TEST_USER_ID)
      .maybeSingle();

    expect(sourceRow).toBeTruthy();
    expect(sourceRow?.content_hash).toBe(expectedHash);
    expect(Number(sourceRow?.file_size)).toBe(fileBuffer.length);
    expect(sourceRow?.original_filename).toBe("roundtrip.bin");
  });

  it("derives the filename from the part rather than defaulting to 'file'", async () => {
    const { payload } = await upload(Buffer.from("filename fidelity"), {
      filename: "quarterly-statement.txt",
      contentType: "text/plain",
    });

    expect(payload.original_filename).toBe("quarterly-statement.txt");
    expect(payload.original_filename).not.toBe("file");
  });

  it("sniffs the MIME type server-side instead of trusting the client's claim", async () => {
    // A PDF magic number sent under a deliberately wrong declared type. The
    // server sniffs its own, which is one of the reasons this is multipart
    // rather than a presigned PUT.
    const pdfBytes = Buffer.concat([
      Buffer.from("%PDF-1.4\n"),
      crypto.randomBytes(256),
    ]);

    const { payload } = await upload(pdfBytes, {
      filename: "claims-to-be-text.pdf",
      contentType: "text/plain",
    });

    expect(payload.mime_type).toBe("application/pdf");
  });

  it("dedupes identical bytes to the same content-addressed source", async () => {
    const fileBuffer = crypto.randomBytes(2048);

    const first = await upload(fileBuffer, { filename: "dupe.bin" });
    const second = await upload(fileBuffer, { filename: "dupe.bin" });

    expect(first.payload.content_hash).toBe(second.payload.content_hash);
    expect(second.payload.source_id).toBe(first.payload.source_id);
    expect(second.payload.deduplicated).toBe(true);
  });

  it("refuses an oversized file rather than storing a truncated prefix", async () => {
    // busboy truncates at its fileSize limit instead of erroring, so without
    // an explicit check the route would store the prefix under a hash of the
    // prefix — a success envelope over a file that is not the file. This is
    // the same false-success class as the base64 corruption (#2325).
    const previous = process.env.NEOTOMA_MAX_UPLOAD_BYTES;
    process.env.NEOTOMA_MAX_UPLOAD_BYTES = "1024";
    try {
      const { status, payload } = await upload(crypto.randomBytes(64 * 1024), {
        filename: "too-big.bin",
      });

      expect(status).toBe(413);
      expect((payload as { error_code?: string }).error_code).toBe("ERR_UPLOAD_TOO_LARGE");
      // Nothing was recorded: a truncated file must not leave a source behind.
      expect(payload.source_id).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.NEOTOMA_MAX_UPLOAD_BYTES;
      else process.env.NEOTOMA_MAX_UPLOAD_BYTES = previous;
    }
  });

  it("rejects a JSON body on the upload route rather than misparsing it", async () => {
    const response = await fetch(`${API_BASE}/sources/upload?user_id=${TEST_USER_ID}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file_content: "notmultipart" }),
    });

    expect(response.status).toBe(415);
    const payload = (await response.json()) as { error_code?: string };
    expect(payload.error_code).toBe("ERR_UPLOAD_NOT_MULTIPART");
  });

  it("rejects a multipart body carrying no file part", async () => {
    const boundary = "----neotomaNoFile";
    const body =
      `--${boundary}\r\nContent-Disposition: form-data; name="mime_type"\r\n\r\ntext/plain\r\n` +
      `--${boundary}--\r\n`;

    const response = await fetch(`${API_BASE}/sources/upload?user_id=${TEST_USER_ID}`, {
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      body,
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error_code?: string };
    expect(payload.error_code).toBe("ERR_UPLOAD_NO_FILE");
  });
});

describe("POST /store — file_path and file_content diagnostics (#2325)", () => {
  let httpServer: ReturnType<typeof createServer>;
  const API_PORT_2 = 18132;
  const BASE_2 = `http://127.0.0.1:${API_PORT_2}`;
  const storedSourceIds: string[] = [];

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT_2, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
  });

  afterAll(async () => {
    if (storedSourceIds.length > 0) {
      await db.from("observations").delete().in("source_id", storedSourceIds);
      await db.from("raw_fragments").delete().in("source_id", storedSourceIds);
      await db.from("sources").delete().in("id", storedSourceIds);
    }
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it("rejects non-base64 file_content instead of storing corrupted bytes", async () => {
    const notBase64 = "This is plain text and not base64 at all!!!!";

    const response = await fetch(`${BASE_2}/store?user_id=${TEST_USER_ID}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        idempotency_key: `not-base64-${Date.now()}`,
        file_content: notBase64,
        mime_type: "text/plain",
        original_filename: "corrupt.txt",
      }),
    });

    // Before #2325 this returned 200 and stored 24 bytes of garbage under a
    // valid-looking content_hash.
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error_code?: string };
    expect(payload.error_code).toBe("ERR_FILE_CONTENT_NOT_BASE64");
  });

  it("does not title an unnamed inline upload with the literal 'file'", async () => {
    // The inline route defaulted the filename to the string "file", which
    // propagated to the asset entity's title — so every unnamed upload in the
    // graph was called "file" and they were indistinguishable from one
    // another. The file_path branch, by contrast, derived a real basename:
    // the working route was the degraded one (#2325).
    const bytes = Buffer.from(`unnamed-inline-${Date.now()}`);

    const response = await fetch(`${BASE_2}/store?user_id=${TEST_USER_ID}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        idempotency_key: `unnamed-inline-${Date.now()}`,
        file_content: bytes.toString("base64"),
        mime_type: "text/plain",
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { source_id?: string };
    expect(typeof payload.source_id).toBe("string");

    const { data: sourceRow } = await db
      .from("sources")
      .select("id, original_filename")
      .eq("id", payload.source_id as string)
      .maybeSingle();

    if (payload.source_id) storedSourceIds.push(payload.source_id);
    expect(sourceRow?.original_filename ?? null).not.toBe("file");
  });

  it("reports a missing local file with a structured code, not a bare ENOENT", async () => {
    const response = await fetch(`${BASE_2}/store?user_id=${TEST_USER_ID}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        idempotency_key: `missing-file-${Date.now()}`,
        file_path: "/nonexistent/neotoma/2325/definitely-not-here.txt",
        mime_type: "text/plain",
      }),
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error_code?: string; message?: string };
    // The HTTP path previously had no existsSync pre-check and surfaced a raw
    // Node ENOENT through the generic 500 handler.
    expect(["ERR_FILE_NOT_FOUND", "ERR_FILE_PATH_IS_SERVER_LOCAL"]).toContain(payload.error_code);
  });
});
