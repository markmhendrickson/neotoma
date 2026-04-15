import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";

test.describe("sitePage coverage", () => {
  test("renders homepage hero and key slides", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const title = await page.title();
    expect(title).toContain("Neotoma");

    await expect(page.locator("#intro")).toBeVisible();
    await expect(page.locator("#outcomes")).toBeAttached();
    await expect(page.locator("#memory-guarantees")).toBeAttached();
  });

  test("section controls render on desktop viewport", async ({ page}, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "Desktop-only section controls");
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const pageSections = page.getByRole("navigation", { name: /page sections/i });
    await expect(pageSections).toBeVisible();
    await expect(pageSections.getByRole("button")).toHaveCount(8);
  });

  test("intro content layer stretches to the section bottom on desktop", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "Desktop-only intro layout assertion");
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const metrics = await page.evaluate(() => {
      const intro = document.querySelector("#intro");
      const introLayer = document.querySelector("#intro > div");
      if (!(intro instanceof HTMLElement) || !(introLayer instanceof HTMLElement)) {
        return null;
      }

      const introRect = intro.getBoundingClientRect();
      const introLayerRect = introLayer.getBoundingClientRect();

      return {
        heightGap: Math.abs(introRect.height - introLayerRect.height),
        bottomGap: Math.abs(introRect.bottom - introLayerRect.bottom),
      };
    });

    expect(metrics).not.toBeNull();
    expect(metrics!.heightGap).toBeLessThanOrEqual(4);
    expect(metrics!.bottomGap).toBeLessThanOrEqual(4);
  });

  test("renders learn more links", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const githubLinks = page.locator("a[href*='github.com/markmhendrickson/neotoma']");
    expect(await githubLinks.count()).toBeGreaterThan(0);
  });

  test("install page code blocks use themed backgrounds instead of plain white", async ({ page }) => {
    await page.goto("/install");
    await page.waitForLoadState("networkidle");

    const codeBlockStyle = await page.evaluate(() => {
      const codeBlock = document.querySelector(".code-block-palette");
      if (!(codeBlock instanceof HTMLElement)) {
        return null;
      }

      return {
        backgroundColor: window.getComputedStyle(codeBlock).backgroundColor,
      };
    });

    expect(codeBlockStyle).not.toBeNull();
    expect(codeBlockStyle!.backgroundColor).not.toBe("rgb(255, 255, 255)");
  });

  test("footer section labels stay distinct from the footer background", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const footerLabelStyle = await page.evaluate(() => {
      const siteFooter = document.querySelector("#site-footer");
      const footer = siteFooter?.querySelector("footer");
      const productLabel = Array.from(footer?.querySelectorAll("p") ?? []).find(
        (node) => node.textContent?.trim() === "Product",
      );

      if (!(footer instanceof HTMLElement) || !(productLabel instanceof HTMLElement)) {
        return null;
      }

      return {
        footerBackground: window.getComputedStyle(footer).backgroundColor,
        labelColor: window.getComputedStyle(productLabel).color,
      };
    });

    expect(footerLabelStyle).not.toBeNull();
    expect(footerLabelStyle!.labelColor).not.toBe(footerLabelStyle!.footerBackground);
  });

  test("loads hashed section into view on initial page load", async ({ page }) => {
    await page.goto("/#evaluate");
    await page.waitForLoadState("networkidle");

    await expect.poll(() => page.url()).toContain("#evaluate");

    const evaluateSectionInView = await page.locator("#evaluate").evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const probeY = window.innerHeight * 0.35;
      return rect.top <= probeY && rect.bottom >= probeY;
    });
    expect(evaluateSectionInView).toBe(true);
  });

  test("updates URL hash as active section changes", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.locator("#who").scrollIntoViewIfNeeded();

    await expect.poll(() => page.url()).toContain("#who");
  });

  test("subpage routes render with back-to-home link", async ({ page }) => {
    const subpages = [
      { path: "/terminology" },
      { path: "/agent-instructions" },
      { path: "/api" },
      { path: "/mcp" },
      { path: "/cli" },
      { path: "/docs" },
      { path: "/evaluate" },
      { path: "/install" },
    ];

    for (const sp of subpages) {
      await page.goto(sp.path);
      await page.waitForLoadState("networkidle");

      await expect
        .poll(() => page.url())
        .toContain(sp.path);
    }
  });

  test("evaluate page documents the canonical onboarding sequence", async ({ page }) => {
    await page.goto("/evaluate");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText(/evaluation -> installation -> activation -> tooling config/i).first(),
    ).toBeVisible();
    await expect(page.getByText(/If it is already installed, skip straight to activation/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /installation guide/i }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /agent resource map/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "ChatGPT" }).first()).toBeVisible();
    await expect(page.locator('a[href="/neotoma-with-claude"]').first()).toBeVisible();
    await expect(page.locator('a[href="/neotoma-with-cursor"]').first()).toBeVisible();
  });

  test("mobile evaluate copy controls span usable width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.locator("#evaluate").scrollIntoViewIfNeeded();

    const homeSection = page.locator("#evaluate");
    const homeCopy = homeSection.getByRole("button", { name: /copy prompt/i });
    await expect(homeCopy).toBeVisible();
    const homeSectionBox = await homeSection.boundingBox();
    const homeCopyBox = await homeCopy.boundingBox();
    expect(homeSectionBox).not.toBeNull();
    expect(homeCopyBox).not.toBeNull();
    expect(homeCopyBox!.width).toBeGreaterThanOrEqual(homeSectionBox!.width * 0.82);

    await page.goto("/evaluate");
    await page.waitForLoadState("networkidle");

    const promptShell = page
      .getByText("Evaluation prompt", { exact: true })
      .locator("xpath=ancestor::div[contains(@class,'border-emerald')][1]");
    const evaluateCopy = promptShell.getByRole("button", { name: /^copy$/i });
    await expect(evaluateCopy).toBeVisible();
    const shellBox = await promptShell.boundingBox();
    const evaluateCopyBox = await evaluateCopy.boundingBox();
    expect(shellBox).not.toBeNull();
    expect(evaluateCopyBox).not.toBeNull();
    expect(evaluateCopyBox!.width).toBeGreaterThanOrEqual(shellBox!.width * 0.82);
  });

  test("evaluate page tells agents to inspect broader context before recommending fit", async ({
    page,
  }) => {
    await page.goto("/evaluate");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText(/do not give a fit recommendation from the URL alone/i).first(),
    ).toBeVisible();
    await expect(
      page.getByText(/Start by checking the user's broader tool context first/i).first(),
    ).toBeVisible();
    await expect(
      page.getByText(/what context you checked/i).first(),
    ).toBeVisible();
    await expect(
      page.getByText(/star or follow the project/i).first(),
    ).toBeVisible();
  });

  test("install and integration pages funnel users to evaluation first", async ({ page }) => {
    const routes = [
      "/install",
      "/neotoma-with-chatgpt",
      "/neotoma-with-claude",
      "/neotoma-with-cursor",
      "/neotoma-with-openclaw",
    ];

    for (const path of routes) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page.getByText(/Start with evaluation/i).first()).toBeVisible();
    }
  });

  test("site header keeps evaluate, install, and architecture links available", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "Desktop-only header nav assertion");

    const routes = ["/", "/docs"];

    for (const path of routes) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");

      const header = page.getByRole("banner");
      await expect(header.getByRole("link", { name: /^evaluate$/i }).first()).toBeVisible();
      await expect(header.getByRole("link", { name: /^install$/i }).first()).toBeVisible();
      await expect(header.getByRole("link", { name: /^architecture$/i }).first()).toBeVisible();
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
