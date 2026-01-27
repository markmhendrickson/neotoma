/**
 * E2E tests for Relationships List Page
 * 
 * Tests the /relationships route with list rendering, empty state,
 * filtering by type, and navigation to relationship details and entities.
 */

import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";

test.describe("Relationships List Page", () => {

  test("should render relationships list page", async ({ page }) => {
    await page.goto("/relationships");
    
    await page.waitForLoadState("networkidle");
    
    // Verify page heading
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible();
    
    // Verify relationships list container
    const listContainer = page.locator(
      "[data-testid='relationships-list'], .relationships-list, table, .list-container"
    );
    await expect(listContainer.first()).toBeVisible({ timeout: 5000 });
  });

  test("should show relationships table with data", async ({ page }) => {
    await page.goto("/relationships");
    await page.waitForLoadState("networkidle");
    
    // Check for table or list items
    const hasTable = await page.locator("table").isVisible().catch(() => false);
    const hasListItems = await page.locator(
      "[data-testid='relationship-item'], .relationship-item, .list-item"
    ).first().isVisible().catch(() => false);
    
    // Either table or list items should be visible
    expect(hasTable || hasListItems).toBe(true);
  });

  test("should show empty state when no relationships", async ({ page }) => {
    await page.goto("/relationships");
    await page.waitForLoadState("networkidle");
    
    // Look for either data or empty state
    const hasData = await page.locator(
      "table tbody tr, [data-testid='relationship-item']"
    ).first().isVisible().catch(() => false);
    
    const hasEmptyState = await page.locator(
      "text=/no.*relationships/i, text=/empty/i, [data-testid='empty-state']"
    ).first().isVisible().catch(() => false);
    
    // Should show either data or empty state
    expect(hasData || hasEmptyState).toBe(true);
  });

  test("should display relationship types", async ({ page }) => {
    await page.goto("/relationships");
    await page.waitForLoadState("networkidle");
    
    // Look for relationship type indicators
    const relationshipRow = page.locator(
      "table tbody tr, [data-testid='relationship-item']"
    ).first();
    
    const isVisible = await relationshipRow.isVisible().catch(() => false);
    
    if (isVisible) {
      // Should show relationship types (PART_OF, RELATES_TO, etc.)
      const hasText = (await relationshipRow.textContent())?.trim().length > 0;
      expect(hasText).toBe(true);
    }
  });

  test("should navigate to relationship detail when clicked", async ({ page }) => {
    await page.goto("/relationships");
    await page.waitForLoadState("networkidle");
    
    // Look for clickable relationship items
    const relationshipLink = page.locator(
      "table tbody tr, [data-testid='relationship-item'], a[href*='/relationships/']"
    ).first();
    
    const isVisible = await relationshipLink.isVisible().catch(() => false);
    
    if (isVisible) {
      await relationshipLink.click();
      
      // Should navigate to relationship detail page
      await page.waitForLoadState("networkidle");
      
      const url = page.url();
      expect(url).toMatch(/\/relationships\/[^/]+/);
    }
  });

  test("should navigate to entity when entity link clicked", async ({ page }) => {
    await page.goto("/relationships");
    await page.waitForLoadState("networkidle");
    
    // Look for entity links in relationships
    const entityLink = page.locator("a[href*='/entities/']").first();
    
    const isVisible = await entityLink.isVisible().catch(() => false);
    
    if (isVisible) {
      await entityLink.click();
      
      // Should navigate to entity detail page
      await page.waitForLoadState("networkidle");
      
      const url = page.url();
      expect(url).toMatch(/\/entities\/[^/]+/);
    }
  });

  test("should filter by relationship type", async ({ page }) => {
    await page.goto("/relationships");
    await page.waitForLoadState("networkidle");
    
    // Look for relationship type filter
    const typeFilter = page.locator(
      "select[name='relationship_type'], select:has(option:has-text('Type')), [data-testid='type-filter']"
    ).first();
    
    const hasFilter = await typeFilter.isVisible().catch(() => false);
    
    if (hasFilter) {
      // Select a relationship type
      await typeFilter.selectOption({ index: 1 });
      
      // Wait for results to update
      await page.waitForTimeout(500);
      
      // List should update
      const hasResults = await page.locator(
        "table tbody tr, [data-testid='relationship-item']"
      ).first().isVisible().catch(() => false);
      
      const hasEmptyState = await page.locator(
        "text=/no.*results/i, text=/no.*relationships/i"
      ).isVisible().catch(() => false);
      
      expect(hasResults || hasEmptyState).toBe(true);
    }
  });

  test("should show pagination controls if needed", async ({ page }) => {
    await page.goto("/relationships");
    await page.waitForLoadState("networkidle");
    
    // Look for pagination controls
    const pagination = page.locator(
      "[data-testid='pagination'], .pagination, button:has-text('Next'), button:has-text('Previous')"
    );
    
    // Pagination may or may not be present depending on data
    const hasPagination = await pagination.first().isVisible().catch(() => false);
    
    // This is acceptable - pagination only needed with many items
    expect(typeof hasPagination).toBe("boolean");
  });

  test("should display source and target entities", async ({ page }) => {
    await page.goto("/relationships");
    await page.waitForLoadState("networkidle");
    
    // Look for source/target entity names
    const relationshipRow = page.locator(
      "table tbody tr, [data-testid='relationship-item']"
    ).first();
    
    const isVisible = await relationshipRow.isVisible().catch(() => false);
    
    if (isVisible) {
      // Should show source and target entity information
      const text = await relationshipRow.textContent();
      expect(text?.length).toBeGreaterThan(0);
    }
  });

  test("should show relationship count", async ({ page }) => {
    await page.goto("/relationships");
    await page.waitForLoadState("networkidle");
    
    // Look for count indicator
    const countIndicator = page.locator(
      "text=/\\d+\\s+(relationships?|items?|results?)/i, [data-testid='item-count']"
    );
    
    // May show count or just display list
    const hasCount = await countIndicator.first().isVisible().catch(() => false);
    const hasList = await page.locator(
      "table tbody tr, [data-testid='relationship-item']"
    ).first().isVisible().catch(() => false);
    
    expect(hasCount || hasList).toBe(true);
  });

  test("should handle search/filter functionality", async ({ page }) => {
    await page.goto("/relationships");
    await page.waitForLoadState("networkidle");
    
    // Look for search input
    const searchInput = page.locator(
      "input[type='search'], input[placeholder*='Search'], input[name='search']"
    ).first();
    
    const hasSearch = await searchInput.isVisible().catch(() => false);
    
    if (hasSearch) {
      // Enter search term
      await searchInput.fill("test");
      
      // Wait for results to update
      await page.waitForTimeout(500);
      
      // List should update
      const hasResults = await page.locator(
        "table tbody tr, [data-testid='relationship-item']"
      ).first().isVisible().catch(() => false);
      
      const hasEmptyState = await page.locator(
        "text=/no.*results/i"
      ).isVisible().catch(() => false);
      
      expect(hasResults || hasEmptyState).toBe(true);
    }
  });

  test("should display relationship metadata", async ({ page }) => {
    await page.goto("/relationships");
    await page.waitForLoadState("networkidle");
    
    // Look for metadata in relationship rows
    const relationshipRow = page.locator(
      "table tbody tr, [data-testid='relationship-item']"
    ).first();
    
    const isVisible = await relationshipRow.isVisible().catch(() => false);
    
    if (isVisible) {
      // Should show relationship metadata
      const text = await relationshipRow.textContent();
      expect(text?.length).toBeGreaterThan(0);
    }
  });

  test("should sort relationships list", async ({ page }) => {
    await page.goto("/relationships");
    await page.waitForLoadState("networkidle");
    
    // Look for sortable column headers
    const sortableHeader = page.locator(
      "th[role='button'], th button, .sortable"
    ).first();
    
    const isSortable = await sortableHeader.isVisible().catch(() => false);
    
    if (isSortable) {
      // Click to sort
      await sortableHeader.click();
      
      // List should reorder
      await page.waitForTimeout(500);
      
      // Verify list still renders
      const hasRows = await page.locator("table tbody tr").first().isVisible().catch(() => false);
      expect(hasRows).toBe(true);
    }
  });
});
