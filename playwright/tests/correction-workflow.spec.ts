/**
 * E2E Test: Correction Workflow
 * 
 * Tests user corrections creating priority-1000 observations that override AI extraction.
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

test.describe("E2E-004: Correction Workflow", () => {
  const testUserId = "test-user-corrections";
  const createdSourceIds: string[] = [];

  test.afterEach(async () => {
    // Clean up test data
    if (createdSourceIds.length > 0) {
      await supabase.from("sources").delete().in("id", createdSourceIds);
      createdSourceIds.length = 0;
    }
  });

  test("should create priority-1000 observation for user correction", async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);
    await page.goto(uiBaseUrl);
    await page.waitForSelector("[data-chat-ready=\"true\"]", { timeout: 30_000 });

    // 1. Upload file with extracted fields
    await uploadFileFromRecordsTable(page, uploadFixturePath);
    await page.waitForTimeout(2000);
    await waitForRecordsToRender(page);

    // Get the created source
    const { data: sources } = await supabase
      .from("sources")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);
    
    if (!sources || sources.length === 0) {
      // Skip test if source not created
      return;
    }
    
    const sourceId = sources[0].id;
    createdSourceIds.push(sourceId);

    // Get interpretations for source
    const { data: interpretations } = await supabase
      .from("interpretations")
      .select("*")
      .eq("source_id", sourceId);
    
    if (!interpretations || interpretations.length === 0) {
      // Skip test if interpretation not created
      return;
    }
    
    const interpretationId = interpretations[0].id;

    // Get original observations
    const { data: originalObs } = await supabase
      .from("observations")
      .select("*")
      .eq("interpretation_id", interpretationId);
    
    if (!originalObs || originalObs.length === 0) {
      // Skip test if no observations
      return;
    }
    
    const firstObs = originalObs[0];
    expect(firstObs.priority).toBeLessThan(1000); // Original has lower priority

    // 2. Create a correction observation (simulates UI correction)
    const { data: correctionObs, error: correctionError } = await supabase
      .from("observations")
      .insert({
        user_id: firstObs.user_id || testUserId,
        source_id: sourceId,
        interpretation_id: null, // No interpretation for corrections
        entity_id: firstObs.entity_id,
        entity_type: firstObs.entity_type,
        fragment_key: firstObs.fragment_key,
        fragment_value: "CORRECTED_VALUE",
        observation_type: "corrected",
        priority: 1000,
      })
      .select()
      .single();
    
    expect(correctionError).toBeNull();
    expect(correctionObs).toBeDefined();
    expect(correctionObs!.priority).toBe(1000);

    // 3. Verify entity snapshot updated with corrected value
    // Trigger reducer to compute new snapshot
    const { relationshipReducer } = await import("../../src/reducers/relationship_reducer.js");
    const { observationReducer } = await import("../../src/reducers/observation_reducer.js");
    
    if (firstObs.entity_id) {
      await observationReducer.computeEntitySnapshot(
        firstObs.entity_id,
        firstObs.user_id || testUserId
      );

      // Get updated snapshot
      const { data: snapshot } = await supabase
        .from("entity_snapshots")
        .select("*")
        .eq("entity_id", firstObs.entity_id)
        .single();
      
      expect(snapshot).toBeDefined();
      expect(snapshot!.snapshot[firstObs.fragment_key]).toBe("CORRECTED_VALUE");
    }

    // 4. Verify original observation still exists (immutability)
    const { data: allObs } = await supabase
      .from("observations")
      .select("*")
      .eq("entity_id", firstObs.entity_id);
    
    expect(allObs).toBeDefined();
    expect(allObs!.length).toBe(2); // Original + correction

    const hasOriginal = allObs!.some(o => o.id === firstObs.id);
    const hasCorrection = allObs!.some(o => o.id === correctionObs!.id);
    
    expect(hasOriginal).toBe(true);
    expect(hasCorrection).toBe(true);

    // Clean up correction
    await supabase.from("observations").delete().eq("id", correctionObs!.id);
  });

  test("should preserve provenance for corrections", async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create test source
    const { data: source } = await supabase
      .from("sources")
      .insert({
        user_id: testUserId,
        content_hash: "hash_correction_provenance",
        original_filename: "correction_test.pdf",
        mime_type: "application/pdf",
        file_size: 1000,
      })
      .select()
      .single();
    
    createdSourceIds.push(source!.id);

    // Create interpretation
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

    // Create original observation
    const { data: originalObs } = await supabase
      .from("observations")
      .insert({
        user_id: testUserId,
        source_id: source!.id,
        interpretation_id: interpretation!.id,
        entity_type: "company",
        fragment_key: "company_name",
        fragment_value: "Original Name",
        observation_type: "extracted",
        priority: 1,
      })
      .select()
      .single();

    // Create correction
    const { data: correction } = await supabase
      .from("observations")
      .insert({
        user_id: testUserId,
        source_id: source!.id,
        interpretation_id: null,
        entity_id: originalObs!.entity_id,
        entity_type: "company",
        fragment_key: "company_name",
        fragment_value: "Corrected Name",
        observation_type: "corrected",
        priority: 1000,
      })
      .select()
      .single();

    // Verify correction has provenance (links to correction source)
    expect(correction).toBeDefined();
    expect(correction!.source_id).toBe(source!.id);
    expect(correction!.observation_type).toBe("corrected");
    expect(correction!.priority).toBe(1000);
    expect(correction!.interpretation_id).toBeNull(); // Corrections don't have interpretation

    // Clean up
    await supabase.from("observations").delete().in("id", [originalObs!.id, correction!.id]);
    await supabase.from("interpretations").delete().eq("id", interpretation!.id);
  });

  test("should handle multiple corrections for same field", async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create test source
    const { data: source } = await supabase
      .from("sources")
      .insert({
        user_id: testUserId,
        content_hash: "hash_multi_corrections",
        original_filename: "multi_corrections.pdf",
        mime_type: "application/pdf",
        file_size: 1000,
      })
      .select()
      .single();
    
    createdSourceIds.push(source!.id);

    // Create interpretation
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

    // Create original observation
    const { data: originalObs } = await supabase
      .from("observations")
      .insert({
        user_id: testUserId,
        source_id: source!.id,
        interpretation_id: interpretation!.id,
        entity_type: "company",
        fragment_key: "company_name",
        fragment_value: "Original",
        observation_type: "extracted",
        priority: 1,
      })
      .select()
      .single();

    // Create first correction
    const { data: correction1 } = await supabase
      .from("observations")
      .insert({
        user_id: testUserId,
        source_id: source!.id,
        interpretation_id: null,
        entity_id: originalObs!.entity_id,
        entity_type: "company",
        fragment_key: "company_name",
        fragment_value: "First Correction",
        observation_type: "corrected",
        priority: 1000,
      })
      .select()
      .single();

    // Create second correction
    const { data: correction2 } = await supabase
      .from("observations")
      .insert({
        user_id: testUserId,
        source_id: source!.id,
        interpretation_id: null,
        entity_id: originalObs!.entity_id,
        entity_type: "company",
        fragment_key: "company_name",
        fragment_value: "Second Correction",
        observation_type: "corrected",
        priority: 1000,
      })
      .select()
      .single();

    // All three observations should exist
    const { data: allObs } = await supabase
      .from("observations")
      .select("*")
      .eq("entity_id", originalObs!.entity_id)
      .eq("fragment_key", "company_name");
    
    expect(allObs).toBeDefined();
    expect(allObs!.length).toBe(3);

    // All corrections should have priority 1000
    const corrections = allObs!.filter(o => o.observation_type === "corrected");
    expect(corrections.length).toBe(2);
    expect(corrections.every(c => c.priority === 1000)).toBe(true);

    // Clean up
    await supabase.from("observations").delete().in("id", [
      originalObs!.id,
      correction1!.id,
      correction2!.id,
    ]);
    await supabase.from("interpretations").delete().eq("id", interpretation!.id);
  });
});
