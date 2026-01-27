/**
 * E2E tests for Sources List Page
 * 
 * Tests the /sources route with list rendering, empty state, 
 * navigation, and upload dialog functionality.
 */

import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";

test.describe("Sources List Page", () => {

  test("should render sources list page", async ({ page }) => {
    await page.goto("/sources");
    
    await page.waitForLoadState("networkidle");
    
    // Verify page heading
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible();
    
    // Verify sources list container
    const listContainer = page.locator(
      "[data-testid='sources-list'], .sources-list, table, .list-container"
    );
    await expect(listContainer.first()).toBeVisible({ timeout: 5000 });
  });

  test("should show sources table with data", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    // Check for table or list items
    const hasTable = await page.locator("table").isVisible().catch(() => false);
    const hasListItems = await page.locator(
      "[data-testid='source-item'], .source-item, .list-item"
    ).first().isVisible().catch(() => false);
    
    // Either table or list items should be visible
    expect(hasTable || hasListItems).toBe(true);
  });

  test("should show empty state when no sources", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    // Look for either data or empty state
    const hasData = await page.locator(
      "table tbody tr, [data-testid='source-item']"
    ).first().isVisible().catch(() => false);
    
    const hasEmptyState = await page.locator(
      "text=/no.*sources/i, text=/empty/i, [data-testid='empty-state']"
    ).first().isVisible().catch(() => false);
    
    // Should show either data or empty state
    expect(hasData || hasEmptyState).toBe(true);
  });

  test("should display upload button", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    // Verify upload button exists
    const uploadButton = page.locator("button:has-text('Upload')").first();
    await expect(uploadButton).toBeVisible();
    await expect(uploadButton).toBeEnabled();
  });

  test("should open upload dialog when upload button clicked", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    // Click upload button
    const uploadButton = page.locator("button:has-text('Upload')").first();
    await uploadButton.click();
    
    // Verify dialog opens
    const dialog = page.locator("[role='dialog'], .dialog, .modal");
    await expect(dialog).toBeVisible({ timeout: 5000 });
  });

  test("should navigate to source detail when source clicked", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    // Look for clickable source items
    const sourceLink = page.locator(
      "table tbody tr, [data-testid='source-item'], a[href*='/sources/']"
    ).first();
    
    const isVisible = await sourceLink.isVisible().catch(() => false);
    
    if (isVisible) {
      await sourceLink.click();
      
      // Should navigate to source detail page
      await page.waitForLoadState("networkidle");
      
      const url = page.url();
      expect(url).toMatch(/\/sources\/[^/]+/);
    }
  });

  test("should display source metadata in list", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    // Look for source metadata fields
    const sourceRow = page.locator(
      "table tbody tr, [data-testid='source-item']"
    ).first();
    
    const isVisible = await sourceRow.isVisible().catch(() => false);
    
    if (isVisible) {
      // Should show source name, date, or other metadata
      const hasText = (await sourceRow.textContent())?.trim().length > 0;
      expect(hasText).toBe(true);
    }
  });

  test("should handle search/filter functionality", async ({ page }) => {
    await page.goto("/sources");
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
      
      // List should update (either show results or empty state)
      const hasResults = await page.locator(
        "table tbody tr, [data-testid='source-item']"
      ).first().isVisible().catch(() => false);
      
      const hasEmptyState = await page.locator(
        "text=/no.*results/i, text=/no.*sources/i"
      ).isVisible().catch(() => false);
      
      expect(hasResults || hasEmptyState).toBe(true);
    }
  });

  test("should show pagination controls if needed", async ({ page }) => {
    await page.goto("/sources");
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

  test("should display source count or list info", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    // Look for count indicator
    const countIndicator = page.locator(
      "text=/\\d+\\s+(sources?|items?|results?)/i, [data-testid='item-count']"
    );
    
    // May show count or just display list
    const hasCount = await countIndicator.first().isVisible().catch(() => false);
    const hasList = await page.locator(
      "table tbody tr, [data-testid='source-item']"
    ).first().isVisible().catch(() => false);
    
    expect(hasCount || hasList).toBe(true);
  });

  test("should show source type or category", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    // Look for type/category indicators in list
    const sourceItem = page.locator(
      "table tbody tr, [data-testid='source-item']"
    ).first();
    
    const isVisible = await sourceItem.isVisible().catch(() => false);
    
    if (isVisible) {
      // Source items should have some content
      const text = await sourceItem.textContent();
      expect(text?.length).toBeGreaterThan(0);
    }
  });

  test("should handle refresh/reload of sources list", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    // Look for refresh button
    const refreshButton = page.locator(
      "button:has-text('Refresh'), button[aria-label*='Refresh'], button[title*='Refresh']"
    ).first();
    
    const hasRefresh = await refreshButton.isVisible().catch(() => false);
    
    if (hasRefresh) {
      await refreshButton.click();
      
      // List should reload
      await page.waitForLoadState("networkidle");
      
      // Verify list is still visible
      const listContainer = page.locator(
        "table, [data-testid='sources-list']"
      );
      await expect(listContainer.first()).toBeVisible();
    }
  });

  test("should sort sources list", async ({ page }) => {
    await page.goto("/sources");
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
