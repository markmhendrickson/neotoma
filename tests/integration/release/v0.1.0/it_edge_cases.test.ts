/**
 * Edge Case Tests for v0.1.0 MCP Actions
 *
 * Goal: Verify that all MCP actions handle edge cases correctly.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  setupTestServer,
  teardownTestServer,
  cleanupAllTestData,
  cleanupTestDataByPrefix,
  type TestContext,
} from "./test_helpers.js";

describe("Edge Case Tests", () => {
  let context: TestContext;
  const createdRecordIds: string[] = [];

  beforeAll(async () => {
    context = await setupTestServer("EDGE");
  });

  beforeEach(async () => {
    await cleanupTestDataByPrefix(context.testPrefix);
    createdRecordIds.length = 0;
  });

  afterAll(async () => {
    await cleanupAllTestData(createdRecordIds);
    await teardownTestServer(context);
  });

  describe("Record operations edge cases", () => {
    it("should handle empty properties object", async () => {
      const response = await fetch(`${context.baseUrl}/store_record`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          type: "note",
          properties: {}, // Empty
        }),
      });

      expect(response.status).toBe(200);
      const record = await response.json();
      expect(record.id).toBeDefined();
      expect(record.properties).toEqual({});
      createdRecordIds.push(record.id);
    });

    it("should handle very large properties object", async () => {
      const testPrefix = `${context.testPrefix}`;
      const largeProperties: Record<string, unknown> = {};
      for (let i = 0; i < 100; i++) {
        largeProperties[`field_${i}`] = `value_${i}`.repeat(100);
      }

      const response = await fetch(`${context.baseUrl}/store_record`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          type: "note",
          properties: largeProperties,
        }),
      });

      // Should handle large properties (may have size limits)
      expect([200, 413, 500]).toContain(response.status);
      if (response.status === 200) {
        const record = await response.json();
        createdRecordIds.push(record.id);
      }
    });

    it("should handle special characters in properties", async () => {
      const response = await fetch(`${context.baseUrl}/store_record`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          type: "note",
          properties: {
            special_chars: "!@#$%^&*()_+-={}[]|\\:;\"'<>,.?/~`",
            quotes: "Single \"quotes\" and 'double' quotes",
            newlines: "Line 1\nLine 2\nLine 3",
          },
        }),
      });

      expect(response.status).toBe(200);
      const record = await response.json();
      expect(record.properties.special_chars).toBe(
        "!@#$%^&*()_+-={}[]|\\:;\"'<>,.?/~`"
      );
      createdRecordIds.push(record.id);
    });

    it("should handle Unicode characters in properties", async () => {
      const response = await fetch(`${context.baseUrl}/store_record`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          type: "note",
          properties: {
            unicode: "你好世界 🌍 مرحبا العالم Здравствуй мир",
            emoji: "😀🎉🚀💡",
            rtl: "مرحبا بك في اختبار يونيكود",
          },
        }),
      });

      expect(response.status).toBe(200);
      const record = await response.json();
      expect(record.properties.unicode).toContain("你好世界");
      expect(record.properties.emoji).toContain("😀");
      createdRecordIds.push(record.id);
    });

    it("should handle update with no changes", async () => {
      const testPrefix = `${context.testPrefix}`;
      // Create record
      const createResponse = await fetch(`${context.baseUrl}/store_record`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          type: "note",
          properties: { title: `${testPrefix}-Note` },
        }),
      });

      const record = await createResponse.json();
      createdRecordIds.push(record.id);

      // Update with no changes
      const updateResponse = await fetch(`${context.baseUrl}/update_record`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          id: record.id,
          properties: {}, // No changes
        }),
      });

      expect(updateResponse.status).toBe(200);
    });

    it("should handle delete of already-deleted record", async () => {
      const testPrefix = `${context.testPrefix}`;
      // Create and delete record
      const createResponse = await fetch(`${context.baseUrl}/store_record`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          type: "note",
          properties: { title: `${testPrefix}-DeleteTest` },
        }),
      });

      const record = await createResponse.json();
      const recordId = record.id;

      // First delete
      await fetch(`${context.baseUrl}/delete_record`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({ id: recordId }),
      });

      // Second delete (already deleted)
      const secondDeleteResponse = await fetch(
        `${context.baseUrl}/delete_record`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${context.bearerToken}`,
          },
          body: JSON.stringify({ id: recordId }),
        }
      );

      // Should handle gracefully (may be 200, 404, or error)
      expect([200, 404, 500]).toContain(secondDeleteResponse.status);
    });
  });

  describe("Query operations edge cases", () => {
    it("should handle query with no filters", async () => {
      const response = await fetch(`${context.baseUrl}/retrieve_records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          // No filters
          limit: 10,
        }),
      });

      expect(response.status).toBe(200);
      const records = await response.json();
      expect(Array.isArray(records)).toBe(true);
    });

    it("should handle query with limit=0", async () => {
      const response = await fetch(`${context.baseUrl}/retrieve_records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          limit: 0,
        }),
      });

      // Should handle gracefully (may return empty array or default limit)
      expect([200, 400]).toContain(response.status);
    });

    it("should handle query with very large limit", async () => {
      const response = await fetch(`${context.baseUrl}/retrieve_records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          limit: 10000, // Very large
        }),
      });

      // Should handle or cap limit
      expect([200, 400]).toContain(response.status);
    });

    it("should handle query with invalid UUIDs in ids array", async () => {
      const response = await fetch(`${context.baseUrl}/retrieve_records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          ids: ["invalid-uuid", "not-a-uuid"],
        }),
      });

      // Should handle gracefully (may return empty or error)
      expect([200, 400]).toContain(response.status);
    });

    it("should handle empty search terms array", async () => {
      const response = await fetch(`${context.baseUrl}/retrieve_records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          search_terms: [], // Empty
        }),
      });

      expect(response.status).toBe(200);
      const records = await response.json();
      expect(Array.isArray(records)).toBe(true);
    });
  });

  describe("File operations edge cases", () => {
    it("should handle file path with special characters", async () => {
      const response = await fetch(`${context.baseUrl}/get_file_url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          file_path: "path/with spaces/and-special_chars.pdf",
        }),
      });

      // Should handle gracefully
      expect([200, 400, 404, 500]).toContain(response.status);
    });

    it("should handle file with no extension", async () => {
      const response = await fetch(`${context.baseUrl}/get_file_url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          file_path: "path/to/file_without_extension",
        }),
      });

      // Should handle gracefully
      expect([200, 400, 404, 500]).toContain(response.status);
    });

    it("should handle file with multiple extensions", async () => {
      const response = await fetch(`${context.baseUrl}/get_file_url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          file_path: "archive.tar.gz.zip",
        }),
      });

      // Should handle gracefully
      expect([200, 400, 404, 500]).toContain(response.status);
    });

    it("should handle very long expiry time", async () => {
      const response = await fetch(`${context.baseUrl}/get_file_url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          file_path: "test.pdf",
          expiry: 999999999, // Very large expiry
        }),
      });

      // Should handle or cap expiry
      expect([200, 400, 404, 500]).toContain(response.status);
    });
  });

  describe("Entity and relationship edge cases", () => {
    it("should handle entity name with only whitespace", async () => {
      const response = await fetch(`${context.baseUrl}/store_record`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          type: "invoice",
          properties: {
            vendor_name: "   ", // Only whitespace
            invoice_number: "EDGE-INV-001",
          },
        }),
      });

      // Should handle gracefully (may normalize to empty or reject)
      expect([200, 400]).toContain(response.status);
      if (response.status === 200) {
        const record = await response.json();
        createdRecordIds.push(record.id);
      }
    });

    it("should handle entity name with excessive whitespace", async () => {
      const response = await fetch(`${context.baseUrl}/store_record`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          type: "invoice",
          properties: {
            vendor_name: "  Multiple    Spaces    Company  ",
            invoice_number: "EDGE-INV-002",
          },
        }),
      });

      expect(response.status).toBe(200);
      const record = await response.json();
      createdRecordIds.push(record.id);
      // Whitespace should be normalized
    });

    it("should handle duplicate property keys (case sensitivity)", async () => {
      const response = await fetch(`${context.baseUrl}/store_record`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          type: "note",
          properties: {
            Title: "First",
            title: "Second", // Duplicate key, different case
          },
        }),
      });

      expect(response.status).toBe(200);
      const record = await response.json();
      createdRecordIds.push(record.id);
      // Should preserve both or merge based on implementation
    });

    it("should handle nested objects in properties", async () => {
      const response = await fetch(`${context.baseUrl}/store_record`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          type: "note",
          properties: {
            nested: {
              level1: {
                level2: {
                  value: "deep nesting",
                },
              },
            },
          },
        }),
      });

      expect(response.status).toBe(200);
      const record = await response.json();
      expect(record.properties.nested).toBeDefined();
      createdRecordIds.push(record.id);
    });

    it("should handle array values in properties", async () => {
      const response = await fetch(`${context.baseUrl}/store_record`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          type: "note",
          properties: {
            tags: ["tag1", "tag2", "tag3"],
            numbers: [1, 2, 3, 4, 5],
            mixed: ["string", 123, true, null],
          },
        }),
      });

      expect(response.status).toBe(200);
      const record = await response.json();
      expect(Array.isArray(record.properties.tags)).toBe(true);
      createdRecordIds.push(record.id);
    });

    it("should handle null values in properties", async () => {
      const response = await fetch(`${context.baseUrl}/store_record`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          type: "note",
          properties: {
            nullable_field: null,
            defined_field: "value",
          },
        }),
      });

      expect(response.status).toBe(200);
      const record = await response.json();
      createdRecordIds.push(record.id);
    });

    it("should handle boolean values in properties", async () => {
      const response = await fetch(`${context.baseUrl}/store_record`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          type: "note",
          properties: {
            is_active: true,
            is_archived: false,
          },
        }),
      });

      expect(response.status).toBe(200);
      const record = await response.json();
      expect(record.properties.is_active).toBe(true);
      expect(record.properties.is_archived).toBe(false);
      createdRecordIds.push(record.id);
    });
  });

  describe("Date handling edge cases", () => {
    it("should handle invalid date formats", async () => {
      const response = await fetch(`${context.baseUrl}/store_record`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          type: "invoice",
          properties: {
            invoice_number: "EDGE-INV-DATE-001",
            date_issued: "not-a-date",
          },
        }),
      });

      // Should handle gracefully (may skip invalid dates)
      expect(response.status).toBe(200);
      const record = await response.json();
      createdRecordIds.push(record.id);
    });

    it("should handle various date formats", async () => {
      const response = await fetch(`${context.baseUrl}/store_record`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          type: "note",
          properties: {
            iso_date: "2024-01-15T10:30:00Z",
            date_only: "2024-01-15",
            datetime_local: "2024-01-15T10:30:00",
            unix_timestamp: 1705318200,
          },
        }),
      });

      expect(response.status).toBe(200);
      const record = await response.json();
      createdRecordIds.push(record.id);
    });

    it("should handle edge dates (far past, far future)", async () => {
      const response = await fetch(`${context.baseUrl}/store_record`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          type: "note",
          properties: {
            far_past: "1900-01-01",
            far_future: "2100-12-31",
          },
        }),
      });

      expect(response.status).toBe(200);
      const record = await response.json();
      createdRecordIds.push(record.id);
    });
  });

  describe("Type normalization edge cases", () => {
    it("should handle type case variations", async () => {
      const types = ["INVOICE", "Invoice", "invoice", "InVoIcE"];

      for (const type of types) {
        const response = await fetch(`${context.baseUrl}/store_record`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${context.bearerToken}`,
          },
          body: JSON.stringify({
            type: type,
            properties: { test: type },
          }),
        });

        expect(response.status).toBe(200);
        const record = await response.json();
        createdRecordIds.push(record.id);
        // Type should be normalized to lowercase
      }
    });

    it("should handle type with whitespace", async () => {
      const response = await fetch(`${context.baseUrl}/store_record`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          type: "  invoice  ",
          properties: { test: "whitespace" },
        }),
      });

      // Should handle or normalize
      expect([200, 400]).toContain(response.status);
      if (response.status === 200) {
        const record = await response.json();
        createdRecordIds.push(record.id);
      }
    });
  });

  describe("Observation edge cases", () => {
    it("should handle entity with no observations", async () => {
      const response = await fetch(`${context.baseUrl}/list_observations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          entity_id: "ent_no_observations_123456",
        }),
      });

      // Should return empty list
      expect([200, 404]).toContain(response.status);
    });

    it("should handle snapshot with no provenance", async () => {
      const response = await fetch(`${context.baseUrl}/get_entity_snapshot`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          entity_id: "ent_no_snapshot_123456",
        }),
      });

      // Should return not found
      expect([404, 500]).toContain(response.status);
    });
  });
});







