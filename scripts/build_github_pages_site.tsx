#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SitePageStatic } from "../frontend/src/components/SitePage";
import { FAVICON_SVG } from "../frontend/src/site/site_data";
import {
  SEO_DEFAULTS,
  buildRobotsTxt,
  buildSitemapXml,
  resolveSeoMetadata,
} from "../frontend/src/site/seo_metadata";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputDir = path.join(repoRoot, "site_pages");
const outputFile = path.join(outputDir, "index.html");
const noJekyllFile = path.join(outputDir, ".nojekyll");
const faviconFile = path.join(outputDir, "favicon.svg");
const heroImageSrc = path.join(repoRoot, "frontend", "public", "neotoma-hero.png");
const heroImageDest = path.join(outputDir, "neotoma-hero.png");
const robotsFile = path.join(outputDir, "robots.txt");
const sitemapFile = path.join(outputDir, "sitemap.xml");

function buildHtml() {
  const content = renderToStaticMarkup(<SitePageStatic />);
  const metadata = resolveSeoMetadata("/");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${metadata.title}</title>
    <meta name="description" content="${metadata.description}" />
    <meta name="author" content="${SEO_DEFAULTS.author}" />
    <meta name="robots" content="${metadata.robots}" />
    <link rel="canonical" href="${metadata.canonicalUrl}" />
    <meta property="og:type" content="${metadata.ogType}" />
    <meta property="og:site_name" content="${SEO_DEFAULTS.siteName}" />
    <meta property="og:locale" content="${SEO_DEFAULTS.locale}" />
    <meta property="og:url" content="${metadata.canonicalUrl}" />
    <meta property="og:title" content="${metadata.title}" />
    <meta property="og:description" content="${metadata.description}" />
    <meta property="og:image" content="${metadata.ogImageUrl}" />
    <meta property="og:image:width" content="${SEO_DEFAULTS.ogImageWidth}" />
    <meta property="og:image:height" content="${SEO_DEFAULTS.ogImageHeight}" />
    <meta name="twitter:card" content="${SEO_DEFAULTS.twitterCard}" />
    <meta name="twitter:site" content="${SEO_DEFAULTS.twitterSite}" />
    <meta name="twitter:title" content="${metadata.title}" />
    <meta name="twitter:description" content="${metadata.description}" />
    <meta name="twitter:image" content="${metadata.ogImageUrl}" />
    <meta name="twitter:image:width" content="${SEO_DEFAULTS.ogImageWidth}" />
    <meta name="twitter:image:height" content="${SEO_DEFAULTS.ogImageHeight}" />
    <script type="application/ld+json">${JSON.stringify(metadata.jsonLd)}</script>
    <link rel="icon" href="favicon.svg" type="image/svg+xml" />
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      body { margin: 0; }
      .post-prose a { color: #000; border-bottom: 1px solid #000; text-decoration: none; }
      .post-prose a:hover { border-bottom-color: transparent; }
      .post-prose code { background: #f3f4f6; padding: 0.125rem 0.25rem; border-radius: 0.25rem; }
    </style>
  </head>
  <body>
    ${content}
  </body>
</html>`;
}

function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputFile, buildHtml(), "utf-8");
  fs.writeFileSync(noJekyllFile, "", "utf-8");
  fs.writeFileSync(faviconFile, FAVICON_SVG.trim(), "utf-8");
  if (fs.existsSync(heroImageSrc)) {
    fs.copyFileSync(heroImageSrc, heroImageDest);
    console.log(`Copied hero image: ${path.relative(repoRoot, heroImageDest)}`);
  }
  fs.writeFileSync(robotsFile, buildRobotsTxt(), "utf-8");
  fs.writeFileSync(sitemapFile, buildSitemapXml(), "utf-8");

  console.log(`Built site page: ${path.relative(repoRoot, outputFile)}`);
  console.log(`Built favicon: ${path.relative(repoRoot, faviconFile)}`);
  console.log(`Built robots: ${path.relative(repoRoot, robotsFile)}`);
  console.log(`Built sitemap: ${path.relative(repoRoot, sitemapFile)}`);
}

main();
