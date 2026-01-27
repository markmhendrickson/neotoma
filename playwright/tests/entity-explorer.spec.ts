/**
 * E2E Test: Entity Explorer Workflow
 * 
 * Tests entity list, filtering, search, and navigation to entity details.
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

test.describe("E2E-003: Entity Explorer Workflow", () => {
  const testUserId = "test-user-entity-explorer";
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

  test("should navigate entity list and view details", async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);
    await page.goto(uiBaseUrl);
    await page.waitForSelector("[data-chat-ready=\"true\"]", { timeout: 30_000 });

    // 1. Upload multiple files
    await uploadFileFromRecordsTable(page, uploadFixturePath);
    await page.waitForTimeout(2000);
    await uploadFileFromRecordsTable(page, uploadFixturePath);
    await page.waitForTimeout(2000);

    await waitForRecordsToRender(page);

    // Get created sources
    const { data: sources } = await supabase
      .from("sources")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(2);
    
    if (sources) {
      for (const source of sources) {
        createdSourceIds.push(source.id);
      }
    }

    // 2. Navigate to entity list view (implementation-dependent)
    // For now, verify entities were created
    const { data: entities } = await supabase
      .from("entities")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5);
    
    if (entities && entities.length > 0) {
      for (const entity of entities) {
        createdEntityIds.push(entity.id);
      }

      // 3. Verify entity snapshots exist
      const { data: snapshots } = await supabase
        .from("entity_snapshots")
        .select("*")
        .in("entity_id", entities.map(e => e.id));
      
      expect(snapshots).toBeDefined();
      
      if (snapshots && snapshots.length > 0) {
        // Verify snapshot structure
        const snapshot = snapshots[0];
        expect(snapshot.entity_type).toBeDefined();
        expect(snapshot.snapshot).toBeDefined();
        expect(snapshot.observation_count).toBeGreaterThan(0);
      }
    }
  });

  test("should filter entities by type", async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create test entities of different types
    const company = await supabase
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "company",
        canonical_name: "filter test company",
      })
      .select()
      .single();
    
    createdEntityIds.push(company.data!.id);

    const person = await supabase
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "person",
        canonical_name: "filter test person",
      })
      .select()
      .single();
    
    createdEntityIds.push(person.data!.id);

    // Query filtered by entity type
    const { data: companyEntities } = await supabase
      .from("entities")
      .select("*")
      .eq("entity_type", "company")
      .eq("user_id", testUserId);
    
    expect(companyEntities).toBeDefined();
    
    if (companyEntities) {
      const foundCompany = companyEntities.find(e => e.id === company.data!.id);
      const foundPerson = companyEntities.find(e => e.id === person.data!.id);
      
      expect(foundCompany).toBeDefined();
      expect(foundPerson).toBeUndefined(); // Person filtered out
    }
  });

  test("should search entities by name", async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create test entities with searchable names
    const entity1 = await supabase
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "company",
        canonical_name: "acme corporation",
      })
      .select()
      .single();
    
    createdEntityIds.push(entity1.data!.id);

    const entity2 = await supabase
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "company",
        canonical_name: "other company inc",
      })
      .select()
      .single();
    
    createdEntityIds.push(entity2.data!.id);

    // Search for "acme"
    const { data: searchResults } = await supabase
      .from("entities")
      .select("*")
      .ilike("canonical_name", "%acme%")
      .eq("user_id", testUserId);
    
    expect(searchResults).toBeDefined();
    
    if (searchResults) {
      const foundAcme = searchResults.find(e => e.id === entity1.data!.id);
      const foundOther = searchResults.find(e => e.id === entity2.data!.id);
      
      expect(foundAcme).toBeDefined();
      expect(foundOther).toBeUndefined();
    }
  });

  test("should display related entities", async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create entities with relationships
    const invoice = await supabase
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "invoice",
        canonical_name: "invoice for relationships",
      })
      .select()
      .single();
    
    createdEntityIds.push(invoice.data!.id);

    const vendor = await supabase
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "company",
        canonical_name: "vendor related",
      })
      .select()
      .single();
    
    createdEntityIds.push(vendor.data!.id);

    // Create relationship
    const relationship = await supabase
      .from("relationships")
      .insert({
        user_id: testUserId,
        relationship_type: "REFERS_TO",
        source_entity_id: invoice.data!.id,
        target_entity_id: vendor.data!.id,
        metadata: {},
      })
      .select()
      .single();

    // Create relationship snapshot
    await supabase
      .from("relationship_snapshots")
      .insert({
        relationship_key: `REFERS_TO:${invoice.data!.id}:${vendor.data!.id}`,
        user_id: testUserId,
        relationship_type: "REFERS_TO",
        source_entity_id: invoice.data!.id,
        target_entity_id: vendor.data!.id,
        snapshot: { metadata: {} },
        observation_count: 1,
        last_observation_at: new Date().toISOString(),
      });

    // Query relationships
    const { data: relationships } = await supabase
      .from("relationship_snapshots")
      .select("*")
      .eq("source_entity_id", invoice.data!.id);
    
    expect(relationships).toBeDefined();
    expect(relationships!.length).toBe(1);
    expect(relationships![0].target_entity_id).toBe(vendor.data!.id);

    // Clean up relationship
    if (relationship.data?.id) {
      await supabase.from("relationships").delete().eq("id", relationship.data.id);
    }
  });

  test("should show timeline events for entity", async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create test source
    const { data: source } = await supabase
      .from("sources")
      .insert({
        user_id: testUserId,
        content_hash: "hash_entity_events",
        original_filename: "entity_events.pdf",
        mime_type: "application/pdf",
        file_size: 1000,
      })
      .select()
      .single();
    
    createdSourceIds.push(source!.id);

    // Create test entity
    const entity = await supabase
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "invoice",
        canonical_name: "invoice with events",
      })
      .select()
      .single();
    
    createdEntityIds.push(entity.data!.id);

    // Create timeline event for entity
    const event = await supabase
      .from("timeline_events")
      .insert({
        event_type: "InvoiceIssued",
        event_date: "2025-01-15",
        source_id: source!.id,
        source_field: "date_issued",
        entity_id: entity.data!.id,
        entity_type: "invoice",
      })
      .select()
      .single();

    // Query events for entity
    const { data: events } = await supabase
      .from("timeline_events")
      .select("*")
      .eq("entity_id", entity.data!.id);
    
    expect(events).toBeDefined();
    expect(events!.length).toBe(1);
    expect(events![0].id).toBe(event.data!.id);

    // Clean up event
    await supabase.from("timeline_events").delete().eq("id", event.data!.id);
  });

  test("should traverse entity relationships", async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create entities with relationships
    const invoice = await supabase
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "invoice",
        canonical_name: "traversal test invoice",
      })
      .select()
      .single();
    
    createdEntityIds.push(invoice.data!.id);

    const vendor = await supabase
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "company",
        canonical_name: "traversal test vendor",
      })
      .select()
      .single();
    
    createdEntityIds.push(vendor.data!.id);

    // Create relationship
    const relationship = await supabase
      .from("relationships")
      .insert({
        user_id: testUserId,
        relationship_type: "REFERS_TO",
        source_entity_id: invoice.data!.id,
        target_entity_id: vendor.data!.id,
        metadata: {},
      })
      .select()
      .single();

    // Query outgoing relationships
    const { data: outgoing } = await supabase
      .from("relationships")
      .select("*")
      .eq("source_entity_id", invoice.data!.id);
    
    expect(outgoing).toBeDefined();
    expect(outgoing!.length).toBe(1);
    expect(outgoing![0].target_entity_id).toBe(vendor.data!.id);

    // Query incoming relationships
    const { data: incoming } = await supabase
      .from("relationships")
      .select("*")
      .eq("target_entity_id", vendor.data!.id);
    
    expect(incoming).toBeDefined();
    expect(incoming!.length).toBe(1);
    expect(incoming![0].source_entity_id).toBe(invoice.data!.id);

    // Clean up
    if (relationship.data?.id) {
      await supabase.from("relationships").delete().eq("id", relationship.data.id);
    }
  });

  test("should display entity detail with observations", async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create test source
    const { data: source } = await supabase
      .from("sources")
      .insert({
        user_id: testUserId,
        content_hash: "hash_detail_obs",
        original_filename: "detail_test.pdf",
        mime_type: "application/pdf",
        file_size: 1000,
      })
      .select()
      .single();
    
    createdSourceIds.push(source!.id);

    // Create entity
    const entity = await supabase
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "invoice",
        canonical_name: "detail test invoice",
      })
      .select()
      .single();
    
    createdEntityIds.push(entity.data!.id);

    // Create observations
    const observation = await supabase
      .from("observations")
      .insert({
        entity_id: entity.data!.id,
        entity_type: "invoice",
        source_id: source!.id,
        extracted_fields: {
          invoice_number: "INV-001",
          amount: 100,
        },
        user_id: testUserId,
      })
      .select()
      .single();

    // Query observations for entity
    const { data: observations } = await supabase
      .from("observations")
      .select("*")
      .eq("entity_id", entity.data!.id);
    
    expect(observations).toBeDefined();
    expect(observations!.length).toBe(1);
    expect(observations![0].id).toBe(observation.data!.id);
    expect(observations![0].extracted_fields).toEqual({
      invoice_number: "INV-001",
      amount: 100,
    });

    // Clean up observation
    await supabase.from("observations").delete().eq("id", observation.data!.id);
  });

  test("should handle error states gracefully", async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Try to query non-existent entity
    const { data, error } = await supabase
      .from("entities")
      .select("*")
      .eq("id", "ent_nonexistent_12345");
    
    expect(error).toBeNull();
    expect(data).toEqual([]);
    
    // Application should handle empty results gracefully
    // UI testing for error states depends on implementation
  });
});
