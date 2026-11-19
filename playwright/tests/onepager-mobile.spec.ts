import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";

test.describe("one-pager mobile visual parity", () => {
  for (const width of [320, 390, 1280]) {
    test(`paper scenes and controls fit at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/");
      const scenes = page.locator("[data-paper-scene]");
      await expect(scenes).toHaveCount(16);
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

test.describe("legal page mobile width", () => {
  for (const route of ["/privacy", "/terms", "/sandbox/terms-of-use"]) {
    test(`${route} wraps long inline references at 320px`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 844 });
      await page.goto(route);
      await expect(page.locator("main")).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        321
      );
    });
  }
});

test.describe("install reader formatting", () => {
  for (const locale of ["en", "es"]) {
    for (const width of [320, 390, 961, 1280]) {
      test(`${locale} install matches editorial rails and controls at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const prefix = locale === "es" ? "/es" : "";
        await page.goto(`${prefix}/compare`);
        const reference = await page.locator("main h1").evaluate((heading) => ({
          font: getComputedStyle(heading).fontSize,
          x: heading.getBoundingClientRect().x,
        }));
        await page.goto(`${prefix}/install`);
        const title = page.locator("main h1");
        await expect(title).toHaveCount(1);
        expect(await title.evaluate((heading) => getComputedStyle(heading).fontSize)).toBe(reference.font);
        expect((await title.boundingBox())!.x).toBeCloseTo(reference.x, 0);
        const bodyWidth = await page.locator(".plan-install-sheet > div").evaluate((body) => body.getBoundingClientRect().width);
        for (const heading of await page.locator(".plan-install-sheet > div > h2").all()) {
          expect((await heading.boundingBox())!.width).toBeCloseTo(bodyWidth, 0);
        }
        await page.locator(".plan-tool-preflight > summary").click();
        const permissions = page.locator("#permissions-preflight-heading");
        await expect(permissions).toBeVisible();
        const type = await permissions.evaluate((heading) => ({
          size: parseFloat(getComputedStyle(heading).fontSize),
          width: heading.getBoundingClientRect().width,
          availableWidth: heading.parentElement!.getBoundingClientRect().width,
          family: getComputedStyle(heading).fontFamily,
          descriptionFamily: getComputedStyle(heading.nextElementSibling!).fontFamily,
        }));
        expect(type.size).toBeLessThanOrEqual(20);
        expect(type.width).toBeCloseTo(type.availableWidth, 0);
        expect(type.family).toBe(type.descriptionFamily);
        await page.getByRole("combobox").click();
        await page.getByRole("option", { name: "Cursor", exact: true }).click();
        await expect(permissions).toContainText("Cursor");
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      });
    }
  }
});
