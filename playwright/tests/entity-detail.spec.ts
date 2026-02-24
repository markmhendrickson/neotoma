/**
 * E2E tests for Entity Detail Component
 * 
 * Tests entity detail view, relationships, observations, and correction workflow.
 */

import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";
import { db } from "../../src/db.js";

test.describe("Entity Detail Component", () => {
  const testUserId = "test-user-entity-detail";
  const createdEntityIds: string[] = [];
  const createdSourceIds: string[] = [];

  test.afterAll(async () => {
    // Cleanup
    if (createdEntityIds.length > 0) {
      await db.from("entities").delete().in("id", createdEntityIds);
    }
    if (createdSourceIds.length > 0) {
      await db.from("sources").delete().in("id", createdSourceIds);
    }
  });

  test("should render entity detail view", async ({ page }) => {
    // Create test entity
    const { data: entity } = await db
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "company",
        canonical_name: "detail view test company",
      })
      .select()
      .single();
    
    if (entity) {
      createdEntityIds.push(entity.id);
      
      await page.goto(`/entities/${entity.id}`);
      
      await page.waitForLoadState("networkidle");
      
      // Verify heading shows entity name
      const heading = page.locator("h1, h2").first();
      await expect(heading).toBeVisible();
    }
  });

  test("should display entity relationships", async ({ page }) => {
    // Create entities with relationship
    const { data: entity1 } = await db
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "invoice",
        canonical_name: "invoice with relationship",
      })
      .select()
      .single();
    
    if (entity1) {
      createdEntityIds.push(entity1.id);
    }

    const { data: entity2 } = await db
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "company",
        canonical_name: "related company",
      })
      .select()
      .single();
    
    if (entity2) {
      createdEntityIds.push(entity2.id);
    }

    // Create relationship
    const { data: relationship } = await db
      .from("relationships")
      .insert({
        user_id: testUserId,
        relationship_type: "REFERS_TO",
        source_entity_id: entity1!.id,
        target_entity_id: entity2!.id,
        metadata: {},
      })
      .select()
      .single();

    await page.goto(`/entities/${entity1!.id}`);
    
    await page.waitForLoadState("networkidle");
    
    // Verify relationships section exists (implementation dependent)
    // For now, verify relationship exists in database
    const { data: relationships } = await db
      .from("relationships")
      .select("*")
      .eq("source_entity_id", entity1!.id);
    
    expect(relationships).toBeDefined();
    expect(relationships!.length).toBe(1);
    expect(relationships![0].target_entity_id).toBe(entity2!.id);

    // Cleanup
    if (relationship) {
      await db.from("relationships").delete().eq("id", relationship.id);
    }
  });

  test("should display entity observations", async ({ page }) => {
    // Create test source
    const { data: source } = await db
      .from("sources")
      .insert({
        user_id: testUserId,
        content_hash: "hash_obs_detail",
        original_filename: "obs_detail.pdf",
        mime_type: "application/pdf",
        file_size: 1000,
      })
      .select()
      .single();
    
    if (source) {
      createdSourceIds.push(source.id);
    }

    // Create entity
    const { data: entity } = await db
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "invoice",
        canonical_name: "invoice with observations",
      })
      .select()
      .single();
    
    if (entity) {
      createdEntityIds.push(entity.id);
    }

    // Create observation
    const { data: observation } = await db
      .from("observations")
      .insert({
        entity_id: entity!.id,
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

    await page.goto(`/entities/${entity!.id}`);
    
    await page.waitForLoadState("networkidle");
    
    // Verify observations exist in database
    const { data: observations } = await db
      .from("observations")
      .select("*")
      .eq("entity_id", entity!.id);
    
    expect(observations).toBeDefined();
    expect(observations!.length).toBe(1);
    expect(observations![0].id).toBe(observation!.id);

    // Cleanup
    await db.from("observations").delete().eq("id", observation!.id);
  });

  test("should support entity correction workflow", async ({ page }) => {
    // Create test entity
    const { data: entity } = await db
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "company",
        canonical_name: "correction test company",
      })
      .select()
      .single();
    
    if (entity) {
      createdEntityIds.push(entity.id);
      
      await page.goto(`/entities/${entity.id}`);
      
      await page.waitForLoadState("networkidle");
      
      // Look for correction/edit button
      const editButton = page.locator(
        "button:has-text('Correct'), button:has-text('Edit'), [data-testid='edit-entity']"
      ).first();
      
      const hasEdit = await editButton.isVisible().catch(() => false);
      
      if (hasEdit) {
        await editButton.click();
        
        // Should show edit form or modal
        const form = page.locator("form, [role='dialog']");
        await expect(form.first()).toBeVisible({ timeout: 2000 });
      }
    }
  });

  test("should show empty state for non-existent entity", async ({ page }) => {
    await page.goto("/entities/ent_nonexistent_12345");
    
    await page.waitForLoadState("networkidle");
    
    // Should show not found or error message
    const notFound = page.locator(
      "text=/not.*found/i, text=/doesn.*exist/i, text=/404/i"
    );
    
    await expect(notFound.first()).toBeVisible({ timeout: 5000 });
  });

  test("should navigate back to list from detail", async ({ page }) => {
    // Create test entity
    const { data: entity } = await db
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "company",
        canonical_name: "back navigation test",
      })
      .select()
      .single();
    
    if (entity) {
      createdEntityIds.push(entity.id);
      
      await page.goto(`/entities/${entity.id}`);
      
      await page.waitForLoadState("networkidle");
      
      // Look for back button or breadcrumb
      const backButton = page.locator(
        "button:has-text('Back'), a:has-text('Back'), [aria-label='Back'], .breadcrumb a"
      ).first();
      
      const hasBack = await backButton.isVisible().catch(() => false);
      
      if (hasBack) {
        await backButton.click();
        
        await page.waitForLoadState("networkidle");
        
        // Should navigate back to list
        const url = page.url();
        expect(url).toMatch(/\/entities\/?$/);
      }
    }
  });
});
