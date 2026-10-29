#!/usr/bin/env tsx
/**
 * Static site builder for GitHub Pages (neotoma.io).
 *
 * Adding a new public page:
 *   1. Add the route to APP_ROUTES in frontend/src/components/MainApp.tsx.
 *   2. Add an entry to ROUTE_METADATA in frontend/src/site/seo_metadata.ts
 *      with at least title, description, and robots ("index,follow" for
 *      indexable pages). Pages with "index,follow" are automatically
 *      included in the sitemap and prerendered as static HTML.
 *   3. Run `npm run validate:routes` to confirm parity.
 *   4. After building (`npm run build:site:pages`), run
 *      `npm run validate:site-export` to verify the HTML was emitted.
 *
 * CI runs both validations before deploying; a mismatch blocks the deploy.
 *
 * Curated topic pages (/<slug>/) are rendered from repository
 * markdown listed in frontend/src/site/docs_viewer_manifest.ts (see scripts/docs_viewer/).
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { captureTopicVisuals } from "./docs_viewer/capture_visuals";
import { build as buildBrowserAsset } from "esbuild";
import { NON_DEFAULT_LOCALES, SUPPORTED_LOCALES } from "../frontend/src/i18n/config";
import { localizePath } from "../frontend/src/i18n/routing";
import {
  RETIRED_DESTINATIONS,
  buildRedirectStub,
  isRetiredRoute,
} from "../frontend/src/site/route_retirement";
import {
  isDocsViewerRoute,
  SPANISH_DOCS_VIEWER_MANIFEST,
} from "../frontend/src/site/docs_viewer_manifest";
import {
  appendSitemapUrls,
  docsViewerAliasRoutes,
  docsViewerSitemapUrls,
  formatReport,
  runDocsViewer,
} from "./docs_viewer/build";
import { dedupeJsonLd } from "./site_html";
import { assertUiSourceBinding } from "./site_ui_source_binding";
import {
  buildRobotsTxt,
  buildSitemapXml,
  INDEXABLE_SITE_PAGE_PATHS,
  injectRouteMetaIntoHtml,
  isSitePreview,
  SITEMAP_PATHS,
} from "../frontend/src/site/seo_metadata";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const docsSourceContext = process.env.SITE_PREVIEW === "1" ? "local-preview" : "published";
const outputDir = path.join(repoRoot, "site_pages");
const outputFile = path.join(outputDir, "index.html");
const noJekyllFile = path.join(outputDir, ".nojekyll");
const publicRootDir = path.join(repoRoot, "frontend", "public");
const heroImageSrc = path.join(repoRoot, "frontend", "public", "neotoma-hero.png");
const heroImageDest = path.join(outputDir, "neotoma-hero.png");
const ogImageSrc = path.join(repoRoot, "frontend", "public", "neotoma-og-1200x630.png");
const ogImageDest = path.join(outputDir, "neotoma-og-1200x630.png");
const wordmarkSrc = path.join(repoRoot, "frontend", "public", "neotoma-wordmark.svg");
const wordmarkDest = path.join(outputDir, "neotoma-wordmark.svg");
const robotsFile = path.join(outputDir, "robots.txt");
const sitemapFile = path.join(outputDir, "sitemap.xml");
const llmsTxtSrc = path.join(repoRoot, "frontend", "public", "llms.txt");
const llmsTxtDest = path.join(outputDir, "llms.txt");
const notFoundFile = path.join(outputDir, "404.html");
const publicIndex = path.join(repoRoot, "public", "index.html");
const publicAssetsDir = path.join(repoRoot, "public", "assets");
const publicRootAssets = [
  "favicon.ico",
  "favicon.svg",
  "favicon-16x16.png",
  "favicon-32x32.png",
  "favicon-48x48.png",
  "apple-touch-icon.png",
  "android-chrome-192x192.png",
  "android-chrome-512x512.png",
  "site.webmanifest",
] as const;

const buildId =
  process.env.GITHUB_SHA?.slice(0, 7) || process.env.BUILD_ID || `local-${Date.now()}`;

function markdownMirrorStaticPaths(): string[] {
  const out: string[] = [];
  for (const p of INDEXABLE_SITE_PAGE_PATHS) {
    const md = p === "/" ? "/markdown" : `/markdown${p}`;
    out.push(md);
    for (const loc of NON_DEFAULT_LOCALES) {
      out.push(localizePath(md, loc));
    }
  }
  return out;
}

/**
 * Read Vite build output. Keep bundled entrypoints as root-absolute `/assets/…`
 * so every static HTML file (/, nested routes, 404) resolves the same chunk URLs.
 * Relative `assets/` or `../assets/` breaks when prerendered HTML drifts from the
 * deployed `public/assets` manifest (nested pages showed wrong hashes on neotoma.io).
 */
