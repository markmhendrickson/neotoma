/**
 * E2E tests for 404 Not Found Page
 * 
 * Tests the catch-all route (*) for handling non-existent paths.
 */

import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";

test.describe("Unknown route handling", () => {
  test("unknown routes show 404 with site header", async ({ page }) => {
    await page.goto("/nonexistent-route");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("link", { name: /neotoma home/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /page not found/i })).toBeVisible();
    await expect(page.locator("#intro")).toHaveCount(0);
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

type Rgba = [number, number, number, number];

test.describe("404 primary action contrast", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`Go home label retains contrast in both themes (${theme})`, async ({ page }) => {
      await page.addInitScript((value) => {
        window.localStorage.setItem("theme", value);
      }, theme);
      await page.goto("/missing-page");
      await page.waitForLoadState("networkidle");
      await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*dark).*$/);

      // The 404 renders inside the reader layout, whose `.plan a { color: inherit }`
      // rule is the one the primary action must override.
      const link = page.locator(".plan-reader-page").getByRole("link", { name: /go home/i });
      await expect(link).toBeVisible();

      // Normalise any CSS colour to RGBA in the browser, and resolve the real
      // `--background` token through the stylesheet rather than hardcoding it.
      const readColors = () =>
        page.evaluate(() => {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1;
          const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
          const toRgba = (css: string): number[] => {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = "#000";
            ctx.fillStyle = css;
            ctx.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
            return [r, g, b, a / 255];
          };
          const el = document.querySelector<HTMLElement>(".plan-reader-page a[href]");
          const links = Array.from(
            document.querySelectorAll<HTMLElement>(".plan-reader-page a")
          ).filter((a) => /go home/i.test(a.textContent ?? ""));
          const a = links[0] ?? el!;
          const probe = document.createElement("div");
          probe.style.backgroundColor = "hsl(var(--background))";
          document.body.appendChild(probe);
          const token = getComputedStyle(probe).backgroundColor;
          probe.remove();
          const cs = getComputedStyle(a);
          // Backdrop under the fill: first opaque ancestor background.
          let backdrop = "rgb(255, 255, 255)";
          for (let n = a.parentElement; n; n = n.parentElement) {
            const bg = getComputedStyle(n).backgroundColor;
            if (toRgba(bg)[3] > 0) {
              backdrop = bg;
              break;
            }
          }
          return {
            text: toRgba(cs.color),
            token: toRgba(token),
            fill: toRgba(cs.backgroundColor),
            backdrop: toRgba(backdrop),
          };
        });

      const luminance = ([r, g, b]: number[]) => {
        const lin = (c: number) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      };
      const composite = (top: Rgba, under: Rgba): Rgba => {
        const a = top[3];
        return [
          top[0] * a + under[0] * (1 - a),
          top[1] * a + under[1] * (1 - a),
          top[2] * a + under[2] * (1 - a),
          1,
        ];
      };
      const contrast = (a: Rgba, b: Rgba) => {
        const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
      };

      const assertState = async (state: string) => {
        // Transitions run on colour; poll until the settled values satisfy the rule.
        await expect
          .poll(
            async () => {
              const c = await readColors();
              const fill = composite(c.fill as Rgba, c.backdrop as Rgba);
              return {
                textEqualsToken: c.text.join(",") === c.token.join(","),
                ratio: contrast(c.text as Rgba, fill),
              };
            },
            { message: `${theme} ${state}`, timeout: 5_000 }
          )
          .toEqual({ textEqualsToken: true, ratio: expect.toBeGreaterThanOrEqual(4.5) });
      };

      await page.mouse.move(0, 0);
      await assertState("at rest");
      await link.hover();
      await assertState("on hover");
    });
  }
});
