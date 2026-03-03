import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";

test.describe("sitePage coverage", () => {
  test("renders homepage hero and install section", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const heroHeading = page
      .getByRole("heading", { name: /your production agent is amnesiac/i })
      .or(page.getByRole("heading", { name: /truth layer for persistent agent memory/i }));
    await expect(heroHeading).toBeVisible();
    await expect(page.locator("#install")).toBeVisible();
    await expect(page.getByRole("heading", { name: /install with npm/i })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /currently in developer release/i }),
    ).toBeVisible();
    const heroImage = page
      .getByRole("img", { name: /memory correctness layer for ai agents/i })
      .or(page.getByRole("img", { name: /screen recording: agent thinking and planning/i }));
    await expect(heroImage).toBeVisible();
    await expect(page.getByRole("heading", { name: /use cases/i })).toBeVisible();
  });

  test("renders learn more links and footer navigation", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("a[href*='github.com/markmhendrickson/neotoma']").first()).toBeVisible();
    await expect(page.locator("a[href^='#']").first()).toBeVisible();
  });
});
