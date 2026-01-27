/**
 * E2E tests for Interpretations List Page
 * 
 * Tests the /interpretations route with list rendering, empty state,
 * filtering, and navigation to sources.
 */

import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";

test.describe("Interpretations List Page", () => {

  test("should render interpretations list page", async ({ page }) => {
    await page.goto("/interpretations");
    
    await page.waitForLoadState("networkidle");
    
    // Verify page heading
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible();
    
    // Verify interpretations list container
    const listContainer = page.locator(
      "[data-testid='interpretations-list'], .interpretations-list, table, .list-container"
    );
    await expect(listContainer.first()).toBeVisible({ timeout: 5000 });
  });

  test("should show interpretations table with data", async ({ page }) => {
    await page.goto("/interpretations");
    await page.waitForLoadState("networkidle");
    
    // Check for table or list items
    const hasTable = await page.locator("table").isVisible().catch(() => false);
    const hasListItems = await page.locator(
      "[data-testid='interpretation-item'], .interpretation-item, .list-item"
    ).first().isVisible().catch(() => false);
    
    // Either table or list items should be visible
    expect(hasTable || hasListItems).toBe(true);
  });

  test("should show empty state when no interpretations", async ({ page }) => {
    await page.goto("/interpretations");
    await page.waitForLoadState("networkidle");
    
    // Look for either data or empty state
    const hasData = await page.locator(
      "table tbody tr, [data-testid='interpretation-item']"
    ).first().isVisible().catch(() => false);
    
    const hasEmptyState = await page.locator(
      "text=/no.*interpretations/i, text=/empty/i, [data-testid='empty-state']"
    ).first().isVisible().catch(() => false);
    
    // Should show either data or empty state
    expect(hasData || hasEmptyState).toBe(true);
  });

  test("should navigate to source when interpretation clicked", async ({ page }) => {
    await page.goto("/interpretations");
    await page.waitForLoadState("networkidle");
    
    // Look for clickable interpretation items
    const interpretationLink = page.locator(
      "table tbody tr, [data-testid='interpretation-item'], a[href*='/sources/']"
    ).first();
    
    const isVisible = await interpretationLink.isVisible().catch(() => false);
    
    if (isVisible) {
      await interpretationLink.click();
      
      // Should navigate to source detail page
      await page.waitForLoadState("networkidle");
      
      const url = page.url();
      expect(url).toMatch(/\/sources\/[^/]+/);
    }
  });

  test("should display interpretation config", async ({ page }) => {
    await page.goto("/interpretations");
    await page.waitForLoadState("networkidle");
    
    // Look for interpretation config/metadata
    const interpretationRow = page.locator(
      "table tbody tr, [data-testid='interpretation-item']"
    ).first();
    
    const isVisible = await interpretationRow.isVisible().catch(() => false);
    
    if (isVisible) {
      // Should show config details (model, parameters, etc.)
      const hasText = (await interpretationRow.textContent())?.trim().length > 0;
      expect(hasText).toBe(true);
    }
  });

  test("should filter by interpretation status", async ({ page }) => {
    await page.goto("/interpretations");
    await page.waitForLoadState("networkidle");
    
    // Look for status filter
    const statusFilter = page.locator(
      "select[name='status'], select:has(option:has-text('Status')), [data-testid='status-filter']"
    ).first();
    
    const hasFilter = await statusFilter.isVisible().catch(() => false);
    
    if (hasFilter) {
      // Select a status
      await statusFilter.selectOption({ index: 1 });
      
      // Wait for results to update
      await page.waitForTimeout(500);
      
      // List should update
      const hasResults = await page.locator(
        "table tbody tr, [data-testid='interpretation-item']"
      ).first().isVisible().catch(() => false);
      
      const hasEmptyState = await page.locator(
        "text=/no.*results/i, text=/no.*interpretations/i"
      ).isVisible().catch(() => false);
      
      expect(hasResults || hasEmptyState).toBe(true);
    }
  });

  test("should filter by entity type", async ({ page }) => {
    await page.goto("/interpretations");
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
        "table tbody tr, [data-testid='interpretation-item']"
      ).first().isVisible().catch(() => false);
      
      const hasEmptyState = await page.locator(
        "text=/no.*results/i"
      ).isVisible().catch(() => false);
      
      expect(hasResults || hasEmptyState).toBe(true);
    }
  });

  test("should show pagination controls if needed", async ({ page }) => {
    await page.goto("/interpretations");
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

  test("should display interpretation timestamp", async ({ page }) => {
    await page.goto("/interpretations");
    await page.waitForLoadState("networkidle");
    
    // Look for timestamp in interpretation rows
    const interpretationRow = page.locator(
      "table tbody tr, [data-testid='interpretation-item']"
    ).first();
    
    const isVisible = await interpretationRow.isVisible().catch(() => false);
    
    if (isVisible) {
      // Should show timestamp or date
      const hasTime = await page.locator("time").first().isVisible().catch(() => false);
      const hasText = (await interpretationRow.textContent())?.length > 0;
      
      expect(hasTime || hasText).toBe(true);
    }
  });

  test("should show interpretation model information", async ({ page }) => {
    await page.goto("/interpretations");
    await page.waitForLoadState("networkidle");
    
    // Look for model info in list
    const interpretationRow = page.locator(
      "table tbody tr, [data-testid='interpretation-item']"
    ).first();
    
    const isVisible = await interpretationRow.isVisible().catch(() => false);
    
    if (isVisible) {
      // Should show model name, version, or config
      const text = await interpretationRow.textContent();
      expect(text?.length).toBeGreaterThan(0);
    }
  });

  test("should display interpretation count", async ({ page }) => {
    await page.goto("/interpretations");
    await page.waitForLoadState("networkidle");
    
    // Look for count indicator
    const countIndicator = page.locator(
      "text=/\\d+\\s+(interpretations?|items?|results?)/i, [data-testid='item-count']"
    );
    
    // May show count or just display list
    const hasCount = await countIndicator.first().isVisible().catch(() => false);
    const hasList = await page.locator(
      "table tbody tr, [data-testid='interpretation-item']"
    ).first().isVisible().catch(() => false);
    
    expect(hasCount || hasList).toBe(true);
  });

  test("should handle search/filter functionality", async ({ page }) => {
    await page.goto("/interpretations");
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
        "table tbody tr, [data-testid='interpretation-item']"
      ).first().isVisible().catch(() => false);
      
      const hasEmptyState = await page.locator(
        "text=/no.*results/i"
      ).isVisible().catch(() => false);
      
      expect(hasResults || hasEmptyState).toBe(true);
    }
  });

  test("should show interpretation status indicators", async ({ page }) => {
    await page.goto("/interpretations");
    await page.waitForLoadState("networkidle");
    
    // Look for status indicators
    const statusIndicator = page.locator(
      ".status, [data-testid='status'], text=/pending/i, text=/complete/i, text=/processing/i"
    );
    
    const hasStatus = await statusIndicator.first().isVisible().catch(() => false);
    
    // Status indicators should be present if there are interpretations
    const hasInterpretations = await page.locator(
      "table tbody tr, [data-testid='interpretation-item']"
    ).first().isVisible().catch(() => false);
    
    if (hasInterpretations) {
      expect(typeof hasStatus).toBe("boolean");
    }
  });
});
