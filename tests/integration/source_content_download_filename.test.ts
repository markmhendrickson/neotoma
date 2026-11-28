/**
 * Integration regression: GET /sources/:id/content serves files whose stored
 * name holds characters Node rejects in raw header values (en dash, combining
 * accent, emoji, double quote, newline). Before the fix the raw name went into
 * Content-Disposition and the route returned 500 DOWNLOAD_FAILED.
 */

import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
const API_PORT = 18127;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

const CASES: Array<{ label: string; name: string; expectedName: string }> = [
  { label: "en dash", name: "report – final.bin", expectedName: "report – final.bin" },
  { label: "combining accent", name: "café notes.bin", expectedName: "café notes.bin" },
  { label: "emoji", name: "plan \u{1F680}.bin", expectedName: "plan \u{1F680}.bin" },
  { label: "double quote", name: 'say "hi".bin', expectedName: 'say "hi".bin' },
  { label: "newline", name: "line1\nline2.bin", expectedName: "line1line2.bin" },
];

/** Decode the RFC 5987 filename* parameter. */
function extendedFilename(header: string | null): string | null {
  const match = /filename\*=UTF-8''([^;]+)/.exec(header ?? "");
  return match ? decodeURIComponent(match[1]) : null;
}

describe("GET /sources/:id/content — stored names in Content-Disposition", () => {
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

  for (const testCase of CASES) {
    it(`downloads byte for byte when the stored name has a ${testCase.label}`, async () => {
      const bytes = Buffer.from(
        `synthetic ${testCase.label} payload ${Date.now()} é–\u{1F680}`,
        "utf-8"
      );
      const storeResp = await fetch(`${API_BASE}/store`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: TEST_USER_ID,
          file_content: bytes.toString("base64"),
          mime_type: "application/octet-stream",
          original_filename: testCase.name,
          file_idempotency_key: `download-filename-${testCase.label}-${Date.now()}`,
        }),
      });
      expect(storeResp.status).toBe(200);
      const stored = (await storeResp.json()) as Record<string, unknown>;
      const sourceId = stored.source_id as string;
      expect(typeof sourceId).toBe("string");
      createdSourceIds.push(sourceId);

      // Make sure the stored bytes are present in the test storage bucket so the
      // download exercises the header path, not a missing-file path.
      const { data: row } = await db
        .from("sources")
        .select("storage_url, original_filename")
        .eq("id", sourceId)
        .single();
      expect(row?.original_filename).toBe(testCase.name);
      await db.storage
        .from("sources")
        .upload(row!.storage_url as string, bytes, { upsert: true });

      const resp = await fetch(
        `${API_BASE}/sources/${sourceId}/content?user_id=${TEST_USER_ID}`
      );
      expect(resp.status).toBe(200);
      const body = Buffer.from(await resp.arrayBuffer());
      expect(body.equals(bytes)).toBe(true);

      const disposition = resp.headers.get("content-disposition");
      expect(disposition).toMatch(/^attachment; filename="[\x20-\x7e]*";/);
      expect(extendedFilename(disposition)).toBe(testCase.expectedName);
    });
  }
});
