import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";

test.describe("sitePage coverage", () => {
  test("renders homepage hero and install section", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", { name: /truth layer for persistent agent memory/i }),
    ).toBeVisible();
    await expect(page.locator("#install")).toBeVisible();
    await expect(page.getByRole("heading", { name: /install with npm/i })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /currently in developer release/i }),
    ).toBeVisible();
  });

  test("renders learn more links and footer navigation", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("a[href*='github.com/markmhendrickson/neotoma']").first()).toBeVisible();
    await expect(page.locator("a[href^='#']").first()).toBeVisible();
  });
});
