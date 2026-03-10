#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FAVICON_SVG } from "../frontend/src/site/site_data";
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

function main() {
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

  // Homepage gets root-level meta tags (already correct from the template)
  fs.writeFileSync(outputFile, injectRouteMetaIntoHtml(rootHtml, "/"), "utf-8");

  // Pre-render per-route HTML so bots see correct meta tags without executing JS
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

  // GitHub Pages serves 404.html for unknown paths — acts as SPA fallback.
  // Uses homepage meta (React Helmet will override client-side).
  fs.writeFileSync(notFoundFile, rootHtml, "utf-8");

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

  console.log(`Built site page: ${path.relative(repoRoot, outputFile)}`);
  console.log(`Built ${routeCount} route pages (pre-rendered meta tags)`);
  console.log(`Built 404.html (SPA fallback)`);
  console.log(`Copied assets: ${path.relative(repoRoot, outputAssetsDir)}`);
  console.log(`Built favicon: ${path.relative(repoRoot, faviconFile)}`);
  console.log(`Built robots: ${path.relative(repoRoot, robotsFile)}`);
  console.log(`Built sitemap: ${path.relative(repoRoot, sitemapFile)}`);
}

main();
