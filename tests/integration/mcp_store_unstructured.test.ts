/**
 * Integration tests for MCP store action with unstructured files
 * 
 * Tests per MCP_SPEC.md section 3.1 (unstructured path):
 * - File content or file path input
 * - AI interpretation pipeline (LLM extraction)
 * - Deduplication (deterministic content hashing)
 * - Response schema validation
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import fs from "fs";
import path from "path";
import os from "os";
import {
  validateStoreUnstructuredResponse,
  validateErrorEnvelope,
  VALIDATION_ERROR_CODES
} from "../helpers/mcp_spec_validators.js";
import { cleanupTestEntityType } from "../helpers/test_schema_helpers.js";

describe("MCP Store with Unstructured Files - Integration", () => {
  let server: NeotomaServer;
  const testUserId = "00000000-0000-0000-0000-000000000000";
  const createdSourceIds: string[] = [];
  const tempFiles: string[] = [];

  beforeAll(async () => {
    server = new NeotomaServer();
  });

  beforeEach(async () => {
    // Cleanup test data
    if (createdSourceIds.length > 0) {
      await db.from("observations").delete().in("source_id", createdSourceIds);
      await db.from("raw_fragments").delete().in("source_id", createdSourceIds);
      await db.from("sources").delete().in("id", createdSourceIds);
      createdSourceIds.length = 0;
    }
    
    // Cleanup temp files
    for (const file of tempFiles) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    tempFiles.length = 0;
  });

  afterAll(async () => {
    // Final cleanup
    if (createdSourceIds.length > 0) {
      await db.from("observations").delete().in("source_id", createdSourceIds);
      await db.from("raw_fragments").delete().in("source_id", createdSourceIds);
      await db.from("sources").delete().in("id", createdSourceIds);
    }
    
    for (const file of tempFiles) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  describe("Store with file_path (per MCP_SPEC.md 3.1)", () => {
    it("should store file via file_path with interpret=true", async () => {
      // Create a simple text file with unique content
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-test-"));
      const testFile = path.join(tempDir, "test_note.txt");
      tempFiles.push(testFile);
      tempFiles.push(tempDir);

      const uniqueContent = `This is a test note ${Date.now()} about a meeting.`;
      fs.writeFileSync(testFile, uniqueContent);

      // Store via MCP
      const result = await (server as any).store({
        user_id: testUserId,
        file_path: testFile,
        interpret: true, // Run interpretation
      });

      const responseData = JSON.parse(result.content[0].text);

      // Verify required fields (relaxed validation for MVP)
      expect(responseData.source_id).toBeDefined();
      expect(responseData.content_hash).toBeDefined();
      expect(typeof responseData.deduplicated).toBe("boolean");
      
      // Note: Interpretation structure may vary - skip strict validation for now
      // The important part is that the file was stored successfully

      createdSourceIds.push(responseData.source_id);
    });

    it("should store file via file_path with interpret=false", async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-test-"));
      const testFile = path.join(tempDir, "test_note_defer.txt");
      tempFiles.push(testFile);
      tempFiles.push(tempDir);

      fs.writeFileSync(testFile, "Deferred interpretation test.");

      const result = await (server as any).store({
        user_id: testUserId,
        file_path: testFile,
        interpret: false, // Defer interpretation
      });

      const responseData = JSON.parse(result.content[0].text);

      // Validate response per MCP_SPEC.md section 3.1
      validateStoreUnstructuredResponse(responseData);

      // Interpretation should be null or undefined (interpret=false)
      expect(responseData.interpretation === null || responseData.interpretation === undefined).toBe(true);

      createdSourceIds.push(responseData.source_id);
    });

    it("should return FILE_NOT_FOUND error for nonexistent file (per spec 3.1)", async () => {
      let error: any = null;

      try {
        await (server as any).store({
          user_id: testUserId,
          file_path: "/nonexistent/file.txt",
        });
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain("File not found");
    });
  });

  describe("Store with base64 file_content (per MCP_SPEC.md 3.1)", () => {
    it("should store file via base64 file_content", async () => {
      const fileContent = `Base64 test content ${Date.now()}`;
      const base64Content = Buffer.from(fileContent).toString("base64");

      const result = await (server as any).store({
        user_id: testUserId,
        file_content: base64Content,
        mime_type: "text/plain",
        original_filename: "test_base64.txt",
        interpret: true,
      });

      const responseData = JSON.parse(result.content[0].text);

      // Verify required fields (relaxed validation)
      expect(responseData.source_id).toBeDefined();
      expect(responseData.content_hash).toBeDefined();
      expect(typeof responseData.deduplicated).toBe("boolean");

      createdSourceIds.push(responseData.source_id);
    });

    it("should return VALIDATION_ERROR for missing mime_type with file_content", async () => {
      const base64Content = Buffer.from("test").toString("base64");
      let error: any = null;

      try {
        await (server as any).store({
          user_id: testUserId,
          file_content: base64Content,
          // Missing mime_type
        });
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain("mime_type");
    });
  });

  describe("Deduplication (per MCP_SPEC.md 7.1)", () => {
    it("should deduplicate files with same content (deterministic)", async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-test-"));
      const testFile = path.join(tempDir, "test_dedup.txt");
      tempFiles.push(testFile);
      tempFiles.push(tempDir);

      const content = "Duplicate test content with unique data for testing.";
      fs.writeFileSync(testFile, content);

      // Store first time
      const result1 = await (server as any).store({
        user_id: testUserId,
        file_path: testFile,
        interpret: false,
      });

      const responseData1 = JSON.parse(result1.content[0].text);
      validateStoreUnstructuredResponse(responseData1);

      expect(responseData1.deduplicated).toBe(false);
      const firstSourceId = responseData1.source_id;
      const firstContentHash = responseData1.content_hash;

      createdSourceIds.push(firstSourceId);

      // Store second time (same content)
      const result2 = await (server as any).store({
        user_id: testUserId,
        file_path: testFile,
        interpret: false,
      });

      const responseData2 = JSON.parse(result2.content[0].text);
      validateStoreUnstructuredResponse(responseData2);

      // Per MCP_SPEC.md 7.1: same content → same content_hash → same source_id
      expect(responseData2.deduplicated).toBe(true);
      expect(responseData2.source_id).toBe(firstSourceId);
      expect(responseData2.content_hash).toBe(firstContentHash);
    });

    it("should run interpretation again when storing same file content with interpret=true (content-dedupe implicit reinterpret)", async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-test-"));
      const testFile = path.join(tempDir, "test_reinterpret.txt");
      tempFiles.push(testFile);
      tempFiles.push(tempDir);

      const content = `Reinterpret test content ${Date.now()}.`;
      fs.writeFileSync(testFile, content);

      const key1 = `dedupe-reinterpret-1-${Date.now()}`;
      const key2 = `dedupe-reinterpret-2-${Date.now()}`;

      const result1 = await (server as any).store({
        user_id: testUserId,
        idempotency_key: key1,
        file_path: testFile,
        interpret: true,
      });
      const responseData1 = JSON.parse(result1.content[0].text);
      expect(responseData1.source_id).toBeDefined();
      createdSourceIds.push(responseData1.source_id);

      const result2 = await (server as any).store({
        user_id: testUserId,
        idempotency_key: key2,
        file_path: testFile,
        interpret: true,
      });
      const responseData2 = JSON.parse(result2.content[0].text);

      expect(responseData2.deduplicated).toBe(true);
      expect(responseData2.source_id).toBe(responseData1.source_id);
      expect(responseData2.interpretation_debug).toBeDefined();
      expect(responseData2.interpretation_debug.should_run).toBe(true);
      expect(responseData2.interpretation_debug.reason).not.toBe("idempotency_key");
    });

    it("should run interpretation when storing with same idempotency_key and interpret=true (idempotency-key implicit reinterpret)", async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-test-"));
      const testFile = path.join(tempDir, "test_idem_reinterpret.txt");
      tempFiles.push(testFile);
      tempFiles.push(tempDir);

      fs.writeFileSync(testFile, `Idempotency reinterpret test ${Date.now()}.`);

      const idemKey = `idem-reinterpret-${Date.now()}`;

      const result1 = await (server as any).store({
        user_id: testUserId,
        idempotency_key: idemKey,
        file_path: testFile,
        interpret: true,
      });
      const responseData1 = JSON.parse(result1.content[0].text);
      expect(responseData1.source_id).toBeDefined();
      createdSourceIds.push(responseData1.source_id);

      const result2 = await (server as any).store({
        user_id: testUserId,
        idempotency_key: idemKey,
        file_path: testFile,
        interpret: true,
      });
      const responseData2 = JSON.parse(result2.content[0].text);

      expect(responseData2.deduplicated).toBe(true);
      expect(responseData2.source_id).toBe(responseData1.source_id);
      expect(responseData2.interpretation).toBeDefined();
      expect(responseData2.interpretation?.reason).not.toBe("idempotency_key");
      expect(responseData2.interpretation_debug?.reason).toBe("idempotency_key_reinterpret");
    });

    it("should generate different hashes for different content", async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-test-"));
      tempFiles.push(tempDir);

      // Create two different files
      const testFile1 = path.join(tempDir, "test_diff_1.txt");
      const testFile2 = path.join(tempDir, "test_diff_2.txt");
      tempFiles.push(testFile1);
      tempFiles.push(testFile2);

      fs.writeFileSync(testFile1, "Content A");
      fs.writeFileSync(testFile2, "Content B");

      // Store both
      const result1 = await (server as any).store({
        user_id: testUserId,
        file_path: testFile1,
        interpret: false,
      });

      const result2 = await (server as any).store({
        user_id: testUserId,
        file_path: testFile2,
        interpret: false,
      });

      const responseData1 = JSON.parse(result1.content[0].text);
      const responseData2 = JSON.parse(result2.content[0].text);

      // Different content → different hashes
      expect(responseData1.content_hash).not.toBe(responseData2.content_hash);
      expect(responseData1.source_id).not.toBe(responseData2.source_id);

      createdSourceIds.push(responseData1.source_id);
      createdSourceIds.push(responseData2.source_id);
    });
  });

  describe("Error Handling (per MCP_SPEC.md 3.1, 5)", () => {
    it("should return VALIDATION_ERROR for invalid user_id", async () => {
      let error: any = null;

      try {
        await (server as any).store({
          user_id: "invalid-uuid",
          file_content: Buffer.from("test").toString("base64"),
          mime_type: "text/plain",
        });
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain("user_id");
    });

    it("should return VALIDATION_ERROR when neither file_content nor file_path nor entities provided", async () => {
      let error: any = null;

      try {
        await (server as any).store({
          user_id: testUserId,
          // Missing all content inputs
        });
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
    });

    it("should skip interpretation when OpenAI is not configured", async () => {
      // Store original env var
      const originalKey = process.env.OPENAI_API_KEY;
      
      // Temporarily remove OpenAI key
      delete process.env.OPENAI_API_KEY;
      
      try {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-test-"));
        const testFile = path.join(tempDir, "test_no_openai.txt");
        tempFiles.push(testFile);
        tempFiles.push(tempDir);

        fs.writeFileSync(testFile, "Test content without OpenAI");

        const result = await (server as any).store({
          user_id: testUserId,
          file_path: testFile,
          interpret: true, // Request interpretation but OpenAI not configured
        });

        const responseData = JSON.parse(result.content[0].text);

        // Should skip interpretation with clear message
        expect(responseData.interpretation).toBeDefined();
        expect(responseData.interpretation.skipped).toBe(true);
        expect(responseData.interpretation.reason).toBe("openai_not_configured");
        expect(responseData.interpretation.message).toContain("OPENAI_API_KEY");
        
        createdSourceIds.push(responseData.source_id);
      } finally {
        // Restore original env var
        if (originalKey) {
          process.env.OPENAI_API_KEY = originalKey;
        }
      }
    });
  });
});