function readPublicHtml(): string {
  if (!fs.existsSync(publicIndex)) {
    throw new Error("Missing public/index.html (run 'npm run build:ui' first).");
  }
  const html = fs.readFileSync(publicIndex, "utf-8");
  const ui = assertUiSourceBinding(html, repoRoot, isSitePreview() ? "preview" : "public");
  console.log(
    `Source-bound UI entry: ${ui.entry} (${ui.entrySha256.slice(0, 12)}), ${ui.mode}, ${ui.head.slice(0, 12)}`
  );
  let out = html;
  const buildComment = `\n    <!-- build: ${buildId} -->`;
  if (out.includes("</head>")) {
    out = out.replace("</head>", `${buildComment}\n  </head>`);
  }
  return out;
}

/** Collapse `../../../assets/` to `/assets/` (Playwright serializes root `/assets/` as `../assets/` on nested URLs). */
function normalizeBundledAssetPaths(html: string): string {
  return html.replace(/(\.\.\/)+assets\//g, "/assets/");
}

/** Final pass: normalize every emitted HTML file (prerender + any stale copies). */
function finalizeBundledAssetPathsInAllHtml(): void {
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, name.name);
      if (name.isDirectory()) walk(p);
      else if (name.isFile() && name.name.endsWith(".html")) {
        const html = fs.readFileSync(p, "utf-8");
        const next = normalizeBundledAssetPaths(html);
        if (next !== html) fs.writeFileSync(p, next, "utf-8");
      }
    }
  };
  walk(outputDir);
}

function buildHtmlForRoute(rootHtml: string, routePath: string): string {
  return injectRouteMetaIntoHtml(rootHtml, routePath);
}

function getOutputPathForRoute(routePath: string): string {
  if (routePath === "/") return outputFile;
  return path.join(outputDir, routePath.replace(/^\//, ""), "index.html");
}

function getContentType(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".webmanifest")) return "application/manifest+json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (filePath.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function startStaticServer(
  rootDir: string
): Promise<{ origin: string; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://localhost");
      const rawPath = decodeURIComponent(url.pathname);
      const cleanPath = rawPath.replace(/^\/+/, "");
      const candidates = [
        path.join(rootDir, cleanPath),
        path.join(rootDir, cleanPath, "index.html"),
      ];
      if (rawPath === "/") {
        candidates.unshift(path.join(rootDir, "index.html"));
      }

      let filePath = candidates.find(
        (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()
      );
      let statusCode = 200;

      if (!filePath) {
        filePath = path.join(rootDir, "404.html");
        statusCode = 404;
      }

      try {
        const content = fs.readFileSync(filePath);
        res.statusCode = statusCode;
        res.setHeader("Content-Type", getContentType(filePath));
        res.end(content);
      } catch {
        res.statusCode = 500;
        res.end("Internal server error");
      }
    });

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to start prerender HTTP server."));
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise<void>((done, fail) => server.close((err) => (err ? fail(err) : done()))),
      });
    });
  });
}

