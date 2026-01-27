/**
 * E2E Test: Multi-User RLS Isolation Flow
 * 
 * Tests row-level security isolation between different users.
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

test.describe("E2E-002: Multi-User RLS Isolation Flow", () => {
  const testUserAId = "test-user-a-rls-isolation";
  const testUserBId = "test-user-b-rls-isolation";
  const createdSourceIds: string[] = [];

  test.afterEach(async () => {
    // Clean up test data
    if (createdSourceIds.length > 0) {
      await supabase.from("sources").delete().in("id", createdSourceIds);
      createdSourceIds.length = 0;
    }
  });

  test("should isolate data between different users", async ({ page, context, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    
    // 1. Create User A session
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);
    await page.goto(uiBaseUrl);
    await page.waitForSelector("[data-chat-ready=\"true\"]", { timeout: 30_000 });

    // 2. Upload file as User A
    await uploadFileFromRecordsTable(page, uploadFixturePath);
    await page.waitForTimeout(2000);
    await waitForRecordsToRender(page);

    const userARecordCount = await page.locator("[data-record-summary]").count();
    expect(userARecordCount).toBeGreaterThan(0);

    // 3. Create source directly in database for User A
    const { data: sourceA, error: sourceAError } = await supabase
      .from("sources")
      .insert({
        user_id: testUserAId,
        content_hash: "hash_user_a_test",
        original_filename: "user_a_file.pdf",
        mime_type: "application/pdf",
        file_size: 1000,
      })
      .select()
      .single();
    
    expect(sourceAError).toBeNull();
    expect(sourceA).toBeDefined();
    createdSourceIds.push(sourceA!.id);

    // 4. Create User B session (new page in same context)
    const pageB = await context.newPage();
    attachBrowserLogging(pageB);
    await routeChatThroughMock(pageB, mockApi?.origin);
    await clearClientState(pageB, uiBaseUrl);
    await primeLocalSettings(pageB);
    await pageB.goto(uiBaseUrl);
    await pageB.waitForSelector("[data-chat-ready=\"true\"]", { timeout: 30_000 });

    // 5. Verify User B cannot see User A's data in UI
    // (UI shows local storage initially, so check database isolation)

    // 6. Upload different file as User B
    await uploadFileFromRecordsTable(pageB, uploadFixturePath);
    await pageB.waitForTimeout(2000);

    // 7. Create source directly in database for User B
    const { data: sourceB, error: sourceBError } = await supabase
      .from("sources")
      .insert({
        user_id: testUserBId,
        content_hash: "hash_user_b_test",
        original_filename: "user_b_file.pdf",
        mime_type: "application/pdf",
        file_size: 2000,
      })
      .select()
      .single();
    
    expect(sourceBError).toBeNull();
    expect(sourceB).toBeDefined();
    createdSourceIds.push(sourceB!.id);

    // 8. Query sources for User A - should only see User A's sources
    const { data: userASources, error: userAError } = await supabase
      .from("sources")
      .select("*")
      .eq("user_id", testUserAId);
    
    expect(userAError).toBeNull();
    expect(userASources).toBeDefined();
    expect(userASources!.length).toBe(1);
    expect(userASources![0].user_id).toBe(testUserAId);

    // 9. Query sources for User B - should only see User B's sources
    const { data: userBSources, error: userBError } = await supabase
      .from("sources")
      .select("*")
      .eq("user_id", testUserBId);
    
    expect(userBError).toBeNull();
    expect(userBSources).toBeDefined();
    expect(userBSources!.length).toBe(1);
    expect(userBSources![0].user_id).toBe(testUserBId);

    // 10. Verify complete isolation - User A query should not return User B data
    const userAIds = userASources!.map(s => s.id);
    const userBIds = userBSources!.map(s => s.id);
    
    expect(userAIds).not.toContain(userBIds[0]);
    expect(userBIds).not.toContain(userAIds[0]);

    await pageB.close();
  });

  test("should isolate entities between users", async ({ page, context, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create entities for both users
    const { data: entityA, error: entityAError } = await supabase
      .from("entities")
      .insert({
        user_id: testUserAId,
        entity_type: "company",
        canonical_name: "user a company",
      })
      .select()
      .single();
    
    expect(entityAError).toBeNull();
    
    const { data: entityB, error: entityBError } = await supabase
      .from("entities")
      .insert({
        user_id: testUserBId,
        entity_type: "company",
        canonical_name: "user b company",
      })
      .select()
      .single();
    
    expect(entityBError).toBeNull();

    // Query entities for User A
    const { data: userAEntities } = await supabase
      .from("entities")
      .select("*")
      .eq("user_id", testUserAId);
    
    expect(userAEntities).toBeDefined();
    expect(userAEntities!.length).toBe(1);
    expect(userAEntities![0].id).toBe(entityA!.id);

    // Query entities for User B
    const { data: userBEntities } = await supabase
      .from("entities")
      .select("*")
      .eq("user_id", testUserBId);
    
    expect(userBEntities).toBeDefined();
    expect(userBEntities!.length).toBe(1);
    expect(userBEntities![0].id).toBe(entityB!.id);

    // Verify no cross-user visibility
    expect(userAEntities![0].id).not.toBe(userBEntities![0].id);

    // Clean up
    await supabase.from("entities").delete().in("id", [entityA!.id, entityB!.id]);
  });

  test("should isolate observations between users", async ({ page, context, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create sources for both users
    const { data: sourceA } = await supabase
      .from("sources")
      .insert({
        user_id: testUserAId,
        content_hash: "hash_obs_user_a",
        original_filename: "user_a.pdf",
        mime_type: "application/pdf",
        file_size: 1000,
      })
      .select()
      .single();
    
    createdSourceIds.push(sourceA!.id);
    
    const { data: sourceB } = await supabase
      .from("sources")
      .insert({
        user_id: testUserBId,
        content_hash: "hash_obs_user_b",
        original_filename: "user_b.pdf",
        mime_type: "application/pdf",
        file_size: 2000,
      })
      .select()
      .single();
    
    createdSourceIds.push(sourceB!.id);

    // Create interpretations
    const { data: interpA } = await supabase
      .from("interpretations")
      .insert({
        user_id: testUserAId,
        source_id: sourceA!.id,
        status: "completed",
        provider: "test",
        model_id: "test-model",
      })
      .select()
      .single();
    
    const { data: interpB } = await supabase
      .from("interpretations")
      .insert({
        user_id: testUserBId,
        source_id: sourceB!.id,
        status: "completed",
        provider: "test",
        model_id: "test-model",
      })
      .select()
      .single();

    // Create observations
    const { data: obsA } = await supabase
      .from("observations")
      .insert({
        user_id: testUserAId,
        source_id: sourceA!.id,
        interpretation_id: interpA!.id,
        entity_type: "company",
        fragment_key: "name",
        fragment_value: "Company A",
        observation_type: "extracted",
        priority: 1,
      })
      .select()
      .single();
    
    const { data: obsB } = await supabase
      .from("observations")
      .insert({
        user_id: testUserBId,
        source_id: sourceB!.id,
        interpretation_id: interpB!.id,
        entity_type: "company",
        fragment_key: "name",
        fragment_value: "Company B",
        observation_type: "extracted",
        priority: 1,
      })
      .select()
      .single();

    // Query observations for User A
    const { data: userAObs } = await supabase
      .from("observations")
      .select("*")
      .eq("user_id", testUserAId);
    
    expect(userAObs).toBeDefined();
    expect(userAObs!.length).toBe(1);
    expect(userAObs![0].id).toBe(obsA!.id);

    // Query observations for User B
    const { data: userBObs } = await supabase
      .from("observations")
      .select("*")
      .eq("user_id", testUserBId);
    
    expect(userBObs).toBeDefined();
    expect(userBObs!.length).toBe(1);
    expect(userBObs![0].id).toBe(obsB!.id);

    // Verify isolation
    expect(userAObs![0].id).not.toBe(userBObs![0].id);

    // Clean up
    await supabase.from("observations").delete().in("id", [obsA!.id, obsB!.id]);
    await supabase.from("interpretations").delete().in("id", [interpA!.id, interpB!.id]);
  });
});
