/**
 * Cross-Layer Integration Tests: CLI Store Commands → Database
 *
 * Validates that CLI store commands correctly propagate through
 * REST → MCP → Database, verifying DB state after each operation.
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";
import {
  verifySourceExists,
  verifyEntityExists,
  verifyInterpretationNotExists,
} from "../helpers/database_verifiers.js";
import {
  execCliJson,
  execCliFail,
  TempFileManager,
  extractSourceId,
  extractCreatedEntityIds,
} from "../helpers/cross_layer_helpers.js";

const TEST_USER_ID = "test-cross-layer-store";

describe("Cross-layer: CLI store commands → Database", () => {
  const tracker = new TestIdTracker();
  const files = new TempFileManager();

  beforeAll(async () => {
    await files.setup();
  });

  afterEach(async () => {
    await tracker.cleanup();
  });

  // Cleanup temp files after all tests
  afterEach(async () => {
    // files cleanup handled in afterAll below
  });

  describe("store command → sources table", () => {
    it("should create source record in DB after CLI store", async () => {
      const filePath = await files.createJson("store-basic.json", {
        invoice_number: "INV-CROSS-001",
        amount: 500,
        vendor: "Acme Corp",
      });

      const result = await execCliJson(
        `store --file-path "${filePath}" --user-id "${TEST_USER_ID}"`
      );

      const sourceId = extractSourceId(result);
      tracker.trackSource(sourceId);

      await verifySourceExists(sourceId, { user_id: TEST_USER_ID });
    });

    it("should store with correct user_id in DB", async () => {
      const filePath = await files.createJson("store-user.json", { name: "Test" });
      const customUserId = `${TEST_USER_ID}-custom`;

      const result = await execCliJson(
        `store --file-path "${filePath}" --user-id "${customUserId}"`
      );

      const sourceId = extractSourceId(result);
      tracker.trackSource(sourceId);

      await verifySourceExists(sourceId, { user_id: customUserId });
    });

    it("should create source with correct mime type for JSON file", async () => {
      const filePath = await files.createJson("store-mime.json", { key: "value" });

      const result = await execCliJson(
        `store --file-path "${filePath}" --user-id "${TEST_USER_ID}"`
      );

      const sourceId = extractSourceId(result);
      tracker.trackSource(sourceId);

      await verifySourceExists(sourceId, {
        mime_type: "application/json",
      });
    });

    it("should infer audio mime type for wav file via store --file-path", async () => {
      const wavHeader = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
        0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
        0x44, 0xac, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00, 0x02, 0x00, 0x10, 0x00,
        0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00,
      ]);
      const filePath = await files.createBinary("store-audio.wav", wavHeader);

      const result = await execCliJson(
        `store --file-path "${filePath}" --user-id "${TEST_USER_ID}"`
      );

      const sourceId = extractSourceId(result);
      tracker.trackSource(sourceId);

      await verifySourceExists(sourceId, {
        mime_type: "audio/wav",
      });
    });

    it("should not create interpretation records for raw file store", async () => {
      const filePath = await files.createText(
        "store-no-interp.txt",
        "Plain text content without interpretation"
      );

      const result = await execCliJson(`store --file-path "${filePath}" --user-id "${TEST_USER_ID}"`);

      const sourceId = extractSourceId(result);
      tracker.trackSource(sourceId);

      await verifySourceExists(sourceId);
      await verifyInterpretationNotExists(sourceId);
    });

    it("should deduplicate identical file content", async () => {
      const content = { dedupe_test: true, value: "same-content" };
      const file1 = await files.createJson("dedup-1.json", content);
      const file2 = await files.createJson("dedup-2.json", content);

      const result1 = await execCliJson(
        `store --file-path "${file1}" --user-id "${TEST_USER_ID}"`
      );
      const result2 = await execCliJson(
        `store --file-path "${file2}" --user-id "${TEST_USER_ID}"`
      );

      const sourceId1 = extractSourceId(result1);
      const sourceId2 = extractSourceId(result2);
      tracker.trackSource(sourceId1);

      // Same content hash → same source record
      expect(sourceId1).toBe(sourceId2);
      await verifySourceExists(sourceId1);
    });

    it("should fail gracefully for nonexistent file", async () => {
      const error = await execCliFail(
        `store --file-path "/no/such/file.txt" --user-id "${TEST_USER_ID}"`
      );
      expect(error.code).toBeGreaterThan(0);
    });
  });

  describe("store --file → entities + observations", () => {
    it("should create entity and observations in DB", async () => {
      const filePath = await files.createJson("structured-entity.json", {
        entity_type: "company",
        canonical_name: "Acme Corp Cross Layer",
        industry: "Technology",
      });

      const result = await execCliJson(
        `store --file "${filePath}" --user-id "${TEST_USER_ID}"`
      );

      const sourceId = extractSourceId(result);
      tracker.trackSource(sourceId);

      await verifySourceExists(sourceId);

      const entityIds = extractCreatedEntityIds(result);
      for (const entityId of entityIds) {
        tracker.trackEntity(entityId);
        await verifyEntityExists(entityId, {
          entity_type: "company",
          snapshotExists: true,
        });
      }
    });

    it("should create entity with entity_type in JSON payload", async () => {
      const filePath = await files.createJson("structured-typed.json", {
        entity_type: "task",
        canonical_name: "Force-typed Entity",
        custom_field: "value",
      });

      const result = await execCliJson(
        `store --file "${filePath}" --user-id "${TEST_USER_ID}"`
      );

      const sourceId = extractSourceId(result);
      tracker.trackSource(sourceId);

      const entityIds = extractCreatedEntityIds(result);
      for (const entityId of entityIds) {
        tracker.trackEntity(entityId);
        await verifyEntityExists(entityId, { entity_type: "task", snapshotExists: true });
      }
    });
  });

  describe("store command → sources table", () => {
    it("should create source record for text file", async () => {
      const filePath = await files.createText(
        "unstructured.txt",
        "Meeting notes from cross-layer test"
      );

      let result: unknown;
      try {
        result = await execCliJson(
          `store --file-path "${filePath}" --user-id "${TEST_USER_ID}"`
        );
      } catch (e) {
        if (
          String(e).includes("429") ||
          String(e).includes("quota") ||
          String(e).includes("Incorrect API key")
        ) {
          return;
        }
        throw e;
      }

      const sourceId = extractSourceId(result);
      tracker.trackSource(sourceId);

      await verifySourceExists(sourceId, { user_id: TEST_USER_ID });
    });

    it("should handle empty file without error", async () => {
      const filePath = await files.createText("empty.txt", "");

      let result: unknown;
      try {
        result = await execCliJson(
          `store --file-path "${filePath}" --user-id "${TEST_USER_ID}"`
        );
      } catch (e) {
        if (
          String(e).includes("429") ||
          String(e).includes("quota") ||
          String(e).includes("Incorrect API key")
        ) {
          return;
        }
        throw e;
      }

      const sourceId = extractSourceId(result);
      tracker.trackSource(sourceId);

      await verifySourceExists(sourceId);
    });

    it("should create source record for wav file via file_path transport", async () => {
      const wavHeader = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
        0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
        0x44, 0xac, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00, 0x02, 0x00, 0x10, 0x00,
        0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00,
      ]);
      const filePath = await files.createBinary("store-audio.wav", wavHeader);

      const result = await execCliJson(
        `store --file-path "${filePath}" --user-id "${TEST_USER_ID}"`
      );

      const sourceId = extractSourceId(result);
      tracker.trackSource(sourceId);

      await verifySourceExists(sourceId, {
        mime_type: "audio/wav",
      });
    });
  });

  describe("upload command → sources table", () => {
    it("should create source record for wav file without base64 transport limits", async () => {
      const wavHeader = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
        0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
        0x44, 0xac, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00, 0x02, 0x00, 0x10, 0x00,
        0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00,
      ]);
      const filePath = await files.createBinary("upload-audio.wav", wavHeader);

      const result = await execCliJson(`upload "${filePath}" --idempotency-key "upload-wav-${Date.now()}"`);

      const sourceId = extractSourceId(result);
      tracker.trackSource(sourceId);

      await verifySourceExists(sourceId, {
        mime_type: "audio/wav",
      });
    });
  });

  describe("idempotency key → DB deduplication", () => {
    it("should return same source_id for repeated calls with same idempotency key", async () => {
      const filePath = await files.createText("idempotent.txt", "Idempotent content");
      const key = `cross-layer-idem-${Date.now()}`;

      const result1 = await execCliJson(
        `store --file-path "${filePath}" --user-id "${TEST_USER_ID}" --idempotency-key "${key}"`
      );
      const result2 = await execCliJson(
        `store --file-path "${filePath}" --user-id "${TEST_USER_ID}" --idempotency-key "${key}"`
      );

      const sourceId = extractSourceId(result1);
      tracker.trackSource(sourceId);

      expect(extractSourceId(result2)).toBe(sourceId);
      await verifySourceExists(sourceId);
    });
  });
});
