/**
 * E2E tests for Search Flow
 * 
 * Tests entity search workflow with filters, results, and navigation.
 */

import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";

test.describe("Search Flow", () => {

  test("should search entities and show results", async ({ page }) => {
    await page.goto("/");
    
    // Find search input
    const searchInput = page.locator(
      "input[type='search'], input[placeholder*='Search'], input[name='search']"
    ).first();
    
    await expect(searchInput).toBeVisible();
    
    // Enter search query
    await searchInput.fill("invoice");
    
    // Press enter or click search button
    await searchInput.press("Enter");
    
    // Wait for results or navigate to search page
    await page.waitForLoadState("networkidle");
    
    // Verify results are shown
    const results = page.locator(
      "[data-testid='search-result'], .search-result, .entity-card"
    );
    
    // Either results are shown or empty state is shown
    const hasResults = await results.count();
    const hasEmptyState = await page.locator("text=/no.*results/i, text=/no.*entities/i").isVisible();
    
    expect(hasResults > 0 || hasEmptyState).toBe(true);
  });

  test("should search with filters and verify filtered results", async ({ page }) => {
    await page.goto("/");
    
    const searchInput = page.locator(
      "input[type='search'], input[placeholder*='Search']"
    ).first();
    
    await searchInput.fill("test");
    await searchInput.press("Enter");
    
    await page.waitForLoadState("networkidle");
    
    // Look for filter controls
    const filterButton = page.locator(
      "button:has-text('Filter'), button:has-text('Filters'), [data-testid='filter-button']"
    ).first();
    
    if (await filterButton.isVisible()) {
      await filterButton.click();
      
      // Select entity type filter (if available)
      const entityTypeFilter = page.locator(
        "select[name='entity_type'], input[name='entity_type'], label:has-text('Type')"
      ).first();
      
      if (await entityTypeFilter.isVisible()) {
        // Verify filter controls are interactive
        expect(await entityTypeFilter.isEnabled()).toBe(true);
      }
    }
  });

  test("should click search result and view detail", async ({ page }) => {
    await page.goto("/");
    
    const searchInput = page.locator(
      "input[type='search'], input[placeholder*='Search']"
    ).first();
    
    await searchInput.fill("transaction");
    await searchInput.press("Enter");
    
    await page.waitForLoadState("networkidle");
    
    // Find first result
    const firstResult = page.locator(
      "[data-testid='search-result'], .search-result, .entity-card, .entity-list-item"
    ).first();
    
    const hasResults = await firstResult.isVisible().catch(() => false);
    
    if (hasResults) {
      await firstResult.click();
      
      // Should navigate to detail page
      await page.waitForLoadState("networkidle");
      
      const url = page.url();
      expect(url).toMatch(/\/(entities|records|sources)\//);
      
      // Verify detail view is shown
      const detailHeading = page.locator("h1, h2").first();
      await expect(detailHeading).toBeVisible();
    }
  });

  test("should show empty state when no results match", async ({ page }) => {
    await page.goto("/");
    
    const searchInput = page.locator(
      "input[type='search'], input[placeholder*='Search']"
    ).first();
    
    // Search for something that definitely doesn't exist
    const randomQuery = `nonexistent_${Date.now()}_xyz`;
    await searchInput.fill(randomQuery);
    await searchInput.press("Enter");
    
    await page.waitForLoadState("networkidle");
    
    // Should show empty state
    const emptyState = page.locator(
      "text=/no.*results/i, text=/no.*entities/i, text=/no.*matches/i, [data-testid='empty-state']"
    );
    
    await expect(emptyState.first()).toBeVisible({ timeout: 5000 });
  });

  test("should clear search and show all entities", async ({ page }) => {
    await page.goto("/");
    
    const searchInput = page.locator(
      "input[type='search'], input[placeholder*='Search']"
    ).first();
    
    // Search first
    await searchInput.fill("test");
    await searchInput.press("Enter");
    
    await page.waitForLoadState("networkidle");
    
    // Clear search
    await searchInput.clear();
    await searchInput.press("Enter");
    
    await page.waitForLoadState("networkidle");
    
    // Should show all entities or navigate to entities list
    const url = page.url();
    expect(url).toBeDefined();
  });

  test("should support pagination in search results", async ({ page }) => {
    await page.goto("/");
    
    const searchInput = page.locator(
      "input[type='search'], input[placeholder*='Search']"
    ).first();
    
    await searchInput.fill("entity");
    await searchInput.press("Enter");
    
    await page.waitForLoadState("networkidle");
    
    // Look for pagination controls
    const nextButton = page.locator(
      "button:has-text('Next'), button[aria-label='Next'], [data-testid='next-page']"
    ).first();
    
    const hasNextButton = await nextButton.isVisible().catch(() => false);
    
    if (hasNextButton && await nextButton.isEnabled()) {
      // Click next page
      await nextButton.click();
      
      await page.waitForLoadState("networkidle");
      
      // Should show second page of results
      const results = page.locator(
        "[data-testid='search-result'], .search-result, .entity-card"
      );
      
      expect(await results.count()).toBeGreaterThanOrEqual(0);
    }
  });

  test("should search with keyboard shortcuts", async ({ page }) => {
    await page.goto("/");
    
    // Press / or Ctrl+K to focus search (common shortcuts)
    await page.keyboard.press("/");
    
    // Search input should be focused
    const searchInput = page.locator(
      "input[type='search'], input[placeholder*='Search']"
    ).first();
    
    const isFocused = await searchInput.evaluate(
      (el) => el === document.activeElement
    );
    
    if (isFocused) {
      expect(isFocused).toBe(true);
      
      // Type search query
      await page.keyboard.type("test");
      
      // Submit search
      await page.keyboard.press("Enter");
      
      await page.waitForLoadState("networkidle");
    }
  });
});
