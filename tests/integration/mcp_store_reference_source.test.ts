/**
 * Agent-observable integration tests for by-reference source storage (#1775).
 *
 * Drives the MCP `store` tool handler directly through the NeotomaServer
 * public dispatch surface — the same code path an AI agent or MCP client
 * exercises at runtime — rather than the internal service layer.
 *
 * Tests cover:
 * 1. store(source_storage='reference', file_path=<real temp file>) persists
 *    a sources row whose `path`, `content_hash`, and `size_bytes` are correct.
 * 2. The blob bytes are NOT stored in the sources row (storage_mode='reference',
 *    storage_url uses the reference:// scheme, no binary content in the DB row).
 * 3. retrieveFileUrl(source_id) for an AVAILABLE file returns the path and
 *    storage_mode='reference' metadata — no blob bytes in the response.
 * 4. retrieveFileUrl(source_id) after the file is DELETED returns a structured
 *    SOURCE_UNAVAILABLE error, not an empty blob or a thrown exception.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";

// ─── setup / teardown ───────────────────────────────────────────────────────

describe("MCP store — source_storage:'reference' (agent-observable surface)", () => {
  let server: NeotomaServer;
  const testUserId = "00000000-0000-0000-0000-000000000001";
  const createdSourceIds: string[] = [];
  const tempDirs: string[] = [];

  beforeAll(async () => {
    server = new NeotomaServer();
    // Inject the test user directly so the handler doesn't require a real auth token.
    (server as unknown as { authenticatedUserId: string }).authenticatedUserId = testUserId;
  });

  beforeEach(async () => {
    // Clean sources created in the previous test so dedup doesn't interfere.
    if (createdSourceIds.length > 0) {
      await db.from("observations").delete().in("source_id", createdSourceIds);
      await db.from("raw_fragments").delete().in("source_id", createdSourceIds);
      await db.from("sources").delete().in("id", createdSourceIds);
      createdSourceIds.length = 0;
    }
  });

  afterAll(async () => {
    // Final cleanup of any remaining sources.
    if (createdSourceIds.length > 0) {
      await db.from("observations").delete().in("source_id", createdSourceIds);
      await db.from("raw_fragments").delete().in("source_id", createdSourceIds);
      await db.from("sources").delete().in("id", createdSourceIds);
    }
    // Remove temp directories.
    for (const dir of tempDirs) {
      try {
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  // ─── helper ───────────────────────────────────────────────────────────────

  function makeTempFile(content: string, filename = "ref-test.txt"): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-ref-eval-"));
    tempDirs.push(dir);
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, content, "utf-8");
    return filePath;
  }

  // ─── 1. reference row persists path, content_hash, size_bytes ─────────────

  it("persists path, content_hash, and size_bytes in the sources row", async () => {
    const fileContent = `Reference source eval content — ${Date.now()}`;
    const filePath = makeTempFile(fileContent, "eval-ref.txt");

    const result = await (
      server as unknown as {
        store: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>;
      }
    ).store({
      user_id: testUserId,
      file_path: filePath,
      source_storage: "reference",
      idempotency_key: `ref-eval-1-${Date.now()}`,
    });

    const responseData = JSON.parse(result.content[0]!.text) as Record<string, unknown>;

    // Top-level response fields
    expect(responseData.source_id).toBeDefined();
    expect(typeof responseData.source_id).toBe("string");
    expect(responseData.storage_mode).toBe("reference");
    expect(responseData.content_hash).toBeDefined();
    expect(typeof responseData.content_hash).toBe("string");
    expect((responseData.content_hash as string).length).toBe(64); // SHA-256 hex
    expect(typeof responseData.size_bytes).toBe("number");
    expect(responseData.size_bytes).toBeGreaterThan(0);
    // `path` must round-trip to the original absolute path
    expect(responseData.path).toBe(filePath);

    const sourceId = responseData.source_id as string;
    createdSourceIds.push(sourceId);

    // Confirm the DB row has reference-mode columns set correctly.
    const { data: row, error: rowErr } = await db
      .from("sources")
      .select("id, storage_mode, reference_path, size_bytes, content_hash, storage_url")
      .eq("id", sourceId)
      .single();

    expect(rowErr).toBeNull();
    expect(row).toBeDefined();
    expect(row!.storage_mode).toBe("reference");
    expect(row!.reference_path).toBe(filePath);
    expect(row!.content_hash).toBe(responseData.content_hash);
    expect(row!.size_bytes).toBe(responseData.size_bytes);
  });

  // ─── 2. no blob bytes stored in the row ───────────────────────────────────

  it("does NOT store blob bytes — storage_url uses reference:// scheme", async () => {
    const fileContent = `No-blob reference content — ${Date.now()}`;
    const filePath = makeTempFile(fileContent, "no-blob.txt");

    const result = await (
      server as unknown as {
        store: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>;
      }
    ).store({
      user_id: testUserId,
      file_path: filePath,
      source_storage: "reference",
      idempotency_key: `ref-eval-2-${Date.now()}`,
    });

    const responseData = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    const sourceId = responseData.source_id as string;
    createdSourceIds.push(sourceId);

    // Fetch the full row to inspect the storage_url
    const { data: row, error: rowErr } = await db
      .from("sources")
      .select("storage_url, storage_mode")
      .eq("id", sourceId)
      .single();

    expect(rowErr).toBeNull();
    expect(row!.storage_mode).toBe("reference");
    // Reference sources use the reference:// URL scheme — no bucket path, no blob upload
    expect(row!.storage_url).toMatch(/^reference:\/\//);
    // The file's content must NOT appear verbatim in storage_url (it should be metadata only)
    expect(row!.storage_url).not.toContain(fileContent);
  });

  // ─── 3. retrieveFileUrl returns path metadata for an available file ────────

  it("retrieveFileUrl returns path and storage_mode for an available reference file", async () => {
    const fileContent = `Retrievable reference — ${Date.now()}`;
    const filePath = makeTempFile(fileContent, "retrievable.txt");

    const storeResult = await (
      server as unknown as {
        store: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>;
      }
    ).store({
      user_id: testUserId,
      file_path: filePath,
      source_storage: "reference",
      idempotency_key: `ref-eval-3-${Date.now()}`,
    });
    const storeData = JSON.parse(storeResult.content[0]!.text) as Record<string, unknown>;
    const sourceId = storeData.source_id as string;
    createdSourceIds.push(sourceId);

    // Exercise retrieveFileUrl through the MCP dispatch path
    const retrieveResult = await (
      server as unknown as {
        retrieveFileUrl: (
          args: unknown
        ) => Promise<{ content: Array<{ type: string; text: string }> }>;
      }
    ).retrieveFileUrl({
      source_id: sourceId,
    });
    const retrieveData = JSON.parse(retrieveResult.content[0]!.text) as Record<string, unknown>;

    // Must come back as reference mode with a path — NOT a signed URL or blob
    expect(retrieveData.storage_mode).toBe("reference");
    expect(retrieveData.path).toBe(filePath);
    expect(retrieveData.content_hash).toBeDefined();
    // Must not have an error field
    expect(retrieveData.error).toBeUndefined();
    // Must not return blob bytes (no `data` or `buffer` field)
    expect(retrieveData.data).toBeUndefined();
    expect(retrieveData.buffer).toBeUndefined();
  });

  // ─── 4. retrieveFileUrl returns SOURCE_UNAVAILABLE for a deleted file ──────

  it("retrieveFileUrl returns SOURCE_UNAVAILABLE when the referenced file has been deleted", async () => {
    const fileContent = `Will be deleted — ${Date.now()}`;
    const filePath = makeTempFile(fileContent, "will-be-deleted.txt");

    const storeResult = await (
      server as unknown as {
        store: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>;
      }
    ).store({
      user_id: testUserId,
      file_path: filePath,
      source_storage: "reference",
      idempotency_key: `ref-eval-4-${Date.now()}`,
    });
    const storeData = JSON.parse(storeResult.content[0]!.text) as Record<string, unknown>;
    const sourceId = storeData.source_id as string;
    createdSourceIds.push(sourceId);

    // Delete the file so the reference becomes stale
    fs.unlinkSync(filePath);
    expect(fs.existsSync(filePath)).toBe(false);

    // Exercise retrieveFileUrl — must surface SOURCE_UNAVAILABLE, not throw
    const retrieveResult = await (
      server as unknown as {
        retrieveFileUrl: (
          args: unknown
        ) => Promise<{ content: Array<{ type: string; text: string }> }>;
      }
    ).retrieveFileUrl({
      source_id: sourceId,
    });
    const retrieveData = JSON.parse(retrieveResult.content[0]!.text) as Record<string, unknown>;

    expect(retrieveData.error).toBe("SOURCE_UNAVAILABLE");
    // Structured error details must include the path so the caller knows what to recover
    expect(retrieveData.path).toBe(filePath);
    // Must not be an empty object — the error must be informative
    expect(Object.keys(retrieveData).length).toBeGreaterThan(1);
  });
});
