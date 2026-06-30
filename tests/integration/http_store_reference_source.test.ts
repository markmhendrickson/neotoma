/**
 * Integration regression: POST /store honors source_storage:'reference' (#1826).
 *
 * #1830 added source_storage to openapi.yaml but handleStorePost still routed
 * every file leg through storeUnstructuredForApi (inline bytes). This test
 * exercises the real Express handler over HTTP and asserts the sources row
 * carries storage_mode='reference'.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
const API_PORT = 18122;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

describe("POST /store — source_storage:'reference' (#1826 REST path)", () => {
  let httpServer: ReturnType<typeof createServer>;
  const createdSourceIds: string[] = [];
  const tempDirs: string[] = [];

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
    for (const dir of tempDirs) {
      try {
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function makeTempFile(content: string, filename = "http-ref-test.txt"): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-http-ref-"));
    tempDirs.push(dir);
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, content, "utf-8");
    return filePath;
  }

  it("file-only store writes storage_mode=reference on the sources row", async () => {
    const filePath = makeTempFile(`http-ref-${Date.now()}`);
    const idempotencyKey = `http-ref-only-${Date.now()}`;

    const resp = await fetch(`${API_BASE}/store`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        file_path: filePath,
        mime_type: "text/plain",
        source_storage: "reference",
        file_idempotency_key: idempotencyKey,
      }),
    });

    expect(resp.status).toBe(200);
    const body = (await resp.json()) as Record<string, unknown>;
    expect(body.storage_mode).toBe("reference");
    expect(typeof body.source_id).toBe("string");
    createdSourceIds.push(body.source_id as string);

    const { data: sourceRow, error } = await db
      .from("sources")
      .select("storage_mode, reference_path, content_hash")
      .eq("id", body.source_id as string)
      .single();
    expect(error).toBeNull();
    expect(sourceRow?.storage_mode).toBe("reference");
    expect(sourceRow?.reference_path).toBeTruthy();
    expect(sourceRow?.content_hash).toBeTruthy();
  });

  it("combined entities+file store writes storage_mode=reference on the file leg", async () => {
    const filePath = makeTempFile(`http-ref-combined-${Date.now()}`);
    const idempotencyKey = `http-ref-combined-${Date.now()}`;

    const resp = await fetch(`${API_BASE}/store`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        idempotency_key: idempotencyKey,
        file_path: filePath,
        mime_type: "text/plain",
        source_storage: "reference",
        file_idempotency_key: `${idempotencyKey}-file`,
        entities: [{ entity_type: "note", title: "HTTP ref combined", content: "body" }],
      }),
    });

    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      structured?: Record<string, unknown>;
      unstructured?: Record<string, unknown>;
    };
    expect(body.unstructured?.storage_mode).toBe("reference");
    expect(typeof body.unstructured?.source_id).toBe("string");
    createdSourceIds.push(body.unstructured!.source_id as string);

    const { data: sourceRow } = await db
      .from("sources")
      .select("storage_mode")
      .eq("id", body.unstructured!.source_id as string)
      .single();
    expect(sourceRow?.storage_mode).toBe("reference");
  });
});
