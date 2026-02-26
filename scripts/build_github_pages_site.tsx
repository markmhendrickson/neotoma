#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FAVICON_SVG } from "../frontend/src/site/site_data";
import {
  buildRobotsTxt,
  buildSitemapXml,
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
const publicIndex = path.join(repoRoot, "public", "index.html");
const publicAssetsDir = path.join(repoRoot, "public", "assets");

function buildHtmlFromPublic(): string {
  if (!fs.existsSync(publicIndex)) {
    throw new Error("Missing public/index.html (run 'npm run build:ui' first).");
  }

  const html = fs.readFileSync(publicIndex, "utf-8");
  // Use relative asset paths so the site works on both custom domain root and /repo subpath.
  let out = html
    .replaceAll('src="/assets/', 'src="assets/')
    .replaceAll('href="/assets/', 'href="assets/');
  // Inject build id for debugging (View Source in prod to confirm which build is live)
  const buildId =
    process.env.GITHUB_SHA?.slice(0, 7) ||
    process.env.BUILD_ID ||
    `local-${Date.now()}`;
  const buildComment = `\n    <!-- build: ${buildId} -->`;
  if (out.includes("</head>")) {
    out = out.replace("</head>", `${buildComment}\n  </head>`);
  }
  return out;
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

  fs.writeFileSync(outputFile, buildHtmlFromPublic(), "utf-8");
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
  console.log(`Copied assets: ${path.relative(repoRoot, outputAssetsDir)}`);
  console.log(`Built favicon: ${path.relative(repoRoot, faviconFile)}`);
  console.log(`Built robots: ${path.relative(repoRoot, robotsFile)}`);
  console.log(`Built sitemap: ${path.relative(repoRoot, sitemapFile)}`);
}

main();
