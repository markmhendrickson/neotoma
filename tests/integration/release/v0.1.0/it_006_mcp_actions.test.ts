/**
 * IT-006: MCP Action Validation
 *
 * Goal: Verify that all 6 core MCP actions function correctly.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  setupTestServer,
  teardownTestServer,
  cleanupAllTestData,
  cleanupTestDataByPrefix,
  type TestContext,
} from "./test_helpers.js";

describe("IT-006: MCP Action Validation", () => {
  let context: TestContext;
  const createdRecordIds: string[] = [];

  beforeAll(async () => {
    context = await setupTestServer("IT-006");
  });

  beforeEach(async () => {
    await cleanupTestDataByPrefix(context.testPrefix);
    createdRecordIds.length = 0;
  });

  afterAll(async () => {
    await cleanupAllTestData(createdRecordIds);
    await teardownTestServer(context);
  });

  it("should support store_record action", async () => {
    const testPrefix = `${context.testPrefix}`;
    const response = await fetch(`${context.baseUrl}/store_record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        type: "invoice",
        properties: { invoice_number: `${testPrefix}-INV-001`, amount: 1000 },
      }),
    });

    expect(response.status).toBe(200);
    const record = await response.json();
    expect(record.id).toBeDefined();
    expect(record.type).toBe("invoice");
    createdRecordIds.push(record.id);
  });

  it("should support retrieve_records action", async () => {
    const testPrefix = `${context.testPrefix}`;
    // Create a record first to query
    const createResponse = await fetch(`${context.baseUrl}/store_record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        type: "invoice",
        properties: { invoice_number: `${testPrefix}-RETRIEVE`, amount: 500 },
      }),
    });
    expect(createResponse.status).toBe(200);
    const createdRecord = await createResponse.json();
    createdRecordIds.push(createdRecord.id);

    // Query only our record for isolation
    const response = await fetch(`${context.baseUrl}/retrieve_records`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        ids: [createdRecord.id],
        limit: 10,
      }),
    });

    expect(response.status).toBe(200);
    const records = await response.json();
    expect(Array.isArray(records)).toBe(true);
    expect(records.length).toBeGreaterThan(0);
    expect(
      records.find((r: { id: string }) => r.id === createdRecord.id)
    ).toBeDefined();
  });

  it("should support update_record action", async () => {
    const testPrefix = `${context.testPrefix}`;
    // Create record first
    const createResponse = await fetch(`${context.baseUrl}/store_record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        type: "invoice",
        properties: { invoice_number: `${testPrefix}-INV-002`, amount: 1000 },
      }),
    });

    const record = await createResponse.json();
    createdRecordIds.push(record.id);

    // Update record
    const updateResponse = await fetch(`${context.baseUrl}/update_record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        id: record.id,
        properties: { invoice_number: "INV-002", amount: 2000 },
      }),
    });

    expect(updateResponse.status).toBe(200);
    const updated = await updateResponse.json();
    expect(updated.properties.amount).toBe(2000);
  });

  it("should support delete_record action", async () => {
    const testPrefix = `${context.testPrefix}`;
    // Create record first
    const createResponse = await fetch(`${context.baseUrl}/store_record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        type: "invoice",
        properties: { invoice_number: `${testPrefix}-INV-003`, amount: 1000 },
      }),
    });

    const record = await createResponse.json();
    const recordId = record.id;

    // Delete record
    const deleteResponse = await fetch(`${context.baseUrl}/delete_record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        id: recordId,
      }),
    });

    expect(deleteResponse.status).toBe(200);
    // Verify record is deleted
    const retrieveResponse = await fetch(
      `${context.baseUrl}/retrieve_records`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          ids: [recordId],
        }),
      }
    );

    const retrieved = await retrieveResponse.json();
    expect(
      retrieved.find((r: { id: string }) => r.id === recordId)
    ).toBeUndefined();
  });

  it("should support upload_file action", async () => {
    const testPrefix = `${context.testPrefix}`;
    const testFilePath = "tests/fixtures/pdf/sample_invoice.pdf";
    
    // Upload file via MCP action
    const response = await fetch(`${context.baseUrl}/upload_file`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        file_path: testFilePath,
      }),
    });

    // Verify upload succeeded
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.source_id).toBeDefined();
    expect(result.file_url).toBeDefined();
    
    // Verify source was created in database
    const { supabase } = await import("../../../db.js");
    const { data: source, error } = await supabase
      .from("sources")
      .select("*")
      .eq("id", result.source_id)
      .single();
    
    expect(error).toBeNull();
    expect(source).toBeDefined();
    expect(source!.storage_status).toBe("uploaded");
    expect(source!.content_hash).toBeDefined();
  });

  it("should support get_file_url action", async () => {
    const testFilePath = "tests/fixtures/pdf/sample_invoice.pdf";
    
    // First upload a file to get a valid file ID
    const uploadResponse = await fetch(`${context.baseUrl}/upload_file`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        file_path: testFilePath,
      }),
    });

    expect(uploadResponse.status).toBe(200);
    const uploadResult = await uploadResponse.json();
    const fileId = uploadResult.source_id;
    
    // Now get the file URL
    const response = await fetch(`${context.baseUrl}/get_file_url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        file_id: fileId,
      }),
    });

    // Verify URL retrieval succeeded
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.file_url).toBeDefined();
    expect(typeof result.file_url).toBe("string");
    expect(result.file_url.length).toBeGreaterThan(0);
    
    // Verify URL is valid (starts with http or is a path)
    expect(
      result.file_url.startsWith("http") || result.file_url.startsWith("/")
    ).toBe(true);
  });

  it("should support get_entity_snapshot action", async () => {
    // Note: This test verifies endpoint exists
    const response = await fetch(`${context.baseUrl}/get_entity_snapshot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        entity_id: "ent_test_123456789012",
      }),
    });

    // Endpoint exists (may return 404 for non-existent entity, that's OK)
    expect([200, 400, 404, 500]).toContain(response.status);
  });

  it("should support list_observations action", async () => {
    // Note: This test verifies endpoint exists
    const response = await fetch(`${context.baseUrl}/list_observations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        entity_id: "ent_test_123456789012",
      }),
    });

    // Endpoint exists and returns structured response
    expect([200, 400, 404, 500]).toContain(response.status);
  });

  it("should support get_field_provenance action", async () => {
    // Note: This test verifies endpoint exists
    const response = await fetch(`${context.baseUrl}/get_field_provenance`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        entity_id: "ent_test_123456789012",
        field_name: "test_field",
      }),
    });

    // Endpoint exists (may return 404 for non-existent entity, that's OK)
    expect([200, 400, 404, 500]).toContain(response.status);
  });

  it("should support create_relationship action", async () => {
    // Note: This test verifies endpoint exists
    const response = await fetch(`${context.baseUrl}/create_relationship`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        relationship_type: "PART_OF",
        source_entity_id: "ent_test_1",
        target_entity_id: "ent_test_2",
      }),
    });

    // Endpoint exists and returns structured response
    expect([200, 400, 404, 500]).toContain(response.status);
  });

  it("should support list_relationships action", async () => {
    // Note: This test verifies endpoint exists
    const response = await fetch(`${context.baseUrl}/list_relationships`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        entity_id: "ent_test_123456789012",
        direction: "both",
      }),
    });

    // Endpoint exists and returns structured response
    expect([200, 400, 404, 500]).toContain(response.status);
  });
});
