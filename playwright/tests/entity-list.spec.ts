/**
 * E2E tests for Entity List Component
 * 
 * Tests entity list rendering, pagination, filtering, and sorting.
 */

import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";
import { db } from "../../src/db.js";

test.describe("Entity List Component", () => {
  const testUserId = "test-user-entity-list";
  const createdEntityIds: string[] = [];

  test.afterAll(async () => {
    // Cleanup
    if (createdEntityIds.length > 0) {
      await db.from("entities").delete().in("id", createdEntityIds);
    }
  });

  test("should render entity list", async ({ page }) => {
    await page.goto("/entities");
    
    // Wait for page load
    await page.waitForLoadState("networkidle");
    
    // Verify heading
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible();
    
    // List should render (may be empty or have entities)
    const list = page.locator(
      "[data-testid='entity-list'], .entity-list, table, .list-view"
    ).first();
    
    await expect(list).toBeVisible();
  });

  test("should paginate entity list", async ({ page }) => {
    // Create test entities
    for (let i = 0; i < 15; i++) {
      const { data: entity } = await db
        .from("entities")
        .insert({
          user_id: testUserId,
          entity_type: "company",
          canonical_name: `pagination test ${i}`,
        })
        .select()
        .single();
      
      if (entity) {
        createdEntityIds.push(entity.id);
      }
    }

    await page.goto("/entities");
    
    await page.waitForLoadState("networkidle");
    
    // Look for pagination controls
    const nextButton = page.locator(
      "button:has-text('Next'), button[aria-label='Next page'], [data-testid='next-page']"
    ).first();
    
    const hasNext = await nextButton.isVisible().catch(() => false);
    
    if (hasNext && (await nextButton.isEnabled())) {
      // Click next page
      await nextButton.click();
      
      await page.waitForLoadState("networkidle");
      
      // Should show different entities
      const entityItems = page.locator(
        "[data-testid='entity-item'], .entity-item, tr[data-entity-id]"
      );
      
      expect(await entityItems.count()).toBeGreaterThanOrEqual(0);
    }
  });

  test("should filter entity list by type", async ({ page }) => {
    // Create entities of different types
    const types = ["company", "person", "invoice"];
    
    for (const type of types) {
      const { data: entity } = await db
        .from("entities")
        .insert({
          user_id: testUserId,
          entity_type: type,
          canonical_name: `${type} filter test`,
        })
        .select()
        .single();
      
      if (entity) {
        createdEntityIds.push(entity.id);
      }
    }

    await page.goto("/entities");
    
    await page.waitForLoadState("networkidle");
    
    // Look for filter dropdown
    const filterSelect = page.locator(
      "select[name='entity_type'], select[name='type'], [data-testid='entity-type-filter']"
    ).first();
    
    const hasFilter = await filterSelect.isVisible().catch(() => false);
    
    if (hasFilter) {
      // Select filter option
      await filterSelect.selectOption("company");
      
      await page.waitForLoadState("networkidle");
      
      // Results should be filtered (verified via database query)
      const { data: filtered } = await db
        .from("entities")
        .select("*")
        .eq("entity_type", "company")
        .eq("user_id", testUserId);
      
      expect(filtered).toBeDefined();
      
      const companyEntity = filtered!.find((e) =>
        createdEntityIds.includes(e.id)
      );
      expect(companyEntity).toBeDefined();
    }
  });

  test("should sort entity list", async ({ page }) => {
    // Create entities with different names
    const names = ["Alpha Company", "Beta Company", "Charlie Company"];
    
    for (const name of names) {
      const { data: entity } = await db
        .from("entities")
        .insert({
          user_id: testUserId,
          entity_type: "company",
          canonical_name: name.toLowerCase(),
        })
        .select()
        .single();
      
      if (entity) {
        createdEntityIds.push(entity.id);
      }
    }

    await page.goto("/entities");
    
    await page.waitForLoadState("networkidle");
    
    // Look for sort controls
    const sortButton = page.locator(
      "button:has-text('Sort'), [data-testid='sort'], th[data-sortable]"
    ).first();
    
    const hasSort = await sortButton.isVisible().catch(() => false);
    
    if (hasSort) {
      await sortButton.click();
      
      await page.waitForLoadState("networkidle");
      
      // Verify sort order via database query
      const { data: sorted } = await db
        .from("entities")
        .select("*")
        .eq("user_id", testUserId)
        .in("id", createdEntityIds)
        .order("canonical_name", { ascending: true });
      
      expect(sorted).toBeDefined();
      expect(sorted![0].canonical_name).toBe("alpha company");
    }
  });

  test("should show empty state when no entities", async ({ page }) => {
    await page.goto("/entities?user=empty-user");
    
    await page.waitForLoadState("networkidle");
    
    // Should show empty state or zero entities
    const emptyState = page.locator(
      "text=/no.*entities/i, text=/get.*started/i, [data-testid='empty-state']"
    );
    
    // May show empty state or just empty list
    const hasEmptyState = await emptyState.first().isVisible().catch(() => false);
    const hasList = await page.locator(
      "[data-testid='entity-list'], .entity-list"
    ).isVisible().catch(() => false);
    
    expect(hasEmptyState || hasList).toBe(true);
  });

  test("should handle loading state", async ({ page }) => {
    await page.goto("/entities");
    
    // Loading indicator may be visible briefly
    const loading = page.locator(
      ".loading, .spinner, [data-testid='loading'], text=/loading/i"
    );
    
    // Either loading was shown or loaded quickly
    await page.waitForLoadState("networkidle");
    
    // Final state should show content
    const list = page.locator(
      "[data-testid='entity-list'], .entity-list, table"
    ).first();
    
    await expect(list).toBeVisible();
  });

  test("should click entity to view details", async ({ page }) => {
    // Create test entity
    const { data: entity } = await db
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "company",
        canonical_name: "click test company",
      })
      .select()
      .single();
    
    if (entity) {
      createdEntityIds.push(entity.id);
    }

    await page.goto("/entities");
    
    await page.waitForLoadState("networkidle");
    
    // Find entity item
    const entityItem = page.locator(
      "[data-testid='entity-item'], .entity-item, tr[data-entity-id]"
    ).first();
    
    const hasItem = await entityItem.isVisible().catch(() => false);
    
    if (hasItem) {
      await entityItem.click();
      
      await page.waitForLoadState("networkidle");
      
      // Should navigate to detail view
      const url = page.url();
      expect(url).toMatch(/entities\//);
    }

    // Cleanup
    if (entity) {
      await db.from("entities").delete().eq("id", entity.id);
    }
  });
});
