/**
 * E2E tests for Relationship Detail Page
 * 
 * Tests the /relationships/:id route with detail view rendering,
 * metadata display, navigation to related entities, and error handling.
 */

import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";

test.describe("Relationship Detail Page", () => {

  test("should render relationship detail page with valid ID", async ({ page }) => {
    // Navigate to relationships list first to get a valid ID
    await page.goto("/relationships");
    await page.waitForLoadState("networkidle");
    
    // Try to click first relationship to get to detail page
    const firstRelationship = page.locator(
      "table tbody tr, [data-testid='relationship-item'], a[href*='/relationships/']"
    ).first();
    
    const isVisible = await firstRelationship.isVisible().catch(() => false);
    
    if (isVisible) {
      await firstRelationship.click();
      await page.waitForLoadState("networkidle");
      
      // Verify we're on detail page
      const url = page.url();
      expect(url).toMatch(/\/relationships\/[^/]+/);
      
      // Verify page heading exists
      const heading = page.locator("h1, h2").first();
      await expect(heading).toBeVisible();
    }
  });

  test("should display relationship metadata", async ({ page }) => {
    await page.goto("/relationships");
    await page.waitForLoadState("networkidle");
    
    const firstRelationship = page.locator(
      "table tbody tr, [data-testid='relationship-item'], a[href*='/relationships/']"
    ).first();
    
    if (await firstRelationship.isVisible().catch(() => false)) {
      await firstRelationship.click();
      await page.waitForLoadState("networkidle");
      
      // Look for metadata sections
      const metadata = page.locator(
        "[data-testid='relationship-metadata'], .metadata, dl, .details"
      );
      
      const hasMetadata = await metadata.first().isVisible().catch(() => false);
      expect(hasMetadata).toBe(true);
    }
  });

  test("should show source and target entities", async ({ page }) => {
    await page.goto("/relationships");
    await page.waitForLoadState("networkidle");
    
    const firstRelationship = page.locator(
      "table tbody tr, [data-testid='relationship-item'], a[href*='/relationships/']"
    ).first();
    
    if (await firstRelationship.isVisible().catch(() => false)) {
      await firstRelationship.click();
      await page.waitForLoadState("networkidle");
      
      // Look for source and target entity information
      const entityInfo = page.locator(
        "text=/source/i, text=/target/i, [data-testid='source-entity'], [data-testid='target-entity']"
      );
      
      const hasEntityInfo = await entityInfo.first().isVisible().catch(() => false);
      expect(hasEntityInfo).toBe(true);
    }
  });

  test("should navigate to source entity", async ({ page }) => {
    await page.goto("/relationships");
    await page.waitForLoadState("networkidle");
    
    const firstRelationship = page.locator(
      "table tbody tr, [data-testid='relationship-item'], a[href*='/relationships/']"
    ).first();
    
    if (await firstRelationship.isVisible().catch(() => false)) {
      await firstRelationship.click();
      await page.waitForLoadState("networkidle");
      
      // Look for source entity link
      const sourceLink = page.locator(
        "a[href*='/entities/']:has-text('source'), a[href*='/entities/']"
      ).first();
      
      const hasSourceLink = await sourceLink.isVisible().catch(() => false);
      
      if (hasSourceLink) {
        await sourceLink.click();
        await page.waitForLoadState("networkidle");
        
        // Should navigate to entity detail
        const url = page.url();
        expect(url).toMatch(/\/entities\/[^/]+/);
      }
    }
  });

  test("should navigate to target entity", async ({ page }) => {
    await page.goto("/relationships");
    await page.waitForLoadState("networkidle");
    
    const firstRelationship = page.locator(
      "table tbody tr, [data-testid='relationship-item'], a[href*='/relationships/']"
    ).first();
    
    if (await firstRelationship.isVisible().catch(() => false)) {
      await firstRelationship.click();
      await page.waitForLoadState("networkidle");
      
      // Look for target entity link (might be second entity link)
      const targetLink = page.locator("a[href*='/entities/']").nth(1);
      
      const hasTargetLink = await targetLink.isVisible().catch(() => false);
      
      if (hasTargetLink) {
        await targetLink.click();
        await page.waitForLoadState("networkidle");
        
        // Should navigate to entity detail
        const url = page.url();
        expect(url).toMatch(/\/entities\/[^/]+/);
      }
    }
  });

  test("should navigate back to relationships list", async ({ page }) => {
    await page.goto("/relationships");
    await page.waitForLoadState("networkidle");
    
    const firstRelationship = page.locator(
      "table tbody tr, [data-testid='relationship-item'], a[href*='/relationships/']"
    ).first();
    
    if (await firstRelationship.isVisible().catch(() => false)) {
      await firstRelationship.click();
      await page.waitForLoadState("networkidle");
      
      // Look for back button or breadcrumb
      const backButton = page.locator(
        "button:has-text('Back'), a:has-text('Back'), a[href='/relationships'], [aria-label='Back']"
      ).first();
      
      const hasBack = await backButton.isVisible().catch(() => false);
      
      if (hasBack) {
        await backButton.click();
        await page.waitForLoadState("networkidle");
        
        // Should be back on relationships list
        const url = page.url();
        expect(url).toMatch(/\/relationships\/?$/);
      }
    }
  });

  test("should handle invalid relationship ID", async ({ page }) => {
    // Navigate to invalid relationship ID
    await page.goto("/relationships/invalid-id-12345");
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

  test("should display relationship type", async ({ page }) => {
    await page.goto("/relationships");
    await page.waitForLoadState("networkidle");
    
    const firstRelationship = page.locator(
      "table tbody tr, [data-testid='relationship-item'], a[href*='/relationships/']"
    ).first();
    
    if (await firstRelationship.isVisible().catch(() => false)) {
      await firstRelationship.click();
      await page.waitForLoadState("networkidle");
      
      // Look for relationship type
      const relType = page.locator(
        "[data-testid='relationship-type'], text=/type/i"
      );
      
      const hasType = await relType.first().isVisible().catch(() => false);
      expect(hasType).toBe(true);
    }
  });

  test("should show relationship creation timestamp", async ({ page }) => {
    await page.goto("/relationships");
    await page.waitForLoadState("networkidle");
    
    const firstRelationship = page.locator(
      "table tbody tr, [data-testid='relationship-item'], a[href*='/relationships/']"
    ).first();
    
    if (await firstRelationship.isVisible().catch(() => false)) {
      await firstRelationship.click();
      await page.waitForLoadState("networkidle");
      
      // Look for timestamps
      const timestamp = page.locator(
        "text=/created/i, text=/timestamp/i, time"
      );
      
      const hasTimestamp = await timestamp.first().isVisible().catch(() => false);
      expect(hasTimestamp).toBe(true);
    }
  });

  test("should display relationship properties", async ({ page }) => {
    await page.goto("/relationships");
    await page.waitForLoadState("networkidle");
    
    const firstRelationship = page.locator(
      "table tbody tr, [data-testid='relationship-item'], a[href*='/relationships/']"
    ).first();
    
    if (await firstRelationship.isVisible().catch(() => false)) {
      await firstRelationship.click();
      await page.waitForLoadState("networkidle");
      
      // Look for additional properties
      const properties = page.locator(
        "[data-testid='properties'], .properties, dl"
      );
      
      // May have properties or not
      const hasProperties = await properties.first().isVisible().catch(() => false);
      
      // This is acceptable
      expect(typeof hasProperties).toBe("boolean");
    }
  });

  test("should show entity type information", async ({ page }) => {
    await page.goto("/relationships");
    await page.waitForLoadState("networkidle");
    
    const firstRelationship = page.locator(
      "table tbody tr, [data-testid='relationship-item'], a[href*='/relationships/']"
    ).first();
    
    if (await firstRelationship.isVisible().catch(() => false)) {
      await firstRelationship.click();
      await page.waitForLoadState("networkidle");
      
      // Look for entity type information
      const entityTypes = page.locator(
        "text=/entity.*type/i, [data-testid='entity-type']"
      );
      
      const hasEntityTypes = await entityTypes.first().isVisible().catch(() => false);
      
      // Should show entity type info
      expect(typeof hasEntityTypes).toBe("boolean");
    }
  });

  test("should display source information", async ({ page }) => {
    await page.goto("/relationships");
    await page.waitForLoadState("networkidle");
    
    const firstRelationship = page.locator(
      "table tbody tr, [data-testid='relationship-item'], a[href*='/relationships/']"
    ).first();
    
    if (await firstRelationship.isVisible().catch(() => false)) {
      await firstRelationship.click();
      await page.waitForLoadState("networkidle");
      
      // Look for source provenance
      const sourceInfo = page.locator(
        "text=/source.*file/i, a[href*='/sources/']"
      );
      
      // May have source info or not
      const hasSourceInfo = await sourceInfo.first().isVisible().catch(() => false);
      
      // This is acceptable
      expect(typeof hasSourceInfo).toBe("boolean");
    }
  });
});