async function prerenderHtmlRoutes(routePaths: readonly string[]): Promise<void> {
  const { chromium } = await import("playwright");
  const server = await startStaticServer(outputDir);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  page.on("pageerror", (error) => {
    console.error(`prerender page error: ${error.message}`);
  });

  try {
    for (const routePath of routePaths) {
      const targetUrl = `${server.origin}${routePath}`;
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      // The module bundle can finish after DOMContentLoaded; never freeze an empty SPA shell.
      await page.locator("#root > *").first().waitFor({ timeout: 30000 });
      const renderedHtml = dedupeJsonLd(normalizeBundledAssetPaths(await page.content()));
      fs.writeFileSync(
        getOutputPathForRoute(routePath),
        `<!DOCTYPE html>\n${renderedHtml}\n`,
        "utf-8"
      );
    }

    // The reading pages contain no script. Capture their figures from the same settled,
    // texture-loaded scenes used by the homepage, then ship small raster assets.
    await page.goto(`${server.origin}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator("#root > *").first().waitFor({ timeout: 30000 });
    await page.locator('svg[data-paper-scene="localService"]').first().waitFor();
    await captureTopicVisuals(page, outputDir);

    await page.goto(`${server.origin}/404`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(250);
    const notFoundHtml = dedupeJsonLd(normalizeBundledAssetPaths(await page.content()));
    fs.writeFileSync(notFoundFile, `<!DOCTYPE html>\n${notFoundHtml}\n`, "utf-8");
  } finally {
    await page.close();
    await browser.close();
    await server.close();
  }
}

async function main() {
  // Fail before copying assets or modifying the export when UI source, mode or
  // the trusted reader enhancement no longer matches the compiled entry.
  const rootHtml = readPublicHtml();
  // Docs viewer: lint the whitelist first, so an included file that fails stops the build early.
  const docsViewer = runDocsViewer({ repoRoot, sourceContext: docsSourceContext });
  console.log(formatReport(docsViewer));
  if (docsViewer.failures.length) {
    throw new Error(`Docs viewer lint failed:\n${docsViewer.failures.join("\n")}`);
  }
  const spanishViewer = runDocsViewer({
    repoRoot,
    manifest: SPANISH_DOCS_VIEWER_MANIFEST,
    sourceContext: docsSourceContext,
  });
  const missingSpanish = spanishViewer.reports.filter(
    (report) => report.entry.status === "included" && !report.exists
  );
  if (spanishViewer.failures.length || missingSpanish.length) {
    throw new Error(
      `Spanish docs viewer is incomplete:\n${[
        ...spanishViewer.failures,
        ...missingSpanish.map((report) => report.entry.source),
      ].join("\n")}`
    );
  }
  fs.mkdirSync(outputDir, { recursive: true });
  const legacyCssFile = path.join(outputDir, "site.css");
  if (fs.existsSync(legacyCssFile)) {
    fs.rmSync(legacyCssFile);
  }
  if (!fs.existsSync(publicAssetsDir)) {
    throw new Error("Missing public/assets (run 'npm run build:ui' first).");
  }
  const outputAssetsDir = path.join(outputDir, "assets");
  if (fs.existsSync(outputAssetsDir)) {
    fs.rmSync(outputAssetsDir, { recursive: true, force: true });
  }
  fs.cpSync(publicAssetsDir, outputAssetsDir, { recursive: true });
  if (process.env.VITE_UMAMI_URL?.trim() && process.env.VITE_UMAMI_WEBSITE_ID?.trim()) {
    await buildBrowserAsset({
      entryPoints: [path.join(repoRoot, "frontend/src/utils/reader_analytics.ts")],
      outfile: path.join(outputAssetsDir, "reader-analytics.js"),
      bundle: true,
      format: "iife",
      platform: "browser",
      target: "es2020",
      minify: true,
    });
  }

  // The checked-in site_pages tree can hold stale HTML for routes that no longer exist. Remove every
  // route directory that contains HTML (non-HTML asset folders such as og/ are kept); all live,
  // held and retired routes are regenerated below.
  const dirHasHtml = (dir: string): boolean =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .some((e) =>
        e.isDirectory() ? dirHasHtml(path.join(dir, e.name)) : e.name.endsWith(".html")
      );
  for (const entry of fs.readdirSync(outputDir, { withFileTypes: true })) {
    const full = path.join(outputDir, entry.name);
    if (entry.isDirectory() && dirHasHtml(full)) fs.rmSync(full, { recursive: true, force: true });
  }

  // Seed static route files with route-specific metadata.
  fs.writeFileSync(outputFile, buildHtmlForRoute(rootHtml, "/"), "utf-8");

  // Pre-render per-route HTML so bots see correct meta tags without executing JS
  for (const locale of SUPPORTED_LOCALES) {
    const localizedRoot = localizePath("/", locale);
    if (!SITEMAP_PATHS.includes(localizedRoot)) {
      throw new Error(`SITEMAP_PATHS missing localized root route: ${localizedRoot}`);
    }
  }

  // Every retired route gets a stub, including routes that were never in the sitemap and their
  // locale variants, so no stale committed page for a retired route can be deployed.
  const retiredStubPaths = Object.keys(RETIRED_DESTINATIONS).flatMap((route) => [
    route,
    ...NON_DEFAULT_LOCALES.map((loc) => localizePath(route, loc)),
  ]);
  const allStaticRoutePaths = [
    ...new Set([
      "/en",
      ...SITEMAP_PATHS,
      ...markdownMirrorStaticPaths(),
      ...retiredStubPaths,
      ...docsViewerAliasRoutes(docsViewer.published),
    ]),
  ];

  // Retired routes (every locale route and every old page that is not
  // live, held or a curated topic, see frontend/src/site/route_retirement.ts) become static redirect stubs. They
  // are written directly and are never pre-rendered.
  const retiredRoutePaths = allStaticRoutePaths.filter((r) => r !== "/" && isRetiredRoute(r));
  const renderedRoutePaths = allStaticRoutePaths.filter(
    (r) => r === "/" || (!isRetiredRoute(r) && !isDocsViewerRoute(r))
  );

  let routeCount = 0;
  for (const routePath of allStaticRoutePaths) {
    if (routePath === "/" || isDocsViewerRoute(routePath)) continue; // written by the docs viewer
    const slug = routePath.replace(/^\//, "");
    const routeDir = path.join(outputDir, slug);
    fs.mkdirSync(routeDir, { recursive: true });
    fs.writeFileSync(
      path.join(routeDir, "index.html"),
      isRetiredRoute(routePath)
        ? buildRedirectStub(routePath)
        : buildHtmlForRoute(rootHtml, routePath),
      "utf-8"
    );
    routeCount++;
  }

  fs.writeFileSync(notFoundFile, buildHtmlForRoute(rootHtml, "/404"), "utf-8");

  fs.writeFileSync(noJekyllFile, "", "utf-8");
  for (const assetName of publicRootAssets) {
    const src = path.join(publicRootDir, assetName);
    const dest = path.join(outputDir, assetName);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`Copied root asset: ${path.relative(repoRoot, dest)}`);
    }
  }
  if (fs.existsSync(heroImageSrc)) {
    fs.copyFileSync(heroImageSrc, heroImageDest);
    console.log(`Copied hero image: ${path.relative(repoRoot, heroImageDest)}`);
  }
  if (fs.existsSync(ogImageSrc)) {
    fs.copyFileSync(ogImageSrc, ogImageDest);
    console.log(`Copied OG image: ${path.relative(repoRoot, ogImageDest)}`);
  }
  if (fs.existsSync(wordmarkSrc)) {
    fs.copyFileSync(wordmarkSrc, wordmarkDest);
    console.log(`Copied wordmark: ${path.relative(repoRoot, wordmarkDest)}`);
  }
  const brandSrc = path.join(publicRootDir, "brand");
  if (fs.existsSync(brandSrc)) {
    fs.cpSync(brandSrc, path.join(outputDir, "brand"), { recursive: true });
    console.log("Copied brand assets: site_pages/brand");
  }
  fs.writeFileSync(robotsFile, buildRobotsTxt(), "utf-8");
  fs.writeFileSync(
    sitemapFile,
    appendSitemapUrls(
      buildSitemapXml(SITEMAP_PATHS.filter((p) => !isRetiredRoute(p) && !isDocsViewerRoute(p))),
      isSitePreview()
        ? []
        : [
            ...docsViewerSitemapUrls(docsViewer.published),
            ...docsViewerSitemapUrls(spanishViewer.published),
          ]
    ),
    "utf-8"
  );
  if (fs.existsSync(llmsTxtSrc)) {
    fs.copyFileSync(llmsTxtSrc, llmsTxtDest);
    console.log(`Copied llms.txt: ${path.relative(repoRoot, llmsTxtDest)}`);
  }
  await prerenderHtmlRoutes(renderedRoutePaths);
  const docsViewerWrite = runDocsViewer({
    repoRoot,
    outDir: outputDir,
    write: true,
    sourceContext: docsSourceContext,
  });
  if (docsViewerWrite.failures.length) {
    throw new Error(`Docs viewer build failed:\n${docsViewerWrite.failures.join("\n")}`);
  }
  const spanishViewerWrite = runDocsViewer({
    repoRoot,
    outDir: outputDir,
    write: true,
    manifest: SPANISH_DOCS_VIEWER_MANIFEST,
    sourceContext: docsSourceContext,
  });
  if (
    spanishViewerWrite.failures.length ||
    spanishViewerWrite.published.length !== SPANISH_DOCS_VIEWER_MANIFEST.length
  ) {
    throw new Error(`Spanish docs viewer build failed: ${spanishViewerWrite.failures.join("; ")}`);
  }
  console.log(
    `Built ${docsViewerWrite.published.length} English and ${spanishViewerWrite.published.length} Spanish docs viewer pages`
  );
  finalizeBundledAssetPathsInAllHtml();

  console.log(`Built site page: ${path.relative(repoRoot, outputFile)}`);
  console.log(
    `Built ${routeCount} route pages (${renderedRoutePaths.length - 1} pre-rendered, ${retiredRoutePaths.length} redirect stubs)`
  );
  console.log(`Built 404.html (pre-rendered fallback)`);
  console.log(`Copied assets: ${path.relative(repoRoot, outputAssetsDir)}`);
  console.log(`Built robots: ${path.relative(repoRoot, robotsFile)}`);
  console.log(`Built sitemap: ${path.relative(repoRoot, sitemapFile)}`);
}

void main();
