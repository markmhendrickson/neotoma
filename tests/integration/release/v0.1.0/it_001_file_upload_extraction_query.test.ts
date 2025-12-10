/**
 * IT-001: File Upload → Extraction → Query Flow
 *
 * Goal: Verify that file upload via MCP triggers full pipeline (extraction → entities → events → graph → search).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  setupTestServer,
  teardownTestServer,
  cleanupAllTestData,
  cleanupTestDataByPrefix,
  type TestContext,
} from "./test_helpers.js";
import { supabase } from "../../../../src/db.js";
import fs from "fs";
import path from "path";

describe("IT-001: File Upload → Extraction → Query Flow", () => {
  let context: TestContext;
  const createdRecordIds: string[] = [];

  beforeAll(async () => {
    context = await setupTestServer("IT-001");
  });

  beforeEach(async () => {
    await cleanupTestDataByPrefix(context.testPrefix);
    createdRecordIds.length = 0;
  });

  afterAll(async () => {
    await cleanupAllTestData(createdRecordIds);
    await teardownTestServer(context);
  });

  it("should upload file, extract fields, create record, and retrieve via query", async () => {
    // Step 1: Upload file via HTTP endpoint (simulating MCP upload_file)
    const testPrefix = `${context.testPrefix}-INV`;
    const testFileContent = `INVOICE #${testPrefix}-001
Bill To: Acme Corporation
Amount Due: $1,000.00
Invoice Date: 2024-01-15
Payment Terms: Net 30`;

    // Create temporary file
    const tempFile = path.join(process.cwd(), "temp_test_invoice.txt");
    fs.writeFileSync(tempFile, testFileContent);

    try {
      // Use Node.js native FormData (available in Node 18+)
      const formData = new globalThis.FormData();
      const fileBuffer = fs.readFileSync(tempFile);
      const blob = new globalThis.Blob([fileBuffer], { type: "text/plain" });
      formData.append("file", blob, "test_invoice.txt");

      const uploadResponse = await fetch(`${context.baseUrl}/upload_file`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${context.bearerToken}`,
          // Don't set Content-Type - fetch will set it with boundary
        },
        body: formData,
      });

      if (uploadResponse.status !== 201 && uploadResponse.status !== 200) {
        const errorText = await uploadResponse.text();
        console.error(
          `Upload failed with status ${uploadResponse.status}:`,
          errorText
        );
      }
      expect([200, 201]).toContain(uploadResponse.status); // 201 for new records, 200 for updates
      const uploadResult = await uploadResponse.json();
      // For upload_file endpoint, the response is the record itself, not wrapped in { record: ... }
      expect(uploadResult.id).toBeDefined();
      expect(uploadResult.type).toBeDefined();
      expect(uploadResult.properties).toBeDefined();

      const recordId = uploadResult.id;
      createdRecordIds.push(recordId);

      // Step 2: Verify extraction (schema type, fields)
      expect(uploadResult.type).toBe("invoice");
      expect(uploadResult.properties).toHaveProperty("invoice_number");

      // Step 3: Query records via retrieve_records
      const queryResponse = await fetch(`${context.baseUrl}/retrieve_records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
      body: JSON.stringify({
        type: "invoice",
        ids: [recordId], // Query only our record for isolation
        limit: 10,
      }),
      });

      expect(queryResponse.status).toBe(200);
      const queryResult = await queryResponse.json();
      expect(Array.isArray(queryResult)).toBe(true);
      const foundRecord = queryResult.find(
        (r: { id: string }) => r.id === recordId
      );
      expect(foundRecord).toBeDefined();

      // Step 4: Verify events generated (check state_events table)
      const { data: events } = await supabase
        .from("state_events")
        .select("*")
        .eq("record_id", recordId)
        .order("timestamp", { ascending: true });

      expect(events).toBeDefined();
      expect(events!.length).toBeGreaterThan(0);
      expect(events![0].event_type).toBe("RecordCreated");

      // Step 5: Verify deterministic ranking (run same query twice)
      const query1 = await fetch(`${context.baseUrl}/retrieve_records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          type: "invoice",
          ids: [recordId], // Query only our record for isolation
          search: ["invoice"],
          limit: 10,
        }),
      });

      const query2 = await fetch(`${context.baseUrl}/retrieve_records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          type: "invoice",
          ids: [recordId], // Query only our record for isolation
          search: ["invoice"],
          limit: 10,
        }),
      });

      const result1 = await query1.json();
      const result2 = await query2.json();

      // Verify deterministic ordering (same query → same order)
      expect(result1.length).toBe(result2.length);
      for (let i = 0; i < Math.min(result1.length, result2.length); i++) {
        expect(result1[i].id).toBe(result2[i].id);
      }
    } finally {
      // Cleanup temp file
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });
});
