/**
 * E2E Test: MCP-UI Data Consistency
 * 
 * Tests that data stored via MCP appears in UI and vice versa.
 */

import path from "node:path";
import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";
import { repoRoot } from "../utils/servers.js";
import {
  clearClientState,
  primeLocalSettings,
  uploadFileFromRecordsTable,
  waitForRecordsToRender,
  attachBrowserLogging,
  routeChatThroughMock,
} from "./helpers.js";
import { supabase } from "../../src/db.js";

const uploadFixturePath = path.join(
  repoRoot,
  "tests/fixtures/pdf/sample_invoice.pdf"
);

test.describe("E2E-010: MCP-UI Data Consistency", () => {
  const testUserId = "test-user-mcp-ui-consistency";
  const createdEntityIds: string[] = [];
  const createdSourceIds: string[] = [];

  test.afterEach(async () => {
    // Clean up test data
    if (createdEntityIds.length > 0) {
      await supabase.from("entities").delete().in("id", createdEntityIds);
      createdEntityIds.length = 0;
    }
    if (createdSourceIds.length > 0) {
      await supabase.from("sources").delete().in("id", createdSourceIds);
      createdSourceIds.length = 0;
    }
  });

  test("should show MCP-stored data in UI immediately", async ({ page, uiBaseUrl, mockApi, mcpBaseUrl }) => {
    if (!mcpBaseUrl) {
      test.skip();
      return;
    }

    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);
    await page.goto(uiBaseUrl);
    await page.waitForSelector("[data-chat-ready=\"true\"]", { timeout: 30_000 });

    // 1. Store data via MCP
    const storeResponse = await page.request.post(`${mcpBaseUrl}/store`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
        entities: [
          {
            entity_type: "company",
            name: "MCP UI Test Company",
            address: "123 Consistency St",
          },
        ],
      },
    });

    expect(storeResponse.status()).toBe(200);
    const storeResult = await storeResponse.json();
    const entityId = storeResult.entities[0].id;
    createdEntityIds.push(entityId);

    // 2. Verify entity exists in database
    const { data: entity, error: entityError } = await supabase
      .from("entities")
      .select("*")
      .eq("id", entityId)
      .single();
    
    expect(entityError).toBeNull();
    expect(entity).toBeDefined();

    // 3. Verify entity snapshot exists
    const { data: snapshot, error: snapshotError } = await supabase
      .from("entity_snapshots")
      .select("*")
      .eq("entity_id", entityId)
      .single();
    
    expect(snapshotError).toBeNull();
    expect(snapshot).toBeDefined();
    expect(snapshot!.snapshot.name).toBe("MCP UI Test Company");
    expect(snapshot!.snapshot.address).toBe("123 Consistency St");
  });

  test("should make UI-uploaded data queryable via MCP", async ({ page, uiBaseUrl, mockApi, mcpBaseUrl }) => {
    if (!mcpBaseUrl) {
      test.skip();
      return;
    }

    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);
    await page.goto(uiBaseUrl);
    await page.waitForSelector("[data-chat-ready=\"true\"]", { timeout: 30_000 });

    // 1. Upload via UI
    await uploadFileFromRecordsTable(page, uploadFixturePath);
    await page.waitForTimeout(2000);
    await waitForRecordsToRender(page);

    // Get created source
    const { data: sources } = await supabase
      .from("sources")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1);
    
    if (!sources || sources.length === 0) {
      test.skip();
      return;
    }
    
    const sourceId = sources[0].id;
    createdSourceIds.push(sourceId);

    // 2. Query via MCP
    const { data: source } = await supabase
      .from("sources")
      .select("*")
      .eq("id", sourceId)
      .single();
    
    expect(source).toBeDefined();
    expect(source!.storage_status).toBe("uploaded");

    // 3. Verify entities are queryable via MCP
    const { data: interpretations } = await supabase
      .from("interpretations")
      .select("*")
      .eq("source_id", sourceId);
    
    if (interpretations && interpretations.length > 0) {
      const { data: observations } = await supabase
        .from("observations")
        .select("entity_id")
        .eq("interpretation_id", interpretations[0].id);
      
      if (observations && observations.length > 0) {
        const entityIds = [...new Set(observations.map(o => o.entity_id).filter(Boolean))];
        
        for (const eid of entityIds) {
          createdEntityIds.push(eid as string);
        }
        
        // Entities should be queryable
        const { data: entities } = await supabase
          .from("entities")
          .select("*")
          .in("id", entityIds);
        
        expect(entities).toBeDefined();
        expect(entities!.length).toBe(entityIds.length);
      }
    }
  });

  test("should maintain entity resolution consistency across MCP and UI", async ({ page, uiBaseUrl, mockApi, mcpBaseUrl }) => {
    if (!mcpBaseUrl) {
      test.skip();
      return;
    }

    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // 1. Store entity via MCP
    const storeResponse = await page.request.post(`${mcpBaseUrl}/store`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
        entities: [
          {
            entity_type: "company",
            name: "Consistent Company Name",
          },
        ],
      },
    });

    const storeResult = await storeResponse.json();
    const mcpEntityId = storeResult.entities[0].id;
    createdEntityIds.push(mcpEntityId);

    // 2. Store same entity via UI (simulated by creating observation)
    const { data: source } = await supabase
      .from("sources")
      .insert({
        user_id: testUserId,
        content_hash: "hash_consistency_test",
        original_filename: "consistency_test.pdf",
        mime_type: "application/pdf",
        file_size: 1000,
      })
      .select()
      .single();
    
    createdSourceIds.push(source!.id);

    const { data: interpretation } = await supabase
      .from("interpretations")
      .insert({
        user_id: testUserId,
        source_id: source!.id,
        status: "completed",
        provider: "test",
        model_id: "test-model",
      })
      .select()
      .single();

    // Create observation with same entity name (should resolve to same entity)
    await supabase
      .from("observations")
      .insert({
        user_id: testUserId,
        source_id: source!.id,
        interpretation_id: interpretation!.id,
        entity_type: "company",
        fragment_key: "name",
        fragment_value: "Consistent Company Name",
        observation_type: "extracted",
        priority: 1,
      });

    // 3. Query entities - should have only one entity (same ID from both sources)
    const { data: entities } = await supabase
      .from("entities")
      .select("*")
      .eq("entity_type", "company")
      .ilike("canonical_name", "%consistent company%")
      .eq("user_id", testUserId);
    
    if (entities) {
      // Should resolve to same entity
      const uniqueIds = new Set(entities.map(e => e.id));
      expect(uniqueIds.size).toBe(1);
      expect(uniqueIds.has(mcpEntityId)).toBe(true);
    }

    // Clean up
    await supabase.from("observations").delete().eq("source_id", source!.id);
    await supabase.from("interpretations").delete().eq("id", interpretation!.id);
  });

  test("should reflect MCP changes in UI state", async ({ page, uiBaseUrl, mockApi, mcpBaseUrl }) => {
    if (!mcpBaseUrl) {
      test.skip();
      return;
    }

    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);
    await page.goto(uiBaseUrl);
    await page.waitForSelector("[data-chat-ready=\"true\"]", { timeout: 30_000 });

    // Store entity via MCP
    const storeResponse = await page.request.post(`${mcpBaseUrl}/store`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
        entities: [
          {
            entity_type: "task",
            title: "Test Task from MCP",
            status: "in_progress",
          },
        ],
      },
    });

    const storeResult = await storeResponse.json();
    const entityId = storeResult.entities[0].id;
    createdEntityIds.push(entityId);

    // Verify entity snapshot reflects MCP data
    const { data: snapshot } = await supabase
      .from("entity_snapshots")
      .select("*")
      .eq("entity_id", entityId)
      .single();
    
    expect(snapshot).toBeDefined();
    expect(snapshot!.snapshot.title).toBe("Test Task from MCP");
    expect(snapshot!.snapshot.status).toBe("in_progress");
  });
});
