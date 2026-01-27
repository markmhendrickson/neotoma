/**
 * Integration tests for Raw Storage Service
 * 
 * Tests content-addressed storage, deduplication, and retrieval.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { supabase } from "../../src/db.js";
import {
  computeContentHash,
  storeRawContent,
  getSourceMetadata,
} from "../../src/services/raw_storage.js";

describe("Raw Storage Service", () => {
  const testUserId = "test-user-raw-storage";
  const testSourceIds: string[] = [];

  beforeEach(async () => {
    // Clean up test data
    if (testSourceIds.length > 0) {
      await supabase.from("sources").delete().in("id", testSourceIds);
      testSourceIds.length = 0;
    }
  });

  afterEach(async () => {
    // Final cleanup
    if (testSourceIds.length > 0) {
      await supabase.from("sources").delete().in("id", testSourceIds);
    }
  });

  describe("computeContentHash", () => {
    it("should compute deterministic SHA-256 hash", () => {
      const buffer = Buffer.from("test content", "utf-8");
      
      const hash1 = computeContentHash(buffer);
      const hash2 = computeContentHash(buffer);
      
      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe("string");
      expect(hash1.length).toBe(64); // SHA-256 hex is 64 characters
    });

    it("should compute different hashes for different content", () => {
      const buffer1 = Buffer.from("content a", "utf-8");
      const buffer2 = Buffer.from("content b", "utf-8");
      
      const hash1 = computeContentHash(buffer1);
      const hash2 = computeContentHash(buffer2);
      
      expect(hash1).not.toBe(hash2);
    });

    it("should handle empty buffer", () => {
      const buffer = Buffer.from("", "utf-8");
      
      const hash = computeContentHash(buffer);
      
      expect(typeof hash).toBe("string");
      expect(hash.length).toBe(64);
    });

    it("should handle binary content", () => {
      const buffer = Buffer.from([0x00, 0x01, 0x02, 0xff]);
      
      const hash1 = computeContentHash(buffer);
      const hash2 = computeContentHash(buffer);
      
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);
    });

    it("should handle large content", () => {
      const largeContent = "x".repeat(1024 * 1024); // 1MB
      const buffer = Buffer.from(largeContent, "utf-8");
      
      const hash = computeContentHash(buffer);
      
      expect(typeof hash).toBe("string");
      expect(hash.length).toBe(64);
    });
  });

  describe("storeRawContent", () => {
    it("should store new content and create source record", async () => {
      const buffer = Buffer.from("test invoice content", "utf-8");
      
      const result = await storeRawContent({
        userId: testUserId,
        fileBuffer: buffer,
        mimeType: "application/pdf",
        originalFilename: "test_invoice.pdf",
      });
      
      testSourceIds.push(result.sourceId);
      
      expect(result.sourceId).toBeDefined();
      expect(result.contentHash).toBeDefined();
      expect(result.contentHash.length).toBe(64);
      expect(result.storageUrl).toBeDefined();
      expect(result.fileSize).toBe(buffer.length);
      expect(result.deduplicated).toBe(false);
      
      // Verify source record was created
      const { data: source, error } = await supabase
        .from("sources")
        .select("*")
        .eq("id", result.sourceId)
        .single();
      
      expect(error).toBeNull();
      expect(source).toBeDefined();
      expect(source!.content_hash).toBe(result.contentHash);
      expect(source!.user_id).toBe(testUserId);
      expect(source!.mime_type).toBe("application/pdf");
      expect(source!.original_filename).toBe("test_invoice.pdf");
    });

    it("should deduplicate identical content for same user", async () => {
      const buffer = Buffer.from("duplicate test content", "utf-8");
      
      // Store first time
      const result1 = await storeRawContent({
        userId: testUserId,
        fileBuffer: buffer,
        mimeType: "text/plain",
      });
      
      testSourceIds.push(result1.sourceId);
      
      expect(result1.deduplicated).toBe(false);
      
      // Store second time (same content, same user)
      const result2 = await storeRawContent({
        userId: testUserId,
        fileBuffer: buffer,
        mimeType: "text/plain",
      });
      
      expect(result2.deduplicated).toBe(true);
      expect(result2.sourceId).toBe(result1.sourceId);
      expect(result2.contentHash).toBe(result1.contentHash);
    });

    it("should not deduplicate identical content for different users", async () => {
      const buffer = Buffer.from("content for two users", "utf-8");
      const otherUserId = "other-user-raw-storage";
      
      // Store for user 1
      const result1 = await storeRawContent({
        userId: testUserId,
        fileBuffer: buffer,
        mimeType: "text/plain",
      });
      
      testSourceIds.push(result1.sourceId);
      
      // Store for user 2 (same content, different user)
      const result2 = await storeRawContent({
        userId: otherUserId,
        fileBuffer: buffer,
        mimeType: "text/plain",
      });
      
      testSourceIds.push(result2.sourceId);
      
      expect(result1.deduplicated).toBe(false);
      expect(result2.deduplicated).toBe(false);
      expect(result2.sourceId).not.toBe(result1.sourceId);
      expect(result2.contentHash).toBe(result1.contentHash); // Same content hash
    });

    it("should store provenance metadata", async () => {
      const buffer = Buffer.from("test with provenance", "utf-8");
      const provenance = {
        uploaded_via: "ui",
        client_version: "1.0.0",
      };
      
      const result = await storeRawContent({
        userId: testUserId,
        fileBuffer: buffer,
        mimeType: "text/plain",
        provenance,
      });
      
      testSourceIds.push(result.sourceId);
      
      // Verify provenance stored
      const { data: source } = await supabase
        .from("sources")
        .select("provenance")
        .eq("id", result.sourceId)
        .single();
      
      expect(source).toBeDefined();
      expect(source!.provenance).toBeDefined();
      expect(source!.provenance.uploaded_via).toBe("ui");
      expect(source!.provenance.client_version).toBe("1.0.0");
      expect(source!.provenance.uploaded_at).toBeDefined();
    });

    it("should store original filename", async () => {
      const buffer = Buffer.from("test with filename", "utf-8");
      
      const result = await storeRawContent({
        userId: testUserId,
        fileBuffer: buffer,
        mimeType: "application/pdf",
        originalFilename: "my_invoice.pdf",
      });
      
      testSourceIds.push(result.sourceId);
      
      const { data: source } = await supabase
        .from("sources")
        .select("original_filename")
        .eq("id", result.sourceId)
        .single();
      
      expect(source).toBeDefined();
      expect(source!.original_filename).toBe("my_invoice.pdf");
    });

    it("should handle different MIME types", async () => {
      const mimeTypes = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "text/plain",
        "application/json",
      ];
      
      for (const mimeType of mimeTypes) {
        const buffer = Buffer.from(`test content for ${mimeType}`, "utf-8");
        
        const result = await storeRawContent({
          userId: testUserId,
          fileBuffer: buffer,
          mimeType,
        });
        
        testSourceIds.push(result.sourceId);
        
        const { data: source } = await supabase
          .from("sources")
          .select("mime_type")
          .eq("id", result.sourceId)
          .single();
        
        expect(source!.mime_type).toBe(mimeType);
      }
    });

    it("should handle large files", async () => {
      const largeContent = "x".repeat(1024 * 100); // 100KB
      const buffer = Buffer.from(largeContent, "utf-8");
      
      const result = await storeRawContent({
        userId: testUserId,
        fileBuffer: buffer,
        mimeType: "text/plain",
      });
      
      testSourceIds.push(result.sourceId);
      
      expect(result.fileSize).toBe(buffer.length);
      expect(result.fileSize).toBe(1024 * 100);
    });
  });

  describe("getSourceMetadata", () => {
    it("should retrieve source metadata", async () => {
      const buffer = Buffer.from("test metadata retrieval", "utf-8");
      
      const result = await storeRawContent({
        userId: testUserId,
        fileBuffer: buffer,
        mimeType: "text/plain",
        originalFilename: "metadata_test.txt",
      });
      
      testSourceIds.push(result.sourceId);
      
      const metadata = await getSourceMetadata(result.sourceId);
      
      expect(metadata).toBeDefined();
      expect(metadata.id).toBe(result.sourceId);
      expect(metadata.content_hash).toBe(result.contentHash);
      expect(metadata.user_id).toBe(testUserId);
      expect(metadata.mime_type).toBe("text/plain");
      expect(metadata.original_filename).toBe("metadata_test.txt");
    });

    it("should throw error for non-existent source", async () => {
      await expect(
        getSourceMetadata("src_nonexistent")
      ).rejects.toThrow("Failed to get source metadata");
    });
  });

  describe("Content Deduplication", () => {
    it("should deduplicate exact same content", async () => {
      const content = "exact duplicate content";
      const buffer1 = Buffer.from(content, "utf-8");
      const buffer2 = Buffer.from(content, "utf-8");
      
      const result1 = await storeRawContent({
        userId: testUserId,
        fileBuffer: buffer1,
        mimeType: "text/plain",
      });
      
      testSourceIds.push(result1.sourceId);
      
      const result2 = await storeRawContent({
        userId: testUserId,
        fileBuffer: buffer2,
        mimeType: "text/plain",
      });
      
      expect(result1.sourceId).toBe(result2.sourceId);
      expect(result1.contentHash).toBe(result2.contentHash);
      expect(result2.deduplicated).toBe(true);
    });

    it("should not deduplicate different content", async () => {
      const buffer1 = Buffer.from("content a", "utf-8");
      const buffer2 = Buffer.from("content b", "utf-8");
      
      const result1 = await storeRawContent({
        userId: testUserId,
        fileBuffer: buffer1,
        mimeType: "text/plain",
      });
      
      testSourceIds.push(result1.sourceId);
      
      const result2 = await storeRawContent({
        userId: testUserId,
        fileBuffer: buffer2,
        mimeType: "text/plain",
      });
      
      testSourceIds.push(result2.sourceId);
      
      expect(result1.sourceId).not.toBe(result2.sourceId);
      expect(result1.contentHash).not.toBe(result2.contentHash);
      expect(result2.deduplicated).toBe(false);
    });

    it("should maintain per-user deduplication", async () => {
      const buffer = Buffer.from("shared content", "utf-8");
      const otherUserId = "other-user-dedup";
      
      const result1 = await storeRawContent({
        userId: testUserId,
        fileBuffer: buffer,
        mimeType: "text/plain",
      });
      
      testSourceIds.push(result1.sourceId);
      
      const result2 = await storeRawContent({
        userId: otherUserId,
        fileBuffer: buffer,
        mimeType: "text/plain",
      });
      
      testSourceIds.push(result2.sourceId);
      
      // Different users, same content -> different sources
      expect(result1.sourceId).not.toBe(result2.sourceId);
      expect(result1.contentHash).toBe(result2.contentHash);
      expect(result1.deduplicated).toBe(false);
      expect(result2.deduplicated).toBe(false);
      
      // But within same user, should deduplicate
      const result3 = await storeRawContent({
        userId: testUserId,
        fileBuffer: buffer,
        mimeType: "text/plain",
      });
      
      expect(result3.sourceId).toBe(result1.sourceId);
      expect(result3.deduplicated).toBe(true);
    });
  });

  describe("Hash Consistency", () => {
    it("should compute same hash for same binary content", () => {
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);
      
      const hash1 = computeContentHash(binaryData);
      const hash2 = computeContentHash(binaryData);
      
      expect(hash1).toBe(hash2);
    });

    it("should compute same hash for same text content regardless of buffer creation method", () => {
      const content = "consistent text content";
      
      const buffer1 = Buffer.from(content, "utf-8");
      const buffer2 = Buffer.from(content, "utf-8");
      const buffer3 = Buffer.from(content);
      
      const hash1 = computeContentHash(buffer1);
      const hash2 = computeContentHash(buffer2);
      const hash3 = computeContentHash(buffer3);
      
      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it("should be sensitive to single byte differences", () => {
      const buffer1 = Buffer.from("content", "utf-8");
      const buffer2 = Buffer.from("Content", "utf-8"); // Capital C
      
      const hash1 = computeContentHash(buffer1);
      const hash2 = computeContentHash(buffer2);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("Storage Path Generation", () => {
    it("should generate storage path with user ID and hash", async () => {
      const buffer = Buffer.from("path test content", "utf-8");
      
      const result = await storeRawContent({
        userId: testUserId,
        fileBuffer: buffer,
        mimeType: "text/plain",
      });
      
      testSourceIds.push(result.sourceId);
      
      expect(result.storageUrl).toBe(`${testUserId}/${result.contentHash}`);
    });

    it("should use same storage path for deduplicated content", async () => {
      const buffer = Buffer.from("dedup path test", "utf-8");
      
      const result1 = await storeRawContent({
        userId: testUserId,
        fileBuffer: buffer,
        mimeType: "text/plain",
      });
      
      testSourceIds.push(result1.sourceId);
      
      const result2 = await storeRawContent({
        userId: testUserId,
        fileBuffer: buffer,
        mimeType: "text/plain",
      });
      
      expect(result2.storageUrl).toBe(result1.storageUrl);
    });
  });

  describe("getSourceMetadata", () => {
    it("should retrieve all source fields", async () => {
      const buffer = Buffer.from("metadata test", "utf-8");
      
      const result = await storeRawContent({
        userId: testUserId,
        fileBuffer: buffer,
        mimeType: "application/json",
        originalFilename: "test.json",
        provenance: { source: "test" },
      });
      
      testSourceIds.push(result.sourceId);
      
      const metadata = await getSourceMetadata(result.sourceId);
      
      expect(metadata.id).toBe(result.sourceId);
      expect(metadata.user_id).toBe(testUserId);
      expect(metadata.content_hash).toBe(result.contentHash);
      expect(metadata.mime_type).toBe("application/json");
      expect(metadata.original_filename).toBe("test.json");
      expect(metadata.storage_url).toBe(result.storageUrl);
      expect(metadata.file_size).toBe(buffer.length);
      expect(metadata.provenance).toBeDefined();
      expect(metadata.created_at).toBeDefined();
    });

    it("should include storage status", async () => {
      const buffer = Buffer.from("status test", "utf-8");
      
      const result = await storeRawContent({
        userId: testUserId,
        fileBuffer: buffer,
        mimeType: "text/plain",
      });
      
      testSourceIds.push(result.sourceId);
      
      const metadata = await getSourceMetadata(result.sourceId);
      
      expect(metadata.storage_status).toBeDefined();
    });
  });

  describe("File Size Tracking", () => {
    it("should track file size accurately", async () => {
      const sizes = [100, 1024, 10240, 102400]; // Various sizes
      
      for (const size of sizes) {
        const buffer = Buffer.alloc(size);
        
        const result = await storeRawContent({
          userId: testUserId,
          fileBuffer: buffer,
          mimeType: "application/octet-stream",
        });
        
        testSourceIds.push(result.sourceId);
        
        expect(result.fileSize).toBe(size);
        
        const metadata = await getSourceMetadata(result.sourceId);
        expect(metadata.file_size).toBe(size);
      }
    });
  });
});
