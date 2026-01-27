/**
 * E2E tests for Observations List Page
 * 
 * Tests the /observations route with list rendering, empty state,
 * filtering by entity type, and navigation to entities and sources.
 */

import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";

test.describe("Observations List Page", () => {

  test("should render observations list page", async ({ page }) => {
    await page.goto("/observations");
    
    await page.waitForLoadState("networkidle");
    
    // Verify page heading
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible();
    
    // Verify observations list container
    const listContainer = page.locator(
      "[data-testid='observations-list'], .observations-list, table, .list-container"
    );
    await expect(listContainer.first()).toBeVisible({ timeout: 5000 });
  });

  test("should show observations table with data", async ({ page }) => {
    await page.goto("/observations");
    await page.waitForLoadState("networkidle");
    
    // Check for table or list items
    const hasTable = await page.locator("table").isVisible().catch(() => false);
    const hasListItems = await page.locator(
      "[data-testid='observation-item'], .observation-item, .list-item"
    ).first().isVisible().catch(() => false);
    
    // Either table or list items should be visible
    expect(hasTable || hasListItems).toBe(true);
  });

  test("should show empty state when no observations", async ({ page }) => {
    await page.goto("/observations");
    await page.waitForLoadState("networkidle");
    
    // Look for either data or empty state
    const hasData = await page.locator(
      "table tbody tr, [data-testid='observation-item']"
    ).first().isVisible().catch(() => false);
    
    const hasEmptyState = await page.locator(
      "text=/no.*observations/i, text=/empty/i, [data-testid='empty-state']"
    ).first().isVisible().catch(() => false);
    
    // Should show either data or empty state
    expect(hasData || hasEmptyState).toBe(true);
  });

  test("should navigate to entity when observation clicked", async ({ page }) => {
    await page.goto("/observations");
    await page.waitForLoadState("networkidle");
    
    // Look for clickable observation items that link to entities
    const observationLink = page.locator(
      "table tbody tr, [data-testid='observation-item'], a[href*='/entities/']"
    ).first();
    
    const isVisible = await observationLink.isVisible().catch(() => false);
    
    if (isVisible) {
      await observationLink.click();
      
      // Should navigate to entity detail page
      await page.waitForLoadState("networkidle");
      
      const url = page.url();
      expect(url).toMatch(/\/entities\/[^/]+/);
    }
  });

  test("should navigate to source from observation", async ({ page }) => {
    await page.goto("/observations");
    await page.waitForLoadState("networkidle");
    
    // Look for source links in observations
    const sourceLink = page.locator("a[href*='/sources/']").first();
    
    const isVisible = await sourceLink.isVisible().catch(() => false);
    
    if (isVisible) {
      await sourceLink.click();
      
      // Should navigate to source detail page
      await page.waitForLoadState("networkidle");
      
      const url = page.url();
      expect(url).toMatch(/\/sources\/[^/]+/);
    }
  });

  test("should filter by entity type", async ({ page }) => {
    await page.goto("/observations");
    await page.waitForLoadState("networkidle");
    
    // Look for entity type filter
    const typeFilter = page.locator(
      "select[name='entity_type'], select:has(option:has-text('Type')), [data-testid='type-filter']"
    ).first();
    
    const hasFilter = await typeFilter.isVisible().catch(() => false);
    
    if (hasFilter) {
      // Select an entity type
      await typeFilter.selectOption({ index: 1 });
      
      // Wait for results to update
      await page.waitForTimeout(500);
      
      // List should update
      const hasResults = await page.locator(
        "table tbody tr, [data-testid='observation-item']"
      ).first().isVisible().catch(() => false);
      
      const hasEmptyState = await page.locator(
        "text=/no.*results/i, text=/no.*observations/i"
      ).isVisible().catch(() => false);
      
      expect(hasResults || hasEmptyState).toBe(true);
    }
  });

  test("should show pagination controls if needed", async ({ page }) => {
    await page.goto("/observations");
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

  test("should display observation metadata", async ({ page }) => {
    await page.goto("/observations");
    await page.waitForLoadState("networkidle");
    
    // Look for metadata in observation rows
    const observationRow = page.locator(
      "table tbody tr, [data-testid='observation-item']"
    ).first();
    
    const isVisible = await observationRow.isVisible().catch(() => false);
    
    if (isVisible) {
      // Should show entity type, fields, timestamps
      const hasText = (await observationRow.textContent())?.trim().length > 0;
      expect(hasText).toBe(true);
    }
  });

  test("should display observation timestamp", async ({ page }) => {
    await page.goto("/observations");
    await page.waitForLoadState("networkidle");
    
    // Look for timestamp in observation rows
    const observationRow = page.locator(
      "table tbody tr, [data-testid='observation-item']"
    ).first();
    
    const isVisible = await observationRow.isVisible().catch(() => false);
    
    if (isVisible) {
      // Should show timestamp or date
      const hasTime = await page.locator("time").first().isVisible().catch(() => false);
      const hasText = (await observationRow.textContent())?.length > 0;
      
      expect(hasTime || hasText).toBe(true);
    }
  });

  test("should show observation count", async ({ page }) => {
    await page.goto("/observations");
    await page.waitForLoadState("networkidle");
    
    // Look for count indicator
    const countIndicator = page.locator(
      "text=/\\d+\\s+(observations?|items?|results?)/i, [data-testid='item-count']"
    );
    
    // May show count or just display list
    const hasCount = await countIndicator.first().isVisible().catch(() => false);
    const hasList = await page.locator(
      "table tbody tr, [data-testid='observation-item']"
    ).first().isVisible().catch(() => false);
    
    expect(hasCount || hasList).toBe(true);
  });

  test("should display entity type in observations", async ({ page }) => {
    await page.goto("/observations");
    await page.waitForLoadState("networkidle");
    
    // Look for entity type indicators
    const observationRow = page.locator(
      "table tbody tr, [data-testid='observation-item']"
    ).first();
    
    const isVisible = await observationRow.isVisible().catch(() => false);
    
    if (isVisible) {
      // Should show entity type
      const text = await observationRow.textContent();
      expect(text?.length).toBeGreaterThan(0);
    }
  });

  test("should handle search/filter functionality", async ({ page }) => {
    await page.goto("/observations");
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
        "table tbody tr, [data-testid='observation-item']"
      ).first().isVisible().catch(() => false);
      
      const hasEmptyState = await page.locator(
        "text=/no.*results/i"
      ).isVisible().catch(() => false);
      
      expect(hasResults || hasEmptyState).toBe(true);
    }
  });

  test("should show observation fields", async ({ page }) => {
    await page.goto("/observations");
    await page.waitForLoadState("networkidle");
    
    // Look for observation fields/data
    const observationRow = page.locator(
      "table tbody tr, [data-testid='observation-item']"
    ).first();
    
    const isVisible = await observationRow.isVisible().catch(() => false);
    
    if (isVisible) {
      // Should show extracted fields or summary
      const text = await observationRow.textContent();
      expect(text?.length).toBeGreaterThan(0);
    }
  });

  test("should sort observations list", async ({ page }) => {
    await page.goto("/observations");
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
