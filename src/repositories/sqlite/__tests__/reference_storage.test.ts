/**
 * Integration tests for by-reference source storage (#1775).
 *
 * These tests write to a real in-process SQLite DB (same pattern as
 * local_db_adapter.test.ts) to verify the addColumnIfMissing schema migration
 * adds the reference columns and that reference rows can be round-tripped.
 *
 * Tests cover:
 * - schema migration: reference columns exist after DB init
 * - insert a reference source row (storage_mode='reference', no blob)
 * - content_hash dedup: inserting same hash returns existing row
 * - resolveReferenceSource integration: live file → found; missing → SOURCE_UNAVAILABLE
 * - dangling-reference warning shape (verifies the response structure)
 */

import path from "path";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { describe, it, expect } from "vitest";
import { computeContentHash, resolveReferenceSource } from "../../../services/raw_storage.js";

let dbImportSeq = 0;
let rowSeq = 0;

async function loadDb(tempDir: string) {
  process.env.NEOTOMA_DATA_DIR = tempDir;
  process.env.NEOTOMA_EVENT_LOG_PATH = path.join(tempDir, "events.log");
  process.env.NEOTOMA_EVENT_LOG_MIRROR = "false";

  const moduleUrl = new URL("../../../db.js", import.meta.url).href;
  const cacheBustUrl = `${moduleUrl}?cacheBust=${Date.now()}-${++dbImportSeq}`;
  const module = await import(cacheBustUrl);
  return module.db;
}

function makeTempDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), `${prefix}-`));
}

function nextId(prefix: string): string {
  rowSeq += 1;
  return `${prefix}_${process.pid}_${Date.now()}_${rowSeq}`;
}

// ─── schema migration ────────────────────────────────────────────────────────

