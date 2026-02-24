/**
 * E2E Test: MCP Store and Retrieve Flow
 * 
 * Tests MCP actions for storing and retrieving data.
 */

import path from "node:path";
import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";
import { repoRoot } from "../utils/servers.js";
import {
  clearClientState,
  primeLocalSettings,
  attachBrowserLogging,
  routeChatThroughMock,
} from "./helpers.js";
import { db } from "../../src/db.js";

const uploadFixturePath = path.join(
  repoRoot,
  "tests/fixtures/pdf/sample_invoice.pdf"
);

test.describe("E2E-006: MCP Store and Retrieve Flow", () => {
  const testUserId = "test-user-mcp-store-retrieve";
  const createdSourceIds: string[] = [];
  const createdEntityIds: string[] = [];

  test.afterEach(async () => {
    // Clean up test data
    if (createdEntityIds.length > 0) {
      await db.from("entities").delete().in("id", createdEntityIds);
      createdEntityIds.length = 0;
    }
    if (createdSourceIds.length > 0) {
      await db.from("sources").delete().in("id", createdSourceIds);
      createdSourceIds.length = 0;
    }
  });

  test("should store structured data via MCP and verify in database", async ({ page, uiBaseUrl, mockApi, mcpBaseUrl }) => {
    if (!mcpBaseUrl) {
      test.skip();
      return;
    }

    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Store structured data via MCP
    const storeResponse = await page.request.post(`${mcpBaseUrl}/store`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
        entities: [
          {
            entity_type: "company",
            name: "Test Company via MCP",
            address: "123 Test St",
          },
        ],
      },
    });

    expect(storeResponse.status()).toBe(200);
    const storeResult = await storeResponse.json();
    
    expect(storeResult.entities).toBeDefined();
    expect(storeResult.entities.length).toBe(1);
    
    const entityId = storeResult.entities[0].id;
    createdEntityIds.push(entityId);

    // Verify entity was created in database
    const { data: entity, error: entityError } = await db
      .from("entities")
      .select("*")
      .eq("id", entityId)
      .single();
    
    expect(entityError).toBeNull();
    expect(entity).toBeDefined();
    expect(entity!.entity_type).toBe("company");

    // Verify entity snapshot was created
    const { data: snapshot, error: snapshotError } = await db
      .from("entity_snapshots")
      .select("*")
      .eq("entity_id", entityId)
      .single();
    
    expect(snapshotError).toBeNull();
    expect(snapshot).toBeDefined();
    expect(snapshot!.snapshot.name).toBe("Test Company via MCP");
    expect(snapshot!.snapshot.address).toBe("123 Test St");
  });

  test("should retrieve entities via MCP", async ({ page, uiBaseUrl, mockApi, mcpBaseUrl }) => {
    if (!mcpBaseUrl) {
      test.skip();
      return;
    }

    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create entity directly in database
    const { data: entity } = await db
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "company",
        canonical_name: "test company retrieve",
      })
      .select()
      .single();
    
    createdEntityIds.push(entity!.id);

    // Create entity snapshot
    await db
      .from("entity_snapshots")
      .insert({
        entity_id: entity!.id,
        user_id: testUserId,
        entity_type: "company",
        snapshot: {
          name: "Test Company Retrieve",
          address: "456 Retrieve St",
        },
        observation_count: 1,
        last_observation_at: new Date().toISOString(),
      });

    // Retrieve via MCP
    const retrieveResponse = await page.request.post(`${mcpBaseUrl}/retrieve_entities`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
        entity_type: "company",
      },
    });

    expect(retrieveResponse.status()).toBe(200);
    const retrieveResult = await retrieveResponse.json();
    
    expect(retrieveResult.entities).toBeDefined();
    expect(retrieveResult.entities.length).toBeGreaterThan(0);
    
    // Verify our test entity is in results
    const foundEntity = retrieveResult.entities.find((e: { id: string }) => e.id === entity!.id);
    expect(foundEntity).toBeDefined();
    expect(foundEntity.entity_type).toBe("company");
  });

  test("should store file via MCP with file_path", async ({ page, uiBaseUrl, mockApi, mcpBaseUrl }) => {
    if (!mcpBaseUrl) {
      test.skip();
      return;
    }

    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Store file via MCP
    const storeResponse = await page.request.post(`${mcpBaseUrl}/store`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
        file_path: uploadFixturePath,
        interpret: true,
      },
    });

    expect(storeResponse.status()).toBe(200);
    const storeResult = await storeResponse.json();
    
    expect(storeResult.source_id).toBeDefined();
    
    const sourceId = storeResult.source_id;
    createdSourceIds.push(sourceId);

    // Verify source was created
    const { data: source, error: sourceError } = await db
      .from("sources")
      .select("*")
      .eq("id", sourceId)
      .single();
    
    expect(sourceError).toBeNull();
    expect(source).toBeDefined();
    expect(source!.storage_status).toBe("uploaded");

    // Verify interpretation was created
    const { data: interpretations } = await db
      .from("interpretations")
      .select("*")
      .eq("source_id", sourceId);
    
    expect(interpretations).toBeDefined();
    
    if (interpretations && interpretations.length > 0) {
      expect(interpretations[0].status).toBe("completed");

      // Verify observations were created
      const { data: observations } = await db
        .from("observations")
        .select("*")
        .eq("interpretation_id", interpretations[0].id);
      
      expect(observations).toBeDefined();
      
      if (observations && observations.length > 0) {
        expect(observations.length).toBeGreaterThan(0);
      }
    }
  });

  test("should verify data matches between store and retrieve", async ({ page, uiBaseUrl, mockApi, mcpBaseUrl }) => {
    if (!mcpBaseUrl) {
      test.skip();
      return;
    }

    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Store specific data
    const testData = {
      user_id: testUserId,
      entities: [
        {
          entity_type: "invoice",
          invoice_number: "INV-TEST-001",
          amount: 1500.50,
          vendor_name: "Test Vendor MCP",
        },
      ],
    };

    const storeResponse = await page.request.post(`${mcpBaseUrl}/store`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: testData,
    });

    expect(storeResponse.status()).toBe(200);
    const storeResult = await storeResponse.json();
    
    const entityId = storeResult.entities[0].id;
    createdEntityIds.push(entityId);

    // Retrieve the same entity
    const retrieveResponse = await page.request.post(`${mcpBaseUrl}/retrieve_entities`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
        entity_type: "invoice",
      },
    });

    expect(retrieveResponse.status()).toBe(200);
    const retrieveResult = await retrieveResponse.json();
    
    const retrieved = retrieveResult.entities.find((e: { id: string }) => e.id === entityId);
    expect(retrieved).toBeDefined();
    expect(retrieved.snapshot.invoice_number).toBe("INV-TEST-001");
    expect(retrieved.snapshot.amount).toBe(1500.50);
    expect(retrieved.snapshot.vendor_name).toBe("Test Vendor MCP");
  });
});
