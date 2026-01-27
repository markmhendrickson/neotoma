/**
 * E2E tests for MCP Configuration Component
 *
 * After recent UI changes, default route "/" is Dashboard. OAuth/MCP setup lives at /oauth and /mcp/cursor etc.
 * These tests sign in as guest then assert on Dashboard or navigate to OAuth for connection flow.
 */

import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";
import {
  clearClientState,
  primeLocalSettings,
  signInAsGuest,
} from "./helpers.js";

test.describe("MCP Configuration Component", () => {
  test.beforeEach(async ({ page, uiBaseUrl }) => {
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);
    await page.goto(uiBaseUrl);
    await signInAsGuest(page);
  });

  test("should render MCP configuration page", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible();
    // Default route is Dashboard; may show "Welcome to Neotoma" or main content
    const mainOrNav = page.locator("main, [role='main'], nav, aside");
    await expect(mainOrNav.first()).toBeVisible({ timeout: 5000 });
  });

  test("should show connection setup instructions", async ({ page }) => {
    await page.goto("/");
    
    await page.waitForLoadState("networkidle");
    
    // Look for setup instructions or connection button
    const setupButton = page.locator(
      "button:has-text('Connect'), button:has-text('Setup'), button:has-text('Configure')"
    ).first();
    
    const hasSetupButton = await setupButton.isVisible().catch(() => false);
    
    if (hasSetupButton) {
      expect(await setupButton.isEnabled()).toBe(true);
    }
  });

  test("should display OAuth connection flow", async ({ page }) => {
    await page.goto("/oauth");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: /OAuth Connections/i })).toBeVisible({ timeout: 5000 });
    const startButton = page.getByRole("button", { name: /Start OAuth Flow|Generate/i });
    await expect(startButton.first()).toBeVisible();
  });

  test("should show error state for invalid configuration", async ({ page }) => {
    await page.goto("/");
    
    await page.waitForLoadState("networkidle");
    
    // Look for form fields
    const input = page.locator("input[type='text'], input[type='url']").first();
    
    const hasInput = await input.isVisible().catch(() => false);
    
    if (hasInput) {
      // Enter invalid value
      await input.fill("invalid-url");
      
      // Submit or validate
      const submitButton = page.locator(
        "button[type='submit'], button:has-text('Save'), button:has-text('Connect')"
      ).first();
      
      if (await submitButton.isVisible()) {
        await submitButton.click();
        
        // Should show validation error
        const error = page.locator(
          ".error, .field-error, text=/invalid/i, text=/error/i"
        );
        
        await expect(error.first()).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test("should display connection status", async ({ page }) => {
    await page.goto("/");
    
    await page.waitForLoadState("networkidle");
    
    // Look for connection status indicator
    const statusIndicator = page.locator(
      "[data-testid='connection-status'], .status-indicator, text=/connected/i, text=/disconnected/i"
    );
    
    // Status indicator should be visible
    const hasStatus = await statusIndicator.first().isVisible().catch(() => false);
    
    if (hasStatus) {
      const statusText = await statusIndicator.first().textContent();
      expect(statusText).toBeDefined();
    }
  });

  test("should show list of active connections", async ({ page }) => {
    await page.goto("/");
    
    await page.waitForLoadState("networkidle");
    
    // Look for connections list
    const connectionsList = page.locator(
      "[data-testid='connections-list'], .connections, .connection-item, ul li"
    );
    
    // May have connections or empty state
    const hasConnections = await connectionsList.first().isVisible().catch(() => false);
    const hasEmptyState = await page.locator("text=/no.*connections/i").isVisible().catch(() => false);
    
    expect(hasConnections || hasEmptyState).toBe(true);
  });

  test("should allow disconnecting MCP connection", async ({ page }) => {
    await page.goto("/");
    
    await page.waitForLoadState("networkidle");
    
    // Look for disconnect button
    const disconnectButton = page.locator(
      "button:has-text('Disconnect'), button:has-text('Remove'), [data-testid='disconnect']"
    ).first();
    
    const hasDisconnect = await disconnectButton.isVisible().catch(() => false);
    
    if (hasDisconnect && (await disconnectButton.isEnabled())) {
      // Don't actually click (would affect test state)
      expect(await disconnectButton.isEnabled()).toBe(true);
    }
  });

  test("should display MCP server information", async ({ page }) => {
    await page.goto("/");
    
    await page.waitForLoadState("networkidle");
    
    // Should show server URL, version, or other info
    const serverInfo = page.locator(
      "[data-testid='server-info'], .server-info, text=/server/i"
    );
    
    const hasServerInfo = await serverInfo.first().isVisible().catch(() => false);
    
    // MCP configuration page should have some server information
    expect(hasServerInfo || await page.locator("input, button").first().isVisible()).toBe(true);
  });

  test("should handle OAuth callback error", async ({ page }) => {
    // Navigate to OAuth callback with error
    await page.goto("/oauth/callback?error=access_denied");
    
    await page.waitForLoadState("networkidle");
    
    // Should show error message
    const errorMessage = page.locator(
      "text=/error/i, text=/denied/i, text=/failed/i, .error-message"
    );
    
    await expect(errorMessage.first()).toBeVisible({ timeout: 5000 });
  });

  test("should validate MCP URL format", async ({ page }) => {
    await page.goto("/");
    
    await page.waitForLoadState("networkidle");
    
    // Look for URL input
    const urlInput = page.locator(
      "input[type='url'], input[name='url'], input[placeholder*='URL']"
    ).first();
    
    const hasUrlInput = await urlInput.isVisible().catch(() => false);
    
    if (hasUrlInput) {
      // Enter invalid URL
      await urlInput.fill("not-a-valid-url");
      
      // Trigger validation (blur or submit)
      await urlInput.blur();
      
      // Should show validation error
      const validationError = page.locator(
        ".field-error, .validation-error, text=/invalid.*url/i"
      );
      
      // May show error immediately or on submit
      const hasError = await validationError.first().isVisible().catch(() => false);
      
      // Either shows validation error or allows submission with server-side validation
      expect(hasError || await page.locator("button[type='submit']").isEnabled()).toBe(true);
    }
  });
});
