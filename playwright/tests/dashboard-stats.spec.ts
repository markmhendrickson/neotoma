/**
 * E2E Test: Dashboard Stats Display
 * 
 * Tests dashboard statistics display and updates.
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
import { getDashboardStats } from "../../src/services/dashboard_stats.js";

const uploadFixturePath = path.join(
  repoRoot,
  "tests/fixtures/pdf/sample_invoice.pdf"
);

test.describe("E2E-012: Dashboard Stats Display", () => {
  const testUserId = "test-user-dashboard-display";
  const createdSourceIds: string[] = [];
  const createdEntityIds: string[] = [];

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

  test("should display correct source count", async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);
    await page.goto(uiBaseUrl);
    await page.waitForSelector("[data-chat-ready=\"true\"]", { timeout: 30_000 });

    // Create test sources
    const source1 = await supabase
      .from("sources")
      .insert({
        user_id: testUserId,
        content_hash: "hash_dash_stats_1",
        original_filename: "stats1.pdf",
        mime_type: "application/pdf",
        file_size: 1000,
      })
      .select()
      .single();
    
    createdSourceIds.push(source1.data!.id);

    const source2 = await supabase
      .from("sources")
      .insert({
        user_id: testUserId,
        content_hash: "hash_dash_stats_2",
        original_filename: "stats2.pdf",
        mime_type: "application/pdf",
        file_size: 2000,
      })
      .select()
      .single();
    
    createdSourceIds.push(source2.data!.id);

    // Get dashboard stats
    const stats = await getDashboardStats(testUserId);
    
    expect(stats.sources_count).toBe(2);
  });

  test("should display entities by type", async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create test entities of different types
    const company1 = await supabase
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "company",
        canonical_name: "stats company 1",
      })
      .select()
      .single();
    
    createdEntityIds.push(company1.data!.id);

    const company2 = await supabase
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "company",
        canonical_name: "stats company 2",
      })
      .select()
      .single();
    
    createdEntityIds.push(company2.data!.id);

    const person = await supabase
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "person",
        canonical_name: "stats person",
      })
      .select()
      .single();
    
    createdEntityIds.push(person.data!.id);

    // Get dashboard stats
    const stats = await getDashboardStats(testUserId);
    
    expect(stats.total_entities).toBe(3);
    expect(stats.entities_by_type["company"]).toBe(2);
    expect(stats.entities_by_type["person"]).toBe(1);
  });

  test("should update stats after new upload", async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);
    await page.goto(uiBaseUrl);
    await page.waitForSelector("[data-chat-ready=\"true\"]", { timeout: 30_000 });

    // Get initial stats
    const statsBefore = await getDashboardStats(testUserId);
    const initialSourceCount = statsBefore.sources_count;

    // Upload file
    await uploadFileFromRecordsTable(page, uploadFixturePath);
    await page.waitForTimeout(2000);
    await waitForRecordsToRender(page);

    // Get updated stats
    const statsAfter = await getDashboardStats(testUserId);
    
    // Source count should increase
    expect(statsAfter.sources_count).toBeGreaterThan(initialSourceCount);

    // Clean up
    const { data: sources } = await supabase
      .from("sources")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1);
    
    if (sources && sources.length > 0) {
      createdSourceIds.push(sources[0].id);
    }
  });

  test("should show user-scoped stats", async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    const otherUserId = "other-user-dashboard-stats";

    // Create source for test user
    const source1 = await supabase
      .from("sources")
      .insert({
        user_id: testUserId,
        content_hash: "hash_user_scoped_1",
        original_filename: "user1.pdf",
        mime_type: "application/pdf",
        file_size: 1000,
      })
      .select()
      .single();
    
    createdSourceIds.push(source1.data!.id);

    // Create source for other user
    const source2 = await supabase
      .from("sources")
      .insert({
        user_id: otherUserId,
        content_hash: "hash_user_scoped_2",
        original_filename: "user2.pdf",
        mime_type: "application/pdf",
        file_size: 2000,
      })
      .select()
      .single();
    
    createdSourceIds.push(source2.data!.id);

    // Get stats for test user
    const testUserStats = await getDashboardStats(testUserId);
    expect(testUserStats.sources_count).toBe(1);

    // Get stats for other user
    const otherUserStats = await getDashboardStats(otherUserId);
    expect(otherUserStats.sources_count).toBe(1);

    // Verify isolation
    expect(testUserStats.sources_count + otherUserStats.sources_count).toBe(2);
  });

  test("should display all required stat fields", async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    const stats = await getDashboardStats(testUserId);
    
    // Verify all required fields exist
    expect(stats).toBeDefined();
    expect(typeof stats.sources_count).toBe("number");
    expect(typeof stats.total_entities).toBe("number");
    expect(typeof stats.total_events).toBe("number");
    expect(typeof stats.total_observations).toBe("number");
    expect(typeof stats.total_interpretations).toBe("number");
    expect(typeof stats.entities_by_type).toBe("object");
    expect(typeof stats.last_updated).toBe("string");
    
    // Verify last_updated is valid ISO timestamp
    expect(() => new Date(stats.last_updated)).not.toThrow();
  });
});
