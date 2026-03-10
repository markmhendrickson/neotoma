import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";

test.describe("sitePage coverage", () => {
  test("renders homepage hero and key slides", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", { name: /your production agent has amnesia/i }),
    ).toBeVisible();

    await expect(page.locator("#intro")).toBeVisible();
    await expect(page.locator("#architecture")).toBeAttached();
    await expect(page.locator("#install")).toBeAttached();
  });

  test("dot navigation renders on desktop viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const dotNav = page.getByRole("navigation", { name: /page sections/i });
    await expect(dotNav).toBeVisible();

    const dots = dotNav.getByRole("button");
    await expect(dots).toHaveCount(8);
  });

  test("renders learn more links", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("a[href*='github.com/markmhendrickson/neotoma']").first()).toBeVisible();
  });

  test("loads hashed section into view on initial page load", async ({ page }) => {
    await page.goto("/#install");
    await page.waitForLoadState("networkidle");

    await expect.poll(() => page.url()).toContain("#install");

    const installSectionInView = await page.locator("#install").evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const probeY = window.innerHeight * 0.35;
      return rect.top <= probeY && rect.bottom >= probeY;
    });
    expect(installSectionInView).toBe(true);
  });

  test("updates URL hash as active section changes", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.locator("#who-is-it-for").scrollIntoViewIfNeeded();

    await expect.poll(() => page.url()).toContain("#who-is-it-for");
  });

  test("subpage routes render with back-to-home link", async ({ page }) => {
    const subpages = [
      { path: "/terminology", heading: /core terminology/i },
      { path: "/agent-instructions", heading: /agent instructions/i },
      { path: "/api", heading: /api and openapi/i },
      { path: "/mcp", heading: /model context protocol/i },
      { path: "/cli", heading: /command-line interface/i },
      { path: "/docker", heading: /run with docker/i },
    ];

    for (const sp of subpages) {
      await page.goto(sp.path);
      await page.waitForLoadState("networkidle");

      await expect(page.getByRole("heading", { name: sp.heading })).toBeVisible();
      await expect(page.getByRole("link", { name: /back to home/i })).toBeVisible();
    }
  });

  test("SEO meta tags are present on homepage", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const title = await page.title();
    expect(title).toContain("Neotoma");

    const desc = page.locator('meta[name="description"]');
    await expect(desc).toHaveAttribute("content", /truth layer|deterministic/i);

    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute("href", /neotoma\.io/);

    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute("content", /Neotoma/);

    const twitterCard = page.locator('meta[name="twitter:card"]');
    await expect(twitterCard).toHaveAttribute("content", "summary_large_image");

    const jsonLd = page.locator('script[type="application/ld+json"]');
    const count = await jsonLd.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("SEO meta tags are present on subpages", async ({ page }) => {
    const routes = [
      { path: "/docs", titleContains: "Documentation" },
      { path: "/architecture", titleContains: "Architecture" },
      { path: "/cli", titleContains: "CLI" },
    ];

    for (const route of routes) {
      await page.goto(route.path);
      await page.waitForLoadState("networkidle");

      const title = await page.title();
      expect(title).toContain(route.titleContains);

      const canonical = page.locator('link[rel="canonical"]');
      await expect(canonical).toHaveAttribute("href", new RegExp(`neotoma\\.io${route.path}`));

      const desc = page.locator('meta[name="description"]');
      const content = await desc.getAttribute("content");
      expect(content).toBeTruthy();
      expect(content!.length).toBeGreaterThan(20);
    }
  });

  test("locale-prefixed routes render and expose localized seo tags", async ({ page }) => {
    await page.goto("/es/docs");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: /documentation|all documentation/i })).toBeVisible();
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "es_ES");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /neotoma\.io\/es\/docs/);
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
      "href",
      /neotoma\.io\/docs$/,
    );
  });

  test("language switcher changes locale path prefix", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const languageSelector = page.locator("#site-locale-select");
    await expect(languageSelector).toBeVisible();
    await languageSelector.selectOption("de");

    await expect.poll(() => page.url()).toContain("/de");
  });
});
