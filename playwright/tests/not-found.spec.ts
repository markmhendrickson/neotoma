/**
 * E2E tests for 404 Not Found Page
 * 
 * Tests the catch-all route (*) for handling non-existent paths.
 */

import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";

test.describe("Unknown route handling", () => {
  test("unknown routes still render site shell", async ({ page }) => {
    await page.goto("/nonexistent-route");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("link", { name: /neotoma home/i })).toBeVisible();
    await expect(page.locator("#intro")).toBeVisible();
  });

  test("header home link navigates to root", async ({ page }) => {
    await page.goto("/missing-page");
    await page.waitForLoadState("networkidle");

    const homeLink = page.getByRole("link", { name: /neotoma home/i });
    await expect(homeLink).toBeVisible();
    await homeLink.click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/$/);
  });
});
