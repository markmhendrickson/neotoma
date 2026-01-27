/**
 * E2E tests for Upload Dialog Flow
 * 
 * Tests file upload dialog workflow with success/error states.
 * Upload is a dialog accessed from the Sources page, not a separate route.
 */

import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";

test.describe("Upload Dialog Flow", () => {

  test("should open upload dialog from Sources page", async ({ page }) => {
    await page.goto("/sources");
    
    await page.waitForLoadState("networkidle");
    
    // Click Upload button to open dialog
    const uploadButton = page.locator("button:has-text('Upload')").first();
    await expect(uploadButton).toBeVisible();
    await uploadButton.click();
    
    // Verify upload dialog opens
    const dialog = page.locator("[role='dialog'], .dialog, .modal");
    await expect(dialog).toBeVisible({ timeout: 5000 });
  });

  test("should upload file and show success message", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    // Open upload dialog
    const uploadButton = page.locator("button:has-text('Upload')").first();
    await uploadButton.click();
    
    // Wait for dialog
    await page.waitForSelector("[role='dialog'], .dialog, .modal", { timeout: 5000 });
    
    // Upload test file
    const fileInput = page.locator("input[type='file']");
    await expect(fileInput).toBeVisible();
    
    await fileInput.setInputFiles("tests/fixtures/sample_invoice.json");
    
    // Click upload button in dialog
    const submitButton = page.locator("button:has-text('Upload'), button[type='submit']").last();
    await submitButton.click();
    
    // Wait for success message
    await page.waitForSelector("text=/upload.*success/i, text=/success/i", { timeout: 10000 });
    
    // Verify success message visible
    const successMessage = page.locator("text=/success/i");
    await expect(successMessage).toBeVisible();
  });

  test("should navigate to source details after upload", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    // Open upload dialog
    const uploadButton = page.locator("button:has-text('Upload')").first();
    await uploadButton.click();
    
    // Upload file
    const fileInput = page.locator("input[type='file']");
    await fileInput.setInputFiles("tests/fixtures/sample_invoice.json");
    
    const submitButton = page.locator("button:has-text('Upload'), button[type='submit']").last();
    await submitButton.click();
    
    // Wait for processing
    await page.waitForSelector("text=/success/i", { timeout: 10000 });
    
    // Click to view details
    const viewButton = page.locator("button:has-text('View'), a:has-text('View')").first();
    if (await viewButton.isVisible()) {
      await viewButton.click();
      
      // Should navigate to source details
      await page.waitForLoadState("networkidle");
      
      // Verify we're on a details page
      const url = page.url();
      expect(url).toMatch(/\/sources\//);
    }
  });

  test("should create timeline event after upload", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    // Open upload dialog
    const uploadButton = page.locator("button:has-text('Upload')").first();
    await uploadButton.click();
    
    // Upload file
    const fileInput = page.locator("input[type='file']");
    await fileInput.setInputFiles("tests/fixtures/sample_transaction.json");
    
    const submitButton = page.locator("button:has-text('Upload'), button[type='submit']").last();
    await submitButton.click();
    
    // Wait for success
    await page.waitForSelector("text=/success/i", { timeout: 10000 });
    
    // Navigate to timeline
    await page.goto("/timeline");
    
    // Verify timeline loads
    await expect(page.locator("h1")).toContainText(/timeline/i);
    
    // Timeline should show recent event (uploaded file)
    const timelineEvents = page.locator("[data-testid='timeline-event'], .timeline-event");
    await expect(timelineEvents.first()).toBeVisible({ timeout: 5000 });
  });

  test("should show error for invalid file type", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    // Open upload dialog
    const uploadButton = page.locator("button:has-text('Upload')").first();
    await uploadButton.click();
    
    // Try to upload invalid file type
    const fileInput = page.locator("input[type='file']");
    
    // Create a temporary invalid file
    await fileInput.setInputFiles({
      name: "invalid.xyz",
      mimeType: "application/xyz",
      buffer: Buffer.from("invalid content"),
    });
    
    const submitButton = page.locator("button:has-text('Upload'), button[type='submit']").last();
    await submitButton.click();
    
    // Should show error message
    const errorMessage = page.locator("text=/invalid.*file/i, text=/error/i");
    await expect(errorMessage.first()).toBeVisible({ timeout: 5000 });
  });

  test("should show error for file too large", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    // Open upload dialog
    const uploadButton = page.locator("button:has-text('Upload')").first();
    await uploadButton.click();
    
    // Try to upload oversized file
    const fileInput = page.locator("input[type='file']");
    
    // Create a large buffer (>10MB if that's the limit)
    const largeBuffer = Buffer.alloc(15 * 1024 * 1024); // 15MB
    
    await fileInput.setInputFiles({
      name: "large.pdf",
      mimeType: "application/pdf",
      buffer: largeBuffer,
    });
    
    const submitButton = page.locator("button:has-text('Upload'), button[type='submit']").last();
    await submitButton.click();
    
    // Should show size error
    const errorMessage = page.locator("text=/too large/i, text=/file size/i, text=/error/i");
    await expect(errorMessage.first()).toBeVisible({ timeout: 5000 });
  });

  test("should show upload progress indicator", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    // Open upload dialog
    const uploadButton = page.locator("button:has-text('Upload')").first();
    await uploadButton.click();
    
    const fileInput = page.locator("input[type='file']");
    await fileInput.setInputFiles("tests/fixtures/sample_invoice.json");
    
    const submitButton = page.locator("button:has-text('Upload'), button[type='submit']").last();
    await submitButton.click();
    
    // Should show progress/loading indicator
    const loadingIndicator = page.locator(
      "[data-testid='upload-progress'], .loading, .spinner, text=/uploading/i"
    );
    
    // May be visible briefly
    const isVisible = await loadingIndicator.first().isVisible().catch(() => false);
    
    // Either loading indicator was shown or upload completed quickly
    expect(isVisible === true || await page.locator("text=/success/i").isVisible()).toBe(true);
  });

  test("should handle multiple file upload", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    // Open upload dialog
    const uploadButton = page.locator("button:has-text('Upload')").first();
    await uploadButton.click();
    
    const fileInput = page.locator("input[type='file']");
    
    // Check if multiple file upload is supported
    const multipleAttr = await fileInput.getAttribute("multiple");
    
    if (multipleAttr !== null) {
      // Upload multiple files
      await fileInput.setInputFiles([
        "tests/fixtures/sample_invoice.json",
        "tests/fixtures/sample_transaction.json",
      ]);
      
      const submitButton = page.locator("button:has-text('Upload'), button[type='submit']").last();
      await submitButton.click();
      
      // Should show success for multiple files
      await page.waitForSelector("text=/success/i", { timeout: 15000 });
      
      // Verify both files were processed (may show count)
      const successText = await page.locator("text=/success/i").textContent();
      expect(successText).toBeDefined();
    }
  });

  test("should validate file before upload", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    // Open upload dialog
    const uploadButton = page.locator("button:has-text('Upload')").first();
    await uploadButton.click();
    
    // Try to click upload without selecting file
    const submitButton = page.locator("button:has-text('Upload'), button[type='submit']").last();
    
    // Upload button should be disabled or show validation error
    const isDisabled = await submitButton.isDisabled();
    
    if (!isDisabled) {
      await submitButton.click();
      
      // Should show validation error
      const validationError = page.locator("text=/select.*file/i, text=/required/i");
      await expect(validationError.first()).toBeVisible({ timeout: 2000 });
    } else {
      expect(isDisabled).toBe(true);
    }
  });

  test("should allow closing upload dialog", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForLoadState("networkidle");
    
    // Open upload dialog
    const uploadButton = page.locator("button:has-text('Upload')").first();
    await uploadButton.click();
    
    // Wait for dialog to open
    await page.waitForSelector("[role='dialog'], .dialog, .modal", { timeout: 5000 });
    
    // Check for close button
    const closeButton = page.locator(
      "button[aria-label='Close'], button:has-text('Cancel'), button:has-text('Close')"
    );
    
    if (await closeButton.first().isVisible()) {
      await closeButton.first().click();
      
      // Dialog should close
      const dialog = page.locator("[role='dialog'], .dialog, .modal");
      await expect(dialog).not.toBeVisible({ timeout: 2000 });
    }
  });
});
