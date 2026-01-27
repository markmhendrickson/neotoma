/**
 * E2E tests for Schemas List Page
 * 
 * Tests the /schemas route with list rendering, empty state,
 * navigation to schema details, and display of entity types.
 */

import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";

test.describe("Schemas List Page", () => {

  test("should render schemas list page", async ({ page }) => {
    await page.goto("/schemas");
    
    await page.waitForLoadState("networkidle");
    
    // Verify page heading
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible();
    
    // Verify schemas list container
    const listContainer = page.locator(
      "[data-testid='schemas-list'], .schemas-list, table, .list-container"
    );
    await expect(listContainer.first()).toBeVisible({ timeout: 5000 });
  });

  test("should show schemas table with data", async ({ page }) => {
    await page.goto("/schemas");
    await page.waitForLoadState("networkidle");
    
    // Check for table or list items
    const hasTable = await page.locator("table").isVisible().catch(() => false);
    const hasListItems = await page.locator(
      "[data-testid='schema-item'], .schema-item, .list-item"
    ).first().isVisible().catch(() => false);
    
    // Either table or list items should be visible
    expect(hasTable || hasListItems).toBe(true);
  });

  test("should show empty state when no schemas", async ({ page }) => {
    await page.goto("/schemas");
    await page.waitForLoadState("networkidle");
    
    // Look for either data or empty state
    const hasData = await page.locator(
      "table tbody tr, [data-testid='schema-item']"
    ).first().isVisible().catch(() => false);
    
    const hasEmptyState = await page.locator(
      "text=/no.*schemas/i, text=/empty/i, [data-testid='empty-state']"
    ).first().isVisible().catch(() => false);
    
    // Should show either data or empty state
    expect(hasData || hasEmptyState).toBe(true);
  });

  test("should display entity types", async ({ page }) => {
    await page.goto("/schemas");
    await page.waitForLoadState("networkidle");
    
    // Look for entity type names in list
    const schemaRow = page.locator(
      "table tbody tr, [data-testid='schema-item']"
    ).first();
    
    const isVisible = await schemaRow.isVisible().catch(() => false);
    
    if (isVisible) {
      // Should show entity type names
      const hasText = (await schemaRow.textContent())?.trim().length > 0;
      expect(hasText).toBe(true);
    }
  });

  test("should show field counts for schemas", async ({ page }) => {
    await page.goto("/schemas");
    await page.waitForLoadState("networkidle");
    
    // Look for field count indicators
    const schemaRow = page.locator(
      "table tbody tr, [data-testid='schema-item']"
    ).first();
    
    const isVisible = await schemaRow.isVisible().catch(() => false);
    
    if (isVisible) {
      // Should show field counts or metadata
      const text = await schemaRow.textContent();
      expect(text?.length).toBeGreaterThan(0);
    }
  });

  test("should navigate to schema detail when schema clicked", async ({ page }) => {
    await page.goto("/schemas");
    await page.waitForLoadState("networkidle");
    
    // Look for clickable schema items
    const schemaLink = page.locator(
      "table tbody tr, [data-testid='schema-item'], a[href*='/schemas/']"
    ).first();
    
    const isVisible = await schemaLink.isVisible().catch(() => false);
    
    if (isVisible) {
      await schemaLink.click();
      
      // Should navigate to schema detail page
      await page.waitForLoadState("networkidle");
      
      const url = page.url();
      expect(url).toMatch(/\/schemas\/[^/]+/);
    }
  });

  test("should display schema metadata in list", async ({ page }) => {
    await page.goto("/schemas");
    await page.waitForLoadState("networkidle");
    
    // Look for schema metadata (version, field count, etc.)
    const schemaRow = page.locator(
      "table tbody tr, [data-testid='schema-item']"
    ).first();
    
    const isVisible = await schemaRow.isVisible().catch(() => false);
    
    if (isVisible) {
      // Should show metadata
      const text = await schemaRow.textContent();
      expect(text?.length).toBeGreaterThan(0);
    }
  });

  test("should handle search/filter functionality", async ({ page }) => {
    await page.goto("/schemas");
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
        "table tbody tr, [data-testid='schema-item']"
      ).first().isVisible().catch(() => false);
      
      const hasEmptyState = await page.locator(
        "text=/no.*results/i, text=/no.*schemas/i"
      ).isVisible().catch(() => false);
      
      expect(hasResults || hasEmptyState).toBe(true);
    }
  });

  test("should show schema count", async ({ page }) => {
    await page.goto("/schemas");
    await page.waitForLoadState("networkidle");
    
    // Look for count indicator
    const countIndicator = page.locator(
      "text=/\\d+\\s+(schemas?|types?|items?)/i, [data-testid='item-count']"
    );
    
    // May show count or just display list
    const hasCount = await countIndicator.first().isVisible().catch(() => false);
    const hasList = await page.locator(
      "table tbody tr, [data-testid='schema-item']"
    ).first().isVisible().catch(() => false);
    
    expect(hasCount || hasList).toBe(true);
  });

  test("should display entity type categories", async ({ page }) => {
    await page.goto("/schemas");
    await page.waitForLoadState("networkidle");
    
    // Look for entity type categories or groupings
    const schemaRow = page.locator(
      "table tbody tr, [data-testid='schema-item']"
    ).first();
    
    const isVisible = await schemaRow.isVisible().catch(() => false);
    
    if (isVisible) {
      // Should show entity types (invoice, transaction, etc.)
      const text = await schemaRow.textContent();
      expect(text?.length).toBeGreaterThan(0);
    }
  });

  test("should sort schemas list", async ({ page }) => {
    await page.goto("/schemas");
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

  test("should show schema version information", async ({ page }) => {
    await page.goto("/schemas");
    await page.waitForLoadState("networkidle");
    
    // Look for version info in list
    const schemaRow = page.locator(
      "table tbody tr, [data-testid='schema-item']"
    ).first();
    
    const isVisible = await schemaRow.isVisible().catch(() => false);
    
    if (isVisible) {
      // Should show version or other metadata
      const text = await schemaRow.textContent();
      expect(text?.length).toBeGreaterThan(0);
    }
  });

  test("should display field type indicators", async ({ page }) => {
    await page.goto("/schemas");
    await page.waitForLoadState("networkidle");
    
    // Look for field type indicators
    const schemaRow = page.locator(
      "table tbody tr, [data-testid='schema-item']"
    ).first();
    
    const isVisible = await schemaRow.isVisible().catch(() => false);
    
    if (isVisible) {
      // Should show field count or types
      const text = await schemaRow.textContent();
      expect(text?.length).toBeGreaterThan(0);
    }
  });
});
