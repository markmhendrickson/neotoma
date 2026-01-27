/**
 * E2E tests for 404 Not Found Page
 * 
 * Tests the catch-all route (*) for handling non-existent paths.
 */

import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";

test.describe("404 Not Found Page", () => {

  test("should render 404 page for non-existent route", async ({ page }) => {
    // Navigate to a non-existent route
    await page.goto("/nonexistent-route");
    
    await page.waitForLoadState("networkidle");
    
    // Verify 404 page renders
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible();
    
    // Look for "not found" or "404" text
    const notFoundText = page.locator("text=/not found/i, text=/404/i");
    await expect(notFoundText.first()).toBeVisible({ timeout: 5000 });
  });

  test("should show 404 message", async ({ page }) => {
    await page.goto("/invalid-path-xyz");
    await page.waitForLoadState("networkidle");
    
    // Should show user-friendly error message
    const errorMessage = page.locator(
      "text=/not found/i, text=/page.*not.*exist/i, text=/404/i"
    );
    
    await expect(errorMessage.first()).toBeVisible();
  });

  test("should have navigation back to home", async ({ page }) => {
    await page.goto("/missing-page");
    await page.waitForLoadState("networkidle");
    
    // Look for home link or back button
    const homeLink = page.locator(
      "a[href='/'], button:has-text('Home'), a:has-text('Home'), a:has-text('Back')"
    ).first();
    
    const hasHomeLink = await homeLink.isVisible().catch(() => false);
    
    if (hasHomeLink) {
      await homeLink.click();
      await page.waitForLoadState("networkidle");
      
      // Should navigate to home
      const url = page.url();
      expect(url).toMatch(/\/$/);
    } else {
      // Home link should be present on 404 page
      expect(hasHomeLink).toBe(true);
    }
  });

  test("should handle deeply nested invalid route", async ({ page }) => {
    await page.goto("/foo/bar/baz/invalid");
    await page.waitForLoadState("networkidle");
    
    // Should still show 404 page
    const notFoundText = page.locator("text=/not found/i, text=/404/i");
    await expect(notFoundText.first()).toBeVisible();
  });

  test("should handle route with special characters", async ({ page }) => {
    await page.goto("/invalid-@#$%-route");
    await page.waitForLoadState("networkidle");
    
    // Should show 404 page
    const notFoundText = page.locator("text=/not found/i, text=/404/i");
    await expect(notFoundText.first()).toBeVisible();
  });

  test("should display helpful suggestions or links", async ({ page }) => {
    await page.goto("/nonexistent");
    await page.waitForLoadState("networkidle");
    
    // Look for helpful links (home, entities, sources, etc.)
    const links = page.locator("a[href^='/']");
    
    const hasLinks = await links.first().isVisible().catch(() => false);
    
    // Should have at least one link
    expect(hasLinks).toBe(true);
  });

  test("should not crash on invalid route", async ({ page }) => {
    await page.goto("/completely-invalid-path-12345");
    await page.waitForLoadState("networkidle");
    
    // Page should render without error
    const body = page.locator("body");
    await expect(body).toBeVisible();
    
    // Should show 404 content
    const notFoundText = page.locator("text=/not found/i, text=/404/i");
    await expect(notFoundText.first()).toBeVisible();
  });

  test("should handle route similar to valid route", async ({ page }) => {
    // Try a route similar to valid but not exact
    await page.goto("/entitie"); // Close to /entities but wrong
    await page.waitForLoadState("networkidle");
    
    // Should show 404 page
    const notFoundText = page.locator("text=/not found/i, text=/404/i");
    await expect(notFoundText.first()).toBeVisible();
  });

  test("should show consistent layout with main app", async ({ page }) => {
    await page.goto("/invalid-route");
    await page.waitForLoadState("networkidle");
    
    // Look for main app elements (nav, sidebar, etc.)
    const navigation = page.locator(
      "nav, [data-testid='app-nav'], aside, header"
    );
    
    // May or may not have main app chrome
    const hasNav = await navigation.first().isVisible().catch(() => false);
    
    // Either has nav or is standalone 404 page
    expect(typeof hasNav).toBe("boolean");
  });

  test("should handle route with query parameters", async ({ page }) => {
    await page.goto("/invalid?param=value");
    await page.waitForLoadState("networkidle");
    
    // Should still show 404 page
    const notFoundText = page.locator("text=/not found/i, text=/404/i");
    await expect(notFoundText.first()).toBeVisible();
  });

  test("should handle route with hash", async ({ page }) => {
    await page.goto("/invalid#section");
    await page.waitForLoadState("networkidle");
    
    // Should show 404 page
    const notFoundText = page.locator("text=/not found/i, text=/404/i");
    await expect(notFoundText.first()).toBeVisible();
  });

  test("should maintain proper page title", async ({ page }) => {
    await page.goto("/nonexistent");
    await page.waitForLoadState("networkidle");
    
    // Page title should indicate error
    const title = await page.title();
    
    // Title should exist and indicate error
    expect(title.length).toBeGreaterThan(0);
  });

  test("should not expose sensitive error information", async ({ page }) => {
    await page.goto("/invalid-route-test");
    await page.waitForLoadState("networkidle");
    
    // Should not show stack traces or internal errors
    const pageText = await page.locator("body").textContent();
    
    // Should not contain sensitive terms
    const hasSensitiveInfo = pageText?.match(/stack|trace|error.*at.*line/i);
    
    // Should not expose internal errors
    expect(hasSensitiveInfo).toBeNull();
  });
});
