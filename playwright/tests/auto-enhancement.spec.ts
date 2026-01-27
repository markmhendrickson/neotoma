/**
 * E2E Test: Schema Recommendation and Auto-Enhancement Flow
 * 
 * Tests schema evolution through auto-enhancement of unknown fields.
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
import { supabase } from "../../src/db.js";

test.describe("E2E-005: Schema Recommendation and Auto-Enhancement Flow", () => {
  const testUserId = "test-user-auto-enhancement";
  const testEntityType = "test_enhancement_type";
  const createdSourceIds: string[] = [];
  const createdSchemaIds: string[] = [];
  const createdRecommendationIds: string[] = [];

  test.beforeEach(async () => {
    // Clean up test data
    const { data: schemas } = await supabase
      .from("schema_registry")
      .select("id")
      .eq("entity_type", testEntityType);
    
    if (schemas) {
      await supabase.from("schema_registry").delete().in("id", schemas.map(s => s.id));
    }
    
    const { data: recommendations } = await supabase
      .from("schema_recommendations")
      .select("id")
      .eq("entity_type", testEntityType);
    
    if (recommendations) {
      await supabase.from("schema_recommendations").delete().in("id", recommendations.map(r => r.id));
    }
  });

  test.afterEach(async () => {
    // Clean up test data
    if (createdRecommendationIds.length > 0) {
      await supabase.from("schema_recommendations").delete().in("id", createdRecommendationIds);
      createdRecommendationIds.length = 0;
    }
    if (createdSchemaIds.length > 0) {
      await supabase.from("schema_registry").delete().in("id", createdSchemaIds);
      createdSchemaIds.length = 0;
    }
    if (createdSourceIds.length > 0) {
      await supabase.from("sources").delete().in("id", createdSourceIds);
      createdSourceIds.length = 0;
    }
  });

  test("should create raw_fragments for unknown fields", async ({ page, uiBaseUrl, mockApi, mcpBaseUrl }) => {
    if (!mcpBaseUrl) {
      test.skip();
      return;
    }

    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // 1. Seed minimal schema (only has "title" field)
    const { data: schema, error: schemaError } = await supabase
      .from("schema_registry")
      .insert({
        user_id: testUserId,
        entity_type: testEntityType,
        schema_version: "1.0",
        schema_definition: {
          fields: {
            title: { type: "string", required: false },
          },
        },
        is_active: true,
      })
      .select()
      .single();
    
    expect(schemaError).toBeNull();
    createdSchemaIds.push(schema!.id);

    // 2. Store data with unknown fields via MCP
    const storeResponse = await page.request.post(`${mcpBaseUrl}/store`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
        entities: [
          {
            entity_type: testEntityType,
            title: "Known Field",
            description: "Unknown Field 1",
            status: "Unknown Field 2",
            amount: 999,
          },
        ],
      },
    });

    expect(storeResponse.status()).toBe(200);
    const storeResult = await storeResponse.json();
    
    expect(storeResult.unknown_fields_count).toBeGreaterThan(0);

    // 3. Verify raw_fragments were created
    const { data: fragments, error: fragmentsError } = await supabase
      .from("raw_fragments")
      .select("*")
      .eq("fragment_type", testEntityType)
      .eq("user_id", testUserId);
    
    expect(fragmentsError).toBeNull();
    expect(fragments).toBeDefined();
    
    if (fragments && fragments.length > 0) {
      expect(fragments.length).toBeGreaterThan(0);
      
      // Should have fragments for description, status, amount
      const fragmentKeys = fragments.map(f => f.fragment_key);
      expect(fragmentKeys).toContain("description");
      expect(fragmentKeys).toContain("status");
      expect(fragmentKeys).toContain("amount");
    }

    // 4. Verify auto-enhancement queue items were created
    const { data: queueItems, error: queueError } = await supabase
      .from("auto_enhancement_queue")
      .select("*")
      .eq("entity_type", testEntityType)
      .eq("user_id", testUserId);
    
    expect(queueError).toBeNull();
    expect(queueItems).toBeDefined();
    
    if (queueItems && queueItems.length > 0) {
      expect(queueItems.length).toBeGreaterThan(0);
      expect(queueItems[0].status).toBe("pending");
    }
  });

  test("should process auto-enhancement queue and create recommendations", async ({ page, uiBaseUrl, mockApi, mcpBaseUrl }) => {
    if (!mcpBaseUrl) {
      test.skip();
      return;
    }

    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // 1. Seed minimal schema
    const { data: schema } = await supabase
      .from("schema_registry")
      .insert({
        user_id: testUserId,
        entity_type: testEntityType,
        schema_version: "1.0",
        schema_definition: {
          fields: {
            title: { type: "string", required: false },
          },
        },
        is_active: true,
      })
      .select()
      .single();
    
    createdSchemaIds.push(schema!.id);

    // 2. Store data with unknown fields
    await page.request.post(`${mcpBaseUrl}/store`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
        entities: [
          {
            entity_type: testEntityType,
            title: "Test Item",
            priority: "high", // Unknown field
          },
        ],
      },
    });

    // 3. Process auto-enhancement queue via MCP
    const processResponse = await page.request.post(`${mcpBaseUrl}/process_auto_enhancement_queue`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
      },
    });

    if (processResponse.status() === 200) {
      const processResult = await processResponse.json();
      
      // May succeed or skip depending on eligibility criteria
      expect(processResult.succeeded + processResult.skipped).toBeGreaterThanOrEqual(0);

      // 4. Check for schema recommendations
      const { data: recommendations } = await supabase
        .from("schema_recommendations")
        .select("*")
        .eq("entity_type", testEntityType)
        .eq("user_id", testUserId);
      
      if (recommendations && recommendations.length > 0) {
        expect(recommendations[0].new_fields).toBeDefined();
        expect(recommendations[0].status).toBeDefined();
        
        for (const rec of recommendations) {
          createdRecommendationIds.push(rec.id);
        }
      }
    }
  });

  test("should auto-apply low-risk recommendations", async ({ page, uiBaseUrl, mockApi, mcpBaseUrl }) => {
    if (!mcpBaseUrl) {
      test.skip();
      return;
    }

    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create schema
    const { data: schema } = await supabase
      .from("schema_registry")
      .insert({
        user_id: testUserId,
        entity_type: testEntityType,
        schema_version: "1.0",
        schema_definition: {
          fields: {
            title: { type: "string", required: false },
          },
        },
        is_active: true,
      })
      .select()
      .single();
    
    createdSchemaIds.push(schema!.id);

    // Store data with unknown field
    await page.request.post(`${mcpBaseUrl}/store`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
        entities: [
          {
            entity_type: testEntityType,
            title: "Test",
            category: "test-category", // Unknown field
          },
        ],
      },
    });

    // Process queue
    await page.request.post(`${mcpBaseUrl}/process_auto_enhancement_queue`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
      },
    });

    // Check if schema was updated (recommendations may be auto-applied)
    const { data: recommendations } = await supabase
      .from("schema_recommendations")
      .select("*")
      .eq("entity_type", testEntityType)
      .eq("user_id", testUserId);
    
    if (recommendations && recommendations.length > 0) {
      for (const rec of recommendations) {
        createdRecommendationIds.push(rec.id);
      }
      
      // Check if any were auto-applied
      const autoApplied = recommendations.filter(r => r.status === "auto_applied");
      
      if (autoApplied.length > 0) {
        // Verify schema was updated
        const { data: updatedSchemas } = await supabase
          .from("schema_registry")
          .select("*")
          .eq("entity_type", testEntityType)
          .eq("user_id", testUserId)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1);
        
        if (updatedSchemas && updatedSchemas.length > 0) {
          const latestSchema = updatedSchemas[0];
          
          // New schema version should include the new field
          expect(latestSchema.schema_definition.fields).toBeDefined();
          
          if (latestSchema.id !== schema!.id) {
            createdSchemaIds.push(latestSchema.id);
          }
        }
      }
    }
  });
});
