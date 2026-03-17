#!/usr/bin/env tsx
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FAVICON_SVG } from "../frontend/src/site/site_data";
import { SUPPORTED_LOCALES } from "../frontend/src/i18n/config";
import { localizePath } from "../frontend/src/i18n/routing";
import {
  buildRobotsTxt,
  buildSitemapXml,
  injectRouteMetaIntoHtml,
  SITEMAP_PATHS,
} from "../frontend/src/site/seo_metadata";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputDir = path.join(repoRoot, "site_pages");
const outputFile = path.join(outputDir, "index.html");
const noJekyllFile = path.join(outputDir, ".nojekyll");
const faviconFile = path.join(outputDir, "favicon.svg");
const heroImageSrc = path.join(repoRoot, "frontend", "public", "neotoma-hero.png");
const heroImageDest = path.join(outputDir, "neotoma-hero.png");
const ogImageSrc = path.join(repoRoot, "frontend", "public", "neotoma-og-1200x630.png");
const ogImageDest = path.join(outputDir, "neotoma-og-1200x630.png");
const robotsFile = path.join(outputDir, "robots.txt");
const sitemapFile = path.join(outputDir, "sitemap.xml");
const notFoundFile = path.join(outputDir, "404.html");
const publicIndex = path.join(repoRoot, "public", "index.html");
const publicAssetsDir = path.join(repoRoot, "public", "assets");

const buildId =
  process.env.GITHUB_SHA?.slice(0, 7) ||
  process.env.BUILD_ID ||
  `local-${Date.now()}`;

/** Read Vite build output and convert to relative asset paths for the root. */
function readPublicHtml(): string {
  if (!fs.existsSync(publicIndex)) {
    throw new Error("Missing public/index.html (run 'npm run build:ui' first).");
  }
  const html = fs.readFileSync(publicIndex, "utf-8");
  let out = html
    .replaceAll('src="/assets/', 'src="assets/')
    .replaceAll('href="/assets/', 'href="assets/');
  const buildComment = `\n    <!-- build: ${buildId} -->`;
  if (out.includes("</head>")) {
    out = out.replace("</head>", `${buildComment}\n  </head>`);
  }
  return out;
}

/**
 * Build HTML for a specific route. Subpages live in site_pages/{slug}/index.html
 * so asset paths must go up one directory level (../assets/).
 */
function buildHtmlForRoute(rootHtml: string, routePath: string): string {
  let html = injectRouteMetaIntoHtml(rootHtml, routePath);
  if (routePath !== "/") {
    const depth = routePath.replace(/^\//, "").split("/").filter(Boolean).length;
    const relativePrefix = "../".repeat(depth);
    html = html
      .replaceAll('src="assets/', `src="${relativePrefix}assets/`)
      .replaceAll('href="assets/', `href="${relativePrefix}assets/`);
  }
  return html;
}

function getOutputPathForRoute(routePath: string): string {
  if (routePath === "/") return outputFile;
  return path.join(outputDir, routePath.replace(/^\//, ""), "index.html");
}

function getContentType(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
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

  try {
    for (const routePath of routePaths) {
      const targetUrl = `${server.origin}${routePath}`;
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(250);
      const renderedHtml = await page.content();
      fs.writeFileSync(getOutputPathForRoute(routePath), `<!DOCTYPE html>\n${renderedHtml}\n`, "utf-8");
    }

    await page.goto(`${server.origin}/404`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(250);
    const notFoundHtml = await page.content();
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

  let routeCount = 0;
  for (const routePath of SITEMAP_PATHS) {
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
  fs.writeFileSync(faviconFile, FAVICON_SVG.trim(), "utf-8");
  if (fs.existsSync(heroImageSrc)) {
    fs.copyFileSync(heroImageSrc, heroImageDest);
    console.log(`Copied hero image: ${path.relative(repoRoot, heroImageDest)}`);
  }
  if (fs.existsSync(ogImageSrc)) {
    fs.copyFileSync(ogImageSrc, ogImageDest);
    console.log(`Copied OG image: ${path.relative(repoRoot, ogImageDest)}`);
  }
  fs.writeFileSync(robotsFile, buildRobotsTxt(), "utf-8");
  fs.writeFileSync(sitemapFile, buildSitemapXml(), "utf-8");
  await prerenderHtmlRoutes(SITEMAP_PATHS);

  console.log(`Built site page: ${path.relative(repoRoot, outputFile)}`);
  console.log(`Built ${routeCount} route pages (fully pre-rendered HTML)`);
  console.log(`Built 404.html (pre-rendered fallback)`);
  console.log(`Copied assets: ${path.relative(repoRoot, outputAssetsDir)}`);
  console.log(`Built favicon: ${path.relative(repoRoot, faviconFile)}`);
  console.log(`Built robots: ${path.relative(repoRoot, robotsFile)}`);
  console.log(`Built sitemap: ${path.relative(repoRoot, sitemapFile)}`);
}

void main();
