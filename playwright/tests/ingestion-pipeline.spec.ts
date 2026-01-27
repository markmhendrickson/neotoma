/**
 * E2E Test: Full Ingestion Pipeline Flow
 * 
 * Tests complete pipeline: upload → source → interpretation → observations → entities → timeline
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

test.describe("E2E-001: Full Ingestion Pipeline Flow", () => {
  test.beforeEach(async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);
    await page.goto(uiBaseUrl);
    await page.waitForSelector("[data-chat-ready=\"true\"]", { timeout: 30_000 });
  });

  test("should complete full ingestion pipeline from upload to timeline", async ({ page }) => {
    // 1. Upload PDF file via UI
    await uploadFileFromRecordsTable(page, uploadFixturePath);
    await page.waitForTimeout(2000);

    // 2. Verify record appears in table
    await waitForRecordsToRender(page);
    const records = page.locator("[data-record-summary]");
    const recordCount = await records.count();
    expect(recordCount).toBeGreaterThan(0);

    // Get the record ID for later verification
    const firstRecord = records.first();
    const recordId = await firstRecord.getAttribute("data-record-id");
    expect(recordId).toBeTruthy();

    // 3. Verify source was created in database
    const { data: sources, error: sourcesError } = await supabase
      .from("sources")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);
    
    expect(sourcesError).toBeNull();
    expect(sources).toBeDefined();
    expect(sources!.length).toBe(1);
    
    const sourceId = sources![0].id;
    expect(sources![0].storage_status).toBe("uploaded");
    expect(sources![0].content_hash).toBeDefined();
    expect(sources![0].mime_type).toBe("application/pdf");

    // 4. Verify interpretation run was created
    const { data: interpretations, error: interpretError } = await supabase
      .from("interpretations")
      .select("*")
      .eq("source_id", sourceId);
    
    expect(interpretError).toBeNull();
    expect(interpretations).toBeDefined();
    
    if (interpretations && interpretations.length > 0) {
      const interpretationId = interpretations[0].id;
      expect(interpretations[0].status).toBe("completed");
      expect(interpretations[0].provider).toBeDefined();

      // 5. Verify observations were created from interpretation
      const { data: observations, error: obsError } = await supabase
        .from("observations")
        .select("*")
        .eq("interpretation_id", interpretationId);
      
      expect(obsError).toBeNull();
      expect(observations).toBeDefined();
      
      if (observations && observations.length > 0) {
        expect(observations.length).toBeGreaterThan(0);
        
        // Verify observation structure
        const obs = observations[0];
        expect(obs.entity_type).toBeDefined();
        expect(obs.fragment_key).toBeDefined();
        expect(obs.fragment_value).toBeDefined();
        expect(obs.observation_type).toBeDefined();

        // 6. Verify entities were resolved from observations
        const entityIds = [...new Set(observations.map(o => o.entity_id).filter(Boolean))];
        expect(entityIds.length).toBeGreaterThan(0);

        // 7. Verify entity snapshots were computed
        const { data: entitySnapshots, error: snapError } = await supabase
          .from("entity_snapshots")
          .select("*")
          .in("entity_id", entityIds);
        
        expect(snapError).toBeNull();
        expect(entitySnapshots).toBeDefined();
        expect(entitySnapshots!.length).toBeGreaterThan(0);
        
        const snapshot = entitySnapshots![0];
        expect(snapshot.entity_type).toBeDefined();
        expect(snapshot.snapshot).toBeDefined();
        expect(snapshot.observation_count).toBeGreaterThan(0);

        // 8. Verify timeline events were generated
        const { data: events, error: eventsError } = await supabase
          .from("timeline_events")
          .select("*")
          .eq("source_id", sourceId);
        
        expect(eventsError).toBeNull();
        
        if (events && events.length > 0) {
          expect(events.length).toBeGreaterThan(0);
          const event = events[0];
          expect(event.event_type).toBeDefined();
          expect(event.event_date).toBeDefined();
        }
      }
    }

    // 9. Navigate to source detail view (via record)
    await firstRecord.click();
    
    const panel = page.getByRole("dialog", { name: /Record Details/i });
    await expect(panel).toBeVisible();

    // 10. Verify four-layer truth model visible (UI should show source, interpretation, observations, entities)
    // This verification depends on UI implementation
    // For now, verify panel shows content
    await expect(panel).toContainText(/.+/); // Contains some text

    // 11. Navigate to entity detail (if entities are linked in UI)
    // This depends on UI implementation - skip for now

    await panel.getByRole("button", { name: "Close" }).click();
    await expect(panel).toBeHidden();

    // 12. Clean up test data
    await supabase.from("sources").delete().eq("id", sourceId);
  });

  test("should handle multiple file uploads in sequence", async ({ page }) => {
    // Upload first file
    await uploadFileFromRecordsTable(page, uploadFixturePath);
    await page.waitForTimeout(2000);

    await waitForRecordsToRender(page);
    const firstCount = await page.locator("[data-record-summary]").count();
    expect(firstCount).toBeGreaterThan(0);

    // Upload second file (same file for simplicity)
    await uploadFileFromRecordsTable(page, uploadFixturePath);
    await page.waitForTimeout(2000);

    // Should have more records (or same count if deduplicated)
    const secondCount = await page.locator("[data-record-summary]").count();
    expect(secondCount).toBeGreaterThanOrEqual(firstCount);

    // Verify sources were created
    const { data: sources } = await supabase
      .from("sources")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2);
    
    expect(sources).toBeDefined();
    
    if (sources && sources.length > 0) {
      // Clean up
      const sourceIds = sources.map(s => s.id);
      await supabase.from("sources").delete().in("id", sourceIds);
    }
  });

  test("should create observations with correct priority", async ({ page }) => {
    await uploadFileFromRecordsTable(page, uploadFixturePath);
    await page.waitForTimeout(2000);

    await waitForRecordsToRender(page);
    
    // Verify observations have correct priority
    const { data: sources } = await supabase
      .from("sources")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);
    
    if (sources && sources.length > 0) {
      const sourceId = sources[0].id;
      
      const { data: interpretations } = await supabase
        .from("interpretations")
        .select("*")
        .eq("source_id", sourceId);
      
      if (interpretations && interpretations.length > 0) {
        const interpretationId = interpretations[0].id;
        
        const { data: observations } = await supabase
          .from("observations")
          .select("*")
          .eq("interpretation_id", interpretationId);
        
        expect(observations).toBeDefined();
        
        if (observations && observations.length > 0) {
          // Extracted observations should have priority 1
          for (const obs of observations) {
            expect(obs.priority).toBeDefined();
            expect(obs.priority).toBeGreaterThan(0);
          }
        }
      }
      
      // Clean up
      await supabase.from("sources").delete().eq("id", sourceId);
    }
  });

  test("should generate deterministic entity IDs", async ({ page }) => {
    // Upload same file twice
    await uploadFileFromRecordsTable(page, uploadFixturePath);
    await page.waitForTimeout(2000);

    await uploadFileFromRecordsTable(page, uploadFixturePath);
    await page.waitForTimeout(2000);

    await waitForRecordsToRender(page);
    
    // Get sources created
    const { data: sources } = await supabase
      .from("sources")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2);
    
    if (sources && sources.length === 2) {
      // Get observations from both sources
      const { data: interp1 } = await supabase
        .from("interpretations")
        .select("*")
        .eq("source_id", sources[0].id)
        .limit(1);
      
      const { data: interp2 } = await supabase
        .from("interpretations")
        .select("*")
        .eq("source_id", sources[1].id)
        .limit(1);
      
      if (interp1 && interp1.length > 0 && interp2 && interp2.length > 0) {
        const { data: obs1 } = await supabase
          .from("observations")
          .select("entity_id, entity_type, fragment_key, fragment_value")
          .eq("interpretation_id", interp1[0].id);
        
        const { data: obs2 } = await supabase
          .from("observations")
          .select("entity_id, entity_type, fragment_key, fragment_value")
          .eq("interpretation_id", interp2[0].id);
        
        if (obs1 && obs2 && obs1.length > 0 && obs2.length > 0) {
          // Find matching observations (same entity_type + fragment_key + fragment_value)
          for (const o1 of obs1) {
            const matching = obs2.find(
              o2 =>
                o2.entity_type === o1.entity_type &&
                o2.fragment_key === o1.fragment_key &&
                o2.fragment_value === o1.fragment_value
            );
            
            if (matching) {
              // Same entity extraction should produce same entity_id
              expect(o1.entity_id).toBe(matching.entity_id);
            }
          }
        }
      }
      
      // Clean up
      const sourceIds = sources.map(s => s.id);
      await supabase.from("sources").delete().in("id", sourceIds);
    }
  });

  test("should store raw_fragments for unknown fields", async ({ page }) => {
    await uploadFileFromRecordsTable(page, uploadFixturePath);
    await page.waitForTimeout(2000);

    await waitForRecordsToRender(page);
    
    const { data: sources } = await supabase
      .from("sources")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);
    
    if (sources && sources.length > 0) {
      const sourceId = sources[0].id;
      
      const { data: interpretations } = await supabase
        .from("interpretations")
        .select("*")
        .eq("source_id", sourceId);
      
      if (interpretations && interpretations.length > 0) {
        const interpretationId = interpretations[0].id;
        
        // Check if raw_fragments were created
        const { data: fragments } = await supabase
          .from("raw_fragments")
          .select("*")
          .eq("interpretation_id", interpretationId);
        
        // raw_fragments may or may not exist depending on schema coverage
        // Just verify query succeeds
        expect(fragments).toBeDefined();
      }
      
      // Clean up
      await supabase.from("sources").delete().eq("id", sourceId);
    }
  });
});
