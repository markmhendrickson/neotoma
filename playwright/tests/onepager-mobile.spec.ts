import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";

test.describe("one-pager mobile visual parity", () => {
  for (const width of [320, 390, 1280]) {
    test(`paper scenes and controls fit at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/");
      const scenes = page.locator("[data-paper-scene]");
      await expect(scenes).toHaveCount(13);
      for (const scene of await scenes.all()) {
        await expect(scene.locator("title")).not.toBeEmpty();
        const box = await scene.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThan(0);
        expect(box!.x).toBeGreaterThanOrEqual(-1);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width + 1
      );
      await expect(page.getByRole("tab", { name: "App" })).toHaveAttribute("aria-selected", "true");
      await page.getByRole("tab", { name: "REST API" }).click();
      await expect(
        page.getByRole("tabpanel", { name: "REST API" }).getByRole("button", { name: "Copy" })
      ).toBeVisible();
      const pill = page.getByRole("button", { name: "MCP", exact: true });
      await pill.click();
      await expect(pill).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator(`#${await pill.getAttribute("aria-controls")}`)).toBeVisible();
    });
  }
});
