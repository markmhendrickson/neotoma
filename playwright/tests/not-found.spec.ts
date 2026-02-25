/**
 * E2E tests for 404 Not Found Page
 * 
 * Tests the catch-all route (*) for handling non-existent paths.
 */

import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";

test.describe("404 Not Found Page", () => {
  test("renders not-found content on unknown route", async ({ page }) => {
    await page.goto("/nonexistent-route");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: /page not found/i })).toBeVisible();
    await expect(page.getByText("404")).toBeVisible();
    await expect(page.getByText(/doesn't exist or has been moved/i)).toBeVisible();
  });

  test("offers navigation back to home", async ({ page }) => {
    await page.goto("/missing-page");
    await page.waitForLoadState("networkidle");

    const homeLink = page.getByRole("link", { name: /go to home/i });
    await expect(homeLink).toBeVisible();
    await homeLink.click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/$/);
  });
});