describe("reference storage — schema migration", () => {
  it("adds reference columns to sources table on DB init", async () => {
    const tempDir = makeTempDir("neotoma-ref-schema");
    const db = await loadDb(tempDir);

    // Insert a minimal sources row and read it back selecting the new columns.
    // If the columns don't exist, the insert or select will error.
    const sourceId = nextId("src_schema_check");
    const userId = nextId("user_schema_check");
    const contentHash = nextId("hash_schema_check");

    const { error: insertError } = await db
      .from("sources")
      .insert({
        id: sourceId,
        user_id: userId,
        content_hash: contentHash,
        mime_type: "text/plain",
        storage_url: `reference://localhost/tmp/test.txt`,
        storage_mode: "reference",
        reference_path: "/tmp/test.txt",
        host_id: "localhost",
        size_bytes: 100,
        mtime: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    expect(insertError).toBeNull();

    // Read back, selecting the new reference columns
    const { data: fetched, error: fetchError } = await db
      .from("sources")
      .select("storage_mode, reference_path, host_id, size_bytes, mtime")
      .eq("id", sourceId)
      .single();

    expect(fetchError).toBeNull();
    expect(fetched?.storage_mode).toBe("reference");
    expect(fetched?.reference_path).toBe("/tmp/test.txt");
    expect(fetched?.host_id).toBe("localhost");
    expect(fetched?.size_bytes).toBe(100);
    expect(fetched?.mtime).toBeDefined();

    rmSync(tempDir, { recursive: true, force: true });
  });
});

// ─── reference row round-trip ────────────────────────────────────────────────

describe("reference storage — DB round-trip", () => {
  it("inserts a reference source row with storage_mode=reference and no blob", async () => {
    const tempDir = makeTempDir("neotoma-ref-insert");
    const db = await loadDb(tempDir);

    const sourceId = nextId("src_ref");
    const userId = nextId("user_ref");
    const absPath = path.join(tempDir, "test-file.txt");
    writeFileSync(absPath, "hello reference", "utf-8");
    const content = Buffer.from("hello reference", "utf-8");
    const contentHash = computeContentHash(content);
    const hostId = "test-host-1";
    const sizeBytes = content.length;
    const mtime = new Date().toISOString();

    const { data: inserted, error: insertError } = await db
      .from("sources")
      .insert({
        id: sourceId,
        user_id: userId,
        content_hash: contentHash,
        mime_type: "text/plain",
        // storage_url uses reference:// scheme — no real blob stored
        storage_url: `reference://${hostId}${absPath}`,
        file_size: sizeBytes,
        original_filename: "test-file.txt",
        storage_mode: "reference",
        reference_path: absPath,
        host_id: hostId,
        size_bytes: sizeBytes,
        mtime,
        created_at: new Date().toISOString(),
        provenance: { storage_mode: "reference" },
      })
      .select()
      .single();

    expect(insertError).toBeNull();
    expect(inserted?.id).toBe(sourceId);
    expect(inserted?.storage_mode).toBe("reference");
    expect(inserted?.reference_path).toBe(absPath);
    expect(inserted?.host_id).toBe(hostId);
    expect(inserted?.size_bytes).toBe(sizeBytes);
    // No blob bytes stored — storage_url uses reference:// scheme
    expect(inserted?.storage_url).toMatch(/^reference:\/\//);

    // Verify round-trip read
    const { data: fetched, error: fetchError } = await db
      .from("sources")
      .select("*")
      .eq("id", sourceId)
      .single();

    expect(fetchError).toBeNull();
    expect(fetched?.storage_mode).toBe("reference");
    expect(fetched?.content_hash).toBe(contentHash);

    rmSync(tempDir, { recursive: true, force: true });
  });

  it("enforces UNIQUE(content_hash, user_id) dedup on reference rows", async () => {
    const tempDir = makeTempDir("neotoma-ref-dedup");
    const db = await loadDb(tempDir);

    const userId = nextId("user_dedup");
    const absPath = path.join(tempDir, "dedup.txt");
    writeFileSync(absPath, "dedup content", "utf-8");
    const contentHash = computeContentHash(Buffer.from("dedup content", "utf-8"));
    const hostId = "test-host-2";

    const row = {
      user_id: userId,
      content_hash: contentHash,
      mime_type: "text/plain",
      storage_url: `reference://${hostId}${absPath}`,
      file_size: 13,
      storage_mode: "reference",
      reference_path: absPath,
      host_id: hostId,
      size_bytes: 13,
      mtime: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    const { error: firstErr } = await db
      .from("sources")
      .insert({ id: nextId("src_dedup_1"), ...row })
      .select()
      .single();

    expect(firstErr).toBeNull();

    // Second insert with same (content_hash, user_id) should fail with a unique constraint error
    const { error: secondErr } = await db
      .from("sources")
      .insert({ id: nextId("src_dedup_2"), ...row })
      .select()
      .single();

    expect(secondErr).not.toBeNull();
    const errMsg = (secondErr as { message: string }).message?.toLowerCase() ?? "";
    expect(errMsg).toMatch(/unique|duplicate/);

    rmSync(tempDir, { recursive: true, force: true });
  });
});

// ─── resolveReferenceSource integration ─────────────────────────────────────

describe("resolveReferenceSource — filesystem integration", () => {
  it("resolves a live file to a buffer", () => {
    const tempDir = makeTempDir("neotoma-ref-resolve");
    const absPath = path.join(tempDir, "live.txt");
    const content = "live reference content";
    writeFileSync(absPath, content, "utf-8");
    const contentHash = computeContentHash(Buffer.from(content, "utf-8"));

    const result = resolveReferenceSource({
      reference_path: absPath,
      content_hash: contentHash,
      host_id: "localhost",
    });

    expect(result.found).toBe(true);
    expect(result.buffer?.toString("utf-8")).toBe(content);

    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns SOURCE_UNAVAILABLE for a deleted file", () => {
    const tempDir = makeTempDir("neotoma-ref-missing");
    const absPath = path.join(tempDir, "will-be-deleted.txt");
    writeFileSync(absPath, "temporary", "utf-8");
    // Delete it before resolving
    rmSync(absPath);

    const result = resolveReferenceSource({
      reference_path: absPath,
      content_hash: "abc",
      host_id: "localhost",
    });

    expect(result.found).toBe(false);
    expect(result.error).toBe("SOURCE_UNAVAILABLE");
    expect((result.details as Record<string, unknown>).path).toBe(absPath);

    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns SOURCE_REFERENCE_STALE when file content has drifted", () => {
    const tempDir = makeTempDir("neotoma-ref-stale");
    const absPath = path.join(tempDir, "drifted.txt");
    writeFileSync(absPath, "current content", "utf-8");

    const result = resolveReferenceSource({
      reference_path: absPath,
      content_hash: "original-hash-that-no-longer-matches",
      host_id: "localhost",
    });

    expect(result.found).toBe(false);
    expect(result.error).toBe("SOURCE_REFERENCE_STALE");
    const details = result.details as Record<string, unknown>;
    expect(details.expected_hash).toBe("original-hash-that-no-longer-matches");
    expect(details.actual_hash).toBeDefined();

    rmSync(tempDir, { recursive: true, force: true });
  });
});
