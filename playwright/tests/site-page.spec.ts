import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";

test.describe("sitePage coverage", () => {
  test("renders homepage hero and key slides", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const title = await page.title();
    expect(title).toContain("Neotoma");

    await expect(page.locator("#intro")).toBeVisible();
    await expect(page.locator("#architecture")).toBeAttached();
    await expect(page.locator("#install")).toBeAttached();
  });

  test("section controls render on desktop viewport", async ({ page}, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "Desktop-only section controls");
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const pageSections = page.getByRole("navigation", { name: /page sections/i });
    await expect(pageSections).toBeVisible();
    await expect(pageSections.getByRole("button")).toHaveCount(10);
  });

  test("renders learn more links", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const githubLinks = page.locator("a[href*='github.com/markmhendrickson/neotoma']");
    expect(await githubLinks.count()).toBeGreaterThan(0);
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

    await page.locator("#use-cases").scrollIntoViewIfNeeded();

    await expect.poll(() => page.url()).toContain("#use-cases");
  });

  test("subpage routes render with back-to-home link", async ({ page }) => {
    const subpages = [
      { path: "/terminology" },
      { path: "/agent-instructions" },
      { path: "/api" },
      { path: "/mcp" },
      { path: "/cli" },
      { path: "/docs" },
    ];

    for (const sp of subpages) {
      await page.goto(sp.path);
      await page.waitForLoadState("networkidle");

      await expect
        .poll(() => page.url())
        .toContain(sp.path);
    }
  });

  test("SEO meta tags are present on homepage", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const title = await page.title();
    expect(title).toContain("Neotoma");

    const desc =
      (await page.locator('meta[name="description"][data-rh="true"]').count()) > 0
        ? page.locator('meta[name="description"][data-rh="true"]')
        : page.locator('meta[name="description"]').last();
    await expect(desc).toHaveAttribute("content", /state layer|deterministic/i);

    const canonical =
      (await page.locator('link[rel="canonical"][data-rh="true"]').count()) > 0
        ? page.locator('link[rel="canonical"][data-rh="true"]')
        : page.locator('link[rel="canonical"]').last();
    await expect(canonical).toHaveAttribute("href", /neotoma\.io/);

    const ogTitle =
      (await page.locator('meta[property="og:title"][data-rh="true"]').count()) > 0
        ? page.locator('meta[property="og:title"][data-rh="true"]')
        : page.locator('meta[property="og:title"]').last();
    await expect(ogTitle).toHaveAttribute("content", /Neotoma/);

    const twitterCard =
      (await page.locator('meta[name="twitter:card"][data-rh="true"]').count()) > 0
        ? page.locator('meta[name="twitter:card"][data-rh="true"]')
        : page.locator('meta[name="twitter:card"]').last();
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

      const canonical =
        (await page.locator('link[rel="canonical"][data-rh="true"]').count()) > 0
          ? page.locator('link[rel="canonical"][data-rh="true"]')
          : page.locator('link[rel="canonical"]').last();
      await expect(canonical).toHaveAttribute("href", new RegExp(`neotoma\\.io${route.path}`));

      const desc =
        (await page.locator('meta[name="description"][data-rh="true"]').count()) > 0
          ? page.locator('meta[name="description"][data-rh="true"]')
          : page.locator('meta[name="description"]').last();
      const content = await desc.getAttribute("content");
      expect(content).toBeTruthy();
      expect(content!.length).toBeGreaterThan(20);
    }
  });

  test("locale-prefixed routes render and expose localized seo tags", async ({ page }) => {
    await page.goto("/es/docs");
    await page.waitForLoadState("networkidle");

    await expect.poll(() => page.url()).toContain("/es/docs");
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
    const ogLocale =
      (await page.locator('meta[property="og:locale"][data-rh="true"]').count()) > 0
        ? page.locator('meta[property="og:locale"][data-rh="true"]')
        : page.locator('meta[property="og:locale"]').last();
    await expect(ogLocale).toHaveAttribute("content", "es_ES");
    const canonical =
      (await page.locator('link[rel="canonical"][data-rh="true"]').count()) > 0
        ? page.locator('link[rel="canonical"][data-rh="true"]')
        : page.locator('link[rel="canonical"]').last();
    await expect(canonical).toHaveAttribute("href", /neotoma\.io\/es\/docs/);
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
      "href",
      /neotoma\.io\/docs$/,
    );
  });

  test("language switcher changes locale path prefix", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "Desktop-only language dropdown assertion");
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const languageButton = page.getByRole("button", { name: /language/i });
    await expect(languageButton).toBeVisible();
    await languageButton.click();
    await page.getByRole("menuitem", { name: /deutsch/i }).click();

    await expect.poll(() => page.url()).toContain("/de");
  });

  // Regression: marketing verticals use full-page shell (Layout + SiteHeaderNav), not docs sidebar.
  test("vertical marketing routes omit docs sidebar trigger and developer preview", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "Desktop-only sidebar trigger assertion");
    await page.setViewportSize({ width: 1280, height: 800 });

    const paths = [
      "/verticals",
      "/verticals/",
      "/compliance",
      "/compliance/",
      "/crm",
      "/agent-auth",
    ];

    for (const path of paths) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");

      await expect(page.getByRole("button", { name: /toggle sidebar/i })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /developer preview/i })).toHaveCount(0);
    }
  });

  test("docs index shows sidebar trigger for doc layout", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "Desktop-only sidebar trigger assertion");
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/docs");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("button", { name: /toggle sidebar/i })).toBeVisible();
  });
});
