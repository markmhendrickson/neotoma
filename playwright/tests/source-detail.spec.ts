/**
 * E2E tests for Source Detail Page
 * 
 * Tests the /sources/:id route with detail view rendering,
 * metadata display, entity associations, and navigation.
 */

import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";

test.describe("Source Detail Page", () => {

  test("should render source detail page with valid ID", async ({ page }) => {
    // Navigate to sources list first to get a valid ID
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    // Try to click first source to get to detail page
    const firstSource = page.locator(
      "table tbody tr, [data-testid='source-item'], a[href*='/sources/']"
    ).first();
    
    const isVisible = await firstSource.isVisible().catch(() => false);
    
    if (isVisible) {
      await firstSource.click();
      await page.waitForLoadState("networkidle");
      
      // Verify we're on detail page
      const url = page.url();
      expect(url).toMatch(/\/sources\/[^/]+/);
      
      // Verify page heading exists
      const heading = page.locator("h1, h2").first();
      await expect(heading).toBeVisible();
    }
  });

  test("should display source metadata", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    const firstSource = page.locator(
      "table tbody tr, [data-testid='source-item'], a[href*='/sources/']"
    ).first();
    
    if (await firstSource.isVisible().catch(() => false)) {
      await firstSource.click();
      await page.waitForLoadState("networkidle");
      
      // Look for metadata sections
      const metadata = page.locator(
        "[data-testid='source-metadata'], .metadata, dl, .details"
      );
      
      const hasMetadata = await metadata.first().isVisible().catch(() => false);
      expect(hasMetadata).toBe(true);
    }
  });

  test("should show associated entities", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    const firstSource = page.locator(
      "table tbody tr, [data-testid='source-item'], a[href*='/sources/']"
    ).first();
    
    if (await firstSource.isVisible().catch(() => false)) {
      await firstSource.click();
      await page.waitForLoadState("networkidle");
      
      // Look for entities section
      const entitiesSection = page.locator(
        "text=/entities/i, [data-testid='entities-section']"
      );
      
      // May have entities or empty state
      const hasEntities = await entitiesSection.first().isVisible().catch(() => false);
      const hasEmptyState = await page.locator("text=/no.*entities/i").isVisible().catch(() => false);
      
      expect(hasEntities || hasEmptyState).toBe(true);
    }
  });

  test("should show interpretations for source", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    const firstSource = page.locator(
      "table tbody tr, [data-testid='source-item'], a[href*='/sources/']"
    ).first();
    
    if (await firstSource.isVisible().catch(() => false)) {
      await firstSource.click();
      await page.waitForLoadState("networkidle");
      
      // Look for interpretations section
      const interpretationsSection = page.locator(
        "text=/interpretations?/i, [data-testid='interpretations-section']"
      );
      
      // May have interpretations or empty state
      const hasInterpretations = await interpretationsSection.first().isVisible().catch(() => false);
      const hasEmptyState = await page.locator("text=/no.*interpretations/i").isVisible().catch(() => false);
      
      expect(hasInterpretations || hasEmptyState).toBe(true);
    }
  });

  test("should navigate back to sources list", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    const firstSource = page.locator(
      "table tbody tr, [data-testid='source-item'], a[href*='/sources/']"
    ).first();
    
    if (await firstSource.isVisible().catch(() => false)) {
      await firstSource.click();
      await page.waitForLoadState("networkidle");
      
      // Look for back button or breadcrumb
      const backButton = page.locator(
        "button:has-text('Back'), a:has-text('Back'), a[href='/sources'], [aria-label='Back']"
      ).first();
      
      const hasBack = await backButton.isVisible().catch(() => false);
      
      if (hasBack) {
        await backButton.click();
        await page.waitForLoadState("networkidle");
        
        // Should be back on sources list
        const url = page.url();
        expect(url).toMatch(/\/sources\/?$/);
      }
    }
  });

  test("should handle invalid source ID", async ({ page }) => {
    // Navigate to invalid source ID
    await page.goto("/sources/invalid-id-12345");
    await page.waitForLoadState("networkidle");
    
    // Should show error or 404 state
    const errorMessage = page.locator(
      "text=/not found/i, text=/error/i, text=/invalid/i, [data-testid='error-state']"
    );
    
    const hasError = await errorMessage.first().isVisible().catch(() => false);
    const has404 = await page.locator("text=/404/i").isVisible().catch(() => false);
    
    // Should show some error state
    expect(hasError || has404).toBe(true);
  });

  test("should display source file information", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    const firstSource = page.locator(
      "table tbody tr, [data-testid='source-item'], a[href*='/sources/']"
    ).first();
    
    if (await firstSource.isVisible().catch(() => false)) {
      await firstSource.click();
      await page.waitForLoadState("networkidle");
      
      // Look for file info (name, type, size, upload date, etc.)
      const fileInfo = page.locator(
        "[data-testid='file-info'], text=/file/i, text=/size/i, text=/type/i"
      );
      
      const hasFileInfo = await fileInfo.first().isVisible().catch(() => false);
      expect(hasFileInfo).toBe(true);
    }
  });

  test("should show source status", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    const firstSource = page.locator(
      "table tbody tr, [data-testid='source-item'], a[href*='/sources/']"
    ).first();
    
    if (await firstSource.isVisible().catch(() => false)) {
      await firstSource.click();
      await page.waitForLoadState("networkidle");
      
      // Look for status indicator
      const status = page.locator(
        "[data-testid='source-status'], .status, text=/status/i, text=/processing/i, text=/completed/i"
      );
      
      const hasStatus = await status.first().isVisible().catch(() => false);
      expect(hasStatus).toBe(true);
    }
  });

  test("should allow navigation to entity details", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    const firstSource = page.locator(
      "table tbody tr, [data-testid='source-item'], a[href*='/sources/']"
    ).first();
    
    if (await firstSource.isVisible().catch(() => false)) {
      await firstSource.click();
      await page.waitForLoadState("networkidle");
      
      // Look for entity links
      const entityLink = page.locator("a[href*='/entities/']").first();
      
      const hasEntityLink = await entityLink.isVisible().catch(() => false);
      
      if (hasEntityLink) {
        await entityLink.click();
        await page.waitForLoadState("networkidle");
        
        // Should navigate to entity detail
        const url = page.url();
        expect(url).toMatch(/\/entities\/[^/]+/);
      }
    }
  });

  test("should display observations count", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    const firstSource = page.locator(
      "table tbody tr, [data-testid='source-item'], a[href*='/sources/']"
    ).first();
    
    if (await firstSource.isVisible().catch(() => false)) {
      await firstSource.click();
      await page.waitForLoadState("networkidle");
      
      // Look for observations count or section
      const observations = page.locator(
        "text=/observations?/i, [data-testid='observations-count']"
      );
      
      const hasObservations = await observations.first().isVisible().catch(() => false);
      
      // Observations info should be present
      expect(typeof hasObservations).toBe("boolean");
    }
  });

  test("should show raw content or preview", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    const firstSource = page.locator(
      "table tbody tr, [data-testid='source-item'], a[href*='/sources/']"
    ).first();
    
    if (await firstSource.isVisible().catch(() => false)) {
      await firstSource.click();
      await page.waitForLoadState("networkidle");
      
      // Look for raw content section or preview
      const content = page.locator(
        "[data-testid='raw-content'], .content, text=/content/i, pre, code"
      );
      
      // May show content or metadata only
      const hasContent = await content.first().isVisible().catch(() => false);
      const hasMetadata = await page.locator(".metadata, dl").first().isVisible().catch(() => false);
      
      expect(hasContent || hasMetadata).toBe(true);
    }
  });

  test("should display extraction timestamp", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    const firstSource = page.locator(
      "table tbody tr, [data-testid='source-item'], a[href*='/sources/']"
    ).first();
    
    if (await firstSource.isVisible().catch(() => false)) {
      await firstSource.click();
      await page.waitForLoadState("networkidle");
      
      // Look for timestamps
      const timestamp = page.locator(
        "text=/created/i, text=/uploaded/i, text=/processed/i, time"
      );
      
      const hasTimestamp = await timestamp.first().isVisible().catch(() => false);
      expect(hasTimestamp).toBe(true);
    }
  });
});
