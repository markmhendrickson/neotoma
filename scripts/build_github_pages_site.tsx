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
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_LOCALE,
  NON_DEFAULT_LOCALES,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "../frontend/src/i18n/config";
import { localizePath } from "../frontend/src/i18n/routing";
import {
  buildRobotsTxt,
  buildSitemapXml,
  INDEXABLE_SITE_PAGE_PATHS,
  injectRouteMetaIntoHtml,
  SITEMAP_PATHS,
} from "../frontend/src/site/seo_metadata";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
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
  process.env.GITHUB_SHA?.slice(0, 7) ||
  process.env.BUILD_ID ||
  `local-${Date.now()}`;

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

function startStaticServer(rootDir: string): Promise<{ origin: string; close: () => Promise<void> }> {
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

      let filePath = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
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
        close: () => new Promise<void>((done, fail) => server.close((err) => (err ? fail(err) : done()))),
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

  try {
    for (const routePath of routePaths) {
      const targetUrl = `${server.origin}${routePath}`;
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      const renderedHtml = normalizeBundledAssetPaths(await page.content());
      fs.writeFileSync(getOutputPathForRoute(routePath), `<!DOCTYPE html>\n${renderedHtml}\n`, "utf-8");
    }

    await page.goto(`${server.origin}/404`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(250);
    const notFoundHtml = normalizeBundledAssetPaths(await page.content());
    fs.writeFileSync(notFoundFile, `<!DOCTYPE html>\n${notFoundHtml}\n`, "utf-8");
  } finally {
    await page.close();
    await browser.close();
    await server.close();
  }
}


async function main() {
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

  const rootHtml = readPublicHtml();

  // Seed static route files with route-specific metadata.
  fs.writeFileSync(outputFile, buildHtmlForRoute(rootHtml, "/"), "utf-8");

  // Pre-render per-route HTML so bots see correct meta tags without executing JS
  for (const locale of SUPPORTED_LOCALES) {
    const localizedRoot = localizePath("/", locale);
    if (!SITEMAP_PATHS.includes(localizedRoot)) {
      throw new Error(`SITEMAP_PATHS missing localized root route: ${localizedRoot}`);
    }
  }

  const allStaticRoutePaths = [...new Set([...SITEMAP_PATHS, ...markdownMirrorStaticPaths()])];

  let routeCount = 0;
  for (const routePath of allStaticRoutePaths) {
    if (routePath === "/") continue;
    const slug = routePath.replace(/^\//, "");
    const routeDir = path.join(outputDir, slug);
    fs.mkdirSync(routeDir, { recursive: true });
    fs.writeFileSync(
      path.join(routeDir, "index.html"),
      buildHtmlForRoute(rootHtml, routePath),
      "utf-8",
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
  fs.writeFileSync(robotsFile, buildRobotsTxt(), "utf-8");
  fs.writeFileSync(sitemapFile, buildSitemapXml(), "utf-8");
  if (fs.existsSync(llmsTxtSrc)) {
    fs.copyFileSync(llmsTxtSrc, llmsTxtDest);
    console.log(`Copied llms.txt: ${path.relative(repoRoot, llmsTxtDest)}`);
  }
  await prerenderHtmlRoutes(allStaticRoutePaths);
  finalizeBundledAssetPathsInAllHtml();

  console.log(`Built site page: ${path.relative(repoRoot, outputFile)}`);
  console.log(`Built ${routeCount} route pages (fully pre-rendered HTML)`);
  console.log(`Built 404.html (pre-rendered fallback)`);
  console.log(`Copied assets: ${path.relative(repoRoot, outputAssetsDir)}`);
  console.log(`Built robots: ${path.relative(repoRoot, robotsFile)}`);
  console.log(`Built sitemap: ${path.relative(repoRoot, sitemapFile)}`);
}

void main();
