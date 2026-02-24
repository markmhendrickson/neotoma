#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SitePageStatic } from "../frontend/src/components/SitePage";
import { FAVICON_SVG, SITE_METADATA } from "../frontend/src/site/site_data";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputDir = path.join(repoRoot, "site_pages");
const outputFile = path.join(outputDir, "index.html");
const noJekyllFile = path.join(outputDir, ".nojekyll");
const faviconFile = path.join(outputDir, "favicon.svg");

function buildHtml() {
  const content = renderToStaticMarkup(<SitePageStatic />);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: SITE_METADATA.pageTitle,
    description: SITE_METADATA.pageDescription,
    url: SITE_METADATA.canonicalUrl,
    publisher: { "@type": "Organization", name: "Neotoma" },
  };

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${SITE_METADATA.pageTitle}</title>
    <meta name="description" content="${SITE_METADATA.pageDescription}" />
    <link rel="canonical" href="${SITE_METADATA.canonicalUrl}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${SITE_METADATA.canonicalUrl}" />
    <meta property="og:title" content="${SITE_METADATA.pageTitle}" />
    <meta property="og:description" content="${SITE_METADATA.pageDescription}" />
    <meta property="og:image" content="${SITE_METADATA.ogImageUrl}" />
    <meta property="og:locale" content="en" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${SITE_METADATA.pageTitle}" />
    <meta name="twitter:description" content="${SITE_METADATA.pageDescription}" />
    <meta name="twitter:image" content="${SITE_METADATA.ogImageUrl}" />
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
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

  console.log(`Built site page: ${path.relative(repoRoot, outputFile)}`);
  console.log(`Built favicon: ${path.relative(repoRoot, faviconFile)}`);
}

main();
