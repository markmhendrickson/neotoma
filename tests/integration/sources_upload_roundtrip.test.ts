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
 * all. This file sets that variable in its own `beforeAll`, so the round-trip
 * test really does read bytes back out of storage rather than passing
 * vacuously.
 *
 * #2352 note: the test formerly titled "round-trips bytes: upload →
 * store(source_id) → sources row matches the hash" never POSTed to /store. It
 * uploaded and then read the `sources` row directly, so the store(source_id)
 * leg — the headline capability — had no coverage, and the test would have
 * passed unchanged against a store() that ignored source_id completely. It has
 * been split: the upload-only assertions keep a title that claims only what
 * they check, and a genuine round trip below drives POST /store and asserts
 * the graph state it produces.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import os from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app, canonicalAauthAuthority } from "../../src/actions.js";
import { db } from "../../src/db.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
const API_PORT = 18131;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

const sha256 = (buf: Buffer) => crypto.createHash("sha256").update(buf).digest("hex");

async function uploadTempDirs(): Promise<string[]> {
  return (await fs.promises.readdir(os.tmpdir())).filter((entry) =>
    entry.startsWith("neotoma-upload-")
  );
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 2_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return predicate();
}

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
  let previousRealStorage: string | undefined;

  beforeAll(async () => {
    // Opt into the real bucket leg. The round-trip test below reads bytes back
    // out of storage; without this `storeRawContent` writes only the `sources`
    // row and that assertion could not fail on what it watches (#2325). Set
    // here rather than left to the runner so the file is self-sufficient.
    previousRealStorage = process.env.NEOTOMA_TEST_REAL_STORAGE;
    process.env.NEOTOMA_TEST_REAL_STORAGE = "1";

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
    if (previousRealStorage === undefined) delete process.env.NEOTOMA_TEST_REAL_STORAGE;
    else process.env.NEOTOMA_TEST_REAL_STORAGE = previousRealStorage;
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

  it("the upload handle resolves to a sources row carrying the same hash and size", async () => {
    // Deliberately NOT titled a round trip: this exercises only the upload
    // leg. The store(source_id) leg is the test below, which was the gap —
    // this assertion set would pass unchanged against a store() that ignored
    // source_id entirely (#2352).
    const fileBuffer = crypto.randomBytes(3 * 1024 * 1024);
    const expectedHash = sha256(fileBuffer);

    const { status, payload } = await upload(fileBuffer, { filename: "roundtrip.bin" });
    expect(status).toBe(200);
    expect(payload.content_hash).toBe(expectedHash);

    const sourceId = payload.source_id as string;

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

  it("round-trips bytes: upload → POST /store(source_id) → asset entity + stored bytes match", async () => {
    // The actual round trip, and the PR's headline capability. It POSTs to
    // /store — the leg the previous version of this test never exercised, so
    // store() could have discarded source_id completely and the suite stayed
    // green (#2352).
    //
    // NEOTOMA_TEST_REAL_STORAGE is set for this file (see the `beforeAll` on
    // the describe), so the bucket leg actually ran and the bytes read back
    // below are bytes that were really stored. Without it this assertion could
    // not fail on what it claims to watch.
    const fileBuffer = crypto.randomBytes(64 * 1024);
    const expectedHash = sha256(fileBuffer);

    const { status: uploadStatus, payload: uploadPayload } = await upload(fileBuffer, {
      filename: "store-roundtrip.bin",
    });
    expect(uploadStatus).toBe(200);
    const sourceId = uploadPayload.source_id as string;

    // The leg under test: hand store() nothing but the opaque handle.
    const storeResponse = await fetch(`${API_BASE}/store?user_id=${TEST_USER_ID}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        idempotency_key: `store-roundtrip-${sourceId}`,
        source_id: sourceId,
        // /store reads user_id from the body, not the query string — the
        // upload route reads it from the query. Both must name the same user
        // or the handle resolves against a different scope and 404s.
        user_id: TEST_USER_ID,
      }),
    });

    expect(storeResponse.status).toBe(200);
    // Read as text first: a store() that ignored source_id answers 200 with an
    // empty body, and parsing that straight to JSON would fail with an opaque
    // SyntaxError instead of naming what went wrong.
    const rawStoreBody = await storeResponse.text();
    expect(rawStoreBody, "POST /store returned an empty body — source_id was ignored").not.toBe("");
    const storeBody = JSON.parse(rawStoreBody) as {
      unstructured?: Record<string, unknown>;
    } & Record<string, unknown>;
    const stored = (storeBody.unstructured ?? storeBody) as Record<string, unknown>;

    // store() honored the handle rather than re-storing or ignoring it.
    expect(stored.source_id).toBe(sourceId);
    expect(stored.content_hash).toBe(expectedHash);
    expect(stored.storage_mode).toBe("uploaded");

    // The graph effect store() is supposed to produce: an asset entity for the
    // file. A store() that resolved the handle and attached nothing fails here.
    expect(typeof stored.asset_entity_id).toBe("string");
    expect(stored.asset_entity_type).toBe("file_asset");

    const assetEntityId = stored.asset_entity_id as string;
    const { data: assetEntity } = await db
      .from("entities")
      .select("id, entity_type")
      .eq("id", assetEntityId)
      .maybeSingle();
    expect(assetEntity?.entity_type).toBe("file_asset");

    // …and an observation of it tied back to this exact source.
    const { data: assetObservations } = await db
      .from("observations")
      .select("id, entity_id, source_id")
      .eq("user_id", TEST_USER_ID)
      .eq("source_id", sourceId)
      .eq("entity_id", assetEntityId);
    expect((assetObservations ?? []).length).toBeGreaterThan(0);

    // Finally the bytes themselves, read back out of storage and hashed.
    const { data: sourceRow } = await db
      .from("sources")
      .select("id, content_hash, file_size, original_filename, storage_url")
      .eq("id", sourceId)
      .eq("user_id", TEST_USER_ID)
      .maybeSingle();
    expect(sourceRow?.content_hash).toBe(expectedHash);
    expect(sourceRow?.storage_url).toBeTruthy();

    const { downloadRawContent } = await import("../../src/services/raw_storage.js");
    const retrieved = await downloadRawContent(sourceRow!.storage_url as string);
    expect(sha256(retrieved)).toBe(expectedHash);
    expect(retrieved.length).toBe(fileBuffer.length);
  });

  it("authenticates upload, scopes handles, and downloads a large binary unchanged", async () => {
    const previousToken = process.env.NEOTOMA_BEARER_TOKEN;
    process.env.NEOTOMA_BEARER_TOKEN = "upload-test-bearer";
    const bytes = crypto.randomBytes(12 * 1024 * 1024);
    const key = `authenticated-${crypto.randomUUID()}`;
    const multipart = buildMultipart(bytes, { fields: { idempotency_key: key } });
    const remoteHeaders = {
      "content-type": multipart.contentType,
      "x-forwarded-for": "203.0.113.10",
    };
    try {
      for (const authorization of [undefined, "Bearer invalid-upload-token"]) {
        const denied = await fetch(`${API_BASE}/sources/upload`, {
          method: "POST",
          headers: { ...remoteHeaders, ...(authorization ? { authorization } : {}) },
          body: new Uint8Array(multipart.body),
        });
        expect(denied.status).toBe(401);
      }
      const headers = { ...remoteHeaders, authorization: "Bearer upload-test-bearer" };
      const send = () =>
        fetch(`${API_BASE}/sources/upload`, {
          method: "POST",
          headers,
          body: new Uint8Array(multipart.body),
        });
      const first = await send();
      expect(first.status).toBe(200);
      const source = await first.json();
      createdSourceIds.push(source.source_id);
      const replay = await (await send()).json();
      expect(replay.source_id).toBe(source.source_id);
      expect(replay.deduplicated).toBe(true);
      const { data: row } = await db
        .from("sources")
        .select("user_id, content_hash")
        .eq("id", source.source_id)
        .single();
      expect(row.user_id).toBe("00000000-0000-0000-0000-000000000000");
      expect(row.content_hash).toBe(sha256(bytes));
      const download = await fetch(`${API_BASE}/sources/${source.source_id}/content`, { headers });
      expect(download.status).toBe(200);
      expect(Buffer.from(await download.arrayBuffer()).equals(bytes)).toBe(true);
      // The test's explicit dev-user override selects another authenticated scope.
      const otherUser = "00000000-0000-0000-0000-000000000009";
      const deniedDownload = await fetch(
        `${API_BASE}/sources/${source.source_id}/content?user_id=${otherUser}`,
        { headers }
      );
      expect(deniedDownload.status).toBe(404);
      const deniedAttach = await fetch(`${API_BASE}/store`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          user_id: otherUser,
          source_id: source.source_id,
          idempotency_key: `${key}-other`,
        }),
      });
      expect(deniedAttach.status).toBe(404);
      const { NeotomaServer } = await import("../../src/server.js");
      const mcp = new NeotomaServer();
      (mcp as any).authenticatedUserId = otherUser;
      await expect(
        (mcp as any).store({ source_id: source.source_id, idempotency_key: `${key}-mcp` })
      ).rejects.toThrow(/ERR_SOURCE_NOT_FOUND/);
    } finally {
      if (previousToken === undefined) delete process.env.NEOTOMA_BEARER_TOKEN;
      else process.env.NEOTOMA_BEARER_TOKEN = previousToken;
    }
  });

  it("binds a signed upload to its complete multipart bytes before storing", async () => {
    const { fetch: signedFetch } = await import("@hellocoop/httpsig");
    const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    const privateJwk = privateKey.export({ format: "jwk" });
    const original = buildMultipart(crypto.randomBytes(1024), { filename: "signed.bin" });
    const signed = (await signedFetch(`http://${canonicalAauthAuthority()}/sources/upload`, {
      method: "POST",
      body: new Uint8Array(original.body),
      headers: { "content-type": original.contentType },
      signingKey: privateJwk,
      signatureKey: { type: "hwk" },
      components: [
        "@method",
        "@authority",
        "@path",
        "content-type",
        "content-digest",
        "signature-key",
      ],
      dryRun: true,
    })) as unknown as { headers: Headers };
    const valid = await fetch(`${API_BASE}/sources/upload`, {
      method: "POST",
      headers: signed.headers,
      body: new Uint8Array(original.body),
    });
    expect(valid.status).toBe(200);
    const source = await valid.json();
    createdSourceIds.push(source.source_id);
    const { data: row } = await db
      .from("sources")
      .select("provenance")
      .eq("id", source.source_id)
      .single();
    expect(JSON.stringify(row.provenance)).toMatch(/software|hardware/);
    const changed = Buffer.from(original.body);
    const fileStart = changed.indexOf(Buffer.from("\r\n\r\n")) + 4;
    changed[fileStart] ^= 0xff;
    const tampered = await fetch(`${API_BASE}/sources/upload`, {
      method: "POST",
      headers: signed.headers,
      body: new Uint8Array(changed),
    });
    expect(tampered.status).toBe(400);
    expect((await tampered.json()).error_code).toBe("ERR_UPLOAD_DIGEST_MISMATCH");
    const { data: storedTamper } = await db
      .from("sources")
      .select("id")
      .eq("content_hash", sha256(changed.subarray(fileStart, fileStart + 1024)))
      .maybeSingle();
    expect(storedTamper).toBeNull();
    const uncovered = (await signedFetch(`http://${canonicalAauthAuthority()}/sources/upload`, {
      method: "POST",
      body: new Uint8Array(original.body),
      headers: { "content-type": original.contentType },
      signingKey: privateJwk,
      signatureKey: { type: "hwk" },
      dryRun: true,
    })) as unknown as { headers: Headers };
    const denied = await fetch(`${API_BASE}/sources/upload`, {
      method: "POST",
      headers: uncovered.headers,
      body: new Uint8Array(original.body),
    });
    expect(denied.status).toBe(400);
    expect((await denied.json()).error_code).toBe("ERR_UPLOAD_DIGEST_REQUIRED");
  });

  it("accepts exact file and metadata limits", async () => {
    const previousLimit = process.env.NEOTOMA_MAX_UPLOAD_BYTES;
    process.env.NEOTOMA_MAX_UPLOAD_BYTES = "1024";
    try {
      const { status } = await upload(crypto.randomBytes(1024), {
        fields: {
          original_filename: "x".repeat(4096),
          mime_type: "application/octet-stream",
          idempotency_key: crypto.randomUUID(),
        },
      });
      expect(status).toBe(200);
    } finally {
      if (previousLimit === undefined) delete process.env.NEOTOMA_MAX_UPLOAD_BYTES;
      else process.env.NEOTOMA_MAX_UPLOAD_BYTES = previousLimit;
    }
  });

  it("refuses oversized multipart metadata before creating a source", async () => {
    const { status, payload } = await upload(crypto.randomBytes(32), {
      fields: { original_filename: "x".repeat(4097) },
    });
    expect(status).toBe(400);
    expect(payload.error_code).toBe("ERR_UPLOAD_FIELDS");
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
    const pdfBytes = Buffer.concat([Buffer.from("%PDF-1.4\n"), crypto.randomBytes(256)]);

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

  it("settles an interrupted multipart upload and removes its temporary payload", async () => {
    // A real socket disconnect is the important case: `req.pipe(busboy)` does
    // not turn it into Busboy's normal close/error events. The test waits until
    // receipt has created a temp directory before destroying the client, so a
    // route that never began handling the request cannot pass vacuously.
    const before = new Set(await uploadTempDirs());
    const boundary = `----neotomaInterrupted${crypto.randomBytes(12).toString("hex")}`;
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="interrupted.bin"\r\n` +
        "Content-Type: application/octet-stream\r\n\r\n"
    );
    const client = httpRequest({
      hostname: "127.0.0.1",
      port: API_PORT,
      path: `/sources/upload?user_id=${TEST_USER_ID}`,
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    });
    // Destroying a live request normally reports ECONNRESET; the assertion is
    // about the server-side receipt lifecycle, so consume that expected error.
    client.on("error", () => {});
    client.write(head);
    client.write(crypto.randomBytes(1024 * 1024));

    const started = await waitFor(async () =>
      (await uploadTempDirs()).some((dir) => !before.has(dir))
    );
    expect(started).toBe(true);
    client.destroy();

    const cleaned = await waitFor(async () =>
      (await uploadTempDirs()).every((dir) => before.has(dir))
    );
    // The receiver rejects only after its writer has shut down, and its outer
    // cleanup then removes this directory. A pending receiver leaves it here.
    expect(cleaned).toBe(true);
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
