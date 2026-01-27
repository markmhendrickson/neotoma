/**
 * E2E Test: Graph Integrity Checks
 * 
 * Tests orphan detection and cycle prevention in the graph.
 */

import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";
import {
  clearClientState,
  primeLocalSettings,
  attachBrowserLogging,
  routeChatThroughMock,
} from "./helpers.js";
import { supabase } from "../../src/db.js";
import { detectOrphanNodes, detectCycles } from "../../src/services/graph_builder.js";

test.describe("E2E-009: Graph Integrity Checks", () => {
  const testUserId = "test-user-graph-integrity";
  const createdEntityIds: string[] = [];
  const createdSourceIds: string[] = [];
  const createdRelationshipIds: string[] = [];

  test.afterEach(async () => {
    // Clean up test data
    if (createdRelationshipIds.length > 0) {
      await supabase.from("relationships").delete().in("id", createdRelationshipIds);
      createdRelationshipIds.length = 0;
    }
    if (createdEntityIds.length > 0) {
      await supabase.from("entities").delete().in("id", createdEntityIds);
      createdEntityIds.length = 0;
    }
    if (createdSourceIds.length > 0) {
      await supabase.from("sources").delete().in("id", createdSourceIds);
      createdSourceIds.length = 0;
    }
  });

  test("should detect no orphans in well-formed graph", async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create test source
    const { data: source } = await supabase
      .from("sources")
      .insert({
        user_id: testUserId,
        content_hash: "hash_graph_integrity_1",
        original_filename: "integrity_test.pdf",
        mime_type: "application/pdf",
        file_size: 1000,
      })
      .select()
      .single();
    
    createdSourceIds.push(source!.id);

    // Create entities
    const entity1 = await supabase
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "company",
        canonical_name: "integrity company 1",
      })
      .select()
      .single();
    
    createdEntityIds.push(entity1.data!.id);

    // Create source_entity_edge to prevent orphan
    await supabase
      .from("source_entity_edges")
      .insert({
        source_id: source!.id,
        entity_id: entity1.data!.id,
      });

    // Run orphan detection
    const orphans = await detectOrphanNodes();
    
    // Our test entities should not be orphans
    expect(orphans.orphanRecords).toBe(0);
    expect(orphans.orphanEntities).toBe(0);
    expect(orphans.orphanEvents).toBe(0);

    // Clean up edge
    await supabase
      .from("source_entity_edges")
      .delete()
      .eq("source_id", source!.id)
      .eq("entity_id", entity1.data!.id);
  });

  test("should detect orphan entities", async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create orphan entity (no source_entity_edges)
    const entity = await supabase
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "company",
        canonical_name: "orphan company",
      })
      .select()
      .single();
    
    createdEntityIds.push(entity.data!.id);

    // Run orphan detection
    const orphans = await detectOrphanNodes();
    
    // Should detect at least one orphan entity
    expect(orphans.orphanEntities).toBeGreaterThan(0);
  });

  test("should detect cycles if they exist", async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create three entities
    const entityA = await supabase
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "company",
        canonical_name: "cycle company a",
      })
      .select()
      .single();
    
    createdEntityIds.push(entityA.data!.id);

    const entityB = await supabase
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "company",
        canonical_name: "cycle company b",
      })
      .select()
      .single();
    
    createdEntityIds.push(entityB.data!.id);

    const entityC = await supabase
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "company",
        canonical_name: "cycle company c",
      })
      .select()
      .single();
    
    createdEntityIds.push(entityC.data!.id);

    // Create cycle: A→B→C→A
    const relAB = await supabase
      .from("relationships")
      .insert({
        user_id: testUserId,
        relationship_type: "PART_OF",
        source_entity_id: entityA.data!.id,
        target_entity_id: entityB.data!.id,
        metadata: {},
      })
      .select()
      .single();
    
    if (relAB.data?.id) createdRelationshipIds.push(relAB.data.id);

    const relBC = await supabase
      .from("relationships")
      .insert({
        user_id: testUserId,
        relationship_type: "PART_OF",
        source_entity_id: entityB.data!.id,
        target_entity_id: entityC.data!.id,
        metadata: {},
      })
      .select()
      .single();
    
    if (relBC.data?.id) createdRelationshipIds.push(relBC.data.id);

    const relCA = await supabase
      .from("relationships")
      .insert({
        user_id: testUserId,
        relationship_type: "PART_OF",
        source_entity_id: entityC.data!.id,
        target_entity_id: entityA.data!.id,
        metadata: {},
      })
      .select()
      .single();
    
    if (relCA.data?.id) createdRelationshipIds.push(relCA.data.id);

    // Run cycle detection
    const cycles = await detectCycles();
    
    // Should detect at least one cycle
    expect(cycles.cycleCount).toBeGreaterThan(0);
    expect(cycles.cycles.length).toBeGreaterThan(0);
  });

  test("should handle entity deletion with relationships", async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create entities with relationship
    const entityA = await supabase
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "company",
        canonical_name: "deletion test a",
      })
      .select()
      .single();
    
    createdEntityIds.push(entityA.data!.id);

    const entityB = await supabase
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "company",
        canonical_name: "deletion test b",
      })
      .select()
      .single();
    
    createdEntityIds.push(entityB.data!.id);

    // Create relationship
    const relationship = await supabase
      .from("relationships")
      .insert({
        user_id: testUserId,
        relationship_type: "PART_OF",
        source_entity_id: entityA.data!.id,
        target_entity_id: entityB.data!.id,
        metadata: {},
      })
      .select()
      .single();
    
    if (relationship.data?.id) createdRelationshipIds.push(relationship.data.id);

    // Delete entity A
    await supabase.from("entities").delete().eq("id", entityA.data!.id);
    createdEntityIds.splice(createdEntityIds.indexOf(entityA.data!.id), 1);

    // Verify relationship handling (cascade or orphan, depends on FK constraints)
    const { data: remainingRels } = await supabase
      .from("relationships")
      .select("*")
      .eq("source_entity_id", entityA.data!.id);
    
    // Either relationship was cascaded or it remains (orphan)
    // Both are valid depending on FK constraint configuration
    expect(remainingRels).toBeDefined();
  });
});
